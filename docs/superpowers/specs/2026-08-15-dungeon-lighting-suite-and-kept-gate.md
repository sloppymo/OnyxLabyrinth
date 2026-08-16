# Dungeon lighting suite + Kept Gate extrusion

**Date:** 2026-08-15  
**Status:** implementing

## Goal

Lock the shared dungeon lighting model with a pass/fail suite, then give the Floor 1 Kept Gate enough box depth that WebGL lighting has silhouette to catch.

## Constraints

- No gameplay, collision, fog-geometry, or lighting-engine rewrite.
- Canvas still ignores `architecturalProps`; Gate extrusion is WebGL-first.
- `npm test` / `npm run check` do not run Playwright. Lighting Playwright is `npm run test:lighting` (needs production preview), same class as `visual:floors`.

## Suite

- Pure checks in `src/engine/lighting-probes.ts` (unit-tested).
- Playwright `scripts/playtests/lighting-suite.ts`: Canvas + WebGL, maze-canvas screenshots, HTML gallery.
- Fail on: console/page/request errors, black frames, mean luma outside band, collapsed chroma/colour count, darkness pose not darker than a sibling lit pose.

## Kept Gate

Thicken existing jamb/lintel boxes and recess `gate-unified` so the leaf sits behind the south faces of the jambs. No new collision. Add approach/close poses to the suite.
