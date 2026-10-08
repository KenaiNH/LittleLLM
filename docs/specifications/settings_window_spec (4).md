# Settings Window — Complete Control Specification (v3)

> Companion document to `desktop_companion_spec.md` v5. This expands **§7 (Settings Window)** into an exhaustive, build-ready control inventory. Every dropdown option listed here is the **exact display label**; the stored value is the kebab-case counterpart defined in `src/shared/enums.ts` per main spec §0.2. Codex must not invent, rename, reorder, or omit options.
>
> **Changelog from v2**
> - New **§4: Persona** panel (controls 236–267). Sidebar is now eight panels; Voice, Voice Input, Appearance, and Advanced renumber to §5–§8. **Existing control numbers 1–235 are unchanged.**
> - Control 68 gains a `Persona-driven` preset (main spec §6.4.1, conflict C25).
> - Hotkey table gains one binding, numbered **268**.
> - Cross-panel dependency table and Deliberately Excluded list extended.
>
> **Changelog from v1**
> - New **§5: Voice Input** panel (controls 184–232) covering speech-to-text. Sidebar is now seven panels; Appearance and Advanced renumber to §6 and §7. Existing control numbers 1–183 are unchanged.
> - Hotkey table in §1.4 gains three voice-input bindings, numbered **184–186** so existing control numbers are preserved.
> - Cross-panel dependency table extended with all STT bindings.
> - `Speech-to-text / microphone` removed from the Deliberately Excluded list; **wake word** and **always-on listening** added in its place.

---

## 0. Window Chrome & Global Behavior

| Property | Value |
|---|---|
| Window type | Normal OS chrome, resizable, **not** always-on-top |
| Default size | 960 × 680 |
| Minimum size | 820 × 560 |
| Layout | Fixed 200 px left sidebar nav + scrollable right content pane |
| Instance rule | Single instance. Re-invoking focuses the existing window. |
| Open via | Tray menu → Settings · Right-click sprite → Settings · `Ctrl + ,` when sprite focused |
| Close behavior | Closing settings never quits the app |

### Sidebar navigation order

1. General
2. Sprites
3. Model
4. Persona *(character / system prompt)*
5. Voice *(output / TTS)*
6. Voice Input *(microphone / STT)*
7. Appearance
8. Advanced

### Persistent header

- **Search box** (top of sidebar) — fuzzy-filters controls across all panels by label and synonym list. Matching panels stay in the nav; non-matching rows hide. Clearing restores full view.
- Each panel renders a **"Reset this panel to defaults"** text button, bottom-right of the panel body, with a confirm dialog.

### Save semantics

**Live-apply by default.** Toggles, sliders, dropdowns, and radios commit on change and the pet window updates immediately — this is required so sprite scale and bubble appearance can be tuned visually.

**Commit-on-blur exceptions** (debounced 400 ms, or on Enter / focus loss):
- All free-text fields (Base URL, Model ID, System Prompt, Stop Sequences, custom HTTP templates)
- All secret fields

Secrets and endpoint URLs additionally require an explicit **Test Connection** before the green "verified" state is shown. A field may be saved while unverified; it renders with an amber dot and tooltip `Not yet verified`.

### Validation display

Invalid control → red 1 px border + inline message below the row. Invalid values are **not** persisted; the last valid value is retained in the store and the UI keeps the user's text so they can correct it. A panel with any invalid field shows a red dot on its sidebar nav entry.

### Restart badge

Controls that cannot hot-apply render a `Restart required` pill after the label. Changing one surfaces a non-blocking footer bar: `Some changes need a restart. [Restart Now] [Later]`. Controls carrying this badge are marked **⟳** in the tables below.

---

## 1. Panel: General

### 1.1 Startup

| # | Control | Widget | Options / Range | Default | Notes |
|---|---|---|---|---|---|
| 1 | Launch at Windows login | Toggle | — | `Off` | Writes `HKCU\...\Run` via `app.setLoginItemSettings` |
| 2 | Start minimized (sprite hidden) | Toggle | — | `Off` | Disabled unless #1 is On |
| 3 | Show in taskbar | Toggle | — | `Off` | `Off` = tray-only presence |
| 4 | Restore sprite position on launch | Toggle | — | `On` | When Off, uses §1.3 anchor |

### 1.2 Window Behavior

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 5 | When the window is closed | Dropdown | `Minimize to tray` · `Quit the application` | `Minimize to tray` |
| 6 | Hide sprite when a fullscreen app is active | Dropdown | `Never hide` · `Hide for fullscreen apps` · `Hide for fullscreen and exclusive-fullscreen games` | `Hide for fullscreen and exclusive-fullscreen games` |
| 7 | Show on all virtual desktops | Toggle | — | `On` |
| 8 | Hide sprite from screen capture ⟳ | Toggle | — | `Off` |

> Control 8 maps to `win.setContentProtection(true)`. Tooltip must state: *Prevents the sprite from appearing in screen shares and recordings. Some capture tools may ignore this.*

### 1.3 Placement

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 9 | Display | Dropdown | `Follow the cursor` · `Primary display` · *(one entry per connected display, formatted `Display 2 — 2560×1440 @ 150%`)* | `Primary display` |
| 10 | Default anchor | Dropdown | `Top left` · `Top center` · `Top right` · `Middle left` · `Center` · `Middle right` · `Bottom left` · `Bottom center` · `Bottom right` | `Bottom right` |
| 11 | Edge margin | Slider + numeric | `0`–`200` px, step 4 | `24` |
| 12 | Snap to screen edges | Toggle | — | `On` |
| 13 | Snap distance | Slider | `4`–`64` px | `16` |
| 14 | Keep fully on screen | Toggle | — | `On` |

Control 9's dropdown repopulates live on `screen` module `display-added` / `display-removed` / `display-metrics-changed`. A remembered display that disappears falls back to primary without clearing the stored preference.

### 1.4 Hotkeys

Rendered as a table: **Action · Current binding · [Record] · [Clear]**. Recording captures the next chord; Esc aborts recording. Conflicts with an existing app binding show inline `Already assigned to "<action>"` and reject. Conflicts with an OS-reserved combo show `This shortcut is reserved by Windows`.

| # | Action | Default | Clearable |
|---|---|---|---|
| 15 | Open input box / focus companion | `Ctrl + Shift + Space` | Yes |
| 16 | Show / hide sprite | `Ctrl + Shift + H` | Yes |
| 17 | Capture screen region and attach | `Ctrl + Shift + S` | Yes |
| 18 | Send clipboard contents to companion | *(unbound)* | Yes |
| 19 | Toggle click-through | *(unbound)* | Yes |
| 184 | Voice input (push-to-talk / toggle) | `Ctrl + Shift + V` | Yes |
| 185 | Voice input and send immediately | *(unbound)* | Yes |
| 186 | Mute microphone | *(unbound)* | Yes |
| 268 | Cycle to the next persona | *(unbound)* | Yes |
| 20 | Stop speaking / cancel generation | `Esc` **(fixed, non-rebindable)** | No |

Row 20 renders greyed with tooltip *Always available while the companion is generating or speaking, and while the microphone is open.*

Rows 184–186 are hidden entirely when Voice Input → control 187 = `Off (typing only)`. Row 184's behavior depends on **control 208**: in `Push-to-talk (hold the hotkey)` it is hold-to-record, otherwise press-to-toggle. Row 185 always performs a one-shot capture with auto-send regardless of **control 222**.

