import { randomUUID } from 'node:crypto';
import { dialog } from 'electron';
import type { ConfigStore } from './configStore';
import { personaCardSchema, personaSchema, type Config } from '../../shared/config';
import type { PersonaAction } from '../../shared/persona';
import { applyPersonaFields } from '../../shared/personaFields';
import { PROMPT_PRESETS } from '../../shared/promptPresets';
import { currentPersonaContext, previewSystemPrompt, type PersonaContext } from '../llm/persona';
import { getSettingsWindow } from '../windows/settingsWindow';
type Runtime = { hasConversation(): boolean; clearConversation(): void; context(): PersonaContext };
export class PersonaManager {
  private runtime: Runtime | undefined;
  private queue = Promise.resolve();
  private note: string | null = null;
  constructor(private config: ConfigStore) {}
  bind(runtime: Runtime) {
    this.runtime = runtime;
  }
  preview() {
    const cfg = this.config.get();
    const customConflict =
      cfg.persona.enabled &&
      cfg.llm.promptPreset === 'custom' &&
      /do not describe your own appearance or actions/i.test(cfg.llm.systemPrompt);
    return {
      ...previewSystemPrompt(this.config.get(), this.runtime?.context() ?? currentPersonaContext()),
      promptNotice: customConflict
        ? 'Your Custom prompt tells the assistant not to describe itself. Fix it for me removes that sentence; your text stays unchanged until you choose it.'
        : this.note,
    };
  }
  private transaction<T>(run: () => Promise<T>): Promise<T> {
    const value = this.queue.then(run);
    this.queue = value.then(
      () => undefined,
      () => undefined,
    );
    return value;
  }
  async approveSwitch() {
    if (!this.runtime?.hasConversation()) return { approved: true, clear: false };
    const policy = this.config.get().persona.onSwitch;
    if (policy !== 'ask') return { approved: true, clear: policy === 'new-conversation' };
    const owner = getSettingsWindow(),
      options: Electron.MessageBoxOptions = {
        type: 'question',
        title: 'Switch persona',
        message: 'Start a new conversation for this persona?',
        detail:
          'Keeping the conversation also keeps replies written in the previous character’s voice.',
        buttons: ['Start a new conversation', 'Keep the conversation', 'Cancel'],
        cancelId: 2,
        defaultId: 0,
        noLink: true,
      };
    const result = owner
      ? await dialog.showMessageBox(owner, options)
      : await dialog.showMessageBox(options);
    return { approved: result.response !== 2, clear: result.response === 0 };
  }
  finishSwitch(clear: boolean) {
    if (clear) this.runtime?.clearConversation();
  }
  private commit(next: Config['persona'], sprite?: Config['sprite']) {
    const cfg = this.config.get();
    if (next.enabled && cfg.llm.promptPreset === 'helpful-companion') {
      this.note =
        'Your system prompt told the assistant not to describe itself. Switched to the persona-friendly preset.';
      return this.config.setSections({
        persona: next,
        ...(sprite ? { sprite } : {}),
        llm: {
          ...cfg.llm,
          promptPreset: 'persona-driven',
          systemPrompt: PROMPT_PRESETS['persona-driven'],
        },
      });
    }
    if (
      next.enabled &&
      cfg.llm.promptPreset === 'custom' &&
      /do not describe your own appearance or actions/i.test(cfg.llm.systemPrompt)
    )
      this.note =
        'Your Custom prompt tells the assistant not to describe itself. Fix it for me removes that sentence; your text stays unchanged until you choose it.';
    else if (!next.enabled) this.note = null;
    return sprite
      ? this.config.setSections({ persona: next, sprite })
      : this.config.set('persona', next);
  }
  replace(value: unknown) {
    return this.transaction(async () => this.apply(personaSchema.parse(value)));
  }
  patch(changes: Record<string, unknown>) {
    return this.transaction(async () =>
      this.apply(personaSchema.parse(applyPersonaFields(this.config.get().persona, changes))),
    );
  }
  private async apply(next: Config['persona']) {
    const old = this.config.get().persona,
      changed = old.activeId !== next.activeId;
    const decision = changed ? await this.approveSwitch() : { approved: true, clear: false };
    if (!decision.approved) return this.config.get();
    const result = this.commit(next);
    this.finishSwitch(decision.clear);
    return result;
  }
  action(action: PersonaAction) {
    return this.transaction(async () => {
      const cfg = this.config.get(),
        next = structuredClone(cfg.persona);
      if (action.type === 'fix-prompt') {
        this.note = null;
        return this.config.set('llm', {
          ...cfg.llm,
          systemPrompt: cfg.llm.systemPrompt
            .replace(/Do not describe your own appearance or actions\.?/gi, '')
            .trimEnd(),
          promptPreset: 'custom',
        });
      }
      if (action.type === 'select') next.activeId = action.id;
      else if (action.type === 'create' || action.type === 'duplicate') {
        if (next.library.length >= 50) throw new Error('The persona library is full (50 cards).');
        const source =
          action.type === 'duplicate'
            ? next.library.find((card) => card.id === action.id)
            : next.library.find((card) => card.id === next.activeId);
        if (action.type === 'duplicate' && !source) throw new Error('Select a persona first.');
        const card = personaCardSchema.parse({
          ...source,
          id: randomUUID(),
          name:
            action.type === 'duplicate'
              ? (source?.name ?? 'Companion').slice(0, 43) + ' copy'
              : (source?.name ?? 'Companion'),
          spritePackId: undefined,
        });
        next.library.push(card);
        next.activeId = card.id;
      } else if (action.type === 'delete') {
        const card = next.library.find((item) => item.id === action.id);
        if (!card) throw new Error('The persona no longer exists.');
        const owner = getSettingsWindow();
        if (!owner) throw new Error('Settings is closed.');
        const answer = await dialog.showMessageBox(owner, {
          type: 'warning',
          message: `Delete “${card.name}”?`,
          buttons: ['Cancel', 'Delete'],
          cancelId: 0,
          defaultId: 0,
          noLink: true,
        });
        if (answer.response !== 1) return cfg;
        next.library = next.library.filter((item) => item.id !== action.id);
        if (next.activeId === action.id) {
          next.activeId = null;
          next.enabled = false;
        }
      } else {
        const index = next.library.findIndex((card) => card.id === action.id),
          card = next.library[index];
        if (!card) throw new Error('The persona no longer exists.');
        next.library[index] = personaCardSchema.parse({ ...card, ...action.changes });
      }
      return this.apply(personaSchema.parse(next));
    });
  }
  importCard(card: Config['persona']['library'][number]) {
    return this.transaction(async () => {
      const next = structuredClone(this.config.get().persona);
      if (next.library.length >= 50) throw new Error('The persona library is full (50 cards).');
      const imported = personaCardSchema.parse({
        ...card,
        id: randomUUID(),
        spritePackId: undefined,
      });
      next.library.push(imported);
      next.activeId = imported.id;
      return this.apply(personaSchema.parse(next));
    });
  }
  importPack(
    sprite: Config['sprite'],
    bundled: Config['persona']['library'][number] | undefined,
    packId: string,
  ) {
    return this.transaction(async () => {
      const next = structuredClone(this.config.get().persona);
      if (!bundled || next.packPersonaPolicy === 'ignore') return this.config.set('sprite', sprite);
      const owner = getSettingsWindow();
      if (!owner) throw new Error('Settings is closed.');
      let activate = true,
        includeVoice = false;
      if (next.packPersonaPolicy === 'ask') {
        const current = next.library.find((card) => card.id === next.activeId);
        const answer = await dialog.showMessageBox(owner, {
          type: 'question',
          title: 'Sprite Pack persona',
          message: `This pack includes a persona named “${bundled.name}”. Apply it?`,
          detail: `Current: ${current?.name ?? 'None'}\n${current?.description ?? ''}\n\nIncoming: ${bundled.name}\n${bundled.description}\n\nSpeech style: ${bundled.speechStyle}\nExamples: ${bundled.exampleDialogue.length}\nPersonal context: ${bundled.userNotes || '(none)'}\nPreferred voice is omitted unless checked.`,
          buttons: ['Apply', "Import but don't activate", 'Skip'],
          defaultId: 1,
          cancelId: 2,
          noLink: true,
          ...(bundled.voiceOverride
            ? {
                checkboxLabel: `Include preferred voice: ${bundled.voiceOverride}`,
                checkboxChecked: false,
              }
            : {}),
        });
        if (answer.response === 2) return this.config.set('sprite', sprite);
        activate = answer.response === 0;
        includeVoice = answer.checkboxChecked;
      } else if (bundled.voiceOverride) {
        const answer = await dialog.showMessageBox(owner, {
          type: 'question',
          title: 'Persona preferred voice',
          message: `Apply the text persona “${bundled.name}”?`,
          detail:
            'The Auto policy applies text only. Include its preferred voice only if you want it.',
          buttons: ['Continue', 'Skip persona'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
          checkboxLabel: `Include preferred voice: ${bundled.voiceOverride}`,
          checkboxChecked: false,
        });
        if (answer.response !== 0) return this.config.set('sprite', sprite);
        includeVoice = answer.checkboxChecked;
      }
      if (next.library.length >= 50) throw new Error('The persona library is full (50 cards).');
      const card = personaCardSchema.parse({
        ...bundled,
        id: randomUUID(),
        spritePackId: packId,
        voiceOverride: includeVoice ? bundled.voiceOverride : undefined,
      });
      const decision = activate ? await this.approveSwitch() : { approved: true, clear: false };
      if (!decision.approved) return this.config.get();
      next.library.push(card);
      if (activate) {
        next.activeId = card.id;
        next.enabled = true;
      }
      const result = this.commit(personaSchema.parse(next), sprite);
      this.finishSwitch(decision.clear);
      return result;
    });
  }
}
