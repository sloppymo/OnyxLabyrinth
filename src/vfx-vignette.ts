/**
 * VFX Vignette — a standalone test page that auto-cycles through every
 * combat spell in the game so the full range of particle effects, additive
 * blending, wind-up charge glows, impact flashes, and screen shakes can be
 * visually verified in one place.
 *
 * Open: http://localhost:5176/OnyxLabyrinth/vfx-vignette.html
 * (or add --input vfx-vignette.html to the build for a static page)
 */
import { createScene, playTurn, updateScene, renderScene, resolveEffectStyle } from "./engine/combat-scene";
import { spellById, ALL_SPELLS, isUtilitySpell, type SpellDef } from "./data/spells";
import type { CombatState, EnemyFormation, EnemyInstance, CombatEvent } from "./game/combat";
import type { Character } from "./game/party";
import type { Row } from "./data/enemies";
import { loadPartySprites } from "./engine/party-sprite-cache";
import { loadEnemySprites } from "./engine/enemy-sprite-cache";
import { loadEffectSprites } from "./engine/effect-sprite-cache";
import {
  renderCombatWindows,
  menuEntriesForCharacter,
  type CombatWindowsView,
  type CombatWindowsHandlers,
} from "./engine/combat-select-action-view";

// --- Canvas setup --------------------------------------------------------------

