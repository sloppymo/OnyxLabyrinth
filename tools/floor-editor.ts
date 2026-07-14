/**
 * WYSIWYG floor editor — edge carve, overlays, themes, encounter zones.
 */

import {
  newFloorMapJSON,
  parseFloorMapJSON,
  parseNpcJSON,
  mapToFloorDef,
  cellIsPassable,
  resolveTilesetTheme,
  type FloorMapJSON,
} from "../src/game/floor-map";
import { validateFloorMap } from "../src/game/floor-validate";
import { floorToAscii } from "../src/game/floor-ascii";
import { carveRoom } from "../src/game/dungeon";
import type { EdgeType, TileFeature, TrapType } from "../src/types";
import type { EventDef, EncounterZoneDef, NPCDef, WaterDef } from "../src/data/floors";
import { ALL_ITEMS } from "../src/data/items";
import { ALL_ENEMIES } from "../src/data/enemies";
import { MAP_SPRITES } from "../src/data/map-sprites";

type Tool =
  | "select"
  | "room"
  | "edge"
  | "feature"
  | "start"
  | "erase"
  | "zone"
  | "event"
  | "sprite";

const CELL = 28;
const EDGE_ZONE = 0.22;
const BASE = import.meta.env.BASE_URL ?? "/";
const PLAYTEST_STORAGE_KEY = "onyx-floor-playtest";

const SPRITE_GLYPH: Record<string, string> = {
  torch: "†",
  crate: "□",
  bones: "≈",
  barrel: "o",
};

