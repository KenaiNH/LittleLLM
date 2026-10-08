import { app, BrowserWindow, ipcMain, screen, dialog, clipboard, shell } from 'electron';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { SpeechService } from '../tts/speechService';
import type { SttSession } from '../stt/sttSession';
import { VOICE_INPUT_ENABLED } from '../../shared/featureScope';
import {
  sttUiSchema,
  sttCaptureSchema,
  sttActionSchema,
  sttPreviewSchema,
  sttFrameSchema,
  sttFeedbackSchema,
  sttTestSchema,
  sttDevicesSchema,
  caretSchema,
} from '../../shared/stt';
import type { ChatImage, Attachment } from '../../shared/attachments';
import { synthesisScope } from '../../shared/ttsCustom';
import {
  ttsPacketSchema,
  ttsFeedbackSchema,
  ttsTestSchema,
  voiceListSchema,
} from '../../shared/tts';
type PendingTurn = {
  id: string;
  text: string;
  regenerate: boolean;
  images: ChatImage[];
  views: Attachment[];
  userText: string;
};
import type { ConfigStore } from '../services/configStore';
import { CHANNELS } from '../ipc/channels';
import { emptySchema, resultSchema } from '../ipc/schemas';
import { chatUiSchema, draftSchema, submitSchema, type ChatUi } from '../../shared/chatUi';
import { normalizeError } from '../../shared/errors';
import {
  preloadPath,
  secureWindow,
  loadRenderer,
  configureOutputPermissions,
  configureMicrophonePermissions,
} from './security';
import { StateController } from '../services/stateController';
import { companionStateSchema, overrideStateSchema } from '../../shared/state';
import type { SecretStore } from '../services/secretStore';
import { getSettingsWindow } from './settingsWindow';
import type { ConversationStore } from '../services/conversationStore';
import { booleanSchema } from '../ipc/schemas';
import { ChatService } from '../llm/chatService';
import { AttachmentStore } from '../services/attachments';
import {
  attachmentFileSchema,
  attachmentRemoveSchema,
  attachmentsSchema,
  capabilitySchema,
} from '../../shared/attachments';
import { imageCapability } from '../llm/capabilities';
import { createLLMProvider } from '../llm/registry';
import { ProviderError } from '../llm/errors';
import {
  chatEventSchema,
  abortChatSchema,
  requestIdSchema,
  type ChatEvent,
} from '../../shared/llm';

