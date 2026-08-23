/**
 * Party Creation UI controller — design doc Section 4.
 *
 * Opens on a carousel choice screen: four pre-made parties + Custom, or build
 * a custom one. Esc from slot 1 of the editor returns to the choice screen;
 * Esc from the choice screen cancels.
 *
 * Keyboard (choice):
 *   Left/Right   cycle carousel (wraps; local DAS/ARR while held)
 *   Enter/Space  confirm selection
 *   Y            edit focused preset as custom (or empty editor on Custom)
 *   Esc          cancel
 *
 * Keyboard (editor):
 *   Up/Down      move field cursor (name / race / alignment / class)
 *   Left/Right   cycle the selected field's value (race / alignment / class)
 *   letters      append to the name (when the name field is selected)
 *   Backspace    delete last name character
 *   R            re-roll stats
 *   Enter        confirm this character and advance to the next slot
 *   Esc          go back one slot (or return to the choice screen from slot 1)
 */

import {
  RACES,
  ALIGNMENTS,
  CLASSES,
  rollStatsForRace,
  computeMaxHp,
  computeMaxSp,
  createCharacter,
  PARTY_SIZE,
  type Race,
  type Alignment,
  type CharacterClass,
  type Character,
  type Stats,
} from "../game/party";
import {
  createPresetParty,
  PRESET_PARTIES,
  CLASS_ROLE,
  type PresetPartyDef,
  type PresetPartyId,
  type PartyRole,
  type PartyBarScore,
} from "../game/preset-parties";
import { spellsForClass } from "../data/spells";
import { FF6Window } from "./ff6-window-library";
import { audio } from "./audio";
import { partyIdleSpriteUrl } from "./party-sprite-cache";
import {
  prefersReducedMotion,
  startPartyIdleAnim,
  type PartyIdleAnimHandle,
} from "./party-idle-anim";

const RACE_LIST = Object.keys(RACES) as Race[];
const CLASS_LIST = Object.keys(CLASSES) as CharacterClass[];

const CLASS_ALIGNMENT_RESTRICTIONS: Record<CharacterClass, Alignment[]> = {
  Fighter: ["Good", "Neutral", "Evil"],
  Mage: ["Good", "Neutral", "Evil"],
  Priest: ["Good", "Neutral", "Evil"],
  Thief: ["Good", "Neutral", "Evil"],
  Halberdier: ["Good", "Neutral", "Evil"],
  Duelist: ["Good", "Neutral", "Evil"],
  Crusader: ["Good", "Neutral", "Evil"],
  Ninja: ["Good", "Neutral", "Evil"],
};

const DEFAULT_NAMES = ["Aria", "Coda", "Dell", "Eve"];

/** Silhouette glyphs for comp-strip pips (color reinforces; shape carries meaning). */
const ROLE_GLYPH: Record<PartyRole, string> = {
  tank: "◆",
  healer: "❀",
  physDps: "†",
  magicDps: "✦",
  support: "▲",
  hybrid: "◈",
};

const CAROUSEL_SLIDE_MS = 200;
const CONFIRM_FLASH_MS = 110;
/** Delayed auto-shift before repeat while Left/Right is held. */
const DAS_MS = 250;
/** Auto-repeat interval while Left/Right is held. */
const ARR_MS = 100;

const CUSTOM_DETAIL =
  "Choose any four recruits and shape their roles yourself.";

type Field = "name" | "race" | "alignment" | "class";
const FIELDS: Field[] = ["name", "race", "alignment", "class"];

interface SlotDraft {
  name: string;
  race: Race;
  alignment: Alignment;
  cls: CharacterClass;
  stats: Stats;
}

