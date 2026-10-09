# Desktop AI Sprite Companion — Build Instructions (v5)

> **Changelog from v4**
> - **Added §6.4: Persona system.** Structured character definition layered on the system prompt — persona cards, a library, example dialogue as real few-shot turns, template variables, an optional greeting, and persona bundling inside Sprite Packs. `enabled: false` by default.
> - Resolves the latent conflict between the shipped `Helpful companion` prompt and any persona (§6.4.1).
> - Settings gains an eighth panel, **Persona** (§7), specified as controls 236–267 in the settings spec.
> - Build sequence gains **step 19**.
>
> **Changelog from v3 — pre-handoff reconciliation pass**
> - **Added §0.1: Document precedence.** Resolves which document wins when this spec and the settings spec disagree.
> - **Added §16: Conflict register.** Every known contradiction between the two documents, with a single binding resolution. Read this before implementing any config schema.
> - **Added §17: Gap closures** — config versioning/migration, mock providers, IPC channel inventory, error taxonomy, conversation persistence, token counting, audio cache, focus behavior, first-run.
> - **Added §18: Known technical landmines** — four things that look simple in the settings spec and are not.
> - `BubbleConfig` and `SpriteConfig` corrected to cover the controls the settings spec actually defines.
>
> **Changelog from v2**
> - **Added §10: Speech-to-Text (voice input).** Modular and provider-pluggable like TTS: Windows built-in dictation, any OpenAI-compatible `/v1/audio/transcriptions` endpoint (Whisper in Docker), local whisper.cpp binary, custom HTTP. Transcript fills the input box.
> - State machine gains an **optional `listening` state** that falls back to `idle` + a mic indicator — the three-sprite contract is unchanged.
> - **Echo suppression** rules added for the TTS↔STT interaction (§10.7).
> - Push-to-talk keyup limitation documented with a concrete fix (§10.5).
> - Sections 10–13 renumbered to 11–14; build sequence extended to 18 steps.
>
> **Changelog from v1**
> - **Windows is now the primary and only *required* target.** macOS/Linux reduced to "do not actively break."
> - **Added §8: Text-to-Speech**, fully modular — `none` is the default, providers are pluggable (Windows SAPI, any local/OpenAI-compatible endpoint incl. Kokoro-in-Docker, ElevenLabs, custom HTTP).
> - **Added §9: Multimodal input** (clipboard image, file attach, region screenshot).
> - **Amplitude-driven mouth sync** added to the sprite system (§3.6).
> - Idle behavior is **loop-only** — no wandering, blinking schedules, or proactive messages.

---

## 0. Mission

Build a Windows desktop application that renders an **always-on-top, frameless, transparent-background animated sprite** of an AI assistant. The sprite has three animation states (`idle`, `thinking`, `speaking`). Clicking the sprite opens an input box; the model's reply renders in a **scrollable chat bubble** anchored to the sprite, whose size scales with a user-defined setting.

Everything user-facing is configurable from a **Settings window**: sprite assets, bubble appearance, LLM backend, voice output, and voice input. The LLM backend is pluggable (hosted API or local model over HTTP/Docker). The TTS and STT backends are **independently pluggable and each off by default**.

**Non-goals:** no wandering/pathing sprite, no proactive unprompted messages, no wake-word/always-listening-by-default behavior, no plugin/extension system, no localization (English only in v1).

### 0.1 Document precedence

Two documents govern this build:

| Document | Authority |
|---|---|
| `desktop_companion_spec.md` (this file) | **Architecture, data model, Zod schemas, runtime behavior, security.** Wins on anything structural. |
| `settings_window_spec.md` | **UI inventory: which controls exist, their labels, options, ranges, defaults, and conditional visibility.** Wins on anything the user sees. |

**Rule:** if the settings spec defines a control that has no field in a schema here, **the schema is incomplete — add the field.** Do not drop the control. If the two specify different *values* for the same thing, §16 is the tiebreaker. If §16 doesn't cover it, the settings spec wins for user-visible values and this file wins for everything else; log the discrepancy in a `DISCREPANCIES.md` rather than guessing silently.

### 0.2 Labels vs. stored values (read this before writing any enum)

The settings spec lists option strings as human sentences — `Push-to-talk (hold the hotkey)`, `Off (text only)`, `Per-pixel (alpha mask)`. **These are display labels, not stored values.** Never persist them.

Every enum is defined once, in `src/shared/enums.ts`, as a kebab-case value plus a label:

```ts
export const ACTIVATION_MODES = [
  { value: 'push-to-talk', label: 'Push-to-talk (hold the hotkey)' },
  { value: 'toggle',       label: 'Toggle (press to start, press to stop)' },
  { value: 'hands-free',   label: 'Hands-free (stops when you stop talking)' },
] as const;

export const activationModeSchema = z.enum(
  ACTIVATION_MODES.map(o => o.value) as [string, ...string[]]
);
```

Zod validates the **value**; the dropdown renders the **label**; config files and IPC payloads contain only values. The settings spec's option strings must match the `label` field exactly, in the listed order. This supersedes the settings spec's introductory note that its literals "must appear in the Zod enum."

---

## 1. Tech Stack (use exactly this unless blocked)

| Concern | Choice |
|---|---|
| Shell | Electron (latest stable), `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` |
| Language | TypeScript, strict mode, `noUncheckedIndexedAccess` |
| Build | Vite + `electron-vite`, packaged with `electron-builder` (NSIS target) |
| UI | React 18 + CSS Modules. No heavyweight UI kit. |
| State | Zustand in the renderer |
| Validation | Zod for **all** config and IPC payload schemas, on both sides of every channel |
| Secrets | Electron `safeStorage` — API keys encrypted at rest, never in plain JSON, never in renderer memory |
| Config | `electron-store` for non-secret settings |
| Markdown | `marked` + `DOMPurify` |
| Tests | Vitest (unit), Playwright `_electron` (smoke E2E) |
| Lint | ESLint + Prettier, `@typescript-eslint/strict` |

Node ≥ 20. **Primary target: Windows 10 (1903+) / Windows 11, x64 + arm64.** Code must not contain Windows-only APIs outside `src/main/platform/win32/`; other platforms may degrade (e.g. TTS falls back to `none`) but must not crash.

---

## 2. Repository Layout

```
companion/
  package.json
  electron.vite.config.ts
  electron-builder.yml
  src/
    main/
      index.ts                  # app lifecycle, single-instance lock
      windows/
        petWindow.ts            # transparent always-on-top sprite window
        settingsWindow.ts       # normal chrome window
      ipc/
        channels.ts             # shared channel name constants (SINGLE SOURCE OF TRUTH)
        handlers.ts             # registers all ipcMain handlers
        schemas.ts              # Zod schema per channel, request + response
      services/
        configStore.ts
        secretStore.ts
        spriteLoader.ts         # validate + copy sprite assets into userData
        alphaMask.ts            # per-pixel hit-test mask generation + cache
        clickThrough.ts         # dynamic setIgnoreMouseEvents management
        tray.ts
        hotkeys.ts
        attachments.ts          # clipboard/file/screenshot -> normalized image parts
        screenshot.ts           # region capture
      platform/
        win32/
          sapi.ts               # WinRT SpeechSynthesizer bridge
          displayScaling.ts     # per-monitor DPI helpers
      llm/
        types.ts                # LLMProvider interface + shared message types
        registry.ts
        providers/
          openaiCompatible.ts   # OpenAI, LM Studio, llama.cpp, vLLM, any Docker container
          anthropic.ts
          ollama.ts
        stream.ts               # SSE/NDJSON parsing helpers
        persona.ts              # buildSystemPrompt() - pure, no I/O
        personaVars.ts          # whitelist template-variable resolver
        greeting.ts             # launch-greeting scheduler
      tts/
        types.ts                # TTSProvider interface
        registry.ts
        sentenceChunker.ts      # split streaming text into synthesizable units
        markdownToSpeech.ts     # strip MD before synthesis
        providers/
          none.ts
          windowsSapi.ts
          openaiCompatibleTts.ts  # OpenAI /v1/audio/speech, Kokoro-FastAPI, LocalAI
          elevenLabs.ts
          customHttp.ts           # user-defined URL/headers/body template
      stt/
        types.ts                  # STTProvider interface
        registry.ts
        audioEncoder.ts           # Float32 PCM -> 16 kHz mono WAV / Opus
        vad.ts                    # energy + hangover silence detection
        punctuation.ts            # optional spoken-command -> punctuation mapping
        providers/
          none.ts
          windowsDictation.ts     # Windows.Media.SpeechRecognition (WinRT)
          openaiCompatibleStt.ts  # /v1/audio/transcriptions - Whisper, faster-whisper, LocalAI
          whisperLocal.ts         # spawn a local whisper.cpp / faster-whisper binary
          customHttpStt.ts        # user-defined multipart/JSON endpoint
    preload/
      index.ts                  # contextBridge API surface
    renderer/
      pet/
        App.tsx
        Sprite.tsx
        ChatBubble.tsx
        InputBar.tsx
        AttachmentTray.tsx
        MicIndicator.tsx        # level meter + listening affordance
        audio/
          AudioPlayer.ts        # chunked playback + AnalyserNode amplitude tap
          MicRecorder.ts        # getUserMedia capture, level metering, VAD tap
        store.ts
      settings/
        App.tsx
        panels/
          General.tsx
          Sprites.tsx
          Model.tsx
          Persona.tsx
          Voice.tsx
          VoiceInput.tsx
          Appearance.tsx
          Advanced.tsx
      shared/
        types.ts
  assets/
    default-sprites/{idle,thinking,speaking}.png
```

---

## 3. Sprite System

### 3.1 Accepted input formats

Support all three; the user picks per state in **Settings → Sprites**:

1. **Static image** — `.png`, `.webp`, `.gif`, `.apng`. GIF/APNG animate natively.
2. **Sprite sheet** — single image + metadata (`frameWidth`, `frameHeight`, `frameCount`, `fps`, optional `columns`, optional `loop`). Horizontal strip by default.
3. **Frame folder / multi-select** — N images played in natural-sort filename order at a given `fps`.

### 3.2 Sprite config schema

```ts
const SpriteStateConfig = z.object({
  mode: z.enum(['static', 'sheet', 'frames']),
  source: z.string(),                 // file name (static|sheet) or folder name (frames),
                                      // relative to userData/sprites/<state>/
  frameWidth: z.number().int().positive().optional(),
  frameHeight: z.number().int().positive().optional(),
  frameCount: z.number().int().positive().optional(),
  columns: z.number().int().positive().optional(),
  fps: z.number().positive().default(12),
  loop: z.boolean().default(true),
  anchor: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 1.0 }),
});

const MouthFrameConfig = z.object({
  enabled: z.boolean().default(false),
  source: z.string().optional(),      // sheet or folder of mouth frames
  frameWidth: z.number().int().positive().optional(),
  frameHeight: z.number().int().positive().optional(),
  // ordered quietest -> loudest; 2..8 frames
  frameCount: z.number().int().min(2).max(8).default(3),
  offset: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  sensitivity: z.number().min(0.1).max(5).default(1),
  smoothing: z.number().min(0).max(0.95).default(0.6),
});

const SpriteConfig = z.object({
  idle: SpriteStateConfig,
  thinking: SpriteStateConfig,
  speaking: SpriteStateConfig,
  mouth: MouthFrameConfig,
  scale: z.number().min(0.25).max(4).default(1),
  flipHorizontal: z.boolean().default(false),
  pixelated: z.enum(['auto', 'on', 'off']).default('auto'),
  listeningBehavior: z.enum(['use-idle', 'use-thinking', 'custom']).default('use-idle'),
  listening: SpriteStateConfig.optional(),   // only read when listeningBehavior === 'custom'
});
```

