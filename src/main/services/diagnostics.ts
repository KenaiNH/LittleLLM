import { app, dialog, shell } from 'electron';
import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigStore } from './configStore';
import type { SecretStore } from './secretStore';
import type { PersonaManager } from './personaManager';
import type { SpriteManager } from './spriteManager';
import type { NativeRuntime } from './nativeRuntime';
import type { DiagnosticAction } from '../../shared/diagnostics';
import { getSettingsWindow } from '../windows/settingsWindow';
import { defaults } from '../../shared/config';
import { recoverConfig } from './configRecovery';
export class DiagnosticError extends Error {}
export class Diagnostics {
  constructor(
    private config: ConfigStore,
    private secrets: SecretStore,
    private personas: PersonaManager,
    private sprites: SpriteManager,
    private native: NativeRuntime,
  ) {}
  async action(request: DiagnosticAction) {
    const owner = getSettingsWindow();
    if (!owner) throw new DiagnosticError('Settings is closed.');
    const directory = app.getPath('userData');
    const confirm = async (message: string, detail: string) =>
      (
        await dialog.showMessageBox(owner, {
          type: 'warning',
          message,
          detail,
          buttons: ['Cancel', 'Continue'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
      ).response === 1;
    const backup = () =>
      copyFileSync(
        join(directory, 'config.json'),
        join(directory, `config.backup.${new Date().toISOString().replace(/:/g, '-')}.json`),
      );
    switch (request.action) {
      case 'open-logs':
      case 'open-config': {
        const error = await shell.openPath(
          request.action === 'open-logs' ? this.native.logger.directory : directory,
        );
        if (error) throw new Error('The folder could not be opened.');
        break;
      }
      case 'export-settings': {
        if (
          !(await confirm(
            'Export settings includes personal context and your name.',
            'API keys and session-only developer settings are excluded. Sprite files are exported separately as Sprite Packs.',
          ))
        )
          break;
        const file = await dialog.showSaveDialog(owner, {
          title: 'Export Settings',
          defaultPath: 'LittleLLM.settings.json',
          filters: [{ name: 'Settings JSON', extensions: ['json'] }],
        });
        if (!file.canceled && file.filePath)
          writeFileSync(file.filePath, JSON.stringify(this.config.get(), null, 2), { mode: 0o600 });
        break;
      }
      case 'import-settings': {
        const file = await dialog.showOpenDialog(owner, {
          title: 'Import Settings',
          properties: ['openFile'],
          filters: [{ name: 'Settings JSON', extensions: ['json'] }],
        });
        const path = file.filePaths[0];
        if (file.canceled || !path) break;
        if (statSync(path).size > 2 * 1024 * 1024)
          throw new DiagnosticError('Settings files must be at most 2 MB.');
        const recovered = recoverConfig(JSON.parse(readFileSync(path, 'utf8')));
        if (recovered.recovered.length)
          throw new DiagnosticError(`Invalid settings sections: ${recovered.recovered.join(', ')}`);
        const cfg = recovered.config;
        await this.sprites.validate(cfg.sprite, cfg.advanced.spriteCacheMb);
        const voice = cfg.persona.library.some((card) => card.voiceOverride);
        const answer = await dialog.showMessageBox(owner, {
          type: 'question',
          title: 'Import Settings preview',
          message: 'Replace current settings?',
          detail: `Model: ${cfg.llm.provider} / ${cfg.llm.model}\nSpeech: ${cfg.tts.provider}\nPersonas: ${cfg.persona.library.length}\nThis includes personal context and your name. Saved API keys are unchanged. The current settings are backed up before applying.`,
          buttons: ['Cancel', 'Import'],
          cancelId: 0,
          defaultId: 0,
          noLink: true,
          ...(voice
            ? { checkboxLabel: 'Include persona preferred voices', checkboxChecked: false }
            : {}),
        });
        if (answer.response !== 1) break;
        if (!answer.checkboxChecked)
          cfg.persona.library = cfg.persona.library.map((card) => ({
            ...card,
            voiceOverride: undefined,
          }));
        await this.personas.replaceConfig(cfg, backup);
        this.native.logger.write('info', 'settings.imported');
        break;
      }
      case 'reset-all': {
        if (request.confirmation !== 'RESET') throw new Error('Type RESET to confirm.');
        if (
          !(await confirm(
            'Reset all settings?',
            'A settings backup is kept. API keys are managed separately by Clear Stored API Keys.',
          ))
        )
          break;
        await this.sprites.resetAll(false);
        await this.personas.replaceConfig(defaults(), backup);
        this.native.logger.write('info', 'settings.reset');
        break;
      }
      case 'clear-keys':
        if (
          await confirm(
            'Clear Stored API Keys?',
            'All Model, Voice and dormant Voice Input keys will be removed.',
          )
        )
          this.secrets.clearAll();
        break;
      case 'clear-audio-cache':
        this.native.clearAudioCache();
        break;
      case 'devtools-pet':
        this.native.devtools('pet');
        break;
      case 'devtools-settings':
        this.native.devtools('settings');
        break;
    }
    this.native.broadcastConfig();
    this.native.publish();
    return this.config.get();
  }
}
