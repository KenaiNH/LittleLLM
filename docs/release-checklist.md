# Current release acceptance

The current scope excludes dictation, region selection, mouth/lip animation, auto-update and automatic desktop pinning. Further voice tests and performance optimization are deferred by the user. These exclusions do not count as test passes.

## Checked on this Windows x64 machine

- Sprite placement follow-up: 134 non-voice units, build/type checking and lint passed. Final full Electron regression passed 23/24; the previously recorded bubble manual-scroll suspension intermittency recurred and both bubble checks passed in the isolated rerun. Placement/import/scale/state/anchor/snapping/restart checks passed, including all nine anchors and saved free/custom anchors. Initial position persistence was fixed; native shortcut testing now waits for the backdrop activation before invoking its focus shortcut. This does not certify mixed-DPI physical monitor behavior or remove the recorded scrolling intermittency.

- Final usability review: **122 non-voice unit tests and 23 non-voice Electron checks passed**; build/type checking/lint passed. This supersedes the earlier failing runs below. Packaged tests cover fresh first-run model setup, real fixture HTTP connection/reply, restart persistence, developer-URL rejection, bundled user guides/license/font notices and renderer security. Small-work-area Settings navigation/reset/restart/search passed. Seventeen local guide links resolve.
- The repeated animation failure came from requiring a sample strictly inside the middle 20–80% of a 500 ms blend; captured intermediates existed outside that slice. The check now verifies all observed intermediate pixel weights. The final renderer recovery assertion uses the same 15-second allowance as the native reload check. Earlier intermittent failures remain historical evidence; the final whole run passes without test retries.

- 122 non-voice unit tests passed; production build, strict TypeScript and lint passed.
- Non-voice Windows regression: 17/20 passed initially. Advanced crash recovery, bubble scroll position and crossfade sampling failed intermittently; all passed in the targeted five-test rerun. Retain these as intermittent acceptance issues until repeatability improves.
- Native injected shortcuts verified input focus/return, visibility, clipboard submission, click-through toggle and persona cycling.
- Proxy/TLS checks used actual HTTP and self-signed HTTPS fixtures; renderer trust stayed strict and revoked opt-in stopped working.
- Packaged x64 executable launched with isolated settings, rendered bundled sprites, exposed the narrow IPC API and opened Settings with Node access disabled. This does not certify installation or startup registration.
- Refreshed x64 NSIS installer built successfully at `dist/LittleLLM Setup 0.1.0.exe`; Authenticode reports `NotSigned`. Packaged launch passed again after this build.
- Figma Advanced light/dark screens reviewed. Placeholder assets remain replaceable through Settings.

## Remaining release checks

### Required before announcing a production release

Use a clean Windows 10/11 x64 VM or a separate test computer. Sandbox is unavailable on the development host. The current executable checks use isolated profiles and do not install the app or certify Windows shortcuts/registry integration.

1. Copy the final installer onto the clean machine. Install without Node.js/npm or the repository, select a custom folder and launch from the finish page.
2. Verify desktop and Start menu shortcuts launch `LittleLLM.exe`. Open the installed README, sprite/persona/voice guides and license. Confirm the sprite and first-run Model settings appear.
3. Configure a running local provider or a hosted account, use Test Connection, send a typed message and receive a reply. Import replacement sprites in Settings; quit and relaunch to verify settings/artwork persist.
4. Check show/hide, input focus, tray Settings/Quit, shortcut conflicts and close-to-tray behavior. Toggle launch-on-login on, sign out/in and verify startup; toggle it off and verify it stops starting. Check first-run setup does not repeat on every launch.
5. Quit and install a newer build over the existing installation; verify personal settings/artwork remain. Uninstall through Windows Apps and check the executable/shortcuts/startup registration are removed. Check preserved user-data behavior separately; do not call uninstall a data wipe.
6. Record Windows version, installer SHA-256, app/source version and results. Resolve failures before publishing. Publish the matching source and installer together; GitHub Releases are the preferred download. Finished binaries can also be committed using the configured Git LFS rules; intermediate build folders remain ignored.

### Additional acceptance and current limitations

- Build/verify ARM64 installer and launch on ARM64 Windows. Native optional packages are prepared for both architectures; Electron ARM64 download stalled in this environment. No ARM64 installer or runtime pass is claimed.
- Clean Windows VM: install, choose custom folder, launch, restart, settings persistence, login startup on/off, uninstall and reinstall behavior. Do not run these against the user's working profile.
- Mixed-DPI monitor movement, HDR capture, Intel content protection, native exclusive fullscreen games and presentation behavior on suitable hardware.
- Manual Task View pinning, following [manual-virtual-desktops.md](manual-virtual-desktops.md).
- Live hosted provider and vision quality with user-supplied credentials.
- Repeat intermittent crash/scroll/crossfade acceptance checks. Prior native pointer tests exist; this phase did not repeat mouse-injected click delivery.

## Deferred acceptance

Voice/audio tests are skipped under discrepancies 28/34. Performance measurements and budget misses are preserved in [performance-handoff.md](performance-handoff.md), with remediation deferred under discrepancy 41. Installers are not represented as signed releases; no update feed is published.

Build the verified architecture using `npm run package:x64`. `npm run package` targets both architectures, with ARM64 still pending. Run `npm run test:nonvoice` and `npm run smoke:nonvoice` to preserve the voice-test exclusions. The latter also excludes native mouse-injected clicking, which requires an untouched pointer. Packaged acceptance is in `tests/e2e/packaged.spec.ts` and skips when the x64 executable is absent.