### 3.3 Import behavior

- Settings → Sprites exposes a **drop zone + file picker per state**, and a separate section for optional mouth frames.
- On import: validate magic bytes (not just extension), reject files > 25 MB, reject images > 8192 px on either axis, then **copy** into `app.getPath('userData')/sprites/<state>/`. Emit the resolved config back to the renderer.
- **Never load sprites directly from arbitrary user paths at runtime** — always copy first so the app survives the source file being moved or deleted.
- For sprite sheets, auto-detect `frameCount` when the user supplies `frameWidth` (`= imageWidth / frameWidth`), and render a **live preview with a frame scrubber and a play/pause toggle at the configured fps**.
- Provide a **"Reset this state to default"** button per state.
- Ship default sprites in `assets/default-sprites/` so the app is fully usable on first launch with zero configuration.
- Export/import the whole sprite set as a `.zip` ("Sprite Pack") containing the three state assets, optional mouth frames, and a `pack.json` manifest. Validate the manifest with Zod on import; reject zip entries with `..` or absolute paths (zip-slip).

### 3.4 Rendering

- Render into a `<canvas>` sized `frameWidth * scale × frameHeight * scale`. `imageRendering: pixelated` when `pixelated === 'on'`, or when `'auto'` and the source frame is ≤ 128 px on its longest axis.
- Drive animation with `requestAnimationFrame` + an accumulator clock so playback respects `fps` independent of display refresh rate. **Pause the loop when the window is hidden or `document.hidden` is true.**
- Preload and decode all states' frames at startup via `createImageBitmap` so state transitions have zero hitch.
- Re-decode on DPI change; the pet window must stay crisp when dragged between monitors with different scaling (`display-metrics-changed`).

### 3.5 State machine

```
idle ──(user submits prompt)──▶ thinking
idle ──(mic activated)──▶ listening
listening ──(transcript committed + auto-send)──▶ thinking
listening ──(transcript committed, no auto-send)──▶ idle   (text sits in the input box)
listening ──(cancel / Esc / no speech)──▶ idle
thinking ──(first token OR first audio chunk)──▶ speaking
speaking ──(stream complete AND audio drained AND dwell elapsed)──▶ idle
speaking ──(mic activated, barge-in)──▶ listening          (aborts stream + audio)
any ──(error)──▶ idle            (bubble shows the error text)
any ──(user cancels / Esc)──▶ idle
```

- **`listening` does not require a fourth sprite.** It resolves to an animation via `SpriteConfig.listeningBehavior`: `'use-idle'` (default), `'use-thinking'`, or `'custom'`. Only `'custom'` reads a fourth asset, and it is strictly optional — the user contract remains three sprites. In all cases a `MicIndicator` overlay renders at the sprite's anchor.
- Transcription that happens *after* the mic stops (batch providers) runs in `thinking` with the bubble showing an interim `Transcribing…` row, **not** a separate state.
- `idle` **loops its animation indefinitely**. No random blink scheduling, no idle variants, no wandering, no proactive messages. This is deliberate — do not add them.
- `speaking` end condition depends on TTS (see §8.4). With TTS off it is `streamComplete && dwellElapsed`. With TTS on it is `streamComplete && audioQueueEmpty && dwellElapsed`.
- `bubbleDwellMs` default 4000, configurable 0–30000, plus a **"keep bubble open until dismissed"** toggle.
- If a non-looping animation finishes while its state is still active, **hold the final frame**.
- Expose a dev-only state override dropdown when `NODE_ENV === 'development'` for testing art.

### 3.6 Mouth sync (only when TTS is enabled)

- When `mouth.enabled` and a TTS provider other than `none` is active, the `speaking` state composites a mouth frame on top of the base speaking animation at `mouth.offset`.
- Frame selection is **amplitude-driven**: `AudioPlayer` exposes a normalized RMS level (0–1) per animation frame from a WebAudio `AnalyserNode`. Apply exponential smoothing with `mouth.smoothing`, multiply by `mouth.sensitivity`, clamp, then quantize into `mouth.frameCount` buckets (index 0 = closed).
- This is provider-agnostic by design — it works identically with local and cloud TTS and can never desync, because it reads the audio actually being played.
- When TTS is off or `mouth.enabled` is false, the speaking animation plays normally with no compositing.

---

## 4. Chat Bubble

### 4.1 Config

```ts
const BubbleConfig = z.object({
  scale: z.number().min(0.5).max(3).default(1),      // multiplies base width, max height, font
  baseWidthPx: z.number().default(320),
  maxHeightPx: z.number().default(240),
  position: z.enum(['top','top-left','top-right','left','right']).default('top-right'),
  fontFamily: z.string().default('system-ui'),
  fontSizePx: z.number().default(14),
  cornerRadiusPx: z.number().default(12),
  backgroundColor: z.string().default('#1e1e1eF2'), // 8-digit hex w/ alpha
  textColor: z.string().default('#f5f5f5'),
  showTail: z.boolean().default(true),
  typewriter: z.boolean().default(true),
  typewriterCps: z.number().default(45),
  dwellMs: z.number().min(0).max(30000).default(4000),
  keepOpenUntilDismissed: z.boolean().default(false),
});
```

Effective width = `baseWidthPx * scale`; effective max height = `maxHeightPx * scale`; effective font size = `fontSizePx * scale`.

### 4.2 Sizing and scrolling

- Anchored to the sprite at `position`, with **automatic flip** when the bubble would leave the current display's work area (use `screen.getDisplayMatching`, respect taskbar).
- **Content shorter than max height:** bubble shrinks to fit (height is content-driven, up to the max).
- **Content longer than max height:** bubble caps at max height and the text area becomes **vertically scrollable** (`overflow-y: auto`) with a thin custom overlay scrollbar that reserves no layout width. Do **not** use `scrollbar-gutter: stable`.
- **Auto-scroll** to bottom as tokens stream in — but if the user has manually scrolled more than 24 px up from the bottom, **suspend auto-scroll** and show a "↓ new" affordance; resume when they return to the bottom.
- Mouse wheel over the bubble scrolls the bubble and must **not** pass through to the window beneath.
- The bubble must remain scrollable after the stream completes and during the dwell timer; hovering the bubble **pauses the dwell timer**.

### 4.3 Content rendering

- Render assistant output as **sanitized Markdown** (`marked` → `DOMPurify`): bold, italic, inline code, fenced code blocks, ordered/unordered lists, blockquotes, links, headings.
- Links open in the system browser via `shell.openExternal`, never in-app. Allow only `http`/`https`/`mailto`.
- Fenced code blocks get a copy button and horizontal scroll (never wrap).
- Images in model output are rendered inline, capped to the bubble content width.
- A small footer row shows: token/char count (optional), a copy-reply button, a regenerate button, and a stop button while streaming.

---

## 5. Windows / Always-On-Top Behavior

### 5.1 Pet window

```ts
new BrowserWindow({
  frame: false,
  transparent: true,
  backgroundColor: '#00000000',
  resizable: false,
  skipTaskbar: true,
  hasShadow: false,
  alwaysOnTop: true,
  fullscreenable: false,
  webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
});
win.setAlwaysOnTop(true, 'screen-saver');
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
```

- Window size = sprite bounds + bubble reservation, recomputed whenever `SpriteConfig.scale` or `BubbleConfig.scale` changes. Never larger than necessary.
- **Do not** enable `transparent: true` together with `resizable: true` — it's broken on Windows.
- Persist window position per display ID; on startup, clamp into the nearest visible work area (handles unplugged monitors).

### 5.2 Click-through via alpha-mask hit testing

This is the highest-risk component. Implement it exactly as follows:

- At sprite load time, in **main**, generate a `Uint8Array` alpha mask per frame (or per first frame + a union mask across all frames — union is acceptable and cheaper) at source resolution. Cache to memory and to `userData/cache/masks/`.
- In the **renderer**, on `mousemove` over the pet window, map cursor → sprite-local pixel (accounting for `scale`, `flipHorizontal`, DPI) and look up the cached mask. Threshold alpha > 10.
- Call `setIgnoreMouseEvents(true, { forward: true })` when the cursor is over a transparent pixel **and** not over the bubble or input bar; `setIgnoreMouseEvents(false)` otherwise.
- **Never** sample with `getImageData` per mousemove — precompute the mask.
- Debounce transitions by 1 frame to avoid flapping on sprite edges.
- Provide a **"Click-through: always off"** escape hatch in Settings → Advanced for users on hardware/driver combos where this misbehaves.

### 5.3 Interaction

| Action | Result |
|---|---|
| Left click sprite | Toggle input bar open/closed |
| Left drag sprite | Move the companion (snap to screen edges within 12 px) |
| Right click sprite | Context menu: Chat, Settings, Toggle click-through, Hide, Quit |
| `Esc` | Cancel stream + stop audio + stop mic capture + close input bar |
| Mic button on input bar | Start/stop voice input (hidden when STT provider is `none`) |
| Voice-input hotkey (default `Ctrl+Shift+V`) | Push-to-talk / toggle per §10.5 |
| `Enter` | Submit |
| `Shift+Enter` | Newline |
| Global hotkey (default `Ctrl+Shift+Space`) | Focus input bar from anywhere; configurable, must handle registration failure gracefully |
| Tray icon | Show/hide companion, Settings, Quit |

- Single-instance lock: a second launch focuses the existing companion instead of spawning a duplicate.
- Launch-on-login toggle via `app.setLoginItemSettings` (Settings → General).

---

## 6. LLM Backend

### 6.1 Provider interface

```ts
export interface LLMProvider {
  id: string;
  supportsImages: boolean;
  listModels?(): Promise<ModelInfo[]>;
  chat(
    messages: ChatMessage[],
    opts: { signal: AbortSignal; model: string; temperature?: number; maxTokens?: number; systemPrompt?: string }
  ): AsyncIterable<ChatDelta>;   // { type: 'text', text } | { type: 'error', message } | { type: 'done', usage? }
}
```

### 6.2 Implementations

| id | Covers |
|---|---|
| `openai-compatible` | OpenAI, LM Studio, llama.cpp server, vLLM, LocalAI, **any Docker container exposing `/v1/chat/completions`** |
| `anthropic` | Claude (`/v1/messages`, SSE) |
| `ollama` | Ollama native `/api/chat` (NDJSON, not SSE) |

Config per provider: `baseUrl`, `apiKey` (optional — local endpoints usually need none), `model`, `temperature`, `maxTokens`, `systemPrompt`, `timeoutMs`, `customHeaders`.

### 6.3 Rules

- **All network calls happen in main.** The renderer never sees an API key and never issues a request. Stream deltas to the renderer over a dedicated IPC channel keyed by a `requestId`.
- Every request carries an `AbortController`; `Esc`, a new prompt, or window close aborts it.
- **"Test connection"** button per provider in Settings → Model: performs a 1-token round trip and reports latency, model name, and a clear error (DNS / refused / 401 / 404 / timeout) — do not surface raw stack traces.
- Conversation history is kept in memory with a configurable turn cap (default 10 turns) and a **"Clear conversation"** action. Optional persistence to disk is off by default.
- Retry once on connection reset; never retry on 4xx.

