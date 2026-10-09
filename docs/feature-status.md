# Feature status

Current scope follows the user decisions recorded in DISCREPANCIES.md. Progress is recorded per build phase in progress.md.

## Implemented

- Transparent Windows companion, always-on-top placement, saved display positions, snapping, on-screen bounds and bottom-right startup.
- Independent idle/thinking/speaking placeholder artwork; image, animated GIF/APNG, sheet and sequence rendering; frame timing, playback modes, anchors, flip, scale, opacity and crossfades.
- Validated sprite importing, managed assets/cache, previews and Sprite Pack import/export; replacements through Settings require no code edits.
- Per-pixel click-through, hit-test thresholds/sample rate, bounding-box mode, dragging and modifiers.
- Anchored assistant bubble, full-width response input, safe Markdown/code rendering, scrolling, reveal/dwell and appearance controls.
- Production OpenAI-compatible, Anthropic and native Ollama adapters, streaming, cancellation/retry/errors, model discovery and connection testing.
- Context budgeting, regeneration, persistence policies and confirmed history clearing.
- File, drop and clipboard image attachments with validation, normalization, capability checks and provider encodings.
- Voice output: Windows synthesis, OpenAI-compatible, ElevenLabs and Custom HTTP adapters; playback, interruption, processing, mute/cache/settings. Further voice tests are **skipped**, and endpoint/device behavior is not newly certified.
- Persona library, prompt assembly/variables/examples, import/export, switch policies, preferred voice consent and greeting scheduling. Live hosted character quality and greeting speech remain unverified.
- All eight Settings panels within current scope, search, validation, immediate persistence, panel resets, encrypted main-owned keys and Figma light/dark styling.
- Advanced diagnostics: safe folders, settings snapshots with migration/preview/backup, typed reset, key clearing, bounded/redacted logs, version information, session-only state/mask/FPS controls and restart notice.
- Main-process proxy routing and provider-host certificate opt-in; renderer certificate policy remains strict.
- Tray menu, non-voice global shortcuts, second-instance focus, close behavior, fullscreen monitoring, packaged login integration and renderer recovery.
- Hidden-animation gate, battery FPS limit and bounded oversized sprite geometry.

## Release verification still required

The release checklist records installer build/launch results, performance measurements and checks that need a clean Windows VM or unavailable hardware. These remain acceptance work until recorded as passed; implemented native code alone is not proof of installed behavior.

## Deferred by user

- All dictation/voice input, STT providers, capture/preview/transcripts and activation modes. See voice-input-handoff.md.
- Mouth animation and lip sync.
- Screen-region selector and capture shortcut.
- Auto-update and update feeds.
- Automatic virtual-desktop pinning; manual Task View instructions are in manual-virtual-desktops.md.
- Further voice/audio-specific acceptance, including Kokoro, is skipped for later cleanup.
- Performance optimization and remediation of startup/memory budget misses; see [performance-handoff.md](performance-handoff.md).

Strong Acrylic is unavailable in this release under specification §18.1. Hosted endpoints require appropriate user-supplied credentials for live acceptance.
