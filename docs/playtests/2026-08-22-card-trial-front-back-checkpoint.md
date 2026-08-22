# Card Trial Front/Back presentation checkpoint

Date: 2026-08-22

## Delivered presentation contract

- Card Trial alone sets the optional `CombatState.partyFormation` profile.
- Back resolves from `{ x: 500, footYFrac: 0.4 }`; Front resolves from
  `{ x: 555, footYFrac: 0.62 }`.
- Rat King and Old Man receive an actor-stable `+16` / `-16` lateral nudge.
  The nudge is identical in both rows, cancels out of row-transition deltas,
  and keeps legal same-row states readable.
- Canvas, Phaser, and `findActor()` share the same actor-position resolver.
- Row changes use the existing `ActorAnim` offset machinery for 200 ms.
  Paid and printed-card movement share the same `partyRowMove` event.
- Hero Front/Back words are absent from the hand title and party status.
  The Rat row label remains because the Rat has no battlefield sprite.

## Final automated gate

`npm run check` passed twice: once in the shared final worktree and once from
an isolated synthetic commit containing exactly the checkpoint index.

- test, app, and tools TypeScript checks passed;
- the Vite production build passed;
- the shared worktree passed 143 Vitest files / 2,608 tests (including two
  unrelated, unstaged Gate A test files);
- the isolated checkpoint passed 141 Vitest files / 2,579 tests;
- floor validation passed with only the existing Floor 1 authoring warnings;
- floor export consistency passed.

The regression suite includes an exact before/after proof for ordinary
one-to-four-member campaign party positions across multiple backdrops. Its
absent-profile path still uses the original index-based slots. It also covers
the production foot-Y paint sort, both Card Trial row orders, same-row actor
separation, 200 ms transition timing, and the printed-card banner-before-move
sequence.

## Final spatial fixtures

Run:

```text
ONYX_URL=http://127.0.0.1:5207/OnyxLabyrinth/ \
  node scripts/playtests/card-trial-front-back-verify.mjs
```

Result against the isolated checkpoint build: passed with `page errors []`.

Local evidence is preserved under
`playtest-screenshots/card-trial-front-back-final/` (gitignored by repository
policy), including `report.json`, individual normal-scale captures, and two
contact sheets. The matrix covers:

- Rat King Front / Old Man Back;
- Rat King Back / Old Man Front;
- both heroes in Back and both heroes in Front;
- paid Front-to-Back and Back-to-Front motion frames;
- printed Lunge holding the old row during its banner, moving to Front, then
  attacking;
- one-enemy boss, two-enemy, and three-enemy encounters;
- floor 1 and floor 2 backdrops;
- Canvas and Phaser.

At normal gameplay scale, the lower/nearer Front anchor remains the dominant
row signal in both hero orders, and Front wins overlap through the existing
live foot-Y sort. The lateral nudge was re-evaluated and left at 16 px: it
prevents same-row collapse without weakening the depth read.

## Frozen reference-agent oracle

Run against the same isolated checkpoint production build:

```text
ONYX_URL=http://127.0.0.1:5207/OnyxLabyrinth/?debug=1 \
  node scripts/playtests/card-trial-reference-agent-run.mjs
```

Result:

- all 10 fights ended in victory;
- 11 paid moves (Rat King 7, Old Man 4);
- returned to the Card Trial lobby after fight 10;
- `page errors []`.

The run artifacts are preserved under
`playtest-screenshots/card-trial-reference-agent-run/`, including
`decisions.log`, `summary.txt`, and `telemetry.json`.

This oracle covers gameplay, DOM, rules progression, and deterministic policy
behavior. It does **not** prove canvas-pixel correctness. The spatial fixture
captures above are the visual evidence.
