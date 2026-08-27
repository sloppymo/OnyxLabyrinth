# Friends & Family Playtest 1 readiness

Date: 2026-08-15  
Candidate branch: `playtest/friends-and-family-1`  
Integration baseline: `origin/main` at `11573958c9a69875317ef952f660ee01dc707420`  
Candidate checkpoint before this report: `178cd170f724c0071ec17166484fd077a16cb992`  
Deployment target: GitHub Pages at `https://sloppymo.github.io/OnyxLabyrinth/`

> **Historical roster note (2026-08-27):** This report predates the fixed
> Old Man + Rat King campaign entry flow. References below to selecting a
> default party or to party creation describe the build tested at the time,
> not the current product. See [`docs/CURRENT-PRODUCT-CONTRACT.md`](../CURRENT-PRODUCT-CONTRACT.md).

## Executive result

**NEARLY READY — FIX LIST PROVIDED**

The candidate is a coherent production build and no P0 blocker was found. A
fresh browser can start a game, take the fixed Old Man + Rat King duo through the prologue and
town into Floor 1, fight, save, reload, and Continue without debug tools. The
five-floor campaign, ending, hubs, companion, Iso-Spells, floor-specific
content, new combat choreography, governed combat barks, and Formation
Chemistry are all represented in the tree.

It is not yet a URL that should be sent out because the candidate has not been
pushed or deployed. The live Pages URL still serves `origin/main` at `1157395`,
not this branch. Before distribution, merge or deliberately publish the final
candidate SHA, confirm the workflow deploys that exact SHA, then repeat the
short fresh-profile smoke against the real URL.

## Build identity

The title screen renders a production build identifier. On this branch it is:

```text
FRIENDS & FAMILY PLAYTEST 1 · <short Git SHA>
```

The Vite build injects the branch and SHA. No gameplay or save field was added
for this label. Current save format is version 18.

## Included feature set

| Feature | Source | In candidate | Player reachable | Production-style verified | Disposition |
| --- | --- | ---: | ---: | ---: | --- |
| Five-floor campaign, three escalating bosses, wish ending | `origin/main` | Yes | Yes | Structural/tests; Floors 2–5 fixtures | Must include |
| Floor 1 Hall of Five Wounds and Kept Gate | `origin/main` | Yes | Yes | Current-map guardian browser fixture | Must include |
| Maze Renderer 2 and vertical ramps/stairs | `origin/main` | Yes | Yes | 12-scene WebGL traversal, lifecycle and performance pass | Must include |
| Camp refuge | `origin/main` | Yes | Yes | Real controller walkthrough | Must include |
| Hot Boi's Tavern, quests, and Vess companion | `origin/main` | Yes | Yes | Hub controller/tests; companion save/combat suites | Must include |
| Church of Saint Namanda | `origin/main` | Yes | Yes | Real controller walkthrough | Must include |
| Isobel's Iso-Spells | `origin/main` plus prop-art selections | Yes | Yes | Door, safe zone, greeting, shop, six spells, pricing, exit | Must include |
| Floor 2 abyss bridge and Cursed Library climax | `origin/main` | Yes | Yes | Flee/re-entry/save/victory browser flow | Must include |
| Floor 3 Duelist's Vigil and Kazeharu | `origin/main` | Yes | Yes | Decline/survive/fall and save branches | Must include |
| Floors 1–3 recovery and presentation polish | `polish/floors1-3-recovery-and-presentation-pr` | Yes | Yes | Integrated tests and candidate gate | Must include |
| Shared physical combat choreography | `feat/combat-sprite-choreography` | Yes | Yes | Phaser and Canvas combat smoke; source visual matrix retained | Must include |
| Governed combat-bark library | `feat/combat-bark-presentation-integration` | Yes | Yes | 9,600-fight exposure run; 90.5% opportunity suppression | Must include |
| Formation Chemistry | `feat/formation-chemistry` | Yes | Yes, random Floor 1 only | 2,160-fight integration rerun plus source 33,040-trace audit | Include as playtest focus |
| Production wall families | `art/wall-tile-variants` | Yes | Yes | Validator plus production corridor renders | Must include |
| Floor 1 landmark and light-source art | `agent/floor1-art-polish`, `feat/environment-light-sources` | Yes | Yes | Candidate browser/hub renders | Must include |
| Grounded chest/bones/basic-prop/cistern/ember art | selected `feat/isobels-iso-spells` commits | Yes | Yes | Asset requests and hub/floor renders | Must include |
| Build identity and optional-asset request fix | candidate-only | Yes | Yes | Title and network inspection | Must include |
| Ninja class | `feat/ninja-class` | No | No | No | Defer: open PR is explicitly incomplete |
| Floor 1 casino | `feature/floor1-casino` | No | No | No | Defer: open PR is explicitly incomplete |
| Level 2 vertical slice | `feat/level2-vertical-slice` | No | No | Prototype only | Defer: unique assets protected; not campaign-ready |
| Environment overlay experiments | `agent/environment-overlays*` | No | No | Experimental galleries only | Defer |
| Barbarian sprite and generic sprite-template pipeline | respective local branches | No | No | Art/tooling only | Defer |
| Alternate/WIP Formation Chemistry | `wip/formation-chemistry-2026-08-14` | No | No | Superseded by canonical audited line | Exclude |