export interface PartyCreationOptions {
  panel: HTMLElement;
  onConfirm: (party: Character[]) => void;
  onCancel: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function segmentedBar(label: string, filled: PartyBarScore): string {
  let blocks = "";
  for (let i = 1; i <= 5; i++) {
    blocks += i <= filled ? "▰" : "▱";
  }
  return (
    `<div class="party-carousel-bar" aria-label="${label} ${filled} of 5">` +
    `<span class="party-carousel-bar-label">${label}</span>` +
    `<span class="party-carousel-bar-blocks">${blocks}</span>` +
    `</div>`
  );
}

export class PartyCreationController {
  private panel: HTMLElement;
  private onConfirm: (party: Character[]) => void;
  private onCancel: () => void;
  private drafts: SlotDraft[] = [];
  private slotIndex = 0;
  private fieldIndex = 0; // index into FIELDS
  private flash = "";
  /** Opening screen: pick a pre-made party or the custom editor. */
  private phase: "choice" | "edit" = "choice";
  /** 0..PRESET_PARTIES.length-1 = preset; last index = Custom. */
  private choiceIndex = 0;
  private choiceHasRendered = false;
  /** Reset panel scroll when advancing slots so the header stays visible. */
  private scrollResetPending = false;

  /** Held carousel direction for local DAS/ARR (−1 left, +1 right, 0 none). */
  private heldDir: -1 | 0 | 1 = 0;
  private dasRaf: number | null = null;
  private holdStartedAt = 0;
  private lastRepeatAt = 0;

  private idleAnim: PartyIdleAnimHandle | null = null;
  private slideTimeout: ReturnType<typeof setTimeout> | null = null;
  private sliding = false;
  private confirmFlash = false;
  private destroyed = false;
  /** True when drafts were seeded from a preset via Y — don't pop/push mid-edit. */
  private editorSeeded = false;

  constructor(opts: PartyCreationOptions) {
    this.panel = opts.panel;
    this.onConfirm = opts.onConfirm;
    this.onCancel = opts.onCancel;
    this.panel.style.display = "flex";
    // Start with a fresh draft for slot 0 using a random name + Human/Neutral/Fighter.
    this.drafts.push(this.freshDraft(0));
    this.render();
  }

  /** Tear down timers/rAF. Safe to call more than once. */
  destroy(): void {
    this.destroyed = true;
    this.stopDasArr();
    this.stopIdleAnim();
    if (this.slideTimeout !== null) {
      clearTimeout(this.slideTimeout);
      this.slideTimeout = null;
    }
  }

  /**
   * Clear held Left/Right (keyboard keyup or gamepad release).
   * Pass the released direction so a late opposite press is not cleared.
   */
  releaseDirection(dir: -1 | 1): void {
    if (this.heldDir === dir) {
      this.heldDir = 0;
      this.stopDasArr();
    }
  }

  handleKey(key: string): void {
    const lower = key.toLowerCase();

    if (this.phase === "choice") {
      this.handleChoiceKey(key, lower);
      return;
    }

    const field = FIELDS[this.fieldIndex];

    if (lower === "escape") {
      this.goBack();
      return;
    }
    if (lower === "r") {
      this.reroll();
      return;
    }
    if (key === "Enter" || key === " ") {
      this.confirmSlot();
      return;
    }
    if (lower === "arrowup" || lower === "w") {
      this.fieldIndex = (this.fieldIndex - 1 + FIELDS.length) % FIELDS.length;
      this.flash = "";
      this.render();
      return;
    }
    if (lower === "arrowdown" || lower === "s") {
      this.fieldIndex = (this.fieldIndex + 1) % FIELDS.length;
      this.flash = "";
      this.render();
      return;
    }

    if (field === "name") {
      // Name entry: letters append, backspace deletes.
      if (key === "Backspace") {
        const d = this.currentDraft();
        d.name = d.name.slice(0, -1);
        this.flash = "";
        this.render();
        return;
      }
      // Accept printable single-char letters/digits/spaces.
      if (key.length === 1 && /[A-Za-z0-9 ]/.test(key)) {
        const d = this.currentDraft();
        if (d.name.length < 12) d.name += key;
        this.flash = "";
        this.render();
        return;
      }
      return;
    }

    // race / alignment / class: cycle with left/right.
    if (lower === "arrowleft" || lower === "a") {
      this.cycleField(field, -1);
      return;
    }
    if (lower === "arrowright") {
      this.cycleField(field, 1);
      return;
    }
  }

  private choiceCount(): number {
    return PRESET_PARTIES.length + 1; // presets + Custom
  }