const canvas = document.getElementById("vignette-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const W = canvas.width;
const H = canvas.height;

// --- Minimal fake combat state -------------------------------------------------
// We don't need real combat math — just enough data for the scene renderer to
// place sprites and resolve effect styles.

function makeCharacter(id: string, name: string, cls: Character["class"], slot: number): Character {
  return {
    id,
    name,
    race: "Human",
    alignment: "Neutral",
    class: cls,
    level: 12,
    xp: 0,
    stats: { str: 10, int: 18, pie: 18, vit: 10, agi: 10, luk: 10 },
    hp: 99,
    sp: 99,
    maxHp: 99,
    maxSp: 99,
    formationSlot: slot,
    status: [],
    knownSpellIds: [],
    perkIds: [],
  };
}

function makeEnemy(id: string, name: string, row: Row): EnemyInstance {
  return {
    id,
    name,
    floors: [],
    rowPreference: "any",
    hp: 999,
    attack: 1,
    ac: 10,
    agi: 10,
    xp: 0,
    gold: 0,
    special: [],
    isBoss: false,
    instanceId: id,
    currentHp: 999,
    row,
    status: [],
  };
}

const party: Character[] = [
  makeCharacter("mage-1", "Aria", "Mage", 0),
  makeCharacter("priest-1", "Fenn", "Priest", 1),
  makeCharacter("mage-2", "Eve", "Mage", 2),
  makeCharacter("priest-2", "Dell", "Priest", 3),
  makeCharacter("fighter-1", "Bram", "Fighter", 4),
  makeCharacter("thief-1", "Coda", "Thief", 5),
];

// Simulate varied party condition so the status bar looks like real gameplay.
party[1].hp = 45;
party[1].sp = 12;
party[2].status.push("poison");
party[2].sp = 88;
party[3].hp = 0;
party[3].status.push("knockedOut");
party[4].sp = 0;
party[5].status.push("hidden");

// Use real enemy IDs from the sprite manifest so actual sprite art loads.
const enemies: EnemyFormation = {
  front: [
    makeEnemy("skeleton", "Skeleton", "front"),
    makeEnemy("orc", "Orc", "front"),
  ],
  back: [
    makeEnemy("werewolf", "Werewolf", "back"),
  ],
};

const state: CombatState = {
  party,
  enemies,
  round: 1,
  isBoss: false,
  log: [],
  ended: false,
  goldEarned: 0,
  xpEarned: 0,
  silencedThisRound: [],
  defendBuff: {},
  armorBuffs: {},
  paralysisTimers: {},
  spells: {},
  items: {},
  loadout: {},
  inAntimagic: false,
  inventory: {},
  magicScreen: 0,
  partyFizzleField: 0,
  enemyFizzleFields: { front: 0, back: 0 },
  enemyMagicScreens: { front: 0, back: 0 },
  summonedAllies: [],
  justDied: [],
  justDiedAllies: [],
  events: [],
  perkState: {},
  rage: {},
  counterStances: {},
  tauntingIds: [],
  tauntBuffs: {},
  nextAttackBonuses: {},
  damageBuffs: {},
  enemyArmorDebuffs: {},
  enemyAgiDebuffs: {},
};

// --- Spell queue ---------------------------------------------------------------
// All non-utility spells, ordered by school then tier for a logical progression.

const VFX_SPELLS = ALL_SPELLS.filter((s) => !isUtilitySpell(s));

const NEW_SPELL_IDS = new Set([
  "mage-water-bolt",
  "mage-tidal-wave",
  "mage-deluge",
  "mage-stone-shard",
  "mage-rock-slide",
  "mage-quake",
  "mage-gust",
  "mage-cyclone",
  "mage-tempest",
]);

// Determine the right target for a spell based on its target type.
function pickTargetId(spell: SpellDef): string | null {
  switch (spell.target) {
    case "singleEnemy":
      return "skeleton";
    case "singleAlly":
      return "mage-1";
    case "groupEnemies":
    case "allEnemies":
      return "skeleton"; // The first target; the choreography handles area spread.
    case "groupAllies":
    case "allAllies":
      return "mage-1";
    case "self":
      return null;
    default:
      return "skeleton";
  }
}

// Determine the right caster based on spell class.
function pickCasterId(spell: SpellDef): string {
  return spell.class === "Priest" ? "priest-1" : "mage-1";
}

// Build the CombatEvent pair for a spell cast.
function makeSpellEvents(spell: SpellDef): CombatEvent[] {
  const casterId = pickCasterId(spell);
  const targetId = pickTargetId(spell);
  const events: CombatEvent[] = [];

  // The cast event triggers the wind-up + projectile + banner.
  events.push({
    type: "cast",
    actorId: casterId,
    spellId: spell.id,
    targetId,
  });

  // The spellEffect event triggers the burst/field + flash + shake.
  // For damage spells, include a fake damage value so the flash triggers.
  const eff = spell.effect;
  const isDamage = eff.kind === "damage";
  const isHeal = eff.kind === "heal";
  const isBuff = eff.kind === "buff" || eff.kind === "magicScreen";
  const isDisable = eff.kind === "disable";
  const isSummon = eff.kind === "summon";
  const isCure = eff.kind === "cure" || eff.kind === "resurrect";
  const isDispel = eff.kind === "fizzleField" || eff.kind === "dispelMagic";

  if (spell.target === "allEnemies" || spell.target === "groupEnemies") {
    // Area spell: one spellEffect per enemy.
    for (const e of [...enemies.front, ...enemies.back]) {
      events.push({
        type: "spellEffect",
        spellId: spell.id,
        targetId: e.instanceId,
        damage: isDamage ? 15 : undefined,
        heal: isHeal ? 10 : undefined,
        isBuff,
        isDebuff: isDisable || isDispel,
        statusInflicted: isDisable ? eff.kind === "disable" ? (eff as { status?: string }).status : undefined : undefined,
      });
    }
  } else if (spell.target === "allAllies" || spell.target === "groupAllies") {
    // Area heal/buff: one spellEffect per party member.
    for (const c of party) {
      events.push({
        type: "spellEffect",
        spellId: spell.id,
        targetId: c.id,
        damage: isDamage ? 15 : undefined,
        heal: isHeal ? 10 : undefined,
        isBuff,
        isDebuff: false,
        statusCured: isCure ? "poison" : undefined,
      });
    }
  } else if (targetId) {
    // Single target.
    events.push({
      type: "spellEffect",
      spellId: spell.id,
      targetId,
      damage: isDamage ? 15 : undefined,
      heal: isHeal ? 10 : undefined,
      isBuff,
      isDebuff: isDisable || isDispel,
      statusInflicted: isDisable ? (eff as { status?: string }).status : undefined,
      statusCured: isCure ? "poison" : undefined,
    });
  } else if (isSummon || isDispel) {
    // Self-cast summon/dispel — no targetId, field effect.
    events.push({
      type: "spellEffect",
      spellId: spell.id,
      isDebuff: isDispel,
    });
  }

  return events;
}

// --- Playback state ------------------------------------------------------------

let scene = createScene(state);
let spellIndex = 0;
let playing = true;
let slowMotion = false;
let turnStartTime = 0;
let spellPlaying = false;
let waitingForNext = false;

const spellInfoEl = document.getElementById("spell-info")!;
const spellStyleEl = document.getElementById("spell-style")!;
const spellQueueEl = document.getElementById("spell-queue")!;
const combatWindowsEl = document.getElementById("vignette-combat-windows")!;
const btnPlay = document.getElementById("btn-play") as HTMLButtonElement;
const btnNext = document.getElementById("btn-next") as HTMLButtonElement;
const btnRestart = document.getElementById("btn-restart") as HTMLButtonElement;
const btnSlow = document.getElementById("btn-slow") as HTMLButtonElement;
const spellSelect = document.getElementById("spell-select") as HTMLSelectElement;
const btnNewSpells = document.getElementById("btn-new-spells") as HTMLButtonElement;

function spellNameFor(id: string): string {
  return spellById(id)?.name ?? id;
}

const noOpHandlers: CombatWindowsHandlers = {
  onMenuHover: () => {},
  onMenuConfirm: () => {},
  onSelectionHover: () => {},
  onSelectionConfirm: () => {},
};

/** Render the regular blue FF6 combat menu windows at the bottom. */
function renderDemoCombatWindows(): void {
  const currentChar = party[0]; // Aria is the demo caster.
  const view: CombatWindowsView = {
    state,
    currentCharacterId: currentChar.id,
    menuMode: "menu",
    menuEntries: menuEntriesForCharacter(currentChar),
    menuIndex: 1, // Highlight Magic, since the demo is about spell VFX.
    selectionTitle: "",
    selectionEntries: [],
    selectionIndex: 0,
    selectionFooter: null,
    flash: null,
    result: null,
  };
  renderCombatWindows(combatWindowsEl, view, noOpHandlers);
}

function startCurrentSpell(): void {
  const spell = VFX_SPELLS[spellIndex];
  if (!spell) return;
  const events = makeSpellEvents(spell);
  turnStartTime = performance.now();
  playTurn(scene, events, spellNameFor, turnStartTime, W, H);
  spellPlaying = true;
  waitingForNext = false;
  updateInfoDisplay();
  renderDemoCombatWindows();
}

function nextSpell(): void {
  spellIndex = (spellIndex + 1) % VFX_SPELLS.length;
  // Reset scene state for the next spell (clear lingering effects/particles).
  scene = createScene(state);
  startCurrentSpell();
}

function restart(): void {
  spellIndex = 0;
  scene = createScene(state);
  startCurrentSpell();
}

function populateSpellSelect(): void {
  for (let i = 0; i < VFX_SPELLS.length; i++) {
    const s = VFX_SPELLS[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${NEW_SPELL_IDS.has(s.id) ? "★ " : ""}${s.name}`;
    spellSelect.appendChild(opt);
  }
}

function styleDetail(spell: SpellDef): string {
  const style = resolveEffectStyle(spell.id);
  const parts: string[] = [];
  if (style.charge) parts.push(`charge:${style.charge}`);
  if (style.projectile) parts.push(`projectile:${style.projectile}${style.projectileCount && style.projectileCount > 1 ? `×${style.projectileCount}` : ""}`);
  if (style.burst) parts.push(`burst:${style.burst}`);
  if (style.field) parts.push(`field:${style.field}`);
  parts.push(`scale:${style.scale ?? 1}`);
  return parts.join(" · ");
}

function updateInfoDisplay(): void {
  const spell = VFX_SPELLS[spellIndex];
  if (!spell) return;
  const eff = spell.effect;
  const targetDesc = spell.target === "self" ? "Self"
    : spell.target === "singleEnemy" ? "1 Enemy"
    : spell.target === "singleAlly" ? "1 Ally"
    : spell.target === "allEnemies" || spell.target === "groupEnemies" ? "All Enemies"
    : spell.target === "allAllies" || spell.target === "groupAllies" ? "All Allies"
    : "?";
  const element = eff.kind === "damage" && eff.element ? ` · ${eff.element}` : "";
  spellInfoEl.textContent = `[${spellIndex + 1}/${VFX_SPELLS.length}] ${spell.name} — ${spell.class} T${spell.tier} · ${eff.kind}${element} · ${targetDesc}`;
  spellStyleEl.textContent = styleDetail(spell);
  spellSelect.value = String(spellIndex);

  // Build queue display: show a window of spells around the current one.
  const windowSize = 12;
  const start = Math.max(0, spellIndex - 2);
  const end = Math.min(VFX_SPELLS.length, start + windowSize);
  const parts: string[] = [];
  for (let i = start; i < end; i++) {
    const s = VFX_SPELLS[i];
    const cls = i === spellIndex ? "current" : i < spellIndex ? "done" : "";
    parts.push(`<span class="${cls}">${NEW_SPELL_IDS.has(s.id) ? "★ " : ""}${s.name}</span>`);
  }
  spellQueueEl.innerHTML = parts.join(" · ");
}

// --- Render loop ---------------------------------------------------------------

function loop(): void {
  const now = performance.now();

  if (playing) {
    updateScene(scene, now);

    // Auto-advance: when the choreography finishes, updateScene sets
    // scene.choreo to null. We detect that transition via spellPlaying.
    if (spellPlaying && !scene.choreo && !waitingForNext) {
      waitingForNext = true;
      spellPlaying = false;
      // Brief pause between spells (800ms) so the viewer can see the result.
      setTimeout(() => {
        if (waitingForNext) {
          nextSpell();
        }
      }, 800);
    }
  }

  renderScene(ctx, W, H, scene, now);
  renderDemoCombatWindows();
  requestAnimationFrame(loop);
}

// --- Controls ------------------------------------------------------------------

btnPlay.addEventListener("click", () => {
  playing = !playing;
  btnPlay.textContent = playing ? "Pause" : "Play";
  btnPlay.classList.toggle("active", !playing);
});

btnNext.addEventListener("click", () => {
  nextSpell();
});

btnRestart.addEventListener("click", () => {
  restart();
});

btnSlow.addEventListener("click", () => {
  slowMotion = !slowMotion;
  btnSlow.classList.toggle("active", slowMotion);
  // Slow motion: scale the time passed to the scene so everything moves at 0.3x.
  // We do this by adjusting the choreography start time — but since the scene
  // uses real performance.now(), the simplest approach is to just re-play
  // the current spell with a note. For now, slow motion pauses auto-advance
  // and lets you watch the spell statically.
  if (slowMotion) {
    playing = false;
    btnPlay.textContent = "Play";
    btnPlay.classList.add("active");
  } else {
    playing = true;
    btnPlay.textContent = "Pause";
    btnPlay.classList.remove("active");
  }
});

spellSelect.addEventListener("change", () => {
  const idx = parseInt(spellSelect.value, 10);
  if (!isNaN(idx) && idx >= 0 && idx < VFX_SPELLS.length) {
    spellIndex = idx;
    scene = createScene(state);
    startCurrentSpell();
  }
});

btnNewSpells.addEventListener("click", () => {
  const firstNew = VFX_SPELLS.findIndex((s) => NEW_SPELL_IDS.has(s.id));
  if (firstNew >= 0) {
    spellIndex = firstNew;
    scene = createScene(state);
    startCurrentSpell();
  }
});

// Keyboard shortcuts: Space=play/pause, N=next, R=restart.
window.addEventListener("keydown", (e) => {
  if (e.key === " ") { e.preventDefault(); btnPlay.click(); }
  else if (e.key === "n" || e.key === "N") btnNext.click();
  else if (e.key === "r" || e.key === "R") btnRestart.click();
});

// --- Start ---------------------------------------------------------------------

// Preload all party, enemy, and effect sprites so the vignette shows real art
// instead of procedural fallback shapes. The render loop starts immediately;
// sprites pop in as they load (typically within a frame or two).
loadPartySprites().catch(() => {});
loadEnemySprites().catch(() => {});
loadEffectSprites().catch(() => {});

populateSpellSelect();
startCurrentSpell();
loop();
