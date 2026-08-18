# AI Player Harness

An embodied playtesting layer for OnyxLabyrinth. A blind model (Mythos Player) plays through the real browser with ordinary keyboard input and receives only what a human player could perceive. A second, fresh context (Mythos Director) later reads the forensic bundle plus the repository.

This is **not** a replacement for the existing Playwright QA stack. It sits on top of it.

## 1. Purpose

Judge the game as a player would: readability, confusion, pacing, combat feel, spatial memory, whether you would keep playing. Then, separately, explain *why*.

## 2. Player vs forensic separation

| Player (blind) | Forensic (Director only) |
|---|---|
| Cropped game screenshot / contact sheet | `__onyxDebug.snapshot()` including coordinates |
| Visible HUD, menus, messages, party HP numerals | Exact enemy HP, keys, explored cells, RNG |
| Audio cue names/timings that actually fired | Full event log, readiness, warnings |
| Learned controls shown on screen | `availableActions` verb list |
| Timing: action → idle | State hashes, jumpTo setup, floor ids |

The player observation is **constructed positively** from presentation fields (`buildPlayerObservation`). It is never a stripped debug snapshot.

## 3. Architecture

```
OnyxLabyrinth (real game, ?debug=1 for hooks only)
        │  KeyboardEvent
        ▼
Playwright  (scripts/playtests/lib.mjs launch / waitForIdle)
        ├─ forensic: snapshot, log, sounds, stateHash, replay.json
        └─ playerView() → gatherPlayerPresentation → PlayerObservation
                │
                ▼
        Mythos Player (MCP stdio: JSON + image/png on the same turn)
```

Reuse, do not duplicate:

- `waitForIdle` / `computeIdle` for settlement
- `page.keyboard.press` for input
- seeded `createSeededRng`
- `scripts/replays/replay.mjs` + `stateHash`
- `captureFailureBundle`
- Phaser combat + WebGL maze as the default player experience

## 4. PlayerObservation contract

Schema version: `1`. Builder: `src/debug/player-observation.ts`.

Typical fields: `screen`, `heading` (`F1 · N` as painted), `danger`, `message`, `party[].hpText`, `menu`, `enemies[].visibleHealth` (descriptor only, and only when the UI shows it), `hints`, `learnedControls`, `audioDelta`, `timing.actionToIdleMs`, `visual`.

## 5. Allowed and prohibited

**Allowed:** anything currently on screen, audible, or previously shown this run (learned controls, player notes).

**Prohibited in player payloads:** coordinates, floor ids, tile ids, explored topology, exact enemy HP, RNG, encounter tables, quest flags, unlocked-door internals, `availableActions`, debug warnings, item ids, perk ids, jumpTo setup, design intent, source.

`findProhibitedPlayerFields` plus `src/debug/player-observation-blindness.test.ts` are the tripwire.

## 6. Tool / API reference

Stdio JSON lines (`npm run playtest:ai -- stdio`) still exist for operators. **Fable/Mythos should use the MCP adapter** so a screenshot is attached as vision content on the same `playtest_key` call — not as a filesystem path:

```
npm run playtest:ai:mcp
```

Cursor and Devin Desktop spawn that process themselves. Do **not** leave a copy running in a terminal (stdio is exclusive). Use `scripts/ai-player/launch-mcp.sh` so GUI-spawned processes get absolute `node`/`tsx` paths.

### Cursor (Player window)

Put this in that window’s `.cursor/mcp.json` (or user MCP settings). **Empty workspace — do not open this repository.** Refresh Tools & MCP until `onyx-player` is green.

```json
{
  "mcpServers": {
    "onyx-player": {
      "command": "/ABS/PATH/OnyxLabyrinth/scripts/ai-player/launch-mcp.sh",
      "env": {
        "ONYX_URL": "http://127.0.0.1:5173/OnyxLabyrinth/?debug=1",
        "ONYX_PLAYTEST_CHANNEL": "chrome"
      }
    }
  }
}
```

Machine-local `.cursor/mcp.json` is gitignored. Do not paste this JSON into the player chat.

### Devin Desktop / Devin CLI (this machine)

Devin wants **command + args**, not Cursor’s single `command` string. In `~/.config/devin/mcp_config.json` or `.devin/mcp_config.local.json` (gitignored):

```json
{
  "mcpServers": {
    "onyx-player": {
      "command": "/usr/bin/bash",
      "args": ["/ABS/PATH/OnyxLabyrinth/scripts/ai-player/launch-mcp.sh"],
      "env": {
        "ONYX_URL": "http://127.0.0.1:5173/OnyxLabyrinth/?debug=1",
        "ONYX_PLAYTEST_CHANNEL": "chrome"
      },
      "disabled": false
    }
  }
}
```

