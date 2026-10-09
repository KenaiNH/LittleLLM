# Low-priority future features

These features are explicitly outside the current release by user decision. They do not block the remaining implementation plan.

- Region screenshots: screen-region selector, capture-and-attach action and its shortcut. File and clipboard image attachments remain implemented.
- Mouth animation and lip syncing: speech amplitude analysis, mouth compositing and drivers, Voice mouth-sync toggle/link and Test Voice live mouth preview. Existing mouth asset import/configuration controls remain for compatibility; importing frames does not activate a speech-driven overlay.
- Auto-update: update feeds, channel selection, background checks/downloads and automatic installation. Packaging and manual installation remain in scope.
- Automatic Windows virtual-desktop pinning: “Show on all virtual desktops” integration. Use manual Task View pinning for now; no undocumented Windows interfaces in this release.
- All voice input/dictation: microphone capture/preview, Whisper/OpenAI-compatible, local executable, Custom HTTP, Windows dictation/fallback, transcripts and all activation modes. Resume from [voice-input-handoff.md](voice-input-handoff.md); the Windows backend conflict has a linked separate handoff.

See `DISCREPANCIES.md` entries 26, 31, 35 and 38 for the superseded requirements and acceptance gates. Kokoro testing and further voice acceptance are separately recorded test skips, not implemented or deferred UI features.