const OPP: Record<"n" | "e" | "s" | "w", "n" | "e" | "s" | "w"> = {
  n: "s",
  e: "w",
  s: "n",
  w: "e",
};
const DELTA: Record<"n" | "e" | "s" | "w", [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

const FEATURES: { tile: TileFeature; label: string; glyph: string }[] = [
  { tile: "stairs_down", label: "Stairs down", glyph: "v" },
  { tile: "stairs_up", label: "Stairs up", glyph: "^" },
  { tile: "treasure", label: "Treasure", glyph: "T" },
  { tile: "water", label: "Water", glyph: "~" },
  { tile: "darkness", label: "Darkness", glyph: "D" },
  { tile: "antimagic", label: "Antimagic", glyph: "M" },
  { tile: "npc", label: "NPC", glyph: "N" },
  { tile: "event", label: "Event", glyph: "!" },
  { tile: "teleporter", label: "Teleporter", glyph: "P" },
  { tile: "chute", label: "Chute", glyph: "C" },
];

const EVENT_TEMPLATES: { label: string; def: Omit<EventDef, "x" | "y"> }[] = [
  {
    label: "Lore plaque",
    def: { kind: "message", message: "Words are carved into the stone.", once: true },
  },
  {
    label: "Dart trap",
    def: {
      kind: "damage",
      message: "Darts whistle from the walls!",
      power: 4,
      once: true,
    },
  },
  {
    label: "Heal shrine",
    def: {
      kind: "heal",
      message: "Warm light washes over the party.",
      power: 8,
      once: true,
    },
  },
  {
    label: "Corpse loot",
    def: {
      kind: "reward",
      message: "You find something useful on a fallen explorer.",
      itemId: "healing-potion",
      once: true,
    },
  },
];

const EDGE_COLORS: Record<EdgeType, string> = {
  wall: "#4a4038",
  open: "#1a1814",
  door: "#c8a040",
  locked: "#c04040",
};

const TRAPS: (TrapType | "")[] = ["", "gas", "teleporter", "alarm", "stunner", "poison"];

const ITEM_OPTIONS = ALL_ITEMS.map((i) => ({ id: i.id, name: i.name })).sort((a, b) =>
  a.name.localeCompare(b.name)
);

const ENEMY_OPTIONS = ALL_ENEMIES.map((e) => ({ id: e.id, name: e.name })).sort((a, b) =>
  a.name.localeCompare(b.name)
);

let map: FloorMapJSON = newFloorMapJSON(16, 16, {
  name: "New Floor",
  startX: 8,
  startY: 14,
  tilesetTheme: "f1",
});
let tool: Tool = "room";
let edgeMode: EdgeType = "open";
let featureTile: TileFeature = "treasure";
let pendingEventTemplate: Omit<EventDef, "x" | "y"> | null = null;
let pendingSpriteId = MAP_SPRITES[0]!.id;
let selected: { x: number; y: number } | null = null;
let dragStart: { x: number; y: number } | null = null;
let panX = 16;
let panY = 16;

const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// --- Undo / redo -------------------------------------------------------------
// Snapshot the whole map before every mutation; cheap at these grid sizes.

const HISTORY_LIMIT = 100;
let undoStack: string[] = [];
let redoStack: string[] = [];

function pushHistory(): void {
  undoStack.push(JSON.stringify(map));
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack = [];
}

function undo(): void {
  const prev = undoStack.pop();
  if (prev === undefined) return;
  redoStack.push(JSON.stringify(map));
  map = JSON.parse(prev) as FloorMapJSON;
  selected = null;
  refresh();
}

function redo(): void {
  const next = redoStack.pop();
  if (next === undefined) return;
  undoStack.push(JSON.stringify(map));
  map = JSON.parse(next) as FloorMapJSON;
  selected = null;
  refresh();
}

function inBounds(x: number, y: number): boolean {
  return y >= 0 && y < map.height && x >= 0 && x < map.width;
}

function setEdgeSymmetric(x: number, y: number, dir: "n" | "e" | "s" | "w", edge: EdgeType): void {
  if (!inBounds(x, y)) return;
  map.grid[y][x][dir] = edge;
  const [dx, dy] = DELTA[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (inBounds(nx, ny)) map.grid[ny][nx][OPP[dir]] = edge;
}

/** Remove lockedDoors entries on BOTH sides of the physical edge at (x,y).dir. */
function removeLockEntries(x: number, y: number, dir: "n" | "e" | "s" | "w"): void {
  if (!map.lockedDoors) return;
  const [dx, dy] = DELTA[dir];
  const ox = x + dx;
  const oy = y + dy;
  const opp = OPP[dir];
  map.lockedDoors = map.lockedDoors.filter(
    (d) => !((d.x === x && d.y === y && d.dir === dir) || (d.x === ox && d.y === oy && d.dir === opp))
  );
}

/** True when either side of the physical edge already has a lockedDoors entry. */
function hasLockEntry(x: number, y: number, dir: "n" | "e" | "s" | "w"): boolean {
  const [dx, dy] = DELTA[dir];
  const ox = x + dx;
  const oy = y + dy;
  const opp = OPP[dir];
  return (map.lockedDoors ?? []).some(
    (d) => (d.x === x && d.y === y && d.dir === dir) || (d.x === ox && d.y === oy && d.dir === opp)
  );
}

/** Key-id suggestions for the lock inspector datalist. */
function keyIdCandidates(): string[] {
  const ids = new Set<string>(["crypt-key", "lexicon-key", "furnace-key", "forge-key"]);
  for (const t of map.treasures ?? []) {
    for (const id of t.itemIds) if (id.endsWith("-key")) ids.add(id);
  }
  for (const d of map.lockedDoors ?? []) ids.add(d.keyId);
  return [...ids].sort();
}

function cellAtCanvas(mx: number, my: number): { x: number; y: number } | null {
  const x = Math.floor((mx - panX) / CELL);
  const y = Math.floor((my - panY) / CELL);
  if (!inBounds(x, y)) return null;
  return { x, y };
}

function edgeAtCell(
  _cx: number,
  _cy: number,
  lx: number,
  ly: number
): "n" | "e" | "s" | "w" | "center" {
  const z = CELL * EDGE_ZONE;
  if (ly < z) return "n";
  if (ly > CELL - z) return "s";
  if (lx < z) return "w";
  if (lx > CELL - z) return "e";
  return "center";
}

function currentTheme(): string {
  return resolveTilesetTheme({ id: map.id, tilesetTheme: map.tilesetTheme });
}

function refresh(): void {
  syncMetaInputs();
  draw();
  updateValidation();
  updateAscii();
  updateCellPanel();
  updateZoneList();
  updateThemePreview();
}

function draw(): void {
  const w = map.width * CELL + panX * 2;
  const h = map.height * CELL + panY * 2;
  canvas.width = w;
  canvas.height = h;
  ctx.fillStyle = "#0a0908";
  ctx.fillRect(0, 0, w, h);

  for (const z of map.encounterZones ?? []) {
    const loX = Math.min(z.x1, z.x2);
    const hiX = Math.max(z.x1, z.x2);
    const loY = Math.min(z.y1, z.y2);
    const hiY = Math.max(z.y1, z.y2);
    const alpha = z.rateMul === 0 ? 0.15 : Math.min(0.45, 0.15 + z.rateMul * 0.12);
    ctx.fillStyle = z.rateMul === 0 ? `rgba(40,160,80,${alpha})` : `rgba(200,80,40,${alpha})`;
    ctx.fillRect(
      panX + loX * CELL,
      panY + loY * CELL,
      (hiX - loX + 1) * CELL,
      (hiY - loY + 1) * CELL
    );
  }

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const px = panX + x * CELL;
      const py = panY + y * CELL;
      const cell = map.grid[y][x];
      ctx.fillStyle = cellIsPassable(cell) ? "#1c2a1c" : "#141210";
      ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);

      const drawEdge = (
        dir: "n" | "e" | "s" | "w",
        x1: number,
        y1: number,
        x2: number,
        y2: number
      ) => {
        const e = cell[dir];
        ctx.strokeStyle = EDGE_COLORS[e];
        ctx.lineWidth = e === "wall" ? 3 : e === "open" ? 1 : 4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      };
      drawEdge("n", px, py, px + CELL, py);
      drawEdge("s", px, py + CELL, px + CELL, py + CELL);
      drawEdge("w", px, py, px, py + CELL);
      drawEdge("e", px + CELL, py, px + CELL, py + CELL);

      if (cell.tile) {
        const f = FEATURES.find((t) => t.tile === cell.tile);
        ctx.fillStyle = "#f0d080";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(f?.glyph ?? "?", px + CELL / 2, py + CELL / 2);
      }

      const spr = map.mapSprites?.find((s) => s.x === x && s.y === y);
      if (spr) {
        ctx.fillStyle = "#9ad0ff";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(SPRITE_GLYPH[spr.spriteId] ?? "*", px + CELL / 2 + 8, py + CELL / 2 + 8);
      }

      if (x === map.startX && y === map.startY) {
        ctx.fillStyle = "#6f6";
        ctx.font = "bold 12px monospace";
        ctx.fillText("@", px + CELL / 2, py + CELL / 2 - 10);
      }

      if (selected && selected.x === x && selected.y === y) {
        ctx.strokeStyle = "#e0a458";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
      }
    }
  }

  ctx.fillStyle = "#666";
  ctx.font = "10px monospace";
  for (let x = 0; x < map.width; x++) {
    ctx.fillText(String(x % 10), panX + x * CELL + CELL / 2 - 3, panY - 4);
  }
  for (let y = 0; y < map.height; y++) {
    ctx.fillText(String(y), panX - 14, panY + y * CELL + CELL / 2 + 3);
  }
}

