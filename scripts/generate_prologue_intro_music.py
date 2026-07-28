#!/usr/bin/env python3
"""
Generate a 10.0s SNES-era funeral-organ prologue loop.

Authors a short Church Organ MIDI (GM program 19) + soft Choir Aahs pad
(GM 52), then renders to WAV via FluidSynth + a local SoundFont.

Outputs (by default):
  public/assets/music/prologue-intro-loop.mid
  public/assets/music/prologue-intro-loop.wav

No third-party Python deps — MIDI is written with struct only.
Requires: fluidsynth on PATH and a GM SoundFont (GeneralUser or FluidR3).

Usage:
  python3 scripts/generate_prologue_intro_music.py
  python3 scripts/generate_prologue_intro_music.py --sf2 /path/to.sf2
"""

from __future__ import annotations

import argparse
import struct
import subprocess
import sys
import wave
from pathlib import Path

# 4 bars @ 96 BPM in 4/4 = exactly 10.0 seconds.
BPM = 96
BARS = 4
BEATS_PER_BAR = 4
DURATION_SEC = BARS * BEATS_PER_BAR * (60.0 / BPM)  # 10.0
TICKS_PER_BEAT = 480
TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR

# Preferred SoundFonts on this Linux box (first existing wins).
DEFAULT_SF2_CANDIDATES = [
    Path("/usr/share/minuet/soundfonts/GeneralUser-v1.47.sf2"),
    Path("/usr/share/sounds/sf2/FluidR3_GM.sf2"),
    Path("/usr/share/sounds/sf2/FluidR3_GS.sf2"),
    Path("/usr/share/sounds/sf2/default-GM.sf2"),
]

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = REPO_ROOT / "public" / "assets" / "music"
DEFAULT_STEM = "prologue-intro-loop"


class SimpleMIDI:
    """Minimal Type-1 MIDI writer (multi-track)."""

    def __init__(self, ticks_per_beat: int = TICKS_PER_BEAT) -> None:
        self.ticks_per_beat = ticks_per_beat
        self.tracks: list[list[int]] = []

    def add_track(self) -> list[int]:
        track: list[int] = []
        self.tracks.append(track)
        return track

    @staticmethod
    def _write_varint(track: list[int], value: int) -> None:
        buffer = value & 0x7F
        value >>= 7
        while value > 0:
            buffer = (buffer << 8) | ((value & 0x7F) | 0x80)
            value >>= 7
        while True:
            track.append(buffer & 0xFF)
            if buffer & 0x80:
                buffer >>= 8
            else:
                break

    def tempo(self, track: list[int], bpm: int, delta: int = 0) -> None:
        us_per_beat = int(round(60_000_000 / bpm))
        self._write_varint(track, delta)
        track.extend([0xFF, 0x51, 0x03])
        track.append((us_per_beat >> 16) & 0xFF)
        track.append((us_per_beat >> 8) & 0xFF)
        track.append(us_per_beat & 0xFF)

    def program_change(self, track: list[int], channel: int, program: int, delta: int = 0) -> None:
        self._write_varint(track, delta)
        track.append(0xC0 | (channel & 0x0F))
        track.append(program & 0x7F)

    def note_on(self, track: list[int], channel: int, note: int, velocity: int, delta: int = 0) -> None:
        self._write_varint(track, delta)
        track.append(0x90 | (channel & 0x0F))
        track.append(note & 0x7F)
        track.append(velocity & 0x7F)

    def note_off(self, track: list[int], channel: int, note: int, velocity: int = 0, delta: int = 0) -> None:
        self._write_varint(track, delta)
        track.append(0x80 | (channel & 0x0F))
        track.append(note & 0x7F)
        track.append(velocity & 0x7F)

    def end_of_track(self, track: list[int], delta: int = 0) -> None:
        self._write_varint(track, delta)
        track.extend([0xFF, 0x2F, 0x00])

    def save(self, path: Path) -> None:
        track_blobs: list[bytes] = []
        for track in self.tracks:
            data = bytes(track)
            track_blobs.append(b"MTrk" + struct.pack(">I", len(data)) + data)
        header = b"MThd" + struct.pack(
            ">IHHH",
            6,
            1,  # format 1
            len(self.tracks),
            self.ticks_per_beat,
        )
        path.write_bytes(header + b"".join(track_blobs))


def _note_events_to_track(
    midi: SimpleMIDI,
    track: list[int],
    channel: int,
    program: int,
    # list of (abs_tick_on, abs_tick_off, pitch, velocity)
    notes: list[tuple[int, int, int, int]],
) -> None:
    """Emit program change + sorted note on/off events with correct deltas."""
    midi.program_change(track, channel, program, 0)
    events: list[tuple[int, int, int, int, int]] = []
    # kind: 0=off, 1=on so offs sort before ons at the same tick
    for on, off, pitch, vel in notes:
        events.append((on, 1, pitch, vel, channel))
        events.append((off, 0, pitch, 0, channel))
    events.sort(key=lambda e: (e[0], e[1], e[2]))
    cursor = 0
    for tick, kind, pitch, vel, ch in events:
        delta = tick - cursor
        cursor = tick
        if kind == 1:
            midi.note_on(track, ch, pitch, vel, delta)
        else:
            midi.note_off(track, ch, pitch, 0, delta)
    # Hold end-of-track at the exact loop boundary.
    end_tick = BARS * TICKS_PER_BAR
    midi.end_of_track(track, max(0, end_tick - cursor))


