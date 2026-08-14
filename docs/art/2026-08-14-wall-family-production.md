# Production Wall Family Art Pass — 2026-08-14

## Outcome

Floors 1–5 now each have a curated ten-wall production family: six quiet/common walls, three character walls, and one rare/hero wall. The library contains 50 accepted assets total. All five canonical walls remain byte-for-byte unchanged from the task-start branch; 45 deterministic siblings were authored or replaced.

No wall-selection logic was implemented. The renderer change in this pass is an explicit `?wallPreview=<asset>` QA hook only. Its asset imports are lazy, so ordinary game startup does not fetch or inflate the initial bundle with unused sibling art.

The accepted filenames, category, provenance, and recommended future weight are machine-readable in [manifest.json](wall-family-production/manifest.json).

## Repository state

- Isolated worktree: `/home/sloppymo/OnyxLabyrinth-wall-tile-variants`
- Branch: `art/wall-tile-variants`
- Exact `origin/main` base inspected before work: `11573958c9a69875317ef952f660ee01dc707420`
- Task-start branch tip: `379213fc30cb2f2883efcb3762bfc64f460acab1`
- Tooling commit: `6c1aaed27170f5f56d462683ee7c27ad1ff9f0c8`
- Production-art commit: `8e8e73920ef9654c9e7bed8bfd83e607fda6d8dd`
- Final documentation commit/branch tip: reported in the handoff, because a commit cannot contain its own hash.

The shared root worktree was not used because it contained unrelated Camp/browser output and was on an audit branch. No unrelated root-worktree files were copied, staged, deleted, or absorbed.

Local-only exclusions retained for review:

- `assets/wall-family-production/`: PixelLab source trials, intermediate contact sheets, and Aseprite round-trip copies.
- `playtest-screenshots/wall-family-production/`: all 100 final renderer captures, reports, the Canvas regression audit, and diagnostic smoke passes.
- `.env` and `node_modules` worktree links: ignored setup only; neither is committed.

## Pipeline

### Inventory and art direction

The current bundled renderer imports were treated as authoritative. The dated audit documents were checked against the task-start assets rather than assumed current. Initial single-tile contacts and 3×3 repeats showed that the canonical walls were strong anchors, while older siblings relied too heavily on repeated crack stamps, flat palette shifts, or the previously identified landmark motifs.

The canonical production walls are:

- `src/assets/f1_wall_256.png`
- `src/assets/f2_wall_256.png`
- `src/assets/f3_wall_256.png`
- `src/assets/f4_wall_256.png`
- `src/assets/f5_wall_256.png`

`src/assets/f2b_wall_256.png`, the forbidden-wing regional theme, was also preserved and is not counted as an F2 random sibling.

### PixelLab

The existing `scripts/pixellab-generate.mjs` integration and local `PIXELLAB_API_KEY` were used; no endpoint, credential name, or API behavior was invented. Five successful 400×400 F2 source generations were made after three 512×512 validation requests were rejected by the current API limit before image generation.

The successful source trials were:

| Trial | Requested role | Disposition | Reason |
|---|---|---|---|
| `f2-quiet-trial-01` | quiet | REJECT | Tiny repeated mini-shelves created internal wallpaper. |
| `f2-quiet-trial-02` | quiet | REJECT | Read as a framed furniture panel with identical spines. |
| `f2-character-trial-01` | character | REJECT | Symmetric three-column shelf grid. |
| `f2-character-trial-02` | character | REJECT | Grid plus eye/face-like ornament; hard fail. |
| `f2-hero-trial-01` | hero | REJECT | Centered pillar/scroll monument; too emblematic even for this family. |

All PixelLab outputs remained local source material under `assets/wall-family-production/f2/pixellab-source/`. None entered `src/assets`. The API wrapper exposed a usage field, but the successful process output was not retained, so exact cost is unknown rather than guessed.

### Authored production generation

`scripts/generate-wall-variants.mjs` is the accepted production source. It uses seeded, toroidal material construction rather than palette-shifting a shared template:

- 128×128 logical work grid.
- Exact 2× nearest-neighbor expansion to 256×256 shipping RGB PNGs.
- Integer pixel clusters, limited per-floor palettes, posterized local texture, and no alpha.
- Irregular circular masonry schedules and cropped edge events to avoid centered landmarks.
- Exact opposing-edge agreement on every new sibling.
- Material-specific tools: damp seam growth/scars, grouped archive bays, sparse forge ties/slag, broken Null Choir scoring/voids, and directional cistern seepage.

Generation is deterministic: the aggregate SHA-256 digest of all 45 siblings was identical before and after a clean `npm run wall:generate` rerun.

The five canonical anchors are preserved native production art. F1/F3/F4/F5 received native-256 cleanup in earlier passes and therefore are not forced through the new exact-2× contract; every new sibling passes it, and F2 canonical also happens to pass it.

