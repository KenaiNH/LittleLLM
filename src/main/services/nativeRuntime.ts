import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  globalShortcut,
  powerMonitor,
  screen,
} from 'electron';
import { fileURLToPath } from 'node:url';
import { existsSync, lstatSync, readdirSync, unlinkSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { ConfigStore } from './configStore';
import type { InputWindow } from '../windows/inputWindow';
import type { PersonaManager } from './personaManager';
import type { Logger } from './logger';
import { sessionStateSchema } from '../../shared/config';
import type { RuntimeStatus, SessionPatch } from '../../shared/diagnostics';
import { CHANNELS } from '../ipc/channels';
import { fullscreenState } from '../platform/win32/fullscreen';

export class NativeRuntime {
  private input: InputWindow | null = null;
  private pet: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private warnings: string[] = [];
  private session = sessionStateSchema.parse({});
  private battery = false;
  private desiredVisible = true;
  private fullscreenHidden = false;
  private applyingVisibility = false;
  private quitting = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private shortcutScope = '';
  constructor(
    private config: ConfigStore,
    private personas: PersonaManager,
    private settings: (panel: string) => void,
    readonly logger: Logger,
  ) {
    app.on('before-quit', () => {
      this.quitting = true;
      globalShortcut.unregisterAll();
      clearInterval(this.timer);
      this.tray?.destroy();
      this.input?.cancelAll();
    });
    config.onChange((section, cfg) => {
      if (section === 'window') {
        this.login();
        this.menu();
      }
      if (section === 'hotkeys' || section === 'persona') this.shortcuts();
      if (section === 'advanced' && !cfg.advanced.developerMode) {
        this.session = sessionStateSchema.parse({});
        this.input?.forceState('auto');
      }
      this.publish();
    });
    powerMonitor.on('on-battery', () => {
      this.battery = true;
      this.publish();
    });
    powerMonitor.on('on-ac', () => {
      this.battery = false;
      this.publish();
    });
    this.battery = powerMonitor.isOnBatteryPower();
  }
  attach(pet: BrowserWindow, input: InputWindow) {
    this.pet = pet;
    this.input = input;
    this.desiredVisible = !this.config.get().window.startMinimized;
    this.tray = new Tray(
      nativeImage
        .createFromPath(
          fileURLToPath(new URL('../../assets/default-sprites/idle.png', import.meta.url)),
        )
        .resize({ width: 16, height: 16 }),
    );
    this.tray.setToolTip('LittleLLM');
    this.tray.on('double-click', () => this.focus());
    const visibilityChanged = () => {
      if (!this.applyingVisibility) this.desiredVisible = pet.isVisible();
      this.menu();
    };
    pet.on('show', visibilityChanged);
    pet.on('hide', visibilityChanged);
    pet.on('close', (event) => {
      if (this.quitting) return;
      if (this.config.get().window.onClose === 'quit') app.quit();
      else {
        event.preventDefault();
        this.toggleVisibility(false);
      }
    });
    input.activityChanged = () => this.escape();
    const crashes: number[] = [];
    pet.webContents.on('render-process-gone', (_event, details) => {
      input.cancelAll();
      this.logger.write('error', 'pet.renderer-gone', { reason: details.reason });
      if (this.quitting || pet.isDestroyed()) return;
      crashes.push(Date.now());
      if (crashes.filter((time) => Date.now() - time < 60000).length > 2) {
        this.warn('The sprite renderer stopped repeatedly. Restart LittleLLM to recover.');
        return;
      }
      setTimeout(() => {
        if (!pet.isDestroyed() && !this.quitting) pet.webContents.reload();
      }, 250);
    });
    this.timer = setInterval(() => this.fullscreen(), 500);
    this.timer.unref();
    this.login();
    this.shortcuts();
    this.menu();
    this.publish();
  }
  private menu() {
    if (!this.tray || this.tray.isDestroyed()) return;
    const visible = this.pet?.isVisible() ?? false;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: visible ? 'Hide companion' : 'Show companion',
          click: () => this.toggleVisibility(!visible),
        },
        { label: 'Open input', click: () => this.focus() },
        { label: 'Settings', click: () => this.settings('General') },
        {
          label: 'Mute speech',
          type: 'checkbox',
          checked: this.config.get().tts.muted,
          click: () => {
            const cfg = this.config.get().tts;
            this.config.set('tts', { ...cfg, muted: !cfg.muted });
            this.broadcastConfig();
            this.menu();
          },
        },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
  }
  focus() {
    if (!this.pet || this.pet.isDestroyed()) return;
    this.toggleVisibility(true);
    setImmediate(() => {
      void this.input?.open().catch(() => this.warn('The input box could not be opened.'));
    });
  }
  toggleVisibility(visible = !this.desiredVisible) {
    this.desiredVisible = visible;
    this.fullscreenHidden = false;
    if (!this.pet || this.pet.isDestroyed()) return;
    this.applyingVisibility = true;
    if (visible) this.pet.showInactive();
    else this.pet.hide();
    this.applyingVisibility = false;
    this.menu();
  }
  private warn(message: string) {
    if (!this.warnings.includes(message)) this.warnings = [...this.warnings.slice(-30), message];
    this.logger.write('warn', 'native.warning', { message });
    this.publish();
  }
  private login() {
    if (!app.isPackaged || process.env.LITTLELLM_TEST_USER_DATA) return;
    try {
      app.setLoginItemSettings({
        openAtLogin: this.config.get().window.launchAtLogin,
        path: process.execPath,
      });
    } catch {
      this.warn('Launch at login could not be applied.');
    }
  }
  private shortcuts() {
    if (!this.input) return;
    const cfg = this.config.get(),
      scope = JSON.stringify([cfg.hotkeys, cfg.persona.enabled, cfg.persona.library.length]);
    if (scope === this.shortcutScope) return;
    this.shortcutScope = scope;
    globalShortcut.unregisterAll();
    this.warnings = this.warnings.filter((value) => !value.startsWith('Shortcut unavailable:'));
    const actions: Partial<Record<keyof typeof cfg.hotkeys, () => unknown>> = {
      focus: () => this.focus(),
      visibility: () => this.toggleVisibility(),
      clipboard: () => this.input?.sendClipboard(),
      clickThrough: () => {
        const advanced = this.config.get().advanced;
        this.config.set('advanced', {
          ...advanced,
          clickThrough: advanced.clickThrough === 'never' ? 'alpha-mask' : 'never',
        });
        this.broadcastConfig();
      },
      nextPersona: async () => {
        const persona = this.config.get().persona;
        if (!persona.enabled || persona.library.length < 2) return;
        const at = persona.library.findIndex((card) => card.id === persona.activeId),
          next = persona.library[(at + 1) % persona.library.length];
        if (next) {
          await this.personas.action({ type: 'select', id: next.id });
          if (this.config.get().persona.activeId === next.id)
            this.input?.notify('Persona: ' + next.name);
        }
        this.broadcastConfig();
      },
    };
    for (const [name, action] of Object.entries(actions)) {
      if (name === 'nextPersona' && (!cfg.persona.enabled || cfg.persona.library.length < 2))
        continue;
      const chord = cfg.hotkeys[name as keyof typeof cfg.hotkeys];
      if (!chord) continue;
      try {
        if (
          !globalShortcut.register(chord, () => {
            void Promise.resolve()
              .then(action)
              .catch(() => this.warn(`Shortcut action failed: ${name}`));
          })
        )
          this.warn(`Shortcut unavailable: ${chord}`);
      } catch {
        this.warn(`Shortcut unavailable: ${chord}`);
      }
    }
    this.escape();
    this.publish();
  }
  private escape() {
    if (!this.input?.busy) {
      globalShortcut.unregister('Escape');
      return;
    }
    if (!globalShortcut.isRegistered('Escape')) {
      try {
        globalShortcut.register('Escape', () => this.input?.cancelAll());
      } catch {
        /* Focused input still handles Escape. */
      }
    }
  }
  private fullscreen() {
    const pet = this.pet;
    if (!pet || pet.isDestroyed() || !this.desiredVisible) return;
    try {
      const cfg = this.config.get().window,
        display = screen.getDisplayMatching(pet.getBounds()),
        rect = screen.dipToScreenRect(pet, display.bounds);
      const detected = fullscreenState(
        rect,
        BrowserWindow.getAllWindows().map((win) => win.getNativeWindowHandle()),
      );
      const hidden =
        cfg.fullscreenBehavior !== 'never' &&
        (detected.fullscreen ||
          (cfg.fullscreenBehavior === 'fullscreen-and-games' && detected.game));
      if (hidden === this.fullscreenHidden) return;
      this.fullscreenHidden = hidden;
      this.applyingVisibility = true;
      if (hidden) pet.hide();
      else pet.showInactive();
      this.applyingVisibility = false;
      this.menu();
    } catch {
      this.warn('Fullscreen monitoring is unavailable.');
      clearInterval(this.timer);
    }
  }
  setSession(changes: SessionPatch) {
    if (!this.config.get().advanced.developerMode) throw new Error('Developer mode is Off.');
    if (changes.saveLastRecording || changes.showMicOverlay)
      throw new Error('Voice-input diagnostics are deferred.');
    this.session = sessionStateSchema.parse({ ...this.session, ...changes });
    this.input?.forceState(this.session.forceState);
    this.publish();
    return this.status();
  }
  private cacheFiles() {
    const directory = join(app.getPath('userData'), 'cache', 'tts');
    if (!existsSync(directory)) return [];
    if (!realpathSync(directory).startsWith(realpathSync(app.getPath('userData')) + sep))
      throw new Error('Audio cache leaves managed storage.');
    if (lstatSync(directory).isSymbolicLink())
      throw new Error('Audio cache must be a regular directory.');
    return readdirSync(directory)
      .filter((name) => /^[a-f0-9]{64}\.audio$/.test(name))
      .map((name) => join(directory, name))
      .filter((path) => {
        const value = lstatSync(path);
        return value.isFile() && !value.isSymbolicLink();
      });
  }
  clearAudioCache() {
    this.input?.cancelAll();
    for (const path of this.cacheFiles()) unlinkSync(path);
    this.publish();
  }
  status(): RuntimeStatus {
    let audioCacheBytes = 0;
    try {
      audioCacheBytes = this.cacheFiles().reduce((sum, path) => sum + lstatSync(path).size, 0);
    } catch {
      /* Missing cache stays zero. */
    }
    return {
      onBattery: this.battery,
      warnings: this.warnings,
      session: this.session,
      audioCacheBytes,
    };
  }
  publish() {
    const value = this.status();
    for (const win of BrowserWindow.getAllWindows())
      if (!win.isDestroyed()) win.webContents.send(CHANNELS.runtimeChanged, value);
  }
  broadcastConfig() {
    const value = this.config.get();
    for (const win of BrowserWindow.getAllWindows())
      if (!win.isDestroyed()) win.webContents.send(CHANNELS.configChanged, value);
  }
  devtools(target: 'pet' | 'settings') {
    if (!this.config.get().advanced.developerMode) throw new Error('Developer mode is Off.');
    const win =
      target === 'pet'
        ? this.pet
        : BrowserWindow.getAllWindows().find((win) =>
            win.webContents.getURL().includes('settings'),
          );
    if (!win) throw new Error('Window is closed.');
    win.webContents.openDevTools({ mode: 'detach' });
  }
}
