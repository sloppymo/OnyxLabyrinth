# Deck hardware gate — one-page checklist (fill by hand, on device)

**Setup:** Steam Deck (OLED or LCD), native 1280×800, game at 1× letterbox (no forced fullscreen stretch). Hold at normal arm's length (~40–50 cm). Load https://sloppymo.github.io/OnyxLabyrinth/ or local `npx vite preview --port 5176 --base /OnyxLabyrinth/`.

**Surfaces:** New Game → Default Party → Arena/dungeon combat with 2+ enemy rows; dungeon bottom HP overlay.

| # | Question | Your answer |
|---|----------|-------------|
| 1 | Name + HP + `SP`/`RG` readable without squinting? (combat roster **and** dungeon strip) | ____ (Y/N) |
| 2 | 48px HP bars help triage who's hurt? | ____ (Y/N) |
| 3 | Inverted acting plate clear vs scene triangle marker? | ____ (Y/N) |
| 4 | Letterbox? | ____ (Fine/Annoying) |
| 5 | If Annoying only: Mush OK / Widen later? | ____ (Mush/Widen/n/a) |
| 6 | Identify a back-row enemy type at arm's length? | ____ (Y/N) |

**Pass:** all of 1–3 and 6 = Y (4–5 affect letterbox comfort only, handled separately).
**Fail:** any of 1–3 or 6 = N → stop before lighting, remediate per spike doc §Phase 1B.

Once filled in, hand these six answers back and the branch (1A pass / 1B fail) will be executed per `2026-07-15-letterbox-scale-spike.md`.
