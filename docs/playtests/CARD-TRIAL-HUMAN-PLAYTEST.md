# Card Trial human playtest package

This package is for observing comprehension and enjoyment, not for balancing
the deck. Do not change card rules or explain the intended strategy during a
session.

## Launch

From the playtest worktree:

```bash
npm run card-trial:playtest
```

Open the printed `http://127.0.0.1:5223/OnyxLabyrinth/?debug=1` URL. The
debug query enables local recording and the developer export surface; it does
not add instrumentation to the game view.

For an existing preview:

```bash
ONYX_URL=http://127.0.0.1:5222/OnyxLabyrinth/?debug=1 \
  node scripts/playtests/card-trial-capture.mjs --fight 1 --seed 1 \
  --out output/playtest-artifacts/sessions/session.json
```

At the end of a human session, export the anonymous gameplay record from the
DevTools console:

```js
copy(window.__onyxDebug.cardTrial.exportSession())
```

Save it as `output/playtest-artifacts/sessions/<session-id>.json`. It contains
gameplay events only: no account, machine, IP, browser-history, or local-file
data.

## Tester instructions

Give the tester the URL and only this prompt:

> Play Card Trial naturally. You may stop whenever you want. Say aloud what
> you think the cards and battlefield states mean, but nobody will coach you.

Do not explain Front/Back, Opened, Consume, Move, intent colors, or card
families before play. Let the first fight reveal the comprehension problem.

## Observer protocol

Do not coach. Record the first occurrence of:

- hesitation or target-selection confusion;
- first Move and first Hold-I use;
- first Opened/Consume interaction;
- anything the tester expected to click;
- spontaneous positive reactions;
- any point where the tester felt stuck.

Pair notes with the opaque session ID only. Use the template in
[`CARD-TRIAL-SESSION-NOTES.md`](CARD-TRIAL-SESSION-NOTES.md).

## Analysis and replay

```bash
node scripts/playtests/card-trial-session-summary.mjs session.json \
  --json summary.json --out summary.md

node scripts/playtests/card-trial-replay.mjs session.json \
  --url http://127.0.0.1:5222/OnyxLabyrinth/?debug=1

node scripts/playtests/card-trial-replay.mjs session.json \
  --renderer canvas --url http://127.0.0.1:5222/OnyxLabyrinth/?debug=1

node scripts/playtests/card-trial-aggregate.mjs \
  output/playtest-artifacts/sessions/*.json

node scripts/playtests/card-trial-bundle.mjs session.json \
  --replay output/playtest-artifacts/replays/<renderer>/replay-report.json
```

Replay setup uses the recorded fight ID/seed. Decisions use production card,
target, Move, and Pass controls. A mismatch reports the first action, expected
and actual digest, first differing fields, and a screenshot under
`output/playtest-artifacts/replays/`.

The bundle command creates an anonymous local repro package containing the
session, generated summaries, replay report, divergence screenshot when one
exists, and non-identifying environment/build metadata. Nothing is uploaded.

## Questionnaire

Ask after the tester stops, without correcting their answers:

1. What did you think Front and Back did?
2. What did Opened mean?
3. What did Consume mean?
4. How did you decide when to Move?
5. Was anything you expected to be clickable not clickable?
6. Did you ever click something without knowing what would happen?
7. Which card felt best to play?
8. Which card was hardest to understand?
9. Was there a point where you felt stuck?
10. Would you voluntarily play another fight?

Keep questionnaire answers separate from telemetry. Behavior and remembered
explanations are different evidence.

## Test taxonomy

- **Unit:** rules, state projection, and pure formatting.
- **Reference oracle:** deterministic policy and winnability regression.
- **Browser fixture:** DOM, renderer, and interaction behavior.
- **Replay:** deterministic reproduction of a recorded semantic stream.
- **Fuzz:** transition robustness and invariant checking.
- **Human playtest:** comprehension, strategy discovery, and enjoyment.

Synthetic agents and fuzzers are not balance or fun evidence.
