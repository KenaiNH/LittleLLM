import { z } from 'zod';
import { OPTIONS } from './enums';
import { speechBody } from './ttsCustom';

export const CONFIG_SCHEMA_VERSION = 1;
const en = <K extends keyof typeof OPTIONS>(key: K) => {
  type Value = (typeof OPTIONS)[K][number][0];
  return z.enum(OPTIONS[key].map(([value]) => value) as [Value, ...Value[]]);
};
const num = (min: number, max: number, value: number) =>
  z.number().min(min).max(max).default(value);
const integer = (min: number, max: number, value: number) =>
  z.number().int().min(min).max(max).default(value);
const hex = z.string().regex(/^#[\da-f]{6}$/i);
export const relativePathSchema = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (p) =>
      !p.includes('\\') &&
      !p.startsWith('/') &&
      !p.includes(':') &&
      !p.split('/').some((s) => s === '..' || s === '.' || s === ''),
    'Must be a safe relative asset path',
  );
export const httpUrlSchema = z
  .string()
  .max(2000)
  .url()
  .refine((s) => {
    try {
      const url = new URL(s);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use an HTTP or HTTPS URL without credentials');
const headersSchema = z
  .record(z.string().max(4096))
  .refine(
    (headers) =>
      !Object.entries(headers).some(
        ([key, value]) =>
          /authorization|api[-_]?key|cookie|token|secret/i.test(key) &&
          !/^(?:[A-Za-z-]+ )?{{apiKey}}$/.test(value),
      ),
    'Store credentials in the secret field, referenced as {{apiKey}}',
  );
const anchorSchema = z.object({ x: num(0, 1, 0.5), y: num(0, 1, 1) }).strict();
export const spriteStateSchema = z
  .object({
    mode: en('spriteMode').default('static'),
    source: relativePathSchema.default('default.png'),
    frameWidth: z.number().int().min(1).max(8192).optional(),
    frameHeight: z.number().int().min(1).max(8192).optional(),
    frameCount: z.number().int().min(1).max(512).optional(),
    columns: z.number().int().min(1).max(512).optional(),
    frameOrder: en('frameOrder').default('row-major'),
    fps: num(1, 60, 12),
    playbackMode: en('playbackMode').default('loop'),
    anchor: anchorSchema.default({}),
    gifTimingSource: en('gifTimingSource').default('file'),
  })
  .strict();
export const mouthSchema = z
  .object({
    enabled: z.boolean().default(false),
    driver: en('mouthDriver').default('amplitude'),
    mode: en('mouthMode').default('sheet'),
    source: relativePathSchema.optional(),
    frameWidth: z.number().int().min(1).max(8192).optional(),
    frameHeight: z.number().int().min(1).max(8192).optional(),
    frameCount: integer(2, 8, 3),
    offset: z
      .object({ x: num(-512, 512, 0), y: num(-512, 512, 0) })
      .strict()
      .default({}),
    sensitivity: num(0.1, 5, 1),
    smoothing: num(0, 0.95, 0.6),
    silenceThreshold: num(0, 0.5, 0.04),
  })
  .strict();
export const spriteSchema = z
  .object({
    idle: spriteStateSchema.default({}),
    thinking: spriteStateSchema.default({}),
    speaking: spriteStateSchema.default({}),
    listening: spriteStateSchema.optional(),
    mouth: mouthSchema.default({}),
    scale: num(0.25, 4, 1),
    scaleMode: en('scaleMode').default('dpi-aware'),
    flipHorizontal: z.boolean().default(false),
    pixelated: en('pixelated').default('auto'),
    listeningBehavior: en('listeningBehavior').default('use-idle'),
    opacity: num(0.2, 1, 1),
    transition: en('transition').default('crossfade'),
    crossfadeMs: num(40, 500, 120),
    minThinkingMs: num(0, 2000, 250),
  })
  .strict();
export const windowSchema = z
  .object({
    launchAtLogin: z.boolean().default(false),
    settingsDarkMode: z.boolean().default(false),
    startMinimized: z.boolean().default(false),
    showInTaskbar: z.boolean().default(false),
    restorePosition: z.boolean().default(true),
    onClose: en('onClose').default('tray'),
    fullscreenBehavior: en('fullscreenBehavior').default('fullscreen-and-games'),
    allWorkspaces: z.boolean().default(true),
    contentProtection: z.boolean().default(false),
    displayTarget: z.string().default('primary'),
    defaultAnchor: en('defaultAnchor').default('br'),
    edgeMarginPx: num(0, 200, 24),
    snapToEdges: z.boolean().default(true),
    snapDistancePx: num(4, 64, 16),
    keepOnScreen: z.boolean().default(true),
    positions: z.record(z.object({ x: z.number(), y: z.number() }).strict()).default({}),
  })
  .strict();
export const bubbleSchema = z
  .object({
    scale: num(0.5, 2.5, 1),
    baseWidthPx: num(1, 1200, 560),
    maxWidthPx: num(160, 1200, 560),
    maxHeightPx: num(80, 1000, 420),
    scaleRelativeTo: en('scaleRelativeTo').default('sprite'),
    maxWidthPct: num(0.1, 0.6, 0.25),
    maxHeightPct: num(0.1, 0.8, 0.4),
    bubblePlacement: en('bubblePlacement').default('auto'),
    gapFromSpritePx: num(0, 80, 12),
    showTail: z.boolean().default(true),
    scrollbar: en('scrollbar').default('auto'),
    autoScroll: z.boolean().default(true),
    wheelBehavior: en('wheelBehavior').default('scroll'),
    theme: en('theme').default('custom'),
    backgroundColor: hex.default('#7897d6'),
    textColor: hex.default('#ffffff'),
    accentColor: hex.default('#e4e9ff'),
    backgroundOpacity: num(0.2, 1, 199 / 255),
    backdropBlur: en('backdropBlur').default('subtle'),
    cornerRadiusPx: num(0, 32, 0),
    paddingPx: num(4, 32, 30),
    border: en('border').default('thin'),
    shadow: en('shadow').default('none'),
    fontFamily: z.string().min(1).max(128).default('Courier Prime'),
    fontSizePx: num(10, 28, 22),
    lineHeight: num(1, 2.2, 1.4),
    renderMarkdown: z.boolean().default(true),
    codeTheme: en('codeTheme').default('match'),
    textReveal: en('textReveal').default('word'),
    revealRate: num(10, 200, 45),
    matchRevealToSpeech: z.boolean().default(true),
    dwellMs: z
      .union([z.literal(0), z.literal(10000), z.literal(20000), z.literal(30000), z.literal(60000)])
      .default(30000),
    keepOpenOnHover: z.boolean().default(true),
    waitForSpeech: z.boolean().default(true),
    showTokenCount: z.boolean().default(false),
  })
  .strict();
export const llmSchema = z
  .object({
    provider: en('llmProvider').default('openai-compatible'),
    baseUrl: httpUrlSchema.default('https://api.openai.com/v1'),
    model: z.string().min(1).max(200).default('gpt-4o-mini'),
    timeoutMs: integer(5000, 600000, 120000),
    retryAttempts: integer(0, 3, 2),
    customHeaders: headersSchema.default({}),
    systemPrompt: z
      .string()
      .max(8000)
      .default(
        'You are a desktop companion. Keep replies brief and conversational —\nusually one to three sentences. Use Markdown only when it genuinely\nhelps. Do not describe your own appearance or actions.',
      ),
    promptPreset: en('promptPreset').default('helpful-companion'),
    temperature: num(0, 2, 0.7),
    topP: num(0, 1, 1),
    maxTokens: integer(64, 32768, 1024),
    stopSequences: z.array(z.string().min(1).max(200)).max(4).default([]),
    stream: z.boolean().default(true),
    contextMode: en('contextMode').default('last10'),
    tokenBudget: integer(512, 200000, 8000),
    persistence: en('persistence').default('session'),
    enableImages: z.boolean().default(true),
    imageDetail: en('imageDetail').default('auto'),
    maxImageDim: en('maxImageDim').default('1536'),
    reencodeFormat: en('reencodeFormat').default('jpeg'),
    maxAttachments: integer(1, 10, 4),
    mockReplySpeed: num(1, 1000, 45),
  })
  .strict();
export const ttsSchema = z
  .object({
    provider: en('ttsProvider').or(z.literal('mock')).default('none'),
    voice: z.string().max(200).default('alloy'),
    speed: num(0.5, 2, 1),
    pitch: num(-10, 10, 0),
    volume: num(0, 1, 0.8),
    muted: z.boolean().default(false),
    outputDeviceId: z.string().default('default'),
    baseUrl: httpUrlSchema.default('https://api.openai.com/v1'),
    model: z.string().max(200).default('tts-1'),
    format: en('audioFormat').default('mp3'),
    mouthSync: z.boolean().default(false),
    elevenlabs: z
      .object({
        voiceId: z.string().max(200).default(''),
        modelId: en('elevenModel').default('eleven_flash_v2_5'),
        stability: num(0, 1, 0.5),
        similarityBoost: num(0, 1, 0.75),
        style: num(0, 1, 0),
        speakerBoost: z.boolean().default(true),
      })
      .strict()
      .default({}),
    custom: z
      .object({
        method: en('ttsMethod').default('POST'),
        url: httpUrlSchema.optional(),
        headers: headersSchema.default({}),
        bodyTemplate: z
          .string()
          .max(16000)
          .refine((template) => {
            try {
              speechBody(template, 'Text', 'voice', 1);
              return true;
            } catch {
              return false;
            }
          }, 'Enter a JSON object containing {{text}}; supported placeholders are {{text}}, {{voice}} and {{speed}}.')
          .default('{"text":"{{text}}"}'),
        responseMode: en('responseMode').default('binary'),
        jsonPath: z.string().max(200).default(''),
        format: en('customAudioFormat').default('mp3'),
      })
      .strict()
      .default({}),
    beginSpeaking: en('beginSpeaking').default('first-sentence'),
    onNewMessage: en('onNewMessage').default('stop'),
    codeBlockSpeech: en('codeBlockSpeech').default('announce'),
    linkSpeech: en('linkSpeech').default('label'),
    emojiSpeech: en('emojiSpeech').default('skip'),
    maxSpeechChars: integer(100, 20000, 4000),
    cacheAudio: z.boolean().default(true),
    onFailure: en('ttsFailure').default('text-only'),
  })
  .strict();
export const sttSchema = z
  .object({
    provider: en('sttProvider').default('none'),
    activation: en('activation').default('push-to-talk'),
    inputDeviceId: z.string().default('default'),
    language: z.string().max(64).default('auto'),
    recognitionLanguage: z.string().default(''),
    showPartials: z.boolean().default(true),
    baseUrl: httpUrlSchema.default('https://api.openai.com/v1'),
    model: z.string().max(200).default('whisper-1'),
    prompt: z.string().max(1000).default(''),
    local: z
      .object({
        executablePath: z.string().default(''),
        modelPath: z.string().default(''),
        extraArgs: z.array(z.string().max(1000)).max(64).default([]),
        outputMode: en('outputMode').default('json'),
      })
      .strict()
      .default({}),
    custom: z
      .object({
        method: en('sttMethod').default('POST'),
        url: httpUrlSchema.optional(),
        headers: headersSchema.default({}),
        uploadMode: en('uploadMode').default('multipart-file'),
        fileFieldName: z.string().default('file'),
        extraFields: z.record(z.string()).default({}),
        transcriptPath: z.string().default('text'),
      })
      .strict()
      .default({}),
    audioFormat: en('sttAudioFormat').default('wav16'),
    showMicButton: z.boolean().default(true),
    silenceTimeoutMs: num(300, 5000, 900),
    maxUtteranceSec: num(5, 300, 120),
    startSound: z.boolean().default(true),
    pauseWhileSpeaking: z.boolean().default(true),
    inputGain: num(0.5, 4, 1),
    noiseSuppression: en('noiseSuppression').default('default'),
    echoCancellation: z.boolean().default(true),
    vadThreshold: num(0.005, 0.08, 0.02),
    transcriptAction: en('transcriptAction').default('hold'),
    countdownMs: num(500, 5000, 1500),
    insertMode: en('insertMode').default('caret'),
    spokenPunctuation: z.boolean().default(false),
    trimFillers: z.boolean().default(false),
    autoCapitalize: z.boolean().default(true),
    minConfidence: num(0, 0.9, 0),
    onFailure: en('sttFailure').default('error'),
    includeTranscriptsInLogs: z.boolean().default(false),
  })
  .strict();
export const personaCardSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(48).default('Companion'),
    pronouns: z.string().max(32).default(''),
    description: z.string().max(4000).default(''),
    speechStyle: z.string().max(1000).default(''),
    exampleDialogue: z
      .array(z.object({ user: z.string().max(500), assistant: z.string().max(500) }).strict())
      .max(8)
      .default([]),
    userNotes: z.string().max(1000).default(''),
    userName: z.string().max(64).default(''),
    replyLength: en('replyLength').default('one-two'),
    characterBreak: en('characterBreak').default('technical'),
    allowRoleplayActions: z.boolean().default(false),
    voiceOverride: z.string().max(200).optional(),
    spritePackId: z.string().optional(),
  })
  .strict();
export const personaSchema = z
  .object({
    enabled: z.boolean().default(false),
    activeId: z.string().uuid().nullable().default(null),
    library: z.array(personaCardSchema).max(50).default([]),
    injection: en('injection').default('after'),
    greeting: z
      .object({
        mode: en('greetingMode').default('off'),
        text: z.string().max(500).default(''),
        prompt: z.string().max(500).default('Greet me in one short sentence.'),
        frequency: en('greetingFrequency').default('per-launch'),
        delayMs: num(0, 30000, 3000),
        speak: z.boolean().default(true),
      })
      .strict()
      .default({}),
    packPersonaPolicy: en('packPersonaPolicy').default('ask'),
    onSwitch: en('onSwitch').default('new-conversation'),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.activeId && !cfg.library.some((c) => c.id === cfg.activeId))
      ctx.addIssue({ code: 'custom', message: 'Active persona is absent from library' });
  });
