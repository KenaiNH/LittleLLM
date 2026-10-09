# LittleLLM

Windows desktop AI sprite companion built with Electron, TypeScript, React and Zustand. The companion starts at the bottom-right by default. Visual defaults follow the existing Figma design.

## Install and open on Windows

1. Run **LittleLLM Setup 0.1.0.exe** from the release download or this repository's `dist` folder. The currently verified installer is for Windows x64; ARM64 packaging is still pending.
2. Follow the installer and choose an installation folder. Leave **Run LittleLLM** selected on the final screen to open the app.
3. After installation, open **LittleLLM** from the desktop shortcut or the Windows Start menu. You can also double-click **LittleLLM.exe** inside the installation folder you selected.

The installed app includes its runtime. You do not need Node.js, npm, this repository, or a terminal to run it. Keep the executable with its installed files; moving only `LittleLLM.exe` will prevent it from working. The setup executable installs the app; `LittleLLM.exe` runs it afterward.

The current installer is unsigned, so Windows may show an unknown-publisher warning. Only install a build you trust. To uninstall, use **Windows Settings → Apps → Installed apps → LittleLLM → Uninstall**.

## Use the companion

The sprite appears at the bottom-right by default. Click it to open the response input. **Ctrl + Shift + Space** opens and focuses the input; **Ctrl + Shift + H** shows or hides the companion. **Esc** cancels an active response. Right-click the sprite or the system-tray icon to open **Settings**. If the tray icon is hidden, open the tray's overflow menu. Choose **Quit** in the tray menu to exit.

First launch opens Model settings. Choose a provider and endpoint/model, enter an API key if required, and use **Test Connection**. A local model provider must be running separately; a hosted provider needs its own account and credentials. Settings save automatically. You can enable **Launch on login** in General settings for the installed app.

## Developer setup

These commands are only needed to develop or build LittleLLM:

```powershell
cd "your directory"
npm.cmd ci
npm.cmd run dev
```

For a production build, run `npm.cmd run build`. `npm.cmd run package` targets Windows x64 and arm64 NSIS installers in `dist/`; ARM64 currently requires resolving the runtime-download issue. To build just the currently verified x64 installer, run `npm.cmd run prepare:windows`, `npm.cmd run build`, then `npx.cmd electron-builder --win nsis --x64`. Installer builds are unsigned unless signing credentials are supplied separately.

## Configure and recover

First launch opens Model settings. Choose a provider and endpoint/model, enter an API key if required, and use **Test Connection**. API keys are encrypted by Windows and stay out of exported settings. Changes save automatically; invalid edits retain the last valid value and show an explanation.

Replace idle, thinking and speaking artwork in **Settings → Sprites**, individually or through a Sprite Pack. The temporary artwork uses blue idle, amber thinking and green speaking states. Rendering, importing and animation do not depend on these files' contents.

If appearance edits cause trouble, open **Appearance → Reset this panel to defaults**. Use the corresponding panel reset for sprite or interaction changes. **Advanced → Import/Export Settings** manages snapshots; **Reset All Settings** requires typing `RESET` and keeps a backup. Stored keys are cleared separately. **Open Config Folder** and **Open Logs Folder** show the actual storage locations.

Automatic desktop pinning is deferred. See [manual Task View pinning](docs/manual-virtual-desktops.md).

## Scope and validation

See [feature status](docs/feature-status.md), [progress](docs/progress.md), [implementation plan](docs/implementation-plan.md), and [discrepancies and test skips](docs/DISCREPANCIES.md). Dictation, mouth/lip sync, region screenshot selection, auto-update and automatic desktop pinning are future work.

Voice output remains implemented; further voice-specific testing was explicitly skipped. A protocol fixture validates request behavior, not hosted-provider quality. Do not interpret a skipped test as a pass.

Run `npm.cmd run typecheck`, `npm.cmd run lint`, and the scoped non-voice tests documented in the release checklist. `npm.cmd test` and `npm.cmd run smoke` include voice suites, so they should not be used while the voice-test waiver is active.
