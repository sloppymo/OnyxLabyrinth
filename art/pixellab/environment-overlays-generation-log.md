# Environmental wall and ceiling overlay pass

Branch: `agent/environment-overlays`, based on `088b4c4`.

## Production decision

The repository already has the needed reusable primitives. `wallFeatures` draw
the regional wall first and then alpha-composite one cached sprite strip with
the existing wall projection, fog, darkness, and nearest-neighbor settings.
`ceilingFeatures` are full-cell ceiling texture replacements by design, while
`ceilingSprites` are cached top-anchored hanging billboards. No renderer
extension was necessary.

## Accepted new wall overlays

| ID | PixelLab operation | Size | Result | Shipping path | Placement |
|---|---|---:|---|---|---|
| `wall-damp-streak-a` | `create_image_pixen`, seed 8802 | 96x96 | KEEP | `public/assets/wall-features/wall-damp-streak-a.png` | F1 cistern, (16,16), east face |
| `wall-moss-edge-a` | `create_image_pixen`, seed 8803 | 96x96 | KEEP | `public/assets/wall-features/wall-moss-edge-a.png` | F1 unfinished index, (2,16), west face |
| `wall-soot-smear-a` | `create_map_object`, 64x96 | KEEP | `public/assets/wall-features/wall-soot-smear-a.png` | F1 forge seam, (14,9), south face |

All three have genuine RGBA transparency and were visually inspected at
native pixel scale. The sparse moss is deliberately restrained; the soot is a
narrow torch-history mark rather than a full wall repaint.

## Candidate outcomes

Accepted/reviewed candidates: 12 jobs total, 3 shipped. Rejected candidates
included a loose rock pile, masonry-background crack, leafy tree root, framed
repair slab, stacked masonry "clamps", a stone-background water result, an
overbright centered moss result, and text-like tally bands. These failures are
kept in `art/pixellab/environment-overlays/candidates/` for audit, but are not
registered or shipped.

The service's eight-job concurrency limit was hit once; subsequent batches were
throttled and polled to completion. PixelLab MCP operations actually used:
`create_image_pixen`, `create_map_object`, `get_image`, `get_map_object`, and
the returned download endpoints.

## Existing ceiling library retained

The current branch already contains the accepted Floor 1 ceiling library:
10 ceiling surface replacements in `src/data/ceiling-features.ts` and 13
hanging sprites in `src/data/ceiling-sprites.ts`, with live review captures in
`docs/floor1-ceiling-art-review/`. This pass retains those assets and places no
new Camp art. New ceiling-generation work was intentionally parked after the
quality screen rather than duplicating an already reviewed library.

## Reusable lessons

- Use Pixen for low-resolution transparent surface marks, but keep prompts
  literal and short; long material descriptions drift into complete scenes.
- `create_map_object` is useful for isolated hardware but frequently invents a
  freestanding prop; inspect the pixels before accepting it as a wall decal.
- Alpha metrics are a filter, not an art director: all candidates were checked
  with dimensions, alpha bounding box, color count, and coverage, then viewed
  over gameplay-scale walls.
- Avoid centered squares. Edge/junction prompts produced the most plausible
  attachment; any full-background or plaque-like output was rejected.