function updateValidation(): void {
  const issues = validateFloorMap(map);
  const ul = document.getElementById("validation-list")!;
  ul.innerHTML = "";
  if (!issues.length) {
    ul.innerHTML = '<li class="ok">No issues</li>';
    return;
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const head = document.createElement("li");
  head.className = errors ? "error" : "warning";
  head.textContent = `${errors} error(s), ${warnings} warning(s)`;
  ul.appendChild(head);
  for (const i of issues) {
    const li = document.createElement("li");
    li.className = i.severity;
    li.textContent = `[${i.code}] ${i.message}`;
    ul.appendChild(li);
  }
}

function updateZoneList(): void {
  const ul = document.getElementById("zone-list")!;
  ul.innerHTML = "";
  const zones = map.encounterZones ?? [];
  if (!zones.length) {
    ul.innerHTML = '<li class="muted">None</li>';
    return;
  }
  for (const z of zones) {
    const li = document.createElement("li");
    li.innerHTML = `${z.id} (${z.x1},${z.y1})-(${z.x2},${z.y2}) ×${z.rateMul}${
      z.tableFloorId ? ` T${z.tableFloorId}` : ""
    } <button type="button" data-zid="${z.id}">✕</button>`;
    li.querySelector("button")!.onclick = () => {
      pushHistory();
      map.encounterZones = (map.encounterZones ?? []).filter((x) => x.id !== z.id);
      refresh();
    };
    ul.appendChild(li);
  }
}

function updateAscii(): void {
  document.getElementById("ascii-preview")!.textContent = floorToAscii(map);
}

function updateThemePreview(): void {
  const wrap = document.getElementById("theme-preview")!;
  const theme = currentTheme();
  const slots = ["wall", "floorA", "floorB", "ceiling"];
  wrap.innerHTML = slots
    .map(
      (s) =>
        `<img src="${BASE}assets/tilesets/${theme}/${s}.png" alt="${s}" title="${theme}/${s}" onerror="this.style.opacity=0.2" />`
    )
    .join("");
}

function syncMetaInputs(): void {
  (document.getElementById("meta-name") as HTMLInputElement).value = map.name;
  (document.getElementById("meta-id") as HTMLInputElement).value = String(map.id);
  (document.getElementById("meta-width") as HTMLInputElement).value = String(map.width);
  (document.getElementById("meta-height") as HTMLInputElement).value = String(map.height);
  (document.getElementById("meta-start-x") as HTMLInputElement).value = String(map.startX);
  (document.getElementById("meta-start-y") as HTMLInputElement).value = String(map.startY);
  (document.getElementById("meta-encounter") as HTMLInputElement).value = String(
    map.encounterRate
  );
  const theme = map.tilesetTheme ?? `f${map.id}`;
  const sel = document.getElementById("meta-theme") as HTMLSelectElement;
  const customWrap = document.getElementById("meta-theme-custom-wrap")!;
  if (theme === "f1" || theme === "f2" || theme === "f3") {
    sel.value = theme;
    customWrap.classList.add("hidden");
  } else {
    sel.value = "custom";
    customWrap.classList.remove("hidden");
    (document.getElementById("meta-theme-custom") as HTMLInputElement).value = theme;
  }
}

function readMetaInputs(): void {
  map.name = (document.getElementById("meta-name") as HTMLInputElement).value || "Untitled";
  map.id = Number((document.getElementById("meta-id") as HTMLInputElement).value) || 1;
  map.startX = Number((document.getElementById("meta-start-x") as HTMLInputElement).value) || 0;
  map.startY = Number((document.getElementById("meta-start-y") as HTMLInputElement).value) || 0;
  map.encounterRate =
    Number((document.getElementById("meta-encounter") as HTMLInputElement).value) || 0.08;
  const sel = document.getElementById("meta-theme") as HTMLSelectElement;
  if (sel.value === "custom") {
    map.tilesetTheme =
      (document.getElementById("meta-theme-custom") as HTMLInputElement).value.trim() ||
      `f${map.id}`;
  } else {
    map.tilesetTheme = sel.value;
  }
}

function resizeMap(newW: number, newH: number): void {
  // Overlays outside the new bounds are dropped (zones are clamped) so a
  // shrink can't leave dangling out-of-bounds definitions.
  const fits = (p: { x: number; y: number }) => p.x < newW && p.y < newH;
  const next = newFloorMapJSON(newW, newH, {
    id: map.id,
    name: map.name,
    startX: Math.min(map.startX, newW - 1),
    startY: Math.min(map.startY, newH - 1),
    encounterRate: map.encounterRate,
    tilesetTheme: map.tilesetTheme,
    lockedDoors: map.lockedDoors?.filter(fits),
    treasures: map.treasures?.filter(fits),
    waters: map.waters?.filter(fits),
    npcs: map.npcs?.filter(fits),
    events: map.events?.filter(fits),
    teleporters: map.teleporters?.filter(fits),
    chuteDrops: map.chuteDrops?.filter(fits),
    encounterZones: map.encounterZones
      ?.filter((z) => Math.min(z.x1, z.x2) < newW && Math.min(z.y1, z.y2) < newH)
      .map((z) => ({
        ...z,
        x1: Math.min(z.x1, newW - 1),
        x2: Math.min(z.x2, newW - 1),
        y1: Math.min(z.y1, newH - 1),
        y2: Math.min(z.y2, newH - 1),
      })),
    mapSprites: map.mapSprites?.filter(fits),
  });
  for (let y = 0; y < Math.min(map.height, newH); y++) {
    for (let x = 0; x < Math.min(map.width, newW); x++) {
      next.grid[y][x] = { ...map.grid[y][x] };
    }
  }
  map = next;
}

function itemSelectHtml(
  selectedIds: string[],
  opts?: { multi?: boolean; id?: string }
): string {
  const id = opts?.id ?? "panel-item";
  if (opts?.multi) {
    return `<select id="${id}" multiple size="6">${ITEM_OPTIONS.map(
      (i) =>
        `<option value="${i.id}" ${selectedIds.includes(i.id) ? "selected" : ""}>${i.name}</option>`
    ).join("")}</select>`;
  }
  const sel = selectedIds[0] ?? "";
  return `<select id="${id}">${ITEM_OPTIONS.map(
    (i) =>
      `<option value="${i.id}" ${i.id === sel ? "selected" : ""}>${i.name} (${i.id})</option>`
  ).join("")}</select>`;
}

function enemySelectHtml(selectedIds: string[]): string {
  return `<select id="npc-enemies" multiple size="5">${ENEMY_OPTIONS.map(
    (e) =>
      `<option value="${e.id}" ${selectedIds.includes(e.id) ? "selected" : ""}>${e.name}</option>`
  ).join("")}</select>`;
}

function defaultNpcAt(x: number, y: number): NPCDef {
  return {
    id: `npc-${x}-${y}`,
    name: "Wanderer",
    title: "stranger",
    x,
    y,
    greeting: "Hello, traveler.",
    returnGreeting: "You again.",
    topics: [{ key: "rumor", response: "I have heard nothing new." }],
    combatEnemyIds: ["skeleton"],
  };
}

function updateCellPanel(): void {
  const panel = document.getElementById("cell-panel")!;
  const coords = document.getElementById("cell-coords")!;
  if (!selected) {
    coords.textContent = "—";
    panel.innerHTML = '<span class="muted">Click a cell</span>';
    return;
  }
  const { x, y } = selected;
  coords.textContent = `(${x}, ${y})`;
  const cell = map.grid[y][x];
  let html = `<div>n=${cell.n} e=${cell.e} s=${cell.s} w=${cell.w}</div>`;

  const event = map.events?.find((e) => e.x === x && e.y === y);
  const treasure = map.treasures?.find((t) => t.x === x && t.y === y);
  const water = map.waters?.find((w) => w.x === x && w.y === y);
  const locks = (map.lockedDoors ?? []).filter((d) => d.x === x && d.y === y);
  const tele = map.teleporters?.find((t) => t.x === x && t.y === y);
  const chute = map.chuteDrops?.find((c) => c.x === x && c.y === y);
  const npc = map.npcs?.find((n) => n.x === x && n.y === y);
  const sprite = map.mapSprites?.find((s) => s.x === x && s.y === y);

  if (event || cell.tile === "event") {
    const ev = event ?? {
      x,
      y,
      kind: "message" as const,
      message: "",
      once: true,
    };
    html += `<div class="overlay-row"><strong>Event</strong>
      <label>Kind <select id="ev-kind">
        ${(["message", "damage", "heal", "reward"] as const)
          .map((k) => `<option value="${k}" ${ev.kind === k ? "selected" : ""}>${k}</option>`)
          .join("")}
      </select></label>
      <label>Message <textarea id="ev-msg">${ev.message ?? ""}</textarea></label>
      <label>Power <input type="number" id="ev-power" value="${ev.power ?? 0}" /></label>
      <label>Item ${itemSelectHtml([ev.itemId ?? "healing-potion"], { id: "ev-item" })}</label>
      <label><input type="checkbox" id="ev-once" ${ev.once !== false ? "checked" : ""}/> Once</label>
      <button type="button" id="ev-save">Save event</button>
    </div>`;
  }

  if (treasure || cell.tile === "treasure") {
    const t = treasure ?? { x, y, itemIds: ["healing-potion"] as string[] };
    html += `<div class="overlay-row"><strong>Treasure</strong>
      ${itemSelectHtml(t.itemIds, { multi: true, id: "panel-items" })}
      <label>Trap <select id="tr-trap">${TRAPS.map(
        (tr) =>
          `<option value="${tr}" ${t.trap === tr || (!t.trap && tr === "") ? "selected" : ""}>${
            tr || "(none)"
          }</option>`
      ).join("")}</select></label>
      <button type="button" id="tr-save">Save treasure</button>
    </div>`;
  }

  if (water || cell.tile === "water") {
    const wdef = water ?? { x, y, depth: 1 as const };
    const effKind = wdef.effect?.kind ?? "";
    const effPower = wdef.effect && "power" in wdef.effect ? wdef.effect.power : 4;
    html += `<div class="overlay-row"><strong>Water</strong>
      <label>Depth <input type="number" id="wa-depth" min="1" max="4" value="${wdef.depth}" /></label>
      <label>Effect <select id="wa-effect">
        ${["", "heal", "damage", "cure"]
          .map(
            (k) =>
              `<option value="${k}" ${effKind === k ? "selected" : ""}>${k || "(none)"}</option>`
          )
          .join("")}
      </select></label>
      <label>Power <input type="number" id="wa-power" min="1" value="${effPower}" /></label>
      <button type="button" id="wa-save">Save water</button>
    </div>`;
  }

  if (locks.length) {
    const keyList = `<datalist id="key-ids">${keyIdCandidates()
      .map((k) => `<option value="${k}"></option>`)
      .join("")}</datalist>`;
    html += locks
      .map(
        (lock, i) => `<div class="overlay-row"><strong>Lock ${lock.dir}</strong>
      <label>Key id <input type="text" id="lk-key-${i}" list="key-ids" value="${lock.keyId}" /></label>
      <button type="button" id="lk-save-${i}">Save lock</button>
    </div>`
      )
      .join("");
    html += keyList;
  }

  if (tele || cell.tile === "teleporter") {
    const t = tele ?? { x, y, toFloorId: map.id, toX: x, toY: y };
    html += `<div class="overlay-row"><strong>Teleporter</strong>
      <label>toFloor <input type="number" id="tp-floor" value="${t.toFloorId}" /></label>
      <label>toX <input type="number" id="tp-x" value="${t.toX}" /></label>
      <label>toY <input type="number" id="tp-y" value="${t.toY}" /></label>
      <button type="button" id="tp-save">Save teleporter</button>
    </div>`;
  }

  if (chute || cell.tile === "chute") {
    const c = chute ?? { x, y, toFloorId: map.id + 1, toX: 0, toY: 0 };
    html += `<div class="overlay-row"><strong>Chute</strong>
      <label>toFloor <input type="number" id="ch-floor" value="${c.toFloorId}" /></label>
      <label>toX <input type="number" id="ch-x" value="${c.toX}" /></label>
      <label>toY <input type="number" id="ch-y" value="${c.toY}" /></label>
      <button type="button" id="ch-save">Save chute</button>
    </div>`;
  }

  if (npc || cell.tile === "npc") {
    const n = npc ?? defaultNpcAt(x, y);
    html += `<div class="overlay-row"><strong>NPC</strong>
      <label>Id <input type="text" id="npc-id" value="${n.id}" /></label>
      <label>Name <input type="text" id="npc-name" value="${n.name}" /></label>
      <label>Title <input type="text" id="npc-title" value="${n.title}" /></label>
      <label>Greeting <textarea id="npc-greet">${n.greeting}</textarea></label>
      <label>Return <textarea id="npc-return">${n.returnGreeting}</textarea></label>
      <label>Combat foes ${enemySelectHtml(n.combatEnemyIds)}</label>
      <button type="button" id="npc-save">Save NPC</button>
      <details><summary>Advanced (topics / trades / gifts as JSON)</summary>
        <textarea id="npc-json" rows="8">${JSON.stringify(n, null, 2)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</textarea>
        <button type="button" id="npc-json-save">Save JSON</button>
      </details>
    </div>`;
  }

  if (sprite) {
    html += `<div class="overlay-row"><strong>Sprite</strong> ${sprite.spriteId}
      <button type="button" id="spr-remove">Remove sprite</button>
    </div>`;
  }

  html += `<button type="button" id="btn-add-treasure">+ Treasure</button>
    <button type="button" id="btn-add-water">+ Water</button>
    <button type="button" id="btn-add-event">+ Event</button>
    <button type="button" id="btn-add-npc">+ NPC</button>`;
  panel.innerHTML = html;

  wirePanelHandlers(x, y);
}

function wirePanelHandlers(x: number, y: number): void {
  document.getElementById("btn-add-treasure")!.onclick = () => {
    pushHistory();
    map.grid[y][x].tile = "treasure";
    if (!map.treasures) map.treasures = [];
    if (!map.treasures.some((t) => t.x === x && t.y === y)) {
      map.treasures.push({ x, y, itemIds: ["healing-potion"] });
    }
    refresh();
  };
  document.getElementById("btn-add-water")!.onclick = () => {
    pushHistory();
    map.grid[y][x].tile = "water";
    if (!map.waters) map.waters = [];
    if (!map.waters.some((w) => w.x === x && w.y === y)) {
      map.waters.push({ x, y, depth: 1 });
    }
    refresh();
  };
  document.getElementById("btn-add-event")!.onclick = () => {
    pushHistory();
    placeEvent(x, y, pendingEventTemplate ?? EVENT_TEMPLATES[0]!.def);
    refresh();
  };
  document.getElementById("btn-add-npc")!.onclick = () => {
    pushHistory();
    ensureNpc(x, y);
    refresh();
  };

  const evSave = document.getElementById("ev-save");
  if (evSave) {
    evSave.onclick = () => {
      pushHistory();
      const kind = (document.getElementById("ev-kind") as HTMLSelectElement).value as EventDef["kind"];
      const message = (document.getElementById("ev-msg") as HTMLTextAreaElement).value;
      const power = Number((document.getElementById("ev-power") as HTMLInputElement).value);
      const itemId = (document.getElementById("ev-item") as HTMLSelectElement)?.value;
      const once = (document.getElementById("ev-once") as HTMLInputElement).checked;
      map.grid[y][x].tile = "event";
      if (!map.events) map.events = [];
      map.events = map.events.filter((e) => !(e.x === x && e.y === y));
      const row: EventDef = { x, y, kind, message, once };
      if (kind === "damage" || kind === "heal") row.power = power;
      if (kind === "reward") row.itemId = itemId;
      map.events.push(row);
      refresh();
    };
  }

  const trSave = document.getElementById("tr-save");
  if (trSave) {
    trSave.onclick = () => {
      pushHistory();
      const sel = document.getElementById("panel-items") as HTMLSelectElement;
      const itemIds = [...sel.selectedOptions].map((o) => o.value);
      const trapVal = (document.getElementById("tr-trap") as HTMLSelectElement).value as TrapType | "";
      map.grid[y][x].tile = "treasure";
      if (!map.treasures) map.treasures = [];
      map.treasures = map.treasures.filter((t) => !(t.x === x && t.y === y));
      map.treasures.push({
        x,
        y,
        itemIds: itemIds.length ? itemIds : ["healing-potion"],
        trap: trapVal || undefined,
      });
      refresh();
    };
  }

  const waSave = document.getElementById("wa-save");
  if (waSave) {
    waSave.onclick = () => {
      pushHistory();
      const depth = Math.min(
        4,
        Math.max(1, Number((document.getElementById("wa-depth") as HTMLInputElement).value))
      ) as 1 | 2 | 3 | 4;
      const effKind = (document.getElementById("wa-effect") as HTMLSelectElement).value;
      const effPower = Math.max(
        1,
        Number((document.getElementById("wa-power") as HTMLInputElement).value) || 1
      );
      map.grid[y][x].tile = "water";
      if (!map.waters) map.waters = [];
      map.waters = map.waters.filter((w) => !(w.x === x && w.y === y));
      const wdef: WaterDef = { x, y, depth };
      if (effKind === "heal" || effKind === "damage") {
        wdef.effect = { kind: effKind, power: effPower };
      } else if (effKind === "cure") {
        wdef.effect = { kind: "cure", status: "poison" };
      }
      map.waters.push(wdef);
      refresh();
    };
  }

  const locksAtCell = (map.lockedDoors ?? []).filter((d) => d.x === x && d.y === y);
  locksAtCell.forEach((lock, i) => {
    const btn = document.getElementById(`lk-save-${i}`);
    if (!btn) return;
    btn.onclick = () => {
      pushHistory();
      const keyId = (document.getElementById(`lk-key-${i}`) as HTMLInputElement).value.trim();
      if (keyId) lock.keyId = keyId;
      refresh();
    };
  });

  const tpSave = document.getElementById("tp-save");
  if (tpSave) {
    tpSave.onclick = () => {
      pushHistory();
      map.grid[y][x].tile = "teleporter";
      if (!map.teleporters) map.teleporters = [];
      map.teleporters = map.teleporters.filter((t) => !(t.x === x && t.y === y));
      map.teleporters.push({
        x,
        y,
        toFloorId: Number((document.getElementById("tp-floor") as HTMLInputElement).value),
        toX: Number((document.getElementById("tp-x") as HTMLInputElement).value),
        toY: Number((document.getElementById("tp-y") as HTMLInputElement).value),
      });
      refresh();
    };
  }

  const chSave = document.getElementById("ch-save");
  if (chSave) {
    chSave.onclick = () => {
      pushHistory();
      map.grid[y][x].tile = "chute";
      if (!map.chuteDrops) map.chuteDrops = [];
      map.chuteDrops = map.chuteDrops.filter((c) => !(c.x === x && c.y === y));
      map.chuteDrops.push({
        x,
        y,
        toFloorId: Number((document.getElementById("ch-floor") as HTMLInputElement).value),
        toX: Number((document.getElementById("ch-x") as HTMLInputElement).value),
        toY: Number((document.getElementById("ch-y") as HTMLInputElement).value),
      });
      refresh();
    };
  }

  const npcSave = document.getElementById("npc-save");
  if (npcSave) {
    npcSave.onclick = () => {
      pushHistory();
      map.grid[y][x].tile = "npc";
      if (!map.npcs) map.npcs = [];
      // Preserve fields the quick form doesn't edit (topics, trades, gifts).
      const existing = map.npcs.find((n) => n.x === x && n.y === y);
      map.npcs = map.npcs.filter((n) => !(n.x === x && n.y === y));
      const enemies = document.getElementById("npc-enemies") as HTMLSelectElement;
      const combatEnemyIds = [...enemies.selectedOptions].map((o) => o.value);
      map.npcs.push({
        ...(existing ?? defaultNpcAt(x, y)),
        id: (document.getElementById("npc-id") as HTMLInputElement).value.trim() || `npc-${x}-${y}`,
        name: (document.getElementById("npc-name") as HTMLInputElement).value.trim() || "Wanderer",
        title: (document.getElementById("npc-title") as HTMLInputElement).value.trim() || "stranger",
        x,
        y,
        greeting: (document.getElementById("npc-greet") as HTMLTextAreaElement).value,
        returnGreeting: (document.getElementById("npc-return") as HTMLTextAreaElement).value,
        combatEnemyIds: combatEnemyIds.length ? combatEnemyIds : ["skeleton"],
      });
      refresh();
    };
  }

  const npcJsonSave = document.getElementById("npc-json-save");
  if (npcJsonSave) {
    npcJsonSave.onclick = () => {
      try {
        const parsed = parseNpcJSON(
          JSON.parse((document.getElementById("npc-json") as HTMLTextAreaElement).value)
        );
        pushHistory();
        map.grid[y][x].tile = "npc";
        if (!map.npcs) map.npcs = [];
        map.npcs = map.npcs.filter((n) => !(n.x === x && n.y === y));
        map.npcs.push({ ...parsed, x, y });
        refresh();
      } catch (err) {
        alert(`Invalid NPC JSON: ${err}`);
      }
    };
  }

  const sprRemove = document.getElementById("spr-remove");
  if (sprRemove) {
    sprRemove.onclick = () => {
      pushHistory();
      map.mapSprites = map.mapSprites?.filter((s) => !(s.x === x && s.y === y));
      refresh();
    };
  }
}

function ensureNpc(x: number, y: number): void {
  map.grid[y][x].tile = "npc";
  if (!map.npcs) map.npcs = [];
  if (!map.npcs.some((n) => n.x === x && n.y === y)) {
    map.npcs.push(defaultNpcAt(x, y));
  }
}

function placeSprite(x: number, y: number, spriteId: string): void {
  if (!map.mapSprites) map.mapSprites = [];
  map.mapSprites = map.mapSprites.filter((s) => !(s.x === x && s.y === y));
  map.mapSprites.push({ x, y, spriteId });
}

function placeEvent(x: number, y: number, def: Omit<EventDef, "x" | "y">): void {
  map.grid[y][x].tile = "event";
  if (!map.events) map.events = [];
  map.events = map.events.filter((e) => !(e.x === x && e.y === y));
  map.events.push({ ...def, x, y });
}

function applyRoom(x1: number, y1: number, x2: number, y2: number): void {
  const floor = mapToFloorDef(map);
  carveRoom(floor.grid, x1, y1, x2, y2);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const c = floor.grid[y][x];
      map.grid[y][x] = {
        n: c.n,
        e: c.e,
        s: c.s,
        w: c.w,
        tile: map.grid[y][x].tile,
      };
    }
  }
}

