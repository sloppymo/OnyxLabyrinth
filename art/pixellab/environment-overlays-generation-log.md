# Environmental wall and ceiling overlay pass

Branch: `agent/environment-overlays-v2`, based on current `origin/main` (`f463f3c`), with Phase 1 commits cherry-picked.

## Production decision

The repository already has the needed reusable primitives. `wallFeatures` draw
the regional wall first and then alpha-composite one cached sprite strip with
the existing wall projection, fog, darkness, and nearest-neighbor settings.
`ceilingFeatures` are full-cell ceiling texture replacements by design, while
`ceilingSprites` are cached top-anchored hanging billboards. No renderer
extension was necessary.

## Accepted wall overlays after visual review

| ID | PixelLab operation | Size | Result | Shipping path | Placement |
|---|---|---:|---|---|---|
| `wall-soot-smear-a` | `create_map_object`, 64x96 | KEEP | `public/assets/wall-features/wall-soot-smear-a.png` | F1 forge seam, (14,9), south face |
| `wall-crack-small-c` | `create_map_object`, 48x48, local palette correction | 48x48 | KEEP | `public/assets/wall-features/wall-crack-small-c.png` | F1 index, (3,13), east face |
| `wall-root-corner-a` | `create_map_object`, local palette lift | 32x64 | KEEP | `public/assets/wall-features/wall-root-corner-a.png` | F1 index, (4,15), south face |

All three have genuine RGBA transparency and were visually inspected at native
pixel scale and over the F1 wall. The old damp, moss, and rock-like crack
assets were removed from the shipping registry after gallery review.

Final shipped addition count in this branch: 3 wall overlays, 1 ceiling
surface replacement, and 7 hanging sprites. The two damp families and moss
are intentionally parked until a candidate reads as a physical surface mark
at gameplay scale.

## Phase 2 candidate outcomes

The literal-geometry strategy was tested with 10 Pixen jobs and 20 map-object
jobs. Pixen repeatedly returned full wall scenes at 32–64px, so those outputs
were rejected. Basic map-object generation produced reliable transparent
cutouts. Seven hanging assets were accepted: `f1-chain-loop-a`,
`f1-rope-loop-a`, `f1-hook-small-a`, `f1-pulley-a`, `f1-bucket-small-a`,
`f1-web-strands-a`, and `f1-counterweight-small-a`.

One 256x256 Pixen ceiling replacement, `f1-ceiling-fracture-b`, was retained
after a deterministic palette correction against the existing full-cell
ceiling-feature contract. A PixelLab recolor edit was rejected because it
invented a complete stone-tile grid. The pulley and bucket were edited with
PixelLab and accepted after visual review; the moss edit was rejected because
it retained floating/background structure, and both damp families were
regenerated and rejected for slash/metal-like silhouettes.

The final count is 43 submitted PixelLab jobs total across both phases: 31
Phase 2 submissions plus the 12 Phase 1 jobs. The second pass used four
PixelLab edit jobs for moss, root, pulley, and bucket, plus one ceiling recolor
edit. The root/pulley/bucket edits were useful, while the moss and ceiling edit
were rejected; the final ceiling palette adjustment preserved its geometry.

## Candidate outcomes

Rejected candidates include a loose rock pile, masonry-background crack,
leafy tree root, framed repair slab, stacked masonry "clamps", slash-like damp
marks, a metal-strip damp mark, floating moss fragments, and a full stone-grid
ceiling edit. These failures are kept under
`art/pixellab/environment-overlays-v2/rejected/` or `candidates/` for audit,
but are not registered or shipped.

The service's eight-job concurrency limit was hit during both phases;
subsequent batches were throttled and polled to completion. PixelLab MCP
operations actually used:
`create_image_pixen`, `create_map_object`, `get_image`, `get_map_object`, and
the returned download endpoints.

## Existing ceiling library retained and expanded

The current branch already contains the accepted Floor 1 ceiling library and
does not alter Camp sky art. It adds one new 256x256 ceiling replacement and
seven hanging sprites, all using the existing registries and renderer paths.

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
