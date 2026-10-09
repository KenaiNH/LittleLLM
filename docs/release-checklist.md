# Current release acceptance

The current scope excludes dictation, region selection, mouth/lip animation, auto-update and automatic desktop pinning. Further voice tests and performance optimization are deferred by the user. These exclusions do not count as test passes.

## Checked on this Windows x64 machine

- 122 non-voice unit tests passed; production build, strict TypeScript and lint passed.
- Non-voice Windows regression: 17/20 passed initially. Advanced crash recovery, bubble scroll position and crossfade sampling failed intermittently; all passed in the targeted five-test rerun. Retain these as intermittent acceptance issues until repeatability improves.
- Native injected shortcuts verified input focus/return, visibility, clipboard submission, click-through toggle and persona cycling.
- Proxy/TLS checks used actual HTTP and self-signed HTTPS fixtures; renderer trust stayed strict and revoked opt-in stopped working.
- Packaged x64 executable launched with isolated settings, rendered bundled sprites, exposed the narrow IPC API and opened Settings with Node access disabled. This does not certify installation or startup registration.
- Refreshed x64 NSIS installer built successfully at `dist/LittleLLM Setup 0.1.0.exe`; Authenticode reports `NotSigned`. Packaged launch passed again after this build.
- Figma Advanced light/dark screens reviewed. Placeholder assets remain replaceable through Settings.

## Remaining release checks

- Build/verify ARM64 installer and launch on ARM64 Windows. Native optional packages are prepared for both architectures; Electron ARM64 download stalled in this environment. No ARM64 installer or runtime pass is claimed.
- Clean Windows VM: install, choose custom folder, launch, restart, settings persistence, login startup on/off, uninstall and reinstall behavior. Do not run these against the user's working profile.
- Mixed-DPI monitor movement, HDR capture, Intel content protection, native exclusive fullscreen games and presentation behavior on suitable hardware.
- Manual Task View pinning, following [manual-virtual-desktops.md](manual-virtual-desktops.md).
- Live hosted provider and vision quality with user-supplied credentials.
- Repeat intermittent crash/scroll/crossfade acceptance checks. Prior native pointer tests exist; this phase did not repeat mouse-injected click delivery.

## Deferred acceptance

Voice/audio tests are skipped under discrepancies 28/34. Performance measurements and budget misses are preserved in [performance-handoff.md](performance-handoff.md), with remediation deferred under discrepancy 41. Installers are not represented as signed releases; no update feed is published.

Build using `npm run package`. To run existing checks without voice acceptance, select unit files excluding `tts`, `remainingTts`, `speechService` and `audioPlayer`; select Electron specs excluding `voice.spec.ts` and `customVoice.spec.ts`. The native pointer test requires an untouched mouse. Packaged acceptance is in `tests/e2e/packaged.spec.ts` and skips when the x64 executable is absent.
