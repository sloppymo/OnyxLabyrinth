/**
 * Party Creation UI controller — design doc Section 4.
 *
 * Opens on a choice screen: four pre-made parties with different strengths/
 * weaknesses, or build a custom one. Esc from slot 1 of the editor returns to
 * the choice screen; Esc from the choice screen cancels.
 *
 * Keyboard (choice):
 *   Up/Down      move cursor
 *   1–4          pick a preset
 *   C            open custom editor
 *   Enter/Space  confirm selection
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
import { createPresetParty, PRESET_PARTIES, type PresetPartyId } from "../game/preset-parties";
import { spellsForClass } from "../data/spells";
import { FF6Window } from "./ff6-window-library";
import { audio } from "./audio";
import { partyIdleSpriteUrl } from "./party-sprite-cache";

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
};

const DEFAULT_NAMES = ["Aria", "Coda", "Dell", "Eve"];

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
  /** 0..PRESET_PARTIES.length-1 = preset; last index = Create Your Own. */
  private choiceIndex = 0;
  private choiceHasRendered = false;
  /** Reset panel scroll when advancing slots so the header stays visible. */
  private scrollResetPending = false;
  /**
   * Swallow the first key after open. Prologue's final Enter (and key-repeat
   * from New Game / Reform Party) must not auto-pick Default Party or cancel.
   * Same pattern as PerkSelectController / justOpenedSaveMenu.
   */
  private justOpened = true;

  constructor(opts: PartyCreationOptions) {
    this.panel = opts.panel;
    this.onConfirm = opts.onConfirm;
    this.onCancel = opts.onCancel;
    this.panel.style.display = "flex";
    // Start with a fresh draft for slot 0 using a random name + Human/Neutral/Fighter.
    this.drafts.push(this.freshDraft(0));
    this.render();
  }

  handleKey(key: string): void {
    if (this.justOpened) {
      this.justOpened = false;
      return;
    }
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
    return PRESET_PARTIES.length + 1; // presets + Create Your Own
  }

  private isCustomChoice(): boolean {
    return this.choiceIndex >= PRESET_PARTIES.length;
  }

  private handleChoiceKey(key: string, lower: string): void {
    if (lower === "escape") {
      audio.uiCancel();
      this.onCancel();
      return;
    }
    if (lower === "arrowup" || lower === "w") {
      this.choiceIndex = (this.choiceIndex - 1 + this.choiceCount()) % this.choiceCount();
      audio.uiCursor();
      this.render();
      return;
    }
    if (lower === "arrowdown" || lower === "s") {
      this.choiceIndex = (this.choiceIndex + 1) % this.choiceCount();
      audio.uiCursor();
      this.render();
      return;
    }
    // 1–4 pick a preset; C opens the custom editor.
    if (lower === "1" || lower === "2" || lower === "3" || lower === "4") {
      const idx = Number(lower) - 1;
      if (idx < PRESET_PARTIES.length) {
        audio.uiConfirm();
        this.usePresetParty(PRESET_PARTIES[idx]!.id);
      }
      return;
    }
    if (lower === "c") {
      audio.uiConfirm();
      this.enterEditor();
      return;
    }
    if (key === "Enter" || key === " ") {
      audio.uiConfirm();
      this.confirmChoice();
    }
  }

  private confirmChoice(): void {
    if (this.isCustomChoice()) this.enterEditor();
    else this.usePresetParty(PRESET_PARTIES[this.choiceIndex]!.id);
  }

  private usePresetParty(id: PresetPartyId): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onConfirm(createPresetParty(id));
  }

  private enterEditor(): void {
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
    this.drafts.push(this.freshDraft(this.slotIndex));
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
      this.render();
      return;
    }
    this.drafts.pop();
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
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onConfirm(party);
  }

  // --- Rendering ----------------------------------------------------------

  /** Idle strip clipped to frame 0; mirrored to match combat (party faces left). */
  private spritePreviewHtml(
    cls: CharacterClass,
    opts: { label?: string; size?: "lg" | "sm" } = {}
  ): string {
    const size = opts.size ?? "lg";
    const label = opts.label ?? cls;
    const src = partyIdleSpriteUrl(cls);
    return (
      `<div class="party-sprite-preview party-sprite-preview--${size}" title="${label}">` +
      `<img src="${src}" alt="${label}" width="100" height="100" decoding="async" />` +
      `</div>`
    );
  }

  private render(): void {
    if (this.phase === "choice") {
      this.renderChoice();
      return;
    }
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
        `<span class="pf-value">${value}</span>` +
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
          `<span class="party-confirmed-chip-text"><b>${i + 1}.${c.name}</b> ${c.cls}</span>` +
          `</span>`
        );
      }
      lines.push(`</div>`);
    }

    if (this.flash) {
      lines.push(`<div class="town-flash">${this.flash}</div>`);
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

    let spritesHtml = "";
    let blurbHtml = `<div class="ff6-arena-meta">Four souls brave the labyrinth. Who will they be?</div>`;
    if (!this.isCustomChoice()) {
      const preset = PRESET_PARTIES[this.choiceIndex]!;
      spritesHtml = preset.members
        .map((m) =>
          this.spritePreviewHtml(m.cls, { label: `${m.name} · ${m.cls}`, size: "sm" })
        )
        .join("");
      blurbHtml =
        `<div class="ff6-arena-meta">${preset.strength}</div>` +
        `<div class="party-choice-weak">${preset.weakness}</div>` +
        `<div class="party-choice-sprites" aria-hidden="true">${spritesHtml}</div>`;
    } else {
      blurbHtml =
        `<div class="ff6-arena-meta">Name them. Pick race, alignment, and class.</div>` +
        `<div class="party-choice-weak">Full control — no pre-rolled strengths.</div>`;
    }

    const items = [
      ...PRESET_PARTIES.map((p, i) => ({
        label: `${i + 1}. ${p.label}`,
        detail: p.tagline,
        metadata: p.id,
      })),
      {
        label: "Create Your Own",
        detail: "Build four adventurers from scratch",
        metadata: "custom",
      },
    ];

    const win = new FF6Window({
      title: "Assemble Your Party",
      contentHtml: blurbHtml,
      items,
      selectedIndex: this.choiceIndex,
      mode: "menu",
      footer: "D-pad · A confirm · 1-4 preset · C custom · B back",
      maxHeight: 420,
      animated,
      onHover: (i) => {
        this.choiceIndex = i;
        this.render();
      },
      onConfirm: (i) => {
        this.choiceIndex = i;
        this.confirmChoice();
      },
      onBack: () => {
        this.onCancel();
      },
    });
    this.panel.innerHTML = "";
    this.panel.appendChild(win.render());
  }
}
