# Sprite Companion

An always-on-top animated desktop companion for any AI model. Bring your own sprites, your own model, and — optionally — your own voice.

The sprite sits above your other windows, animates through **idle**, **thinking**, and **speaking** states, and answers in a scrollable chat bubble. Click it to type. Everything else — sprites, persona, model backend, voice output, voice input — is configurable in a settings window and works with either a hosted API or a model running locally in Docker.

---

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Setup: connect a model](#setup-connect-a-model)
- [Setup: your own sprites](#setup-your-own-sprites)
- [Setup: a persona](#setup-a-persona)
- [Setup: voice output (TTS)](#setup-voice-output-tts)
- [Setup: voice input (STT)](#setup-voice-input-stt)
- [Images and screenshots](#images-and-screenshots)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Settings reference](#settings-reference)
- [Where your data lives](#where-your-data-lives)
- [Privacy](#privacy)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Non-goals](#non-goals)
- [License](#license)

---

## Features

- **Bring your own sprites.** Static images, sprite sheets, or frame folders for each of the three states. Import from Settings; no file editing, no restart.
- **Bring your own model.** OpenAI-compatible endpoints (OpenAI, LM Studio, llama.cpp, vLLM, LocalAI, **anything in Docker**), Anthropic, or Ollama.
- **Scalable, scrollable chat bubble.** Sizes itself to the content, caps at your configured maximum, then scrolls — with auto-scroll that politely gets out of the way when you scroll up to re-read something.
- **Optional voice output.** Off by default. Windows' built-in voices, any OpenAI-compatible `/v1/audio/speech` endpoint (including Kokoro in Docker), ElevenLabs, or a custom HTTP endpoint you define yourself.
- **Optional voice input.** Off by default. Push-to-talk, toggle, or hands-free dictation via Windows, a local Whisper container, a local `whisper.cpp` binary, or a custom endpoint.
- **Optional amplitude-driven mouth sync.** Supply a few mouth frames and the sprite's mouth tracks the audio actually playing — works identically with local and cloud voices.
- **Personas.** A structured character definition layered onto the system prompt, with an optional greeting and an importable/exportable card format.
- **Multimodal.** Paste an image, drag a file in, or grab a screen region with a hotkey.
- **Runs fully offline.** With a local model, local TTS, and local STT, nothing leaves your machine.

---

## Requirements

| | |
|---|---|
| **OS** | Windows 10 (build 1903+) or Windows 11, x64 or arm64 |
| **Disk** | ~250 MB for the app, plus whatever your local models need |
| **RAM** | ~180 MB idle for the app itself |
| **Required** | An AI model endpoint — hosted API key *or* a local server |
| **Optional** | Docker Desktop (for local model / TTS / STT containers) |
| **For building** | Node.js ≥ 20 and npm |

> macOS and Linux are **not supported targets.** The code avoids platform-locked APIs outside `src/main/platform/win32/`, so the app generally runs, but transparency, click-through, and the Windows-native voice providers are unverified there. Bug reports from those platforms are welcome but unprioritized.

---

## Quick start

### Option A — Install the release (recommended)

1. Download the latest `SpriteCompanion-Setup-x.y.z.exe` from the [Releases](../../releases) page.
2. Run it. SmartScreen may warn on unsigned builds — **More info → Run anyway**.
3. The companion appears in the bottom-right of your primary display, and the Settings window opens to the **Model** panel.
4. Follow [Setup: connect a model](#setup-connect-a-model). This is the only required configuration.

### Option B — Build from source

```bash
git clone https://github.com/<you>/sprite-companion.git
cd sprite-companion
npm install
npm run dev          # launches with hot reload
```

To produce an installer:

```bash
npm run build        # typecheck + bundle
npm run package      # emits dist/SpriteCompanion-Setup-x.y.z.exe
```

---

## Setup: connect a model

Open **Settings → Model**. Pick whichever of these three matches you.

### Path 1 — A local model with Ollama (easiest offline option)

Ollama is the lowest-friction way to get a local model running. Install it from [ollama.com](https://ollama.com), then:

```bash
ollama pull llama3.1:8b
ollama serve          # usually already running as a service
```

In **Settings → Model**:

| Field | Value |
|---|---|
| Provider | `Ollama` |
| Base URL | `http://localhost:11434` |
| API key | *(leave empty)* |
| Model | `llama3.1:8b` |

Click **Test Connection**. You should see a latency figure and the model name.

### Path 2 — Any OpenAI-compatible server in Docker

This single provider covers LM Studio, llama.cpp's server, vLLM, LocalAI, Text Generation WebUI, and anything else exposing `/v1/chat/completions`. Example using LocalAI:

```bash
docker run -d --name localai -p 8080:8080 \
  -v localai-models:/models \
  localai/localai:latest
```

| Field | Value |
|---|---|
| Provider | `OpenAI-compatible` |
| Base URL | `http://localhost:8080/v1` |
| API key | *(usually empty for local servers)* |
| Model | whatever your server reports — click the refresh icon to populate the list |

> **The `/v1` suffix matters.** Ollama's native endpoint is the bare host; OpenAI-compatible endpoints almost always end in `/v1`. If Test Connection returns a 404, this is the first thing to check.

### Path 3 — A hosted API

| Provider | Base URL | Key |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `sk-…` |
| Anthropic | `https://api.anthropic.com` | `sk-ant-…` |
| Others | Whatever the vendor documents | — |

Keys are encrypted at rest with Windows' DPAPI via Electron `safeStorage`. They are never written to the config file in plaintext, never sent to the UI process, never written to logs, and never included in an exported settings file.

**Verify it works:** click the sprite, type `hello`, press Enter. The sprite should switch to its thinking animation and then stream a reply into the bubble.

---

## Setup: your own sprites

Open **Settings → Sprites**. You configure each of the three states independently — they don't have to use the same format.

### Supported formats

| Mode | What to supply | Notes |
|---|---|---|
| **Static image** | One `.png`, `.webp`, `.gif`, or `.apng` | GIF/APNG animate on their own |
| **Sprite sheet** | One image + frame dimensions | Horizontal strip by default; grids supported via the columns field |
| **Frame folder** | Multiple images | Played in natural filename order (`frame_1`, `frame_2`, `frame_10`) |

### Steps

1. **Settings → Sprites**, pick the state tab: **Idle**, **Thinking**, or **Speaking**.
2. Drag your file(s) onto the drop zone, or click **Browse**.
3. For a sprite sheet, enter the **frame width** — frame count is calculated automatically from the image width. Adjust **FPS** (12 is a good starting point).
4. Scrub the preview and hit play to confirm the frames and timing look right.
5. Set **Scale** (25–400%) and **Anchor** if your art sits oddly relative to the cursor.

Authoring guidance — canvas sizes, transparent-edge requirements, sheet layout, and mouth-frame ordering — lives in [`SPRITES.md`](SPRITES.md).

### Sprite Packs

Bundle all three states (plus optional mouth frames and a persona) into a single shareable `.zip`:

- **Settings → Sprites → Export Pack** writes a `.zip` containing the assets and a `pack.json` manifest.
- **Import Pack** validates the manifest and installs everything in one step.

Imported assets are **copied** into the app's data folder, so moving or deleting the originals afterwards is safe.

---

## Setup: a persona

Off by default. **Settings → Persona → Enable persona.**

1. **Name** your companion and optionally set pronouns.
2. Write a **description** — who they are, what they care about, how they relate to you. A few sentences does more than a few paragraphs.
3. **Speech style** — the one field most responsible for how the character actually sounds. Be concrete: *"Dry, clipped sentences. Never apologizes. Uses nautical metaphors."*
4. Optionally add **example dialogue** pairs. These are sent as real conversation turns, which works considerably better than describing the voice in prose.
5. Watch the **assembled prompt preview** at the bottom of the panel. It shows exactly what the model receives and roughly how many tokens the persona adds to every message.

**Greeting** (optional): have the companion say something when it appears. `Static` is recommended — a fixed line costs nothing, appears instantly, and works offline. `Generated` spends a real API call on every launch.

> Enabling a persona while the default `Helpful companion` system prompt is selected will prompt you to switch to the `Persona-driven` preset. The default prompt contains an instruction not to describe itself, which quietly fights any character you write.

> A persona is a **styling instruction**, not a content filter. A model can ignore it and a determined user can talk it out of it. Don't build anything that depends on it holding.

Full authoring guide, template variables, and the `.persona.json` schema: [`PERSONA.md`](PERSONA.md).

---

## Setup: voice output (TTS)

**Off by default.** The app is fully functional and completely silent until you turn this on. Go to **Settings → Voice**.

### Option 1 — Windows built-in (zero setup)

| Field | Value |
|---|---|
| Provider | `Windows (built-in)` |
| Voice | pick from your installed system voices |

No download, no key, no network. It sounds like a GPS unit, but it works immediately and offline. Good for confirming the pipeline works before investing in anything better.

### Option 2 — Kokoro in Docker (free, offline, good quality)

The recommended local setup. Kokoro is a small, fast, Apache-2.0 TTS model that runs faster than real time on CPU.

```bash
docker run -d --name kokoro -p 8880:8880 \
  ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

*(Use the `-gpu` image tag instead if you have CUDA available.)*

| Field | Value |
|---|---|
| Provider | `OpenAI-compatible` |
| Base URL | `http://localhost:8880/v1` |
| API key | *(leave empty)* |
| Model | `kokoro` |
| Voice | click refresh to populate, e.g. `af_bella` |

Click **Test Voice**. It reports time-to-first-audio and speaks a sample sentence.

### Option 3 — Hosted TTS

| Provider | Base URL / notes |
|---|---|
| OpenAI | `https://api.openai.com/v1`, model `tts-1` or `tts-1-hd` |
| ElevenLabs | Select the `ElevenLabs` provider; configure voice ID, model, stability, similarity |
| Anything else | Use the `Custom HTTP` provider — supply the URL, headers, and a body template containing `{{text}}` |

### Mouth sync

If you've supplied mouth frames in **Settings → Sprites → Mouth frames**, enable **Mouth sync** in the Voice panel. The mouth is driven by the amplitude of the audio actually playing, so it can't drift out of sync and it works the same whether the voice is local or hosted.

Order your mouth frames **quietest → loudest**: frame 0 is the closed mouth.

### Behavior worth knowing

- **Barge-in:** typing a new message while the companion is talking stops it immediately by default. Configurable in the Voice panel if you'd rather it finish the sentence or queue.
- **Code blocks** are announced as "code block" rather than read character by character. Changeable, including to fully skipping or fully reading them.
- **A voice failure never blocks the text.** If your container is down or a key expires, you get a toast and the reply still arrives in the bubble.
- **Mute** is in the tray menu and on the bubble itself, separate from the provider setting.

---

## Setup: voice input (STT)

**Off by default.** Until you enable this, the app never calls `getUserMedia`, never requests microphone permission, and never loads any audio capture code. Go to **Settings → Voice Input**.

### Option 1 — Windows dictation (zero setup)

| Field | Value |
|---|---|
| Provider | `Windows dictation` |

Offline, no download, shows live partial results as you speak. Accuracy is noticeably below Whisper, but there's nothing to install.

### Option 2 — Whisper in Docker (free, offline, best accuracy)

```bash
docker run -d --name whisper -p 9000:9000 \
  -e ASR_MODEL=base \
  -e ASR_ENGINE=faster_whisper \
  onerahmet/openai-whisper-asr-webservice:latest
```

*(`ASR_MODEL` accepts `tiny`, `base`, `small`, `medium`, `large-v3` — larger is more accurate and slower. `base` is a good default on CPU.)*

| Field | Value |
|---|---|
| Provider | `OpenAI-compatible` |
| Base URL | `http://localhost:9000/v1` |
| API key | *(leave empty)* |
| Model | `whisper-1` |
| Language | `Auto-detect`, or pin it to your language for better accuracy |

Click **Test Microphone**, speak, and confirm the transcript appears.

### Option 3 — A local whisper.cpp binary (no Docker)

| Field | Value |
|---|---|
| Provider | `Local executable` |
| Executable path | e.g. `C:\tools\whisper\main.exe` |
| Model path | e.g. `C:\tools\whisper\models\ggml-base.en.bin` |

### Option 4 — Hosted

OpenAI's `https://api.openai.com/v1` with model `whisper-1`, or any endpoint via the `Custom HTTP` provider.

### Activation modes

| Mode | How it works |
|---|---|
| **Push-to-talk** *(default)* | Hold `Ctrl + Shift + V`, speak, release |
| **Toggle** | Press to start, press again to stop |
| **Hands-free** | Press once; recording stops automatically when you stop talking |

Transcripts land **in the input box**, not straight into a request. Read it, fix it, then press Enter. Auto-send is available, with an optional cancellable countdown.

> **If push-to-talk falls back to toggle mode:** Windows gives applications no key-release event for global shortcuts, so global PTT needs a low-level keyboard hook. If that hook can't install — most often because security software blocks it — the app switches to toggle mode, tells you once, and saves the change. It will never leave your mic open. PTT while the companion window itself has focus works regardless.

### Microphone privacy

- The mic opens only on an explicit action and closes immediately after — the Windows mic indicator going dark is the confirmation.
- An on-screen indicator is visible the entire time the mic is open. There is no silent recording path.
- Audio is never written to disk unless you explicitly enable the debugging option, which resets to off on every launch.
- With a local STT endpoint, audio never leaves your machine.

---

## Images and screenshots

Available when your model supports vision. The attach button is disabled with an explanatory tooltip when it doesn't.

| Action | How |
|---|---|
| Paste an image | `Ctrl + V` in the input box |
| Attach a file | Paperclip button, or drag onto the input box |
| Capture a screen region | `Ctrl + Shift + S`, then drag |

Up to 4 images per message by default (configurable to 10). Images are downscaled to 1536 px on the longest edge and stripped of EXIF before sending. They go only to your configured model endpoint.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Shift + Space` | Focus the input box from any application |
| `Ctrl + Shift + V` | Voice input (push-to-talk / toggle) |
| `Ctrl + Shift + S` | Region screenshot |
| `Enter` | Send |
| `Shift + Enter` | New line |
| `Esc` | Cancel the reply, stop audio, stop the mic, close the input box |
| Click sprite | Open/close the input box |
| Drag sprite | Move it (snaps to screen edges) |
| Right-click sprite | Context menu |

All three global hotkeys are rebindable in **Settings → General**.

---

## Settings reference

Eight panels, all applied live — no Save button, no restart.

| Panel | Covers |
|---|---|
| **General** | Launch at login, window behavior, global hotkeys, conversation history, updates |
| **Sprites** | Per-state import, sheet metadata, preview, scale, anchor, mouth frames, Sprite Packs |
| **Model** | Provider, base URL, API key, model, temperature, max tokens, system prompt, test connection |
| **Persona** | Character cards, description, speech style, example dialogue, greeting, prompt preview |
| **Voice** | TTS provider, voice, speed, volume, output device, mouth sync, failure behavior |
| **Voice Input** | STT provider, activation mode, input device + level meter, language, transcript handling |
| **Appearance** | Bubble size, position, colors, typography, text reveal, how long it stays open |
| **Advanced** | Click-through mode, performance, proxy, logging, developer tools, reset |

A couple of defaults worth knowing:

- **The bubble stays open for 30 seconds** and pauses that timer while you hover it. Set it to *Only when I dismiss it* if you'd rather close it yourself.
- **Click-through is per-pixel.** Clicks landing on transparent parts of the sprite pass through to whatever is behind. If that misbehaves on your hardware, **Settings → Advanced → Click-through mode** has `Bounding box` and `Never` fallbacks.

---

## Where your data lives

```
%APPDATA%\sprite-companion\
  config.json            settings (no secrets)
  sprites\               your imported sprite assets
  personas\              exported persona cards
  cache\
    masks\               click-through hit-test masks
    tts\                 cached synthesized audio (200 MB cap, LRU)
  logs\
```

**Settings → Advanced** has buttons to open this folder and the logs folder directly.

API keys are **not** in `config.json` — they're in the Windows Credential store via `safeStorage`. Exporting your settings produces a portable JSON file with every secret omitted.

---

## Privacy

- **No telemetry. No analytics. No crash reporting.** There is no setting to turn these off because there is nothing to turn off.
- The only outbound network traffic is to the model, TTS, and STT endpoints **you configure**. Point all three at `localhost` and the app makes no external requests at all.
- Conversation history is in-memory and discarded on quit unless you explicitly opt into permanent storage.
- Microphone audio is never written to disk outside the explicit debug option, which never persists across launches.
- Log redaction of prompts and credentials is **on** by default.

---

## Development

### Stack

Electron + TypeScript (strict) + React 18, bundled with `electron-vite`, packaged with `electron-builder`. Zod validates every config object and every IPC payload on both sides. Zustand holds renderer state.

### Scripts

```bash
npm run dev           # hot-reloading dev build
npm run typecheck     # tsc --noEmit
npm run lint          # eslint + prettier check
npm run test          # vitest unit tests
npm run test:e2e      # playwright _electron smoke tests
npm run build         # production bundle
npm run package       # NSIS installer -> dist/
```

### Layout

```
src/
  main/         app lifecycle, windows, IPC, all network calls
    services/   config, secrets, sprite loading, alpha masks, click-through
    llm/        provider interface + openai-compatible, anthropic, ollama
    tts/        provider interface + implementations
    stt/        provider interface + implementations
    platform/win32/   Windows-only APIs live here and nowhere else
  preload/      narrow contextBridge surface
  renderer/
    pet/        sprite, bubble, input bar, audio
    settings/   the eight panels
  shared/       enums, types
```

**Architectural rules the codebase enforces:**

- **All network calls happen in the main process.** The renderer never holds a key and never issues a request.
- **No generic IPC passthrough.** Every channel is enumerated in `src/main/ipc/channels.ts` and Zod-validated at both ends. There is deliberately no `secret:get` channel.
- **Every enum is defined once** in `src/shared/enums.ts` as a `{ value, label }` pair. Config files and IPC payloads store the kebab-case value; the UI renders the label. Never persist a display string.

### Testing without any network or hardware

Enable **Settings → Advanced → Developer Mode** to expose mock providers in the LLM, TTS, and STT dropdowns. The mock LLM streams fixture replies at a configurable rate (including a deliberately failing one and a never-terminating one for abort testing); the mock TTS emits silent audio with a synthetic amplitude envelope so mouth sync is testable with no sound card; the mock STT returns a fixed transcript and never touches `getUserMedia`.

The entire E2E suite passes with no network access and no audio hardware. If a test needs either, it's written wrong.

Developer Mode also unlocks an FPS/state overlay, a hit-mask visualizer, and a state-override dropdown for checking art without having to talk to the thing.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| **"Nothing is listening at `http://localhost:…`"** | The container or local server isn't running. Check `docker ps`. For Ollama, run `ollama serve`. |
| **Test Connection returns 404** | Base URL suffix. OpenAI-compatible endpoints need `/v1`; Ollama's native provider needs the bare host. |
| **Test Connection returns 401** | Missing or invalid API key. Local servers usually want the field empty — a stale key can cause a 401 against a server that didn't want one at all. |
| **Sprite is a black rectangle** | Content protection (Settings → Advanced) conflicts with transparency on some integrated GPUs. Turn it off. |
| **Can't click apps behind the sprite** | Switch **Settings → Advanced → Click-through mode** to `Bounding box`, or `Never` if you'd rather keep the window always interactive. |
| **Sprite blurry on a second monitor** | Set **Scale mode** to `DPI-aware` in Settings → Sprites. |
| **Sprite vanished** | Tray icon → **Show companion**. If it was on a monitor you've unplugged, it clamps back into view on the next launch. |
| **Sprite hidden over a game** | By design — it hides over exclusive-fullscreen apps. Change **Fullscreen behavior** in Settings → General, or run the game borderless-windowed. |
| **Thinking animation flashes by too fast** | A fast local model can reply in under 100 ms. Raise **Minimum thinking duration** in Settings → Sprites. |
| **Push-to-talk switched itself to toggle** | The global keyboard hook couldn't install, usually blocked by security software. PTT still works while the companion has focus. |
| **Microphone permission denied** | Settings → Voice Input has a button that opens the Windows microphone privacy page directly. |
| **Voice input transcribes the companion's own speech** | Enable **Pause listening while speaking** in Settings → Voice Input (on by default), or switch off hands-free mode. |
| **Voice is silent but no error** | Check the mute toggle (tray menu and bubble), the volume slider, and the output device — a device that disappeared falls back to default only on the next playback. |
| **Settings won't open / app won't start** | A corrupt config is backed up to `config.corrupt.<timestamp>.json` and replaced with defaults automatically. If it persists, delete `%APPDATA%\sprite-companion\config.json`. |

Still stuck: **Settings → Advanced → Log level → `debug`**, reproduce the problem, then **Open Logs Folder**. Prompts and credentials are redacted by default; turn redaction off before sharing a log only if you've read it first.

---

## Non-goals

Deliberately not built, and not planned:

- The sprite **does not wander, pathfind, or move on its own.** Idle loops its animation and nothing else.
- **No proactive messages.** It speaks when spoken to.
- **No wake word, no always-listening mode.** The mic opens on an explicit action, every time.
- **No plugin or extension system.**
- **No persona "jailbreak protection."** A persona is a styling instruction; presenting it as a safety boundary would be dishonest.
- **English only** in v1.

---

## License

GPL 3.0

---

## Further reading

| Document | Contents |
|---|---|
| [`SPRITES.md`](SPRITES.md) | Sprite authoring: canvas sizes, sheet layout, fps, mouth-frame ordering, `pack.json` schema |
| [`PERSONA.md`](PERSONA.md) | Persona authoring, template variables, `.persona.json` schema, worked examples |
| [`VOICE.md`](VOICE.md) | Running voice input and output fully offline, privacy guarantees, voice troubleshooting |
