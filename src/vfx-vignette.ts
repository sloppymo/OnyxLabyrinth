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
import { techniquesForClass, techniqueById, maxRageForLevel, classHasTechniques, type TechniqueDef } from "./data/techniques";
import { CLASSES, computeMaxHp, computeMaxSp, type Stats } from "./game/party";

// --- Canvas setup --------------------------------------------------------------

const canvas = document.getElementById("vignette-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const W = canvas.width;
const H = canvas.height;

// --- Minimal fake combat state -------------------------------------------------
// We don't need real combat math — just enough data for the scene renderer to
// place sprites and resolve effect styles.

function makeCharacter(id: string, name: string, cls: Character["class"], slot: number, stats: Stats): Character {
  // Simulate leveling from 1 → 12 using the real growth formulas.
  const classDef = CLASSES[cls];
  let maxHp = computeMaxHp(stats, cls);
  let maxSp = computeMaxSp(stats, cls);
  const hpGrowth = Math.floor((stats.vit * 2 + classDef.hpBonus) * 0.5);
  const castingStat = classDef.spellClass === "Mage" ? stats.int : classDef.spellClass === "Priest" ? stats.pie : 0;
  const spGrowth = castingStat > 0 ? Math.floor(castingStat * 0.5) : 0;
  for (let lvl = 2; lvl <= 12; lvl++) {
    maxHp += hpGrowth;
    maxSp += spGrowth;
  }
  return {
    id,
    name,
    race: "Human",
    alignment: "Neutral",
    class: cls,
    level: 12,
    xp: 0,
    stats,
    hp: maxHp,
    sp: maxSp,
    maxHp,
    maxSp,
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
  makeCharacter("mage-1", "Aria", "Mage", 0, { str: 8, int: 18, pie: 12, vit: 10, agi: 12, luk: 10 }),
  makeCharacter("priest-1", "Fenn", "Priest", 1, { str: 10, int: 12, pie: 18, vit: 12, agi: 10, luk: 10 }),
  makeCharacter("mage-2", "Eve", "Mage", 2, { str: 8, int: 17, pie: 14, vit: 11, agi: 13, luk: 11 }),
  makeCharacter("priest-2", "Dell", "Priest", 3, { str: 9, int: 14, pie: 16, vit: 10, agi: 12, luk: 12 }),
  makeCharacter("fighter-1", "Bram", "Fighter", 4, { str: 17, int: 10, pie: 12, vit: 16, agi: 12, luk: 10 }),
  makeCharacter("thief-1", "Coda", "Thief", 5, { str: 12, int: 11, pie: 10, vit: 12, agi: 17, luk: 15 }),
];

// Give every caster a broad spellbook so the demo can cycle many VFX.
const MAGE_SPELLS = ALL_SPELLS.filter((s) => s.class === "Mage" && !isUtilitySpell(s)).map((s) => s.id);
const PRIEST_SPELLS = ALL_SPELLS.filter((s) => s.class === "Priest" && !isUtilitySpell(s)).map((s) => s.id);
party[0].knownSpellIds = [...MAGE_SPELLS];
party[1].knownSpellIds = [...PRIEST_SPELLS];
party[2].knownSpellIds = [...MAGE_SPELLS];
party[3].knownSpellIds = [...PRIEST_SPELLS];

// Simulate varied party condition so the status bar looks like real gameplay.
party[1].hp = Math.floor(party[1].maxHp * 0.35); // wounded
party[1].sp = Math.floor(party[1].maxSp * 0.15); // low SP
party[2].status.push("poison");
party[2].sp = Math.floor(party[2].maxSp * 0.75);
party[3].hp = 0; // knocked out
party[3].status.push("knockedOut");
party[4].sp = 0; // melee, no SP
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

// Give every character full rage so techniques are always available in the demo.
for (const c of party) {
  state.rage[c.id] = maxRageForLevel(c.level);
}

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

// --- Random turn helpers ------------------------------------------------------

function randomActor(): Character | null {
  const living = party.filter(
    (c) => c.hp > 0 && !c.status.includes("knockedOut")
  );
  if (living.length === 0) return null;
  return living[Math.floor(Math.random() * living.length)];
}

function randomEnemy(): EnemyInstance | null {
  const living = [...enemies.front, ...enemies.back].filter(
    (e) => e.currentHp > 0
  );
  if (living.length === 0) return null;
  return living[Math.floor(Math.random() * living.length)];
}

function randomAlly(): Character | null {
  const living = party.filter(
    (c) => c.hp > 0 && !c.status.includes("knockedOut")
  );
  if (living.length === 0) return null;
  return living[Math.floor(Math.random() * living.length)];
}

function pickTargetIdForSpell(spell: SpellDef): string | null {
  switch (spell.target) {
    case "singleEnemy":
      return randomEnemy()?.instanceId ?? null;
    case "singleAlly":
      return randomAlly()?.id ?? null;
    case "groupEnemies":
    case "allEnemies":
      return randomEnemy()?.instanceId ?? null;
    case "groupAllies":
    case "allAllies":
      return randomAlly()?.id ?? null;
    case "self":
      return null;
    default:
      return null;
  }
}

function pickTargetIdForTechnique(tech: TechniqueDef): string | null {
  switch (tech.target) {
    case "singleEnemy":
    case "rowEnemies":
    case "columnEnemies":
    case "allFrontEnemies":
    case "allEnemies":
    case "randomEnemies":
      return randomEnemy()?.instanceId ?? null;
    case "singleAlly":
    case "allAllies":
    case "allFrontAllies":
      return randomAlly()?.id ?? null;
    case "self":
      return null;
    default:
      return null;
  }
}

const DAMAGE_RANGE = { min: 12, max: 28 };
const HEAL_RANGE = { min: 20, max: 40 };

function rollDamage(): number {
  return Math.floor(Math.random() * (DAMAGE_RANGE.max - DAMAGE_RANGE.min + 1)) + DAMAGE_RANGE.min;
}

function rollHeal(): number {
  return Math.floor(Math.random() * (HEAL_RANGE.max - HEAL_RANGE.min + 1)) + HEAL_RANGE.min;
}

function applyDamageToEnemy(enemy: EnemyInstance, amount: number): void {
  // Keep at least 1 HP so the demo never runs out of targets.
  enemy.currentHp = Math.max(1, enemy.currentHp - amount);
}

function applyHealToAlly(ally: Character, amount: number): void {
  ally.hp = Math.min(ally.maxHp, ally.hp + amount);
}

function knownSpells(c: Character): SpellDef[] {
  return c.knownSpellIds
    .map((id) => spellById(id))
    .filter((s): s is SpellDef => s !== undefined && !isUtilitySpell(s));
}

function knownTechniques(c: Character): TechniqueDef[] {
  return techniquesForClass(c.class, c.level);
}

interface DemoAction {
  actor: Character;
  kind: "attack" | "cast" | "technique" | "defend";
  spell?: SpellDef;
  technique?: TechniqueDef;
  targetId: string | null;
  label: string;
  menuIndex: number;
}

function chooseRandomAction(): DemoAction | null {
  const actor = randomActor();
  if (!actor) return null;

  const spells = knownSpells(actor);
  const techs = knownTechniques(actor);
  const menu = menuEntriesForCharacter(actor);
  const canCast = spells.length > 0 && actor.sp > 0;
  const canTech = techs.length > 0 && (state.rage[actor.id] ?? 0) > 0;

  const options: { weight: number; kind: DemoAction["kind"] }[] = [
    { weight: canCast ? 55 : 0, kind: "cast" },
    { weight: canTech ? 25 : 0, kind: "technique" },
    { weight: 20, kind: "attack" },
  ];
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  if (total === 0) return null;

  let roll = Math.random() * total;
  let kind: DemoAction["kind"] = "attack";
  for (const o of options) {
    if (o.weight === 0) continue;
    roll -= o.weight;
    if (roll <= 0) {
      kind = o.kind;
      break;
    }
  }

  if (kind === "cast") {
    const spell = spells[Math.floor(Math.random() * spells.length)];
    const targetId = pickTargetIdForSpell(spell);
    const menuIndex = menu.findIndex((m) => m.kind === "cast");
    return { actor, kind, spell, targetId, label: spell.name, menuIndex };
  }

  if (kind === "technique") {
    const tech = techs[Math.floor(Math.random() * techs.length)];
    const targetId = pickTargetIdForTechnique(tech);
    const menuIndex = menu.findIndex((m) => m.kind === "technique");
    return { actor, kind, technique: tech, targetId, label: tech.name, menuIndex };
  }

  const target = randomEnemy();
  const targetId = target?.instanceId ?? null;
  const menuIndex = menu.findIndex((m) => m.kind === "attack");
  return { actor, kind: "attack", targetId, label: "Attack", menuIndex };
}

let currentAction: DemoAction | null = null;

function restoreDemoResources(): void {
  for (const c of party) {
    if (c.hp > 0 && !c.status.includes("knockedOut")) {
      c.sp = Math.min(c.maxSp, c.sp + Math.max(1, Math.floor(c.maxSp * 0.08)));
    }
  }
  for (const c of party) {
    if (classHasTechniques(c.class)) {
      state.rage[c.id] = Math.min(
        maxRageForLevel(c.level),
        (state.rage[c.id] ?? 0) + Math.floor(maxRageForLevel(c.level) * 0.15)
      );
    }
  }
}

function buildTurnEvents(action: DemoAction): CombatEvent[] {
  const events: CombatEvent[] = [];

  if (action.kind === "attack" && action.targetId) {
    const dmg = rollDamage();
    applyDamageToEnemy(
      [...enemies.front, ...enemies.back].find((e) => e.instanceId === action.targetId)!,
      dmg
    );
    // Thief attacks from range (bow); everyone else is melee.
    const range = action.actor.class === "Thief" ? "long" : "close";
    events.push({
      type: "attack",
      actorId: action.actor.id,
      targetId: action.targetId,
      damage: dmg,
      range,
    });
    return events;
  }

  if (action.kind === "technique" && action.technique) {
    const tech = action.technique;
    const targetId = action.targetId;
    events.push({ type: "technique", actorId: action.actor.id, techniqueId: tech.id, targetId });
    state.rage[action.actor.id] = Math.max(0, (state.rage[action.actor.id] ?? 0) - tech.rageCost);

    const eff = tech.effect;
    if (eff.kind === "heal" && targetId) {
      const amount = rollHeal();
      applyHealToAlly(
        party.find((c) => c.id === targetId) ?? action.actor,
        amount
      );
      events.push({ type: "techniqueBuff", actorId: action.actor.id, techniqueId: tech.id, targetId });
    } else if (eff.kind === "buff" && targetId) {
      events.push({ type: "techniqueBuff", actorId: action.actor.id, techniqueId: tech.id, targetId });
    } else if (eff.kind === "damage" || eff.kind === "multiHit" || eff.kind === "damageWithStatus" || eff.kind === "damageWithExecute") {
      if (targetId) {
        const dmg = rollDamage();
        applyDamageToEnemy(
          [...enemies.front, ...enemies.back].find((e) => e.instanceId === targetId)!,
          dmg
        );
        events.push({
          type: "techniqueHit",
          actorId: action.actor.id,
          techniqueId: tech.id,
          targetId,
          damage: dmg,
        });
      }
    } else if (targetId) {
      // Generic status/debuff/buff fallback.
      events.push({ type: "techniqueBuff", actorId: action.actor.id, techniqueId: tech.id, targetId });
    }
    return events;
  }

  if (action.kind === "cast" && action.spell) {
    const spell = action.spell;
    const targetId = action.targetId;
    action.actor.sp = Math.max(0, action.actor.sp - spell.spCost);
    events.push({ type: "cast", actorId: action.actor.id, spellId: spell.id, targetId });

    const eff = spell.effect;
    const isDamage = eff.kind === "damage";
    const isHeal = eff.kind === "heal";
    const isBuff = eff.kind === "buff" || eff.kind === "magicScreen";
    const isDisable = eff.kind === "disable";
    const isSummon = eff.kind === "summon";
    const isCure = eff.kind === "cure" || eff.kind === "resurrect";
    const isDispel = eff.kind === "fizzleField" || eff.kind === "dispelMagic";

    const pushSpellEffect = (tid: string | undefined, isDebuff = false) => {
      events.push({
        type: "spellEffect",
        spellId: spell.id,
        targetId: tid,
        damage: isDamage ? rollDamage() : undefined,
        heal: isHeal ? rollHeal() : undefined,
        isBuff,
        isDebuff: isDisable || isDispel || isDebuff,
        statusInflicted: isDisable ? (eff as { status?: string }).status : undefined,
        statusCured: isCure ? "poison" : undefined,
      });
    };

    if (spell.target === "allEnemies" || spell.target === "groupEnemies") {
      for (const e of [...enemies.front, ...enemies.back]) {
        if (isDamage) applyDamageToEnemy(e, rollDamage());
        pushSpellEffect(e.instanceId, true);
      }
    } else if (spell.target === "allAllies" || spell.target === "groupAllies") {
      for (const c of party) {
        if (isHeal) applyHealToAlly(c, rollHeal());
        pushSpellEffect(c.id);
      }
    } else if (targetId) {
      if (isDamage) {
        const enemy = [...enemies.front, ...enemies.back].find((e) => e.instanceId === targetId);
        if (enemy) applyDamageToEnemy(enemy, rollDamage());
      }
      if (isHeal) {
        const ally = party.find((c) => c.id === targetId);
        if (ally) applyHealToAlly(ally, rollHeal());
      }
      pushSpellEffect(targetId);
    } else if (isSummon || isDispel) {
      pushSpellEffect(undefined, isDispel);
    }
  }

  return events;
}

// --- Playback state ------------------------------------------------------------

let scene = createScene(state);
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

function techniqueNameFor(id: string): string {
  return techniqueById(id)?.name ?? id;
}

const noOpHandlers: CombatWindowsHandlers = {
  onMenuHover: () => {},
  onMenuConfirm: () => {},
  onSelectionHover: () => {},
  onSelectionConfirm: () => {},
};

/** Render the regular blue FF6 combat menu windows at the bottom. */
function renderDemoCombatWindows(): void {
  const action = currentAction;
  const currentChar = action?.actor ?? party[0];
  const menuIndex = action?.menuIndex ?? 1;
  const view: CombatWindowsView = {
    state,
    currentCharacterId: currentChar.id,
    menuMode: "menu",
    menuEntries: menuEntriesForCharacter(currentChar),
    menuIndex,
    selectionTitle: "",
    selectionEntries: [],
    selectionIndex: 0,
    selectionFooter: null,
    flash: null,
    result: null,
  };
  renderCombatWindows(combatWindowsEl, view, noOpHandlers);
}

function startRandomTurn(): void {
  currentAction = chooseRandomAction();
  if (!currentAction) {
    // Fallback: revive a downed character and try again next frame.
    party[3].hp = 20;
    party[3].status = party[3].status.filter((s) => s !== "knockedOut");
    currentAction = chooseRandomAction();
  }
  const events = currentAction ? buildTurnEvents(currentAction) : [];
  turnStartTime = performance.now();
  playTurn(scene, events, spellNameFor, turnStartTime, W, H, techniqueNameFor);
  spellPlaying = true;
  waitingForNext = false;
  updateInfoDisplay();
  renderDemoCombatWindows();
}

function nextTurn(): void {
  // Clear transient scene state (effects, particles, popups, choreo) but
  // preserve party/enemy/ally animation maps so death poses and other
  // persistent anim states don't reset every turn.
  scene.effects = [];
  scene.particles = [];
  scene.popups = [];
  scene.choreo = null;
  scene.banner = null;
  scene.bannerUntil = 0;
  scene.screenShake = { amount: 0, until: 0 };
  startRandomTurn();
}

function restart(): void {
  scene = createScene(state);
  startRandomTurn();
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
  const action = currentAction;
  if (!action) {
    spellInfoEl.textContent = "";
    spellStyleEl.textContent = "";
    spellQueueEl.innerHTML = "";
    spellSelect.value = "";
    return;
  }

  let info = `${action.actor.name} (${action.actor.class}) → ${action.label}`;
  if (action.kind === "cast" && action.spell) {
    const spell = action.spell;
    const eff = spell.effect;
    const targetDesc =
      spell.target === "self" ? "Self"
        : spell.target === "singleEnemy" ? "1 Enemy"
        : spell.target === "singleAlly" ? "1 Ally"
        : spell.target === "allEnemies" || spell.target === "groupEnemies" ? "All Enemies"
        : spell.target === "allAllies" || spell.target === "groupAllies" ? "All Allies"
        : "?";
    const element = eff.kind === "damage" && eff.element ? ` · ${eff.element}` : "";
    info = `${info} — ${spell.class} T${spell.tier} · ${eff.kind}${element} · ${targetDesc}`;
    spellStyleEl.textContent = styleDetail(spell);

    // Sync the dropdown to the chosen spell when possible.
    const idx = VFX_SPELLS.findIndex((s) => s.id === spell.id);
    spellSelect.value = idx >= 0 ? String(idx) : "";
  } else if (action.kind === "technique" && action.technique) {
    const tech = action.technique;
    info = `${info} — ${tech.class} Tech · ${tech.rageCost} RG`;
    spellStyleEl.textContent = "";
    spellSelect.value = "";
  } else {
    spellStyleEl.textContent = "";
    spellSelect.value = "";
  }
  spellInfoEl.textContent = info;

  // Build queue display: show a window of spells around the current one.
  const spell = action.kind === "cast" ? action.spell : undefined;
  const currentSpellIdx = spell ? VFX_SPELLS.findIndex((s) => s.id === spell.id) : -1;
  const windowSize = 12;
  const start = Math.max(0, currentSpellIdx >= 0 ? currentSpellIdx - 2 : 0);
  const end = Math.min(VFX_SPELLS.length, start + windowSize);
  const parts: string[] = [];
  for (let i = start; i < end; i++) {
    const s = VFX_SPELLS[i];
    const cls = i === currentSpellIdx ? "current" : "";
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
          restoreDemoResources();
          nextTurn();
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
  nextTurn();
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
    const spell = VFX_SPELLS[idx];
    const actor =
      party.find((c) => c.class === spell.class && c.hp > 0 && !c.status.includes("knockedOut")) ??
      randomActor();
    if (!actor) return;
    const menu = menuEntriesForCharacter(actor);
    currentAction = {
      actor,
      kind: "cast",
      spell,
      targetId: pickTargetIdForSpell(spell),
      label: spell.name,
      menuIndex: menu.findIndex((m) => m.kind === "cast"),
    };
    scene = createScene(state);
    const events = buildTurnEvents(currentAction);
    turnStartTime = performance.now();
    playTurn(scene, events, spellNameFor, turnStartTime, W, H, techniqueNameFor);
    spellPlaying = true;
    waitingForNext = false;
    updateInfoDisplay();
    renderDemoCombatWindows();
  }
});

btnNewSpells.addEventListener("click", () => {
  const firstNew = VFX_SPELLS.findIndex((s) => NEW_SPELL_IDS.has(s.id));
  if (firstNew >= 0) {
    spellSelect.value = String(firstNew);
    spellSelect.dispatchEvent(new Event("change"));
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
startRandomTurn();
loop();