### 6.4 Persona system

The system prompt field (control 67) alone is **not** sufficient for "my sprite has a character." It is a single opaque textarea with no structure, no greeting, no library, no link to the sprite assets, and its own default text actively fights a persona. §6.4 adds a structured persona layer on top of it.

**Two distinct mechanisms — do not conflate them:**

| Mechanism | When it runs | Cost |
|---|---|---|
| **Persona block** | Composed into the system prompt on **every** request | Fixed token overhead per turn |
| **Greeting** | A single opening line shown when the sprite appears | One optional call, or zero if static |

#### 6.4.1 Default-prompt conflict (resolve before implementing)

The shipped `Helpful companion` preset ends with *"Do not describe your own appearance or actions."* That line directly contradicts a persona. **When `persona.enabled` is true and the active preset is `Helpful companion`, auto-switch control 68 to a new preset `Persona-driven`**, which is identical minus that sentence:

```
You are a desktop companion. Keep replies brief and conversational —
usually one to three sentences. Use Markdown only when it genuinely helps.
```

Show a one-time inline note: *Your system prompt told the assistant not to describe itself. Switched to the persona-friendly preset.* Never edit a `Custom` prompt silently — in that case show the note with a `Fix it for me` button and leave the text alone.

#### 6.4.2 Config schema

```ts
const PersonaCard = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(48).default('Companion'),           // 238
  pronouns: z.string().max(32).default(''),                        // 239/240
  description: z.string().max(4000).default(''),                   // 241
  speechStyle: z.string().max(1000).default(''),                   // 242
  exampleDialogue: z.array(z.object({
    user: z.string().max(500),
    assistant: z.string().max(500),
  })).max(8).default([]),                                          // 244
  userNotes: z.string().max(1000).default(''),                     // 245
  userName: z.string().max(64).default(''),                        // 246
  replyLength: z.enum(['none','one-two','paragraph','unbounded']).default('one-two'), // 248
  characterBreak: z.enum(['always','technical','none']).default('technical'),         // 249
  allowRoleplayActions: z.boolean().default(false),                // 250
  voiceOverride: z.string().optional(),                            // 260
  spritePackId: z.string().optional(),   // set when the card arrived inside a Sprite Pack
});

const PersonaConfig = z.object({
  enabled: z.boolean().default(false),                             // 236
  activeId: z.string().uuid().nullable().default(null),            // 237
  library: z.array(PersonaCard).max(50).default([]),
  injection: z.enum(['after','replace','before']).default('after'),// 247
  greeting: z.object({
    mode: z.enum(['off','static','generated']).default('off'),     // 254
    text: z.string().max(500).default(''),                         // 255
    prompt: z.string().max(500).default('Greet me in one short sentence.'), // 256
    frequency: z.enum(['per-launch','per-show','daily']).default('per-launch'), // 257
    delayMs: z.number().min(0).max(30000).default(3000),           // 258
    speak: z.boolean().default(true),                              // 259
  }).default({}),
  packPersonaPolicy: z.enum(['ask','auto','ignore']).default('ask'),// 266
  onSwitch: z.enum(['new-conversation','keep','ask']).default('new-conversation'), // 267
});
```

`PersonaConfig` is a **top-level config section** (§17.1 per-section fallback applies to it independently). It is not nested inside `LLMConfig` — personas survive a provider change.

#### 6.4.3 Prompt assembly (deterministic, one pure function)

`buildSystemPrompt(cfg): { text: string; estimatedTokens: number }` in `src/main/llm/persona.ts`. It is **pure, synchronous, and unit-tested against golden strings** — no provider access, no I/O. Assembly order:

1. Base system prompt (control 67) — omitted entirely when `injection === 'replace'`.
2. Persona block, wrapped in stable delimiters so it is visually separable in the preview:

```
# Character
You are {{persona.name}}{{, pronouns}}.
{{description}}

## How you speak
{{speechStyle}}
{{replyLength clause}}
{{characterBreak clause}}
{{roleplay clause}}

## About the person you're talking to
{{userNotes}}        ← omitted when empty
```

3. Example dialogue — emitted as **real alternating `user`/`assistant` messages placed before the live history**, not as text inside the system prompt. Few-shot works considerably better as actual turns, and it keeps the system block readable in the preview. Mark them so they are **exempt from history trimming** (§17.5) and excluded from the conversation that control 76 persists.
4. Conversation history (per `contextMode`).
5. Current user turn.

When `injection === 'before'`, swap steps 1 and 2. Blank sections emit nothing — never a header with empty content, never the literal string `undefined`.

**Clause text** (fixed strings, not model-authored):

| Field | Value | Emitted clause |
|---|---|---|
| `replyLength` | `one-two` | `Keep replies to one or two sentences unless asked for more.` |
| | `paragraph` | `Keep replies to a short paragraph at most.` |
| | `unbounded` | *(nothing)* |
| `characterBreak` | `always` | `Stay in character at all times.` |
| | `technical` | `Stay in character, but drop the voice when answering technical or factual questions accurately matters more.` |
| `allowRoleplayActions` | `true` | `You may include short physical actions in asterisks, e.g. *tilts head*.` |
| | `false` | `Do not write physical actions or stage directions.` |

#### 6.4.4 Template variables

Resolved by a **whitelist resolver** — a `Record<string, () => string>` lookup. Never `eval`, never a template engine, never user-supplied code paths.

| Variable | Resolves to |
|---|---|
| `{{persona.name}}` | Active card's name |
| `{{user.name}}` | `userName`, or `there` when empty |
| `{{date}}` / `{{time}}` | Local date / 12-hour time at request time |
| `{{weekday}}` | e.g. `Wednesday` |
| `{{app.state}}` | `idle` \| `thinking` \| `speaking` \| `listening` |

Unknown `{{...}}` is left **literal** and surfaced in Settings as an amber inline warning listing the unrecognized names. Do not silently delete it — a user who typed `{{persnoa.name}}` needs to see the typo. Variables are resolved in `description`, `speechStyle`, `greeting.text`, and `greeting.prompt` only.

#### 6.4.5 Provider mapping (a real gotcha — get this right)

The assembled system text goes to a different place in each provider:

| Provider | Destination |
|---|---|
| `openai-compatible` | First message, `role: 'system'`. For OpenAI models that require it, `role: 'developer'` — probe once and cache per base URL. |
| `anthropic` | Top-level `system` parameter, **not** a message. Putting it in `messages` is an API error. |
| `ollama` | `messages[0].role === 'system'`; do **not** also set the modelfile `system` field — the two compound. |

Example-dialogue turns are ordinary `messages` entries in all three.

#### 6.4.6 Greeting behavior

- `off` (default) — nothing happens on launch. Fresh installs stay silent and cost nothing.
- `static` — the bubble shows `greeting.text` as an assistant message. **No API call, no token cost, instant.** This is the recommended mode and the one the UI should nudge toward.
- `generated` — one real request using `greeting.prompt`, with the full persona block. Runs through the normal `thinking → speaking` path.

Rules:
- Fires after `greeting.delayMs` from sprite visibility, debounced — show/hide/show does not fire twice within the frequency window.
- `per-launch` fires once per process. `daily` keys off local date, persisted. `per-show` fires on each show→hide→show cycle.
- **Never fires while the user is typing**, and never interrupts an in-flight turn. If either is true, drop it for this cycle rather than queueing.
- The greeting **is** part of conversation history (the model should remember it said hello). Example-dialogue turns are not.
- `generated` mode failing is silent — log it, show nothing. A failed hello must not greet the user with an error dialog.
- Speaking the greeting respects `greeting.speak`, global mute, and TTS provider `none`.

#### 6.4.7 Persona library, packs, and switching

- Up to 50 cards. Import/export a single card as `.persona.json` (the `PersonaCard` schema plus `schemaVersion`), Zod-validated on import; reject anything over 64 KB.
- **`pack.json` gains an optional `persona` key** (§3.3). On Sprite Pack import, behavior follows `packPersonaPolicy`: `ask` (default) shows a diff — *This pack includes a persona named "Mira". Apply it?* with `Apply` / `Import but don't activate` / `Skip`. `auto` applies silently. `ignore` strips it.
- A bundled persona may carry `voiceOverride`. **Never apply a voice override without explicit consent**, even under `auto` — voice is a separate, louder surprise than text. Surface it as its own checkbox in the import dialog.
- Switching the active persona mid-conversation follows `onSwitch`, default `new-conversation`. History written in another character's voice poisons the new one; keeping it must be a deliberate choice.
- Deleting the active card sets `activeId = null` and `enabled = false`. Never leave a dangling id.
- Export of full settings (control 174) includes the persona library. It contains no secrets, so no redaction is needed — but `userNotes` and `userName` are personal, so the export dialog must say so.

#### 6.4.8 Limits, cost, and honesty

- Hard cap on the **assembled** system string: **16,000 characters**. Above 8,000, Settings shows an amber warning with the live token estimate. Above 16,000, the request is refused with `CONTEXT_LENGTH_EXCEEDED` and an `Open Settings` action — do not silently truncate a persona, which produces baffling half-character behavior.
- Persona tokens are **reserved before history trimming** (§17.5): budget = `tokenBudget − systemTokens − exampleDialogueTokens − maxResponseTokens`. If that is ≤ 0, trim to zero history and warn; never trim the persona itself.
- Settings shows a live `Persona adds ~N tokens to every message` readout (control 251) using the §17.5 estimator, labeled approximate.
- **The persona is not a security or safety boundary.** It is a styling instruction a model may ignore or a user may talk it out of. Do not document it as a filter, do not build features that depend on it holding, and do not add a "jailbreak protection" toggle.

#### 6.4.9 Testing

- `buildSystemPrompt` golden-string tests: all three injection modes, empty optional fields, every clause combination, unknown variable left literal.
- Example dialogue survives trimming at a token budget small enough to drop all real history.
- Anthropic path asserts `system` is top-level and absent from `messages`.
- Persona switch with `new-conversation` clears history; with `keep` it does not.
- Greeting: fires once under `per-launch` across two show/hide cycles; does not fire while the input box has focus; `generated` failure produces no visible UI.
- Sprite Pack with a bundled persona under each of the three policies.

---

## 7. Settings Window

A normal (non-transparent, resizable) window, opened from the tray or the sprite context menu. **Eight panels** (Voice Input added in v3, Persona in v5):

1. **General** — launch on login, global hotkey, click-through override, conversation turn cap, clear conversation, reset all settings.
2. **Sprites** — per-state import (drop zone + picker), mode selector, sheet metadata fields, live preview w/ scrubber, scale, flip, pixelated mode, mouth-frame section, Sprite Pack import/export, reset-to-default.
3. **Model** — provider dropdown, base URL, API key (masked, write-only), model picker (populated by `listModels` when available), temperature, max tokens, system prompt, test connection.
4. **Persona** — see §6.4. Enable toggle, card library, identity/description/speech-style fields, example dialogue, behavior clauses, injection mode, live assembled-prompt preview with token estimate, greeting section, import/export.
5. **Voice** (output / TTS) — see §8.6.
6. **Voice Input** (STT) — provider, activation mode, input device + live level meter, language, auto-send, VAD tuning, transcript post-processing, mic test. Collapses to a single dropdown when provider is `none`, same pattern as Voice.
7. **Appearance** — every field of `BubbleConfig`, with a **live preview bubble** that updates as the user drags sliders.
8. **Advanced** — log level, open logs folder, open userData folder, hardware acceleration toggle, export/import full config as JSON (**secrets excluded**).

