# Game BGM (public/assets/music)

| File | Role |
|------|------|
| `breath-of-the-undercroft.mp3` | Title screen + New Game prologue loop |
| `torchlight-beneath-stone.ogg` | Dungeon / maze exploration loop |
| `haven-at-dusk.ogg` | Town hub loop |

Wired in `src/engine/audio.ts`:

- `startTitleMusic` / `stopTitleMusic`
- `startDungeon` / `stopDungeon`
- `startTownMusic` / `stopTownMusic`

Town theme plays while `state.mode === "town"` and stops when leaving for
dungeon, camp, title, etc. Boss fights use the procedural boss bed.

`prologue-intro-loop.wav` / `.mid` are older unused drafts (see
`scripts/generate_prologue_intro_music.py`); the game does not load them.