Row 268 is hidden when Persona → control 236 = `Off` or the library holds fewer than two cards. It advances control 237 to the next card in library order, wrapping, and honors control 267's switch behavior. It shows a brief toast naming the new persona.

### 1.5 Updates

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 21 | Update channel | Dropdown | `Stable` · `Beta` · `Disabled` | `Stable` |
| 22 | Install updates | Dropdown | `Download and install automatically` · `Notify me, let me choose` · `Check only, never download` | `Notify me, let me choose` |
| 23 | — | Button | `Check for Updates Now` | — |

Control 22 is hidden when 21 = `Disabled`.

---

## 2. Panel: Sprites

### 2.1 Per-State Configuration

Render **three identical collapsible sections** in this order: **Idle**, **Thinking**, **Speaking**. Idle expanded by default. Each contains the controls below, namespaced to its state.

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 24 | Source type | Dropdown | `Static image` · `Sprite sheet` · `Image sequence (folder)` | `Static image` |
| 25 | File / folder | Drop zone + `Browse…` | — | *(bundled default)* |
| 26 | Frame width | Numeric | `1`–`8192` px | *(auto)* |
| 27 | Frame height | Numeric | `1`–`8192` px | *(auto)* |
| 28 | Frame count | Numeric | `1`–`512` | *(auto-derived)* |
| 29 | Columns | Numeric | `1`–`512` | *(auto)* |
| 30 | Frame order | Dropdown | `Left to right, then down` · `Top to bottom, then across` | `Left to right, then down` |
| 31 | Playback speed | Slider + numeric | `1`–`60` fps | `12` |
| 32 | Playback mode | Dropdown | `Loop forever` · `Play once, hold last frame` · `Play once, return to idle` · `Ping-pong (loop back and forth)` | see below |
| 33 | Anchor point | Dropdown | `Bottom center` · `Center` · `Top center` · `Bottom left` · `Bottom right` · `Custom…` | `Bottom center` |
| 34 | Custom anchor X / Y | Two numerics | `0.0`–`1.0`, step 0.01 | `0.5` / `1.0` |
| 35 | Preview | Canvas + scrubber + ▶/⏸ | — | — |
| 36 | — | Button | `Reset to Default Sprite` | — |

**Control 32 defaults by state:** Idle = `Loop forever` · Thinking = `Loop forever` · Speaking = `Loop forever`.

**Conditional visibility for 26–30:**

| Source type (24) | Visible fields |
|---|---|
| `Static image` | none — 26–30 all hidden |
| `Sprite sheet` | 26, 27, 28, 29, 30 |
| `Image sequence (folder)` | none (frame count derived from file listing, shown read-only as `N frames detected`) |

Controls 31 and 32 are hidden when 24 = `Static image` **and** the file is not an animated GIF/APNG. For animated GIF/APNG, 31 renders with an extra option row: **Timing source** → `Use the file's own frame delays` · `Override with fixed fps` (default `Use the file's own frame delays`).

Control 34 visible only when 33 = `Custom…`.

### 2.2 Global Sprite Settings

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 37 | Sprite scale | Slider + numeric | `25%`–`400%`, step 5 | `100%` |
| 38 | Scale mode | Dropdown | `Fixed percentage` · `Match display scaling (DPI aware)` | `Match display scaling (DPI aware)` |
| 39 | Flip horizontally | Toggle | — | `Off` |
| 40 | Image smoothing | Dropdown | `Automatic (detect pixel art)` · `Always smooth (bilinear)` · `Never smooth (nearest neighbor)` | `Automatic (detect pixel art)` |
| 41 | Sprite opacity | Slider | `20%`–`100%` | `100%` |
| 42 | State transition | Dropdown | `Instant cut` · `Crossfade` | `Crossfade` |
| 43 | Crossfade duration | Slider | `40`–`500` ms | `120` |
| 44 | Minimum thinking duration | Slider | `0`–`2000` ms | `250` |

Control 43 hidden when 42 = `Instant cut`.
Control 44 tooltip: *Prevents a visible flicker when the model replies almost instantly.*

### 2.3 Mouth Frames (Lip Sync)

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 45 | Enable mouth frames | Toggle | — | `Off` |
| 46 | Driven by | Dropdown | `Audio amplitude` · `Text streaming rate` · `Fixed loop` | `Audio amplitude` |
| 47 | Source type | Dropdown | `Sprite sheet` · `Image sequence (folder)` | `Sprite sheet` |
| 48 | File / folder | Drop zone + `Browse…` | — | — |
| 49 | Frame count | Numeric | `2`–`8` | `3` |
| 50 | Frame order | Static label | `Quietest → loudest` *(read-only convention reminder)* | — |
| 51 | Offset X | Numeric | `-512`–`512` px | `0` |
| 52 | Offset Y | Numeric | `-512`–`512` px | `0` |
| 53 | Sensitivity | Slider | `0.1`–`5.0`, step 0.1 | `1.0` |
| 54 | Smoothing | Slider | `0`–`0.95`, step 0.05 | `0.60` |
| 55 | Silence threshold | Slider | `0`–`0.5`, step 0.01 | `0.04` |
| 56 | — | Button | `Test Mouth Sync` | — |

Entire subsection body (46–56) hidden when 45 = `Off`.
Control 46 option `Audio amplitude` is **disabled with explanatory tooltip** when Voice → TTS Provider = `Off (text only)`; selection silently falls back to `Text streaming rate` at runtime in that case.
Controls 53–55 hidden when 46 = `Fixed loop`.
Control 56 plays a 3-second test tone (or test phrase if TTS is active) and animates the live preview.

### 2.4 Sprite Packs

| # | Control | Widget | Behavior |
|---|---|---|---|
| 57 | Import Sprite Pack | Button | Accepts `.zip` containing `pack.json` + assets. Validates manifest against schema, previews contents, requires confirm before overwriting current states. |
| 58 | Export Sprite Pack | Button | Writes current three states + mouth frames + relevant settings to a `.zip`. |
| 59 | Open Sprites Folder | Button | `shell.openPath(userData/sprites)` |

---

## 3. Panel: Model

### 3.1 Provider

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 60 | Provider | Dropdown | `OpenAI-compatible` · `Anthropic` · `Ollama` · `Mock (testing)` | `OpenAI-compatible` |

`Mock (testing)` is hidden unless Advanced → Developer Mode is On.

**Conditional field matrix by provider:**

| Field | OpenAI-compatible | Anthropic | Ollama | Mock |
|---|---|---|---|---|
| Base URL (61) | ✅ | ✅ (prefilled, locked unless Advanced on) | ✅ | ❌ |
| API Key (62) | ✅ (optional) | ✅ (required) | ❌ | ❌ |
| Model (64) | ✅ | ✅ | ✅ | ❌ |
| Mock reply speed (76) | ❌ | ❌ | ❌ | ✅ |