export const inputSchema = z
  .object({
    openOn: en('openOn').default('single-click'),
    sendWith: en('sendWith').default('enter'),
    width: en('inputWidth').default('wide'),
    keepOpenAfterSend: z.boolean().default(false),
    rememberDraft: z.boolean().default(true),
  })
  .strict();
export const advancedSchema = z
  .object({
    clickThrough: en('clickThrough').default('alpha-mask'),
    alphaThreshold: integer(1, 254, 10),
    hitTestEveryNFrames: z.union([z.literal(1), z.literal(2), z.literal(4)]).default(2),
    dragEnabled: z.boolean().default(true),
    dragModifier: en('dragModifier').default('none'),
    fpsCap: en('fpsCap').default('display'),
    pauseWhenHidden: z.boolean().default(true),
    reduceOnBattery: z.boolean().default(true),
    hardwareAcceleration: z.boolean().default(true),
    spriteCacheMb: z
      .union([z.literal(64), z.literal(128), z.literal(256), z.literal(512)])
      .default(128),
    proxyMode: en('proxyMode').default('system'),
    proxyUrl: z.string().max(2000).default(''),
    proxyBypass: z.string().max(2000).default('localhost, 127.0.0.1'),
    allowSelfSigned: z.boolean().default(false),
    logLevel: en('logLevel').default('warn'),
    redactPrompts: z.boolean().default(true),
    developerMode: z.boolean().default(false),
  })
  .strict();
