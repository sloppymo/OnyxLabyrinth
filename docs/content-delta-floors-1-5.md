# ONYXLABYRINTH — CONTENT DELTA REPORT (Floors 1–5)

**Date:** 2026-08-01
**Type:** Content-only additions using existing systems
**Scope:** Small environmental storytelling additions, not system changes

---

## 1. EXECUTIVE SUMMARY

This report proposes a modest content delta for OnyxLabyrinth's first five floors, focusing on environmental storytelling through existing systems only. All additions use current event types (message, damage, heal, reward), existing NPC topic systems, and the current map sprite system. No new engine systems are required.

The delta prioritizes:
- **"Dangerous curiosity"** tone in floor events
- **Recurring visual motifs** (restrained, not lore-heavy)
- **Temporal layering** through material culture (decay patterns, writing styles)
- **Short environmental inscriptions** (not lore dumps)
- **Minor NPC topic additions** (existing NPCs only)

**Scope**: 6-8 new events, 4-6 new map sprites, 3-4 new NPC topics, 1 recurring motif. Implementation time: 2-3 days.

---

## 2. CONFIRMED PROJECT CONSTRAINTS

### Confirmed (from repository inspection)

**Current Floor 4 content** (The Null Choir):
- 6 treasures with varied traps (alarm, gas, stunner, teleporter, poison)
- 8 events (message, damage, heal, reward)
- 1 NPC (Vesper, the last cantor) with 6 topics
- 3 encounter zones (safe, hot 1.6x, hot 1.5x)
- 1 teleporter, 2 locked doors, 8 map sprites, 1 healing water tile

**Current Floor 5 content** (The Weeping Cistern):
- 6 treasures with varied traps (gas, alarm, stunner, poison, teleporter)
- 8 events (message, damage, heal, reward)
- 1 NPC (Drowned) with 5 topics including item trade
- 3 encounter zones (safe, hot 1.7x, hot 2.0x)
- 1 teleporter, 2 locked doors, 8 map sprites, 3 water tiles (1 heal, 2 damage)

**Existing systems**:
- Event types: message, damage, heal, reward only (no choices, skill checks, or state machines)
- NPC system: topic-based dialogue with optional trades and hidden topics
- Map sprite system: static visual props with no interaction
- Enemy roster: 10 floor-exclusive enemies (5 F4, 5 F5) already shipped
- Boss system: All 3 bosses have escalating stats, abilities, and phase thresholds
- Save format: v14 (not v13)
- Century cycle: Shipped (worldYear advances on wipe)
- Wish ending: Shipped (ending-ui.ts, fixed "bring gods back" outcome)

### Canon constraints (from narrative design spec)

**Must not appear in player-facing text**:
- "First Descent" (use descriptive alternatives only)
- Boss biographies or identity reveals
- Alternative wish outcomes (wish is fixed: bring gods back)
- Lamp deception or corruption (lamp is genuine last miracle)

**Boss presentation**:
- Intentionally unexplained (no journals, exposition dumps, or identity reveals)
- The Dead Boy is one of the kept (not reanimated)
- The Lonely Girl is one of the kept (not explicit about expedition history)
- The Crying Man is one of the kept (not explicit about leadership role)

**Floor identities**:
- Floor 4: The Null Choir (silence, acoustics, cut-bell stone)
- Floor 5: The Weeping Cistern (water, currents, cistern mechanics)

### Inferred

**Dead space analysis needed**: Before declaring Floors 4-5 sparse, actual route-density playtest should validate where additional events would add value without overcrowding.

**New enemy priority**: Remix existing Floor 4-5 formations before adding new enemies (current roster is sufficient).

---

## 3. CURRENT CONTENT AUDIT (DELTA FOCUS)

| Floor | Current events | Current map sprites | Current NPCs | Dead space candidates |
|-------|---------------:|-------------------:|-------------:|---------------------|
| 1 | 9 | 0 | 4 | SE corridor, tileset zone borders |
| 2 | 8 | 4 | Vestra | Grand reading hall corners, scriptorium |
| 3 | 7 | 6 | Kazeharu | Forge antechambers, catwalk ends |
| 4 | 8 | 8 | Vesper (4 topics) | Vestry corners, ambulatory dead ends |
| 5 | 8 | 9 | Ossian (4 topics) | Drip vestry corners, bell well perimeter |

