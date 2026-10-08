import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { z } from 'zod';
import type { ConfigStore } from '../services/configStore';
import { CHANNELS } from '../ipc/channels';
import { emptySchema, resultSchema } from '../ipc/schemas';
import { chatUiSchema, draftSchema, submitSchema, type ChatUi } from '../../shared/chatUi';
import { normalizeError } from '../../shared/errors';
import { preloadPath, secureWindow, loadRenderer } from './security';
import { DwellTimer } from '../services/dwellTimer';
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
  private hovering = false;
  private lifetime = new DwellTimer(() => {
    this.state = { ...this.state, reply: null, error: null };
    this.broadcast();
  });
  constructor(
    private config: ConfigStore,
    private pet: BrowserWindow,
  ) {
    this.chat = new ChatService(
      () => config.get(),
      (event) => this.delta(event),
    );
    let connection = config.get().llm;
    const removeConfig = config.onChange((section, cfg) => {
      if (section === 'llm') {
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
      (event.sender === this.win?.webContents || event.sender === pet.webContents);
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
      return null;
    });
    handle(CHANNELS.llmRegenerate, emptySchema, requestIdSchema, () => this.begin('', true));
    handle(CHANNELS.llmClear, emptySchema, z.null(), () => {
      this.chat.clear();
      this.lifetime.stop();
      this.state = { ...this.state, reply: null, error: null };
      this.broadcast();
      return null;
    });
    handle(CHANNELS.bubbleDismiss, emptySchema, z.null(), () => {
      this.chat.abort();
      this.lifetime.stop();
      this.state = { ...this.state, reply: null, error: null };
      this.broadcast();
      return null;
    });
    ipcMain.on(CHANNELS.bubbleHover, (event, payload: unknown) => {
      if (!trusted(event) || event.sender !== pet.webContents) return;
      const parsed = booleanSchema.safeParse(payload);
      if (parsed.success) {
        this.hovering = parsed.data;
        this.lifetime.pause(this.hovering && this.config.get().bubble.keepOpenOnHover);
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
      this.lifetime.stop();
      screen.removeListener('display-metrics-changed', this.position);
      screen.removeListener('display-removed', this.position);
      app.removeListener('before-quit', this.beforeQuit);
      this.win?.destroy();
    });
  }
  private beforeQuit = () => {
    this.chat.abort();
    this.quitting = true;
  };
  private begin(text: string, regenerate = false) {
    const requestId = regenerate ? this.chat.regenerate() : this.chat.start(text);
    this.lifetime.stop();
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
      this.state = { ...this.state, reply: { ...reply, text: reply.text + event.delta.text } };
      if (!this.queued) this.queued = setTimeout(() => this.broadcast(), 32);
    } else {
      const aborted = event.delta.type === 'error' && event.delta.error.code === 'ABORTED',
        error = event.delta.type === 'error' && !aborted ? event.delta.error : null;
      this.state = {
        ...this.state,
        reply: aborted && !reply.text ? null : { ...reply, streaming: false },
        error,
      };
      this.lifetime.pause(this.hovering && this.config.get().bubble.keepOpenOnHover);
      this.lifetime.start(this.config.get().bubble.dwellMs);
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