All settings apply **immediately** — no Save button, no restart. Each panel has a per-panel "Reset to defaults".

---

## 8. Text-to-Speech (modular, OFF by default)

### 8.1 Design rules (non-negotiable)

- **`none` is the default provider.** A fresh install is silent. The app must be fully functional and shippable with TTS never enabled.
- TTS is a **strictly optional layer**. No TTS code may be imported on a hot path when `provider === 'none'`; no audio graph is constructed, no permissions requested, no models downloaded.
- Providers are **swappable at runtime** without restart. Switching providers mid-stream stops current audio cleanly.
- **Local and remote are equal citizens.** A user must be able to point the app at `http://localhost:8880` (Kokoro in Docker) and get voice with no API key, no account, and no outbound network traffic.
- A **`custom-http`** provider exists specifically so a user can wire up an engine we've never heard of without forking the app.

### 8.2 Provider interface

```ts
export interface TTSProvider {
  id: string;
  requiresApiKey: boolean;
  listVoices(): Promise<VoiceInfo[]>;              // [] if not enumerable
  synthesize(
    text: string,
    opts: { signal: AbortSignal; voice: string; speed: number; format: 'mp3' | 'wav' | 'pcm16' }
  ): AsyncIterable<Uint8Array>;                     // audio chunks, streamed where supported
  dispose(): void;
}
```

Non-streaming engines return a single chunk; the player handles both identically.

### 8.3 Implementations

| id | Backend | Key? | Notes |
|---|---|---|---|
| `none` | — | — | **Default.** No-op; `synthesize` yields nothing. |
| `windows-sapi` | `Windows.Media.SpeechSynthesis` (WinRT) | No | Zero-config, offline, built into the OS. Low quality but always available. Enumerate installed system voices. Windows only — hide on other platforms. |
| `openai-compatible-tts` | `POST {baseUrl}/v1/audio/speech` | Optional | **Covers OpenAI's hosted TTS *and* Kokoro-FastAPI / LocalAI / any self-hosted container in Docker.** Config: `baseUrl`, optional `apiKey`, `model`, `voice`, `speed`, `format`. This is the recommended local path. |
| `elevenlabs` | ElevenLabs streaming TTS | Yes | Quality/character-voice option. Expose `voiceId`, `modelId`, stability/similarity. |
| `custom-http` | User-defined | Optional | User supplies method, URL, headers (JSON), and a body template with `{{text}}`, `{{voice}}`, `{{speed}}` placeholders; plus a response mode (`binary` \| `sse-base64` \| `json-path`). Validate with Zod; never `eval` the template. |

Document in-app (Voice panel help text) that `openai-compatible-tts` + a locally running Kokoro container is the free, offline, no-key configuration, and give the exact base URL field example.

### 8.4 Pipeline

1. LLM text deltas arrive in main.
2. `markdownToSpeech` strips Markdown for the **speech copy only** — remove fenced code blocks entirely (unless `readCodeBlocks` is on), drop list markers and heading hashes, convert `[label](url)` → `label`, strip emphasis markers, collapse whitespace. **The bubble still renders full Markdown; these are two separate pipelines from the same source text.**
3. `sentenceChunker` buffers until a sentence boundary (`.!?` + whitespace, or ~200 chars, or stream end). **Synthesize sentence *n* while the LLM is still generating sentence *n+1*** — this is what makes audio start fast enough.
4. Audio chunks stream to the renderer over IPC; `AudioPlayer` queues and plays them gaplessly through a WebAudio graph: `source → GainNode → AnalyserNode → destination`.
5. `AnalyserNode` feeds the mouth-sync amplitude signal (§3.6).
6. State leaves `speaking` only when the LLM stream is complete **and** the audio queue has drained **and** the dwell timer has elapsed.

### 8.5 Control behavior

- **Barge-in / interrupt:** submitting a new prompt while the companion is speaking immediately aborts the LLM stream, aborts in-flight synthesis, and flushes the audio queue. Do not let the current sentence finish.
- **Esc** does the same and returns to `idle`.
- **Mute toggle** in the tray menu and as a small speaker icon on the bubble — mutes audio without changing the configured provider.
- Independent **TTS volume** slider, separate from system volume.
- **Output device picker** (`enumerateDevices` → `setSinkId`), defaulting to system default, with graceful fallback if the device disappears.
- If synthesis fails (network error, 401, container down), log it, show a non-blocking toast in the bubble footer, and **continue with text-only output**. A TTS failure must never block or truncate the model's reply.

### 8.6 Voice panel (Settings)

- Provider dropdown (`none` selected on a fresh install).
- Provider-specific fields rendered conditionally; base URL + optional API key + model/voice for the HTTP ones.
- Voice dropdown populated by `listVoices()`, with a **"Preview voice"** button that speaks a fixed sample sentence.
- Speed (0.5–2.0), volume (0–100), output device.
- **"Read code blocks aloud"** toggle — **default off**.
- **"Mouth sync"** toggle + link to the Sprites panel mouth-frame section; disabled with an explanatory tooltip when provider is `none`.
- "Test voice" button reporting time-to-first-audio and any error in plain language.

### 8.7 Config schema

```ts
const TTSConfig = z.object({
  provider: z.enum(['none','windows-sapi','openai-compatible-tts','elevenlabs','custom-http']).default('none'),
  voice: z.string().default(''),
  speed: z.number().min(0.5).max(2).default(1),
  volume: z.number().min(0).max(1).default(0.8),
  muted: z.boolean().default(false),
  outputDeviceId: z.string().default('default'),
  readCodeBlocks: z.boolean().default(false),
  mouthSync: z.boolean().default(false),
  baseUrl: z.string().url().optional(),
  model: z.string().optional(),
  format: z.enum(['mp3','wav','pcm16']).default('mp3'),
  custom: z.object({
    method: z.enum(['POST','GET']).default('POST'),
    url: z.string().url(),
    headers: z.record(z.string()).default({}),
    bodyTemplate: z.string(),
    responseMode: z.enum(['binary','sse-base64','json-path']).default('binary'),
    jsonPath: z.string().optional(),
  }).optional(),
});
```

API keys live in `safeStorage`, never in this object.

---

## 9. Multimodal Input

### 9.1 Sources

1. **Clipboard image** — `Ctrl+V` in the input bar attaches the clipboard bitmap.
2. **File attach** — paperclip button + drag-and-drop onto the input bar. Accept `.png`, `.jpg/.jpeg`, `.webp`, `.gif` (first frame only).
3. **Region screenshot** — a dedicated global hotkey (default `Ctrl+Shift+S`) dims the screen, lets the user drag a region, and attaches the capture. Use `desktopCapturer` with a full-screen overlay window for the selection UI.

### 9.2 Handling

- Attachments render as thumbnails in an `AttachmentTray` above the input bar, each with a remove button. Max 4 per message, max 10 MB each **before** downscale.
- Downscale any image whose longest edge exceeds 1568 px, preserving aspect ratio, re-encode as PNG (or JPEG q85 if the source was JPEG). Do this in main.
- Encode as base64 and attach to the message as a content part:
  - `openai-compatible` → `{ type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }`
  - `anthropic` → `{ type: 'image', source: { type: 'base64', media_type, data } }`
  - `ollama` → top-level `images: [base64]` array
- **Gate on capability:** if `provider.supportsImages === false` or the selected model is text-only, disable the attach button and show a tooltip explaining why. Never silently drop an attachment.
- The user's message in the bubble/history shows its thumbnails.
- Strip EXIF on import. Never send attachments anywhere except the configured LLM endpoint.

---

## 10. Speech-to-Text / Voice Input (modular, OFF by default)

### 10.1 Design rules (non-negotiable)

- **`none` is the default provider.** A fresh install never touches the microphone. No `getUserMedia` call, no `MediaStream`, no permission prompt, no audio graph until the user explicitly enables STT **and** explicitly activates the mic.
- **The microphone is never open passively.** There is no always-listening mode and no wake word in v1. Capture begins on an explicit user action (hotkey, mic button) and ends on an explicit action, a silence timeout, or the max-duration cap.
- **Local and remote are equal citizens.** A user must be able to point at `http://localhost:9000/v1` (Whisper in Docker) or a bundled `whisper.cpp` binary and get transcription with no API key and zero outbound traffic.
- **STT output is text, nothing more.** A transcript lands in the input box exactly as if typed. It is never auto-sent unless the user opted into auto-send. The user can always edit before sending.
- **A `custom-http` provider exists** so a user can wire an engine we've never heard of without forking.
- **STT failure never blocks typing.** On error, surface a toast, leave the input box focused and editable, keep any partial transcript.

### 10.2 Provider interface

```ts
export interface STTProvider {
  id: string;
  requiresApiKey: boolean;
  /** true = accepts a live audio stream and emits partials; false = batch, one final result */
  streaming: boolean;
  listLanguages?(): Promise<LanguageInfo[]>;

  /** Streaming providers. Caller pushes PCM; provider yields results. */
  transcribeStream?(
    audio: AsyncIterable<Int16Array>,          // 16 kHz mono PCM16
    opts: { signal: AbortSignal; language: string | 'auto'; prompt?: string }
  ): AsyncIterable<STTResult>;

  /** Batch providers. Caller supplies a complete encoded clip. */
  transcribe?(
    clip: Uint8Array,
    opts: { signal: AbortSignal; mimeType: string; language: string | 'auto'; prompt?: string }
  ): Promise<STTResult>;

  dispose(): void;
}

export type STTResult = {
  text: string;
  isFinal: boolean;
  confidence?: number;        // 0..1 when the engine reports it
  durationMs?: number;
  language?: string;
};
```

A provider implements **exactly one** of `transcribeStream` / `transcribe`. The `SttSession` orchestrator in main normalizes both into the same renderer-facing event stream (`partial` → `partial` → … → `final`), so **the UI never branches on provider type**. Batch providers simply emit zero partials.

### 10.3 Implementations

| id | Backend | Key? | Streaming | Notes |
|---|---|---|---|---|
| `none` | — | — | — | **Default.** Mic button hidden, hotkeys unregistered, no media code loaded. |
| `windows-dictation` | `Windows.Media.SpeechRecognition` (WinRT) | No | Yes | Zero-config, offline, built into Windows. Emits live partial hypotheses. Accuracy is mediocre vs Whisper but it is the only option that works with no download and no container. Windows-only — hide elsewhere. |
| `openai-compatible-stt` | `POST {baseUrl}/v1/audio/transcriptions`, `multipart/form-data` | Optional | No (batch) | **Covers OpenAI Whisper *and* `onerahmet/openai-whisper-asr-webservice`, faster-whisper-server, LocalAI, and any Docker container exposing the OpenAI transcription shape.** This is the recommended local path. Config: `baseUrl`, optional `apiKey`, `model`, `language`, `prompt`, `temperature`. |
| `whisper-local` | Spawn a user-supplied `whisper.cpp` / `faster-whisper` executable | No | No (batch) | For users who want zero containers. Config: executable path, model file path, extra CLI args, output parse mode (`json` \| `txt`). **Validate the path, never pass user text through a shell — use `execFile` with an argv array, never `exec` with string interpolation.** |
| `custom-http` | User-defined | Optional | No (batch) | User supplies method, URL, headers, upload mode (`multipart-file` \| `raw-body` \| `json-base64`), the field name for the audio part, and a JSON path to the transcript. Validate with Zod; never `eval`. |