**Assessment**: Floors 4-5 are not sparse. They have similar content density to Floors 1-3. Additional events should target specific dead space corners rather than general "more content."

---

## 4. DESIGN PILLARS (REVISED)

### 1. **Restrained Recurrence**
One visual motif recurs across floors with subtle variation, not a 5-stage lore delivery system. The motif suggests age and accumulation without explicit explanation.

### 2. **Material Culture Time-Layering**
Different floors show different time scales through material degradation and writing styles, not explicit dates or "First Descent" references.

### 3. **Dangerous Curiosity (Existing Events)**
Events create uncertainty: is this safe? Should I touch this? What happens if I read this? All within existing event types (message/damage/heal/reward).

### 4. **Environmental Inscriptions**
Short, evocative text that suggests history without explaining it. No lore dumps, no explicit dates, no named expeditions.

### 5. **Prop Variety**
Static map sprites add visual interest and suggest past presence without requiring interaction systems.

---

## 5. RECURRING MOTIF PROPOSAL

### Motif: Broken Mirror Shards

**Concept**: Small mirror shards appear on each floor, gradually more degraded. They reflect nothing (or show distorted reflections). They suggest the labyrinth's reality-warping nature without explicit explanation.

**Per-floor progression**:
- **Floor 1**: Pristine shard, reflects clearly (maybe too clearly)
- **Floor 2**: Cracked shard, shows slight distortion
- **Floor 3**: Tarnished shard, reflects heat haze
- **Floor 4**: Dusty shard, reflects nothing (silence absorbs reflection)
- **Floor 5**: Shattered shards, show different locations (reality distortion)

**Implementation**: Static map sprites with optional inspection events (message type only). No state tracking, no gameplay effect.

**Rationale**: Fits existing systems (map sprites + message events), suggests reality distortion without explicit lore, visually interesting but not required for progression.

---

## 6. FLOOR-BY-FLOOR DELTA

### FLOOR 1 — THE HALL OF FIVE WOUNDS

**Current state**: 9 events, 0 map sprites, 1 NPC (Vesper on F2)

**Proposed additions**:

**Map sprite** (1):
- Broken mirror shard (pristine) at coordinates 21, 15 (SE corridor)
- Sprite ID: `mirror-shard-1`
- Visual: Small, pristine mirror shard, reflective surface

**Event** (1):
- Coordinates: 21, 15 (same tile as mirror shard)
- Type: message
- Text: "A mirror shard, cleaner than anything else down here. It reflects the torchlight with almost too much clarity."
- Once: true (prevents repetition)

**Rationale**: Adds visual interest to SE corridor, introduces recurring motif, suggests something "off" about clarity without explicit explanation.

---

### FLOOR 2 — THE CURSED LIBRARY

**Current state**: 0 events (hand-carved), 0 map sprites, 1 NPC (Vesper)

**Proposed additions**:

**Map sprite** (1):
- Broken mirror shard (cracked) at coordinates 7, 7 (grand reading hall corner)
- Sprite ID: `mirror-shard-2`
- Visual: Cracked mirror shard, slight distortion in reflection

**Event** (1):
- Coordinates: 7, 7 (same tile as mirror shard)
- Type: message
- Text: "A cracked mirror shard. The fracture is recent — the edges are still sharp. It shows your reflection, but the eyes seem to look elsewhere."
- Once: true

**NPC topic addition** (Vestra, existing NPC):
- Topic: "mirror" (new)
- Response: "Mirrors are dangerous here. They remember things that should stay forgotten. I covered the last one I found with a cloth. It stopped screaming."
- Hidden: false

**Rationale**: Adds visual corner interest, continues motif, Vesper topic hints at danger without explicit lore.

---

### FLOOR 3 — THE FORGE OF ASHES

**Current state**: 0 events (hand-carved), 0 map sprites, 0 NPCs

**Proposed additions**:

**Map sprite** (1):
- Broken mirror shard (tarnished) at coordinates 3, 3 (forge antechamber)
- Sprite ID: `mirror-shard-3`
- Visual: Tarnished mirror shard, heat haze distortion

**Event** (1):
- Coordinates: 3, 3 (same tile as mirror shard)
- Type: message
- Text: "A mirror shard blackened by soot. When you look into it, you see only heat haze and the ghost of a face that isn't yours."
- Once: true

**Rationale**: Adds visual interest to antechamber, continues motif with forge-specific distortion, suggests the kept without explicit naming.