function applyZone(x1: number, y1: number, x2: number, y2: number): void {
  const rateMul = Number((document.getElementById("zone-rate") as HTMLInputElement).value);
  const tableRaw = (document.getElementById("zone-table") as HTMLInputElement).value;
  const tableFloorId = tableRaw === "" ? undefined : Number(tableRaw);
  if (!map.encounterZones) map.encounterZones = [];
  // Unique id even after deletions (length+1 could collide).
  let zn = map.encounterZones.length + 1;
  while (map.encounterZones.some((z) => z.id === `z${zn}`)) zn++;
  const zone: EncounterZoneDef = {
    id: `z${zn}`,
    x1,
    y1,
    x2,
    y2,
    rateMul: Number.isFinite(rateMul) ? rateMul : 1,
    tableFloorId: Number.isFinite(tableFloorId as number) ? tableFloorId : undefined,
  };
  map.encounterZones.push(zone);
}

function onPointerDown(e: PointerEvent): void {
  if (e.button === 2) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const cell = cellAtCanvas(mx, my);
  if (!cell) return;
  selected = cell;
  const lx = mx - panX - cell.x * CELL;
  const ly = my - panY - cell.y * CELL;
  const zoneHit = edgeAtCell(cell.x, cell.y, lx, ly);

  if (tool === "room" || tool === "zone") {
    dragStart = cell;
  } else if (tool === "edge" && zoneHit !== "center") {
    pushHistory();
    const previous = map.grid[cell.y][cell.x][zoneHit];
    setEdgeSymmetric(cell.x, cell.y, zoneHit, edgeMode);
    if (previous === "locked" && edgeMode !== "locked") {
      removeLockEntries(cell.x, cell.y, zoneHit);
    }
    if (edgeMode === "locked" && !hasLockEntry(cell.x, cell.y, zoneHit)) {
      // Default key id — pick the real key in the cell inspector (Select tool).
      map.lockedDoors = map.lockedDoors ?? [];
      map.lockedDoors.push({ x: cell.x, y: cell.y, dir: zoneHit, keyId: "brass-key" });
    }
    refresh();
  } else if (tool === "feature" && zoneHit === "center") {
    pushHistory();
    map.grid[cell.y][cell.x].tile = featureTile;
    if (featureTile === "npc") ensureNpc(cell.x, cell.y);
    refresh();
  } else if (tool === "event" && zoneHit === "center") {
    pushHistory();
    placeEvent(cell.x, cell.y, pendingEventTemplate ?? EVENT_TEMPLATES[0]!.def);
    refresh();
  } else if (tool === "sprite" && zoneHit === "center") {
    pushHistory();
    placeSprite(cell.x, cell.y, pendingSpriteId);
    refresh();
  } else if (tool === "start" && zoneHit === "center") {
    pushHistory();
    map.startX = cell.x;
    map.startY = cell.y;
    refresh();
  } else if (tool === "erase" && zoneHit === "center") {
    pushHistory();
    delete map.grid[cell.y][cell.x].tile;
    // Locked edges on this cell: drop their lockedDoors entries (both sides)
    // and downgrade the edge to a plain door so no orphaned lock remains.
    for (const dir of ["n", "e", "s", "w"] as const) {
      if (map.grid[cell.y][cell.x][dir] === "locked") {
        removeLockEntries(cell.x, cell.y, dir);
        setEdgeSymmetric(cell.x, cell.y, dir, "door");
      }
    }
    map.treasures = map.treasures?.filter((t) => !(t.x === cell.x && t.y === cell.y));
    map.waters = map.waters?.filter((w) => !(w.x === cell.x && w.y === cell.y));
    map.events = map.events?.filter((ev) => !(ev.x === cell.x && ev.y === cell.y));
    map.npcs = map.npcs?.filter((n) => !(n.x === cell.x && n.y === cell.y));
    map.teleporters = map.teleporters?.filter((t) => !(t.x === cell.x && t.y === cell.y));
    map.chuteDrops = map.chuteDrops?.filter((c) => !(c.x === cell.x && c.y === cell.y));
    map.mapSprites = map.mapSprites?.filter((s) => !(s.x === cell.x && s.y === cell.y));
    refresh();
  } else {
    refresh();
  }
}