export const sessionStateSchema = z
  .object({
    forceState: en('forceState').default('auto'),
    showMaskOverlay: z.boolean().default(false),
    showFps: z.boolean().default(false),
    saveLastRecording: z.boolean().default(false),
    showMicOverlay: z.boolean().default(false),
  })
  .strict();
export const updateSchema = z
  .object({
    channel: en('updateChannel').default('stable'),
    install: en('updateInstall').default('notify'),
  })
  .strict();
export const hotkeysSchema = z
  .object({
    focus: z.string().default('Control+Shift+Space'),
    visibility: z.string().default('Control+Shift+H'),
    region: z.string().default('Control+Shift+S'),
    clipboard: z.string().default(''),
    clickThrough: z.string().default(''),
    voice: z.string().default('Control+Shift+V'),
    voiceSend: z.string().default(''),
    muteMic: z.string().default(''),
    nextPersona: z.string().default(''),
  })
  .strict();
export const configSections = {
  window: windowSchema,
  sprite: spriteSchema,
  bubble: bubbleSchema,
  llm: llmSchema,
  tts: ttsSchema,
  stt: sttSchema,
  persona: personaSchema,
  input: inputSchema,
  advanced: advancedSchema,
  update: updateSchema,
  hotkeys: hotkeysSchema,
};
export const configSchema = z
  .object({
    schemaVersion: z.literal(CONFIG_SCHEMA_VERSION).default(CONFIG_SCHEMA_VERSION),
    window: windowSchema.default({}),
    sprite: spriteSchema.default({}),
    bubble: bubbleSchema.default({}),
    llm: llmSchema.default({}),
    tts: ttsSchema.default({}),
    stt: sttSchema.default({}),
    persona: personaSchema.default({}),
    input: inputSchema.default({}),
    advanced: advancedSchema.default({}),
    update: updateSchema.default({}),
    hotkeys: hotkeysSchema.default({}),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;
export type SpriteConfig = z.infer<typeof spriteSchema>;
export type SpriteStateConfig = z.infer<typeof spriteStateSchema>;
export type MouthConfig = z.infer<typeof mouthSchema>;
export type ConfigSection = keyof typeof configSections;
export const defaults = (): Config => configSchema.parse({});
export const configSectionSchema = z.enum(
  Object.keys(configSections) as [ConfigSection, ...ConfigSection[]],
);
