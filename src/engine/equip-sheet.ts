/**
 * Pure HTML + preview helpers for the FF6-style town Equip character sheet.
 * Presentation only — equip math stays in combat-equipment.ts.
 *
 * Layout v4: decorative Equip/Optimum/Empty tabs; upper band
 * portrait | identity | 2×4 stats; full-width gear list (see
 * docs/superpowers/specs/2026-07-28-ff6-equip-sheet-v4-layout-design.md).
 */

import type { Character, CharacterClass } from "../game/party";
import type { Loadout } from "../game/combat-types";
import type { EquipSlot, ItemDef } from "../data/items";
import { effectiveStats } from "../game/effective-stats";
import { perksForCharacter } from "../game/perks";
import { manualEquip, manualUnequip } from "../game/combat-equipment";
import { partyIdleSpriteUrl } from "./party-sprite-cache";
import { prefersReducedMotion } from "./party-idle-anim";

export type EquipStatKey = "atk" | "def" | "str" | "int" | "pie" | "vit" | "agi" | "luk";
export type EquipPreviewMode = "none" | "compare" | "blocked";
/** Equipped gear vs bare loadout — FF6-style trailing modifier. */
export type EquipGearMod = "+" | "-" | "";

/** Display order for the 2×4 stats grid (row-major: STR|INT, …, ATK|DEF). */
const STAT_PAIRS: [EquipStatKey, EquipStatKey][] = [
  ["str", "int"],
  ["pie", "vit"],
  ["agi", "luk"],
  ["atk", "def"],
];

const STAT_LABEL: Record<EquipStatKey, string> = {
  atk: "ATK",
  def: "DEF",
  str: "STR",
  int: "INT",
  pie: "PIE",
  vit: "VIT",
  agi: "AGI",
  luk: "LUK",
};

/** Flat order for gearMods / summarize iteration (same keys as STAT_PAIRS). */
const STAT_ORDER: { key: EquipStatKey; label: string }[] = STAT_PAIRS.flatMap(
  ([a, b]) => [
    { key: a, label: STAT_LABEL[a] },
    { key: b, label: STAT_LABEL[b] },
  ]
);

const BARE_LOADOUT: Loadout = { armor: [] };