function onPointerUp(e: PointerEvent): void {
  if (!dragStart) return;
  const rect = canvas.getBoundingClientRect();
  const cell = cellAtCanvas(e.clientX - rect.left, e.clientY - rect.top);
  if (cell) {
    pushHistory();
    if (tool === "room") applyRoom(dragStart.x, dragStart.y, cell.x, cell.y);
    if (tool === "zone") applyZone(dragStart.x, dragStart.y, cell.x, cell.y);
  }
  dragStart = null;
  refresh();
}

const TOOLS: { id: Tool; label: string }[] = [
  { id: "room", label: "Room" },
  { id: "edge", label: "Edge" },
  { id: "feature", label: "Feature" },
  { id: "event", label: "Event" },
  { id: "sprite", label: "Sprite" },
  { id: "zone", label: "Zone" },
  { id: "start", label: "Start" },
  { id: "erase", label: "Erase" },
  { id: "select", label: "Select" },
];

function buildToolButtons(): void {
  const wrap = document.getElementById("tool-buttons")!;
  wrap.innerHTML = "";
  for (const t of TOOLS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t.label;
    b.classList.toggle("active", tool === t.id);
    b.onclick = () => {
      tool = t.id;
      buildToolButtons();
    };
    wrap.appendChild(b);
  }
}

