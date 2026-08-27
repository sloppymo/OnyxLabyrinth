/**
 * Shared combat choreography sandbox.
 *
 * This page deliberately drives CombatStage rather than a mock painter. The
 * Canvas and Phaser selectors therefore exercise the same scene, event
 * timeline, sprite caches, and backend renderers used by production combat.
 */
import { createCharacterRecord, type CharacterClass } from "../game/party";
import { createCombatState } from "../game/combat";
import { ENEMIES_BY_ID } from "../data/enemies";
import type { EnemyInstance } from "../game/combat-types";
import type { CombatEvent, CombatState } from "../game/combat-types";
import type { CombatBarkLine, CombatBarkTrigger } from "../data/combat-bark-library/types";
import { ALL_BARK_PROFILES, BARK_PROFILES_BY_ID } from "../data/combat-bark-library";
import { eligibleCombatBarks, selectCombatBark } from "../game/combat-bark-library";
import { barkLandmarkForTrigger, barkPriority } from "../data/combat-bark-policy";
import { offerLibraryBark } from "../game/combat-bark-runtime";
import { createCombatStage, type CombatStage, type CombatStageKind } from "../engine/combat-stage";
import { showMode } from "../engine/shell";
import { findActor, getAnim, animOffset } from "../engine/combat-choreography";
import { loadEffectSprites } from "../engine/effect-sprite-cache";
import { loadEnemySpriteBundle } from "../engine/enemy-sprite-cache";
import { loadPartySpriteBundle, PARTY_SPRITE_DIRS } from "../engine/party-sprite-cache";

const W = 768;
const H = 672;

type PreviewAction = "normal" | "critical" | "miss" | "ranged" | "cast" | "heal";

interface Preset {
  label: string;
  actorSide: "party" | "enemy";
  actorClass: CharacterClass;
  enemyId: string;
  action: PreviewAction;
  actorProfileId?: string;
}

