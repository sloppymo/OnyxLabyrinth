#!/usr/bin/env python3
"""
Generate FF6-style battle music MIDI file (no external dependencies).
Writes raw MIDI bytes using Python's struct module.
"""

import struct
import random

class SimpleMIDI:
    """Simple MIDI file writer without external dependencies"""
    
    def __init__(self):
        self.tracks = []
        self.current_track = []
    
    def add_track(self):
        self.tracks.append([])
        self.current_track = self.tracks[-1]
    
    def write_byte(self, byte):
        self.current_track.append(byte)
    
    def write_varint(self, value):
        """Write variable-length quantity"""
        buffer = value & 0x7F
        value >>= 7
        while value > 0:
            buffer = (buffer << 8) | ((value & 0x7F) | 0x80)
            value >>= 7
        while True:
            self.write_byte(buffer & 0xFF)
            if buffer & 0x80:
                buffer >>= 8
            else:
                break
    
    def write_note_on(self, channel, note, velocity, delta_time=0):
        self.write_varint(delta_time)
        self.write_byte(0x90 | (channel & 0x0F))
        self.write_byte(note & 0x7F)
        self.write_byte(velocity & 0x7F)
    
    def write_note_off(self, channel, note, velocity, delta_time=0):
        self.write_varint(delta_time)
        self.write_byte(0x80 | (channel & 0x0F))
        self.write_byte(note & 0x7F)
        self.write_byte(velocity & 0x7F)
    
    def write_program_change(self, channel, program, delta_time=0):
        self.write_varint(delta_time)
        self.write_byte(0xC0 | (channel & 0x0F))
        self.write_byte(program & 0x7F)
    
    def write_tempo(self, microseconds_per_beat, delta_time=0):
        self.write_varint(delta_time)
        self.write_byte(0xFF)  # Meta event
        self.write_byte(0x51)  # Set tempo
        self.write_byte(0x03)  # Length
        self.write_byte((microseconds_per_beat >> 16) & 0xFF)
        self.write_byte((microseconds_per_beat >> 8) & 0xFF)
        self.write_byte(microseconds_per_beat & 0xFF)
    
    def write_end_of_track(self, delta_time=0):
        self.write_varint(delta_time)
        self.write_byte(0xFF)  # Meta event
        self.write_byte(0x2F)  # End of track
        self.write_byte(0x00)  # Length
    
    def save(self, filename):
        """Write MIDI file"""
        # Calculate track data
        track_data = []
        for track in self.tracks:
            data = bytes(track)
            track_header = struct.pack('>I', len(data))
            track_data.append(b'MTrk' + track_header + data)
        
        # Write header
        num_tracks = len(self.tracks)
        header = struct.pack('>IHHH', 6,  # Header length
                           0,  # Format 0 (single track)
                           num_tracks,  # Number of tracks
                           480)  # Ticks per quarter note
        
        with open(filename, 'wb') as f:
            f.write(b'MThd' + header)
            for data in track_data:
                f.write(data)