| # | Control | Widget | Details | Default |
|---|---|---|---|---|
| 61 | Base URL | Text | Must be valid `http(s)://`. Inline hint below: *Local containers typically use `http://localhost:11434` (Ollama) or `http://localhost:8080/v1` (llama.cpp, vLLM, LM Studio).* | `https://api.openai.com/v1` |
| 62 | API key | Password field, masked, `Show` toggle | Stored via `safeStorage`. Displays `••••••••last4` once saved. | *(empty)* |
| 63 | — | Button | `Test Connection` → states: `Idle` / `Testing…` / `Connected — 14 models found` / `Failed: <reason>` | — |
| 64 | Model | **Editable combo box** | Populated from `GET /models` (or `/api/tags` for Ollama) when reachable; always free-text editable. `↻` refresh button adjacent. | `gpt-4o-mini` |
| 65 | Request timeout | Numeric | `5`–`600` s | `120` |
| 66 | Retry attempts | Dropdown | `None` · `1 retry` · `2 retries` · `3 retries` | `2 retries` |

> **Required note for implementer:** when Provider = `OpenAI-compatible` and Base URL is a loopback address, the API key field must render with placeholder `Usually not required for local models` and must **not** block sending when empty.

### 3.2 Generation

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 67 | System prompt | Textarea, 6 rows, monospace | ≤ 8000 chars, live counter | *(see below)* |
| 68 | Prompt preset | Dropdown | `Custom` · `Helpful companion` · `Persona-driven` · `Concise assistant` · `Playful character` · `Technical expert` · `Silent observer` | `Helpful companion` |
| 69 | Temperature | Slider + numeric | `0.0`–`2.0`, step 0.05 | `0.7` |
| 70 | Top P | Slider + numeric | `0.0`–`1.0`, step 0.01 | `1.00` |
| 71 | Max response tokens | Numeric | `64`–`32768` | `1024` |
| 72 | Stop sequences | Tag input | ≤ 4 entries | *(empty)* |
| 73 | Stream responses | Toggle | — | `On` |

Selecting any preset in 68 replaces 67's content and switches 68 to `Custom` the moment the user edits 67.
Control 73 tooltip: *Turning this off disables the typewriter effect and delays all speech until the full reply arrives.*

Default system prompt (`Helpful companion`):
```
You are a desktop companion. Keep replies brief and conversational —
usually one to three sentences. Use Markdown only when it genuinely
helps. Do not describe your own appearance or actions.
```

### 3.3 Conversation Memory

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 74 | Context to send | Dropdown | `No history (single turn)` · `Last 5 exchanges` · `Last 10 exchanges` · `Last 25 exchanges` · `Entire session` · `Fit to token budget` | `Last 10 exchanges` |
| 75 | Token budget | Numeric | `512`–`200000` | `8000` |
| 76 | Save conversations to disk | Dropdown | `Never save` · `Keep for this session only` · `Save permanently` | `Keep for this session only` |
| 77 | — | Button | `Clear Conversation History` *(destructive styling, confirm dialog)* | — |

Control 75 visible only when 74 = `Fit to token budget`.

### 3.4 Image & Attachment Handling

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 78 | Enable image attachments | Toggle | — | `On` |
| 79 | Image detail level | Dropdown | `Automatic` · `Low (cheaper, faster)` · `High (more accurate)` | `Automatic` |
| 80 | Max image dimension | Dropdown | `512 px` · `1024 px` · `1536 px` · `2048 px` · `Do not resize` | `1536 px` |
| 81 | Re-encode format | Dropdown | `Keep original` · `PNG` · `JPEG (quality 85)` · `WebP (quality 85)` | `JPEG (quality 85)` |
| 82 | Max attachments per message | Numeric | `1`–`10` | `4` |

Entire subsection (79–82) hidden when 78 = `Off`.
When the selected model's capability probe reports no vision support, the subsection renders a persistent amber banner: *The selected model may not support images. Attachments will be sent anyway and may be rejected.* — never silently disable.

> **Relationship to the Persona panel (§4).** Control 67 remains the **base** system prompt. The persona block is composed *on top of* it by `buildSystemPrompt()` (main spec §6.4.3). Control 67 must render a read-only link below the textarea: *A persona is active and will be added to this prompt. [View the assembled prompt]* → opens §4.5. Nothing in §3.2 writes to the persona object and nothing in §4 writes to control 67.

---

## 4. Panel: Persona

> Implements main spec §6.4. Entire panel body below control 236 is **unmounted** when 236 = `Off` — same pattern as Voice and Voice Input. A fresh install has this off, and with it off the assembled prompt is byte-identical to control 67.

### 4.1 Enable & Active Persona

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 236 | Give the assistant a persona | Toggle | — | `Off` |
| 237 | Active persona | Dropdown | *(one entry per card in the library)* · `— None —` | `— None —` |

Control 236 tooltip: *Adds a character description to every message. This increases token use on each request.*

When 236 is switched On and control 68 = `Helpful companion`, auto-switch 68 to `Persona-driven` and show a one-time inline note: *Your system prompt told the assistant not to describe itself. Switched to the persona-friendly preset.* When 68 = `Custom`, show the same note with a `Fix it for me` button and **do not modify the text**.

Switching 237 while a conversation is in progress triggers the behavior in control 267.

### 4.2 Identity

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 238 | Name | Text | 1–48 chars, required | `Companion` |
| 239 | Pronouns | Dropdown | `Not specified` · `she/her` · `it/its` · `he/him` · `they/them` · `Custom…` | `Not specified` |
| 240 | Custom pronouns | Text | ≤ 32 chars | *(empty)* |
| 241 | Who they are | Textarea, 8 rows | ≤ 4000 chars, live counter | *(empty)* |
| 242 | How they speak | Textarea, 4 rows | ≤ 1000 chars, live counter | *(empty)* |
| 243 | — | Button | `Insert a variable ▾` → menu of `{{persona.name}}` · `{{user.name}}` · `{{date}}` · `{{time}}` · `{{weekday}}` · `{{app.state}}` | — |

Control 240 visible only when 239 = `Custom…`.
Control 241 placeholder: *A small cat-shaped assistant who lives on the desktop. Curious, a little sarcastic, genuinely helpful when it counts.*
Control 242 placeholder: *Short sentences. Dry humor. Never uses exclamation marks.*
Unrecognized `{{...}}` in 241/242 renders an amber inline warning listing the unknown names; the text is **not** altered.

### 4.3 Example Dialogue

| # | Control | Widget | Behavior |
|---|---|---|---|
| 244 | Example exchanges | Repeatable row list, max 8 | Each row = a `You said` text field and a `They replied` text field, ≤ 500 chars each, with a drag handle and a delete `×`. `+ Add an exchange` button below. |

Help text below the list: *These are sent as real example messages before your conversation. Two or three good examples shape the voice more than a long description does.*
Empty rows (either field blank) are **dropped at assembly time**, not saved as blanks.

### 4.4 Context & Behavior

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 245 | What they know about you | Textarea, 3 rows | ≤ 1000 chars | *(empty)* |
| 246 | What to call you | Text | ≤ 64 chars | *(empty)* |
| 247 | Where the persona goes | Dropdown | `After my system prompt` · `Replace my system prompt` · `Before my system prompt` | `After my system prompt` |
| 248 | Reply length | Dropdown | `Follow my system prompt` · `One or two sentences` · `A short paragraph` · `No limit` | `One or two sentences` |
| 249 | Staying in character | Dropdown | `Always stay in character` · `Drop character for technical answers` · `No instruction` | `Drop character for technical answers` |
| 250 | Allow actions in asterisks | Toggle | — | `Off` |