const PRESETS: Record<string, Preset> = {
  fighterSkeleton: {
    label: "Fighter → Skeleton · normal",
    actorSide: "party",
    actorClass: "Fighter",
    enemyId: "skeleton",
    action: "normal",
  },
  fighterCritical: {
    label: "Fighter → Skeleton · critical",
    actorSide: "party",
    actorClass: "Fighter",
    enemyId: "skeleton",
    action: "critical",
  },
  thiefFast: {
    label: "Thief → Skeleton · fast",
    actorSide: "party",
    actorClass: "Thief",
    enemyId: "skeleton",
    action: "normal",
  },
  halberdierHeavy: {
    label: "Halberdier → Skeleton · heavy",
    actorSide: "party",
    actorClass: "Halberdier",
    enemyId: "skeleton",
    action: "normal",
  },
  duelistNormal: {
    label: "Duelist → Skeleton",
    actorSide: "party",
    actorClass: "Duelist",
    enemyId: "skeleton",
    action: "normal",
  },
  crusaderHeavy: {
    label: "Crusader → Skeleton · heavy",
    actorSide: "party",
    actorClass: "Crusader",
    enemyId: "skeleton",
    action: "normal",
  },
  skeletonAttack: {
    label: "Skeleton → Fighter",
    actorSide: "enemy",
    actorClass: "Fighter",
    enemyId: "skeleton",
    action: "normal",
  },
  minotaurHeavy: {
    label: "Minotaur → Fighter · heavy",
    actorSide: "enemy",
    actorClass: "Fighter",
    enemyId: "minotaur",
    action: "normal",
  },
  hellhoundPounce: {
    label: "Hellhound → Mage · pounce",
    actorSide: "enemy",
    actorClass: "Mage",
    enemyId: "hellhound",
    action: "normal",
  },
  slimeHop: {
    label: "Slime → Fighter · hop",
    actorSide: "enemy",
    actorClass: "Fighter",
    enemyId: "slime",
    action: "normal",
  },
  archerRanged: {
    label: "Archer → Fighter · ranged",
    actorSide: "enemy",
    actorClass: "Fighter",
    enemyId: "skeleton-archer",
    action: "ranged",
  },
  mageCast: {
    label: "Mage → Skeleton · cast",
    actorSide: "party",
    actorClass: "Mage",
    enemyId: "skeleton",
    action: "cast",
  },
  priestHeal: {
    label: "Priest → ally · heal",
    actorSide: "party",
    actorClass: "Priest",
    enemyId: "skeleton",
    action: "heal",
  },
  hellbatDive: {
    label: "Hellbat → Fighter · flying",
    actorSide: "enemy",
    actorClass: "Fighter",
    enemyId: "hellbat",
    action: "normal",
  },
  wraithFloat: {
    label: "Blood Wraith → Fighter · float",
    actorSide: "enemy",
    actorClass: "Fighter",
    enemyId: "blood-wraith",
    action: "normal",
  },
  golemHeavy: {
    label: "Golem → Fighter · heavy",
    actorSide: "enemy",
    actorClass: "Fighter",
    enemyId: "stone-guardian",
    action: "normal",
  },
  crusaderBoss: {
    label: "Crusader → The Dead Boy · boss",
    actorSide: "party",
    actorClass: "Crusader",
    enemyId: "headmasters-echo",
    action: "normal",
  },
  bossRemnant: {
    label: "The Lonely Girl · boss death",
    actorSide: "enemy",
    actorClass: "Priest",
    enemyId: "headmasters-echo-remnant",
    action: "critical",
  },
  bossAscendant: {
    label: "The Crying Man · boss death",
    actorSide: "enemy",
    actorClass: "Mage",
    enemyId: "headmasters-echo-ascendant",
    action: "critical",
  },
  vess: {
    label: "Vess → Skeleton · companion voice",
    actorSide: "party",
    actorClass: "Fighter",
    enemyId: "skeleton",
    action: "normal",
    actorProfileId: "fifth-chair",
  },
  ruinedVanguard: {
    label: "Ruined Vanguard · Party That Returned",
    actorSide: "enemy",
    actorClass: "Fighter",
    enemyId: "ruined-vanguard",
    action: "normal",
  },
  hollowKnifeman: {
    label: "Hollow Knifeman · Party That Returned",
    actorSide: "enemy",
    actorClass: "Thief",
    enemyId: "hollow-knifeman",
    action: "normal",
  },
  ashScribe: {
    label: "Ash Scribe · Party That Returned",
    actorSide: "enemy",
    actorClass: "Mage",
    enemyId: "ash-scribe",
    action: "normal",
  },
  drownedCantor: {
    label: "Drowned Cantor · Party That Returned",
    actorSide: "enemy",
    actorClass: "Priest",
    enemyId: "drowned-cantor",
    action: "normal",
  },
};

const PREVIEW_BARK_TRIGGERS: readonly CombatBarkTrigger[] = [
  "combatStart",
  "basicAttack",
  "attackMiss",
  "criticalHit",
  "takeHit",
  "takeHeavyHit",
  "spellCast",
  "healCast",
  "abilityUse",
  "death",
  "bossPhase",
  "rare",
];

type BarkPreviewMode = "governed" | "forced";

interface BarkPreviewChoice {
  profileId: string;
  speakerName: string;
  actorId: string;
  trigger: CombatBarkTrigger;
  landmark: ReturnType<typeof barkLandmarkForTrigger>;
  priority: number;
  eligible: readonly CombatBarkLine[];
  selected: CombatBarkLine | null;
  event: Extract<CombatEvent, { type: "bark" }> | null;
  suppressedReason: string | null;
  mode: BarkPreviewMode;
}