### Aseprite and image QA

Aseprite 1.3.18.1 batch-round-tripped all five hero PNGs. ImageMagick `compare -metric AE` reported zero differing pixels for every round trip. This verified that the files remain stable through the project’s pixel editor without palette, alpha, or scaling changes.

ImageMagick produced the committed contact/repeat evidence. `scripts/validate-wall-families.mjs` performs the production checks and writes [validation.json](wall-family-production/validation.json): dimensions, bit depth, PNG color type, opacity, logical 2× structure, edge jumps, exact hashes, per-family near-duplicate checks, palette size, and mean luminance.

## Floor 1 — Hall of Five Wounds

Accepted: 10 (`f1_wall_256.png`, `f1_wall_b_256.png` through `f1_wall_j_256.png`).

| Role | Assets | Direction |
|---|---|---|
| Quiet | base, b–f | Damp olive-gray limestone; varied running bond, minor chips, small seam growth, restrained vertical wetting. |
| Character | g–i | Edge-entering rust scars or increased joint growth without a centered wound symbol. |
| Hero | j | One long, low-contrast oxidized wound entering from an edge. Rare-only. |

The canonical wall was preserved. Older b–e siblings were replaced because their shared crack treatment flattened the family, and the old `f1_wall_c_256.png` connected moss silhouette failed the 3×3 wallpaper test. New c is deliberately dry/quiet with no large moss island.

## Floor 2 — Cursed Library

Accepted: 10 (`f2_wall_256.png`, `f2_wall_b_256.png` through `f2_wall_j_256.png`).

| Role | Assets | Direction |
|---|---|---|
| Quiet | base, b–f | Five-to-seven shelf rhythms; books form readable groups with gaps, stacks, and short local supports rather than one-pixel rainbow noise. |
| Character | g–i | Empty bay, broken edge support, and edge-cropped scroll grouping. |
| Hero | j | Local shelf collapse entering from the right edge. Rare-only. |

The dense canonical PixelLab-derived production bookshelf was preserved as the high-density anchor. All nine siblings are new. The five new PixelLab experiments were rejected after fresh QA; the accepted siblings were authored procedurally because controlled shelf rhythm was substantially stronger than rescuing framed or symmetric generations.

## Floor 3 — Forge of Ashes

Accepted: 10 (`f3_wall_256.png`, `f3_wall_b_256.png` through `f3_wall_j_256.png`).

| Role | Assets | Direction |
|---|---|---|
| Quiet | base, b–f | Soot-black masonry, sparse ember punctuation, varied short iron ties, and different block schedules. |
| Character | g–i | Restrained edge slag, heavier soot, or an interrupted iron band. |
| Hero | j | Strongest edge-entering slag wound, with embers still sparse enough to avoid a lava-wall read. Rare-only. |

The canonical wall was preserved. Older b–d were replaced. The former `f3_wall_c_256.png` adjacent light repair rectangle was eliminated; the only repair language now appears in d as three nonadjacent stones blended at low contrast.

## Floor 4 — The Null Choir

Accepted: 10 (`f4_wall_256.png`, `f4_wall_b_256.png` through `f4_wall_j_256.png`).

| Role | Assets | Direction |
|---|---|---|
| Quiet | base, b–f | Cold purple-gray masonry, interrupted pale scoring, small clean absences, and one restrained broken rail. |
| Character | g–i | Longer erased scoring, shallow edge losses, or a more interrupted architectural rail. |
| Hero | j | Angular, edge-cropped missing-stone recess with broken scoring. Explicit placement preferred. |

The canonical wall was preserved. Older b–d were replaced, including the old d full-height pilaster repeat. The first new j draft was also rejected: its curved void formed a crescent/eye in 3×3 repetition. The final j is angular and masonry-aligned. It remains intentionally conspicuous under forced repetition and must not enter an ordinary-frequency pool.

## Floor 5 — The Weeping Cistern

Accepted: 10 (`f5_wall_256.png`, `f5_wall_b_256.png` through `f5_wall_j_256.png`).

| Role | Assets | Direction |
|---|---|---|
| Quiet | base, b–f | Wet teal masonry, water-driven value changes, low tide traces, eroded joints, and sparse mineral flecks. |
| Character | g–i | Stronger directional seep channels, a restrained waterline, or heavier joint algae. |
| Hero | j | Long mint mineral seep/scar entering from an edge. Rare-only. |

The canonical wall was preserved. Older b–e were replaced. The former d/e stain language was too blob-like; the accepted d uses narrow directional channels and no large connected algae island.

## Generation statistics