Document in the Voice Input panel help text that `openai-compatible-stt` + a local Whisper container is the free, offline, no-key configuration, with the exact base URL to paste.

### 10.4 Capture pipeline

1. **Activation** (see §10.5) opens the mic: `navigator.mediaDevices.getUserMedia({ audio: { deviceId, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`. Request **only** on first activation, not at app start.
2. `MicRecorder` runs an `AudioWorklet` (not the deprecated `ScriptProcessorNode`) that:
   - downmixes to mono and resamples to **16 kHz** — the input rate every STT engine here expects;
   - emits 20 ms Int16 frames to the session;
   - computes per-frame RMS for the level meter and VAD.
3. **VAD** (`vad.ts`): energy threshold with a configurable floor, 300 ms of speech to trigger onset, and a **hangover** period of silence (default 900 ms) to trigger end-of-utterance. Hangover is what prevents cutting the user off mid-pause; do not use a bare instantaneous threshold.
4. **Streaming providers** receive frames live and emit partials; partials render into the input box as **greyed, italic, uncommitted text** that is replaced wholesale by the final result.
5. **Batch providers** buffer frames into a ring buffer, and on stop, `audioEncoder` writes a 16 kHz mono WAV (or Opus if the provider prefers it) and posts it in one request. State is `thinking` with a `Transcribing…` indicator during the round trip.
6. **Hard caps:** max utterance 120 s (configurable 5–300), max buffered audio 32 MB. On cap, auto-stop and transcribe what exists rather than discarding.
7. **Audio is never written to disk** unless Developer Mode → `Save last recording for debugging` is explicitly on. The ring buffer is zeroed on release.
8. Release the `MediaStream` tracks (`track.stop()`) on every session end — do **not** hold the mic open between utterances. Holding it keeps the OS mic indicator lit and users will read that as spyware.

### 10.5 Activation modes

Configurable, default **Push-to-talk**:

| Mode | Behavior |
|---|---|
| `Push-to-talk` | Hold the hotkey (default `Ctrl + Shift + V`) to record; release to stop and transcribe. |
| `Toggle` | Press to start, press again to stop. Also bound to the mic button. |
| `Hands-free` | Press once; VAD auto-stops on end-of-utterance silence. |

> **Known Electron limitation — implement the fix, do not skip it.** `globalShortcut` fires only on key**down** and gives no keyup event, so true push-to-talk cannot be built from `globalShortcut` alone. Implement PTT as follows: register the chord with `globalShortcut` to **start** capture, then poll for release. On Windows use a low-level keyboard hook via a native helper (`node-global-key-listener` or a small N-API addon) to get the real keyup. If the hook cannot be installed, **degrade gracefully to `Toggle` mode, tell the user once in a toast, and flip the setting** — never leave the mic stuck open. A hard 120 s watchdog force-stops capture regardless of mode.

- While the pet window has focus, PTT additionally works off plain renderer `keydown`/`keyup`, which is reliable; the native hook is only needed for global (unfocused) PTT.
- `Esc` always cancels capture and discards the in-flight transcript.

### 10.6 Transcript handling

- Final transcript is **inserted at the caret** in the input box, appended to existing text with a single space if the box is non-empty. It never clobbers typed text.
- **Auto-send** (`Send immediately after transcription`, default **off**) submits as soon as the final result arrives. When on, show a configurable 0–5 s countdown chip with a **Cancel** button so a misfire is recoverable.
- Optional post-processing, each independently toggleable:
  - **Spoken punctuation** — `punctuation.ts` maps `"period"`, `"comma"`, `"question mark"`, `"new line"`, `"new paragraph"` to characters. Default **off**; Whisper already punctuates and double-processing produces `.."`.
  - **Trim filler words** (`um`, `uh`, `er`, `like` as standalone tokens). Default off.
  - **Capitalize first letter / ensure terminal punctuation.** Default on.
- Discard empty or whitespace-only transcripts silently. Discard results below a confidence floor (default 0, i.e. disabled) with a toast.
- Keep the **last 5 transcripts** in memory for a `Re-insert last transcript` action. Never persisted.

### 10.7 Interaction with TTS (echo suppression)

This is the part that breaks if unspecified:

- When TTS is playing and the mic activates, **abort the LLM stream and flush the audio queue first**, then begin capture. This is the existing barge-in path from §8.5 — reuse it, do not duplicate.
- If `Hands-free` is active while TTS is playing, the companion would otherwise transcribe its own voice. Mitigate with, in priority order: (1) hard-gate the VAD closed while `audioQueueDepth > 0`; (2) rely on `echoCancellation: true` in the capture constraints; (3) expose `Pause listening while the companion is speaking` (default **On**).
- Never feed the TTS output device's loopback into capture. If the user selects a monitor/loopback device as the mic input, show a warning.

### 10.8 Permissions & privacy

- Handle `setPermissionRequestHandler` in main: allow `media` **only** for the pet window and **only** when `stt.provider !== 'none'`. Deny otherwise.
- `NotAllowedError` → a clear, actionable panel message with a button that opens `ms-settings:privacy-microphone`. Do not retry in a loop.
- `NotFoundError` / device unplugged mid-capture → stop cleanly, toast, fall back to the system default device on next activation.
- The `MicIndicator` must be visible whenever the mic is open. No silent recording, ever.
- Audio bytes go only to the configured STT endpoint. Redact audio payloads and transcripts from logs when `redactPrompts` is on.

### 10.9 Config schema

```ts
const STTConfig = z.object({
  provider: z.enum(['none','windows-dictation','openai-compatible-stt','whisper-local','custom-http']).default('none'),
  activation: z.enum(['push-to-talk','toggle','hands-free']).default('push-to-talk'),
  inputDeviceId: z.string().default('default'),
  language: z.string().default('auto'),
  autoSend: z.boolean().default(false),
  autoSendDelayMs: z.number().min(0).max(5000).default(1500),
  pauseWhileSpeaking: z.boolean().default(true),
  silenceTimeoutMs: z.number().min(300).max(5000).default(900),
  maxUtteranceSec: z.number().min(5).max(300).default(120),
  vadThreshold: z.number().min(0).max(1).default(0.02),
  spokenPunctuation: z.boolean().default(false),
  trimFillers: z.boolean().default(false),
  autoCapitalize: z.boolean().default(true),
  minConfidence: z.number().min(0).max(1).default(0),
  showPartials: z.boolean().default(true),
  baseUrl: z.string().url().optional(),
  model: z.string().default('whisper-1'),
  prompt: z.string().max(1000).optional(),     // vocabulary biasing
  local: z.object({
    executablePath: z.string(),
    modelPath: z.string(),
    extraArgs: z.array(z.string()).default([]),
    outputMode: z.enum(['json','txt']).default('json'),
  }).optional(),
  custom: z.object({
    method: z.enum(['POST','PUT']).default('POST'),
    url: z.string().url(),
    headers: z.record(z.string()).default({}),
    uploadMode: z.enum(['multipart-file','raw-body','json-base64']).default('multipart-file'),
    fileFieldName: z.string().default('file'),
    extraFields: z.record(z.string()).default({}),
    transcriptPath: z.string().default('text'),
  }).optional(),
});
```

API keys live in `safeStorage`, never in this object.

---

## 11. Security Requirements

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on **every** window.
- Strict CSP; no remote code loading. `webSecurity` stays on.
- `preload` exposes a **narrow, explicitly enumerated** API — no generic `invoke(channel, payload)` passthrough.
- Every IPC payload is Zod-validated on **both** sides. Reject and log on failure; never throw raw into the renderer.
- API keys: `safeStorage.encryptString` at rest; decrypted only in main, only at request time; never logged, never sent to the renderer, never included in config export.
- `will-navigate` and `setWindowOpenHandler` deny everything; external links go through `shell.openExternal` with a scheme allowlist.
- Sprite/attachment import: validate magic bytes, enforce size caps, sanitize zip entries against path traversal.
- Redact `Authorization`, `x-api-key`, and base64 blobs from all logs.

---

## 12. Performance Budget

| Metric | Target |
|---|---|
| Idle CPU (sprite looping, no interaction) | < 2% on a modern 4-core |
| Idle CPU (window hidden) | ~0% — rAF loop fully stopped |
| Idle RAM | < 180 MB total across processes |
| Cold start to visible sprite | < 1.5 s |
| State transition hitch | 0 dropped frames (all frames pre-decoded) |
| Mousemove hit-test cost | < 0.2 ms (cached mask lookup only) |

Add a dev-only overlay (`NODE_ENV=development`) showing FPS, state, audio queue depth, and current RMS level.

---

## 13. Testing

**Unit (Vitest)**
- Sprite sheet frame-index math across `columns`/`frameCount` edge cases.
- Bubble effective-size math at scale extremes (0.5, 1, 3).
- `sentenceChunker` boundaries: abbreviations, decimals, code, ellipses, CJK, no-terminal-punctuation stream end.
- `markdownToSpeech`: code fences removed, links reduced to labels, nested lists flattened.
- SSE and NDJSON parsers against truncated/split/malformed chunks.
- Zod schema round-trips with migration from a v1 config shape.
- Alpha-mask lookup with flip + non-integer scale.
- **STT:** `vad.ts` onset/hangover across clipped audio, long pauses mid-sentence, pure silence, and constant noise floor.
- **STT:** `audioEncoder` produces a byte-exact 16 kHz mono WAV header for known PCM input; resampler correctness from 44.1 kHz and 48 kHz sources.
- **STT:** `punctuation.ts` maps spoken commands without mangling the words `period` and `comma` used literally mid-sentence.
- **STT:** transcript insertion at caret with existing text, empty box, and selection present.

**E2E (Playwright `_electron`)**
- App launches; pet window is transparent, frameless, on top.
- Click sprite → input opens; submit against a mock provider → bubble streams → returns to idle.
- Long reply → bubble caps at max height and scrolls; scrolling up suspends auto-scroll; "↓ new" restores it.
- Change bubble scale in Settings → pet window bubble resizes live.
- Import a sprite sheet → preview scrubs → state renders.
- TTS `none` → zero audio nodes created (assert via exposed test hook).
- TTS mock provider → audio queue drains before state returns to idle; Esc flushes it.
- Attach an image to a text-only model → attach button disabled with tooltip.
- STT `none` → mic button absent, `getUserMedia` never called (assert via a spy test hook).
- STT mock provider → fixture audio produces the expected transcript in the input box; auto-send off leaves it unsent.
- Esc during capture → mic released, no transcript inserted, state returns to idle.
- Mic activated during TTS playback → audio queue flushed before capture starts.

**Manual Windows checklist**
- Multi-monitor with mixed DPI (100% / 150%), sprite dragged across the boundary.
- Over a fullscreen game (expect: hidden, by design) and over a maximized borderless window (expect: visible).
- Display disconnect while the sprite sits on the removed monitor → clamps back into view.
- Windows HDR enabled → transparency still correct.
- Microphone permission denied at the OS level → actionable message, no crash, no retry loop.
- Global push-to-talk while another app has focus → records and releases correctly; unplug the mic mid-utterance.

---

## 14. Build Sequence

Each step must leave the app **runnable and committed**. Do not proceed until the step's acceptance criterion passes.

> **Before step 1:** read §16 in full and produce `src/shared/enums.ts` + the complete Zod config tree *first*, reconciling every conflict listed there. Writing schemas incrementally per step is what causes the two documents to drift back apart.