const presetEl = document.querySelector<HTMLSelectElement>("#preset")!;
const backendEl = document.querySelector<HTMLSelectElement>("#backend")!;
const actionEl = document.querySelector<HTMLSelectElement>("#action")!;
const speedEl = document.querySelector<HTMLSelectElement>("#speed")!;
const timelineEl = document.querySelector<HTMLInputElement>("#timeline")!;
const timelineValueEl = document.querySelector<HTMLSpanElement>("#timeline-value")!;
const replayEl = document.querySelector<HTMLButtonElement>("#replay")!;
const repeatEl = document.querySelector<HTMLButtonElement>("#repeat")!;
const debugEl = document.querySelector<HTMLButtonElement>("#debug")!;
const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const barkModeEl = document.querySelector<HTMLSelectElement>("#bark-mode")!;
const barkTriggerEl = document.querySelector<HTMLSelectElement>("#bark-trigger")!;
const barkSpeakerEl = document.querySelector<HTMLSelectElement>("#bark-speaker")!;
const barkLineEl = document.querySelector<HTMLSelectElement>("#bark-line")!;
const nextBarkEl = document.querySelector<HTMLButtonElement>("#next-bark")!;
const barkMetaEl = document.querySelector<HTMLPreElement>("#bark-meta")!;

for (const [id, preset] of Object.entries(PRESETS)) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = preset.label;
  presetEl.appendChild(option);
}

for (const trigger of PREVIEW_BARK_TRIGGERS) {
  const option = document.createElement("option");
  option.value = trigger;
  option.textContent = trigger;
  barkTriggerEl.appendChild(option);
}

for (const option of [
  ["actor", "Actor profile"],
  ["target", "Target profile"],
] as const) {
  const element = document.createElement("option");
  element.value = option[0];
  element.textContent = option[1];
  barkSpeakerEl.appendChild(element);
}
for (const profile of ALL_BARK_PROFILES) {
  const option = document.createElement("option");
  option.value = profile.id;
  option.textContent = `${profile.displayName} · ${profile.id}`;
  barkSpeakerEl.appendChild(option);
}

let stage: CombatStage | null = null;
let logicalNow = 0;
let lastWallTime = performance.now();
let duration = 1;
let repeat = false;
let showGuides = false;
let loading = false;
let replaySerial = 0;
let barkChoice: BarkPreviewChoice | null = null;

function selectedPreset(): Preset {
  return PRESETS[presetEl.value] ?? PRESETS.fighterSkeleton!;
}

function selectedAction(preset: Preset): PreviewAction {
  const selected = actionEl.value;
  return selected === "preset" ? preset.action : (selected as PreviewAction);
}

function actorAndTargetIds(preset: Preset): { actorId: string; targetId: string } {
  return preset.actorSide === "party"
    ? { actorId: "pc-0", targetId: "enemy-0" }
    : { actorId: "enemy-0", targetId: "pc-0" };
}

function profileIdForSide(preset: Preset, side: "actor" | "target"): string {
  const { actorId, targetId } = actorAndTargetIds(preset);
  const id = side === "actor" ? actorId : targetId;
  if (side === "actor" && preset.actorProfileId) return preset.actorProfileId;
  if (id === "pc-0") return preset.actorSide === "party" ? preset.actorClass : "Fighter";
  return preset.enemyId;
}

function selectedBarkProfileId(preset: Preset): string {
  if (barkSpeakerEl.value === "target") return profileIdForSide(preset, "target");
  if (barkSpeakerEl.value === "actor") return profileIdForSide(preset, "actor");
  return barkSpeakerEl.value || profileIdForSide(preset, "actor");
}

function barkActorIdForSelection(preset: Preset): string {
  return barkSpeakerEl.value === "target" ? actorAndTargetIds(preset).targetId : actorAndTargetIds(preset).actorId;
}

