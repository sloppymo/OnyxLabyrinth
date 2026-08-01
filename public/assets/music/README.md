# Game BGM (public/assets/music)

| File | Role |
|------|------|
| `breath-of-the-undercroft.mp3` | Title screen + New Game prologue loop |
| `torchlight-beneath-stone.mp3` | Dungeon / maze exploration loop |
| `haven-at-dusk.mp3` | Town hub loop |

All three beds are MP3 so Safari / iOS can play them (Ogg Vorbis is not
supported there). Wired in `src/engine/audio.ts`:

- `startTitleMusic` / `stopTitleMusic`
- `startDungeon` / `stopDungeon`
- `startTownMusic` / `stopTownMusic`

Town theme plays while `state.mode === "town"` and stops when leaving for
dungeon, camp, title, etc. Boss fights use the procedural boss bed.

`prologue-intro-loop.wav` / `.mid` are older unused drafts (see
`scripts/generate_prologue_intro_music.py`); the game does not load them.