  private isCustomChoice(): boolean {
    return this.choiceIndex >= PRESET_PARTIES.length;
  }

  private wrapChoice(index: number): number {
    const n = this.choiceCount();
    return ((index % n) + n) % n;
  }

  private handleChoiceKey(key: string, lower: string): void {
    if (lower === "escape") {
      audio.uiCancel();
      this.destroy();
      this.onCancel();
      return;
    }
    if (lower === "arrowleft") {
      this.onCarouselHold(-1);
      return;
    }
    if (lower === "arrowright") {
      this.onCarouselHold(1);
      return;
    }
    // Up/Down no-op — spatial model is horizontal only.
    if (lower === "arrowup" || lower === "arrowdown" || lower === "w" || lower === "s") {
      return;
    }
    if (lower === "y") {
      audio.uiConfirm();
      if (this.isCustomChoice()) this.enterEditor();
      else this.enterEditorFromPreset(PRESET_PARTIES[this.choiceIndex]!);
      return;
    }
    if (key === "Enter" || key === " ") {
      this.confirmChoiceWithFlash();
    }
  }

  private onCarouselHold(dir: -1 | 1): void {
    // OS key-repeat: already held this way — DAS/ARR owns further steps.
    if (this.heldDir === dir) return;
    this.heldDir = dir;
    this.holdStartedAt = performance.now();
    this.lastRepeatAt = this.holdStartedAt;
    this.cycleChoice(dir);
    this.startDasArr();
  }

  private startDasArr(): void {
    if (this.dasRaf !== null) return;
    const tick = (now: number) => {
      this.dasRaf = null;
      if (this.destroyed || this.phase !== "choice" || this.heldDir === 0) return;
      const heldFor = now - this.holdStartedAt;
      if (heldFor >= DAS_MS && now - this.lastRepeatAt >= ARR_MS) {
        this.lastRepeatAt = now;
        this.cycleChoice(this.heldDir);
      }
      this.dasRaf = requestAnimationFrame(tick);
    };
    this.dasRaf = requestAnimationFrame(tick);
  }

  private stopDasArr(): void {
    if (this.dasRaf !== null) {
      cancelAnimationFrame(this.dasRaf);
      this.dasRaf = null;
    }
  }

  private cycleChoice(dir: -1 | 1): void {
    if (this.sliding || this.destroyed || this.phase !== "choice") return;
    audio.uiCursor();
    const next = this.wrapChoice(this.choiceIndex + dir);

    if (prefersReducedMotion()) {
      this.choiceIndex = next;
      this.render();
      return;
    }

    this.sliding = true;
    const track = this.panel.querySelector<HTMLElement>(".party-carousel-track");
    if (!track) {
      this.choiceIndex = next;
      this.sliding = false;
      this.render();
      return;
    }

    // Rest is translateX(-70%); each card is 80% of the viewport.
    const toPct = dir > 0 ? -150 : 10;
    track.style.transition = `transform ${CAROUSEL_SLIDE_MS}ms ease-out`;
    track.style.transform = `translateX(${toPct}%)`;

    this.slideTimeout = setTimeout(() => {
      this.slideTimeout = null;
      this.choiceIndex = next;
      this.sliding = false;
      this.render();
    }, CAROUSEL_SLIDE_MS);
  }

  private confirmChoiceWithFlash(): void {
    audio.uiConfirm();
    if (prefersReducedMotion()) {
      this.confirmChoice();
      return;
    }
    this.confirmFlash = true;
    this.render();
    setTimeout(() => {
      if (this.destroyed) return;
      this.confirmFlash = false;
      this.confirmChoice();
    }, CONFIRM_FLASH_MS);
  }

  private confirmChoice(): void {
    if (this.isCustomChoice()) this.enterEditor();
    else this.usePresetParty(PRESET_PARTIES[this.choiceIndex]!.id);
  }

  private usePresetParty(id: PresetPartyId): void {
    this.destroy();
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onConfirm(createPresetParty(id));
  }

