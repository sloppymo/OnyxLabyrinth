/**
 * VFX Vignette — a standalone test page that auto-cycles through every
 * combat spell in the game so the full range of particle effects, additive
 * blending, wind-up charge glows, screen shakes, and projectile trails can be
 * visually verified in one place.
 *
 * Open: http://localhost:5176/OnyxLabyrinth/vfx-vignette.html
 * (or add --input vfx-vignette.html to the build for a static page)
 */
import { createScene, playTurn, updateScene, renderScene } from "./engine/combat-scene";
import { spellById, ALL_SPELLS, isUtilitySpell, type SpellDef } from "./data/spells";
import { ALL_TECHNIQUES, techniqueById } from "./data/techniques";
import type { CombatState, EnemyFormation, EnemyInstance, CombatEvent } from "./game/combat";
import type { Character } from "./game/party";
import type { Row } from "./data/enemies";
import { loadPartySprites } from "./engine/party-sprite-cache";
import { loadEnemySprites } from "./engine/enemy-sprite-cache";

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

// Use real enemy IDs from the sprite manifest so actual sprite art loads.
const enemies: EnemyFormation = {
  front: [
    makeEnemy("skeleton", "Skeleton", "front"),
    makeEnemy("orc", "Orc", "front"),
  ],
  back: [
    makeEnemy("werewolf", "Werewolf", "back"),
    makeEnemy("skeleton-2", "Skeleton B", "back"),
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

// --- Chaos mode ----------------------------------------------------------------
// Both sides fire spells, techniques, and melee attacks at each other in a
// randomized barrage. This stresses every VFX path simultaneously: projectiles
// from both directions, bursts on both sides, floor glows overlapping, screen
// shake stacking, and banners cycling rapidly.

const CHAOS_SPELLS = ALL_SPELLS.filter((s) => !isUtilitySpell(s));
const ALL_ENEMY_IDS = [...enemies.front, ...enemies.back].map((e) => e.instanceId);
const ALL_PARTY_IDS = party.map((c) => c.id);
const MELEE_CLASSES: Character["class"][] = ["Fighter", "Thief", "Halberdier", "Duelist", "Crusader"];
const MELEE_TECHNIQUES = ALL_TECHNIQUES.filter((t) => MELEE_CLASSES.includes(t.class));

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickEnemyTargetId(): string {
  return rand(ALL_ENEMY_IDS);
}
function pickPartyTargetId(): string {
  return rand(ALL_PARTY_IDS);
}

/** Pick a random enemy ID that can "cast" (we just use enemy instance IDs as casters). */
function pickEnemyCasterId(): string {
  return rand(ALL_ENEMY_IDS);
}

/** Pick a random party member who can cast spells. */
function pickPartyCasterId(spell: SpellDef): string {
  if (spell.class === "Priest") return rand(["priest-1", "priest-2"]);
  return rand(["mage-1", "mage-2"]);
}

/** Pick a random party member with a melee class for techniques. */
function pickMeleeCasterId(): string {
  return rand(["fighter-1", "thief-1"]);
}

function makeChaosEvents(): CombatEvent[] {
  const events: CombatEvent[] = [];
  const numActions = 2 + Math.floor(Math.random() * 3); // 2-4 actions per chaos turn

  for (let i = 0; i < numActions; i++) {
    const roll = Math.random();
    if (roll < 0.35) {
      // Party casts a spell at enemies.
      const spell = rand(CHAOS_SPELLS);
      const casterId = pickPartyCasterId(spell);
      const isDamage = spell.effect.kind === "damage";
      const isHeal = spell.effect.kind === "heal";
      const isBuff = spell.effect.kind === "buff" || spell.effect.kind === "magicScreen";
      const isDisable = spell.effect.kind === "disable";
      const isSummon = spell.effect.kind === "summon";
      const isCure = spell.effect.kind === "cure" || spell.effect.kind === "resurrect";
      const isDispel = spell.effect.kind === "fizzleField" || spell.effect.kind === "dispelMagic";

      // For self-target spells, the caster is the target.
      const targetId = spell.target === "self" ? casterId
        : spell.target === "singleEnemy" || spell.target === "groupEnemies" || spell.target === "allEnemies"
          ? pickEnemyTargetId()
          : spell.target === "singleAlly"
            ? pickPartyTargetId()
            : spell.target === "groupAllies" || spell.target === "allAllies"
              ? pickPartyTargetId()
              : pickEnemyTargetId();

      events.push({ type: "cast", actorId: casterId, spellId: spell.id, targetId });

      if (spell.target === "allEnemies" || spell.target === "groupEnemies") {
        for (const eId of ALL_ENEMY_IDS) {
          events.push({
            type: "spellEffect", spellId: spell.id, targetId: eId,
            damage: isDamage ? 15 + Math.floor(Math.random() * 20) : undefined,
            isDebuff: isDisable || isDispel,
            statusInflicted: isDisable ? "paralysis" : undefined,
          });
        }
      } else if (spell.target === "allAllies" || spell.target === "groupAllies") {
        for (const cId of ALL_PARTY_IDS) {
          events.push({
            type: "spellEffect", spellId: spell.id, targetId: cId,
            heal: isHeal ? 10 + Math.floor(Math.random() * 15) : undefined,
            isBuff,
            statusCured: isCure ? "poison" : undefined,
          });
        }
      } else if (isSummon || isDispel) {
        events.push({ type: "spellEffect", spellId: spell.id, isDebuff: isDispel });
      } else {
        events.push({
          type: "spellEffect", spellId: spell.id, targetId,
          damage: isDamage ? 15 + Math.floor(Math.random() * 20) : undefined,
          heal: isHeal ? 10 + Math.floor(Math.random() * 15) : undefined,
          isBuff,
          isDebuff: isDisable || isDispel,
          statusInflicted: isDisable ? "paralysis" : undefined,
          statusCured: isCure ? "poison" : undefined,
        });
      }
    } else if (roll < 0.55) {
      // Enemy casts a spell at the party.
      const spell = rand(CHAOS_SPELLS.filter((s) =>
        s.effect.kind === "damage" || s.effect.kind === "disable" || s.effect.kind === "fizzleField"
      ));
      const casterId = pickEnemyCasterId();
      const isDamage = spell.effect.kind === "damage";
      const isDisable = spell.effect.kind === "disable";
      const isDispel = spell.effect.kind === "fizzleField" || spell.effect.kind === "dispelMagic";

      const targetId = spell.target === "self" ? casterId
        : spell.target === "singleAlly" || spell.target === "groupAllies" || spell.target === "allAllies"
          ? pickPartyTargetId()
          : pickPartyTargetId(); // enemies target party

      events.push({ type: "cast", actorId: casterId, spellId: spell.id, targetId });

      if (spell.target === "allAllies" || spell.target === "groupAllies" || spell.target === "allEnemies" || spell.target === "groupEnemies") {
        for (const cId of ALL_PARTY_IDS) {
          events.push({
            type: "spellEffect", spellId: spell.id, targetId: cId,
            damage: isDamage ? 10 + Math.floor(Math.random() * 15) : undefined,
            isDebuff: isDisable || isDispel,
            statusInflicted: isDisable ? "poison" : undefined,
          });
        }
      } else {
        events.push({
          type: "spellEffect", spellId: spell.id, targetId,
          damage: isDamage ? 10 + Math.floor(Math.random() * 15) : undefined,
          isDebuff: isDisable || isDispel,
          statusInflicted: isDisable ? "poison" : undefined,
        });
      }
    } else if (roll < 0.75) {
      // Party melee technique.
      const tech = rand(MELEE_TECHNIQUES);
      const casterId = pickMeleeCasterId();
      const targetId = tech.target === "self" ? casterId
        : tech.target === "allAllies" || tech.target === "allFrontAllies"
          ? pickPartyTargetId()
          : pickEnemyTargetId();
      events.push({ type: "technique", actorId: casterId, techniqueId: tech.id, targetId });

      // Add technique hit events for damage-dealing techniques.
      if (tech.effect.kind === "damage" || tech.effect.kind === "damageWithStatus" || tech.effect.kind === "damageWithExecute" || tech.effect.kind === "multiHit") {
        const hits = tech.effect.kind === "multiHit" ? (tech.effect as { hits: number }).hits : 1;
        for (let h = 0; h < hits; h++) {
          if (tech.target === "allEnemies" || tech.target === "allFrontEnemies" || tech.target === "rowEnemies" || tech.target === "columnEnemies" || tech.target === "randomEnemies") {
            for (const eId of ALL_ENEMY_IDS) {
              events.push({ type: "techniqueHit", actorId: casterId, techniqueId: tech.id, targetId: eId, damage: 10 + Math.floor(Math.random() * 15), crit: Math.random() < 0.2 });
            }
          } else if (targetId && targetId !== casterId) {
            events.push({ type: "techniqueHit", actorId: casterId, techniqueId: tech.id, targetId, damage: 10 + Math.floor(Math.random() * 15), crit: Math.random() < 0.2 });
          }
        }
        if (tech.effect.kind === "damageWithStatus") {
          const status = (tech.effect as { status?: string }).status;
          if (status && targetId && targetId !== casterId) {
            events.push({ type: "techniqueStatus", actorId: casterId, techniqueId: tech.id, targetId, statusInflicted: status });
          }
        }
      } else if (tech.effect.kind === "buff" || tech.effect.kind === "buffNextAttack" || tech.effect.kind === "counterStance" || tech.effect.kind === "taunt" || tech.effect.kind === "damageBuff") {
        if (targetId) {
          events.push({ type: "techniqueBuff", actorId: casterId, techniqueId: tech.id, targetId, isBuff: true });
        }
      }
    } else {
      // Melee attack from either side.
      if (Math.random() < 0.5) {
        // Party member attacks an enemy.
        const attackerId = pickMeleeCasterId();
        const targetId = pickEnemyTargetId();
        const dmg = 8 + Math.floor(Math.random() * 12);
        const crit = Math.random() < 0.15;
        events.push({ type: "attack", actorId: attackerId, targetId, damage: dmg, crit });
      } else {
        // Enemy attacks a party member.
        const attackerId = pickEnemyCasterId();
        const targetId = pickPartyTargetId();
        const dmg = 5 + Math.floor(Math.random() * 10);
        events.push({ type: "attack", actorId: attackerId, targetId, damage: dmg });
      }
    }
  }

  return events;
}

// --- Spell queue ---------------------------------------------------------------
// All non-utility spells, ordered by school then tier for a logical progression.

const VFX_SPELLS = ALL_SPELLS.filter((s) => !isUtilitySpell(s));

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
let chaosMode = false;
let turnStartTime = 0;
let spellPlaying = false;
let waitingForNext = false;

const spellInfoEl = document.getElementById("spell-info")!;
const spellQueueEl = document.getElementById("spell-queue")!;
const btnPlay = document.getElementById("btn-play") as HTMLButtonElement;
const btnNext = document.getElementById("btn-next") as HTMLButtonElement;
const btnRestart = document.getElementById("btn-restart") as HTMLButtonElement;
const btnSlow = document.getElementById("btn-slow") as HTMLButtonElement;
const btnChaos = document.getElementById("btn-chaos") as HTMLButtonElement;

function spellNameFor(id: string): string {
  return spellById(id)?.name ?? id;
}

function techniqueNameFor(id: string): string {
  return techniqueById(id)?.name ?? id;
}

function startCurrentSpell(): void {
  if (chaosMode) return; // chaos mode has its own start function
  const spell = VFX_SPELLS[spellIndex];
  if (!spell) return;
  const events = makeSpellEvents(spell);
  turnStartTime = performance.now();
  playTurn(scene, events, spellNameFor, turnStartTime, W, H, techniqueNameFor);
  spellPlaying = true;
  waitingForNext = false;
  updateInfoDisplay();
}

function nextSpell(): void {
  if (chaosMode) {
    startChaosTurn();
    return;
  }
  spellIndex = (spellIndex + 1) % VFX_SPELLS.length;
  // Reset scene state for the next spell (clear lingering effects/particles).
  scene = createScene(state);
  startCurrentSpell();
}

function restart(): void {
  spellIndex = 0;
  scene = createScene(state);
  if (chaosMode) {
    startChaosTurn();
  } else {
    startCurrentSpell();
  }
}

let chaosTurnCount = 0;

function startChaosTurn(): void {
  const events = makeChaosEvents();
  chaosTurnCount++;
  turnStartTime = performance.now();
  playTurn(scene, events, spellNameFor, turnStartTime, W, H, techniqueNameFor);
  spellPlaying = true;
  waitingForNext = false;
  updateChaosInfoDisplay(events);
}

function updateChaosInfoDisplay(events: CombatEvent[]): void {
  const actionCounts: Record<string, number> = {};
  for (const e of events) {
    if (!e) continue;
    actionCounts[e.type] = (actionCounts[e.type] ?? 0) + 1;
  }
  const summary = Object.entries(actionCounts)
    .map(([type, count]) => `${type}×${count}`)
    .join(" · ");
  spellInfoEl.textContent = `CHAOS Turn ${chaosTurnCount} — ${events.length} events: ${summary}`;
  spellQueueEl.innerHTML = '<span class="current">CHAOS MODE</span> — both sides casting spells, techniques & melee at each other';
}

function updateInfoDisplay(): void {
  if (chaosMode) return;
  const spell = VFX_SPELLS[spellIndex];
  if (!spell) return;
  const eff = spell.effect;
  const targetDesc = spell.target === "self" ? "Self"
    : spell.target === "singleEnemy" ? "1 Enemy"
    : spell.target === "singleAlly" ? "1 Ally"
    : spell.target === "allEnemies" || spell.target === "groupEnemies" ? "All Enemies"
    : spell.target === "allAllies" || spell.target === "groupAllies" ? "All Allies"
    : "?";
  spellInfoEl.textContent = `[${spellIndex + 1}/${VFX_SPELLS.length}] ${spell.name} — ${spell.class} T${spell.tier} · ${eff.kind} · ${targetDesc}`;

  // Build queue display: show a window of spells around the current one.
  const windowSize = 12;
  const start = Math.max(0, spellIndex - 2);
  const end = Math.min(VFX_SPELLS.length, start + windowSize);
  const parts: string[] = [];
  for (let i = start; i < end; i++) {
    const s = VFX_SPELLS[i];
    const cls = i === spellIndex ? "current" : i < spellIndex ? "done" : "";
    parts.push(`<span class="${cls}">${s.name}</span>`);
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
      // Brief pause between spells (800ms normal, 400ms chaos) so the viewer
      // can see the result before the next barrage begins.
      const pause = chaosMode ? 400 : 800;
      setTimeout(() => {
        if (waitingForNext) {
          nextSpell();
        }
      }, pause);
    }
  }

  renderScene(ctx, W, H, scene, now);
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

btnChaos.addEventListener("click", () => {
  chaosMode = !chaosMode;
  btnChaos.classList.toggle("active", chaosMode);
  btnChaos.textContent = chaosMode ? "Exit Chaos" : "Chaos Mode";
  if (chaosMode) {
    chaosTurnCount = 0;
    scene = createScene(state);
    playing = true;
    btnPlay.textContent = "Pause";
    btnPlay.classList.remove("active");
    startChaosTurn();
  } else {
    // Return to normal vignette mode.
    spellIndex = 0;
    scene = createScene(state);
    startCurrentSpell();
  }
});

// Keyboard shortcuts: Space=play/pause, N=next, R=restart, C=chaos.
window.addEventListener("keydown", (e) => {
  if (e.key === " ") { e.preventDefault(); btnPlay.click(); }
  else if (e.key === "n" || e.key === "N") btnNext.click();
  else if (e.key === "r" || e.key === "R") btnRestart.click();
  else if (e.key === "c" || e.key === "C") btnChaos.click();
});

// --- Start ---------------------------------------------------------------------

// Preload all party and enemy sprites so the vignette shows real art
// instead of procedural fallback shapes. The render loop starts immediately;
// sprites pop in as they load (typically within a frame or two).
loadPartySprites().catch(() => {});
loadEnemySprites().catch(() => {});

startCurrentSpell();
loop();