function buildEdgeModes(): void {
  const wrap = document.getElementById("edge-modes")!;
  wrap.innerHTML = "";
  for (const mode of ["open", "wall", "door", "locked"] as EdgeType[]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = mode;
    b.classList.toggle("active", edgeMode === mode);
    b.onclick = () => {
      edgeMode = mode;
      tool = "edge";
      buildEdgeModes();
      buildToolButtons();
    };
    wrap.appendChild(b);
  }
}

function buildFeatureButtons(): void {
  const wrap = document.getElementById("feature-buttons")!;
  wrap.innerHTML = "";
  for (const f of FEATURES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${f.glyph} ${f.label}`;
    b.classList.toggle("active", featureTile === f.tile && tool === "feature");
    b.onclick = () => {
      featureTile = f.tile;
      tool = "feature";
      buildFeatureButtons();
      buildToolButtons();
    };
    wrap.appendChild(b);
  }
}

function buildEventTemplates(): void {
  const wrap = document.getElementById("event-templates")!;
  wrap.innerHTML = "";
  for (const t of EVENT_TEMPLATES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t.label;
    b.onclick = () => {
      pendingEventTemplate = t.def;
      tool = "event";
      buildToolButtons();
    };
    wrap.appendChild(b);
  }
}

function buildSpriteButtons(): void {
  const wrap = document.getElementById("sprite-buttons")!;
  wrap.innerHTML = "";
  for (const s of MAP_SPRITES) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${SPRITE_GLYPH[s.id] ?? "*"} ${s.name}`;
    b.classList.toggle("active", pendingSpriteId === s.id && tool === "sprite");
    b.onclick = () => {
      pendingSpriteId = s.id;
      tool = "sprite";
      buildSpriteButtons();
      buildToolButtons();
    };
    wrap.appendChild(b);
  }
}