  private enterEditor(): void {
    this.stopDasArr();
    this.stopIdleAnim();
    this.heldDir = 0;
    this.editorSeeded = false;
    this.drafts = [this.freshDraft(0)];
    this.slotIndex = 0;
    this.fieldIndex = 0;
    this.phase = "edit";
    this.flash = "";
    this.scrollResetPending = true;
    this.render();
  }

  private enterEditorFromPreset(def: PresetPartyDef): void {
    this.stopDasArr();
    this.stopIdleAnim();
    this.heldDir = 0;
    this.editorSeeded = true;
    const ordered = [...def.members].sort((a, b) => a.slot - b.slot);
    this.drafts = ordered.map((m) => ({
      name: m.name,
      race: m.race,
      alignment: m.alignment,
      cls: m.cls,
      stats: rollStatsForRace(m.race),
    }));
    this.slotIndex = 0;
    this.fieldIndex = 0;
    this.phase = "edit";
    this.flash = "";
    this.scrollResetPending = true;
    this.render();
  }

  private fieldHint(field: Field, d: SlotDraft): string {
    switch (field) {
      case "name":
        return "Type to edit · max 12 characters";
      case "race":
        return RACES[d.race].description;
      case "alignment":
        return "Good and Evil cannot party together.";
      case "class":
        return CLASSES[d.cls].description;
    }
  }

  // --- Draft management ---------------------------------------------------

  private currentDraft(): SlotDraft {
    return this.drafts[this.slotIndex];
  }

  private freshDraft(slot: number): SlotDraft {
    const race: Race = "Human";
    return {
      name: DEFAULT_NAMES[slot % DEFAULT_NAMES.length],
      race,
      alignment: "Neutral",
      cls: "Fighter",
      stats: rollStatsForRace(race),
    };
  }

  private cycleField(field: Field, dir: 1 | -1): void {
    const d = this.currentDraft();
    if (field === "race") {
      const i = RACE_LIST.indexOf(d.race);
      d.race = RACE_LIST[(i + dir + RACE_LIST.length) % RACE_LIST.length];
      // Re-roll stats when race changes so racial modifiers apply.
      d.stats = rollStatsForRace(d.race);
    } else if (field === "alignment") {
      const i = ALIGNMENTS.indexOf(d.alignment);
      d.alignment = ALIGNMENTS[(i + dir + ALIGNMENTS.length) % ALIGNMENTS.length];
    } else if (field === "class") {
      const i = CLASS_LIST.indexOf(d.cls);
      d.cls = CLASS_LIST[(i + dir + CLASS_LIST.length) % CLASS_LIST.length];
    }
    this.flash = "";
    this.render();
  }

  private reroll(): void {
    const d = this.currentDraft();
    d.stats = rollStatsForRace(d.race);
    this.flash = "Stats re-rolled.";
    this.render();
  }

  private confirmSlot(): void {
    const d = this.currentDraft();
    if (d.name.trim().length === 0) {
      this.flash = "Enter a name first.";
      this.render();
      return;
    }
    // Validate class alignment restrictions.
    const allowedAlignments = CLASS_ALIGNMENT_RESTRICTIONS[d.cls];
    if (!allowedAlignments.includes(d.alignment)) {
      this.flash = `${d.cls} cannot be ${d.alignment}.`;
      this.render();
      return;
    }
    // Validate alignment against already-confirmed slots (no Good + Evil mix).
    const confirmed = this.drafts.slice(0, this.slotIndex);
    const trialAlignments = [...confirmed.map((c) => c.alignment), d.alignment];
    const hasGood = trialAlignments.includes("Good");
    const hasEvil = trialAlignments.includes("Evil");
    if (hasGood && hasEvil) {
      this.flash = "Evil and Good characters cannot party together.";
      this.render();
      return;
    }
    // Advance to the next slot, or finish if this was the last slot.
    if (this.slotIndex >= PARTY_SIZE - 1) {
      this.finish();
      return;
    }
    this.slotIndex++;
    if (!this.editorSeeded) {
      this.drafts.push(this.freshDraft(this.slotIndex));
    }
    this.fieldIndex = 0;
    this.flash = "";
    this.scrollResetPending = true;
    this.render();
  }

