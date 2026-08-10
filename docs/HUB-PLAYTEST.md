# Hub playtest

The repeatable browser smoke test for the game's hubs is
`scripts/playtests/hub-walkthrough.mjs`. It covers the four independently
valuable refuge experiences currently available in the campaign:

- the outdoor Camp rest screen (`C` from the dungeon);
- the Church of Saint Namanda;
- Hot Boi's Tavern;
- Isobel's Iso-Spells shop.

The runner uses `?debug=1`, the real `__onyxDebug.jumpTo` transition path, and
real keyboard input for each interaction. Each hub starts from a fresh page
state. The session-only encounter rate is set to zero so a visual or UI
regression cannot be hidden by a random fight; production state and floor data
are not modified.

## Run it

In one terminal, start the same production-style server used by the other
walkthroughs:

```sh
npx vite preview --port 5176 --base /OnyxLabyrinth/
```

In another terminal:

```sh
npm run playtest:hubs
```

Run one hub while iterating:

```sh
npm run playtest:hubs -- --hub isobel
npm run playtest:hubs -- --hub camp
npm run playtest:hubs -- --hub namanda
npm run playtest:hubs -- --hub tavern
```

Override the server or artifact directory when needed:

```sh
HUB_QA_URL=http://127.0.0.1:5184/OnyxLabyrinth/?debug=1 \
HUB_QA_OUT=playtest-screenshots/hub-qa-local \
npm run playtest:hubs
```

## Evidence and pass criteria

The runner writes named screenshots and a machine-readable `report.json` to
`playtest-screenshots/hub-qa/` (which is local-only). The report records the
tested hubs, commit, each checkpoint's route/position/screenshot, assertion
failures, and browser console/page/network errors.

The run fails if any of these regress:

- Camp opens, completes its rest phase, shows its menu, and returns to the
  dungeon;
- Namanda opens the Church controller and exposes its service actions;
- Hot Boi opens the Tavern controller and exposes its bar actions;
- Isobel's door leads to the shop interior, her NPC panel exposes Browse
  Iso-Spells but not Attack/Steal/Barter/Give, and the list shows all six
  Iso-spells with gold and prices;
- every hub can be exited cleanly back to the dungeon;
- the browser reports no page errors, console errors, or failed requests.

For visual review, inspect the generated PNGs at native 1280×800 capture size.
The existing focused walkthroughs remain useful for longer room tours; this
runner is the short integration gate intended for every floor/UI change.
