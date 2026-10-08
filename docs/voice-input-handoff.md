# Voice input and dictation — future implementation handoff

**Status: entirely deferred by the user on October 8, 2026.** The user said: “Ignore whisper and custom HTTP providers and acivation modes. Push all dictation features for the future.” Do not continue voice-input work or activate recording without the user resuming this feature. Text chat and voice **output** remain in scope.

## Current release

`src/shared/featureScope.ts` sets `VOICE_INPUT_ENABLED = false`. Main denies microphone media permission and rejects creating a transcription session. The pet does not subscribe to capture events or load the recorder; input-bar voice controls are hidden. Settings retains its authored Voice Input navigation with a disabled Off provider and future-release explanation. Stored `stt`/voice-hotkey fields remain compatible; saved/imported enabled providers must not bypass the gate. Do not register voice-input shortcuts while deferred. Speaker-selection and TTS output remain independent.

## Read before resuming

Read AGENTS.md, both complete specs (`docs/specifications/desktop_companion_spec (1).md` and `settings_window_spec (4).md`), main §§10, 14, 16–18, `docs/implementation-plan.md`, `docs/progress.md`, and `docs/DISCREPANCIES.md` entries 7, 33–38. Figma is visual authority. The user also skipped further voice testing (entry 34); revisit that instruction before any microphone, endpoint, native or audio tests. Static checks are not runtime acceptance.

## Preserved groundwork — inactive and runtime-unverified

- `src/shared/stt.ts`, `api.ts`, `chatUi.ts`, `src/main/ipc/channels.ts`, `src/preload/index.ts`: Zod-validated session/status/capture/frame/feedback IPC and caret updates. Only trusted main frames invoke channels; only the pet sends PCM/recorder feedback.
- `src/main/stt/types.ts`, `registry.ts`, `openaiCompatible.ts`: pluggable provider contract and batch multipart `/audio/transcriptions`, encrypted optional main-only key, timeout, bounded response and cancellation. Only Off/OpenAI-compatible are implemented; no real endpoint was invoked.
- `audioEncoder.ts`, `vad.ts`, `transcript.ts`: mono WAV encoding, main-side RMS/300 ms onset/hangover, transcript processing and caret/append/replace insertion.
- `sttSession.ts`: bounded main-owned session, release-before-HTTP, stale/cancel isolation, recent-five in-memory transcripts, hold/send/countdown, explicit test actions and release watchdog that reloads the pet on missing acknowledgement. The mock fixture is developer-only, not production transcription.
- `src/renderer/stt/MicRecorder.ts`, `recorder.worklet.js`, `assets.d.ts`: lazy pet-only capture, AudioWorklet mono 16 kHz/20 ms frames, levels/gain/suppression, track release and explicit three-second replay. `?url&no-inline` preserves strict CSP; the build emitted a separate worklet asset.
- `src/renderer/pet/useMicrophone.ts`, `pet/App.tsx`, `input/App.tsx`: dormant hook, visible microphone indicator, stop/cancel/transcribing/countdown/reinsert controls using the existing Figma surfaces.
- `src/renderer/settings/VoiceInputPanel.tsx`: the release wrapper shows disabled Off; inner `VoiceInputControls` preserves Figma groups, secrets/devices/meter/privacy/test buttons. Settings preview is pet-owned, focused/visible-only, with blur/close/Off release and a lease. Preview audio is not buffered/transcribed. Denied permission must not cause retry loops.
- `src/main/windows/inputWindow.ts`: dormant session/lifecycle/IPC. `ensureMicrophone()` and the media permission predicate enforce the gate. Recheck asynchronous preview/close/cancel races before enabling.

Build/typecheck/lint were checked during groundwork development. Voice-specific unit/runtime/native/recording/endpoint checks were skipped, not passed. This is not a completed feature.

## Remaining work when resumed

1. Revisit scope/test waiver before changing `VOICE_INPUT_ENABLED`. Finish phase-16 acceptance: real worklet/VAD/capture, Off inactivity, permissions/devices, indicator/release, preview blur/close, no disk recording, provider changes, caret/countdown/stale-result races and real endpoint behavior.
2. Complete phase-17 global PTT with real native keyup; `globalShortcut` alone is insufficient. If the hook fails, notify once and persist Toggle fallback. Add hands-free auto-stop and TTS queue/VAD echo gating. Mic activation cancels LLM/audio first.
3. Implement local executable provider: validated native executable/model pickers, separate argv tags (never shell interpolation), cancellable `execFile`, bounded JSON/stdout parsing, cleanup and bundled two-second sample for Test Executable. Resolve in-memory/piped transport versus tools requiring a file path before changing the no-audio-on-disk privacy promise.
4. Implement Custom HTTP STT/Figma controls 199–207: POST/PUT, safe key-reference headers, multipart/raw/base64 uploads, language-aware extra fields, safe response path and all five audio-format choices. Current core emits WAV16 only; do not present unsupported FLAC/Opus/MP3 as working.
5. Resolve Windows backend architecture before built-in dictation, streaming partials, OS language settings or legacy failure fallback. See [windows-dictation-handoff.md](windows-dictation-handoff.md). No alternate backend/installer change is approved.
6. Implement explicitly enabled developer recording export/mic overlay, bounded memory and redacted logs. Verify grey/italic uncommitted partials replaced by final text for approved streaming providers.
7. Run resumed acceptance, record actual results separately from fixtures/static checks, update coverage/progress and commit runnable milestones. Final sprite artwork is not a dependency.

## Binding decisions

Settings 215 authorizes only a focused/visible-panel temporary level preview through the pet; Settings never gets media permission (entry 7). Main §10.5's hard 120-second watchdog wins over control 211's selectable 5–300 seconds: retain the stored range and explain the effective cap (entry 36). Secrets stay in main. Audio goes only to the configured endpoint, stays bounded in memory and is zeroed after use; it never hits disk unless the explicit developer recording feature is enabled. The Windows online/package-identity contradiction remains a future backend decision.

## Current-release next step

Skip STT phases 16–17. Continue phase 18 Persona and phase 19 native polish/manual packaging. Region screenshots, mouth animation/lip syncing, auto-update and all voice input/dictation are future work. Typed chat, TTS output, Persona, sprite replacement and manual installation remain in scope.
