# Discrepancies and decisions

1. Spec paths have download suffixes: use desktop_companion_spec (1).md and settings_window_spec (4).md; no canonical copies existed.
2. MCP page listing returned only Settings, but direct node 2012:2 exposed TextChat. The user supplied that direct link; both pages are inspected.
3. Older Settings frames have seven-item navigation; Persona specimens have eight. Use the latter and required Ctrl+1–8 order without changing visual styling.
4. RESOLVED by user: anchored bubble pairs with sprite; the full-width bottom text box is for user response. Implement a separate secure input window so its width does not expand the transparent pet window across the display.
5. RESOLVED by user: Figma fonts, designs and colors take precedence over everything. Ship Courier Prime 22 px, blue #647ead dialogue, 560 px default width, square inset borders and white shadowed text. All Appearance controls/options/ranges remain present for later customization. Native Settings chrome remains required.
6. Settings 76 is reused for mock reply speed and conversation persistence. Use separate config fields and document identifiers in the coverage inventory.
7. Main §10.8 permits media only for pet, but Settings 215 requires visible-panel microphone preview. Needs an explicitly activation-scoped permission policy; unresolved before STT implementation.
8. Settings 103 defines binary/JSON-base64/JSON-URL response modes while main TTS example lists binary/SSE-base64/JSON-path. Keep the visible options required by Settings and record the technical mapping before provider implementation.
9. Main §9.2 disables image attach for known text-only models; Settings image subsection warns and sends anyway. Architecture/runtime authority is main: gate attachments for positively known unsupported capability; show amber uncertainty for unprobed models.
10. Main mentions step 19 as Persona in changelog, but §14 orders Persona at 18 and packaging at 19; follow the operative numbered build sequence.
