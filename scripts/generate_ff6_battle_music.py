#!/usr/bin/env python3
"""
Generate FF6-style battle music MIDI file.
Requires: pip install midiutil
"""

from midiutil import MIDIFile
import random

def create_ff6_battle_midi(output_file="ff6_battle_theme.mid"):
    # Create MIDIFile with 1 track
    midi = MIDIFile(1)
    track = 0
    time = 0
    
    # Add track name and tempo
    midi.addTrackName(track, time, "FF6 Battle Style")
    midi.addTempo(track, time, 135)  # Fast tempo like FF6
    
    # FF6 battle music is typically in E minor or similar dramatic minor key
    # E minor scale: E, F#, G, A, B, C, D
    
    # Define the E minor scale
    e_minor = [64, 66, 67, 69, 71, 72, 74]  # E4, F#4, G4, A4, B4, C5, D5
    e_minor_octave_up = [n + 12 for n in e_minor]
    e_minor_octave_down = [n - 12 for n in e_minor]
    
    # Channel assignments (General MIDI)
    channel_bass = 0      # Acoustic Bass
    channel_drums = 9     # Drums (channel 10 in MIDI)
    channel_brass = 2     # Brass section
    channel_strings = 0   # Strings
    channel_lead = 4      # Synth lead
    
    # Volume
    volume = 100
    
    # ===== DRUM PATTERN =====
    # FF6 battle music has driving 16th-note drum patterns
    def add_drums_pattern(start_time, duration_beats):
        """Add driving drum pattern"""
        beat_duration = 0.25  # 16th notes
        
        for i in range(int(duration_beats / beat_duration)):
            t = start_time + i * beat_duration
            beat_in_measure = i % 16
            
            # Kick on 1 and 3 (strong beats)
            if beat_in_measure in [0, 8]:
                midi.addNote(track, channel_drums, 35, t, beat_duration, volume)  # Acoustic Bass Drum
            
            # Snare on 2 and 4
            if beat_in_measure in [4, 12]:
                midi.addNote(track, channel_drums, 38, t, beat_duration, volume)  # Acoustic Snare
            
            # Hi-hat on all 16th notes for driving feel
            midi.addNote(track, channel_drums, 42, t, beat_duration, 80)  # Closed Hi-hat
            
            # Crash on beat 1 of first measure
            if i == 0:
                midi.addNote(track, channel_drums, 49, t, beat_duration * 2, volume)  # Crash Cymbal
    
    # ===== BASS LINE =====
    # Root-driven bass with octave jumps
    def add_bass_line(start_time, duration_beats):
        """Add driving bass line"""
        beat_duration = 0.5  # 8th notes
        
        # E minor progression: Em - C - G - D (i - VI - III - VII)
        progression = [
            (e_minor[0], 4),      # E - 4 beats
            (e_minor[4] - 12, 4), # C (octave down) - 4 beats  
            (e_minor[4] - 12, 4), # G (octave down) - 4 beats
            (e_minor[6] - 12, 4), # D (octave down) - 4 beats
        ]
        
        current_time = start_time
        for root_note, beats in progression:
            for i in range(int(beats / beat_duration)):
                # Alternate between root and octave
                if i % 2 == 0:
                    note = root_note
                else:
                    note = root_note + 12
                
                midi.addNote(track, channel_bass, note, current_time, beat_duration, volume)
                current_time += beat_duration
    
    # ===== BRASS SECTION =====
    # Staccato brass hits on chord changes
    def add_brass_hits(start_time, duration_beats):
        """Add dramatic brass stabs"""
        # Em - C - G - D chord tones
        chords = [
            [e_minor[0], e_minor[2], e_minor[4]],      # Em: E-G-B
            [e_minor[4] - 12, e_minor[6] - 12, e_minor[0]],  # C: C-E-G
            [e_minor[4] - 12, e_minor[6] - 12, e_minor[1] - 12],  # G: G-B-D
            [e_minor[6] - 12, e_minor[1] - 12, e_minor[2] - 12],  # D: D-F#-A
        ]
        
        current_time = start_time
        beats_per_chord = 4
        
        for chord in chords:
            # Staccato hit on beat 1
            for note in chord:
                midi.addNote(track, channel_brass, note, current_time, 0.5, volume)
            
            # Echo on beat 3
            for note in chord:
                midi.addNote(track, channel_brass, note - 12, current_time + 2, 0.5, volume - 20)
            
            current_time += beats_per_chord
    
    # ===== LEAD MELODY =====
    # Dramatic, angular melody typical of FF6
    def add_lead_melody(start_time, duration_beats):
        """Add heroic lead melody"""
        # FF6-style melodic patterns: angular, dramatic intervals
        melody_pattern = [
            (e_minor[4], 0.5),      # B
            (e_minor[6], 0.5),      # D
            (e_minor[4] + 12, 0.5), # B (octave up)
            (e_minor[2] + 12, 0.5), # G (octave up)
            (e_minor[0] + 12, 1.0), # E (octave up)
            (e_minor[2] + 12, 0.5), # G
            (e_minor[4] + 12, 0.5), # B
            (e_minor[6] + 12, 1.0), # D (octave up)
        ]
        
        current_time = start_time
        pattern_length = sum(d for _, d in melody_pattern)
        
        while current_time < start_time + duration_beats:
            for note, duration in melody_pattern:
                if current_time >= start_time + duration_beats:
                    break
                midi.addNote(track, channel_lead, note, current_time, duration, volume)
                current_time += duration
    
    # ===== STRING ARPEGGIOS =====
    # Fast arpeggios for tension
    def add_string_arpeggios(start_time, duration_beats):
        """Add fast string arpeggios"""
        beat_duration = 0.25  # 16th notes
        
        # Arpeggio patterns for each chord
        arpeggios = [
            [e_minor[0], e_minor[2], e_minor[4], e_minor[2]],      # Em
            [e_minor[4] - 12, e_minor[6] - 12, e_minor[0], e_minor[6] - 12],  # C
            [e_minor[4] - 12, e_minor[6] - 12, e_minor[1] - 12, e_minor[6] - 12],  # G
            [e_minor[6] - 12, e_minor[1] - 12, e_minor[2] - 12, e_minor[1] - 12],  # D
        ]
        
        current_time = start_time
        beats_per_chord = 4
        chord_index = 0
        
        while current_time < start_time + duration_beats:
            arpeggio = arpeggios[chord_index % len(arpeggios)]
            
            for i in range(int(beats_per_chord / beat_duration)):
                note = arpeggio[i % len(arpeggio)]
                midi.addNote(track, channel_strings, note, current_time, beat_duration, volume - 20)
                current_time += beat_duration
            
            chord_index += 1
    
    # ===== BUILD THE SONG =====
    # Structure: Intro (4 bars) -> Main Theme (16 bars) -> Repeat
    
    # Intro (dramatic buildup)
    add_drums_pattern(time, 4)
    add_bass_line(time, 4)
    add_brass_hits(time, 4)
    time += 4
    
    # Main theme section
    for section in range(4):  # 4 repetitions of 16-bar theme
        add_drums_pattern(time, 16)
        add_bass_line(time, 16)
        add_brass_hits(time, 16)
        add_lead_melody(time, 16)
        add_string_arpeggios(time, 16)
        time += 16
    
    # Write to file
    with open(output_file, "wb") as f:
        midi.writeFile(f)
    
    print(f"FF6-style battle music generated: {output_file}")
    print("Tempo: 135 BPM")
    print("Key: E minor")
    print("Structure: Intro + 4x 16-bar theme sections")

if __name__ == "__main__":
    create_ff6_battle_midi()