function updateBarkLineOptions(preset: Preset): void {
  const profileId = selectedBarkProfileId(preset);
  const trigger = barkTriggerEl.value as CombatBarkTrigger;
  const lines = eligibleCombatBarks({ speakerId: profileId, trigger });
  const previous = barkLineEl.value;
  barkLineEl.replaceChildren();
  const automatic = document.createElement("option");
  automatic.value = "auto";
  automatic.textContent = "Automatic selection";
  barkLineEl.appendChild(automatic);
  for (const [index, line] of lines.entries()) {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${line.text}`;
    barkLineEl.appendChild(option);
  }
  barkLineEl.value = [...barkLineEl.options].some((option) => option.value === previous) ? previous : "auto";
}

function updateBarkMetadata(choice: BarkPreviewChoice | null): void {
  if (!choice) {
    barkMetaEl.textContent = "No bark decision yet.";
    return;
  }
  const selected = choice.selected?.text ?? "—";
  const shown = choice.event ? "yes" : "no";
  barkMetaEl.textContent = [
    `mode: ${choice.mode}`,
    `speaker: ${choice.speakerName} (${choice.profileId})`,
    `trigger: ${choice.trigger}`,
    `priority: ${choice.priority}`,
    `landmark: ${choice.landmark}`,
    `eligible lines: ${choice.eligible.length}`,
    `chosen line: ${selected}`,
    `displayed event: ${shown}`,
    `suppressed: ${choice.suppressedReason ?? "no"}`,
    "",
    "Forced mode bypasses the governor; governed mode uses the production runtime.",
  ].join("\n");
}

function makeBarkChoice(preset: Preset, state: CombatState): BarkPreviewChoice {
  const trigger = barkTriggerEl.value as CombatBarkTrigger;
  const profileId = selectedBarkProfileId(preset);
  const profile = BARK_PROFILES_BY_ID.get(profileId);
  const actorId = barkActorIdForSelection(preset);
  const landmark = barkLandmarkForTrigger(trigger);
  const priority = barkPriority(trigger, "library");
  const eligible = eligibleCombatBarks({ speakerId: profileId, trigger });
  const explicitIndex = barkLineEl.value === "auto" ? -1 : Number(barkLineEl.value);
  const explicitLine = Number.isInteger(explicitIndex) ? eligible[explicitIndex] ?? null : null;
  const mode = barkModeEl.value as BarkPreviewMode;
  const speakerName = profile?.displayName ?? profileId;

  if (mode === "forced") {
    const selected = explicitLine ?? selectCombatBark({ speakerId: profileId, trigger, rng: () => 0 }, BARK_PROFILES_BY_ID);
    return {
      profileId,
      speakerName,
      actorId,
      trigger,
      landmark,
      priority,
      eligible,
      selected,
      event: selected
        ? { type: "bark", actorId, trigger, text: selected.text, source: "library", landmark, speaker: speakerName }
        : null,
      suppressedReason: selected ? null : "no-eligible-line",
      mode,
    };
  }

  const emitted: CombatEvent[] = [];
  const beforeSuppressed = { ...(state.barkRuntime?.telemetry.suppressionReasons ?? {}) };
  const shown = offerLibraryBark(
    state,
    { actorId, speakerId: profileId, trigger, landmark },
    (_message, event) => emitted.push(event)
  );
  const event = emitted.find((candidate): candidate is Extract<CombatEvent, { type: "bark" }> => candidate?.type === "bark") ?? null;
  const afterSuppressed = state.barkRuntime?.telemetry.suppressionReasons ?? {};
  const changedReason = Object.keys(afterSuppressed).find((key) => afterSuppressed[key] !== beforeSuppressed[key]);
  return {
    profileId,
    speakerName,
    actorId,
    trigger,
    landmark,
    priority,
    eligible,
    selected: event ? eligible.find((line) => line.text === event.text) ?? { text: event.text } : null,
    event,
    suppressedReason: shown ? null : changedReason ?? "governor-suppressed",
    mode,
  };
}

function makeState(preset: Preset): CombatState {
  // `actorClass` is the acting class for party presets and the target class
  // for enemy presets; either way it is the first visible party body.
  const partyClass = preset.actorClass;
  const secondClass: CharacterClass =
    preset.action === "heal" ? "Mage" : preset.actorClass === "Mage" ? "Priest" : "Mage";
  const party = [
    createCharacterRecord("pc-0", "Hero", "Human", "Neutral", partyClass, 0),
    createCharacterRecord("pc-1", "Ally", "Human", "Neutral", secondClass, 1),
  ];
  const def = ENEMIES_BY_ID[preset.enemyId];
  if (!def) throw new Error(`Preview enemy missing: ${preset.enemyId}`);
  const enemy: EnemyInstance = {
    ...def,
    instanceId: "enemy-0",
    currentHp: def.hp,
    row: "front",
    status: [],
  };
  return createCombatState(party, { front: [enemy], back: [] }, false);
}

function makeEvents(preset: Preset, action: PreviewAction): CombatEvent[] {
  const { actorId, targetId } = actorAndTargetIds(preset);
  if (action === "miss") {
    return [{ type: "miss", actorId, targetId, reason: "evade" }];
  }
  if (action === "cast") {
    const spellId = "mage-fire-bolt";
    return [
      { type: "cast", actorId, spellId, targetId, damage: 12 },
      { type: "spellEffect", spellId, targetId, damage: 12 },
    ];
  }
  if (action === "heal") {
    return [
      { type: "cast", actorId: "pc-0", spellId: "priest-heal", targetId: "pc-1", heal: 20 },
      { type: "spellEffect", spellId: "priest-heal", targetId: "pc-1", heal: 20 },
    ];
  }
  return [
    {
      type: "attack",
      actorId,
      targetId,
      damage: action === "critical" ? 18 : 8,
      range: action === "ranged" ? "long" : "close",
      crit: action === "critical",
    },
  ];
}

function withPreviewBark(events: CombatEvent[], choice: BarkPreviewChoice): CombatEvent[] {
  if (!choice.event) return events;
  if (choice.trigger === "death") {
    return [
      { type: "defeated", targetId: choice.actorId, wasEnemy: choice.actorId === "enemy-0" },
      choice.event,
    ];
  }
  if (choice.trigger === "combatStart") return [choice.event, ...events];
  if (choice.trigger === "bossPhase") {
    return [{ type: "phaseChange", actorId: choice.actorId, phase: 2, name: "Second movement" }, choice.event, ...events];
  }
  return events.flatMap((event, index) => index === 0 ? [event, choice.event!] : [event]);
}

async function loadPresetAssets(preset: Preset, action: PreviewAction): Promise<void> {
  const partyClasses = new Set<CharacterClass>([
    preset.actorClass,
    action === "heal" ? "Mage" : preset.actorClass === "Mage" ? "Priest" : "Mage",
  ]);
  await Promise.all([
    loadEnemySpriteBundle(preset.enemyId),
    ...[...partyClasses].map((cls) => loadPartySpriteBundle(PARTY_SPRITE_DIRS[cls])),
    loadEffectSprites(),
  ]);
}

function updateStatus(text: string): void {
  statusEl.textContent = text;
}

function drawGuides(): void {
  if (!showGuides || !stage || backendEl.value !== "canvas") return;
  const canvas = stage.snapshotCanvas();
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const scene = stage.scene;
  const ids = ["pc-0", "pc-1", "enemy-0"];
  ctx.save();
  ctx.setLineDash([4, 4]);
  for (const id of ids) {
    const actor = findActor(scene, id, W, H);
    if (!actor) continue;
    const anim = getAnim(scene, actor.kind, id, logicalNow);
    const offset = animOffset(anim, logicalNow);
    ctx.strokeStyle = id === "enemy-0" ? "#ff8060" : "#80c8ff";
    ctx.globalAlpha = 0.7;
    ctx.strokeRect(actor.x - 45, actor.y - 45, 90, 90);
    ctx.beginPath();
    ctx.moveTo(actor.x, actor.y);
    ctx.lineTo(actor.x + offset.x, actor.y + offset.y);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(actor.x + offset.x, actor.y + offset.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paint(): void {
  if (!stage) return;
  stage.tick(logicalNow);
  drawGuides();
  timelineEl.max = String(Math.max(1, Math.ceil(duration)));
  timelineEl.value = String(Math.min(duration, Math.max(0, logicalNow)));
  timelineValueEl.textContent = `${Math.round(logicalNow)}ms / ${Math.round(duration)}ms`;
}

async function replay(): Promise<void> {
  const serial = ++replaySerial;
  loading = true;
  const preset = selectedPreset();
  const action = selectedAction(preset);
  updateBarkLineOptions(preset);
  updateStatus(`Loading ${preset.label}…`);
  await loadPresetAssets(preset, action);
  if (serial !== replaySerial) return;
  stage?.destroy();
  stage = null;
  showMode("combat", false);
  const kind = backendEl.value as CombatStageKind;
  const state = makeState(preset);
  barkChoice = makeBarkChoice(preset, state);
  updateBarkMetadata(barkChoice);
  stage = await createCombatStage({ state, kind, backdropId: "combat-bg" });
  if (serial !== replaySerial || !stage) return;
  const events = withPreviewBark(makeEvents(preset, action), barkChoice);
  duration = stage.playTurn(events, (id) => `Spell:${id}`, (id) => `Technique:${id}`, 0);
  logicalNow = 0;
  lastWallTime = performance.now();
  loading = false;
  updateStatus(`${preset.label} · ${kind} · ${Math.round(duration)}ms · bark ${barkChoice.event ? "shown" : "silent"}`);
  paint();
}

function tick(wallNow: number): void {
  const wallDelta = Math.min(50, Math.max(0, wallNow - lastWallTime));
  lastWallTime = wallNow;
  if (!loading && stage) {
    logicalNow += wallDelta * Number(speedEl.value);
    if (logicalNow >= duration) {
      logicalNow = duration;
      if (repeat) {
        void replay();
      }
    }
    paint();
  }
  requestAnimationFrame(tick);
}

presetEl.value = "fighterSkeleton";
actionEl.value = "preset";
presetEl.addEventListener("change", () => {
  actionEl.value = "preset";
  void replay();
});
backendEl.addEventListener("change", () => void replay());
actionEl.addEventListener("change", () => void replay());
speedEl.addEventListener("change", () => {
  lastWallTime = performance.now();
});
replayEl.addEventListener("click", () => void replay());
repeatEl.addEventListener("click", () => {
  repeat = !repeat;
  repeatEl.textContent = `Repeat: ${repeat ? "on" : "off"}`;
});
debugEl.addEventListener("click", () => {
  showGuides = !showGuides;
  debugEl.textContent = `Motion guides: ${showGuides ? "on" : "off"}`;
  paint();
});
barkModeEl.addEventListener("change", () => void replay());
barkTriggerEl.addEventListener("change", () => void replay());
barkSpeakerEl.addEventListener("change", () => void replay());
barkLineEl.addEventListener("change", () => void replay());
nextBarkEl.addEventListener("click", () => {
  const options = [...barkLineEl.options].filter((option) => option.value !== "auto");
  if (options.length === 0) return;
  const current = options.findIndex((option) => option.value === barkLineEl.value);
  barkLineEl.value = options[(current + 1) % options.length]!.value;
  barkModeEl.value = "forced";
  void replay();
});
timelineEl.addEventListener("input", () => {
  // Seek by replaying from the beginning in small deterministic increments;
  // ChoreoStep firing is edge-triggered, so jumping a live scene would make
  // the visual state depend on the browser's event cadence.
  if (!stage || loading) return;
  const target = Number(timelineEl.value);
  if (target < logicalNow) {
    void replay().then(() => seekTo(target));
    return;
  }
  seekTo(target);
});

function seekTo(target: number): void {
  if (!stage) return;
  for (let t = logicalNow + 1; t <= target; t += 16) stage.update(Math.min(target, t));
  logicalNow = target;
  paint();
}

void replay();
requestAnimationFrame(tick);
