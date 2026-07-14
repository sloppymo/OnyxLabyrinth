/**
 * ASCII / legend dumps for LLM review and CLI inspection.
 */

import type { FloorMapJSON, CellJSON } from "./floor-map";
import { cellIsPassable } from "./floor-map";
import type { FloorDef } from "../data/floors";
import { floorDefToMap } from "./floor-map";

const FEATURE_GLYPH: Record<string, string> = {
  stairs_up: "^",
  stairs_down: "v",
  teleporter: "P",
  chute: "C",
  darkness: "D",
  treasure: "T",
  antimagic: "M",
  water: "~",
  npc: "N",
  event: "!",
};

export interface AsciiDumpOptions {
  /** Mark start tile with @ */
  showStart?: boolean;
  /** Include coordinate ruler */
  showRuler?: boolean;
}

/** One character per cell: feature glyph, else floor (.), else wall (#). */
export function floorToAscii(
  floor: FloorDef | FloorMapJSON,
  opts: AsciiDumpOptions = {}
): string {
  const map = "grid" in floor && "formatVersion" in floor ? floor : floorDefToMap(floor);
  const { showStart = true, showRuler = true } = opts;
  const lines: string[] = [];
  lines.push(`# ${map.name} (id=${map.id}, ${map.width}x${map.height})`);
  lines.push(`# start=(${map.startX},${map.startY}) encounter=${map.encounterRate}`);
  lines.push(legendLine());
  lines.push("");

  if (showRuler) {
    const ruler =
      "   " +
      Array.from({ length: map.width }, (_, x) => (x % 10).toString()).join("");
    lines.push(ruler);
  }

  for (let y = 0; y < map.height; y++) {
    let row = showRuler ? `${y.toString().padStart(2, " ")} ` : "";
    for (let x = 0; x < map.width; x++) {
      const cell = map.grid[y][x];
      if (showStart && x === map.startX && y === map.startY) {
        row += "@";
        continue;
      }
      row += cellGlyph(cell);
    }
    lines.push(row);
  }

  lines.push("");
  lines.push(...overlaySummary(map));
  return lines.join("\n");
}

function cellGlyph(cell: CellJSON): string {
  if (cell.tile && FEATURE_GLYPH[cell.tile]) {
    return FEATURE_GLYPH[cell.tile]!;
  }
  return cellIsPassable(cell) ? "." : "#";
}

function legendLine(): string {
  return (
    "# . floor  # solid  @ start  ^v stairs  T treasure  ~ water  N npc  ! event  P tele  C chute  D dark  M antimagic"
  );
}

function overlaySummary(map: FloorMapJSON): string[] {
  const lines: string[] = ["# Overlays:"];
  if (map.lockedDoors?.length) {
    for (const d of map.lockedDoors) {
      lines.push(`#   lock (${d.x},${d.y}) ${d.dir} key=${d.keyId}`);
    }
  }
  if (map.treasures?.length) {
    for (const t of map.treasures) {
      const trap = t.trap ? ` trap=${t.trap}` : "";
      lines.push(`#   treasure (${t.x},${t.y}) items=[${t.itemIds.join(", ")}]${trap}`);
    }
  }
  if (map.waters?.length) {
    for (const w of map.waters) {
      lines.push(`#   water (${w.x},${w.y}) depth=${w.depth}`);
    }
  }
  if (map.npcs?.length) {
    for (const n of map.npcs) {
      lines.push(`#   npc (${n.x},${n.y}) id=${n.id} name=${n.name}`);
    }
  }
  if (map.events?.length) {
    for (const e of map.events) {
      lines.push(`#   event (${e.x},${e.y}) kind=${e.kind}`);
    }
  }
  if (map.teleporters?.length) {
    for (const t of map.teleporters) {
      lines.push(
        `#   teleporter (${t.x},${t.y}) -> floor ${t.toFloorId} (${t.toX},${t.toY})`
      );
    }
  }
  if (map.chuteDrops?.length) {
    for (const c of map.chuteDrops) {
      lines.push(
        `#   chute (${c.x},${c.y}) -> floor ${c.toFloorId} (${c.toX},${c.toY})`
      );
    }
  }
  if (lines.length === 1) lines.push("#   (none)");
  return lines;
}