  private goBack(): void {
    if (this.slotIndex === 0) {
      // Return to the opening choice screen rather than cancelling outright.
      this.phase = "choice";
      this.flash = "";
      this.heldDir = 0;
      this.editorSeeded = false;
      this.render();
      return;
    }
    if (!this.editorSeeded) {
      this.drafts.pop();
    }
    this.slotIndex--;
    this.flash = "";
    this.scrollResetPending = true;
    this.render();
  }

  private finish(): void {
    // Build the final party from the drafts.
    const party: Character[] = this.drafts.map((d, i) => {
      const char = createCharacter(`c${i + 1}`, d.name.trim(), d.race, d.alignment, d.cls, i);
      // Grant tier-1 spells to casters (matches createDefaultParty behavior).
      const tier1 = spellsForClass(d.cls, 1);
      char.knownSpellIds = tier1.map((s) => s.id);
      return char;
    });
    this.destroy();
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onConfirm(party);
  }

  // --- Rendering ----------------------------------------------------------

  /** Idle strip clipped to frame 0; mirrored via tile container (matches combat). */
  private spritePreviewHtml(
    cls: CharacterClass,
    opts: { label?: string; size?: "lg" | "sm"; anim?: boolean } = {}
  ): string {
    const size = opts.size ?? "lg";
    const label = opts.label ?? cls;
    const src = partyIdleSpriteUrl(cls);
    const animClass = opts.anim ? " party-sprite-tile--anim" : "";
    return (
      `<div class="party-sprite-preview party-sprite-preview--${size} party-sprite-tile${animClass}"` +
      ` data-cls="${cls}" title="${escapeHtml(label)}">` +
      `<div class="party-sprite-zoom">` +
      `<img src="${src}" alt="${escapeHtml(label)}" width="100" height="100" decoding="async" />` +
      `</div>` +
      `</div>`
    );
  }

  private rolePipHtml(cls: CharacterClass): string {
    const role = CLASS_ROLE[cls];
    const glyph = ROLE_GLYPH[role];
    return (
      `<span class="party-role-pip party-role-pip--${role}" title="${escapeHtml(cls)}" aria-label="${escapeHtml(cls)}">` +
      `${glyph}</span>`
    );
  }

  private memberTileHtml(
    member: { name: string; cls: CharacterClass } | null,
    empty: boolean
  ): string {
    if (empty || !member) {
      return (
        `<div class="party-carousel-slot party-carousel-slot--empty">` +
        `<div class="party-carousel-slot-tile" aria-hidden="true"></div>` +
        `<div class="party-carousel-slot-name">&nbsp;</div>` +
        `</div>`
      );
    }
    return (
      `<div class="party-carousel-slot">` +
      this.spritePreviewHtml(member.cls, {
        label: `${member.name} · ${member.cls}`,
        size: "lg",
        anim: true,
      }) +
      `<div class="party-carousel-slot-name">${escapeHtml(member.cls)}</div>` +
      `</div>`
    );
  }

