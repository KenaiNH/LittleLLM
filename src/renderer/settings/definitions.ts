import type { Config, ConfigSection } from '../../shared/config';
import { OPTIONS } from '../../shared/enums';
export const PANELS = [
  'General',
  'Sprites',
  'Model',
  'Persona',
  'Voice',
  'Voice Input',
  'Appearance',
  'Advanced',
] as const;
export type Panel = (typeof PANELS)[number];
export type Setting = {
  id: number;
  panel: Panel;
  group: string;
  section: ConfigSection;
  key: string;
  label: string;
  kind:
    | 'toggle'
    | 'select'
    | 'number'
    | 'range'
    | 'text'
    | 'textarea'
    | 'color'
    | 'tags'
    | 'model'
    | 'font';
  options?: readonly (readonly [string, string])[];
  min?: number;
  max?: number;
  step?: number;
  multiplier?: number;
  suffix?: string;
  hint?: string;
  synonyms?: string;
  restart?: boolean;
  rows?: number;
  maxLength?: number;
  visible?: (cfg: Config) => boolean;
  disabled?: (cfg: Config) => boolean;
  disabledHint?: string;
};
const field = <S extends ConfigSection>(
  section: S,
  key: keyof Config[S] & string,
  definition: Omit<Setting, 'section' | 'key'>,
): Setting => ({ ...definition, section, key });
const general = (
  key: keyof Config['window'],
  definition: Omit<Setting, 'section' | 'key' | 'panel'>,
) => field('window', key, { ...definition, panel: 'General' });
const model = (key: keyof Config['llm'], definition: Omit<Setting, 'section' | 'key' | 'panel'>) =>
  field('llm', key, { ...definition, panel: 'Model' });