Web form equivalent: transport **STDIO**, command `/usr/bin/bash`, one argument = the `launch-mcp.sh` path, same env. Reload MCP connections. If the entry exists but `"disabled": true`, Devin will not connect.

**app.devin.ai (cloud Devin) cannot run this.** “Test listing tools” uses an isolated cloud box that does not have this repo or your `127.0.0.1:5173`. The harness must stay on the machine that runs Chrome and the game.

Paste [`prompts/mythos-player-kickoff.md`](prompts/mythos-player-kickoff.md) into the player chat — not the MCP JSON.

`playtest_key` returns:

1. compact JSON text (relative screenshot basename only, never `/home/...`)
2. an MCP `image/png` content block when `visualKind` is not `none`

| op / tool | arguments | returns |
|---|---|---|
| `playtest_start` / `start` | `mode`, `seed`, `fresh`, `checkpoint?` | initial player observation (+ image) |
| `playtest_key` / `key` | `key` | delta + timing + image when the view changed |
| `playtest_observe` / `observe` | `detail` | perception, no mutation |
| `playtest_checkpoint` / `checkpoint` | `id` | observation after omniscient setup |
| `playtest_note` / `note` | `kind`, `text` | stored on the transcript |
| `playtest_probe` / `probe` | `kind` | prompt text to answer, then `note` |
| `playtest_finish` / `finish` | — | `runId` only to the player; forensic files stay on disk |

## 7. Blind run procedure

1. Start a **fresh** Mythos Player context. Paste [`prompts/mythos-player-kickoff.md`](prompts/mythos-player-kickoff.md) (behavior also lives in [`prompts/mythos-player.md`](prompts/mythos-player.md)). Do not open the repo.
2. Serve the game with `?debug=1`. Either `npm run dev` or a **current** `vite preview` of this tree works — `__onyxDebug` is runtime-gated, not compile-stripped. Default URL: `http://127.0.0.1:5173/OnyxLabyrinth/?debug=1` (`ONYX_URL` overrides). If Playwright Chromium is missing, set `ONYX_PLAYTEST_CHANNEL=chrome`. `npm run dev` can fail with `EMFILE` (too many watchers) on this machine; preview is the reliable serve.
3. `npm run playtest:ai -- stdio`
4. `{"op":"start","mode":"blind","seed":42,"fresh":true}`
5. Loop: read delta (+ image if `visualKind` is not `none`) → choose one key → `{"op":"key","key":"..."}`.
6. When a `probe` appears, answer via `{"op":"note","kind":"experience","text":"..."}`.
7. `{"op":"finish"}` → hand the run directory to the Director.

Default duration is operator-chosen. 45–60 real minutes is a useful first-session target; the harness does not accelerate the game.

## 8. Checkpoint run procedure

Setup may cheat. The returned observation must not.

```
{"op":"start","mode":"checkpoint","seed":42,"checkpoint":"f2-abyss-bridge"}
```

or `{"op":"checkpoint","id":"f2-abyss-bridge"}` mid-session.

Player intro is always “Continue playing naturally.” plus a compact memory packet (party names/classes, already-tutorialized mechanics, known objective). No “this region tests vertical navigation.”

Current ids: `title`, `f1-entrance`, `f1-kept-gate`, `hot-boi-tavern`, `first-combat`, `f2-abyss-bridge`, `f3-forge`, `attrition`.

## 9. Director / forensic procedure

Start a **new** model context. Give it `docs/playtesting/prompts/mythos-director.md`, the player transcript, `forensic.json`, screenshots, and the repository. Never send Director output back into the Player context.

## 10. Deterministic replay

Each run writes `replay.json` in the existing transcript v1 shape (`startingSave`, `seed`, `actions[].key`, `stateHashAfter`).

```
npm run playtest:ai:replay -- .tmp-ai-player/<run-id>/replay.json
```

Hashes include omniscient state. That is forensic, not player knowledge.

Requires `?debug=1` on a current build (`npm run dev` or `vite preview`). Pass the same `ONYX_URL` used to record.

## 11. Media handling

- Crop: Playwright locator `#game-wrap` (the scaled game stage, not browser chrome).
- Unchanged frames (`meanAbsDiff` < 0.4%): `visualKind: "none"`, no image resent.
- Ordinary motion: nearest-neighbour 50% compact PNG.
- Menu / screen change: full PNG.
- Combat confirm that plays choreography: one half-scale nearest-neighbour contact sheet (up to 5 samples) plus a timestamps sidecar. The settled still is not duplicated. Pixel art is never bilinear-scaled.

## 11b. Token and timing (measured 2026-08-17)

Headless Chrome, viewport 1280×800, crop `#game-wrap` (~768×652), production preview with `?debug=1`.