function playtestFloor(): void {
  readMetaInputs();
  const errors = validateFloorMap(map).filter((i) => i.severity === "error");
  if (errors.length) {
    alert(`${errors.length} validation error(s) — fix before playtest`);
    updateValidation();
    return;
  }
  localStorage.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(map));
  const url = `${BASE}?playtestFloor=1`;
  window.open(url, "_blank");
}

document.getElementById("btn-new")!.addEventListener("click", () => {
  if (!confirm("Discard current map?")) return;
  pushHistory();
  map = newFloorMapJSON(16, 16, { tilesetTheme: "f1" });
  refresh();
});

document.getElementById("btn-import")!.addEventListener("click", () => {
  (document.getElementById("file-import") as HTMLInputElement).click();
});

document.getElementById("file-import")!.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const parsed = parseFloorMapJSON(JSON.parse(await file.text()));
    pushHistory();
    map = parsed;
    refresh();
  } catch (err) {
    alert(String(err));
  }
});

document.getElementById("btn-export")!.addEventListener("click", () => {
  readMetaInputs();
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `floor-${map.id}-${map.name.replace(/\s+/g, "-").toLowerCase()}.json`;
  a.click();
});

document.getElementById("btn-validate")!.addEventListener("click", () => {
  readMetaInputs();
  updateValidation();
  const errors = validateFloorMap(map).filter((i) => i.severity === "error").length;
  alert(errors ? `${errors} error(s) — see panel` : "Validation passed");
});

