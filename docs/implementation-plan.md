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

Scope update, October 8, 2026: the user explicitly deferred region screenshots and the selector to low-priority future features. No selector approval is pending. Current image input consists of file and clipboard attachments; the screenshot-specific acceptance criterion and shortcut are excluded from the current release. Real vision-model quality verification remains unperformed and must not be claimed, but it no longer blocks the ordered voice phases under this scope change.

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
12–13. Anthropic/Ollama and file/clipboard image attachments, normalization, thumbnails, provider encoding and capability handling. Revised acceptance uses the recorded file/clipboard Windows checks and transport/validation tests. Region capture and its screenshot-to-vision acceptance are deferred by the user's scope change.
14–15. Provider-pluggable TTS, sentence pipeline, gapless playback and remaining providers. Mouth animation/lip syncing are low-priority future work by explicit user instruction; existing imports remain compatible. No audio hot path with none. Local Kokoro acceptance testing is skipped by explicit user instruction; see DISCREPANCIES.md entries 28 and 31. Other voice checks remain required.
16–17. STT core/providers, AudioWorklet/resampling/VAD, transcript insertion, activation/keyboard hook and fallback, echo gating, privacy. Local Whisper/native Windows acceptance required.
18. Persona prompt assembly, library/packs/consent/greetings and Figma Persona UI.
19. Tray/hotkeys/fullscreen/window behavior, logs, NSIS package and clean Windows validation; documentation and performance budget.

After each phase run relevant unit tests, typecheck, lint and Electron smoke where possible. Update docs/progress.md with tested versus unverified behavior and commit runnable milestones. Do not mark acceptance based on mocks or omit settings to fit a time budget. Placeholder assets do not block any provider, chat, voice or settings work.

## Phase 14 implementation detail

Re-inspected Figma Voice light (16:540), dark (2004:835), and supporting states (16:1102), including screenshots. Reuse the existing Settings shell, row controls, encrypted secret field, groups, and typography. Off shows only the provider and authored text-only hint. Active providers show their own fields followed by Playback and Text Processing. Implement Windows voice enumeration/pitch and editable OpenAI-compatible model/voice fields; keep phase-15 providers visibly unavailable until implemented. The existing bubble footer gains the specification-required mute control and non-blocking speech status using its current styling.

Implement a bounded main-process Markdown-to-speech and sentence pipeline, independent of displayed text. Use WinRT Windows.Media.SpeechSynthesis behind a fixed, hidden Windows-only helper, and real HTTP streaming for OpenAI-compatible speech. Speech failures follow C17 without affecting LLM delivery. Audio packets and playback acknowledgements are validated in both IPC directions and restricted to the pet renderer. Only explicit enabled speech creates a Web Audio graph; provider Off closes it. Schedule PCM buffers gaplessly through gain and analyser nodes; decode compressed formats per utterance. Renderer completion acknowledgements gate state transitions, with cancellation generations rejecting late synthesis/decode results.

Preserve all three C14 interruption policies: immediate cancellation, finish only the currently audible sentence, and one pending turn (a third replaces it). Esc clears synthesis, playback, and pending turns. Cache only complete synthesis, keyed by provider configuration and normalized text, under the specified 200 MB LRU cap; provider/voice changes invalidate the cache. Live volume/mute/device changes affect playback independently of synthesis.

Verify provider requests, streamed sentence parsing, cancellation/stale isolation, cache eviction, lifecycle gates, and Settings visibility. Run Windows voice enumeration/synthesis and Electron playback/Esc checks. The user explicitly waived real local Kokoro testing on October 8, 2026; record it as skipped, with compatibility and the approximately one-second latency/mid-word Esc behavior unverified. Do not provision Kokoro or require an endpoint for this waived test. Complete the other required checks before accepting phase 14 or advancing to phase 15; test fixtures alone do not establish real Windows playback acceptance.

## Phase 15 implementation detail (revised scope)

Mouth animation/lip syncing are deferred by explicit user instruction (entry 31). Keep the existing mouth import/configuration compatible; do not add a Voice mouth preview/toggle or runtime overlay in this release. Implement ElevenLabs and Custom HTTP within the already inspected Figma Voice provider groups, using existing row controls, encrypted keys, palettes and typography. No new screens or redesign.

ElevenLabs uses the documented `/v1/voices` enumeration and streaming speech endpoint, with the three specified model options and stability/similarity/style/speaker-boost controls. Keep keys main-only; use MP3 output for this provider regardless of the hidden OpenAI format. Auto-select the first available voice only when no voice has been selected. Test the request protocol and errors with fixtures; do not claim live hosted acceptance without a key.

Custom HTTP exposes the required URL, GET/POST, key/value headers, optional secret, JSON body template, three Settings response modes, conditional JSON path and format. Safely substitute placeholders without eval, validate templates before saving, encode GET template fields as query parameters, and validate response URLs/paths. Binary streams audio; JSON-base64 reads the selected field, also supporting SSE JSON/base64 events for main-spec compatibility; JSON-URL fetches audio without forwarding request credentials. Bound responses, timeouts and decoded audio; reject redirects. Main remains the only config writer, applying nested provider patches atomically so sibling settings are preserved. Provider synthesis configuration changes cancel playback and invalidate cached clips.

Verify safe substitution (including quotes/newlines), nested patches, all custom response modes, credential isolation, cancellation, limits and ElevenLabs requests. Run lint, unit tests, strict build and Windows Electron Custom HTTP playback/settings acceptance. Advance to STT only after revised phase-15 acceptance.
