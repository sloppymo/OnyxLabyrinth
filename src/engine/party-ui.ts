/**
 * Party Creation UI controller — design doc Section 4.
 *
 * Lets the player build a 6-character party from scratch: for each slot the
 * player enters a name, cycles race / alignment / class, re-rolls stats, and
 * confirms. Validates the alignment rule (no Good + Evil mix). On completion
 * calls onConfirm(party) with a full 6-member Character[].
 *
 * Opens on a choice screen: pick the ready-made default party (Quick Start)
 * or build a custom one. Esc from slot 1 of the editor returns to the choice
 * screen; Esc from the choice screen cancels.
 *
 * Keyboard (editor):
 *   Up/Down      move field cursor (name / race / alignment / class)
 *   Left/Right   cycle the selected field's value (race / alignment / class)
 *   letters      append to the name (when the name field is selected)
 *   Backspace    delete last name character
 *   R            re-roll stats
 *   Enter        confirm this character and advance to the next slot
 *   Esc          go back one slot (or return to the choice screen from slot 1)
 *   D            (on slot 1 only) use the default pre-made party
 */

import {
  RACES,
  ALIGNMENTS,
  CLASSES,
  rollStatsForRace,
  computeMaxHp,
  computeMaxSp,
  createCharacter,
  type Race,
  type Alignment,
  type CharacterClass,
  type Character,
  type Stats,
} from "../game/party";
import { spellsForClass } from "../data/spells";
import { FF6Window } from "./ff6-window-library";
import { audio } from "./audio";

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

const DEFAULT_NAMES = ["Aria", "Bram", "Coda", "Dell", "Eve", "Fenn"];

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
  /** Opening screen: pick the default party or the custom editor. */
  private phase: "choice" | "edit" = "choice";
  private choiceIndex = 0;
  private choiceHasRendered = false;
  /** Reset panel scroll when advancing slots so the header stays visible. */
  private scrollResetPending = false;

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

  private handleChoiceKey(key: string, lower: string): void {
    if (lower === "escape") {
      audio.uiCancel();
      this.onCancel();
      return;
    }
    if (lower === "arrowup" || lower === "w" || lower === "arrowdown" || lower === "s") {
      this.choiceIndex = this.choiceIndex === 0 ? 1 : 0;
      audio.uiCursor();
      this.render();
      return;
    }
    if (lower === "d") {
      audio.uiConfirm();
      this.useDefaultParty();
      return;
    }
    if (lower === "c") {
      audio.uiConfirm();
      this.enterEditor();
      return;
    }
    if (key === "Enter" || key === " ") {
      audio.uiConfirm();
      if (this.choiceIndex === 0) this.useDefaultParty();
      else this.enterEditor();
    }
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
    // Advance to the next slot, or finish if this was slot 5.
    if (this.slotIndex >= 5) {
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

  private useDefaultParty(): void {
    // Build the same default party createDefaultParty() produces.
    const party: Character[] = [];
    const specs: { name: string; race: Race; align: Alignment; cls: CharacterClass }[] = [
      { name: "Aria", race: "Human", align: "Good", cls: "Fighter" },
      { name: "Bram", race: "Dwarf", align: "Good", cls: "Fighter" },
      { name: "Coda", race: "Hobbit", align: "Neutral", cls: "Thief" },
      { name: "Dell", race: "Elf", align: "Neutral", cls: "Mage" },
      { name: "Eve", race: "Gnome", align: "Good", cls: "Priest" },
      { name: "Fenn", race: "Elf", align: "Neutral", cls: "Mage" },
    ];
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const char = createCharacter(`c${i + 1}`, s.name, s.race, s.align, s.cls, i);
      char.knownSpellIds = spellsForClass(s.cls, 1).map((sp) => sp.id);
      party.push(char);
    }
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onConfirm(party);
  }

  // --- Rendering ----------------------------------------------------------

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

    lines.push(`<div class="party-create">`);
    lines.push(`<div class="party-create-header">[+] Party Creation</div>`);
    lines.push(
      `<div class="party-create-meta">Slot ${this.slotIndex + 1} of 6 · ${confirmedCount} confirmed</div>`
    );

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

    lines.push(
      `<div class="party-help">[↑↓] field · [←→] cycle · [R] reroll · [Enter] confirm · [Esc] back</div>`
    );

    if (confirmedCount > 0) {
      lines.push(`<div class="party-confirmed">`);
      for (let i = 0; i < confirmedCount; i++) {
        const c = this.drafts[i];
        lines.push(
          `<span class="party-confirmed-chip" title="${c.race} ${c.alignment} ${c.cls}">` +
          `<b>${i + 1}.${c.name}</b> ${c.cls}` +
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

    const win = new FF6Window({
      title: "Assemble Your Party",
      contentHtml: `<div class="ff6-arena-meta">Six souls brave the labyrinth. Who will they be?</div>`,
      items: [
        {
          label: "Default Party",
          detail: "Aria · Bram · Coda · Dell · Eve · Fenn",
          metadata: "default",
        },
        {
          label: "Create Your Own",
          detail: "Build six adventurers from scratch",
          metadata: "custom",
        },
      ],
      selectedIndex: this.choiceIndex,
      mode: "menu",
      footer: "D-pad navigate · A confirm · B back",
      animated,
      onHover: (i) => {
        this.choiceIndex = i;
      },
      onConfirm: (i) => {
        this.choiceIndex = i;
        if (i === 0) this.useDefaultParty();
        else this.enterEditor();
      },
      onBack: () => {
        this.onCancel();
      },
    });
    this.panel.innerHTML = "";
    this.panel.appendChild(win.render());
  }
}