  private cardHtml(
    stopIndex: number,
    opts: { focused: boolean; peek?: "left" | "right" }
  ): string {
    const isCustom = stopIndex >= PRESET_PARTIES.length;
    const peekClass = opts.peek ? ` party-carousel-card--peek party-carousel-card--peek-${opts.peek}` : "";
    const focusClass = opts.focused ? " party-carousel-card--focus" : "";
    const flashClass = opts.focused && this.confirmFlash ? " party-carousel-card--confirm" : "";

    if (isCustom) {
      // Empty dotted slots — last-used-from-save intentionally out of scope for v1.
      const slots = [0, 1, 2, 3].map(() => this.memberTileHtml(null, true)).join("");
      return (
        `<div class="party-carousel-card party-carousel-card--custom${peekClass}${focusClass}${flashClass}"` +
        ` data-stop="${stopIndex}">` +
        `<div class="party-carousel-card-header">` +
        `<div class="party-carousel-card-title">Custom Party</div>` +
        `<div class="party-carousel-comp" aria-hidden="true"></div>` +
        `</div>` +
        `<div class="party-carousel-grid">${slots}</div>` +
        `<div class="party-carousel-bars party-carousel-bars--empty" aria-hidden="true"></div>` +
        `<div class="party-carousel-tagline">&nbsp;</div>` +
        (opts.peek === "left" ? `<span class="party-carousel-chevron" aria-hidden="true">‹</span>` : "") +
        (opts.peek === "right" ? `<span class="party-carousel-chevron" aria-hidden="true">›</span>` : "") +
        `</div>`
      );
    }

    const preset = PRESET_PARTIES[stopIndex]!;
    const bySlot = [...preset.members].sort((a, b) => a.slot - b.slot);
    const pips = bySlot.map((m) => this.rolePipHtml(m.cls)).join("");
    const slots = bySlot.map((m) => this.memberTileHtml(m, false)).join("");
    const bars =
      segmentedBar("ATK", preset.atk) +
      segmentedBar("DEF", preset.def) +
      segmentedBar("SUP", preset.sup);

    return (
      `<div class="party-carousel-card${peekClass}${focusClass}${flashClass}" data-stop="${stopIndex}">` +
      `<div class="party-carousel-card-header">` +
      `<div class="party-carousel-card-title">${escapeHtml(preset.label)}</div>` +
      `<div class="party-carousel-comp" aria-label="Party roles">${pips}</div>` +
      `</div>` +
      `<div class="party-carousel-grid">${slots}</div>` +
      `<div class="party-carousel-bars">${bars}</div>` +
      `<div class="party-carousel-tagline">“${escapeHtml(preset.tagline)}”</div>` +
      (opts.peek === "left" ? `<span class="party-carousel-chevron" aria-hidden="true">‹</span>` : "") +
      (opts.peek === "right" ? `<span class="party-carousel-chevron" aria-hidden="true">›</span>` : "") +
      `</div>`
    );
  }

  private detailStripHtml(stopIndex: number): string {
    if (stopIndex >= PRESET_PARTIES.length) {
      return (
        `<div class="party-carousel-detail party-carousel-detail--custom">` +
        `<div class="party-carousel-detail-custom">${escapeHtml(CUSTOM_DETAIL)}</div>` +
        `</div>`
      );
    }
    const preset = PRESET_PARTIES[stopIndex]!;
    return (
      `<div class="party-carousel-detail">` +
      `<div class="party-carousel-pro">▲ ${escapeHtml(preset.strength)}</div>` +
      `<div class="party-carousel-con">▼ ${escapeHtml(preset.weakness)}</div>` +
      `</div>`
    );
  }