def create_ff6_battle_midi(output_file="ff6_battle_theme.mid"):
    midi = SimpleMIDI()
    midi.add_track()
    
    # Set tempo (135 BPM = 444,444 microseconds per beat)
    midi.write_tempo(444444)
    
    # Set instruments
    midi.write_program_change(0, 32)  # Acoustic Bass
    midi.write_program_change(1, 60)  # Brass section
    midi.write_program_change(2, 48)  # String ensemble
    midi.write_program_change(3, 80)  # Synth lead
    midi.write_program_change(9, 0)  # Drums (channel 10)
    
    # E minor scale
    e_minor = [64, 66, 67, 69, 71, 72, 74]  # E4, F#4, G4, A4, B4, C5, D5
    
    # Simple drum pattern
    def add_drums(start_tick, duration_ticks):
        tick = start_tick
        while tick < start_tick + duration_ticks:
            # Kick on beat 1
            midi.write_note_on(9, 35, 100, tick - start_tick)
            midi.write_note_off(9, 35, 100, 60)
            tick += 60
            
            # Snare on beat 2
            midi.write_note_on(9, 38, 100, tick - start_tick)
            midi.write_note_off(9, 38, 100, 60)
            tick += 60
            
            # Kick on beat 3
            midi.write_note_on(9, 35, 100, tick - start_tick)
            midi.write_note_off(9, 35, 100, 60)
            tick += 60
            
            # Snare on beat 4
            midi.write_note_on(9, 38, 100, tick - start_tick)
            midi.write_note_off(9, 38, 100, 60)
            tick += 60
    
    # Bass line (driving 8th notes)
    def add_bass(start_tick, duration_ticks):
        tick = start_tick
        # E - C - G - D progression
        progression = [e_minor[0], e_minor[4] - 12, e_minor[4] - 12, e_minor[6] - 12]
        prog_index = 0
        
        while tick < start_tick + duration_ticks:
            root = progression[prog_index % len(progression)]
            
            # Root and octave pattern
            for _ in range(8):  # 8 eighth notes per chord
                if tick % 120 == 0:
                    note = root
                else:
                    note = root + 12
                
                midi.write_note_on(0, note, 100, tick - start_tick)
                midi.write_note_off(0, note, 100, 60)
                tick += 60
            
            prog_index += 1
    
    # Brass stabs
    def add_brass(start_tick, duration_ticks):
        tick = start_tick
        # Em - C - G - D chords
        chords = [
            [e_minor[0], e_minor[2], e_minor[4]],
            [e_minor[4] - 12, e_minor[6] - 12, e_minor[0]],
            [e_minor[4] - 12, e_minor[6] - 12, e_minor[1] - 12],
            [e_minor[6] - 12, e_minor[1] - 12, e_minor[2] - 12],
        ]
        
        chord_index = 0
        while tick < start_tick + duration_ticks:
            chord = chords[chord_index % len(chords)]
            
            # Stab on beat 1
            for note in chord:
                midi.write_note_on(1, note, 100, tick - start_tick)
            tick += 60
            for note in chord:
                midi.write_note_off(1, note, 100, 0)
            
            # Rest for 3 beats
            tick += 180
            chord_index += 1
    
    # Lead melody
    def add_melody(start_tick, duration_ticks):
        tick = start_tick
        # Dramatic FF6-style melody
        melody = [
            (e_minor[4], 60),      # B
            (e_minor[6], 60),      # D
            (e_minor[4] + 12, 60),  # B octave
            (e_minor[2] + 12, 60),  # G octave
            (e_minor[0] + 12, 120), # E octave
            (e_minor[2] + 12, 60),  # G
            (e_minor[4] + 12, 60),  # B
            (e_minor[6] + 12, 120), # D octave
        ]
        
        while tick < start_tick + duration_ticks:
            for note, duration in melody:
                if tick >= start_tick + duration_ticks:
                    break
                midi.write_note_on(3, note, 100, tick - start_tick)
                midi.write_note_off(3, note, 100, duration)
                tick += duration
    
    # String arpeggios
    def add_strings(start_tick, duration_ticks):
        tick = start_tick
        arpeggios = [
            [e_minor[0], e_minor[2], e_minor[4], e_minor[2]],
            [e_minor[4] - 12, e_minor[6] - 12, e_minor[0], e_minor[6] - 12],
            [e_minor[4] - 12, e_minor[6] - 12, e_minor[1] - 12, e_minor[6] - 12],
            [e_minor[6] - 12, e_minor[1] - 12, e_minor[2] - 12, e_minor[1] - 12],
        ]
        
        arp_index = 0
        while tick < start_tick + duration_ticks:
            arp = arpeggios[arp_index % len(arpeggios)]
            
            for i in range(16):  # 16 sixteenth notes per chord
                note = arp[i % len(arp)]
                midi.write_note_on(2, note, 80, tick - start_tick)
                midi.write_note_off(2, note, 80, 30)
                tick += 30
            
            arp_index += 1
    
    # Build the song (4 ticks = 1 sixteenth note at 480 PPQ)
    ticks_per_beat = 480
    ticks_per_measure = ticks_per_beat * 4
    
    # Intro (4 measures)
    intro_ticks = ticks_per_measure * 4
    add_drums(0, intro_ticks)
    add_bass(0, intro_ticks)
    add_brass(0, intro_ticks)
    
    # Main theme (16 measures x 4 repetitions)
    theme_ticks = ticks_per_measure * 16
    for i in range(4):
        start = intro_ticks + i * theme_ticks
        add_drums(start, theme_ticks)
        add_bass(start, theme_ticks)
        add_brass(start, theme_ticks)
        add_melody(start, theme_ticks)
        add_strings(start, theme_ticks)
    
    # End of track
    total_ticks = intro_ticks + theme_ticks * 4
    midi.write_end_of_track(total_ticks)
    
    # Save
    midi.save(output_file)
    print(f"FF6-style battle music generated: {output_file}")
    print("Tempo: 135 BPM")
    print("Key: E minor")
    print("Instruments: Bass, Brass, Strings, Synth Lead, Drums")

if __name__ == "__main__":
    create_ff6_battle_midi()
