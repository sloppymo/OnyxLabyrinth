# Game BGM (public/assets/music)

| File | Role |
|------|------|
| `breath-of-the-undercroft.mp3` | Title screen + New Game prologue loop |
| `haven-at-dusk.mp3` | Town hub loop |
| `torchlight-beneath-stone.mp3` | Random dungeon / maze loop |
| `understone-dungeon-loop.mp3` | Random dungeon / maze loop |
| `emberwake-strings-loop.mp3` | Random dungeon / maze loop (MIDI track 5) |
| `emberwake-organ-loop.mp3` | Random dungeon / maze loop (MIDI track 6) |
| `battle-theme-v3.mp3` | Normal encounter battle loop |

All active beds are MP3 so Safari / iOS can play them (Ogg Vorbis is not
supported there). Wired in `src/engine/audio.ts`:

- `startTitleMusic` / `stopTitleMusic`
- `startDungeon` / `stopDungeon`
- `startTownMusic` / `stopTownMusic`
- `startBattleMusic` / `stopBattleMusic`

Town theme plays while `state.mode === "town"` and stops when leaving for
dungeon, camp, title, etc. Each dungeon entry picks every dungeon theme with
equal probability: Torchlight, Understone, Emberwake Strings, or Emberwake
Organ. Normal encounters use the authored battle theme; boss fights keep the
exclusive procedural boss bed.

`prologue-intro-loop.wav` / `.mid` are older unused drafts (see
`scripts/generate_prologue_intro_music.py`); the game does not load them.
