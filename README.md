# LittleLLM

Windows desktop AI sprite companion built with Electron, TypeScript, React and Zustand. The companion starts at the bottom-right by default.

## Run from this repository

```powershell
cd C:\Users\Kenai\LittleLLM
npm.cmd ci
npm.cmd run dev
```

For a production build, run `npm.cmd run build`. `npm.cmd run package` builds Windows x64 and arm64 NSIS installers into `dist/`. Installer builds are unsigned.

Click the sprite to open the response input. **Ctrl + Shift + Space** opens and focuses it; **Ctrl + Shift + H** shows or hides the companion. **Esc** cancels an active response. Right-click the sprite or the system-tray icon to open **Settings**. Closing to tray keeps the app running; choose **Quit** in the tray menu to exit.

## Configure and recover

First launch opens Model settings. Choose a provider and endpoint/model, enter an API key if required, and use **Test Connection**. API keys are encrypted by Windows and stay out of exported settings. Changes save automatically; invalid edits retain the last valid value and show an explanation.

Replace idle, thinking and speaking artwork in **Settings → Sprites**, individually or through a Sprite Pack. The temporary artwork uses blue idle, amber thinking and green speaking states. Rendering, importing and animation do not depend on these files' contents.

If appearance edits cause trouble, open **Appearance → Reset this panel to defaults**. Use the corresponding panel reset for sprite or interaction changes. **Advanced → Import/Export Settings** manages snapshots; **Reset All Settings** requires typing `RESET` and keeps a backup. Stored keys are cleared separately. **Open Config Folder** and **Open Logs Folder** show the actual storage locations.

Automatic desktop pinning is deferred. See [manual Task View pinning](docs/manual-virtual-desktops.md).

## Scope and validation

See [feature status](docs/feature-status.md), [progress](docs/progress.md), [implementation plan](docs/implementation-plan.md), and [discrepancies and test skips](docs/DISCREPANCIES.md). Dictation, mouth/lip sync, region screenshot selection, auto-update and automatic desktop pinning are future work.

Voice output remains implemented; further voice-specific testing was explicitly skipped. A protocol fixture validates request behavior, not hosted-provider quality. Do not interpret a skipped test as a pass.

Run `npm.cmd run typecheck`, `npm.cmd run lint`, and the scoped non-voice tests documented in the release checklist. `npm.cmd test` and `npm.cmd run smoke` include voice suites, so they should not be used while the voice-test waiver is active.