const bubble = (
  key: keyof Config['bubble'],
  definition: Omit<Setting, 'section' | 'key' | 'panel'>,
) => field('bubble', key, { ...definition, panel: 'Appearance' });
const input = (
  key: keyof Config['input'],
  definition: Omit<Setting, 'section' | 'key' | 'panel'>,
) => field('input', key, { ...definition, panel: 'Appearance' });
const notMock = (cfg: Config) => cfg.llm.provider !== 'mock';
const speech = (cfg: Config) => cfg.tts.provider !== 'none';
export const SETTINGS: Setting[] = [
  general('launchAtLogin', {
    id: 1,
    group: 'Startup',
    label: 'Launch at Windows login',
    kind: 'toggle',
    synonyms: 'startup boot autostart',
  }),
  general('startMinimized', {
    id: 2,
    group: 'Startup',
    label: 'Start minimized (sprite hidden)',
    kind: 'toggle',
    disabled: (cfg) => !cfg.window.launchAtLogin,
  }),
  general('showInTaskbar', { id: 3, group: 'Startup', label: 'Show in taskbar', kind: 'toggle' }),
  general('restorePosition', {
    id: 4,
    group: 'Startup',
    label: 'Restore sprite position on launch',
    kind: 'toggle',
  }),
  general('onClose', {
    id: 5,
    group: 'Window Behavior',
    label: 'When the window is closed',
    kind: 'select',
    options: OPTIONS.onClose,
  }),
  general('fullscreenBehavior', {
    id: 6,
    group: 'Window Behavior',
    label: 'Hide sprite when a fullscreen app is active',
    kind: 'select',
    options: OPTIONS.fullscreenBehavior,
    synonyms: 'games gaming',
  }),
  general('allWorkspaces', {
    id: 7,
    group: 'Window Behavior',
    label: 'Show on all virtual desktops',
    kind: 'toggle',
  }),
  general('contentProtection', {
    id: 8,
    group: 'Window Behavior',
    label: 'Hide sprite from screen capture',
    kind: 'toggle',
    restart: true,
    hint: 'Prevents the sprite from appearing in screen shares and recordings. Some capture tools may ignore this.',
  }),
  general('displayTarget', {
    id: 9,
    group: 'Placement',
    label: 'Display',
    kind: 'select',
    options: OPTIONS.displayTarget,
    synonyms: 'monitor screen',
  }),
  general('defaultAnchor', {
    id: 10,
    group: 'Placement',
    label: 'Default anchor',
    kind: 'select',
    options: OPTIONS.defaultAnchor,
    hint: 'Used when restoring the sprite position is off.',
  }),
  general('edgeMarginPx', {
    id: 11,
    group: 'Placement',
    label: 'Edge margin',
    kind: 'range',
    min: 0,
    max: 200,
    step: 4,
    suffix: 'px',
  }),
  general('snapToEdges', {
    id: 12,
    group: 'Placement',
    label: 'Snap to screen edges',
    kind: 'toggle',
  }),
  general('snapDistancePx', {
    id: 13,
    group: 'Placement',
    label: 'Snap distance',
    kind: 'range',
    min: 4,
    max: 64,
    suffix: 'px',
  }),
  general('keepOnScreen', {
    id: 14,
    group: 'Placement',
    label: 'Keep fully on screen',
    kind: 'toggle',
  }),
  field('update', 'channel', {
    id: 21,
    panel: 'General',
    group: 'Updates',
    label: 'Update channel',
    kind: 'select',
    options: OPTIONS.updateChannel,
  }),
  field('update', 'install', {
    id: 22,
    panel: 'General',
    group: 'Updates',
    label: 'Install updates',
    kind: 'select',
    options: OPTIONS.updateInstall,
    visible: (cfg) => cfg.update.channel !== 'disabled',
  }),
  model('provider', {
    id: 60,
    group: 'Provider',
    label: 'Provider',
    kind: 'select',
    options: OPTIONS.llmProvider,
  }),
  model('baseUrl', {
    id: 61,
    group: 'Provider',
    label: 'Base URL',
    kind: 'text',
    maxLength: 2000,
    visible: notMock,
    disabled: (cfg) => cfg.llm.provider === 'anthropic' && !cfg.advanced.developerMode,
    hint: 'Local containers typically use http://localhost:11434 (Ollama) or http://localhost:8080/v1 (llama.cpp, vLLM, LM Studio).',
    synonyms: 'endpoint server address connection',
  }),
  model('model', {
    id: 64,
    group: 'Provider',
    label: 'Model',
    kind: 'model',
    visible: notMock,
    maxLength: 200,
  }),
  model('mockReplySpeed', {
    id: 76,
    group: 'Provider',
    label: 'Mock reply speed',
    kind: 'range',
    min: 1,
    max: 1000,
    suffix: 'chars/sec',
    visible: (cfg) => cfg.llm.provider === 'mock',
  }),
  model('timeoutMs', {
    id: 65,
    group: 'Provider',
    label: 'Request timeout',
    kind: 'number',
    min: 5,
    max: 600,
    multiplier: 1000,
    suffix: 's',
    visible: notMock,
  }),
  model('retryAttempts', {
    id: 66,
    group: 'Provider',
    label: 'Retry attempts',
    kind: 'select',
    options: OPTIONS.retryAttempts,
    visible: notMock,
    hint: 'Connection-reset retries are limited to one before the first token. Higher selections currently use that limit.',
  }),
  model('systemPrompt', {
    id: 67,
    group: 'Generation',
    label: 'System prompt',
    kind: 'textarea',
    rows: 6,
    maxLength: 8000,
    synonyms: 'instructions personality',
  }),
  model('promptPreset', {
    id: 68,
    group: 'Generation',
    label: 'Prompt preset',
    kind: 'select',
    options: OPTIONS.promptPreset,
  }),
  model('temperature', {
    id: 69,
    group: 'Generation',
    label: 'Temperature',
    kind: 'range',
    min: 0,
    max: 2,
    step: 0.05,
  }),
  model('topP', {
    id: 70,
    group: 'Generation',
    label: 'Top P',
    kind: 'range',
    min: 0,
    max: 1,
    step: 0.01,
  }),
  model('maxTokens', {
    id: 71,
    group: 'Generation',
    label: 'Max response tokens',
    kind: 'number',
    min: 64,
    max: 32768,
  }),
  model('stopSequences', {
    id: 72,
    group: 'Generation',
    label: 'Stop sequences',
    kind: 'tags',
    hint: 'Up to four sequences; press Enter to add.',
  }),
  model('stream', {
    id: 73,
    group: 'Generation',
    label: 'Stream responses',
    kind: 'toggle',
    hint: 'Turning this off disables the typewriter effect and delays all speech until the full reply arrives.',
  }),
  model('contextMode', {
    id: 74,
    group: 'Conversation Memory',
    label: 'Context to send',
    kind: 'select',
    options: OPTIONS.contextMode,
  }),
  model('tokenBudget', {
    id: 75,
    group: 'Conversation Memory',
    label: 'Token budget',
    kind: 'number',
    min: 512,
    max: 200000,
    visible: (cfg) => cfg.llm.contextMode === 'token-budget',
  }),
  model('persistence', {
    id: 76,
    group: 'Conversation Memory',
    label: 'Save conversations to disk',
    kind: 'select',
    options: OPTIONS.persistence,
  }),
  model('enableImages', {
    id: 78,
    group: 'Image & Attachment Handling',
    label: 'Enable image attachments',
    kind: 'toggle',
  }),
  model('imageDetail', {
    id: 79,
    group: 'Image & Attachment Handling',
    label: 'Image detail level',
    kind: 'select',
    options: OPTIONS.imageDetail,
    visible: (cfg) => cfg.llm.enableImages,
  }),
  model('maxImageDim', {
    id: 80,
    group: 'Image & Attachment Handling',
    label: 'Max image dimension',
    kind: 'select',
    options: OPTIONS.maxImageDim,
    visible: (cfg) => cfg.llm.enableImages,
  }),
  model('reencodeFormat', {
    id: 81,
    group: 'Image & Attachment Handling',
    label: 'Re-encode format',
    kind: 'select',
    options: OPTIONS.reencodeFormat,
    visible: (cfg) => cfg.llm.enableImages,
  }),
  model('maxAttachments', {
    id: 82,
    group: 'Image & Attachment Handling',
    label: 'Max attachments per message',
    kind: 'number',
    min: 1,
    max: 10,
    visible: (cfg) => cfg.llm.enableImages,
  }),
  bubble('scale', {
    id: 118,
    group: 'Chat Bubble — Size & Position',
    label: 'Bubble scale',
    kind: 'range',
    min: 50,
    max: 250,
    step: 5,
    multiplier: 0.01,
    suffix: '%',
    synonyms: 'zoom resize size',
  }),
  bubble('scaleRelativeTo', {
    id: 119,
    group: 'Chat Bubble — Size & Position',
    label: 'Scale is relative to',
    kind: 'select',
    options: OPTIONS.scaleRelativeTo,
  }),
  bubble('maxWidthPx', {
    id: 120,
    group: 'Chat Bubble — Size & Position',
    label: 'Maximum width',
    kind: 'number',
    min: 160,
    max: 1200,
    suffix: 'px',
    visible: (cfg) => cfg.bubble.scaleRelativeTo !== 'screen',
  }),
  bubble('maxHeightPx', {
    id: 121,
    group: 'Chat Bubble — Size & Position',
    label: 'Maximum height',
    kind: 'number',
    min: 80,
    max: 1000,
    suffix: 'px',
    visible: (cfg) => cfg.bubble.scaleRelativeTo !== 'screen',
  }),
  bubble('bubblePlacement', {
    id: 122,
    group: 'Chat Bubble — Size & Position',
    label: 'Bubble placement',
    kind: 'select',
    options: OPTIONS.bubblePlacement,
  }),
  bubble('gapFromSpritePx', {
    id: 123,
    group: 'Chat Bubble — Size & Position',
    label: 'Gap from sprite',
    kind: 'range',
    min: 0,
    max: 80,
    suffix: 'px',
  }),
  bubble('showTail', {
    id: 124,
    group: 'Chat Bubble — Size & Position',
    label: 'Show bubble tail',
    kind: 'toggle',
  }),
  bubble('maxWidthPct', {
    id: 125,
    group: 'Chat Bubble — Size & Position',
    label: 'Max width (% of screen)',
    kind: 'range',
    min: 10,
    max: 60,
    multiplier: 0.01,
    suffix: '%',
    visible: (cfg) => cfg.bubble.scaleRelativeTo === 'screen',
  }),
  bubble('maxHeightPct', {
    id: 126,
    group: 'Chat Bubble — Size & Position',
    label: 'Max height (% of screen)',
    kind: 'range',
    min: 10,
    max: 80,
    multiplier: 0.01,
    suffix: '%',
    visible: (cfg) => cfg.bubble.scaleRelativeTo === 'screen',
  }),
  bubble('scrollbar', {
    id: 127,
    group: 'Chat Bubble — Scrolling',
    label: 'Scrollbar',
    kind: 'select',
    options: OPTIONS.scrollbar,
  }),
  bubble('autoScroll', {
    id: 128,
    group: 'Chat Bubble — Scrolling',
    label: 'Auto-scroll to newest text',
    kind: 'toggle',
  }),
  bubble('wheelBehavior', {
    id: 129,
    group: 'Chat Bubble — Scrolling',
    label: 'Mouse wheel over bubble',
    kind: 'select',
    options: OPTIONS.wheelBehavior,
  }),
  bubble('theme', {
    id: 130,
    group: 'Chat Bubble — Style',
    label: 'Theme',
    kind: 'select',
    options: OPTIONS.theme,
  }),
  bubble('backgroundColor', {
    id: 131,
    group: 'Chat Bubble — Style',
    label: 'Background color',
    kind: 'color',
    visible: (cfg) => cfg.bubble.theme === 'custom',
  }),
  bubble('textColor', {
    id: 132,
    group: 'Chat Bubble — Style',
    label: 'Text color',
    kind: 'color',
    visible: (cfg) => cfg.bubble.theme === 'custom',
  }),
  bubble('accentColor', {
    id: 133,
    group: 'Chat Bubble — Style',
    label: 'Accent color',
    kind: 'color',
    visible: (cfg) => cfg.bubble.theme === 'custom',
  }),
  bubble('backgroundOpacity', {
    id: 134,
    group: 'Chat Bubble — Style',
    label: 'Background opacity',
    kind: 'range',
    min: 20,
    max: 100,
    multiplier: 0.01,
    suffix: '%',
  }),
  bubble('backdropBlur', {
    id: 135,
    group: 'Chat Bubble — Style',
    label: 'Background blur',
    kind: 'select',
    options: OPTIONS.backdropBlur,
    hint: 'Strong Acrylic is unavailable in this build.',
  }),
  bubble('cornerRadiusPx', {
    id: 136,
    group: 'Chat Bubble — Style',
    label: 'Corner radius',
    kind: 'range',
    min: 0,
    max: 32,
    suffix: 'px',
  }),
  bubble('paddingPx', {
    id: 137,
    group: 'Chat Bubble — Style',
    label: 'Padding',
    kind: 'range',
    min: 4,
    max: 32,
    suffix: 'px',
  }),
  bubble('border', {
    id: 138,
    group: 'Chat Bubble — Style',
    label: 'Border',
    kind: 'select',
    options: OPTIONS.border,
  }),
  bubble('shadow', {
    id: 139,
    group: 'Chat Bubble — Style',
    label: 'Drop shadow',
    kind: 'select',
    options: OPTIONS.shadow,
  }),
  bubble('fontFamily', {
    id: 140,
    group: 'Chat Bubble — Text',
    label: 'Font',
    kind: 'font',
    hint: 'Suggested Windows fonts and bundled Figma fonts. You can enter another installed family name.',
  }),
  bubble('fontSizePx', {
    id: 141,
    group: 'Chat Bubble — Text',
    label: 'Font size',
    kind: 'range',
    min: 10,
    max: 28,
    suffix: 'px',
  }),
  bubble('lineHeight', {
    id: 142,
    group: 'Chat Bubble — Text',
    label: 'Line height',
    kind: 'range',
    min: 1,
    max: 2.2,
    step: 0.05,
  }),
  bubble('renderMarkdown', {
    id: 143,
    group: 'Chat Bubble — Text',
    label: 'Render Markdown',
    kind: 'toggle',
  }),
  bubble('codeTheme', {
    id: 144,
    group: 'Chat Bubble — Text',
    label: 'Code block theme',
    kind: 'select',
    options: OPTIONS.codeTheme,
    visible: (cfg) => cfg.bubble.renderMarkdown,
  }),
  bubble('textReveal', {
    id: 145,
    group: 'Chat Bubble — Text',
    label: 'Text reveal',
    kind: 'select',
    options: OPTIONS.textReveal,
  }),
  bubble('revealRate', {
    id: 146,
    group: 'Chat Bubble — Text',
    label: 'Reveal speed',
    kind: 'range',
    min: 10,
    max: 200,
    suffix: 'units/sec',
    visible: (cfg) => cfg.bubble.textReveal !== 'instant',
    disabled: (cfg) => speech(cfg) && cfg.bubble.matchRevealToSpeech,
    disabledHint: 'Reveal speed is being matched to the voice.',
  }),
  bubble('matchRevealToSpeech', {
    id: 147,
    group: 'Chat Bubble — Text',
    label: 'Match reveal speed to speech',
    kind: 'toggle',
    visible: speech,
  }),
  bubble('dwellMs', {
    id: 148,
    group: 'Bubble Lifetime',
    label: 'Hide the bubble',
    kind: 'select',
    options: [
      ['0', 'Only when I dismiss it'],
      ['10000', 'After 10 seconds'],
      ['20000', 'After 20 seconds'],
      ['30000', 'After 30 seconds'],
      ['60000', 'After 60 seconds'],
    ],
  }),
  bubble('keepOpenOnHover', {
    id: 149,
    group: 'Bubble Lifetime',
    label: 'Keep open while the mouse is over it',
    kind: 'toggle',
    visible: (cfg) => cfg.bubble.dwellMs !== 0,
  }),
  bubble('waitForSpeech', {
    id: 150,
    group: 'Bubble Lifetime',
    label: 'Wait for speech to finish before hiding',
    kind: 'toggle',
    visible: speech,
  }),
  input('openOn', {
    id: 151,
    group: 'Input Box',
    label: 'Open the input box on',
    kind: 'select',
    options: OPTIONS.openOn,
  }),
  input('sendWith', {
    id: 152,
    group: 'Input Box',
    label: 'Send message with',
    kind: 'select',
    options: OPTIONS.sendWith,
  }),
  input('width', {
    id: 153,
    group: 'Input Box',
    label: 'Input box width',
    kind: 'select',
    options: OPTIONS.inputWidth,
  }),
  input('keepOpenAfterSend', {
    id: 154,
    group: 'Input Box',
    label: 'Keep the input box open after sending',
    kind: 'toggle',
  }),
  input('rememberDraft', {
    id: 155,
    group: 'Input Box',
    label: 'Remember draft text',
    kind: 'toggle',
  }),
];
export function matchesSearch(label: string, query: string) {
  const haystack = label.toLocaleLowerCase();
  return query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .every((word) => {
      if (haystack.includes(word)) return true;
      let at = 0;
      for (const char of haystack) if (char === word[at]) at++;
      return at === word.length;
    });
}