## Completed but not in this playtest build

| Work | Branch | Why absent | Effort/risk | Recommendation |
| --- | --- | --- | --- | --- |
| Ninja class | `feat/ninja-class` | Incomplete PR; one commit does not establish full creation/equipment/perk/save quality | Medium/high | Finish separately, then integrate after this playtest |
| Floor 1 casino | `feature/floor1-casino` | Incomplete content line and stale base | High | Keep out of F&F1 |
| Level 2 vertical prototype | `feat/level2-vertical-slice` | Prototype content and untracked source props remain in its protected worktree | High | Preserve for a later authored Floor 2 pass |
| Overlay experiments | `agent/environment-overlays`, `agent/environment-overlays-v2` | Presentation experiments, not a settled production selection | Medium | Review galleries, then cherry-pick only accepted assets/metadata |
| Floor-clutter experiments | `feat/floor-clutter` plus archived shield/sword ref | Stacked with unrelated old work and not proven equivalent to current renderer | Medium | Reconcile as an isolated art pass |
| Sprite-template pipeline | `feat/sprite-template-pipeline` | Useful developer tool, no immediate player value | Low | Review independently; no reason to block playtest |
| Alternate bark integration | `content/combat-bark-integration-2` | Superseded by the governed/editorially reviewed presentation branch | None | Archive after candidate lands |
| Alternate Formation Chemistry | `wip/formation-chemistry-2026-08-14` | Broader, less independently audited implementation | High | Archive; do not merge wholesale |

Nothing in this table was deleted merely because it was excluded.

## Playable progression and endpoint

Expected route:

```text
Title
→ prologue
→ default or custom four-person party
→ town
→ Floor 1 Hall of Five Wounds
→ Floor 2 Cursed Library
→ Floor 3 Forge of Ashes / Duelist's Vigil
→ Floor 4 Null Choir
→ Floor 5 Weeping Cistern
→ The Crying Man
→ wish ending
→ title
```

Floor 5 has no `stairs_down`; the authored boss and wish ending are the natural
playtest endpoint. This is a complete boundary rather than an accidental path
into unfinished Floor 6 content.

## Fresh-player verification

One route was intentionally driven through the real UI rather than through a
fixture:

1. cleared local storage;
2. loaded the production-base-path preview;
3. selected New Game;
4. advanced the prologue;
5. continued with the fixed Old Man + Rat King duo;
6. entered town;
7. entered Floor 1;
8. opened Save/Load and saved slot 1;
9. refreshed the browser;
10. confirmed Continue appeared and restored the game to town.

No debug query or console mutation was used for this route. Broad coverage used
the repository's deterministic debug fixtures, as intended; repeatedly walking
from the title would add time rather than confidence.

## Browser and production-path verification

Tested with Chromium against:

```text
http://127.0.0.1:5190/OnyxLabyrinth/
http://127.0.0.1:5190/OnyxLabyrinth/?debug=1
```

This exercises the GitHub Pages repository subpath rather than localhost `/`.
Verified:

- initial HTML and Vite chunks load under `/OnyxLabyrinth/`;
- title, prologue, fixed-duo town entry, dungeon, save and Continue;
- Phaser combat and `?phaser=0` Canvas rollback;
- Floor 1 guardian barrier and flee behavior;
- Camp, Namanda, Hot Boi, and Isobel controllers;
- Floor 2 climax flee/save/load/re-entry/victory;
- Floor 3 Kazeharu decline/survive/fall paths;
- Floors 4–5 stairs, hazards, keys, NPCs, teleporters, quiet/hot zones, and
  campaign endpoint;