Control 246 placeholder: *Your name — leave blank and they'll say "there".*
Control 250 tooltip: *Lets the assistant write things like \*tilts head\*. Off by default because it adds length to every reply.*
Control 247 option `Replace my system prompt` renders an amber hint: *Your system prompt will not be sent at all.*

### 4.5 Assembled Prompt Preview

| # | Control | Widget | Behavior |
|---|---|---|---|
| 251 | Token estimate | Read-only label | `Persona adds ~N tokens to every message` — live, recomputed on any change to 238–250. Amber above 8000 chars, red above 16000. |
| 252 | — | Button | `Show the assembled prompt` → expands a read-only monospace block showing the exact final system string plus the example-dialogue turns, with the base prompt and persona block visually delimited. |
| 253 | — | Button | `Test this persona` → sends a fixed probe (`Say hello and tell me one thing about yourself.`) and shows the reply inline. Does **not** touch conversation history. |

Above 16000 characters, 252's block renders a red banner: *This is too long to send. Shorten the description or remove some examples.* and sending is blocked until resolved — the prompt is **never** silently truncated.

### 4.6 Greeting

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 254 | Say something on launch | Dropdown | `Don't greet me` · `Show a fixed message` · `Ask the model for a greeting` | `Don't greet me` |
| 255 | Greeting text | Textarea, 2 rows | ≤ 500 chars | *(empty)* |
| 256 | Greeting instruction | Text | ≤ 500 chars | `Greet me in one short sentence.` |
| 257 | How often | Dropdown | `Once per launch` · `Every time the sprite appears` · `Once a day` | `Once per launch` |
| 258 | Wait before greeting | Slider | `0`–`30` s, step 0.5 | `3.0` s |
| 259 | Speak the greeting aloud | Toggle | — | `On` |

255 visible only when 254 = `Show a fixed message`. 256 visible only when 254 = `Ask the model for a greeting`.
257–259 hidden when 254 = `Don't greet me`. 259 hidden when Voice → TTS provider = `Off (text only)`.
Control 254 option `Show a fixed message` carries the hint: *Free and instant — no request is sent.* Option `Ask the model for a greeting` carries: *Sends one request each time it fires.*

### 4.7 Persona Library

| # | Control | Widget | Behavior |
|---|---|---|---|
| 260 | Preferred voice for this persona | Editable combo box | Populated from Voice → voice list. `— Use my default voice —` is the first option and the default. Applies only while this card is active. |
| 261 | — | Button | `Save as a new persona` — snapshots 238–260 into the library with a new UUID. |
| 262 | — | Button | `Duplicate this persona` |
| 263 | — | Button | `Delete this persona` *(destructive styling, confirm dialog)* |
| 264 | — | Button | `Export persona…` → writes `<name>.persona.json` |
| 265 | — | Button | `Import persona…` → accepts `.persona.json`, Zod-validated, rejects files > 64 KB, previews before applying |
| 266 | Personas bundled in Sprite Packs | Dropdown | `Ask me before applying` · `Apply automatically` · `Always ignore them` | `Ask me before applying` |
| 267 | When I switch personas | Dropdown | `Start a new conversation` · `Keep the current conversation` · `Ask me each time` | `Start a new conversation` |

Control 260 hidden when Voice → TTS provider = `Off (text only)`.
Control 263 is disabled when the library has one card and it is active; deleting the last card sets 236 to `Off`.
Library cap is 50 cards; `Save as a new persona` is disabled at the cap with a tooltip.
An imported persona that carries a `voiceOverride` shows it as a **separate, unchecked checkbox** in the import preview — voice is never applied without explicit consent, even under `Apply automatically`.

---

## 5. Panel: Voice

### 5.1 Provider

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 83 | Text-to-speech provider | Dropdown | `Off (text only)` · `Windows built-in (SAPI)` · `OpenAI-compatible endpoint` · `ElevenLabs` · `Custom HTTP endpoint` | `Off (text only)` |

**When 83 = `Off (text only)`, the entire remainder of the Voice panel unmounts** and is replaced by a single explanatory line: *The companion will respond in text only. The speaking animation will follow the text as it streams in.* No greyed-out controls.

### 5.2 Provider-Specific Fields

**`Windows built-in (SAPI)`**

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 84 | Voice | Dropdown | *(enumerated from `Windows.Media.SpeechSynthesis.AllVoices`, e.g. `Microsoft David — English (United States)`)* | *(system default)* |
| 85 | Pitch | Slider | `-10`–`+10` | `0` |

**`OpenAI-compatible endpoint`**

| # | Control | Widget | Details | Default |
|---|---|---|---|---|
| 86 | Base URL | Text | Hint: *Kokoro-FastAPI in Docker typically runs at `http://localhost:8880/v1`. LocalAI uses `http://localhost:8080/v1`.* | `https://api.openai.com/v1` |
| 87 | API key | Password, masked | Optional for local endpoints | *(empty)* |
| 88 | Model | Editable combo | e.g. `tts-1`, `tts-1-hd`, `kokoro` | `tts-1` |
| 89 | Voice | Editable combo | Populated when endpoint exposes a voice list; else free text (`alloy`, `af_bella`, …) | `alloy` |
| 90 | Audio format | Dropdown | `MP3` · `Opus` · `AAC` · `FLAC` · `WAV` · `PCM` | `MP3` |

**`ElevenLabs`**

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 91 | API key | Password, masked, required | — | *(empty)* |
| 92 | Voice | Dropdown, fetched from `/v1/voices` | — | *(first available)* |
| 93 | Model | Dropdown | `Flash v2.5 (fastest, cheapest)` · `Turbo v2.5` · `Multilingual v2 (highest quality)` | `Flash v2.5 (fastest, cheapest)` |
| 94 | Stability | Slider | `0.0`–`1.0` | `0.50` |
| 95 | Similarity boost | Slider | `0.0`–`1.0` | `0.75` |
| 96 | Style exaggeration | Slider | `0.0`–`1.0` | `0.00` |
| 97 | Speaker boost | Toggle | — | `On` |

**`Custom HTTP endpoint`**

| # | Control | Widget | Details | Default |
|---|---|---|---|---|
| 98 | Request URL | Text | Required | *(empty)* |
| 99 | HTTP method | Dropdown | `POST` · `GET` | `POST` |
| 100 | Headers | Key/value row editor | Values may reference `{{apiKey}}` | *(empty)* |
| 101 | API key | Password, masked | Injected wherever `{{apiKey}}` appears | *(empty)* |
| 102 | Body template | Textarea, monospace | Must contain `{{text}}`. Also supports `{{voice}}`, `{{speed}}`. JSON-validated on blur. | `{"text": "{{text}}"}` |
| 103 | Response type | Dropdown | `Raw audio bytes` · `Base64 string in JSON field` · `URL in JSON field` | `Raw audio bytes` |
| 104 | JSON field path | Text | e.g. `data.audio` | *(empty)* |
| 105 | Audio format | Dropdown | `MP3` · `WAV` · `Opus` · `OGG` · `PCM 16-bit 24kHz` | `MP3` |

Control 104 visible only when 103 ≠ `Raw audio bytes`.