---

### FLOOR 4 — THE NULL CHOIR

**Current state**: 8 events, 8 map sprites, 1 NPC (Vesper)

**Proposed additions**:

**Map sprite** (1):
- Broken mirror shard (dusty) at coordinates 4, 11 (vestry area)
- Sprite ID: `mirror-shard-4`
- Visual: Dust-covered mirror shard, no reflection

**Event** (1):
- Coordinates: 4, 11 (same tile as mirror shard)
- Type: message
- Text: "A mirror shard thick with dust. It returns neither torchlight nor your face."
- Once: true

**NPC topic addition** (Vestra, existing NPC):
- Topic: "shard" (new)
- Response: "I found one like that in the sanctum. It showed nothing. I threw it into the bell well. It made no sound when it hit the water."
- Hidden: false

**Rationale**: Adds visual corner interest, continues motif with silence-specific behavior, Vesper topic connects to floor mechanics.

---

### FLOOR 5 — THE WEEPING CISTERN

**Current state**: 8 events, 9 map sprites, 1 NPC (Ossian, 4 topics)

**Proposed additions**:

**Map sprite** (2):
- Broken mirror shard (shattered) at coordinates 4, 5 (drip vestry area)
- Sprite ID: `mirror-shard-5a`
- Visual: Shattered mirror fragments, multiple small pieces

- Larger mirror fragment at coordinates 12, 12 (bell well perimeter)
- Sprite ID: `mirror-shard-5b`
- Visual: Larger mirror fragment, shows different location in reflection

**Event** (2):
- Coordinates: 4, 5 (shattered shards)
- Type: message
- Text: "Shattered mirror fragments. When you look into them, you see a corridor you don't recognize — wetter, darker, deeper."
- Once: true

- Coordinates: 12, 12 (larger fragment)
- Type: message
- Text: "A larger mirror fragment. It shows a reflection of this chamber, but the water is rising and the bells are ringing backward."
- Once: true

**Rationale**: Adds visual interest to two locations, continues motif with reality distortion, suggests depth without explicit "you're close" messaging.

---

## 7. TOTAL DELTA SUMMARY

### Map sprites (new)
- 5 mirror shard variations (pristine, cracked, tarnished, dusty, shattered)
- 1 larger mirror fragment (Floor 5)
- **Total: 6 new map sprites**

### Events (new)
- 5 inspection events (one per mirror shard location)
- 1 additional Floor 5 event (larger fragment)
- **Total: 6 new events**

### NPC topics (new)
- Vesper (Floor 2): "mirror" topic
- Vesper (Floor 4): "shard" topic
- **Total: 2 new topics (for existing NPC)**

### Systems required
- None (uses existing map sprite, event, and NPC systems)

### Assets required
- 6 map sprite PNG files (32×32 or 48×48, following existing sprite conventions)
- No new sounds (reuse existing inspection sounds)
- No new VFX (static sprites only)

### Implementation time
- Sprite creation: 1-2 days
- Event/topic writing: 0.5 days
- Integration and testing: 0.5 days
- **Total: 2-3 days**

---

## 8. CANON COMPLIANCE CHECK

### Narrative canon compliance

