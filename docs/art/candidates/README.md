# Sprite workbench candidates

This directory is a review-only staging area for generated or hand-drawn source plates. It is
intentionally outside `public/assets/` and is not loaded by the game. Add each candidate to
`manifest.json` with its source-sheet geometry, then regenerate the gallery:

```sh
npm run sprite-preview:generate
npm run sprite-preview:serve
```

Open <http://localhost:8080/sprite-preview.html>. Candidate cards are marked **SOURCE ONLY**
and include pause, frame-step, and speed controls. A candidate is not ready to register in
`EFFECT_STRIPS` or another runtime manifest until it has passed the cleanup, framing, anchor,
native-scale, and in-engine checks in `docs/SPRITE-ART-GENERATION-GUIDE.md` and the current
combat VFX manifest.
