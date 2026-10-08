# Sprite authoring

The included blue idle, amber thinking and green speaking sprites are temporary placeholders. Replace them independently in Settings → Sprites; the renderer and state machine have no dependency on their artwork. Imports copy original files into the application's managed user-data directory, so deleting the source does not break the companion.

Use transparent PNG or WebP artwork with a consistent canvas and anchor. A 128–512 px canvas is practical for a desktop sprite. Leave transparent edge pixels to avoid clipping during scaling; the combined alpha mask determines which pixels accept mouse input. Bottom center is the default anchor; custom normalized X/Y anchors align differently sized states during transitions.

Static sources may also contain GIF, APNG or animated WebP frames. Sheet cells share dimensions and follow either left-to-right then down, or top-to-bottom then right. Check the detected cell size, columns and frame count after importing; the preview can pause and scrub. Folder/multiselect sequences use natural filename order (`frame2` before `frame10`) and equal dimensions. Typical animation speeds are 8–16 fps; retain source timing for authored animated images. Playback modes apply independently to every state. A non-looping animation holds its final frame while that state remains active.

Each image must be at most 25 MiB, 8,192 px per dimension and 512 decoded frames. All decoded active assets must fit the configured sprite cache budget. Raw sequence bytes are bounded by the greater of 256 MiB and that budget. Invalid imports preserve the last valid configuration.

Mouth artwork contains 2–8 frames ordered **quietest → loudest**, with the closed mouth first. Use a horizontal strip or a square-cell grid, or an equal-size image sequence. Square grids with 2–8 cells are inferred automatically; other strips use the configured mouth frame count. Changing that count divides the strip width again. Keep mouth artwork separate from the base sprite and use its X/Y offsets to align it. The Settings test tone previews drivers; runtime speech compositing integrates with the TTS pipeline.

## Sprite Packs

Export from Settings to obtain a ZIP with the exact current schema and artwork. Import previews its contents and requires confirmation before replacing active sprites. ZIP paths are relative, unique without regard to case and cannot traverse directories. Archives are limited to 128 MiB compressed, 256 MiB expanded, 2,000 entries and a 1 MiB manifest. Individual image limits still apply.

`pack.json` has `version: 1`, a `name`, the complete `sprite` configuration, and an optional `persona` card. Each state's `source` is relative to that state's directory inside the archive. For example, `idle.source: "art.png"` refers to `idle/art.png`; sequence source `frames` refers to `idle/frames/`. Only referenced original assets are exported; decoded caches and secrets are excluded.

```json
{
  "version": 1,
  "name": "My companion",
  "sprite": {
    "idle": { "mode": "static", "source": "idle.png" },
    "thinking": { "mode": "sheet", "source": "thinking.png", "frameWidth": 128, "frameHeight": 128, "columns": 4, "frameCount": 4 },
    "speaking": { "mode": "frames", "source": "frames" }
  }
}
```

Omitted config fields receive the authoritative schema defaults. The Zod schemas in `src/shared/config.ts` and `src/shared/spriteImport.ts` define all optional fields, ranges and persona-card fields. Persona policy and voice-override consent are integrated in the ordered Persona phase; currently bundled cards are preserved without activation.