| Source | Images generated/produced | Accepted | Rejected/reworked |
|---|---:|---:|---:|
| PixelLab successful generations | 5 | 0 | 5 |
| Deterministic authored siblings | 45 | 45 | 1 internal F4 hero composition was redesigned before final output |
| Preserved canonical anchors | 5 | 5 | 0 |
| Final library | 50 | 50 | — |

PixelLab acceptance rate was 0%; this is intentional curation, not a quality shortfall hidden by counting AI output. The 45 accepted siblings were iterated as a family through palette, landmark, and renderer QA before finalization.

## Visual evidence

- [Master native contact sheet](wall-family-production/master-contact-sheet.png)
- Per-floor contacts: [F1](wall-family-production/f1-family.png), [F2](wall-family-production/f2-family.png), [F3](wall-family-production/f3-family.png), [F4](wall-family-production/f4-family.png), [F5](wall-family-production/f5-family.png)
- [Cross-floor grayscale comparison](wall-family-production/cross-floor-grayscale.png)
- Mixed sequences: [`docs/art/wall-family-production/mixed/`](wall-family-production/mixed/)
- 3×3 repeats for all 50 accepted assets: [`docs/art/wall-family-production/repeats/`](wall-family-production/repeats/)
- Actual Canvas family contacts: [`docs/art/wall-family-production/renderer/canvas/`](wall-family-production/renderer/canvas/)
- Actual WebGL family contacts: [`docs/art/wall-family-production/renderer/webgl/`](wall-family-production/renderer/webgl/)
- [Canvas renderer master](wall-family-production/renderer/canvas-master-contact.png)
- [WebGL renderer master](wall-family-production/renderer/webgl-master-contact.png)
- [Required renderer regression poses](wall-family-production/renderer/renderer-regression-four-poses.png): straight corridor, open side passage, front wall, and darkness.
- Full-resolution local captures and machine report: `playtest-screenshots/wall-family-production/renderer-all/`

The final renderer sweep captured all 50 assets in both Canvas and WebGL: 100 captures, zero browser errors, zero active-renderer mismatches. A first general visual-audit run reproduced the known WebGL harness issue: it sampled the hidden Canvas and reported luminance zero while the WebGL screenshot remained valid. That result is retained under `supporting/hidden-canvas-false-failure/`. The same straight/side/front/darkness audit was rerun with Canvas explicitly active and passed every geometry, visibility, asset, browser, HTTP, regional-theme, and lifecycle check.

## Verification

- `npm run wall:generate`: deterministic aggregate digest unchanged.
- `npm run wall:validate -- --json docs/art/wall-family-production/validation.json`: PASS, 50/50 accepted, no failures, no exact or near duplicates.
- Aseprite hero round-trip: PASS, zero changed pixels for F1–F5.
- Actual renderer sweep: PASS, 100 captures, zero browser errors, zero backend mismatches.
- Canvas renderer regression audit: PASS, including straight corridor, open side passage, depth-0 front wall, darkness, all Floor 1 regional themes, automap transition, and combat return.
- `npm run check`: PASS — 120 test files and 2,350 tests, build/typechecks, floor validation, and floor export check.
- `git diff --check`: PASS before each production commit.

The full check retained the known pre-existing Floor 1 Namanda warnings: missing NPC combat identity, unbundled `namanda` theme, and the documented zone overlaps. Floors 2–5 validated with no issues. Vite also retained its existing unresolved source-font and large-chunk warnings; neither was introduced by this art pass. The lazy preview imports keep ordinary `shell` output at approximately 131 kB / 58 kB gzip; sibling assets live in query-only lazy chunks.

## Known remaining concerns

- Forced repetition correctly makes all hero tiles recognizable. They are not approved for common selection; F4 j especially should use explicit authored placement or an extremely low deterministic weight.
- The five canonical anchors are more densely hand-rendered than some quiet siblings. In-engine distance, fog, and material palette unify them, but a future selection pass should avoid placing the canonical at a mechanically regular interval.
- F2’s canonical wall is much denser than b–j. Its recommended future weight is slightly reduced so it acts as a dense archive bay, not every other wall.

No accepted common wall has a visible seam, large fixed moss/algae island, centered emblem, face/eye motif, repair rectangle, full-height repeated pilaster, broad baked light gradient, filtered pixel scale, or wrong material.

## Recommendation for deterministic variant selection

Use a stable hash of floor id plus the canonical physical wall edge—not frame time or traversal order—so both sides of the same edge agree and saves/replays remain stable. Select from category-aware weighted tables in [manifest.json](wall-family-production/manifest.json): quiet walls at ordinary weight, character walls around 0.2–0.35, and heroes around 0.03–0.06. Do not let two hero edges appear in one normal camera view.

Prefer explicit map metadata for F4 j and other story-level hero walls. If heroes are allowed in the hashed pool, add deterministic spacing suppression and adjacency rules. Keep the preview hook separate from that system; it should remain an exact named-asset QA path, never selection logic.
