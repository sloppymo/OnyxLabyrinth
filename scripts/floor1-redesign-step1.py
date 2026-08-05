#!/usr/bin/env python3
"""
Floor 1 redesign - Step 1: Grid carving.

Carves the raft pocket at (3,22), the connecting passage from the pocket
to the barred gate location at (4,21), and the chute drop point at (3,8).

This script modifies floor-1.json in place. Run floor:validate after.

Changes:
1. Carve a 1x3 pocket at (3,22)-(3,24) — the raft landing area.
2. Carve a passage from (3,21) to (4,21) — where the barred gate will go.
3. Add a chute tile feature at (3,8) and a chuteDrop entry.
4. Set floorRevision: 2.
"""
import json
import sys
from pathlib import Path

FLOOR_PATH = Path(__file__).parent.parent / "src/content/floors/floor-1.json"

def set_edge(grid, x, y, dir, edge_type):
    """Set an edge on a cell. dir is 'n','e','s','w'."""
    grid[y][x][dir] = edge_type

def carve_corridor_h(grid, x1, x2, y):
    """Carve a horizontal corridor from (x1,y) to (x2,y) inclusive.
    Opens east/west edges between consecutive cells."""
    for x in range(x1, x2 + 1):
        if x > x1:
            set_edge(grid, x, y, 'w', 'open')
            set_edge(grid, x - 1, y, 'e', 'open')

def carve_corridor_v(grid, x, y1, y2):
    """Carve a vertical corridor from (x,y1) to (x,y2) inclusive.
    Opens north/south edges between consecutive cells."""
    for y in range(y1, y2 + 1):
        if y > y1:
            set_edge(grid, x, y, 'n', 'open')
            set_edge(grid, x, y - 1, 's', 'open')

def main():
    with open(FLOOR_PATH) as f:
        data = json.load(f)

    grid = data['grid']

    # 1. Carve the raft pocket: a 1x3 vertical pocket at (3,22)-(3,24).
    # This is where the chute drops the player.
    carve_corridor_v(grid, 3, 22, 24)

    # 2. Carve a passage from the pocket (3,22) east to (4,21) area.
    # The pocket at (3,22) connects north to (3,21), then east to (4,21).
    # (3,21) is the barred gate location — the gate is between (3,21) and (4,21).
    # Actually, the barred gate is at (3,21) facing east, opening from the
    # east side (4,21). So we need:
    # - (3,22) connected north to (3,21)
    # - (3,21) connected east to (4,21) via a "barred" edge
    # - (4,21) connected to the main corridor

    # Connect (3,22) north to (3,21)
    set_edge(grid, 3, 22, 'n', 'open')
    set_edge(grid, 3, 21, 's', 'open')

    # Connect (3,21) east to (4,21) with a "barred" edge
    set_edge(grid, 3, 21, 'e', 'barred')
    set_edge(grid, 4, 21, 'w', 'barred')

    # 3. Connect (4,21) to the main corridor. Looking at the map, (4,21) is
    # currently empty. We need to connect it to the nearest existing corridor.
    # The nearest corridor is at y=20-21 around x=10-14. Let's connect (4,21)
    # west... no, that's too far. Let's connect it south to (4,22) then to
    # the entrance corridor.
    # Actually, looking at the map, the entrance corridor is at x=11, y=22-26.
    # We need a passage from (4,21) to the main area. Let's carve a passage
    # from (4,21) south to (4,24), then east to (11,24) or similar.
    # But that would cross through walls. Let's check what's at (4,22)-(4,26).
    # From the map, everything at x=1-8, y=20-26 is empty (walls).
    # We need to carve a passage from (4,21) to the entrance corridor at (11,22).
    # Let's carve: (4,21) -> (4,22) -> ... -> (10,22) -> (11,22)
    # (11,22) already has a north edge open (connects to (11,23) below).

    # Carve horizontal passage from (4,22) to (11,22)
    carve_corridor_h(grid, 4, 11, 22)
    # Connect (4,21) south to (4,22)
    set_edge(grid, 4, 21, 's', 'open')
    set_edge(grid, 4, 22, 'n', 'open')

    # 4. Add chute tile feature at (3,8)
    # (3,8) currently has edges NS (connected to (3,7) and (3,9))
    grid[8][3]['tile'] = 'chute'

    # Add chuteDrop entry: (3,8) -> same floor (3,22) with confirm=true
    if 'chuteDrops' not in data:
        data['chuteDrops'] = []
    data['chuteDrops'].append({
        'x': 3, 'y': 8,
        'toFloorId': 1,
        'toX': 3, 'toY': 22,
        'confirm': True
    })

    # 5. Set floorRevision
    data['floorRevision'] = 2

    # Write back
    with open(FLOOR_PATH, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')

    print("Step 1 complete: carved raft pocket, passage, chute. floorRevision=2")

if __name__ == '__main__':
    main()