1. **Scaffold** — electron-vite + TS strict + ESLint/Prettier + Vitest. **Plus: the full config schema tree, `schemaVersion` + migration chain + corrupt-config recovery (§17.1), the three mock providers (§17.2), `channels.ts` (§17.3), and the `AppError` type (§17.4).** *Accept:* `npm run dev` opens a blank window; a deliberately corrupted config file produces a backup and a default config instead of a crash; all three mocks are unit-testable with no network.
2. **Pet window** — transparent, frameless, always-on-top, draggable, position persisted. *Accept:* a colored square floats over other apps and survives restart in place.
3. **Static sprite render** — canvas draws the bundled default idle PNG at `scale`. *Accept:* sprite visible with clean alpha edges.
4. **Animation engine** — sheet + frames modes, accumulator clock, fps-accurate, pauses when hidden. *Accept:* idle loops at exactly configured fps; CPU < 2%.
5. **Alpha-mask click-through** — mask generation, cache, hit test, `setIgnoreMouseEvents`. *Accept:* clicking transparent pixels reaches the app behind; clicking the sprite does not.
6. **Input bar** — click to open, Enter/Shift+Enter/Esc, echoes input into a static bubble. *Accept:* full open→type→submit→close loop with no model.
7. **Chat bubble** — full `BubbleConfig`, anchoring, work-area flip, content-driven height, scroll at cap, auto-scroll suspension, Markdown + DOMPurify. *Accept:* every §4 criterion, verified at scale 0.5 / 1 / 3.
8. **LLM layer** — provider interface, `openai-compatible`, streaming to the bubble, abort, error surfacing. *Accept:* real streamed reply from a local LM Studio/Ollama endpoint with no API key.
9. **State machine** — wire idle/thinking/speaking + dwell + hover-pauses-dwell. *Accept:* all §3.5 transitions, including error and cancel paths.
10. **Settings window** — General, Model, Appearance panels; live apply; `safeStorage` keys; test connection. *Accept:* changing bubble scale resizes the live bubble with no restart.
11. **Sprite import** — Sprites panel, drop zone, validation, copy to userData, preview scrubber, Sprite Pack zip. *Accept:* a user-supplied sheet replaces all three states and survives restart.
12. **Remaining LLM providers** — `anthropic`, `ollama`, model listing. *Accept:* all three providers stream correctly; switching providers mid-session works.
13. **Multimodal input** — attachment tray, clipboard, file, region screenshot, downscale, per-provider encoding, capability gating. *Accept:* a screenshot is captured and correctly described by a vision model.
14. **TTS layer** — interface, registry, `none` + `windows-sapi` + `openai-compatible-tts`, chunker, markdown stripping, `AudioPlayer`, barge-in, Voice panel. *Accept:* with `none`, zero audio code runs; with a local Kokoro container, speech begins within ~1 s of first token and Esc cuts it mid-word.
15. **Mouth sync + remaining TTS providers** — `AnalyserNode` tap, mouth compositing, `elevenlabs`, `custom-http`. *Accept:* mouth frames track amplitude; `custom-http` drives an arbitrary endpoint without code changes.
16. **STT core** — `STTProvider` interface, registry, `none` + `openai-compatible-stt`, `MicRecorder` AudioWorklet, 16 kHz encoder, VAD, mic button, `MicIndicator`, toggle activation, transcript insertion, Voice Input panel, permission handling. *Accept:* with `none`, `getUserMedia` is never called and the mic button is absent; with a local Whisper container, speaking a sentence fills the input box with correct text and the OS mic indicator goes dark immediately on stop.
17. **STT activation modes + remaining providers** — push-to-talk with the native keyup hook and its toggle fallback, hands-free + VAD auto-stop, echo suppression against TTS, `windows-dictation` with live partials, `whisper-local`, `custom-http`. *Accept:* global PTT works while another app is focused and releases the mic on keyup; activating the mic during speech flushes the audio queue first; partials render greyed and are replaced cleanly by the final transcript.
18. **Persona layer** — `PersonaConfig`, `buildSystemPrompt`, whitelist variable resolver, example dialogue as few-shot turns, per-provider system placement, persona library + `.persona.json` import/export, Sprite Pack persona key, greeting scheduler, Persona panel with live prompt preview. *Accept:* with `enabled: false` the assembled prompt is byte-identical to control 67's text; with a persona active, the same question produces visibly in-character replies on all three providers, the Anthropic request carries `system` top-level and not in `messages`, a `static` greeting appears with zero network calls, and switching persona clears history under the default `new-conversation`.
19. **Polish & package** — tray, global hotkeys, launch-on-login, single-instance lock, logging, electron-builder NSIS installer + auto-update feed stub. *Accept:* signed-or-unsigned installer produces a working app on a clean Windows VM.

---

## 15. Deliverables

- Working repo matching §2.
- `README.md`: install, dev, build, and a **"Using a local model in Docker"** section with concrete `docker run` examples for Ollama, Kokoro-FastAPI (TTS), and a Whisper ASR web service (STT), plus the exact base URLs to paste into each Settings panel.
- `VOICE.md`: how to run voice output and voice input fully offline, the privacy guarantees (mic opens only on explicit activation, audio never written to disk, nothing leaves the machine with a local endpoint), and a troubleshooting table for permission, device, and push-to-talk hook failures.
- `PERSONA.md`: how to write a persona card, the full template-variable list, the `.persona.json` and `pack.json` persona schemas, two worked examples (a terse technical assistant and a chatty character), the token-cost tradeoff, and an explicit note that a persona is a styling instruction and not a content filter.
- `SPRITES.md`: authoring guide — recommended canvas sizes, transparent-edge requirements, sheet layout, fps guidance, mouth-frame ordering (quietest → loudest), and the `pack.json` schema.
- `.env.example` for dev-only overrides. No real keys in the repo, ever.
- Windows NSIS installer artifact.
- `DISCREPANCIES.md` — any spec ambiguity encountered during the build and how it was resolved. Empty file is an acceptable outcome; a missing file is not.

---

## 16. Conflict Register — binding resolutions

These are **known contradictions** between this document and `settings_window_spec.md`. Each has exactly one correct answer. Implement the Resolution column. Do not average, do not pick the larger, do not implement both.

### 16.1 Numeric range and default conflicts

| # | Subject | This spec said | Settings spec said | **Resolution** |
|---|---|---|---|---|
| C1 | Bubble scale | `0.5`–`3.0`, default `1` | Control 118: `50%`–`250%`, default `100%` | **`0.5`–`2.5`, default `1.0`.** Settings spec wins. Update `BubbleConfig.scale` to `.min(0.5).max(2.5)`. |
| C2 | Bubble base width | `baseWidthPx` default `320` | Control 120 "Maximum width" default `380` | **They are different fields.** Keep `baseWidthPx: 320` (content-sizing target) and add `maxWidthPx: 380` (hard cap). Bubble width = `min(contentWidth, maxWidthPx) × scale`, floor `baseWidthPx × scale × 0.4`. |
| C3 | Bubble max height | `maxHeightPx` default `240` | Control 121 default `420` | **`420`.** Settings spec wins. |
| C4 | Bubble dwell | `dwellMs` 0–30000, default `4000`, plus a `keepOpenUntilDismissed` boolean | Control 148: enum `Only when I dismiss it` / `10` / `20` / `30` / `60` s, default `30 s` | **Store as `dwellMs: number` with `0` meaning "never auto-hide."** The dropdown writes `0 / 10000 / 20000 / 30000 / 60000`. **Delete `keepOpenUntilDismissed`** — it is redundant with `0`. Default `30000`. |
| C5 | Typewriter | `typewriter: boolean` + `typewriterCps: 45` | Control 145: 3-way enum, default `Typewriter by word`; control 146 default `45` | **3-way enum wins.** Replace `typewriter: boolean` with `textReveal: 'instant' \| 'char' \| 'word'`, default `'word'`. Keep `revealRate: 45` (units/sec, unit depends on mode). |
| C6 | Font size | `fontSizePx` default `14`, no stated range | Control 141: `10`–`28`, default `14` | No conflict. Add the range. |
| C7 | Corner radius | default `12` | Control 136: `0`–`32`, default `14` | **`14`.** Settings spec wins. |
| C8 | Sprite scale | `0.25`–`4`, default `1` | Control 37: `25%`–`400%`, default `100%` | No conflict — same values, different notation. Store as a float. |
| C9 | Mouth silence threshold | not present | Control 55: `0`–`0.5`, default `0.04` | Add `MouthFrameConfig.silenceThreshold` default `0.04`. Below this RMS, force frame index 0. |
| C10 | STT silence timeout | `silenceTimeoutMs` 300–5000, default `900` | Control 210: `0.3`–`5.0` s, default `0.9` | No conflict. Same values; UI renders seconds, storage is ms. **Storage is always ms.** |
| C11 | Bubble background | `backgroundColor: '#1e1e1eF2'` (alpha baked into hex) | Controls 131 + 134 (separate color and opacity) | **Separate them.** `backgroundColor` is 6-digit hex; `backgroundOpacity` is `0.2`–`1.0`, default `0.95`. Never encode alpha in the hex. |

### 16.2 Behavioral conflicts