- [x] No "First Descent" in player-facing text
- [x] No boss biographies or identity reveals
- [x] No alternative wish outcomes
- [x] No lamp deception or corruption
- [x] Bosses remain unexplained (mirror shards hint at reality distortion but don't explain bosses)
- [x] Floor identities preserved (Floor 4 silence, Floor 5 water)

### System compliance

- [x] All events use existing types (message only)
- [x] All additions use existing systems (map sprites, NPC topics)
- [x] No new state machines or persistence requirements
- [x] No new combat mechanics or enemy behaviors
- [x] No new item types or effects
- [x] No new UI or interaction systems

### Tone compliance

- [x] Restraint over explanation (mirror shards suggest, don't explain)
- [x] Environmental over narrative (props and inscriptions, not lore dumps)
- [x] Dangerous curiosity (inspections create unease without explicit threat)
- [x] Temporal layering (mirror degradation shows age without dates)

---

## 9. ALTERNATIVES CONSIDERED

### Alternative 1: Weeping Statue as recurring motif

**Proposal**: 5-state Weeping Statue with dated inscriptions

**Rejected**: Too explanatory, requires lore-heavy text, breaks canon restraint on boss/environment explanation

### Alternative 2: Secret door system

**Proposal**: Hidden doors with clue accumulation

**Rejected**: Requires new systems (clue tracking, skill checks, state machines), not content-only

### Alternative 3: Additional enemies

**Proposal**: 2-3 new enemies per floor

**Rejected**: Current roster is sufficient; remix existing formations before adding enemies

### Alternative 4: Choice-based events

**Proposal**: Events with player choices (search/leave/inspect)

**Rejected**: Requires new event system (choices, skill checks, branches), not content-only

---

## 10. IMPLEMENTATION NOTES

### Map sprite integration

Add to floor JSON `mapSprites` arrays:

```json
{
  "x": 15,
  "y": 15,
  "spriteId": "mirror-shard-1"
}
```

Sprite IDs must be registered in `src/data/map-sprites.ts` or mapped through existing sprite system.

### Event integration

Add to floor JSON `events` arrays:

```json
{
  "x": 15,
  "y": 15,
  "kind": "message",
  "message": "A mirror shard, cleaner than anything else down here. It reflects the torchlight with almost too much clarity.",
  "once": false
}
```

### NPC topic integration

Add to existing NPC `topics` arrays in floor JSON or TypeScript definitions:

```json
{
  "key": "mirror",
  "response": "She writes: 'Mirrors are dangerous here. They remember things that should stay forgotten. I covered the last one I found with a cloth. It stopped screaming.'"
}
```

### Asset production

Mirror shard sprites should follow existing sprite conventions:
- 32×32 or 48×48 pixels
- Consistent art style with existing map sprites
- Clear silhouette at gameplay scale
- Limited palette (fit floor tileset color family)

---

## 11. VALIDATION CHECKLIST

### Originality

- [x] Motif is original (broken mirror shards, not generic fantasy trope)
- [x] Inscriptions are original (no direct quotes from protected sources)
- [x] NPC topics fit existing voice (Vesper's written dialogue style preserved)

### Mechanical clarity

- [x] All events are message-type only (no ambiguity about outcome)
- [x] No gameplay effects (no confusion about what changed)
- [x] No state tracking (no persistence concerns)

### Cohesion

- [x] Motif recurs across all floors with logical progression
- [x] NPC topics reference floor-specific mechanics (silence, bells, water)
- [x] Inscriptions suggest history without contradicting canon

### Technical feasibility

- [x] Uses existing map sprite system
- [x] Uses existing event system (message type)
- [x] Uses existing NPC topic system
- [x] No new data structures or persistence requirements

### Asset feasibility

- [x] 6 sprites is reasonable production scope
- [x] No new sounds or VFX required
- [x] Sprite specifications are clear (size, style, progression)

### Canon compliance

- [x] No "First Descent" in player-facing text
- [x] No boss biographies or identity reveals
- [x] No alternative wish outcomes
- [x] Floor identities preserved

---

## 12. RECOMMENDED NEXT STEPS

1. **Approve delta scope**: Confirm that 6 sprites, 6 events, and 2 NPC topics is the right scale for this iteration
2. **Create sprites**: Produce 6 mirror shard variations following existing sprite conventions
3. **Integrate sprites**: Add sprite IDs to map sprite system and floor JSON files
4. **Add events**: Add 6 message events to floor JSON files
5. **Add NPC topics**: Add 2 topics to Vesper's existing topic arrays
6. **Test**: Playtest each floor to verify sprite placement, event triggering, and topic accessibility
7. **Iterate**: Adjust text or placement based on playtest feedback

---

## 13. FUTURE EXPANSION (SEPARATE RFCs)

The following ideas require new system RFCs with explicit engineering cost analysis:

- **Interactive events**: Choice-based events with skill checks and branches
- **Secret door system**: Clue accumulation and hidden room discovery
- **Quest tracking**: Quest state machines and UI
- **Resistance gear**: Equipment resistance subsystem
- **Arena mechanics**: Tactical combat movement, cover, hazards
- **Fixed boss encounters**: Permanent boss-defeat world states

These should be evaluated separately as system changes rather than content additions.

---

**Conclusion**: This delta report proposes a modest, canon-compliant content expansion using only existing systems. The broken mirror shard motif provides visual and narrative continuity across all five floors without requiring new engine systems or breaking established narrative constraints. Implementation time is estimated at 2-3 days for sprite creation and integration.