def build_arrangement() -> SimpleMIDI:
    """
    Sparse D-minor funeral organ — FF6 opening register.

    Harmony (one chord per bar, held):
      1 Dm   2 Bb   3 Gm   4 A(sus4→) resolving open so the loop re-enters Dm.
    Upper line: slow descending fragments; pad doubles roots quietly.
    """
    midi = SimpleMIDI()

    # Conductor track: tempo only
    meta = midi.add_track()
    midi.tempo(meta, BPM, 0)
    midi.end_of_track(meta, BARS * TICKS_PER_BAR)

    # Absolute-tick chord tones (root, third/fifth voicings in the organ register).
    # MIDI pitches: C4=60. D3=50, F3=53, A3=57, Bb2=46, D3=50, F3=53,
    # G2=43, Bb2=46, D3=50, A2=45, D3=50, E3=52 (A sus4), then lift 3rd late.
    chord_tones = [
        # bar 0 — Dm
        [50, 53, 57, 62],  # D3 F3 A3 D4
        # bar 1 — Bb
        [46, 50, 53, 58],  # Bb2 D3 F3 Bb3
        # bar 2 — Gm
        [43, 46, 50, 55],  # G2 Bb2 D3 G3
        # bar 3 — Asus4 (A D E) — open, loops cleanly into Dm
        [45, 50, 52, 57],  # A2 D3 E3 A3
    ]

    organ_notes: list[tuple[int, int, int, int]] = []
    pad_notes: list[tuple[int, int, int, int]] = []

    for bar, tones in enumerate(chord_tones):
        on = bar * TICKS_PER_BAR
        # Release a hair early so FluidSynth tails don't smear across the seam.
        off = on + TICKS_PER_BAR - 24
        for i, pitch in enumerate(tones):
            vel = 72 if i < 3 else 58  # top voice slightly softer
            organ_notes.append((on, off, pitch, vel))
        # Soft choir pad: root + fifth only
        pad_notes.append((on, off, tones[0], 36))
        pad_notes.append((on, off, tones[2], 30))

    # Slow upper melody — sparse descending gestures (absolute on/off ticks).
    melody = [
        (0, 960, 69, 80),                         # A4
        (960, 1920, 67, 74),                      # G4
        (1920, 2640, 70, 78),                     # Bb4
        (2640, 3120, 69, 72),                     # A4
        (3120, 3600, 67, 70),                     # G4
        (3600, 4 * TICKS_PER_BAR - 24, 65, 68),   # F4 into Asus → loops to Dm
    ]

    for on, off, pitch, vel in melody:
        organ_notes.append((on, off, pitch, vel))

    organ_track = midi.add_track()
    _note_events_to_track(midi, organ_track, channel=0, program=19, notes=organ_notes)

    pad_track = midi.add_track()
    _note_events_to_track(midi, pad_track, channel=1, program=52, notes=pad_notes)

    return midi


def find_sf2(explicit: Path | None) -> Path:
    if explicit is not None:
        if not explicit.is_file():
            raise SystemExit(f"SoundFont not found: {explicit}")
        return explicit
    for candidate in DEFAULT_SF2_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise SystemExit(
        "No GM SoundFont found. Pass --sf2 /path/to.sf2 "
        "(tried GeneralUser / FluidR3 under /usr/share)."
    )


def render_wav(sf2: Path, mid: Path, wav: Path, gain: float = 0.6) -> None:
    wav.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "fluidsynth",
        "-ni",
        "-g",
        str(gain),
        "-F",
        str(wav),
        "-r",
        "44100",
        str(sf2),
        str(mid),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except FileNotFoundError:
        raise SystemExit("fluidsynth not found on PATH") from None
    except subprocess.CalledProcessError as exc:
        sys.stderr.write(exc.stderr or exc.stdout or str(exc))
        raise SystemExit(f"fluidsynth failed ({exc.returncode})") from exc


def wav_duration_sec(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes() / float(wf.getframerate())


def trim_wav_to_seconds(path: Path, seconds: float) -> None:
    """Hard-trim to exact loop length (FluidSynth often adds a short tail)."""
    with wave.open(str(path), "rb") as wf:
        rate = wf.getframerate()
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        frames = wf.readframes(wf.getnframes())
    target = int(round(seconds * rate))
    frame_bytes = channels * sampwidth
    max_frames = len(frames) // frame_bytes
    keep = min(target, max_frames)
    trimmed = frames[: keep * frame_bytes]
    # If FluidSynth ran short, zero-pad to exact length.
    if keep < target:
        trimmed += b"\x00" * ((target - keep) * frame_bytes)
        keep = target
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sampwidth)
        wf.setframerate(rate)
        wf.writeframes(trimmed)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--stem", default=DEFAULT_STEM)
    parser.add_argument("--sf2", type=Path, default=None)
    parser.add_argument("--gain", type=float, default=0.55, help="FluidSynth master gain")
    args = parser.parse_args()

    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    mid_path = out_dir / f"{args.stem}.mid"
    wav_path = out_dir / f"{args.stem}.wav"

    assert abs(DURATION_SEC - 10.0) < 1e-9, DURATION_SEC

    midi = build_arrangement()
    midi.save(mid_path)

    sf2 = find_sf2(args.sf2)
    print(f"MIDI  → {mid_path}")
    print(f"SF2   → {sf2}")
    render_wav(sf2, mid_path, wav_path, gain=args.gain)
    trim_wav_to_seconds(wav_path, DURATION_SEC)
    dur = wav_duration_sec(wav_path)
    print(f"WAV   → {wav_path} ({dur:.3f}s)")
    if abs(dur - 10.0) > 0.02:
        raise SystemExit(f"Expected ~10.000s loop, got {dur:.3f}s")
    print("OK — 10.0s funeral-organ prologue loop ready.")


if __name__ == "__main__":
    main()
