# Release usability review — October 9, 2026

Status: **Windows x64 release candidate; production sign-off pending clean-machine installation acceptance.** No public release was published during this review. ARM64 is not verified. User-deferred voice testing and optimization remain deferred.

## Usability and distribution changes

- README leads with download/install/EXE launch, first-run model setup and first message. Includes local Ollama Docker/native URLs, troubleshooting, manual updates, settings recovery, privacy, uninstall and separate developer prerequisites.
- Installer explicitly creates desktop/Start menu shortcuts and offers launch after setup. Runtime, sprites, fonts and native dependencies are bundled; users do not install npm or Node.js.
- Offline Markdown guides, project license, Electron/Chromium notices and bundled font licenses are included in the install folder. About and package metadata identify the repository's GPL v3 license.
- Settings uses the available monitor work area and scrolls its sidebar on smaller displays; restart/reset controls remain reachable. Existing Figma styling is preserved.
- Packaged loading ignores development-server URLs. Narrow IPC, sandboxing, denied microphone permission and renderer secret isolation remain in place.
- `.gitignore` excludes build/test output, dependency folders, private environment variants and signing/key files; `.env.example` and the deliberate local TLS test fixture remain available. Removed the arbitrary ignore rule for a feature-list Markdown file.
- `package:x64`, `test:nonvoice` and `smoke:nonvoice` provide documented commands for the current release scope. No voice test is represented as passed.

## Security and repository review

The production-only npm audit reported zero known vulnerabilities on this review. The complete dependency tree reported eight moderate development findings; no broad dependency upgrade or audit fix was applied. The tracked credential-pattern scan found only the deliberately public self-signed local TLS fixture (`tests/fixtures/tls/localhost.key`), which is not a production credential. This scan is a check, not a guarantee that arbitrary secret formats cannot exist.

The x64 installer is unsigned. Built artifacts belong in GitHub Releases, together with access to the matching source; `dist/` is intentionally not committed. Installed config/history/backups and exported personal persona context are not intended for public bug-report attachments.

## Evidence and outstanding acceptance

Final review results: 122 non-voice unit tests, 23 non-voice Electron checks, production build, TypeScript and lint pass. Seventeen local user-guide links resolve. Package inspection found 49 license/notice files in the application archive and no tests/scripts/environment/Git directories. The final whole Electron run passed without automatic retries; prior timing failures are explained in the checklist. Existing native mouse-click acceptance was not repeated, and voice testing stayed skipped.

Detailed checks and results are in [release-checklist.md](release-checklist.md) and [progress.md](progress.md). Packaged acceptance covers a fresh isolated profile, first-run Settings, provider connection, typed reply and restart persistence using a local protocol fixture. It does not prove hosted-model quality or native installation/registry behavior.

Before announcing production, complete the clean Windows VM/separate-machine checklist: install with no developer tools, shortcuts, actual model use, login startup, upgrade, uninstall and saved user-data behavior. Windows Sandbox is unavailable on this host. Do not overwrite the user's active installation/profile to simulate a clean-machine test.

Additional hardware acceptance, live hosted/vision quality and ARM64 remain explicit. Performance and further voice acceptance follow their existing user waivers. Default sprite artwork and application branding remain temporary; importing final sprite artwork needs no code changes.