### 5.3 Playback (shared across all providers)

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 106 | Output device | Dropdown | `System default` · *(one entry per enumerated output device)* | `System default` |
| 107 | Volume | Slider | `0%`–`100%` | `80%` |
| 108 | Speaking rate | Slider + numeric | `0.5×`–`2.0×`, step 0.05 | `1.00×` |
| 109 | Begin speaking | Dropdown | `As soon as the first sentence is ready` · `After the full reply arrives` | `As soon as the first sentence is ready` |
| 110 | If I send a new message while speaking | Dropdown | `Stop speaking immediately` · `Finish the current sentence, then stop` · `Queue the new reply` | `Stop speaking immediately` |
| 111 | — | Button | `Test Voice` — synthesizes `Hello. I'm your desktop companion.` and drives the live mouth preview | — |

### 5.4 Text Processing

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 112 | Code blocks | Dropdown | `Skip silently` · `Say "code block"` · `Read the code aloud` | `Say "code block"` |
| 113 | Links | Dropdown | `Read the link text only` · `Read the full URL` · `Skip links` | `Read the link text only` |
| 114 | Emoji | Dropdown | `Skip` · `Read the description` | `Skip` |
| 115 | Max characters per reply | Numeric | `100`–`20000` | `4000` |
| 116 | Cache synthesized audio | Toggle | — | `On` |
| 117 | If speech fails | Dropdown | `Fall back to text only` · `Fall back to Windows SAPI` · `Show an error notification` | `Fall back to text only` |

Control 115 tooltip: *Longer replies are truncated for speech only. The full text always appears in the bubble.*
Control 117 option `Fall back to Windows SAPI` is hidden when 83 = `Windows built-in (SAPI)`.

---

## 6. Panel: Voice Input

> Mirrors the Voice panel's structure exactly: provider dropdown first, provider-specific fields conditionally, then shared capture/processing settings. Numbering continues at **187** (184–186 are the hotkeys in §1.4).

### 6.1 Provider

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 187 | Speech-to-text provider | Dropdown | `Off (typing only)` · `Windows built-in dictation` · `OpenAI-compatible endpoint (Whisper)` · `Local Whisper executable` · `Custom HTTP endpoint` · `Mock (testing)` | `Off (typing only)` |

`Mock (testing)` is hidden unless Advanced → Developer Mode (178) is On. It returns a fixed transcript from a bundled fixture without opening the microphone.

**When 187 = `Off (typing only)`, the entire remainder of the panel unmounts**, replaced by a single line: *Voice input is disabled. The microphone will never be accessed. The companion accepts typed input only.* No greyed-out controls, no mic button on the sprite, no microphone permission request.

Directly beneath 187, a **permission status row** renders whenever 187 ≠ `Off (typing only)`:

| State | Display |
|---|---|
| Not yet requested | Grey dot · *Microphone access will be requested the first time you use voice input.* |
| Granted | Green dot · *Microphone access granted.* |
| Denied | Red dot · *Windows is blocking microphone access.* + button `Open Windows Microphone Settings` → `ms-settings:privacy-microphone` |
| No device found | Amber dot · *No microphone detected.* + `↻ Rescan` |

### 6.2 Provider-Specific Fields

**`Windows built-in dictation`**

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 188 | Recognition language | Dropdown | *(enumerated from installed Windows speech packs, e.g. `English (United States)`)* | *(system default)* |
| 189 | Show live partial results | Toggle | — | `On` |

Help text: *Uses the speech recognition built into Windows. No download, no internet, no API key. Accuracy is lower than Whisper. Additional languages require installing a speech pack in Windows Settings.*

**`OpenAI-compatible endpoint (Whisper)`**

| # | Control | Widget | Details | Default |
|---|---|---|---|---|
| 190 | Base URL | Text | Hint: *A local Whisper container typically runs at `http://localhost:9000/v1`. faster-whisper-server and LocalAI also use this shape.* | `https://api.openai.com/v1` |
| 191 | API key | Password, masked, `Show` toggle | Optional for local endpoints; placeholder `Usually not required for local models` when the URL is loopback | *(empty)* |
| 192 | Model | Editable combo | e.g. `whisper-1`, `Systran/faster-whisper-large-v3`, `base.en` | `whisper-1` |
| 193 | — | Button | `Test Connection` → `Idle` / `Testing…` / `Connected — responded in 340 ms` / `Failed: <reason>` | — |

**`Local Whisper executable`**

| # | Control | Widget | Details | Default |
|---|---|---|---|---|
| 194 | Executable path | Text + `Browse…` | Path to `whisper-cli.exe`, `main.exe`, or `faster-whisper.exe`. Validated on blur: must exist and be executable. | *(empty)* |
| 195 | Model file path | Text + `Browse…` | e.g. `ggml-base.en.bin`. Validated on blur. | *(empty)* |
| 196 | Extra arguments | Tag input | One argv token per tag. **Never shell-interpolated.** Hint: *Each tag is passed as a separate argument. Do not include the audio file path; it is added automatically.* | *(empty)* |
| 197 | Output parsing | Dropdown | `JSON (--output-json)` · `Plain text (stdout)` | `JSON (--output-json)` |
| 198 | — | Button | `Test Executable` — runs a bundled 2-second sample clip and shows the returned transcript plus wall-clock time | — |

**`Custom HTTP endpoint`**

| # | Control | Widget | Details | Default |
|---|---|---|---|---|
| 199 | Request URL | Text | Required | *(empty)* |
| 200 | HTTP method | Dropdown | `POST` · `PUT` | `POST` |
| 201 | Headers | Key/value row editor | Values may reference `{{apiKey}}` | *(empty)* |
| 202 | API key | Password, masked | Injected wherever `{{apiKey}}` appears | *(empty)* |
| 203 | How to send the audio | Dropdown | `Multipart form file` · `Raw request body` · `Base64 string in JSON` | `Multipart form file` |
| 204 | Audio field name | Text | The form field or JSON key holding the audio | `file` |
| 205 | Additional form fields | Key/value row editor | Sent alongside the audio; supports `{{language}}` | *(empty)* |
| 206 | Transcript location | Text | Dot path into the JSON response, e.g. `text` or `results.0.transcript` | `text` |
| 207 | Audio format to send | Dropdown | `WAV 16-bit 16 kHz` · `WAV 16-bit 48 kHz` · `FLAC` · `Opus (OGG)` · `MP3` | `WAV 16-bit 16 kHz` |

Control 204 hidden when 203 = `Raw request body`.

### 6.3 Activation

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 208 | How voice input starts | Dropdown | `Push-to-talk (hold the hotkey)` · `Toggle (press to start, press to stop)` · `Hands-free (stops when you stop talking)` | `Push-to-talk (hold the hotkey)` |
| 209 | Show a microphone button on the input box | Toggle | — | `On` |
| 210 | Stop listening after silence | Slider | `0.3`–`5.0` s, step 0.1 | `0.9` |
| 211 | Maximum recording length | Slider + numeric | `5`–`300` s | `120` |
| 212 | Play a sound when recording starts / stops | Toggle | — | `On` |
| 213 | Pause listening while the companion is speaking | Toggle | — | `On` |

Control 210 hidden when 208 = `Push-to-talk (hold the hotkey)` (release ends the utterance).
Control 213 visible only when Voice → 83 ≠ `Off (text only)`.

> **Required implementer note.** Electron's `globalShortcut` provides no key-up event, so global push-to-talk requires a low-level keyboard hook. If the hook fails to install, the app must automatically switch control 208 to `Toggle (press to start, press to stop)`, persist that change, and show a one-time toast: *Push-to-talk needs a keyboard hook that could not be started. Voice input has been switched to toggle mode.* The microphone must never be left open.

