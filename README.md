# LittleLLM

Windows desktop AI sprite companion built with Electron, TypeScript, React and Zustand. The companion starts at the bottom-right by default. Visual defaults follow the existing Figma design.

**Release status:** this is an unsigned Windows x64 release candidate. Clean-machine installation and the remaining hardware checks in [the release checklist](docs/release-checklist.md) still need acceptance before a production release. ARM64 is not yet verified. Windows 10 or 11, 64-bit Intel/AMD, is the current target; the bundled [Electron runtime supports Windows 10 and newer](https://github.com/electron/electron#platform-support).

## Install and open on Windows

1. Get the installer from the **Assets** section of a published [GitHub release](https://github.com/KenaiNH/LittleLLM/releases), then run **LittleLLM Setup 0.1.0.exe**. If no installer has been published, ask the maintainer for the built installer or use the developer build instructions below. Downloading the repository's source ZIP does not install the app. Locally built installers are in `dist/`, which is intentionally excluded from Git.
2. Follow the installer and choose an installation folder. Leave **Run LittleLLM** selected on the final screen to open the app.
3. After installation, open **LittleLLM** from the desktop shortcut or the Windows Start menu. You can also double-click **LittleLLM.exe** inside the installation folder you selected.

The installed app includes its runtime. You do not need Node.js, npm, this repository, or a terminal to run it. Keep the executable with its installed files; moving only `LittleLLM.exe` will prevent it from working. The setup executable installs the app; `LittleLLM.exe` runs it afterward.

`README.md`, [SPRITES.md](SPRITES.md), [PERSONA.md](PERSONA.md), [VOICE.md](VOICE.md), the license and supporting Markdown documentation are included in the installation folder for offline reference.

The current installer is unsigned, so Windows may show an unknown-publisher warning. Only install a build you trust. If Windows SmartScreen blocks a trusted build, its **More info → Run anyway** option may be available; organizational policy may prevent this. To uninstall, use **Windows Settings → Apps → Installed apps → LittleLLM → Uninstall**.

## Use the companion

The sprite appears at the bottom-right by default. Click it to open the response input. **Ctrl + Shift + Space** opens and focuses the input; **Ctrl + Shift + H** shows or hides the companion. **Esc** cancels an active response. Right-click the sprite or the system-tray icon to open **Settings**. If the tray icon is hidden, open the tray's overflow menu. Choose **Quit** in the tray menu to exit.

First launch opens Model settings. Choose a provider and endpoint/model, enter an API key if required, and use **Test Connection**. A local model provider must be running separately; a hosted provider needs its own account and credentials. Settings save automatically. You can enable **Launch on login** in General settings for the installed app.

To send your first message, select a model that your provider actually offers, confirm **Test Connection** succeeds, then close Settings, click the sprite, type a message and press **Enter**. **Shift + Enter** inserts a newline with the default send setting. The response appears in the bubble beside the sprite. Drag the sprite to move it. General settings lets you change shortcuts; **Appearance** changes the bubble and input behavior. Closing Settings leaves the app running.

No AI model is bundled. Initial model downloads require internet access; local replies can run offline afterward. Hosted replies and uploaded attachments go to your selected provider and may incur its usage charges. Voice output is Off by default; dictation is unavailable in this release.

## Using a local model in Docker

If you already use Docker Desktop with Linux containers, start a local Ollama server and download a small example model:

```powershell
docker run -d --name littlellm-ollama -p 127.0.0.1:11434:11434 -v littlellm-ollama:/root/.ollama ollama/ollama
docker exec littlellm-ollama ollama pull llama3.2:1b
```

In **Settings → Model**, choose **Ollama**, set **Base URL** to `http://localhost:11434`, set **Model** to `llama3.2:1b`, and click **Test Connection**. No API key is needed. Alternatively choose **OpenAI-compatible** with `http://localhost:11434/v1` and the same model. Native Ollama uses the URL without `/v1`. These commands follow [Ollama's Docker instructions](https://docs.ollama.com/docker); its [OpenAI compatibility guide](https://docs.ollama.com/api/openai-compatibility) documents the alternate endpoint. The example container was not launched during this release review.

Keep the container running while chatting. After a computer restart, use `docker start littlellm-ollama`; stop it with `docker stop littlellm-ollama`. If you installed Ollama directly on Windows, use its running server with the same URLs instead of starting a second Docker server. Model performance and memory depend on your hardware.

Optional local voice output is documented in [VOICE.md](VOICE.md), including Kokoro-FastAPI. Kokoro and further voice tests were skipped, so that setup remains unverified. Whisper/dictation setup is deferred and does not apply to the current release.

## Developer setup

These commands are only needed to develop or build LittleLLM:

Install Node.js **22.12 or newer** and npm, clone this repository (or extract its source ZIP), and open PowerShell in its folder:

```powershell
cd "your directory"
npm.cmd ci
npm.cmd run dev
```

Run `npm.cmd run package:x64` to build the currently verified x64 installer into `dist/`. This prepares native dependencies and builds the application. `npm.cmd run package` targets both x64 and ARM64; ARM64 currently requires resolving the runtime-download issue and runtime acceptance. Installer builds are unsigned unless signing credentials are supplied separately. Initial dependency/runtime downloads require internet access. Installed users do not run these commands.

## Configure and recover

API keys are encrypted by Windows and stay out of exported settings. Valid changes save automatically; invalid edits retain the last valid value and show an explanation. **Advanced → Open Config Folder** opens the actual per-user storage location. Settings and imported artwork live outside the installation folder, so replacing the application does not replace your personal configuration. Exported settings contain personal prompt/persona text and settings, but exclude API keys and sprite image files; export Sprite Packs separately. Do not share your whole config folder publicly.

Replace idle, thinking and speaking artwork in **Settings → Sprites**, individually or through a Sprite Pack. The temporary artwork uses blue idle, amber thinking and green speaking states. Rendering, importing and animation do not depend on these files' contents.

If appearance edits cause trouble, open **Appearance → Reset this panel to defaults**. Use the corresponding panel reset for sprite or interaction changes. **Advanced → Import/Export Settings** manages snapshots; **Reset All Settings** requires typing `RESET` and keeps a backup. Stored keys are cleared separately. **Open Config Folder** and **Open Logs Folder** show the actual storage locations.

Automatic desktop pinning is deferred. See [manual Task View pinning](docs/manual-virtual-desktops.md).

## Troubleshooting and updates

| Problem                                        | What to do                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprite is hidden or not clickable              | Use **Ctrl + Shift + H** or the tray's **Show companion**. Open **Settings** from the tray if click-through or sprite settings prevent interaction. Check General's fullscreen-hiding setting.                            |
| A shortcut does not work                       | Another app may own the chord. Use the tray's **Open input** or **Settings**, then choose a different shortcut in General.                                                                                                |
| No model response                              | Start your local server, check the provider URL/model, or enter a valid hosted-provider key. Use **Model → Test Connection**.                                                                                             |
| Appearance or sprite settings broke the layout | Open Settings from the tray and use the affected panel's **Reset this panel to defaults**.                                                                                                                                |
| Need logs for a bug report                     | Use **Advanced → Open Logs Folder**. Review logs before sharing and keep prompt/reply redaction enabled. Include the app version and steps to reproduce in a [GitHub issue](https://github.com/KenaiNH/LittleLLM/issues). |
| Want a newer build                             | Quit from the tray and run the newer installer. Auto-update is unavailable. Back up settings and custom Sprite Packs first.                                                                                               |

Uninstalling the app is separate from clearing its per-user data. To clear settings or keys, use the explicit reset/key-clear actions before uninstalling. **Reset All Settings** keeps a backup, so it is not a privacy wipe.

## Scope and validation

See [release readiness](docs/release-readiness.md), [feature status](docs/feature-status.md), [progress](docs/progress.md), [implementation plan](docs/implementation-plan.md), and [discrepancies and test skips](docs/DISCREPANCIES.md). Dictation, mouth/lip sync, region screenshot selection, auto-update and automatic desktop pinning are future work.

Voice output remains implemented; further voice-specific testing was explicitly skipped. A protocol fixture validates request behavior, not hosted-provider quality. Do not interpret a skipped test as a pass.

Developer verification: run `npm.cmd run test:nonvoice`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, then `npm.cmd run smoke:nonvoice`. The latter excludes mouse-injected native clicking, which needs an untouched pointer and is run separately. `npm.cmd test` and `npm.cmd run smoke` include voice suites and should not be used while the voice-test waiver is active. See [release-checklist.md](docs/release-checklist.md) for results and outstanding acceptance.

## License

LittleLLM uses the [GNU General Public License version 3](LICENSE). The installer includes this license; third-party components retain their own notices. Release downloads should include access to the matching source version.
