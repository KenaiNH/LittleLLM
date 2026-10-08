# UI and implementation plan

Prepared before application code. Sources read in full: AGENTS.md, desktop_companion_spec (1).md v5, settings_window_spec (4).md v3, including main §§14, 16–18. Download suffixes are retained. Figma is visual authority; specifications govern functionality, architecture and settings inventory, with §16 binding.

## Figma inventory

File: https://www.figma.com/design/5UfqQ3ZqtBmKZZiaABQWUK

| View | Light | Dark | Supporting states |
|---|---|---|---|
| General | 16:3 | 2004:2 | 16:1009 |
| Sprites | 16:205 | 2004:411 | 16:1035 |
| Model | 16:359 | 2004:215 | 16:1067 |
| Persona | 2031:5560 | 2031:5611 | 2031:5670, 2031:5893 and other children of 2031:5662 |
| Voice | 16:540 | 2004:835 | 16:1102 |
| Voice Input | 2021:545 | 2021:595 | 2021:645 |
| Appearance | 16:585 | 2004:576 | 16:1137 |
| Advanced | 16:824 | 2004:886 | 16:1172 |
| TextChat | page 2012:2 | not supplied | Bubble 2016:89; desktop example 2016:81 |

Relevant components: sidebar/search/navigation/selection indicator, section heading, grouped setting rows, toggles (on/off/disabled), editable combo, numeric/range fields, textarea/counter, file drop zone, preview, action buttons, hotkey recorder, error/verification/restart states, confirmation/import dialogs, mic meter, persona example editor/variable menu/prompt preview. TextChat uses blue dialogue surfaces, inset border, Courier Prime, white shadowed text, continuation triangle and a round mic button. Retrieved design code and metadata are retained under docs/design for traceability, never used as screenshot assets in the app.

Settings geometry: normal OS chrome, 960×680 outer window, minimum 820×560; 200 px sidebar; content header 76 px; content padding 28 px; section gap 20 px; heading 15 px semibold; body 13 px Inter; panel title 25 px semibold; group radius 6 px; input height 32 px and normal control width 320 px. Light palette: #f7f7f7 / #f0f1f3 / white, text #202124, muted #62666c, borders #d9dce1/#e8eaed, accent #1768b2. Dark palette: black / #0f1115 / #11161d, text #f5f7fa/#c7cdd4, muted #8d9197, border #2a2f36, links #71b7ff. Use React 18 and CSS Modules; local Figma SVG assets and bundled fonts; no Tailwind or new design kit.

## Coverage and gaps

All eight settings panels are designed. Supporting boards document conditional controls; they are reference specimens, not extra application screens. Earlier seven-panel frames omit Persona in navigation; use the existing eight-panel Persona specimen navigation and the specified order. Do not treat a collapsed/off state as a missing control. Dynamic lists (displays/devices/models/voices/persona library) need runtime data.

TextChat bubble 2016:89 provides the anchored bubble visual. User clarified: the full-width bottom panel in desktop example 2016:81 is for user response; implement it as a separate secure input window. Companion starts bottom-right with 24 px work-area margin. User also explicitly prioritizes Figma fonts, designs and colors over everything: ship the authored dialogue defaults while preserving all required appearance controls.

Not visually specified in retrieved TextChat: editable input, attachment thumbnails/removal, streaming stop/regenerate/copy footer, suspended-scroll affordance, recording/cancel/transcribing states, region selection overlay, actual sprite placement and animations. Required functionality will be mapped to existing components; new screen designs require approval. No design writes or redesigns are authorized.

Region selector proposal (approval requested, implementation pending): an activation-only transparent window covering each display, a dim black fill at 35%, a 2 px selection outline in Figma's #e4e9ff, and an existing blue dialogue surface containing Courier Prime text “Drag to capture · Esc to cancel.” Dragging selects within one display; Esc closes all selectors without attaching or sending anything. Capture/crop/normalization happen in main; selection coordinates use validated IPC. No screenshot is persisted or sent until the user submits the attached image. The overlay closes before returning focus to the existing input bar. A new selector screen needs the user's approval under the original instruction; other attachment sources can be completed independently.

## Ordered build and verification

Follow main §14 in order. Before phase 1, define every stored enum/label and complete Zod config tree, incorporating C1–C27 and omitted controls. Maintain explicit control-to-config coverage, session-only debug settings, errors and all IPC channel names.

1. Scaffold Electron/Vite/React/strict TS/Zustand/ESLint/Prettier/Vitest, config migration/recovery, typed IPC, mocks confined to development/tests. Test corrupt/partial/future configs and mocks; blank Electron launch smoke.
2. Secure transparent pet window, bottom-right placement, draggable and persisted per display. Test clamping and restart placement; native smoke.
3. Bundle temporary PNGs (idle blue resting face, thinking amber/question motif, speaking green/open mouth). Render canvas through the same asset pipeline used for imports; no placeholder-specific runtime branches.
4. Animation engine: static/GIF/APNG, sheets in both orders, naturally sorted sequences, timing, four playback modes, predecode, hidden pause, DPI reload and cache budget. Test math/clocks/disposal; measure CPU separately.
5. Main-generated union alpha masks, disk cache, pure DPI/scale/flip transform, one-frame click-through debounce. Unit tests at 100/125/150/175%; native behind-window click tests.
6–7. Input and sanitized scrollable dialogue bubble, Figma visuals, work-area placement, reveal, footer, dwell/hover and accessibility. Validate layout gap before adding unsupported UI.
8–9. Real OpenAI-compatible provider and tested state transitions; abort/stale-event isolation, minimum thinking, text/audio/dwell gates, optional listening and barge-in. A real local endpoint is needed for phase acceptance.
10–11. Settings live broadcast, secrets in main, General/Model/Appearance followed by Sprites: validated file/folder/multiselect copy, previews/scrub/play/pause, state resets, sheets auto-detection, safe Sprite Pack preview/confirm/import/export. Imported files survive source deletion and restart. Placeholder art is fully replaceable here.
12–13. Anthropic/Ollama and multimodal sources/capability handling.
14–15. Provider-pluggable TTS, sentence pipeline, gapless playback/RMS, mouth drivers/compositing and remaining providers. No audio hot path with none. Local Kokoro acceptance required.
16–17. STT core/providers, AudioWorklet/resampling/VAD, transcript insertion, activation/keyboard hook and fallback, echo gating, privacy. Local Whisper/native Windows acceptance required.
18. Persona prompt assembly, library/packs/consent/greetings and Figma Persona UI.
19. Tray/hotkeys/fullscreen/window behavior, logs, NSIS package and clean Windows validation; documentation and performance budget.

After each phase run relevant unit tests, typecheck, lint and Electron smoke where possible. Update docs/progress.md with tested versus unverified behavior and commit runnable milestones. Do not mark acceptance based on mocks or omit settings to fit a time budget. Placeholder assets do not block any provider, chat, voice or settings work.