### 6.4 Input Device

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 214 | Microphone | Dropdown | `System default` · *(one entry per enumerated input device)* | `System default` |
| 215 | Input level | **Live meter**, read-only | Horizontal bar, 0–100, updating only while the panel is open | — |
| 216 | Input gain | Slider | `0.5×`–`4.0×`, step 0.1 | `1.0×` |
| 217 | Noise suppression | Dropdown | `Browser default` · `Aggressive` · `Off` | `Browser default` |
| 218 | Echo cancellation | Toggle | — | `On` |
| 219 | Voice detection sensitivity | Slider | `Low` ←→ `High` (maps to `vadThreshold` 0.08 → 0.005) | *(midpoint, 0.02)* |
| 220 | — | Button | `Test Microphone` — records 3 s, plays it back, then transcribes it with the configured provider and shows the result | — |

Control 215 opens the mic **only while the Voice Input panel is visible and 187 ≠ `Off`**, and releases it on panel blur or window close. Show a small *Microphone active for level preview* caption beside the meter.
Control 219 hidden when 208 = `Push-to-talk (hold the hotkey)`.
If the selected device in 214 is a loopback/"Stereo Mix"-style monitor device, render an amber warning: *This looks like a playback-monitoring device. The companion may transcribe its own voice.*

### 6.5 Transcription Handling

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 221 | Spoken language | Dropdown | `Detect automatically` · *(ISO language list, e.g. `English`, `Spanish`, `Japanese`)* | `Detect automatically` |
| 222 | What to do with the transcript | Dropdown | `Put it in the input box and wait` · `Send it immediately` · `Send after a short countdown` | `Put it in the input box and wait` |
| 223 | Countdown before sending | Slider | `0.5`–`5.0` s, step 0.5 | `1.5` |
| 224 | Show words as I speak | Toggle | — | `On` |
| 225 | Insert transcript | Dropdown | `At the cursor` · `Replace everything in the box` · `Append to the end` | `At the cursor` |
| 226 | Capitalize and punctuate | Toggle | — | `On` |
| 227 | Recognize spoken punctuation | Toggle | — | `Off` |
| 228 | Remove filler words | Toggle | — | `Off` |
| 229 | Custom vocabulary | Textarea, 3 rows | Comma-separated names/terms sent as a biasing prompt. ≤ 1000 chars. Hint: *Helps the engine recognize unusual names, jargon, and acronyms.* | *(empty)* |
| 230 | Discard transcripts below confidence | Slider | `0%`–`90%` | `0%` |
| 231 | If transcription fails | Dropdown | `Show an error and keep what I typed` · `Fall back to Windows dictation` · `Silently discard` | `Show an error and keep what I typed` |

Control 223 visible only when 222 = `Send after a short countdown`.
Control 224 is disabled with tooltip *This provider returns the full transcript at once.* when the selected provider is batch-only (everything except `Windows built-in dictation`).
Control 227 tooltip: *Turns the spoken words "period", "comma", and "new line" into characters. Most Whisper models already punctuate — leaving this off is usually better.*
Control 230 tooltip: *Not all engines report confidence. When unavailable, every transcript is kept.*
Control 231 option `Fall back to Windows dictation` hidden when 187 = `Windows built-in dictation`.

### 6.6 Privacy

Rendered as a read-only informational block, **not** controls, above the panel's reset button:

- *The microphone opens only when you activate voice input, and closes the moment the utterance ends.*
- *Recorded audio is held in memory and discarded after transcription. It is never written to disk.*
- *With a local provider, no audio leaves this computer.*
- Dynamic line, reflecting current config: *Current provider sends audio to:* `this computer only` **or** the resolved hostname of 190/199.

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 232 | Include transcripts in logs | Toggle | — | `Off` |

Control 232 is force-disabled and locked `Off` when Advanced → 171 (`Redact prompts and replies from logs`) is `On`, with tooltip *Disabled because log redaction is enabled in Advanced.*

---

## 7. Panel: Appearance

### 7.1 Chat Bubble — Size & Position

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 118 | Bubble scale | Slider + numeric | `50%`–`250%`, step 5 | `100%` |
| 119 | Scale is relative to | Dropdown | `The sprite's size` · `A fixed pixel size` · `The screen size` | `The sprite's size` |
| 120 | Maximum width | Numeric | `160`–`1200` px | `380` |
| 121 | Maximum height | Numeric | `80`–`1000` px | `420` |
| 122 | Bubble placement | Dropdown | `Automatic (avoid screen edges)` · `Above the sprite` · `Below the sprite` · `Left of the sprite` · `Right of the sprite` | `Automatic (avoid screen edges)` |
| 123 | Gap from sprite | Slider | `0`–`80` px | `12` |
| 124 | Show bubble tail | Toggle | — | `On` |

Controls 120–121 are the pre-scale base values; the rendered maximum is `value × scale`. Both hidden when 119 = `The screen size`, replaced by:

| # | Control | Widget | Range | Default |
|---|---|---|---|---|
| 125 | Max width (% of screen) | Slider | `10%`–`60%` | `25%` |
| 126 | Max height (% of screen) | Slider | `10%`–`80%` | `40%` |

### 7.2 Chat Bubble — Scrolling

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 127 | Scrollbar | Dropdown | `Show while scrolling` · `Always show` · `Never show` | `Show while scrolling` |
| 128 | Auto-scroll to newest text | Toggle | — | `On` |
| 129 | Mouse wheel over bubble | Dropdown | `Scrolls the bubble` · `Passes through to the window behind` | `Scrolls the bubble` |

> **Required behavior, not user-configurable:** when 128 is On and the user manually scrolls up, auto-scroll suspends and a `↓ New messages` affordance appears at the bubble's bottom edge. Auto-scroll resumes when the user returns to the bottom or clicks the affordance.

### 7.3 Chat Bubble — Style

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 130 | Theme | Dropdown | `Follow Windows` · `Light` · `Dark` · `High contrast` · `Custom` | `Follow Windows` |
| 131 | Background color | Color picker + hex | — | *(theme)* |
| 132 | Text color | Color picker + hex | — | *(theme)* |
| 133 | Accent color | Color picker + hex | — | `#5B8DEF` |
| 134 | Background opacity | Slider | `20%`–`100%` | `95%` |
| 135 | Background blur | Dropdown | `None` · `Subtle` · `Strong (acrylic)` | `Subtle` |
| 136 | Corner radius | Slider | `0`–`32` px | `14` |
| 137 | Padding | Slider | `4`–`32` px | `12` |
| 138 | Border | Dropdown | `None` · `Thin` · `Thick` | `Thin` |
| 139 | Drop shadow | Dropdown | `None` · `Soft` · `Strong` | `Soft` |

Controls 131–133 visible only when 130 = `Custom`.

### 7.4 Chat Bubble — Text

| # | Control | Widget | Options / Range | Default |
|---|---|---|---|---|
| 140 | Font | Dropdown | `System UI default` · *(enumerated installed families)* | `System UI default` |
| 141 | Font size | Slider + numeric | `10`–`28` px | `14` |
| 142 | Line height | Slider | `1.0`–`2.2`, step 0.05 | `1.45` |
| 143 | Render Markdown | Toggle | — | `On` |
| 144 | Code block theme | Dropdown | `Match bubble theme` · `GitHub Light` · `GitHub Dark` · `Monokai` · `Solarized Dark` | `Match bubble theme` |
| 145 | Text reveal | Dropdown | `Appear instantly` · `Typewriter by character` · `Typewriter by word` | `Typewriter by word` |
| 146 | Reveal speed | Slider | `10`–`200` units/sec | `45` |
| 147 | Match reveal speed to speech | Toggle | — | `On` |

