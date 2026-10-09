import { useEffect, useRef, useState } from 'react';
import { personaCardSchema, type Config } from '../../shared/config';
import type { PersonaAction, PersonaPreview } from '../../shared/persona';
import { OPTIONS } from '../../shared/enums';
import { useSettingsStore, flushSettings } from './store';
import { matchesSearch, type Setting } from './definitions';
import { SettingRow } from './SettingRow';
import styles from './Settings.module.css';
import local from './Persona.module.css';
import grip from '../../../assets/figma/2031-7076-grip.svg';
type Card = Config['persona']['library'][number];
let pending = Promise.resolve();
function queueAction(action: PersonaAction) {
  let error: string | null = null;
  pending = pending
    .then(async () => {
      const result = await window.companion.personaAction(action);
      if (result.ok) useSettingsStore.getState().receive(result.value);
      else error = result.error.userMessage;
    })
    .catch(() => {
      error = 'The persona change could not be saved.';
    });
  return pending.then(() => error);
}
const cardRows: { field: keyof Card; definition: Omit<Setting, 'section' | 'key' | 'panel'> }[] = [
  {
    field: 'name',
    definition: { id: 238, group: 'Identity', label: 'Name', kind: 'text', maxLength: 48 },
  },
  {
    field: 'description',
    definition: {
      id: 241,
      group: 'Identity',
      label: 'Who they are',
      kind: 'textarea',
      rows: 8,
      maxLength: 4000,
      placeholder:
        'A small cat-shaped assistant who lives on the desktop. Curious, a little sarcastic, genuinely helpful when it counts.',
    },
  },
  {
    field: 'speechStyle',
    definition: {
      id: 242,
      group: 'Identity',
      label: 'How they speak',
      kind: 'textarea',
      rows: 4,
      maxLength: 1000,
      placeholder: 'Short sentences. Dry humor. Never uses exclamation marks.',
    },
  },
  {
    field: 'userNotes',
    definition: {
      id: 245,
      group: 'Context & Behavior',
      label: 'What they know about you',
      kind: 'textarea',
      rows: 3,
      maxLength: 1000,
    },
  },
  {
    field: 'userName',
    definition: {
      id: 246,
      group: 'Context & Behavior',
      label: 'What to call you',
      kind: 'text',
      maxLength: 64,
      hint: 'Your name — leave blank and they’ll say “there”.',
    },
  },
  {
    field: 'replyLength',
    definition: {
      id: 248,
      group: 'Context & Behavior',
      label: 'Reply length',
      kind: 'select',
      options: OPTIONS.replyLength,
    },
  },
  {
    field: 'characterBreak',
    definition: {
      id: 249,
      group: 'Context & Behavior',
      label: 'Staying in character',
      kind: 'select',
      options: OPTIONS.characterBreak,
    },
  },
  {
    field: 'allowRoleplayActions',
    definition: {
      id: 250,
      group: 'Context & Behavior',
      label: 'Allow actions in asterisks',
      kind: 'toggle',
      hint: 'Lets the assistant write things like *tilts head*. Off by default because it adds length to every reply.',
    },
  },
];
export const PERSONA_SEARCH_LABELS = [
  'Give the assistant a persona',
  'Active persona',
  'Pronouns',
  'Custom pronouns',
  'Example exchanges',
  'Insert a variable',
  'Where the persona goes',
  'Persona adds tokens',
  'Show the assembled prompt',
  'Test this persona',
  'Say something on launch',
  'Greeting text',
  'Greeting instruction',
  'How often',
  'Wait before greeting',
  'Speak the greeting aloud',
  'Preferred voice for this persona',
  'Save as a new persona',
  'Duplicate this persona',
  'Delete this persona',
  'Export persona',
  'Import persona',
  'Personas bundled in Sprite Packs',
  'When I switch personas',
  ...cardRows.map((row) => row.definition.label),
];
export function PersonaPanel({ config, query }: { config: Config; query: string }) {
  const [variableEpoch, setVariableEpoch] = useState<Record<string, number>>({});
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [preview, setPreview] = useState<PersonaPreview | null>(null),
    [expanded, setExpanded] = useState(false),
    [testReply, setTestReply] = useState(''),
    [testing, setTesting] = useState(false),
    [error, setError] = useState<string | null>(null),
    [voices, setVoices] = useState<string[]>([]),
    [customPronouns, setCustomPronouns] = useState(false);
  const configSignature = JSON.stringify([
    config.persona,
    config.llm.systemPrompt,
    config.llm.maxTokens,
    config.llm.tokenBudget,
  ]);
  const card = config.persona.library.find((item) => item.id === config.persona.activeId),
    defaultCard = personaCardSchema.parse({ id: '00000000-0000-4000-8000-000000000000' });
  const selected = card ?? defaultCard;
  const lastField = useRef<{
    field: 'description' | 'speechStyle';
    start: number;
    end: number;
  } | null>(null);
  const invalid = useSettingsStore((state) => state.invalid),
    receive = useSettingsStore((state) => state.receive);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () =>
        void window.companion.previewPersona().then((result) => {
          if (alive && result.ok) setPreview(result.value);
        }),
      120,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [configSignature]);
  useEffect(() => {
    setCustomPronouns(
      Boolean(card?.pronouns && !OPTIONS.pronouns.some(([value]) => value === card.pronouns)),
    );
  }, [card?.id, card?.pronouns]);
  useEffect(() => {
    if (!config.persona.enabled || config.tts.provider === 'none') return;
    let alive = true;
    void window.companion.listVoices().then((result) => {
      if (alive && result.ok) setVoices(result.value.map((voice) => voice.id));
    });
    return () => {
      alive = false;
    };
  }, [config.persona.enabled, config.tts.provider]);
  const matches = (label: string) => matchesSearch(label, query);
  const act = async (action: PersonaAction) => {
    await flushSettings();
    setError(await queueAction(action));
  };
  const patchCard = async (field: keyof Card, value: unknown) => {
    if (!card) return 'Create or select a persona first.';
    const parsed = personaCardSchema.partial().safeParse({ [field]: value });
    if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Enter a valid value.';
    return queueAction({ type: 'patch-card', id: card.id, changes: parsed.data });
  };
  const row = (field: keyof Card, definition: Omit<Setting, 'section' | 'key' | 'panel'>) =>
    matches(definition.label) && (
      <SettingRow
        key={`${selected.id}-${definition.id}-${variableEpoch[field] ?? 0}`}
        config={config}
        definition={{
          ...definition,
          section: 'persona',
          panel: 'Persona',
          key: `card.${selected.id}.${field}`,
          disabled: () => !card,
        }}
        fallbackValue={selected[field]}
        onSave={(value) => patchCard(field, value)}
        models={definition.id === 260 ? voices : undefined}
      />
    );
  const globalRow = (
    key: string,
    definition: Omit<Setting, 'section' | 'key' | 'panel'>,
    disable = !card,
  ) =>
    matches(definition.label) && (
      <SettingRow
        key={definition.id}
        config={config}
        definition={{
          ...definition,
          key,
          section: 'persona',
          panel: 'Persona',
          disabled: () => disable,
        }}
      />
    );
  const section = (title: string, children: React.ReactNode) => (
    <section className={styles.section}>
      <h2>{title}</h2>
      <div className={`${styles.group} ${local.fields}`}>{children}</div>
    </section>
  );
  const insertVariable = async (name: string) => {
    if (!card || !lastField.current) return;
    const field = lastField.current,
      text = String(
        useSettingsStore.getState().drafts[`persona.card.${card.id}.${field.field}`] ??
          card[field.field],
      );
    const result = text.slice(0, field.start) + `{{${name}}}` + text.slice(field.end);
    const error = await patchCard(field.field, result);
    setError(error);
    if (!error) {
      useSettingsStore.getState().draft(`persona.card.${card.id}.${field.field}`, null);
      setVariableEpoch((value) => ({ ...value, [field.field]: (value[field.field] ?? 0) + 1 }));
      setVariablesOpen(false);
    }
  };
  const test = async () => {
    await flushSettings();
    await pending;
    setTesting(true);
    setTestReply('');
    try {
      const result = await window.companion.testPersona();
      if (result.ok) {
        setTestReply(result.value);
        setError(null);
      } else setError(result.error.userMessage);
    } finally {
      setTesting(false);
    }
  };
  const libraryAction = async (kind: 'import' | 'export') => {
    await flushSettings();
    await pending;
    const result =
      kind === 'import'
        ? await window.companion.importPersona()
        : await window.companion.exportPersona(selected.id);
    if (!result.ok) setError(result.error.userMessage);
    else if (kind === 'import' && typeof result.value === 'object') receive(result.value);
  };
  return (
    <div className={local.panel}>
      {section(
        'Enable & Active Persona',
        <>
          {globalRow(
            'enabled',
            {
              id: 236,
              group: '',
              label: 'Give the assistant a persona',
              kind: 'toggle',
              hint: 'Adds a character description to every message. This increases token use on each request.',
            },
            false,
          )}
          {config.persona.enabled && matches('Active persona') && (
            <div className={styles.row} data-control={237}>
              <label className={styles.label} htmlFor="active-persona">
                Active persona
              </label>
              <div className={styles.control}>
                <select
                  id="active-persona"
                  value={config.persona.activeId ?? ''}
                  onChange={(event) => void act({ type: 'select', id: event.target.value || null })}
                >
                  {config.persona.library.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  <option value="">— None —</option>
                </select>
              </div>
            </div>
          )}
        </>,
      )}
      {config.persona.enabled && (
        <>
          {preview?.promptNotice && (
            <p className={styles.warning}>
              {preview.promptNotice}
              {config.llm.promptPreset === 'custom' && (
                <button className={styles.button} onClick={() => void act({ type: 'fix-prompt' })}>
                  Fix it for me
                </button>
              )}
            </p>
          )}
          {!card && <p className={styles.hint}>Create or select a persona first.</p>}
          {section(
            'Identity',
            <div
              onFocusCapture={(event) => {
                const target = event.target;
                if (
                  target instanceof HTMLTextAreaElement &&
                  /\.(description|speechStyle)$/.test(target.id)
                ) {
                  const field = target.id.endsWith('.description') ? 'description' : 'speechStyle';
                  lastField.current = {
                    field,
                    start: target.selectionStart,
                    end: target.selectionEnd,
                  };
                }
              }}
              onSelectCapture={(event) => {
                const target = event.target;
                if (target instanceof HTMLTextAreaElement && lastField.current) {
                  lastField.current.start = target.selectionStart;
                  lastField.current.end = target.selectionEnd;
                }
              }}
            >
              {cardRows
                .filter((item) => item.field === 'name')
                .map((item) => row(item.field, item.definition))}
              {matches('Pronouns') && (
                <div className={styles.row} data-control={239}>
                  <label className={styles.label} htmlFor="persona-pronouns">
                    Pronouns
                  </label>
                  <div className={styles.control}>
                    <select
                      id="persona-pronouns"
                      disabled={!card}
                      value={customPronouns ? 'custom' : selected.pronouns}
                      onChange={(event) => {
                        if (event.target.value === 'custom') setCustomPronouns(true);
                        else {
                          setCustomPronouns(false);
                          void patchCard('pronouns', event.target.value).then(setError);
                        }
                      }}
                    >
                      {OPTIONS.pronouns.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {customPronouns &&
                row('pronouns', {
                  id: 240,
                  group: '',
                  label: 'Custom pronouns',
                  kind: 'text',
                  maxLength: 32,
                })}
              {cardRows
                .filter((item) => ['description', 'speechStyle'].includes(item.field))
                .map((item) => row(item.field, item.definition))}
              {matches('Insert a variable') && (
                <div className={styles.row} data-control={243}>
                  <span className={styles.label}>Insert a variable ▾</span>
                  <div className={`${styles.control} ${local.variableControl}`}>
                    <button
                      className={styles.button}
                      id="insert-persona-variable"
                      disabled={!card}
                      aria-haspopup="menu"
                      aria-expanded={variablesOpen}
                      onClick={() => setVariablesOpen(!variablesOpen)}
                    >
                      Insert a variable ▾
                    </button>
                    {variablesOpen && (
                      <div
                        role="menu"
                        aria-label="Persona variables"
                        className={local.variables}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setVariablesOpen(false);
                        }}
                      >
                        {['persona.name', 'user.name', 'date', 'time', 'weekday', 'app.state'].map(
                          (name) => (
                            <button
                              className={styles.button}
                              role="menuitem"
                              key={name}
                              onClick={() => void insertVariable(name)}
                            >{`{{${name}}}`}</button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>,
          )}
          {matches('Example exchanges') &&
            section(
              'Example Dialogue',
              <ExampleEditor
                key={selected.id}
                card={selected}
                disabled={!card}
                save={(value) => patchCard('exampleDialogue', value)}
              />,
            )}
          {section(
            'Context & Behavior',
            <>
              {cardRows
                .filter((item) => ['userNotes', 'userName'].includes(item.field))
                .map((item) => row(item.field, item.definition))}
              {globalRow('injection', {
                id: 247,
                group: '',
                label: 'Where the persona goes',
                kind: 'select',
                options: OPTIONS.injection,
                hint:
                  config.persona.injection === 'replace'
                    ? 'Your system prompt will not be sent at all.'
                    : undefined,
              })}
              {cardRows
                .filter((item) =>
                  ['replyLength', 'characterBreak', 'allowRoleplayActions'].includes(item.field),
                )
                .map((item) => row(item.field, item.definition))}
            </>,
          )}
          {section(
            'Assembled Prompt Preview',
            <>
              <div className={styles.row} data-control={251}>
                <span
                  className={
                    preview?.tooLong
                      ? styles.error
                      : preview?.warning
                        ? styles.warning
                        : styles.hint
                  }
                >
                  {preview?.tooLong ? 'Too long: ' : preview?.warning ? 'Warning: ' : ''}Persona
                  adds ~{preview?.personaTokens ?? 0} tokens to every message. Approximate; actual
                  usage depends on the model.
                </span>
              </div>
              {preview?.unknownVariables.length ? (
                <p className={styles.warning}>
                  Unrecognized variables: {preview.unknownVariables.join(', ')}
                </p>
              ) : null}
              {preview && preview.historyBudget <= 0 && (
                <p className={styles.warning}>
                  The prompt, examples and response allowance use the entire token budget. No
                  conversation history fits.
                </p>
              )}
              <div className={styles.row}>
                <button
                  data-control={252}
                  className={styles.button}
                  disabled={!card}
                  aria-expanded={expanded}
                  onClick={() => setExpanded(!expanded)}
                >
                  Show the assembled prompt
                </button>
                <button
                  data-control={253}
                  className={styles.button}
                  disabled={
                    !card ||
                    testing ||
                    preview?.tooLong ||
                    Object.keys(invalid).some((key) => key.startsWith('persona.'))
                  }
                  onClick={() => void test()}
                >
                  Test this persona
                </button>
              </div>
              {expanded && preview && (
                <>
                  <p className={preview.tooLong ? styles.error : styles.hint}>
                    {preview.tooLong
                      ? 'This is too long to send. Shorten the description or remove some examples.'
                      : 'Final system prompt and example turns'}
                  </p>
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label="Assembled prompt"
                    className={local.preview}
                  >
                    {preview.text}
                    {preview.examples.length
                      ? '\n\n# Example messages\n' +
                        preview.examples
                          .map((message) => `${message.role}: ${message.content}`)
                          .join('\n')
                      : ''}
                  </pre>
                </>
              )}
              {testReply && (
                <pre className={local.preview} aria-label="Persona test reply">
                  {testReply}
                </pre>
              )}
            </>,
          )}
          {section(
            'Greeting',
            <>
              {globalRow('greeting.mode', {
                id: 254,
                group: '',
                label: 'Say something on launch',
                kind: 'select',
                options: OPTIONS.greetingMode,
                hint:
                  config.persona.greeting.mode === 'static'
                    ? 'Free and instant — no request is sent.'
                    : config.persona.greeting.mode === 'generated'
                      ? 'Sends one request each time it fires.'
                      : undefined,
              })}
              {config.persona.greeting.mode === 'static' &&
                globalRow('greeting.text', {
                  id: 255,
                  group: '',
                  label: 'Greeting text',
                  kind: 'textarea',
                  rows: 2,
                  maxLength: 500,
                })}
              {config.persona.greeting.mode === 'generated' &&
                globalRow('greeting.prompt', {
                  id: 256,
                  group: '',
                  label: 'Greeting instruction',
                  kind: 'text',
                  maxLength: 500,
                })}
              {config.persona.greeting.mode !== 'off' && (
                <>
                  {globalRow('greeting.frequency', {
                    id: 257,
                    group: '',
                    label: 'How often',
                    kind: 'select',
                    options: OPTIONS.greetingFrequency,
                  })}
                  {globalRow('greeting.delayMs', {
                    id: 258,
                    group: '',
                    label: 'Wait before greeting',
                    kind: 'range',
                    min: 0,
                    max: 30,
                    step: 0.5,
                    multiplier: 1000,
                    suffix: 's',
                  })}
                  {config.tts.provider !== 'none' &&
                    globalRow('greeting.speak', {
                      id: 259,
                      group: '',
                      label: 'Speak the greeting aloud',
                      kind: 'toggle',
                    })}
                </>
              )}
            </>,
          )}
          {section(
            'Persona Library',
            <>
              {config.tts.provider !== 'none' &&
                row('voiceOverride', {
                  id: 260,
                  group: '',
                  label: 'Preferred voice for this persona',
                  kind: 'model',
                  maxLength: 200,
                  hint: 'Leave empty to use your default voice. Selecting a voice applies it only to this persona.',
                })}
              <div className={styles.row}>
                {[
                  ['create', 'Save as a new persona', 261],
                  ['duplicate', 'Duplicate this persona', 262],
                  ['delete', 'Delete this persona', 263],
                ].map(([type, label, id]) => (
                  <button
                    key={String(id)}
                    data-control={id}
                    className={
                      type === 'delete' ? `${styles.button} ${styles.destructive}` : styles.button
                    }
                    disabled={
                      type === 'create'
                        ? config.persona.library.length >= 50
                        : !card || (type === 'delete' && config.persona.library.length === 1)
                    }
                    title={
                      config.persona.library.length >= 50
                        ? 'The library is full (50 cards).'
                        : undefined
                    }
                    onClick={() =>
                      void act(
                        type === 'create'
                          ? { type: 'create' }
                          : { type: type as 'duplicate' | 'delete', id: selected.id },
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.row}>
                <button
                  data-control={264}
                  className={styles.button}
                  disabled={!card}
                  onClick={() => void libraryAction('export')}
                >
                  Export persona…
                </button>
                <button
                  data-control={265}
                  className={styles.button}
                  disabled={config.persona.library.length >= 50}
                  onClick={() => void libraryAction('import')}
                >
                  Import persona…
                </button>
              </div>
              {globalRow(
                'packPersonaPolicy',
                {
                  id: 266,
                  group: '',
                  label: 'Personas bundled in Sprite Packs',
                  kind: 'select',
                  options: OPTIONS.packPersonaPolicy,
                },
                false,
              )}
              {globalRow(
                'onSwitch',
                {
                  id: 267,
                  group: '',
                  label: 'When I switch personas',
                  kind: 'select',
                  options: OPTIONS.onSwitch,
                },
                false,
              )}
            </>,
          )}
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
function ExampleEditor({
  card,
  disabled,
  save,
}: {
  card: Card;
  disabled: boolean;
  save: (rows: Card['exampleDialogue']) => Promise<string | null>;
}) {
  const [rows, setRows] = useState(card.exampleDialogue),
    [error, setError] = useState<string | null>(null),
    dragging = useRef<number | null>(null);
  const commit = (next: Card['exampleDialogue']) => {
    setRows(next);
    void save(next).then(setError);
  };
  const move = (index: number, next: number) => {
    const reordered = [...rows],
      item = reordered.splice(index, 1)[0];
    if (item) {
      reordered.splice(next, 0, item);
      commit(reordered);
    }
  };
  return (
    <div className={local.examples} data-control={244}>
      {rows.map((row, index) => (
        <div
          className={local.exchange}
          key={index}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (dragging.current !== null) move(dragging.current, index);
            dragging.current = null;
          }}
        >
          <button
            className={local.grip}
            aria-label={`Drag exchange ${index + 1}`}
            disabled={disabled}
            draggable={!disabled}
            onDragStart={() => {
              dragging.current = index;
            }}
          >
            <img src={grip} alt="" />
          </button>
          {(['user', 'assistant'] as const).map((field) => (
            <label key={field}>
              {field === 'user' ? 'You said' : 'They replied'}
              <input
                disabled={disabled}
                maxLength={500}
                value={row[field]}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, [field]: event.target.value };
                  setRows(next);
                }}
                onBlur={() => commit(rows)}
              />
            </label>
          ))}
          <button
            disabled={disabled}
            aria-label={`Delete exchange ${index + 1}`}
            onClick={() => commit(rows.filter((_, at) => at !== index))}
          >
            ×
          </button>
          <div className={local.moves}>
            <button disabled={disabled || index === 0} onClick={() => move(index, index - 1)}>
              Move up
            </button>
            <button
              disabled={disabled || index === rows.length - 1}
              onClick={() => move(index, index + 1)}
            >
              Move down
            </button>
          </div>
        </div>
      ))}
      <button
        className={styles.button}
        disabled={disabled || rows.length >= 8}
        onClick={() => commit([...rows, { user: '', assistant: '' }])}
      >
        + Add an exchange
      </button>
      <p className={styles.hint}>
        These are sent as real example messages before your conversation. Two or three good examples
        shape the voice more than a long description does.
      </p>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