  private render(): void {
    if (this.phase === "choice") {
      this.renderChoice();
      return;
    }
    this.stopIdleAnim();
    const d = this.currentDraft();
    const maxHp = computeMaxHp(d.stats, d.cls);
    const maxSp = computeMaxSp(d.stats, d.cls);
    const lines: string[] = [];
    const confirmedCount = this.slotIndex;
    const field = FIELDS[this.fieldIndex];
    const classSelected = field === "class";

    lines.push(`<div class="party-create">`);
    lines.push(`<div class="party-create-header">[+] Party Creation</div>`);
    lines.push(
      `<div class="party-create-meta">Slot ${this.slotIndex + 1} of ${PARTY_SIZE} · ${confirmedCount} confirmed</div>`
    );

    lines.push(`<div class="party-create-main">`);
    lines.push(`<div class="party-create-fields">`);
    lines.push(`<div class="party-edit">`);
    for (let fi = 0; fi < FIELDS.length; fi++) {
      const f = FIELDS[fi];
      const selected = fi === this.fieldIndex;
      const marker = selected ? "▶" : " ";
      let value: string;
      if (f === "name") value = d.name || "(empty)";
      else if (f === "race") value = d.race;
      else if (f === "alignment") value = d.alignment;
      else value = d.cls;
      lines.push(
        `<div class="party-field ${selected ? "selected" : ""}">` +
        `<span class="tm-marker">${marker}</span>` +
        `<span class="pf-label">${f.toUpperCase()}</span>` +
        `<span class="pf-value">${escapeHtml(value)}</span>` +
        `</div>`
      );
    }
    lines.push(`</div>`);

    lines.push(`<div class="party-hint">${this.fieldHint(field, d)}</div>`);

    const s = d.stats;
    lines.push(
      `<div class="party-stats">` +
      `STR ${s.str} · INT ${s.int} · PIE ${s.pie} · VIT ${s.vit} · AGI ${s.agi} · LUK ${s.luk} · ` +
      `HP ${maxHp} · SP ${maxSp}` +
      `</div>`
    );
    lines.push(`</div>`); // party-create-fields

    lines.push(
      `<div class="party-sprite-stage${classSelected ? " is-focus" : ""}">` +
      this.spritePreviewHtml(d.cls, { label: `${d.name || "Adventurer"} · ${d.cls}` }) +
      `<div class="party-sprite-caption">${d.cls}</div>` +
      `</div>`
    );
    lines.push(`</div>`); // party-create-main

    lines.push(
      `<div class="party-help">[↑↓] field · [←→] cycle · [R] reroll · [Enter] confirm · [Esc] back</div>`
    );

    if (confirmedCount > 0) {
      lines.push(`<div class="party-confirmed">`);
      for (let i = 0; i < confirmedCount; i++) {
        const c = this.drafts[i];
        lines.push(
          `<span class="party-confirmed-chip" title="${c.race} ${c.alignment} ${c.cls}">` +
          this.spritePreviewHtml(c.cls, { label: `${c.name} · ${c.cls}`, size: "sm" }) +
          `<span class="party-confirmed-chip-text"><b>${i + 1}.${escapeHtml(c.name)}</b> ${c.cls}</span>` +
          `</span>`
        );
      }
      lines.push(`</div>`);
    }

    if (this.flash) {
      lines.push(`<div class="town-flash">${escapeHtml(this.flash)}</div>`);
    }
    lines.push(`</div>`);

    this.panel.innerHTML = lines.join("");

    if (this.scrollResetPending) {
      this.panel.scrollTop = 0;
      this.scrollResetPending = false;
      return;
    }

    const selectedEl = this.panel.querySelector<HTMLElement>(".party-field.selected");
    if (selectedEl) {
      const above = selectedEl.offsetTop;
      const below = above + selectedEl.offsetHeight;
      if (above < this.panel.scrollTop) {
        this.panel.scrollTop = above;
      } else if (below > this.panel.scrollTop + this.panel.clientHeight) {
        this.panel.scrollTop = below - this.panel.clientHeight;
      }
    }
  }

  private renderChoice(): void {
    const animated = !this.choiceHasRendered;
    this.choiceHasRendered = true;

    const prev = this.wrapChoice(this.choiceIndex - 1);
    const next = this.wrapChoice(this.choiceIndex + 1);

    const contentHtml =
      `<div class="party-carousel">` +
      `<div class="party-carousel-viewport">` +
      `<div class="party-carousel-track">` +
      this.cardHtml(prev, { focused: false, peek: "left" }) +
      this.cardHtml(this.choiceIndex, { focused: true }) +
      this.cardHtml(next, { focused: false, peek: "right" }) +
      `</div>` +
      `</div>` +
      this.detailStripHtml(this.choiceIndex) +
      `</div>`;

    const win = new FF6Window({
      title: "Assemble Your Party",
      items: [],
      selectedIndex: 0,
      mode: "status",
      width: "full",
      footer: "D-pad · A confirm · Y edit · B back",
      animated,
      contentHtml,
      onBack: () => {
        this.destroy();
        this.onCancel();
      },
    });
    this.panel.innerHTML = "";
    const el = win.render();
    this.panel.appendChild(el);
    this.startIdleAnim();
  }

  private stopIdleAnim(): void {
    this.idleAnim?.stop();
    this.idleAnim = null;
  }

  private startIdleAnim(): void {
    this.stopIdleAnim();
    if (this.destroyed || this.phase !== "choice") return;
    this.idleAnim = startPartyIdleAnim(this.panel, {
      isActive: () => !this.destroyed && this.phase === "choice",
    });
  }
}