export class InputWindow {
  private state: ChatUi = {
    inputOpen: false,
    draft: '',
    attachments: [],
    reply: null,
    error: null,
    speechNotice: null,
    speaking: false,
    queuedMessage: false,
    stt: sttUiSchema.parse({}),
  };
  private voice: SpeechService | null = null;
  private microphone: SttSession | null = null;
  private loadingMicrophone: Promise<SttSession> | null = null;
  private caret = { start: 0, end: 0 };
  private sttBubbleId: string | null = null;
  private previewEpoch = 0;
  private previewHost: BrowserWindow | null = null;
  private loadingVoice: Promise<SpeechService> | null = null;
  private pendingTurn: PendingTurn | null = null;
  private preserveSentence = false;
  private attachments: AttachmentStore;
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
    private secrets?: SecretStore,
    private history?: ConversationStore,
  ) {
    configureMicrophonePermissions(
      (contents) =>
        VOICE_INPUT_ENABLED &&
        contents === pet.webContents &&
        config.get().stt.provider !== 'none' &&
        Boolean(this.microphone?.canCapture),
    );
    configureOutputPermissions(
      (contents) =>
        config.get().tts.provider !== 'none' &&
        (contents === pet.webContents || contents === getSettingsWindow()?.webContents),
    );
    this.attachments = new AttachmentStore(() => config.get());
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
    let speechConfig = config.get().tts;
    let captureConfig = JSON.stringify(config.get().stt);
    const removeConfig = config.onChange((section, cfg) => {
      if (section === 'input' || section === 'bubble') this.position();
      if (section === 'bubble') this.lifecycle.settingsChanged();
      if (section === 'advanced' && !cfg.advanced.developerMode) {
        this.lifecycle.force('auto');
        if (cfg.stt.provider === 'mock') this.microphone?.abort();
      }
      if (section === 'stt' && JSON.stringify(cfg.stt) !== captureConfig) {
        this.microphone?.abort();
        captureConfig = JSON.stringify(cfg.stt);
      }
      if (section === 'tts') {
        if (synthesisScope(cfg.tts) !== synthesisScope(speechConfig)) {
          this.voice?.abort();
          try {
            this.voice?.cache.clear();
          } catch {
            /* Cache failure must not block configuration. */
          }
        }
        speechConfig = cfg.tts;
        this.flushPending();
      }
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
      senderCheck?: (sender: Electron.WebContents) => boolean,
    ) =>
      ipcMain.handle(channel, async (event, payload: unknown) => {
        try {
          if (!trusted(event) || (senderCheck && !senderCheck(event.sender)))
            throw new Error('Untrusted chat sender');
          return resultSchema(response).parse({
            ok: true,
            value: await action(request.parse(payload)),
          });
        } catch (error) {
          return {
            ok: false,
            error: error instanceof ProviderError ? error.normalized : normalizeError(error),
          };
        }
      });
    handle(CHANNELS.chatUiGet, emptySchema, chatUiSchema, () => this.state);
    handle(CHANNELS.sttStart, sttActionSchema, z.null(), async (p) => {
      if (config.get().stt.provider === 'none') return null;
      const mic = await this.ensureMicrophone();
      if (
        p.action === 'toggle' &&
        !mic.isPreview &&
        ['recording', 'starting'].includes(mic.ui.status)
      ) {
        mic.stop();
        return null;
      }
      this.pendingTurn = null;
      this.voice?.abort();
      this.chat.abort();
      await mic.start(false, p.action === 'test-microphone');
      return null;
    });
    handle(CHANNELS.sttStop, emptySchema, z.null(), () => {
      this.microphone?.stop();
      return null;
    });
    handle(CHANNELS.sttAbort, emptySchema, z.null(), () => {
      this.microphone?.abort();
      return null;
    });
    handle(
      CHANNELS.sttPreview,
      sttPreviewSchema,
      z.null(),
      async (p) => {
        const settings = getSettingsWindow();
        const epoch = ++this.previewEpoch;
        if (!p.active) {
          if (this.microphone?.isPreview) this.microphone.abort();
          return null;
        }
        if (
          !settings?.isFocused() ||
          config.get().stt.provider === 'none' ||
          config.get().stt.provider === 'mock'
        )
          return null;
        const mic = await this.ensureMicrophone();
        if (
          epoch !== this.previewEpoch ||
          this.quitting ||
          settings.isDestroyed() ||
          !settings.isFocused() ||
          config.get().stt.provider === 'none'
        )
          return null;
        if (this.previewHost !== settings) {
          this.previewHost = settings;
          const stopPreview = () => {
            ++this.previewEpoch;
            if (this.microphone?.isPreview || this.microphone?.isTest) this.microphone.abort();
          };
          settings.on('blur', stopPreview);
          settings.on('closed', stopPreview);
        }
        if (mic.ui.status === 'idle') {
          await mic.start(true);
        } else if (mic.isPreview) mic.renewPreview();
        return null;
      },
      (sender) => sender === getSettingsWindow()?.webContents,
    );
    handle(
      CHANNELS.sttDevices,
      emptySchema,
      sttDevicesSchema,
      () => this.microphone?.devices ?? [],
    );
    handle(CHANNELS.sttTest, emptySchema, sttTestSchema, async () =>
      (await this.ensureMicrophone()).testConnection(),
    );
    handle(CHANNELS.sttReinsert, emptySchema, z.null(), async () => {
      await this.microphone?.reinsert();
      return null;
    });
    handle(CHANNELS.sttPrivacy, emptySchema, z.null(), async () => {
      await shell.openExternal('ms-settings:privacy-microphone');
      return null;
    });
    ipcMain.on(CHANNELS.sttAudioFrame, (event, payload: unknown) => {
      if (!trusted(event) || event.sender !== pet.webContents) return;
      const parsed = sttFrameSchema.safeParse(payload);
      if (parsed.success) this.microphone?.frame(parsed.data);
    });
    ipcMain.on(CHANNELS.sttFeedback, (event, payload: unknown) => {
      if (!trusted(event) || event.sender !== pet.webContents) return;
      const parsed = sttFeedbackSchema.safeParse(payload);
      if (parsed.success) {
        this.microphone?.feedback(parsed.data);
        if (parsed.data.type === 'error' && ['no-device', 'device-lost'].includes(parsed.data.code))
          config.set('stt', { ...config.get().stt, inputDeviceId: 'default' });
      }
    });
    ipcMain.on(CHANNELS.sttCaret, (event, payload: unknown) => {
      if (!trusted(event) || event.sender !== this.win?.webContents) return;
      const parsed = caretSchema.safeParse(payload);
      if (parsed.success) this.caret = parsed.data;
    });
    handle(CHANNELS.ttsVoices, emptySchema, voiceListSchema, async () => {
      const cfg = config.get().tts;
      if (cfg.provider === 'none') return [];
      const { createTTSProvider } = await import('../tts/registry');
      const provider = await createTTSProvider(cfg, () => this.speechKey(cfg.provider));
      try {
        return await provider.listVoices();
      } finally {
        provider.dispose();
      }
    });
    handle(CHANNELS.ttsTest, emptySchema, ttsTestSchema, async () => {
      const cfg = structuredClone(config.get().tts);
      const voice = await this.ensureVoice();
      if (!voice)
        throw new ProviderError({
          code: 'INVALID_RESPONSE',
          userMessage: 'Choose an enabled speech provider first.',
          retryable: false,
        });
      const id = randomUUID(),
        credentialRevision = ['openai-compatible-tts', 'elevenlabs', 'custom-http'].includes(
          cfg.provider,
        )
          ? (secrets?.status(`tts.${cfg.provider}` as import('../../shared/settings').SecretId)
              .revision ?? '')
          : '';
      const firstAudioMs = await voice.preview(id, cfg, "Hello. I'm your desktop companion.");
      return {
        requestId: id,
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        credentialRevision,
        firstAudioMs,
      };
    });
    ipcMain.on(CHANNELS.ttsFeedback, (event, payload: unknown) => {
      if (!trusted(event) || event.sender !== pet.webContents) return;
      const parsed = ttsFeedbackSchema.safeParse(payload);
      if (parsed.success) this.voice?.feedback(parsed.data);
    });
    const capability = () => {
      const cfg = config.get(),
        provider = cfg.llm.provider;
      return imageCapability(
        cfg,
        createLLMProvider(cfg, async () =>
          provider === 'openai-compatible' || provider === 'anthropic'
            ? secrets?.get(`llm.${provider}`)
            : undefined,
        ),
      );
    };
    const requireImages = async () => {
      const result = await capability();
      if (!result.allowed)
        throw new ProviderError({
          code: 'INVALID_RESPONSE',
          userMessage: result.reason,
          retryable: false,
        });
    };
    const publishAttachments = () => {
      this.state = { ...this.state, attachments: this.attachments.views };
      this.position();
      this.broadcast();
      return this.state.attachments;
    };
    handle(CHANNELS.attachCapability, emptySchema, capabilitySchema, capability);
    handle(CHANNELS.attachRemove, attachmentRemoveSchema, attachmentsSchema, (p) => {
      this.attachments.remove(p.id);
      return publishAttachments();
    });
    handle(CHANNELS.attachClipboard, emptySchema, attachmentsSchema, async () => {
      await requireImages();
      const items = await clipboard.read();
      const item = items.find((value) =>
        value.types.some((type) => /^image\/(png|jpeg|webp|gif)$/.test(type)),
      );
      const type = item?.types.find((value) => /^image\/(png|jpeg|webp|gif)$/.test(value));
      if (!item || !type) return this.attachments.views;
      const image = await item.getType(type);
      if (!('arrayBuffer' in image) || image.size > 10 * 1024 * 1024)
        throw new ProviderError({
          code: 'FILE_TOO_LARGE',
          userMessage: 'Clipboard images must be at most 10 MiB.',
          retryable: false,
        });
      await this.attachments.add([
        { bytes: Buffer.from(await image.arrayBuffer()), name: 'Clipboard image' },
      ]);
      return publishAttachments();
    });
    handle(CHANNELS.attachFile, attachmentFileSchema, attachmentsSchema, async (p) => {
      await requireImages();
      let paths = p.paths;
      if (!paths) {
        const result = await dialog.showOpenDialog(this.win ?? this.pet, {
          title: 'Attach images',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        });
        if (result.canceled) return this.attachments.views;
        paths = result.filePaths;
      }
      await this.attachments.files(paths);
      return publishAttachments();
    });
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
    handle(CHANNELS.inputSubmit, submitSchema, z.null(), async (p) => {
      await this.begin(p.text);
      return null;
    });
    handle(CHANNELS.llmChat, submitSchema, requestIdSchema, (p) => this.begin(p.text));
    handle(CHANNELS.llmAbort, abortChatSchema, z.null(), (p) => {
      if (p.requestId && p.requestId !== this.state.reply?.requestId) return null;
      this.pendingTurn = null;
      this.microphone?.abort();
      this.voice?.abort();
      this.chat.abort(p.requestId);
      this.state = { ...this.state, queuedMessage: false };
      this.lifecycle.cancel(p.requestId, Boolean(this.state.reply));
      this.broadcast();
      return null;
    });
    handle(CHANNELS.llmRegenerate, emptySchema, requestIdSchema, () => this.begin('', true));
    handle(CHANNELS.llmClear, emptySchema, z.null(), () => {
      this.pendingTurn = null;
      this.voice?.abort();
      this.chat.clear();
      this.lifecycle.cancel();
      this.state = {
        ...this.state,
        reply: null,
        error: null,
        queuedMessage: false,
        speechNotice: null,
      };
      this.broadcast();
      return null;
    });
    handle(CHANNELS.bubbleDismiss, emptySchema, z.null(), () => {
      this.pendingTurn = null;
      this.voice?.abort();
      this.chat.abort();
      this.lifecycle.cancel();
      this.state = {
        ...this.state,
        reply: null,
        error: null,
        queuedMessage: false,
        speechNotice: null,
      };
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
      configureOutputPermissions(() => false);
      configureMicrophonePermissions(() => false);
      this.microphone?.abort();
      this.pendingTurn = null;
      this.voice?.abort();
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
    this.microphone?.abort();
    this.pendingTurn = null;
    this.voice?.abort();
    this.chat.abort();
    this.lifecycle.dispose();
    this.quitting = true;
  };
  private async ensureMicrophone(): Promise<SttSession> {
    if (!VOICE_INPUT_ENABLED)
      throw new Error('Voice input is deferred to a future release. Typed chat remains available.');
    if (this.microphone) return this.microphone;
    this.loadingMicrophone ??= import('../stt/sttSession').then(({ SttSession }) => {
      this.microphone = new SttSession(
        () => this.config.get(),
        (provider) =>
          Promise.resolve(
            provider === 'openai-compatible-stt' || provider === 'custom-http'
              ? this.secrets?.get(`stt.${provider}`)
              : undefined,
          ),
        (packet) => {
          if (!this.pet.isDestroyed())
            this.pet.webContents.send(CHANNELS.sttCapture, sttCaptureSchema.parse(packet));
        },
        (stt) => {
          this.state = { ...this.state, stt };
          this.broadcast();
        },
        (phase) => {
          if (phase === 'listening') this.lifecycle.listen();
          else if (phase === 'transcribing') {
            this.lifecycle.transcribing();
            if (!this.state.reply) {
              this.sttBubbleId = this.microphone?.ui.sessionId ?? randomUUID();
              this.state = {
                ...this.state,
                reply: {
                  requestId: this.sttBubbleId,
                  name: 'Companion',
                  text: 'Transcribing…',
                  streaming: false,
                  userText: '',
                  attachments: [],
                },
              };
              this.broadcast();
            }
          } else {
            this.lifecycle.cancel(undefined, Boolean(this.state.reply));
            if (this.sttBubbleId === this.state.reply?.requestId) {
              this.state = { ...this.state, reply: null };
              this.sttBubbleId = null;
              this.broadcast();
            }
          }
        },
        async (text, cfg) => {
          const { insertTranscript } = await import('../stt/transcript');
          this.state = {
            ...this.state,
            draft: insertTranscript(
              this.state.draft,
              text,
              this.caret.start,
              this.caret.end,
              cfg.insertMode,
            ),
          };
          this.caret = { start: this.state.draft.length, end: this.state.draft.length };
          await this.open();
          this.broadcast();
        },
        async () => {
          await this.begin(this.state.draft);
        },
        () => {
          if (!this.pet.isDestroyed()) this.pet.webContents.reload();
        },
      );
      return this.microphone;
    });
    return this.loadingMicrophone;
  }
  private speechKey(provider: import('../../shared/config').Config['tts']['provider']) {
    return Promise.resolve(
      provider === 'openai-compatible-tts' ||
        provider === 'elevenlabs' ||
        provider === 'custom-http'
        ? this.secrets?.get(`tts.${provider}`)
        : undefined,
    );
  }
  private async ensureVoice() {
    if (this.config.get().tts.provider === 'none' || this.quitting) return null;
    if (this.voice) return this.voice;
    this.loadingVoice ??= import('../tts/speechService')
      .then(({ SpeechService }) => {
        const voice = new SpeechService(
          join(app.getPath('userData'), 'cache', 'tts'),
          (event) => {
            if (!this.pet.isDestroyed())
              this.pet.webContents.send(CHANNELS.ttsAudio, ttsPacketSchema.parse(event));
          },
          (id, drained) => {
            this.lifecycle.audio(id, drained);
            this.state = { ...this.state, speaking: !drained };
            this.broadcast();
          },
          (_id, text) => {
            this.state = { ...this.state, speechNotice: text };
            this.broadcast();
          },
          () => this.flushPending(),
          (provider) => this.speechKey(provider),
        );
        this.voice = voice;
        return voice;
      })
      .finally(() => {
        this.loadingVoice = null;
      });
    const voice = await this.loadingVoice;
    if (this.quitting || this.config.get().tts.provider === 'none') return null;
    return voice;
  }
  private flushPending() {
    if (!this.pendingTurn || this.state.reply?.streaming || this.voice?.hasSpeech || this.quitting)
      return;
    const turn = this.pendingTurn;
    this.pendingTurn = null;
    void this.startTurn(turn).catch(() => {
      this.state = {
        ...this.state,
        queuedMessage: false,
        error: {
          code: 'UNKNOWN',
          userMessage: 'The queued message could not be started.',
          retryable: false,
        },
      };
      this.broadcast();
    });
  }
  private async begin(text: string, regenerate = false) {
    this.microphone?.abort();
    if (!regenerate && !text.trim() && !this.attachments.views.length)
      throw new ProviderError({
        code: 'INVALID_RESPONSE',
        userMessage: 'Type a message or attach an image before sending.',
        retryable: false,
      });
    const previous = this.state.reply,
      views = regenerate ? (previous?.attachments ?? []) : this.attachments.views;
    if (!regenerate && views.length > this.config.get().llm.maxAttachments)
      throw new ProviderError({
        code: 'FILE_INVALID',
        userMessage: 'Remove attachments above the configured limit before sending.',
        retryable: false,
      });
    const turn: PendingTurn = {
      id: randomUUID(),
      text,
      regenerate,
      images: regenerate ? [] : this.attachments.images,
      views,
      userText: regenerate ? (previous?.userText ?? '') : text,
    };
    if (!regenerate) this.attachments.clear();
    this.state = { ...this.state, draft: '', attachments: [] };
    this.position();
    const policy = this.config.get().tts.onNewMessage;
    if (this.voice?.hasSpeech && policy !== 'stop') {
      this.pendingTurn = turn;
      this.state = { ...this.state, queuedMessage: true };
      if (policy === 'finish-sentence') {
        this.voice.finishSentence();
        this.preserveSentence = true;
        this.chat.abort();
        this.preserveSentence = false;
      }
      if (!this.config.get().input.keepOpenAfterSend) this.close();
      else this.broadcast();
      this.flushPending();
      return turn.id;
    }
    this.pendingTurn = null;
    return this.startTurn(turn);
  }
  private async startTurn(turn: PendingTurn) {
    const requestId = this.chat.start(turn.text, turn.regenerate, turn.images, turn.id);
    this.lifecycle.begin(requestId);
    this.state = {
      ...this.state,
      draft: '',
      attachments: [],
      reply: {
        requestId,
        name: 'Companion',
        text: '',
        streaming: true,
        userText: turn.userText,
        attachments: turn.views,
      },
      error: null,
      speechNotice: null,
      speaking: false,
      queuedMessage: false,
    };
    if (!this.config.get().input.keepOpenAfterSend) this.close();
    else this.broadcast();
    // Optional audio initialization cannot delay or prevent text generation.
    if (this.config.get().tts.provider !== 'none') {
      const speechConfig = structuredClone(this.config.get().tts);
      void this.ensureVoice()
        .then((voice) => {
          const reply = this.state.reply;
          if (
            !voice ||
            !reply ||
            reply.requestId !== requestId ||
            this.quitting ||
            synthesisScope(this.config.get().tts) !== synthesisScope(speechConfig)
          )
            return;
          voice.begin(requestId, speechConfig);
          if (reply.text || !reply.streaming) voice.push(requestId, reply.text, !reply.streaming);
        })
        .catch(() => {
          if (this.state.reply?.requestId !== requestId) return;
          this.state = { ...this.state, speechNotice: 'Speech unavailable — continuing as text.' };
          this.broadcast();
        });
    }
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
      this.voice?.push(event.requestId, event.delta.text);
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
      if (event.delta.type === 'done') this.voice?.push(event.requestId, '', true);
      else if (!this.preserveSentence) this.voice?.abort();
      this.state = {
        ...this.state,
        reply: aborted && !reply.text ? null : { ...reply, streaming: false },
        error,
      };
      if (aborted && this.preserveSentence) this.lifecycle.complete(event.requestId);
      else if (aborted) this.lifecycle.cancel(event.requestId, Boolean(this.state.reply));
      else if (error) this.lifecycle.fail(event.requestId);
      else this.lifecycle.complete(event.requestId);
      this.broadcast();
      this.flushPending();
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
      height = Math.min(167 + (this.state.attachments.length ? 104 : 0), area.height);
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
