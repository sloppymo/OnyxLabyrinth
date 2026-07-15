/**
 * Dungeon HUD Preview — a standalone test page for iterating on the dungeon
 * shell chrome (viewport frame, party status strip, hint bar, message
 * overlay, map toggle) without playing through title → party creation →
 * town → dungeon every time.
 *
 * Uses the real shell.ts + renderer.ts + a real GameState/floor, so what you
 * see here is exactly what ships — just reachable in one click with sliders
 * for HP/SP/status instead of taking damage in combat.
 *
 * Open: http://localhost:5176/OnyxLabyrinth/dungeon-hud-preview.html
 */
import { createGameState } from "../game/state";
import { getFloors } from "../game/floor-registry";
import { createDefaultParty, type Character, type StatusEffect } from "../game/party";
import { loadTextures, render } from "../engine/renderer";
import { renderPartyStrip, setMessage, showMode, compassForFacing, ctx } from "../engine/shell";
import type { GameState, Facing } from "../types";

const floor = getFloors()[0]!;
const state: GameState = createGameState(floor);
state.party = createDefaultParty();
state.mode = "dungeon";

const STATUS_OPTIONS: StatusEffect[] = ["poison", "sleep", "paralysis", "blind", "wet", "knockedOut"];
const COMPASS_DIRS = ["N", "E", "S", "W"];
let facing = 0;

function redrawHud(): void {
  renderPartyStrip(state.party, compassForFacing(facing));
}

function redrawScene(): void {
  render(ctx, state);
}

showMode("dungeon", false);
loadTextures()
  .then(redrawScene)
  .catch(redrawScene);

// --- Compass buttons -----------------------------------------------------

const compassButtonsEl = document.getElementById("compass-buttons")!;
COMPASS_DIRS.forEach((dir, i) => {
  const btn = document.createElement("button");
  btn.textContent = dir;
  if (i === facing) btn.classList.add("active");
  btn.addEventListener("click", () => {
    facing = i;
    state.player.facing = i as Facing;
    compassButtonsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    redrawHud();
    redrawScene();
  });
  compassButtonsEl.appendChild(btn);
});

// --- Message input ---------------------------------------------------------

const messageInput = document.getElementById("message-input") as HTMLInputElement;
messageInput.addEventListener("input", () => setMessage(messageInput.value));

// --- Map toggle --------------------------------------------------------------

let mapVisible = false;
document.getElementById("btn-map")!.addEventListener("click", (e) => {
  mapVisible = !mapVisible;
  (e.target as HTMLButtonElement).classList.toggle("active", mapVisible);
  showMode("dungeon", mapVisible);
  redrawScene();
});

// --- Party controls ----------------------------------------------------------

const partyControlsEl = document.getElementById("party-controls")!;

function buildCharBlock(c: Character): HTMLDivElement {
  const block = document.createElement("div");
  block.className = "char-block";

  const nameEl = document.createElement("div");
  nameEl.className = "name";
  nameEl.textContent = `${c.name} — ${c.class}`;
  block.appendChild(nameEl);

  block.appendChild(makeSlider("HP", 0, c.maxHp, c.hp, (v) => {
    c.hp = v;
    redrawHud();
  }));

  if (c.maxSp > 0) {
    block.appendChild(makeSlider("SP", 0, c.maxSp, c.sp, (v) => {
      c.sp = v;
      redrawHud();
    }));
  }

  const statusesEl = document.createElement("div");
  statusesEl.className = "statuses";
  for (const status of STATUS_OPTIONS) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = c.status.includes(status);
    cb.addEventListener("change", () => {
      c.status = cb.checked
        ? [...c.status.filter((s) => s !== status), status]
        : c.status.filter((s) => s !== status);
      redrawHud();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(status));
    statusesEl.appendChild(label);
  }
  block.appendChild(statusesEl);

  return block;
}

function makeSlider(
  label: string,
  min: number,
  max: number,
  value: number,
  onChange: (v: number) => void
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "row";

  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  row.appendChild(input);

  const valEl = document.createElement("span");
  valEl.className = "val";
  valEl.textContent = `${value}/${max}`;
  row.appendChild(valEl);

  input.addEventListener("input", () => {
    const v = Number(input.value);
    valEl.textContent = `${v}/${max}`;
    onChange(v);
  });

  return row;
}

for (const c of state.party) {
  partyControlsEl.appendChild(buildCharBlock(c));
}

redrawHud();

// Resize the corridor canvas once the layout has settled (fonts/CSS applied).
requestAnimationFrame(() => {
  redrawScene();
});
window.addEventListener("resize", redrawScene);
