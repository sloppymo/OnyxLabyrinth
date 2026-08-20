# Floor 1 Index hangings — Batch A (2026-08-15)

Path: REST `scripts/pixellab-generate.mjs` pixflux (MCP `color_image_base64` truncated the palette PNG). Palette lock via `--palette`. Aseprite 1.3.18.1 CLI round-trip (`compare -metric AE` = 0).

## index-ledger-cluster

- Size: 48×96, transparent
- Palette: `public/assets/ceiling-sprites/f1-chain-hook.png`
- Candidates: 1 — accepted (`index-ledger-cluster-01.png`)
- Cleanup: `index-ledger-cluster-02.png` — hanging chain core thickened to **2 brown pixels** (plus 1px dark flanks) on y 0–31 only; books untouched
- Ship: `public/assets/ceiling-sprites/index-ledger-cluster.png`, `baseSize: 34`

## index-cage-small

- Size: 40×80 then 56×96
- Palette: `public/assets/ceiling-sprites/f1-cage.png`
- Candidates: 2
  - `index-cage-small-01.png` — reject (white wireframe lantern)
  - `index-cage-small-02.png` — accept as source
- Cleanup: `index-cage-small-03.png` — knockout opaque black interior to alpha; metal quantized to 3 stops; darkest outline on lower rim + vertical bar edges only
- Ship: `public/assets/ceiling-sprites/index-cage-small.png`, `baseSize: 36`

## Placements (sparse)

Index stack is the “records hanging from chains” room. One of each, plus the existing lantern.

| x | y | id |
|---|---|---|
| 7 | 14 | f1-lantern-hanging (existing) |
| 5 | 15 | index-ledger-cluster |
| 7 | 16 | index-cage-small |