| # | Subject | Conflict | **Resolution** |
|---|---|---|---|
| C12 | Bubble position enum | §4.1 `['top','top-left','top-right','left','right']` default `top-right`; control 122 is `Automatic` / `Above` / `Below` / `Left` / `Right` default `Automatic` | **Settings spec wins.** `bubblePlacement: 'auto' \| 'above' \| 'below' \| 'left' \| 'right'`, default `'auto'`. `'auto'` runs the work-area flip logic in §4.2; the four explicit values are honored *unless* the bubble would leave the work area, in which case flip anyway and do not persist the change. |
| C13 | Code-block speech | §8.7 `readCodeBlocks: boolean` default `false` | Control 112 is a 3-way enum, default `Say "code block"` | **3-way enum wins.** `codeBlockSpeech: 'skip' \| 'announce' \| 'read'`, default `'announce'`. Replace the boolean in `TTSConfig`. |
| C14 | TTS barge-in | §8.5 states barge-in **always** stops immediately, non-negotiable | Control 110 offers `Finish the current sentence` and `Queue the new reply` | **Settings spec wins — make it configurable.** Default remains `Stop speaking immediately`. Rewrite §8.5's first bullet to read "default behavior, overridable by control 110." `Queue the new reply` queues at most **one** pending turn; a third submission replaces the queued one. |
| C15 | Conversation turn cap | §6.3 "default 10 turns" | Control 74 is a 6-option enum incl. `Fit to token budget` | **Settings spec wins.** `contextMode: 'none' \| 'last5' \| 'last10' \| 'last25' \| 'session' \| 'token-budget'`, default `'last10'`. |
| C16 | Conversation persistence | §6.3 "optional persistence to disk is off by default" | Control 76 default `Keep for this session only` | **No conflict if read carefully:** session-only ≠ disk. `'session'` keeps history in memory and discards on quit. `'permanent'` is the only mode that writes to disk, and it is not the default. |
| C17 | TTS failure fallback | §8.5 "continue with text-only output" (fixed) | Control 117 offers 3 behaviors | **Configurable, default `Fall back to text only`.** The invariant that survives: a TTS failure may never block, truncate, or delay the text reply, regardless of which option is selected. |
| C18 | Attachment cap | §9.2 "max 4 per message" | Control 82: `1`–`10`, default `4` | Configurable, default 4. |
| C19 | Image downscale | §9.2 "downscale above 1568 px", re-encode PNG or JPEG q85 | Controls 80/81: enum incl. `Do not resize`, default `1536 px`; format enum incl. WebP | **Settings spec wins.** Default max dimension `1536`. Drop the hardcoded 1568. |
| C20 | Sprite anchor | `anchor: {x, y}` floats | Control 33: named enum + `Custom…` | Store floats. The named options are presets that write float pairs: bottom-center `(0.5, 1.0)`, center `(0.5, 0.5)`, top-center `(0.5, 0.0)`, bottom-left `(0.0, 1.0)`, bottom-right `(1.0, 1.0)`. |
| C21 | Click-through escape hatch | §5.2 says provide "Click-through: always off" | Control 156 is a 3-way enum | **3-way enum wins:** `alpha-mask` (default) / `bounding-box` / `never`. |
| C22 | Frame count cap | `SpriteStateConfig.frameCount` unbounded positive int | Control 28: `1`–`512` | **`1`–`512`.** Enforce in Zod, not just the UI. |
| C25 | System prompt vs. persona | Control 67's `Helpful companion` default ends with *"Do not describe your own appearance or actions"*; §6.4 requires the model to speak as a character | **Add preset `Persona-driven`** (same text minus that sentence) and auto-switch to it when persona is enabled while the preset is `Helpful companion`. Never silently rewrite a `Custom` prompt — offer a `Fix it for me` button. See §6.4.1. |
| C26 | Who owns the system string | §6.3 implies `systemPrompt` goes straight to the provider | **Nothing calls `cfg.llm.systemPrompt` directly.** Every provider consumes `buildSystemPrompt()`'s output. With persona disabled, that output equals control 67 byte-for-byte, so this is a pure refactor with no behavior change. Enforce with a lint rule or a single accessor. |
| C27 | Persona vs. reply-length settings | `replyLength` clause, control 71 max tokens, and the base prompt's "one to three sentences" all constrain length | **They layer, they do not conflict.** `replyLength: 'none'` emits no clause and defers to the base prompt. Max tokens remains a hard ceiling in all cases. Do not try to reconcile them into one setting. |
| C23 | Playback mode | `loop: boolean` | Control 32: 4-way enum incl. ping-pong | **4-way enum wins.** Replace `loop: boolean` with `playbackMode: 'loop' \| 'once-hold' \| 'once-idle' \| 'ping-pong'`, default `'loop'`. |

### 16.3 Controls with no backing schema field

The settings spec defines these; this document has no field for them. **Add every one.** Grouped by the config object they belong to:

```ts
// WindowConfig — new object, none of this existed
const WindowConfig = z.object({
  launchAtLogin: z.boolean().default(false),           // 1
  startMinimized: z.boolean().default(false),          // 2
  showInTaskbar: z.boolean().default(false),           // 3
  restorePosition: z.boolean().default(true),          // 4
  onClose: z.enum(['tray','quit']).default('tray'),    // 5
  fullscreenBehavior: z.enum(['never','fullscreen','fullscreen-and-games'])
    .default('fullscreen-and-games'),                  // 6
  allWorkspaces: z.boolean().default(true),            // 7
  contentProtection: z.boolean().default(false),       // 8  (restart required)
  displayTarget: z.union([z.literal('cursor'), z.literal('primary'), z.string()])
    .default('primary'),                               // 9
  defaultAnchor: z.enum(['tl','tc','tr','ml','c','mr','bl','bc','br']).default('br'), // 10
  edgeMarginPx: z.number().min(0).max(200).default(24),      // 11
  snapToEdges: z.boolean().default(true),                    // 12
  snapDistancePx: z.number().min(4).max(64).default(16),     // 13
  keepOnScreen: z.boolean().default(true),                   // 14
});

// UpdateConfig — new
const UpdateConfig = z.object({
  channel: z.enum(['stable','beta','disabled']).default('stable'),   // 21
  install: z.enum(['auto','notify','check-only']).default('notify'), // 22
});

// SpriteConfig additions
scaleMode: z.enum(['fixed','dpi-aware']).default('dpi-aware'),       // 38
opacity: z.number().min(0.2).max(1).default(1),                      // 41
transition: z.enum(['cut','crossfade']).default('crossfade'),        // 42
crossfadeMs: z.number().min(40).max(500).default(120),               // 43
minThinkingMs: z.number().min(0).max(2000).default(250),             // 44
frameOrder: z.enum(['row-major','column-major']).default('row-major'),// 30 (per state)
gifTimingSource: z.enum(['file','override']).default('file'),        // §2.1 note

// MouthFrameConfig additions
driver: z.enum(['amplitude','text-rate','fixed-loop']).default('amplitude'), // 46
silenceThreshold: z.number().min(0).max(0.5).default(0.04),                  // 55

// BubbleConfig additions
scaleRelativeTo: z.enum(['sprite','pixels','screen']).default('sprite'),     // 119
maxWidthPct: z.number().min(0.1).max(0.6).default(0.25),                     // 125
maxHeightPct: z.number().min(0.1).max(0.8).default(0.40),                    // 126
gapFromSpritePx: z.number().min(0).max(80).default(12),                      // 123
scrollbar: z.enum(['auto','always','never']).default('auto'),                // 127
autoScroll: z.boolean().default(true),                                       // 128
wheelBehavior: z.enum(['scroll','passthrough']).default('scroll'),           // 129
theme: z.enum(['system','light','dark','high-contrast','custom']).default('system'), // 130
accentColor: z.string().default('#5B8DEF'),                                  // 133
backgroundOpacity: z.number().min(0.2).max(1).default(0.95),                 // 134
backdropBlur: z.enum(['none','subtle','acrylic']).default('subtle'),         // 135
paddingPx: z.number().min(4).max(32).default(12),                            // 137
border: z.enum(['none','thin','thick']).default('thin'),                     // 138
shadow: z.enum(['none','soft','strong']).default('soft'),                    // 139
lineHeight: z.number().min(1).max(2.2).default(1.45),                        // 142
renderMarkdown: z.boolean().default(true),                                   // 143
codeTheme: z.enum(['match','github-light','github-dark','monokai','solarized-dark']).default('match'), // 144
matchRevealToSpeech: z.boolean().default(true),                              // 147
keepOpenOnHover: z.boolean().default(true),                                  // 149
waitForSpeech: z.boolean().default(true),                                    // 150

// InputConfig — new
const InputConfig = z.object({
  openOn: z.enum(['single-click','double-click','hotkey-only']).default('single-click'), // 151
  sendWith: z.enum(['enter','ctrl-enter']).default('enter'),                  // 152
  width: z.enum(['match-bubble','compact','wide']).default('match-bubble'),   // 153
  keepOpenAfterSend: z.boolean().default(false),                              // 154
  rememberDraft: z.boolean().default(true),                                   // 155
});

// AdvancedConfig — new
const AdvancedConfig = z.object({
  clickThrough: z.enum(['alpha-mask','bounding-box','never']).default('alpha-mask'), // 156
  alphaThreshold: z.number().int().min(1).max(254).default(10),               // 157
  hitTestEveryNFrames: z.union([z.literal(1),z.literal(2),z.literal(4)]).default(2), // 158
  dragEnabled: z.boolean().default(true),                                     // 159
  dragModifier: z.enum(['none','alt','ctrl','shift']).default('none'),        // 160
  fpsCap: z.enum(['display','60','30','15']).default('display'),              // 161
  pauseWhenHidden: z.boolean().default(true),                                 // 162
  reduceOnBattery: z.boolean().default(true),                                 // 163
  hardwareAcceleration: z.boolean().default(true),                            // 164 (restart)
  spriteCacheMb: z.union([z.literal(64),z.literal(128),z.literal(256),z.literal(512)]).default(128), // 165
  proxyMode: z.enum(['system','direct','manual']).default('system'),          // 166
  proxyUrl: z.string().default(''),                                           // 167
  proxyBypass: z.string().default('localhost, 127.0.0.1'),                    // 168
  allowSelfSigned: z.boolean().default(false),                                // 169
  logLevel: z.enum(['error','warn','info','debug','trace']).default('warn'),  // 170
  redactPrompts: z.boolean().default(true),                                   // 171
  developerMode: z.boolean().default(false),                                  // 178
  showMaskOverlay: z.boolean().default(false),                                // 181
  showFps: z.boolean().default(false),                                        // 182
  forceState: z.enum(['auto','idle','thinking','speaking','listening']).default('auto'), // 183
  saveLastRecording: z.boolean().default(false),                              // 233 — NOT persisted, see §17.9
  showMicOverlay: z.boolean().default(false),                                 // 234
});

// LLMConfig additions
topP: z.number().min(0).max(1).default(1),                 // 70
stopSequences: z.array(z.string()).max(4).default([]),     // 72
stream: z.boolean().default(true),                         // 73
retryAttempts: z.number().int().min(0).max(3).default(2),  // 66
promptPreset: z.string().default('helpful-companion'),     // 68
imageDetail: z.enum(['auto','low','high']).default('auto'),// 79
maxImageDim: z.enum(['512','1024','1536','2048','none']).default('1536'), // 80
reencodeFormat: z.enum(['original','png','jpeg','webp']).default('jpeg'), // 81
maxAttachments: z.number().int().min(1).max(10).default(4),// 82

// TTSConfig additions
pitch: z.number().min(-10).max(10).default(0),             // 85 (SAPI only)
elevenlabs: z.object({ voiceId: z.string(), modelId: z.string().default('eleven_flash_v2_5'),
  stability: z.number().min(0).max(1).default(0.5),
  similarityBoost: z.number().min(0).max(1).default(0.75),
  style: z.number().min(0).max(1).default(0),
  speakerBoost: z.boolean().default(true) }).optional(),   // 92–97
beginSpeaking: z.enum(['first-sentence','full-reply']).default('first-sentence'), // 109
onNewMessage: z.enum(['stop','finish-sentence','queue']).default('stop'),         // 110
linkSpeech: z.enum(['label','full-url','skip']).default('label'),                 // 113
emojiSpeech: z.enum(['skip','describe']).default('skip'),                         // 114
maxSpeechChars: z.number().min(100).max(20000).default(4000),                     // 115
cacheAudio: z.boolean().default(true),                                           // 116
onFailure: z.enum(['text-only','sapi','notify']).default('text-only'),           // 117

// STTConfig additions
startSound: z.boolean().default(true),                     // 212
inputGain: z.number().min(0.5).max(4).default(1),          // 216
noiseSuppression: z.enum(['default','aggressive','off']).default('default'), // 217
echoCancellation: z.boolean().default(true),               // 218
transcriptAction: z.enum(['hold','send','countdown']).default('hold'),       // 222
insertMode: z.enum(['caret','replace','append']).default('caret'),           // 225
onFailure: z.enum(['error','sapi-dictation','discard']).default('error'),    // 231
includeTranscriptsInLogs: z.boolean().default(false),      // 232
audioFormat: z.enum(['wav16','wav48','flac','opus','mp3']).default('wav16'), // 207
```

> **C24 — `transcriptAction` supersedes `autoSend`.** The settings spec's control 222 is a 3-way enum; §10.9's `autoSend: boolean` + `autoSendDelayMs` cannot express `countdown` cleanly. **Delete `autoSend`.** Keep `autoSendDelayMs` (renamed `countdownMs`), used only when `transcriptAction === 'countdown'`.

---

