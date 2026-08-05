#!/usr/bin/env python3
"""
Floor 1 redesign - Step 3: Add Hot Boi NPC in the tavern/social hub area.

Hot Boi is a non-combat NPC in the social hub (entrance area). It has
capabilities disabling Attack and Steal. It provides flavor text and
hints about the raft and the chute shortcut.
"""
import json
from pathlib import Path

FLOOR_PATH = Path(__file__).parent.parent / "src/content/floors/floor-1.json"

def main():
    with open(FLOOR_PATH) as f:
        data = json.load(f)

    # Add Hot Boi NPC in the tavern area.
    # Place it at (10,24) — in the entrance corridor, off to the side.
    # (10,24) is currently an open corridor tile with no tile feature.
    # We need to set the tile to "npc" and add the NPC def.
    grid = data['grid']
    grid[24][10]['tile'] = 'npc'

    if 'npcs' not in data:
        data['npcs'] = []
    data['npcs'].append({
        'id': 'hot-boi',
        'name': 'Hot Boi',
        'title': 'the Tavern Keeper',
        'x': 10, 'y': 24,
        'greeting': 'Hot Boi waves a ladle. "Sit, sit. The hall eats the hasty. Ask me about the way down, or the water, or the chute."',
        'returnGreeting': 'Hot Boi nods. "Back already? The hall keeps its wounds open."',
        'topics': [
            {
                'key': 'way',
                'response': '"Five wounds, five paths. The crypt key opens the north door. Beyond it, the reliquary and the stairs down."'
            },
            {
                'key': 'water',
                'response': '"Black water cuts the cistern wing. Deep, still, and cold. You cannot swim it — you need a raft. They say one leans near the stairs."'
            },
            {
                'key': 'chute',
                'response': '"There is a sluice in the chapel wing. It drops to a sealed pocket below. The only way back is a barred gate — but it opens from inside. A shortcut, if you survive the fall."'
            },
            {
                'key': 'raft',
                'response': '"A raft will carry you across deep water, dock to dock. Find one near the stairs down, in the suture wing."'
            },
            {
                'key': 'shortcut',
                'response': '"The chute is the shortcut. Drop from the chapel, land in the pocket, lift the bar, and you are back at the fork. Nine steps instead of twenty."'
            }
        ],
        'combatEnemyIds': [],
        'capabilities': {
            'talk': True,
            'barter': False,
            'give': False,
            'steal': False,
            'attack': False
        }
    })

    # Write back
    with open(FLOOR_PATH, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')

    print("Step 3 complete: added Hot Boi NPC at (10,24)")

if __name__ == '__main__':
    main()