Control 144 hidden when 143 = `Off`.
Control 146 hidden when 145 = `Appear instantly`.
Control 147 visible only when Voice → 83 ≠ `Off (text only)`; when On, control 146 is disabled with tooltip *Reveal speed is being matched to the voice.*

### 7.5 Bubble Lifetime

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 148 | Hide the bubble | Dropdown | `Only when I dismiss it` · `After 10 seconds` · `After 20 seconds` · `After 30 seconds` · `After 60 seconds` | `After 30 seconds` |
| 149 | Keep open while the mouse is over it | Toggle | — | `On` |
| 150 | Wait for speech to finish before hiding | Toggle | — | `On` |

Control 149 hidden when 148 = `Only when I dismiss it`.
Control 150 visible only when Voice → 83 ≠ `Off (text only)`.

### 7.6 Input Box

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 151 | Open the input box on | Dropdown | `Single click` · `Double click` · `Hotkey only` | `Single click` |
| 152 | Send message with | Dropdown | `Enter` · `Ctrl + Enter` | `Enter` |
| 153 | Input box width | Dropdown | `Match the bubble width` · `Compact` · `Wide` | `Match the bubble width` |
| 154 | Keep the input box open after sending | Toggle | — | `Off` |
| 155 | Remember draft text | Toggle | — | `On` |

When 152 = `Enter`, Shift+Enter inserts a newline. When 152 = `Ctrl + Enter`, plain Enter inserts a newline.

---

## 8. Panel: Advanced

### 8.1 Interaction

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 156 | Click-through mode | Dropdown | `Per-pixel (alpha mask)` · `Bounding box only` · `Never click through` | `Per-pixel (alpha mask)` |
| 157 | Transparency threshold | Slider | `1`–`254` | `10` |
| 158 | Hit-test sample rate | Dropdown | `Every frame` · `Every 2nd frame` · `Every 4th frame` | `Every 2nd frame` |
| 159 | Allow dragging the sprite | Toggle | — | `On` |
| 160 | Drag requires modifier key | Dropdown | `No modifier` · `Hold Alt` · `Hold Ctrl` · `Hold Shift` | `No modifier` |

Controls 157–158 visible only when 156 = `Per-pixel (alpha mask)`.
Control 157 tooltip: *Pixels with alpha below this value let clicks pass through to whatever is behind the companion.*
Control 160 visible only when 159 = `On`.

### 8.2 Performance

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 161 | Animation frame rate cap | Dropdown | `Match display refresh rate` · `60 fps` · `30 fps` · `15 fps (battery saver)` | `Match display refresh rate` |
| 162 | Pause animation when sprite is not visible | Toggle | — | `On` |
| 163 | Reduce frame rate on battery power | Toggle | — | `On` |
| 164 | Hardware acceleration ⟳ | Toggle | — | `On` |
| 165 | Sprite cache size | Dropdown | `64 MB` · `128 MB` · `256 MB` · `512 MB` | `128 MB` |

### 8.3 Network

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 166 | Proxy | Dropdown | `Use Windows system proxy` · `No proxy (direct)` · `Manual configuration` | `Use Windows system proxy` |
| 167 | Proxy URL | Text | `http://host:port` or `socks5://host:port` | *(empty)* |
| 168 | Bypass proxy for | Text | Comma-separated; hint: *`localhost, 127.0.0.1` recommended for local models* | `localhost, 127.0.0.1` |
| 169 | Allow self-signed certificates | Toggle | — | `Off` |

Controls 167–168 visible only when 166 = `Manual configuration`.
Control 169 renders with a red warning icon and tooltip: *Only enable this for local endpoints you control.*

### 8.4 Data & Diagnostics

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 170 | Log level | Dropdown | `Errors only` · `Warnings` · `Info` · `Debug` · `Trace (verbose)` | `Warnings` |
| 171 | Redact prompts and replies from logs | Toggle | — | `On` |
| 172 | — | Button | `Open Logs Folder` | — |
| 173 | — | Button | `Open Config Folder` | — |
| 174 | — | Button | `Export Settings…` *(writes JSON, secrets excluded)* | — |
| 175 | — | Button | `Import Settings…` *(validates, confirms, backs up current first)* | — |
| 176 | — | Button | `Reset All Settings` *(destructive, type-to-confirm)* | — |
| 177 | — | Button | `Clear Stored API Keys` *(destructive, confirm)* | — |
| 235 | — | Button | `Clear Audio Cache` — shows current cache size beside the button, e.g. `Clear Audio Cache (42 MB)` | — |

Control 235 is hidden when Voice → 83 = `Off (text only)` **or** Voice → 116 (`Cache synthesized audio`) = `Off`.

Control 174's exported file must include `schemaVersion`. Import runs the migration chain forward and rejects configs with a `schemaVersion` **higher** than the running app's, with message *This settings file was created by a newer version of the app.*

### 8.5 Developer

| # | Control | Widget | Options | Default |
|---|---|---|---|---|
| 178 | Developer mode | Toggle | — | `Off` |
| 179 | — | Button | `Open DevTools (Sprite Window)` | — |
| 180 | — | Button | `Open DevTools (Settings Window)` | — |
| 181 | Show hit-test mask overlay | Toggle | — | `Off` |
| 182 | Show FPS and frame time | Toggle | — | `Off` |
| 183 | Force state | Dropdown | `Automatic` · `Idle` · `Thinking` · `Speaking` · `Listening` | `Automatic` |
| 233 | Save the last recording to disk for debugging | Toggle | — | `Off` |
| 234 | Show microphone level and VAD state overlay | Toggle | — | `Off` |

Controls 179–183, 233–234 visible only when 178 = `On`. Enabling 178 also reveals `Mock (testing)` in control 60 and `Mock (testing)` in control 187.

Control 233 renders with a red warning icon and tooltip: *Writes raw microphone audio to the logs folder. Leave this off unless you are diagnosing a transcription problem.* Turning it on shows a persistent banner in the Voice Input panel while active, and it **resets to `Off` on every app launch** — it is never sticky.

### 8.6 About

Read-only block: app version, Electron version, Chromium version, Node version, `schemaVersion`, config file path, license, and a `Check for Updates` button.

---

## 8. Cross-Panel Dependency Summary

Codex must implement these as reactive bindings, not one-time render checks. Every dependency re-evaluates on change of its source.