## 17. Gap Closures

### 17.1 Config versioning and migration (implement in step 1, not later)

```ts
const CONFIG_SCHEMA_VERSION = 1;

type Migration = (cfg: Record<string, unknown>) => Record<string, unknown>;
const migrations: Record<number, Migration> = { /* 1 -> 2 when the time comes */ };
```

- Every config file carries `schemaVersion: number` at the root.
- On load: if `schemaVersion < CONFIG_SCHEMA_VERSION`, run each migration in order, then validate. If `>`, refuse — this file came from a newer build.
- **If validation fails after migration:** copy the file to `config.corrupt.<ISO8601>.json`, write a fresh default config, and show a one-time dialog telling the user where the backup went. **Never crash on launch because of a bad config.**
- **Per-key fallback, not all-or-nothing:** validate each top-level section (`window`, `sprite`, `bubble`, `llm`, `tts`, `stt`, `advanced`) independently. One bad section resets that section only.
- Exported settings (control 174) include `schemaVersion` and exclude all secrets.

### 17.2 Mock providers (build these in step 1 — steps 8, 14, 16 depend on them)

| Mock | Behavior |
|---|---|
| `MockLLMProvider` | Streams a fixture reply at a configurable chars/sec (control 76). Fixtures: short reply, 4000-char reply (scroll testing), Markdown-heavy reply (code fences, lists, links, a table), a reply that errors mid-stream, a reply that never terminates (abort testing). |
| `MockTTSProvider` | Emits silent PCM16 of a duration proportional to text length, plus a synthetic amplitude envelope so mouth sync is testable with no audio device. |
| `MockSTTProvider` | Returns a fixed transcript from a bundled fixture. **Never calls `getUserMedia`.** In streaming mode, emits 3 partials then a final, on a timer. |

All three appear in their provider dropdowns only when Developer Mode is on. The entire E2E suite must pass with **zero network access and no audio hardware**.

### 17.3 IPC channel inventory

`channels.ts` is the single source of truth. Every channel is `request/response` (`invoke`) or `stream` (`send` + `on`). Streams are keyed by `requestId` (UUID v4) and every stream has a terminal event — `done` or `error`, never silence.

| Channel | Kind | Direction |
|---|---|---|
| `config:get` / `config:set` / `config:reset` | invoke | R→M |
| `config:changed` | stream | M→R (broadcast to all windows) |
| `secret:set` / `secret:has` / `secret:clear` | invoke | R→M (never `secret:get`) |
| `llm:chat` / `llm:abort` / `llm:test` / `llm:models` | invoke + stream | R→M, deltas M→R |
| `tts:synthesize` / `tts:abort` / `tts:voices` / `tts:test` | invoke + stream | audio chunks M→R |
| `stt:start` / `stt:stop` / `stt:abort` | invoke | R→M |
| `stt:audio-frame` | stream | R→M (PCM frames up) |
| `stt:result` | stream | M→R (partials + final) |
| `sprite:import` / `sprite:validate` / `sprite:mask` / `pack:import` / `pack:export` | invoke | R→M |
| `attach:clipboard` / `attach:file` / `attach:region` | invoke | R→M |
| `window:move` / `window:set-ignore-mouse` / `window:resize` | send | R→M |
| `state:changed` | stream | R→M→R (pet ↔ settings sync) |
| `toast:show` | stream | M→R |
| `shell:open-external` / `shell:open-path` | invoke | R→M, allowlisted |

**`secret:get` must not exist.** The renderer can ask whether a key is set and what its last 4 characters are; it can never read one.

### 17.4 Error taxonomy

One normalized error shape crosses IPC. Never send an `Error` object or a stack trace to the renderer.

```ts
type AppError = {
  code: 'NETWORK_UNREACHABLE' | 'DNS_FAILURE' | 'CONNECTION_REFUSED' | 'TIMEOUT'
      | 'AUTH_INVALID' | 'AUTH_MISSING' | 'RATE_LIMITED' | 'MODEL_NOT_FOUND'
      | 'CONTEXT_LENGTH_EXCEEDED' | 'CONTENT_FILTERED' | 'SERVER_ERROR'
      | 'INVALID_RESPONSE' | 'ABORTED' | 'MIC_PERMISSION_DENIED' | 'MIC_NOT_FOUND'
      | 'AUDIO_DEVICE_LOST' | 'FILE_TOO_LARGE' | 'FILE_INVALID' | 'UNSUPPORTED_FORMAT'
      | 'EXECUTABLE_NOT_FOUND' | 'EXECUTABLE_FAILED' | 'UNKNOWN';
  userMessage: string;   // plain language, no jargon, no stack trace
  detail?: string;       // shown only when Developer Mode is on
  retryable: boolean;
  action?: { label: string; kind: 'open-settings' | 'open-url' | 'retry' | 'open-mic-settings' };
};
```

- `ABORTED` is **never** surfaced to the user — it is the expected result of Esc.
- `CONNECTION_REFUSED` against a loopback URL gets a specific message: *Nothing is listening at `<url>`. Is your local model container running?*

### 17.5 Token counting

Control 74's `Fit to token budget` and control 75 need a token count, and the spec never says how to get one.

- Use a **character-based estimate**: `ceil(chars / 3.6)` for English-ish text, `ceil(chars / 1.5)` for CJK ranges. Do not bundle a tokenizer; it adds 2+ MB and is wrong for most local models anyway.
- Label the UI accordingly: *Approximate. Actual usage depends on the model.*
- Each image attachment counts as a flat `1105` tokens for budgeting at `auto`/`high` detail, `85` at `low`.
- When trimming to budget, drop **oldest complete exchanges first** (user+assistant pair together, never half a pair) and never drop the system prompt.

### 17.6 Audio cache (control 116)

- Key: `sha256(provider + voice + speed + format + normalizedText)`.
- Store in `userData/cache/tts/`, LRU, hard cap **200 MB**, evict on startup and when the cap is exceeded.
- **Only cache completed syntheses.** An aborted stream is never written.
- Cache is invalidated wholesale when the TTS provider or voice changes.
- `Clear cache` button lives in Advanced §7.4 — **add it as control 235**, labeled `Clear Audio Cache`, showing current size.

### 17.7 Focus and activation behavior

Underspecified and it will show up as a bug immediately:

- The pet window is **`focusable: true` but never steals focus.** Show it with `showInactive()`, never `show()` + `focus()`.
- Clicking the sprite focuses the pet window *only* to serve the input box. When the input box closes, **return focus to the previously focused application** (`win.blur()` on Windows is sufficient; do not call `app.hide()`).
- The global hotkey (control 15) must focus the input box even when the pet window was hidden — show, then focus the textarea, in that order, on the next tick.
- The settings window is a normal focusable window and may steal focus.
- `alwaysOnTop` with level `screen-saver` will sit above most things including the taskbar. **Re-assert `setAlwaysOnTop` after `display-metrics-changed` and after resuming from sleep** — Windows silently drops it.

### 17.8 First-run experience

Not specified anywhere; without it, a fresh install shows a sprite that errors on every message.

- On first launch (no config file), show the sprite with bundled defaults **and** open the Settings window to the **Model** panel, with a one-line banner: *Choose where your AI model runs to get started.*
- The banner includes two buttons: `I have an API key` (focuses control 62) and `I'm running a local model` (sets Base URL to `http://localhost:11434/v1`, selects `OpenAI-compatible`, and runs Test Connection).
- Do **not** build a multi-step wizard.
- Until a successful connection test, submitting a message shows the configured-endpoint error with an `Open Settings` action rather than a generic failure.

### 17.9 Non-persisted settings

These live in memory only and reset every launch, regardless of what the user last set:

| Control | Reason |
|---|---|
| 233 Save last recording | Privacy — must never be silently sticky |
| 183 Force state | Debug aid; a stuck forced state looks like a crash |
| 181/182/234 overlays | Debug aids |

Implement as a separate `SessionState` store that is never written to disk. Writing these into `electron-store` is a bug.

### 17.10 Settings↔pet synchronization

- `electron-store` is the single writer, in main. The renderer never writes config directly — it sends `config:set` and waits for the `config:changed` broadcast.
- Both windows re-render from the broadcast. **No optimistic local state for persisted settings**, with one exception: sliders may hold a local value while dragging and commit on release, to avoid IPC per pixel.
- Debounce `config:set` at 150 ms per key during drags.

### 17.11 Testing additions

- Config migration: a v1 file, a corrupt file, a future-version file, a file with one bad section.
- Token estimator against known-length fixtures, within ±20%.
- `AppError` mapping: each provider's 401/404/429/500/ECONNREFUSED/ETIMEDOUT maps to the right code and a message containing no stack trace.
- Focus: hotkey from another app focuses the input; closing it returns focus to that app.
- Every settings control round-trips: set → persist → restart → read back identical. **Drive this from the enum tables, not by hand** — a generated test over all 235 controls.

---

## 18. Known Technical Landmines

Four things the settings spec specifies in one line that are substantially harder than they look. Budget for them.

**18.1 — Backdrop blur / acrylic (control 135).** Electron's `backgroundMaterial: 'acrylic'` applies to the **whole window**, not a region, and is mutually exclusive with `transparent: true` on Windows. A transparent window cannot have a per-element acrylic backdrop. **Resolution:** render the bubble in the same transparent window and implement `Subtle` as a semi-opaque fill only. If true acrylic is wanted, the bubble must become a **separate `BrowserWindow`** with `backgroundMaterial` set — which then needs independent positioning, z-order, and click-through logic. For v1, implement `None` and `Subtle` as fills and **ship `Strong (acrylic)` as a separate bubble window or not at all.** Do not silently render it identical to `Subtle`.

**18.2 — Font enumeration (control 140).** There is no Electron or web API that lists installed font families. `queryLocalFonts()` is Chromium-only, permission-gated, and not available in a sandboxed renderer. **Resolution:** ship a curated list of fonts that are guaranteed present on Windows 10/11 (Segoe UI, Segoe UI Variable, Arial, Calibri, Consolas, Cascadia Mono, Georgia, Tahoma, Times New Roman, Verdana) plus a free-text field for anything else, validated by measuring whether the family renders differently from a fallback. Do not claim to enumerate.

**18.3 — Per-monitor DPI and the alpha mask.** Control 158's hit-test sample rate implies the mask lookup is expensive; it isn't, but **the coordinate transform is where bugs live.** The chain is: screen coords → window coords → CSS px → device px → sprite-local px → mask index, with `scale`, `flipHorizontal`, and the display's `scaleFactor` all applied. Write this as **one pure function with unit tests at 100%/125%/150%/175% scaling and non-integer sprite scales**, not as inline arithmetic in a mousemove handler. Also: `screen.getCursorScreenPoint()` returns DIP, not physical pixels, and the two differ on scaled displays.

**18.4 — `setContentProtection` + transparency (control 8).** Enabling content protection on a transparent, always-on-top window causes the window to render black in some driver configurations on Windows. Test this specifically on Intel integrated graphics. If it black-boxes, the control must detect and warn rather than leaving the user with an opaque rectangle.

**18.5 — Crossfade between states (control 42) on a transparent window.** Crossfading two sprites means compositing two semi-transparent images. If both are drawn at partial alpha onto the same canvas, overlapping pixels sum to a visible seam. **Draw the crossfade into an offscreen canvas with `globalCompositeOperation` handled explicitly, then blit once** — do not draw two `drawImage` calls at 0.5 alpha onto the visible canvas.