| | typical |
|---|---|
| Ordinary dungeon step, action→idle | 160–300 ms (real camera tween) |
| Harness overhead after idle (screenshot + diff + observation) | ~500–810 ms |
| Screenshot capture | ~380–570 ms |
| Frame diff | ~43–48 ms |
| Contact-sheet compose | ~180 ms |
| Compact observation JSON | ~430–530 bytes (~110–130 tokens) |
| Full observation JSON | ~630–970 bytes (~160–250 tokens) |
| Unchanged wall-bump | `visualKind: "none"`, no image, ~400-byte delta |
| Compact corridor PNG (NN 50%) | ~145–160 KB on disk (path returned, not inlined) |
| Combat contact sheet | ~490–800 KB, one image |

A 10-minute run at ~3 s/decision is on the order of 200 actions. Image-heavy segments dominate storage; a short dungeon traversal of 6 actions was ~0.6 MB, a combat episode with three sheets ~2.9 MB. Do not inline PNGs into the model's text channel — pass filesystem paths / vision attachments only when `visualKind` is not `none`.

## 12. How to add checkpoints

Edit `scripts/ai-player/checkpoints.ts`. Keep `setup` (jumpTo / forceCombat / damage) separate from `playerMemory`. Add a test that the player-facing packet still has no coordinates. Use `jumpTo` / `dumpSave` rather than mutating grid cells.

## 13. How to add a new screen

1. Map the route in `playerScreenForRoute`.
2. Feed visible chrome through `gatherPlayerPresentation` (HUD getters, `playerMenuFromElement`, or a controller `playerView()`).
3. Extend the blindness test with a representative observation.
4. Do not spread `Snapshot` into the player payload.

## 14. How to run Mythos

See the two prompts in `docs/playtesting/prompts/`.

**First experiment (do this before more harness work):**

Fresh Fable/Mythos Player context. Empty workspace (or one with no OnyxLabyrinth source). Only the `onyx-player` MCP server above. Paste [`prompts/mythos-player-kickoff.md`](prompts/mythos-player-kickoff.md) — do not attach the repo.

- `playtest_start({ mode: "blind", fresh: true, seed: 42 })`
- Play naturally from the title screen. No checkpoints.
- Stop at ~60 minutes of real game time, a voluntary quit, or a meaningful Floor 1 milestone.
- `playtest_finish`
- Freeze the run directory. Open a **new** Director context with [`prompts/mythos-director.md`](prompts/mythos-director.md), `.tmp-ai-player/<run-id>/`, and this repository. Never continue in the Player context.

Operator serve:

```
npx vite preview --host 127.0.0.1 --port 5173 --base /OnyxLabyrinth/
# Player uses MCP (vision attached). Stdio is the fallback if MCP is unavailable.
```

Leak audit of serialized player output:

```
npm run playtest:ai -- demo coverage
npm run playtest:ai -- scan .tmp-ai-player/<run-id>/player-log.jsonl
```

Demos (no LLM):

```
npm run playtest:ai -- demo title-to-dungeon
npm run playtest:ai -- demo dungeon-move
npm run playtest:ai -- demo combat
npm run playtest:ai -- demo checkpoint --checkpoint f2-abyss-bridge
```

## 15. Common pitfalls

- **`?debug=1` is required.** Hooks are runtime-gated. A stale `vite preview` of an old `dist/` will not have `playerView()`.
- **Cursor JSON ≠ Devin config.** Devin needs `command` + `args` and `"disabled": false`. Cloud Devin cannot spawn this stdio server.
- **Do not start MCP in a terminal** while Cursor/Devin also spawn it — stdin is exclusive.
- **`availableActions` teaches controls the game has not taught.** Blind mode uses `learnedControls` from on-screen hints only.
- **`isIdle()` is false for the whole prologue auto-play.** The harness still returns after the prologue route appears so Escape/Enter remain available (a human can skip). Combat playback is *not* excepted.
- **Do not skip combat playback** (`b`) during subjective play. Contact sheets exist so Mythos can judge animation.
- **Checkpoint setup coordinates must never appear in `playerView()`.** If a leak test fails, stop and fix the builder — do not strip fields after the fact.
- **Parallel git sessions:** this harness writes `.tmp-ai-player/` (gitignored). Do not stage unrelated art/assets.

## Commands

| command | purpose |
|---|---|
| `npm run playtest:ai -- stdio` | JSON-lines session (paths only; no vision attach) |
| `npm run playtest:ai:mcp` | Fable/Mythos MCP — JSON + PNG on the same call (`launch-mcp.sh` for GUI clients) |
| `npm run playtest:ai -- demo <name>` | scripted e2e demonstration |
| `npm run playtest:ai -- demo coverage` | long leak-audit run (menus, combat, checkpoints, wipe) |
| `npm run playtest:ai -- scan <player-log.jsonl>` | serialized-output leak scan |
| `npm run playtest:ai -- checkpoints` | list checkpoint ids |
| `npm run playtest:ai:replay -- <replay.json>` | deterministic replay |
