# Environmental wall and ceiling overlay pass

Branch: `agent/environment-overlays-v2`, based on current `origin/main` (`f463f3c`), with Phase 1 commits cherry-picked.

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
| `wall-moss-edge-a` | `create_image_pixen`, seed 8803 | 96x96 | KEEP | `public/assets/wall-features/wall-moss-edge-a.png` | F1 upward cistern transition, (15,17), west face |
| `wall-soot-smear-a` | `create_map_object`, 64x96 | KEEP | `public/assets/wall-features/wall-soot-smear-a.png` | F1 forge seam, (14,9), south face |
| `wall-crack-small-b` | `create_map_object`, 48x48 | KEEP | `public/assets/wall-features/wall-crack-small-b.png` | F1 index, (3,13), south face |
| `wall-root-corner-a` | `create_map_object`, 32x64 | KEEP | `public/assets/wall-features/wall-root-corner-a.png` | F1 index, (4,15), east face |
| `wall-damp-streak-b` | `create_map_object`, 32x64 | KEEP | `public/assets/wall-features/wall-damp-streak-b.png` | F1 cistern, (18,17), west face |

All three have genuine RGBA transparency and were visually inspected at
native pixel scale. The sparse moss is deliberately restrained; the soot is a
narrow torch-history mark rather than a full wall repaint.

## Phase 2 candidate outcomes

The literal-geometry strategy was tested with 10 Pixen jobs and 16 map-object
jobs. Pixen repeatedly returned full wall scenes at 32–64px, so those outputs
were rejected. Basic map-object generation produced reliable transparent
cutouts. Seven hanging assets were accepted: `f1-chain-loop-a`,
`f1-rope-loop-a`, `f1-hook-small-a`, `f1-pulley-a`, `f1-bucket-small-a`,
`f1-web-strands-a`, and `f1-counterweight-small-a`.

One 256x256 Pixen ceiling replacement, `f1-ceiling-fracture-b`, was accepted
against the existing full-cell ceiling-feature contract. A second water tile
was rejected for a bright cyan edge. Four surface-mark map objects were
rejected for blank, bug-like, or oversized output.

The final Phase 2 count is 34 PixelLab jobs total across both phases: 22
successful Phase 2 jobs plus the 12 Phase 1 jobs. Eleven new assets were
accepted in Phase 2 and eleven new candidates were rejected. No inpainting was
needed after the map-object path began producing clean silhouettes; the
promising Pixen outputs were not structurally salvageable because they baked
complete walls into the canvas.

## Candidate outcomes

Accepted/reviewed candidates: 12 jobs total, 3 shipped. Rejected candidates
included a loose rock pile, masonry-background crack, leafy tree root, framed
repair slab, stacked masonry "clamps", a stone-background water result, an
overbright centered moss result, and text-like tally bands. These failures are
kept in `art/pixellab/environment-overlays/candidates/` for audit, but are not
registered or shipped.

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