const CLASS_INITIAL: Record<CharacterClass, string> = {
  Fighter: "Fi",
  Mage: "Mg",
  Priest: "Pr",
  Thief: "Th",
  Halberdier: "Ha",
  Duelist: "Du",
  Crusader: "Cr",
  "Old Man": "OM",
  "Rat King": "RK",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function summarizeLoadout(c: Character, loadout: Loadout): Record<EquipStatKey, number> {
  const perks = perksForCharacter(c);
  const eff = effectiveStats(c, loadout, perks);
  return {
    atk: eff.str + c.level + (loadout.weapon?.attackBonus ?? 0),
    def: loadout.armor.reduce((sum, a) => sum + (a.defenseBonus ?? 0), 0),
    str: eff.str,
    int: eff.int,
    pie: eff.pie,
    vit: eff.vit,
    agi: eff.agi,
    luk: eff.luk,
  };
}

/** Compare current loadout to bare (no weapon/armor) for FF6 trailing +/-. */
export function gearModsForLoadout(
  c: Character,
  loadout: Loadout
): Record<EquipStatKey, EquipGearMod> {
  const equipped = summarizeLoadout(c, loadout);
  const bare = summarizeLoadout(c, BARE_LOADOUT);
  const out = {} as Record<EquipStatKey, EquipGearMod>;
  for (const { key } of STAT_ORDER) {
    const d = equipped[key] - bare[key];
    out[key] = d > 0 ? "+" : d < 0 ? "-" : "";
  }
  return out;
}

export function resolveEquipPreview(args: {
  character: Character;
  current: Loadout;
  slot: EquipSlot;
  row:
    | { kind: "remove" }
    | { kind: "candidate"; item: ItemDef; identified: boolean };
}): { mode: EquipPreviewMode; next: Loadout | null; warning?: string } {
  const { character, current, slot, row } = args;

  if (row.kind === "remove") {
    const res = manualUnequip(current, slot);
    if (!res) {
      const equipped =
        slot === "hand" ? current.weapon : current.armor.find((a) => a.slot === slot);
      return {
        mode: "blocked",
        next: null,
        warning: equipped?.cursed
          ? `${equipped.name} is CURSED — locked until the Temple's Remove Curse.`
          : undefined,
      };
    }
    return { mode: "compare", next: res.loadout };
  }

  if (!row.identified) {
    return { mode: "blocked", next: null };
  }

  if (row.item.cursed) {
    return {
      mode: "blocked",
      next: null,
      warning: `${row.item.name} is CURSED — equipping it would clamp it on forever.`,
    };
  }

  const res = manualEquip(current, row.item);
  if (!res) {
    const equipped =
      slot === "hand" ? current.weapon : current.armor.find((a) => a.slot === slot);
    return {
      mode: "blocked",
      next: null,
      warning: equipped?.cursed
        ? `${equipped.name} is CURSED — the slot is locked until the Temple removes it.`
        : `${character.name} cannot equip that.`,
    };
  }
  return { mode: "compare", next: res.loadout };
}

/** Name span (may ellipsize) + optional cursed badge outside that span. */
export function equipItemNameHtml(item: ItemDef | undefined): string {
  if (!item) {
    return `<span class="equip-item-cell equip-item-cell--empty"></span>`;
  }
  const name = escapeHtml(item.name);
  const badge = item.cursed
    ? `<span class="equip-cursed-badge equip-cursed">CURSED</span>`
    : "";
  return (
    `<span class="equip-item-cell">` +
    `<span class="equip-item-name" title="${name}">${name}</span>` +
    badge +
    `</span>`
  );
}

function spriteHtml(cls: CharacterClass, animate: boolean): string {
  const url = partyIdleSpriteUrl(cls);
  if (!url) {
    return (
      `<div class="equip-sheet-sprite equip-sprite-fallback" aria-hidden="true">` +
      `<span>${CLASS_INITIAL[cls]}</span></div>`
    );
  }
  const anim = animate ? " party-sprite-tile--anim" : "";
  return (
    `<div class="equip-sheet-sprite party-sprite-preview party-sprite-tile${anim}" data-cls="${cls}" aria-hidden="true">` +
    `<div class="party-sprite-zoom">` +
    `<img src="${url}" alt="" draggable="false" />` +
    `</div></div>`
  );
}

/** Decorative tabs — Equip lit; Optimum/Empty dim; never focused. */
function tabsHtml(): string {
  return (
    `<div class="equip-sheet-tabs" aria-hidden="true">` +
    `<span class="equip-sheet-tab equip-sheet-tab--active"><span class="equip-sheet-tab-cursor">▶</span>Equip</span>` +
    `<span class="equip-sheet-tab equip-sheet-tab--dim">Optimum</span>` +
    `<span class="equip-sheet-tab equip-sheet-tab--dim">Empty</span>` +
    `</div>`
  );
}

function statCellHtml(
  key: EquipStatKey,
  before: Record<EquipStatKey, number>,
  after: Record<EquipStatKey, number> | null,
  mode: EquipPreviewMode,
  gearMods: Record<EquipStatKey, EquipGearMod>
): string {
  const a = before[key];
  const mod = gearMods[key];
  const modHtml = mod
    ? `<span class="equip-stat-mod equip-stat-mod--${mod === "+" ? "up" : "down"}">${mod}</span>`
    : "";
  const showArrow = mode === "compare" && after !== null && after[key] !== a;
  const compareHtml = showArrow
    ? `<span class="equip-stat-arrow">→</span>` +
      `<span class="equip-stat-preview">${after![key]}</span>`
    : "";
  const cmpClass = showArrow ? " equip-stat-cell--compare" : "";
  return (
    `<div class="equip-stat-cell${cmpClass}">` +
    `<span class="equip-stat-label">${STAT_LABEL[key]}</span>` +
    `<span class="equip-stat-nums"><span class="equip-stat-value">${a}</span>${modHtml}</span>` +
    compareHtml +
    `</div>`
  );
}

function statsGridHtml(
  before: Record<EquipStatKey, number>,
  after: Record<EquipStatKey, number> | null,
  mode: EquipPreviewMode,
  gearMods: Record<EquipStatKey, EquipGearMod>
): string {
  const cells = STAT_PAIRS.map(
    ([left, right]) =>
      statCellHtml(left, before, after, mode, gearMods) +
      statCellHtml(right, before, after, mode, gearMods)
  ).join("");
  return `<div class="equip-sheet-stats">${cells}</div>`;
}

export function equipSheetHtml(args: {
  character: Character;
  loadout: Loadout;
  preview: Loadout | null;
  previewMode: EquipPreviewMode;
  warning?: string;
  bottomHtml: string;
  /** When set, lower band splits gear list (~55%) + description (~45%). */
  descHtml?: string;
  /** When false, never add --anim (caller already knows reduced motion). */
  animateSprite?: boolean;
}): string {
  const c = args.character;
  const before = summarizeLoadout(c, args.loadout);
  const after =
    args.previewMode === "compare" && args.preview
      ? summarizeLoadout(c, args.preview)
      : null;
  const gearMods = gearModsForLoadout(c, args.loadout);
  const animate =
    args.animateSprite !== false && !prefersReducedMotion();
  const note =
    args.warning && args.warning.length > 0
      ? `<div class="equip-sheet-note equip-warning">${escapeHtml(args.warning)}</div>`
      : "";

  return (
    `<div class="equip-sheet">` +
    tabsHtml() +
    `<div class="equip-sheet-band">` +
    spriteHtml(c.class, animate) +
    `<div class="equip-sheet-identity">` +
    `<div class="equip-sheet-name">${escapeHtml(c.name)}</div>` +
    `<div class="equip-id-row"><span class="equip-id-label">LV</span>` +
    `<span class="equip-id-value">${c.level}</span></div>` +
    `<div class="equip-id-row"><span class="equip-id-label">HP</span>` +
    `<span class="equip-id-value">${c.hp}/${c.maxHp}</span></div>` +
    (c.maxSp > 0
      ? `<div class="equip-id-row"><span class="equip-id-label">SP</span>` +
        `<span class="equip-id-value">${c.sp}/${c.maxSp}</span></div>`
      : "") +
    `</div>` +
    statsGridHtml(before, after, args.previewMode, gearMods) +
    `</div>` +
    note +
    `<div class="equip-sheet-divider" aria-hidden="true"></div>` +
    (args.descHtml
      ? `<div class="equip-sheet-lower">` +
        `<div class="equip-sheet-gear"><div class="equip-sheet-rows">${args.bottomHtml}</div></div>` +
        `<div class="equip-sheet-desc">${args.descHtml}</div>` +
        `</div>`
      : `<div class="equip-sheet-rows">${args.bottomHtml}</div>`) +
    `</div>`
  );
}

const STAT_DELTA_LABEL: Record<string, string> = {
  str: "STR",
  int: "INT",
  pie: "PIE",
  vit: "VIT",
  agi: "AGI",
  luk: "LUK",
};

const EMPTY_SLOT_BLURB: Record<string, string> = {
  Weapon: "Equip from inventory to raise ATK and other bonuses.",
  Body: "Equip from inventory to gain DEF and other bonuses.",
  Shield: "Equip from inventory to gain DEF and other bonuses.",
  Head: "Equip from inventory to gain DEF and other bonuses.",
};

/** Presentation deltas for the description panel (not combat math). */
export function equipItemDeltas(
  item: ItemDef
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  if (item.attackBonus !== undefined && item.attackBonus !== 0) {
    out.push({ label: "ATK", value: fmt(item.attackBonus) });
  }
  if (item.defenseBonus !== undefined && item.defenseBonus !== 0) {
    out.push({ label: "DEF", value: fmt(item.defenseBonus) });
  }
  if (item.statBonuses) {
    for (const key of ["str", "int", "pie", "vit", "agi", "luk"] as const) {
      const v = item.statBonuses[key];
      if (v !== undefined && v !== 0) {
        out.push({ label: STAT_DELTA_LABEL[key]!, value: fmt(v) });
      }
    }
  }
  return out;
}

/**
 * Flavor line for the equip panel. The curse warning is mechanical
 * information ("you cannot remove this"), so it still wins over authored
 * copy; otherwise prefer the item's own description and fall back to a
 * procedural line only for items that don't have one yet.
 */
export function equipItemFlavor(item: ItemDef): string {
  if (item.cursed) return "A cursed relic. It will not come off.";
  if (item.description) return item.description;
  if (item.type === "weapon") {
    const range = item.range ?? "close";
    return `A ${range}-range weapon for adventurers.`;
  }
  if (item.slot === "body") return "Body armor worn into the labyrinth.";
  if (item.slot === "shield") return "A shield for deflecting blows.";
  if (item.slot === "head") return "Head protection for the dungeon.";
  return "Equipment for the party.";
}

export type EquipDescPanelArgs =
  | { kind: "item"; item: ItemDef }
  | { kind: "empty"; slotLabel: string }
  | { kind: "auto" };

/** Right-hand description panel for the slot-phase lower band. */
export function equipDescPanelHtml(args: EquipDescPanelArgs): string {
  if (args.kind === "auto") {
    return (
      `<div class="equip-desc-title">Auto-Equip</div>` +
      `<div class="equip-desc-rule" aria-hidden="true"></div>` +
      `<div class="equip-desc-body">Equips the highest-stat gear you own for each slot.</div>`
    );
  }
  if (args.kind === "empty") {
    const blurb =
      EMPTY_SLOT_BLURB[args.slotLabel] ??
      "Equip from inventory to gain bonuses.";
    return (
      `<div class="equip-desc-title">${escapeHtml(args.slotLabel)}</div>` +
      `<div class="equip-desc-rule" aria-hidden="true"></div>` +
      `<div class="equip-desc-body">${escapeHtml(blurb)}</div>`
    );
  }
  const item = args.item;
  const deltas = equipItemDeltas(item)
    .map(
      (d) =>
        `<div class="equip-desc-delta">` +
        `<span class="equip-desc-delta-label">${d.label}</span>` +
        `<span class="equip-desc-delta-value">${d.value}</span></div>`
    )
    .join("");
  return (
    `<div class="equip-desc-title">${escapeHtml(item.name)}</div>` +
    `<div class="equip-desc-rule" aria-hidden="true"></div>` +
    `<div class="equip-desc-body">${escapeHtml(equipItemFlavor(item))}</div>` +
    (deltas ? `<div class="equip-desc-deltas">${deltas}</div>` : "")
  );
}

/** Resolve desc panel from slot-phase focus. */
export function equipDescForFocus(
  focusedIndex: number,
  slots: { slot: EquipSlot; label: string }[],
  loadout: Loadout,
  equippedInSlot: (loadout: Loadout, slot: EquipSlot) => ItemDef | undefined
): string {
  if (focusedIndex >= slots.length) {
    return equipDescPanelHtml({ kind: "auto" });
  }
  const { slot, label } = slots[focusedIndex]!;
  const item = equippedInSlot(loadout, slot);
  if (!item) return equipDescPanelHtml({ kind: "empty", slotLabel: label });
  return equipDescPanelHtml({ kind: "item", item });
}

/** Build focusable slot/Auto rows for the sheet bottom. */
export function equipSlotRowsHtml(
  slots: { slot: EquipSlot; label: string }[],
  loadout: Loadout,
  focusedIndex: number,
  equippedInSlot: (loadout: Loadout, slot: EquipSlot) => ItemDef | undefined
): string {
  const parts: string[] = [];
  slots.forEach(({ slot, label }, i) => {
    const item = equippedInSlot(loadout, slot);
    const sel = i === focusedIndex ? " selected" : "";
    parts.push(
      `<div class="equip-sheet-row${sel}" data-kind="slot" data-index="${i}">` +
        `<span class="equip-row-label">${escapeHtml(label)}</span>` +
        equipItemNameHtml(item) +
        `</div>`
    );
  });
  const optSel = focusedIndex === slots.length ? " selected" : "";
  parts.push(
    `<div class="equip-sheet-row${optSel}" data-kind="auto-equip" data-index="${slots.length}">` +
      `<span class="equip-row-label">Auto</span>` +
      `<span class="equip-item-name equip-item-name--dim">best owned gear</span>` +
      `</div>`
  );
  return parts.join("");
}

export { STAT_ORDER, STAT_PAIRS };
