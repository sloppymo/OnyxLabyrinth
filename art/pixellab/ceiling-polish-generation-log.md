# Ceiling-Environment-Art Polish Pass — PixelLab Generation Log

Follow-up to `ceiling-art-generation-log.md` and `maze-environment-generation-log.md`,
after a user review of the shipped batch (see memory `big-fake-geometry-principle`).
7 assets targeted, all via `scripts/pixellab-generate.mjs` (REST,
`create-image-pixflux`), palette-conditioned the same way as the original pass.

| id | issue | fix | candidates |
|---|---|---|---|
| f1-bell-cracked | upper silhouette read as horns/handles, not unmistakably a bell | led with "bell-mouth is the widest part," specified a simple straight loop hanger (explicit negative: no horns, no symmetrical handles) | 1, accepted |
| f1-root-curtain | strands too straight/parallel/liquid — could pass for icicles or dripping slime | required irregular knotted thickness, asymmetric bends, fibrous rootlet filaments, at least two strands branching into a lateral tangle | 1, accepted |
| f1-forge-counterweight | too many separated orange/gray detail clusters, not enough continuous silhouette | required one continuous dark iron mass, restrained detail to 2-3 seams/one rust strip, explicit negative against scattered highlight patches | 1, accepted |
| cantor-lectern | book dominated so completely it read as a floating inventory icon, not furniture | v1 (`v3` in candidates) overcorrected — stand became a solid dark pillar and the book silhouette was lost entirely, rejected. v2 (`v4`) explicitly split the sprite top/bottom: open book kept as a clearly readable pale V on top, stand rebuilt as an equally substantial dark wooden pedestal with visible legs beneath — accepted | 2, v4 accepted |
| forge-guardian-statue | silhouette fragmented, orange highlights carrying too much of the shape | required one continuous dark iron humanoid silhouette, restrained the glow to a chest seam + helm rune + joint lines that trace real armor structure, explicit negative against scattered orange dots | 1, accepted, grounded (+2px) |
| f1-ceiling-grate | "floating punctuation mark" — technically visible but not environmentally persuasive at gameplay distance | this is a full ceiling-plane texture (opaque, matches ceiling.png dimensions), not a billboard — the fix was compositional, not conceptual: thicker crossbars, near-black void gaps, heavier riveted border, filling almost the entire 256×256 frame instead of a small centered pattern. Verified in-engine before accepting (previous entries in this pass were accepted on the raw candidate; this one specifically needed the in-engine check since the whole complaint was about how it read at gameplay scale, not the thumbnail) | 1, accepted |
| vesper | the slate — her defining narrative detail — didn't read independently from the sprite | made the slate an explicit, separately-called-out pale grey-white rectangular tablet with a lighter border, held flat facing the viewer, called out as "the single most important readable detail" so hands/sleeves don't obscure it | 1, accepted, grounded (+2px), re-verified at 1/2/4-tile distance per the user's explicit QA ask |

## Lesson: overcorrection risk on a two-part critique

`cantor-lectern` is the one asset that needed two passes within this polish
round. The critique was "the stand needs to win over the book," and the
first reroll took that literally — the stand became so dominant it erased
the book's readability entirely, the asset's original strongest trait. The
fix wasn't "try harder in the same direction," it was rebalancing: keep the
book's silhouette explicitly protected in the prompt while growing the
stand, rather than trading one problem for its inverse. Worth remembering
for any future "X needs to be more Y" note — check whether Y is genuinely
underweighted or whether the fix risks erasing what was already working.

## Grounding

Two of the four `mapSprites`/NPC assets in this pass needed manual grounding
(forge-guardian-statue +2px, vesper +2px) — same as the original pass, this
pipeline has no automatic floor-anchor step. `cantor-lectern` came in with a
1px gap, judged negligible. Ceiling-sprite billboards (bell-cracked,
root-curtain, forge-counterweight) were checked against the canvas *top*
edge instead (they hang from the ceiling line, not the floor) — all three
landed at row 0 with no correction needed.
