import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { z } from 'zod';
import type { ConfigStore } from '../services/configStore';
import { CHANNELS } from '../ipc/channels';
import { emptySchema, resultSchema } from '../ipc/schemas';
import { chatUiSchema, draftSchema, submitSchema, type ChatUi } from '../../shared/chatUi';
import { normalizeError } from '../../shared/errors';
import { preloadPath, secureWindow, loadRenderer } from './security';
import { StateController } from '../services/stateController';
import { companionStateSchema, overrideStateSchema } from '../../shared/state';
import type { SecretStore } from '../services/secretStore';
import { getSettingsWindow } from './settingsWindow';
import type { ConversationStore } from '../services/conversationStore';
import { booleanSchema } from '../ipc/schemas';
import { ChatService } from '../llm/chatService';
import {
  chatEventSchema,
  abortChatSchema,
  requestIdSchema,
  type ChatEvent,
} from '../../shared/llm';

export class InputWindow {
  private state: ChatUi = { inputOpen: false, draft: '', reply: null, error: null };
  private chat: ChatService;
  private queued: ReturnType<typeof setTimeout> | null = null;
  private win: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private quitting = false;
  private lifecycle: StateController;
  private hideBubble = () => {
    this.state = { ...this.state, reply: null, error: null };
    this.broadcast();
  };
  constructor(
    private config: ConfigStore,
    private pet: BrowserWindow,
    secrets?: SecretStore,
    private history?: ConversationStore,
  ) {
    this.lifecycle = new StateController(
      () => config.get(),
      (state) => {
        for (const win of [this.pet, this.win])
          if (win && !win.isDestroyed())
            win.webContents.send(CHANNELS.stateChanged, companionStateSchema.parse(state));
      },
      this.hideBubble,
    );
    this.chat = new ChatService(
      () => config.get(),
      (event) => this.delta(event),
      async () => {
        const provider = config.get().llm.provider;
        return provider === 'openai-compatible' || provider === 'anthropic'
          ? secrets?.get(`llm.${provider}`)
          : undefined;
      },
      undefined,
      history,
    );
    let connection = config.get().llm;
    const removeConfig = config.onChange((section, cfg) => {
      if (section === 'input' || section === 'bubble') this.position();
      if (section === 'bubble') this.lifecycle.settingsChanged();
      if (section === 'advanced' && !cfg.advanced.developerMode) this.lifecycle.force('auto');
      if (section === 'llm') {
        if (cfg.llm.persistence !== connection.persistence) this.chat.persistenceChanged();
        if (
          cfg.llm.provider !== connection.provider ||
          cfg.llm.baseUrl !== connection.baseUrl ||
          cfg.llm.model !== connection.model
        )
          this.chat.abort();
        connection = cfg.llm;
      }
    });
    const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
      event.senderFrame === event.sender.mainFrame &&
      (event.sender === this.win?.webContents ||
        event.sender === pet.webContents ||
        event.sender === getSettingsWindow()?.webContents);
    const handle = <S extends z.ZodTypeAny, R extends z.ZodTypeAny>(
      channel: string,
      request: S,
      response: R,
      action: (payload: z.output<S>) => z.input<R> | Promise<z.input<R>>,
    ) =>
      ipcMain.handle(channel, async (event, payload: unknown) => {
        try {
          if (!trusted(event)) throw new Error('Untrusted chat sender');
          return resultSchema(response).parse({
            ok: true,
            value: await action(request.parse(payload)),
          });
        } catch (error) {
          return { ok: false, error: normalizeError(error) };
        }
      });
    handle(CHANNELS.chatUiGet, emptySchema, chatUiSchema, () => this.state);
    handle(CHANNELS.stateGet, emptySchema, companionStateSchema, () => this.lifecycle.snapshot);
    handle(CHANNELS.stateOverride, overrideStateSchema, z.null(), (p) => {
      if (!import.meta.env.DEV && !this.config.get().advanced.developerMode)
        throw new Error('State override requires Developer Mode');
      this.lifecycle.force(p.state);
      return null;
    });
    handle(CHANNELS.inputToggle, emptySchema, z.null(), async () => {
      if (this.state.inputOpen) this.close();
      else await this.open();
      return null;
    });
    handle(CHANNELS.inputClose, emptySchema, z.null(), () => {
      this.close();
      return null;
    });
    handle(CHANNELS.inputSubmit, submitSchema, z.null(), (p) => {
      this.begin(p.text);
      return null;
    });
    handle(CHANNELS.llmChat, submitSchema, requestIdSchema, (p) => this.begin(p.text));
    handle(CHANNELS.llmAbort, abortChatSchema, z.null(), (p) => {
      this.chat.abort(p.requestId);
      this.lifecycle.cancel(p.requestId, Boolean(this.state.reply));
      return null;
    });
    handle(CHANNELS.llmRegenerate, emptySchema, requestIdSchema, () => this.begin('', true));
    handle(CHANNELS.llmClear, emptySchema, z.null(), () => {
      this.chat.clear();
      this.lifecycle.cancel();
      this.state = { ...this.state, reply: null, error: null };
      this.broadcast();
      return null;
    });
    handle(CHANNELS.bubbleDismiss, emptySchema, z.null(), () => {
      this.chat.abort();
      this.lifecycle.cancel();
      this.state = { ...this.state, reply: null, error: null };
      this.broadcast();
      return null;
    });
    ipcMain.on(CHANNELS.bubbleHover, (event, payload: unknown) => {
      if (!trusted(event) || event.sender !== pet.webContents) return;
      const parsed = booleanSchema.safeParse(payload);
      if (parsed.success) {
        this.lifecycle.hover(parsed.data);
      }
    });
    ipcMain.on(CHANNELS.inputDraft, (event, payload: unknown) => {
      if (!trusted(event) || event.sender !== this.win?.webContents) return;
      const parsed = draftSchema.safeParse(payload);
      if (parsed.success) this.state = { ...this.state, draft: parsed.data.text };
    });
    screen.on('display-metrics-changed', this.position);
    screen.on('display-removed', this.position);
    pet.on('move', this.position);
    pet.on('hide', () => this.close());
    app.on('before-quit', this.beforeQuit);
    pet.once('closed', () => {
      this.chat.abort();
      removeConfig();
      if (this.queued) clearTimeout(this.queued);
      this.lifecycle.dispose();
      screen.removeListener('display-metrics-changed', this.position);
      screen.removeListener('display-removed', this.position);
      app.removeListener('before-quit', this.beforeQuit);
      this.win?.destroy();
    });
  }
  private beforeQuit = () => {
    this.chat.abort();
    this.lifecycle.dispose();
    this.quitting = true;
  };
  private begin(text: string, regenerate = false) {
    const requestId = regenerate ? this.chat.regenerate() : this.chat.start(text);
    this.lifecycle.begin(requestId);
    this.state = {
      ...this.state,
      draft: '',
      reply: { requestId, name: 'Companion', text: '', streaming: true },
      error: null,
    };
    if (!this.config.get().input.keepOpenAfterSend) this.close();
    else this.broadcast();
    return requestId;
  }
  private delta(event: ChatEvent) {
    for (const win of [this.pet, this.win])
      if (win && !win.isDestroyed())
        win.webContents.send(CHANNELS.llmDelta, chatEventSchema.parse(event));
    const reply = this.state.reply;
    if (!reply || reply.requestId !== event.requestId) return;
    if (event.delta.type === 'text') {
      if (event.delta.text) this.lifecycle.output(event.requestId);
      this.state = { ...this.state, reply: { ...reply, text: reply.text + event.delta.text } };
      if (!this.queued) this.queued = setTimeout(() => this.broadcast(), 32);
    } else {
      const aborted = event.delta.type === 'error' && event.delta.error.code === 'ABORTED',
        error =
          event.delta.type === 'error' && !aborted
            ? event.delta.error
            : event.delta.type === 'done' && this.history?.warning
              ? {
                  code: 'FILE_INVALID' as const,
                  userMessage: this.history.warning,
                  retryable: false,
                }
              : null;
      this.state = {
        ...this.state,
        reply: aborted && !reply.text ? null : { ...reply, streaming: false },
        error,
      };
      if (aborted) this.lifecycle.cancel(event.requestId, Boolean(this.state.reply));
      else if (error) this.lifecycle.fail(event.requestId);
      else this.lifecycle.complete(event.requestId);
      this.broadcast();
    }
  }
  private initialize() {
    if (this.ready) return this.ready;
    const win = new BrowserWindow({
      width: 1280,
      height: 167,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      fullscreenable: false,
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.win = win;
    secureWindow(win);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.on('close', (event) => {
      if (!this.quitting) {
        event.preventDefault();
        this.close();
      }
    });
    this.ready = loadRenderer(win, 'input');
    return this.ready;
  }
  private position = () => {
    if (!this.win || this.win.isDestroyed() || this.pet.isDestroyed()) return;
    const area = screen.getDisplayMatching(this.pet.getBounds()).workArea;
    const cfg = this.config.get(),
      width = Math.min(
        area.width,
        cfg.input.width === 'wide'
          ? area.width
          : cfg.input.width === 'compact'
            ? 280
            : cfg.bubble.baseWidthPx * cfg.bubble.scale,
      ),
      height = Math.min(167, area.height);
    this.win.setBounds({
      x: area.x + area.width - width,
      y: area.y + area.height - height,
      width: Math.round(width),
      height,
    });
  };
  private broadcast() {
    if (this.queued) clearTimeout(this.queued);
    this.queued = null;
    for (const win of [this.pet, this.win])
      if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.chatUiChanged, this.state);
  }
  async open() {
    this.state = { ...this.state, inputOpen: true };
    await this.initialize();
    if (!this.state.inputOpen || !this.win || this.win.isDestroyed()) return;
    this.position();
    this.win.show();
    this.win.focus();
    this.broadcast();
  }
  close() {
    this.state = {
      ...this.state,
      inputOpen: false,
      draft: this.config.get().input.rememberDraft ? this.state.draft : '',
    };
    this.win?.hide();
    this.broadcast();
  }
}