document.getElementById("btn-resize")!.addEventListener("click", () => {
  readMetaInputs();
  const w = Number((document.getElementById("meta-width") as HTMLInputElement).value);
  const h = Number((document.getElementById("meta-height") as HTMLInputElement).value);
  if (w < 3 || h < 3) {
    alert("Min size 3×3");
    return;
  }
  pushHistory();
  resizeMap(w, h);
  refresh();
});

document.getElementById("load-campaign")!.addEventListener("change", async (e) => {
  const id = (e.target as HTMLSelectElement).value;
  if (!id) return;
  try {
    const url = `${BASE}tools/floor-data/floor-${id}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const parsed = parseFloorMapJSON(await res.json());
    pushHistory();
    map = parsed;
    refresh();
  } catch (err) {
    alert(`Load failed — run: npm run floor:export-all && copy to public/tools/\n\n${err}`);
  }
  (e.target as HTMLSelectElement).value = "";
});

document.getElementById("meta-theme")!.addEventListener("change", () => {
  readMetaInputs();
  refresh();
});

["meta-name", "meta-id", "meta-start-x", "meta-start-y", "meta-encounter", "meta-theme-custom"].forEach(
  (id) => {
    document.getElementById(id)!.addEventListener("change", () => {
      readMetaInputs();
      refresh();
    });
  }
);

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
    return; // don't steal Ctrl+Z from form fields
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
  }
});

buildToolButtons();
buildEdgeModes();
buildFeatureButtons();
buildEventTemplates();
buildSpriteButtons();
document.getElementById("btn-playtest")!.addEventListener("click", playtestFloor);
refresh();
