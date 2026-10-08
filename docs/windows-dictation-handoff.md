# Windows dictation — deferred handoff

Status: outside the current release by explicit user instruction on October 8, 2026. The subsequent entry 38 defers **all voice input/dictation**, including Whisper, Custom HTTP and activation modes. Read [voice-input-handoff.md](voice-input-handoff.md) first. This file retains the Windows-specific architecture conflict for later; do not reopen this task unless the user resumes it.

## Read before resuming

Read AGENTS.md, both complete specifications in `docs/specifications/`, `docs/implementation-plan.md`, `docs/progress.md`, and `docs/DISCREPANCIES.md` entries 7, 33, 34 and 37. File names currently have download suffixes: `desktop_companion_spec (1).md` and `settings_window_spec (4).md`. Figma governs visuals; main governs architecture/runtime/security; Settings governs controls/options. Further voice testing was explicitly skipped, so do not treat static checks as runtime acceptance or restart microphone testing without revisiting that instruction.

## Why it was deferred

Main §10.3 specifies `Windows.Media.SpeechRecognition` free-text dictation, offline and zero-setup, with streaming partials. Current Microsoft documentation says free-text dictation uses a remote web service and requires Online speech recognition. These WinRT APIs also require package identity, including the packaged-with-external-location identity route. The application currently runs unpackaged in development and targets an NSIS installer. These claims cannot all be satisfied by simply adding the specified WinRT provider.

Primary reference: [Microsoft speech recognition documentation](https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition), inspected October 8, 2026. Recheck its current requirements before deciding. No native dictation, package registration, installation, microphone or remote recognition probe was performed. Do not silently substitute `System.Speech`, another Windows API, cloud recognition or an MSIX installer. AGENTS.md requires approval before architectural changes contradicting the specifications.

## Existing implementation and extension points

- `src/main/stt/types.ts`: pluggable `STTProvider`, batch and streaming result contracts. Windows should implement streaming, including partial/final text, disposal and cancellation.
- `src/main/stt/registry.ts`: provider factory. `windows-dictation` is currently unavailable.
- `src/main/stt/sttSession.ts`: main-owned recording session, cancellation generations, release acknowledgements, VAD, bounded buffers, recent transcripts and final insertion/countdown policies. Extend the streaming path when this feature resumes; do not open a second independent microphone session.
- `src/renderer/stt/MicRecorder.ts` and `recorder.worklet.js`: pet-owned capture, mono 16 kHz/20 ms PCM frames. Settings only requests a focused-panel preview; it never owns capture or has media permission.
- `src/main/windows/inputWindow.ts`: validated IPC/session owner, microphone permission predicate, transcribing/lifecycle UI and input insertion.
- `src/shared/stt.ts`: validated capture/status/feedback packets; `partial` is reserved for uncommitted streaming text.
- `src/renderer/settings/VoiceInputPanel.tsx`, `SettingRow.tsx`, `definitions.ts`: existing Figma Voice Input groups, provider choices and conditional controls. The Windows choice is disabled rather than removed from the compatibility schema.
- Windows-specific helpers belong in `src/main/platform/win32/`, following the repository's current platform layout. Inspect it before adding files.

## Required behavior once a backend is approved

1. Reconcile offline availability, OS language installation requirements, supported Windows versions and development/installer identity. Present a concrete proposal before an architecture change.
2. Preserve provider value `windows-dictation` and legacy fallback `stt.onFailure = sapi-dictation`. Neither should pretend to work while deferred. Main session failure policy must eventually invoke the approved fallback, respecting permission/cancellation.
3. Implement streaming partials as grey, italic, uncommitted input text; replace them wholesale with the final transcript. Preserve typed drafts, caret insertion, post-processing, confidence handling and countdown cancellation.
4. Implement Windows-specific language/OS-settings action and visibility for Settings control 188. Batch providers keep live-partial control 224 unavailable.
5. Enforce pet-only microphone capture, explicit activation/focused-preview rules, visible mic indicator, hard watchdog, track release on every end, memory clearing, main-only secrets and audio/transcript log redaction. No background capture or automatic remote recognition.
6. On activation during speech, cancel LLM/audio first. Integrate global PTT keyup/fallback and hands-free echo gating with the same session owner.
7. Verify abort/stale results, partial replacement, offline behavior, language errors, device loss, release acknowledgements, global activation and packaging identity after the voice-test waiver is revisited. Record actual checks separately from protocol fixtures and static checks.

## Current next step

Continue the current release with Persona and native packaging/polish. Auto-update, region screenshots, mouth animation/lip syncing and **all voice input/dictation** are deferred. When the user resumes Windows dictation, start by proposing an approved offline backend or a revised online/package-identity requirement; do not assume a previous implementation decision exists.