| Source control | Target | Effect |
|---|---|---|
| 83 Voice provider = `Off (text only)` | Voice panel body | Unmount entirely |
| 83 Voice provider = `Off (text only)` | 46 Mouth driver option `Audio amplitude` | Disable option, fall back to `Text streaming rate` |
| 83 Voice provider = `Off (text only)` | 147, 150 | Hide |
| 83 Voice provider = `Windows built-in (SAPI)` | 117 option `Fall back to Windows SAPI` | Hide option |
| 45 Mouth frames = `Off` | 46–56 | Hide |
| 60 Provider | 61, 62, 64, 76 | Show/hide per §3.1 matrix |
| 60 Provider vision capability = false | 79–82 subsection | Show amber banner (do **not** disable) |
| 78 Image attachments = `Off` | 79–82 | Hide |
| 24 Source type | 26–32 | Show/hide per §2.1 matrix |
| 33 Anchor = `Custom…` | 34 | Show |
| 42 Transition = `Instant cut` | 43 | Hide |
| 119 Scale relative to = `The screen size` | 120–121 → 125–126 | Swap control pair |
| 130 Theme ≠ `Custom` | 131–133 | Hide |
| 143 Markdown = `Off` | 144 | Hide |
| 145 Reveal = `Appear instantly` | 146 | Hide |
| 147 Match to speech = `On` | 146 | Disable (visible, greyed) |
| 148 Hide bubble = `Only when I dismiss it` | 149 | Hide |
| 156 Click-through ≠ `Per-pixel (alpha mask)` | 157–158 | Hide |
| 159 Dragging = `Off` | 160 | Hide |
| 166 Proxy ≠ `Manual configuration` | 167–168 | Hide |
| 178 Developer mode = `Off` | 179–183, and `Mock (testing)` in 60 | Hide |
| 21 Update channel = `Disabled` | 22 | Hide |
| 1 Launch at login = `Off` | 2 | Disable |
| **187 STT provider = `Off (typing only)`** | Voice Input panel body | Unmount entirely |
| 187 STT provider = `Off (typing only)` | Hotkeys 184–186 in §1.4 | Hide rows |
| 187 STT provider = `Off (typing only)` | Mic button on the sprite input bar | Hide; never call `getUserMedia` |
| 187 STT provider = `Windows built-in dictation` | 231 option `Fall back to Windows dictation` | Hide option |
| 187 STT provider ≠ `Windows built-in dictation` | 224 Show words as I speak | Disable with "batch provider" tooltip |
| 187 STT provider | 188–207 | Show/hide the matching provider block only |
| 208 Activation = `Push-to-talk (hold the hotkey)` | 210, 219 | Hide |
| 208 Activation = `Push-to-talk`, keyboard hook unavailable | 208 | **Force to `Toggle`, persist, toast once** |
| 83 TTS provider = `Off (text only)` | 213 Pause listening while speaking | Hide |
| 203 Audio upload mode = `Raw request body` | 204 | Hide |
| 222 Transcript action ≠ `Send after a short countdown` | 223 | Hide |
| 171 Redact logs = `On` | 232 Include transcripts in logs | Force `Off` and disable |
| 178 Developer mode = `Off` | 233, 234, and `Mock (testing)` in 187 | Hide |
| Microphone permission denied | 208–220 | Keep visible but show the red permission row above them |
| **236 Persona = `Off`** | Persona panel body (237–267) | Unmount entirely |
| 236 Persona = `On` **and** 68 = `Helpful companion` | 68 | Auto-switch to `Persona-driven`, show one-time note |
| 236 Persona = `On` **and** 68 = `Custom` | 68 | Show note with `Fix it for me`; **do not modify the text** |
| 236 Persona = `On` | 67 | Append read-only link *A persona is active… [View the assembled prompt]* |
| 237 Active persona = `— None —` | 238–260 | Disable with hint *Create or select a persona first* |
| 239 Pronouns = `Custom…` | 240 | Show |
| 247 Injection = `Replace my system prompt` | 67 | Show amber hint on 67: *Not sent while the persona replaces it* |
| 254 Greeting = `Don't greet me` | 255–259 | Hide |
| 254 Greeting = `Show a fixed message` | 256 | Hide |
| 254 Greeting = `Ask the model for a greeting` | 255 | Hide |
| 83 TTS provider = `Off (text only)` | 259, 260 | Hide |
| Assembled prompt > 16000 chars | 251, 252 | Red state; block sending until resolved |
| Library at 50 cards | 261 | Disable with tooltip |
| Library has exactly one card and it is active | 263 | Disable |

---

## 9. Deliberately Excluded Controls

Do **not** add settings for the following. Each exclusion is intentional; if a future requirement conflicts, raise it rather than adding the control.

| Omitted | Reason |
|---|---|
| Cancel/stop keybinding | `Esc` is hardcoded and must always work |
| Telemetry / analytics opt-out | No telemetry exists; a toggle would imply otherwise |
| Sprite source file paths | Assets are always copied into `userData`; there is no live path to edit |
| Idle wandering, blinking, proactive messages | Out of scope per spec §0 non-goals — idle is loop-only |
| Wake word / "Hey companion" | Requires a continuously open microphone. Explicitly out of scope — do not add a toggle for it. |
| Always-on / background listening | Same reason. The mic opens only on explicit activation. |
| Voice commands that control the app (e.g. "open settings") | Transcripts go to the model as text, nothing else. No command grammar. |
| Speaker diarization / multi-speaker labelling | Single-user desktop app |
| Saving transcripts to a history file | Transcripts follow the conversation-persistence setting (76); no separate store |
| Plugin or extension manager | Out of scope for v1 |
| Per-conversation model override | Settings is global; keep the surface small |
| "Jailbreak protection" / persona-lock toggle | A persona is a styling instruction, not a security boundary. A toggle would imply a guarantee the app cannot make. |
| Persona marketplace, browsing, or remote fetch | Import/export of local `.persona.json` files only. No network endpoint for personas. |
| Per-persona model, temperature, or endpoint override | Personas change voice and character, not the backend. Only `voiceOverride` (260) crosses that line, and only with consent. |
| Auto-generating a persona from the sprite image | Requires a vision round trip on import and produces unpredictable results. The user writes the description. |
| Long-term memory / auto-updating persona facts | Control 245 is user-authored and static. Nothing writes to it automatically. |
| Multiple simultaneously active personas | Exactly one active card at a time. |
| Window border / title bar toggle for the sprite | Sprite window is permanently frameless |

---

## 10. Accessibility Requirements

- Full keyboard navigation: `Tab` through controls, `Ctrl + 1`–`8` jump to panels, arrow keys operate sliders in single steps, `Home`/`End` jump to min/max.
- Every control has a programmatic label; every dropdown is a native `<select>` or an ARIA-complete listbox.
- Color pickers must accept typed hex input — never picker-only.
- Honor `prefers-reduced-motion`: when set, 145 defaults to `Appear instantly` and 42 defaults to `Instant cut`.
- All text meets WCAG AA contrast in every built-in theme; the `Custom` theme shows a live contrast-ratio readout with a warning below 4.5:1.
- Recording state must be conveyed non-visually as well as visually: announce `Listening` / `Transcribing` / `Transcript inserted` via an `aria-live="polite"` region, since the mic indicator alone is inaccessible to screen-reader users.
- Control 215's level meter carries `role="meter"` with `aria-valuenow`, and must never be the only indication that the microphone is open.
- Voice input must be fully operable without the hotkey — the mic button (209) is the keyboard/pointer path, reachable by `Tab`.
- Control 244's repeatable rows must be reorderable by keyboard, not drag alone: each row exposes `Move up` / `Move down` buttons reachable by `Tab`.
- Control 252's assembled-prompt block is a focusable, selectable, screen-reader-readable region — not an image or a canvas.
- The persona token-estimate warning (251) must be conveyed by text, not color alone: prefix with `Warning:` or `Too long:` rather than relying on the amber/red state.
