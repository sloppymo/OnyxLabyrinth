# Prologue Intro Music Loop — Design

**Date:** 2026-07-27  
**Status:** Asset-only (no game wiring yet)  
**Mood:** Cold myth / funeral organ (FF6 opening register)

## Goal

Ship a seamless **10.0s** BGM loop for the New Game prologue narration:
`public/assets/music/prologue-intro-loop.wav` (+ source `.mid`).

Authenticity comes from **arrangement** (sparse Church Organ, solemn minor), not bit-crush. Style guide’s “silence for v1” stands until a later wiring PR; this only produces the asset.

## Pipeline

1. Author MIDI with `pretty_midi` (Church Organ GM 19; optional soft Choir Aahs pad).
2. Render offline with **FluidSynth** + **GeneralUser GS** (fallback: FluidR3_GM).
3. Script: `scripts/generate_prologue_intro_music.py` — regenerates mid + wav.

## Musical constraints

- Exact duration **10.000s** (4 bars @ 96 BPM in 4/4).
- Key: D minor. Sparse held chords + slow upper line; no drums/percussion.
- Loop seam: last bar resolves so beat 1 of the repeat matches bar 1 harmony (Dm pedal).
- Quiet enough to sit under typewriter ticks when wired later (normalize peak ~−6 dBFS in render gain).

## Out of scope

- Prologue playback / fade / style-guide audio section update.
- Furnace/SPC700 export (hand-tracker path; not scriptable for this pass).