- WebGL local ramps/stairs, save-neutral lifecycle and repeated renderer
  creation/disposal;
- authored dungeon, normal-combat, and boss music routing.

The old live `main` build made twelve optional-asset requests that returned
404. The candidate now imports the two missing descent sprites and does not
request nonexistent optional door/stair art for themes that do not ship it.
Candidate retest returned 200 for both descent sprites and no repeated optional
theme 404s.

Firefox was not installed in the available Playwright runtime. It remains a
pre-distribution compatibility smoke, not a discovered incompatibility.

## Combat, bark, and chemistry evidence

Candidate combat smoke passed two Phaser fights with teardown and victory,
then a Canvas rollback fight, with no page errors or retained Phaser filters.

The bark exposure lab ran 9,600 real-resolver fights:

- 518,633 bark opportunities;
- 49,358 displayed library barks;
- 90.5% of opportunities suppressed;
- isolated presentation RNG and deterministic selectors remained intact.

The checked-in editorial review remains the authority for voice quality. The
candidate adds explicit voice aliases for the 17 low-power `crypt-*` enemy
variants so the Chemistry roster uses the authored base voices rather than
falling silent or inferring voice from broad taxonomy.

The candidate Chemistry integration rerun used 2,160 fights plus 120 ten-fight
expeditions. It reproduced the authored pacing exactly:

| Route | Mean | Median | p90 | Max |
| --- | ---: | ---: | ---: | ---: |
| Normal | 27.69 | 27 | 40 | 52 |
| Quiet | 29.31 | 30 | 40 | 52 |
| Dead-rate non-safe | 39.01 | 39 | 42 | 52 |
| Hot | 23.80 | 22 | 37 | 52 |

The canonical N=100 report remains stronger balance evidence: aware play
completed 76–87% of ten-fight expeditions depending on route, versus 70–82%
for default play. Knowledge therefore matters, but expedition pressure is
still high. The rare `f1-guarded-bomb` remains the specific human-test risk:
balanced naive traces lost 55.6% HP in the canonical audit, while aware play
lost 19.4%.

## Release-gate findings

### P0 — cannot send

None found in the candidate tree.

### P1 — should fix before sending

1. **Publish and verify the exact candidate SHA.** The live Pages URL still
   serves `main@1157395`. Do not send it while claiming it contains this build.
2. **Run the final fresh-profile smoke on the deployed URL.** This catches
   workflow, caching, and path errors that a local production preview cannot.
3. **Perform one Firefox smoke if Firefox is in the intended tester set.**

### P2 — appropriate playtest questions

- Formation Chemistry's Guarded Bomb difficulty spike.
- Whether Slime Cannon, Hunting Pack, and Rune Overload resolve often enough
  to be memorable rather than being countered before their payoff.
- Whether 600–865 ms physical attacks remain brisk over a long session.
- Whether 1.2–1.38 s casting/healing feels too slow after repetition.
- Whether governed barks remain distinctive rather than repetitive after an
  hour of ordinary fights.
- The older Floors 4–5 browser harness reads the typewriter message before it
  fully reveals and reports truncated-string false positives. State changes,
  keys, stairs, hazards, endpoint, pacing, and zero browser errors all passed;
  the harness itself should be modernized separately.
- One music audit observed a single `net::ERR_ABORTED` when navigation replaced
  a randomized dungeon track. All authored tracks loaded and routing checks
  passed; treat this as a harness/navigation cancellation unless it reproduces
  during ordinary play.

### P3 — future polish

- Reduce documentation/art-review weight on the eventual long-lived release
  branch if repository size becomes a concern; it does not affect runtime.
- Update older retired-map playtest scripts so agents do not mistake stale
  coordinates for current Floor 1 regressions.

## Deployment audit

`.github/workflows/deploy.yml` deploys `dist/` to GitHub Pages on every push to
`main`. It runs `npm ci` and `npm run build`; it does not run the complete
`npm run check` gate. Therefore the local full gate must remain mandatory before
publishing.

The latest observed Pages deployment was successful for `main@1157395`. No
push, merge, workflow dispatch, or preview deployment was performed in this
task.

## Recommendation

Do not distribute the current public URL as the new playtest yet. Review the
candidate history, publish the accepted final SHA through the existing Pages
workflow, verify that exact SHA on the live URL, and then send it as Friends &
Family Playtest 1. No additional feature branch should be added before that
deployment unless it fixes a demonstrated P0/P1 issue.
