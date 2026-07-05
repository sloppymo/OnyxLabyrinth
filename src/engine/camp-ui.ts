/**
 * Camp UI controller — design doc Section 5.
 *
 * When the player presses C in dungeon mode, main.ts switches to "camp" mode
 * and creates a CampController. The controller renders a static camp screen
 * (party silhouettes around a campfire) and runs a ~3 second healing
 * animation where each character's HP/SP ticks up from their current value
 * to maximum. When the animation completes, the party is fully restored
 * (HP/SP to max, poison/paralysis cleared, KO'd characters revived to 1 HP)
 * and a post-camp menu appears with options to view character sheets,
 * reorder the party, or continue.
 *
 * Restrictions (§5.2): no camping on hazard tiles or with enemies within 3
 * tiles. Neither system exists yet (no hazard tiles, no on-map enemies), so
 * these checks are deferred — main.ts validates only that we're in dungeon
 * mode and not in combat.
 */

import type { Character } from "../game/party";
import { charRow } from "../game/party";
import { ALL_SPELLS } from "../data/spells";

const SPELL_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  ALL_SPELLS.map((s) => [s.id, s.name])
);

export interface CampControllerOptions {
  panel: HTMLElement;
  party: Character[];
  dayCount: number;
  onEnd: () => void;
}

const CAMP_DURATION_MS = 3000;

type CampPhase = "animating" | "menu" | "charSheet" | "reorder";

interface CharAnim {
  char: Character;
  startHp: number;
  startSp: number;
  targetHp: number;
  targetSp: number;
  wasKO: boolean;
  revived: boolean;
}

const CAMP_MENU_ITEMS = [
  { key: "continue", label: "Continue exploring" },
  { key: "sheet", label: "View character sheets" },
  { key: "reorder", label: "Reorder party" },
] as const;

export class CampController {
  private panel: HTMLElement;
  private party: Character[];
  private dayCount: number;
  private onEnd: () => void;
  private anims: CharAnim[];
  private elapsed = 0;
  private finished = false;
  private timerId: number | undefined;
  private phase: CampPhase = "animating";
  private menuIndex = 0;
  private sheetIndex = 0;
  private reorderFirst = -1;

  constructor(opts: CampControllerOptions) {
    this.panel = opts.panel;
    this.party = opts.party;
    this.dayCount = opts.dayCount;
    this.onEnd = opts.onEnd;

    // Snapshot pre-camp HP/SP and compute targets. KO'd characters revive to
    // 1 HP first, then tick up to max alongside everyone else.
    this.anims = this.party.map((c) => {
      const wasKO = c.status.includes("knockedOut");
      const startHp = wasKO ? 1 : c.hp;
      const startSp = c.sp;
      return {
        char: c,
        startHp,
        startSp,
        targetHp: c.maxHp,
        targetSp: c.maxSp,
        wasKO,
        revived: wasKO,
      };
    });

    // Apply the actual restoration immediately to the party data so it's
    // persisted when onEnd fires. The animation is purely visual.
    for (const c of this.party) {
      c.hp = c.maxHp;
      c.sp = c.maxSp;
      c.status = []; // clear all statuses including knockedOut, poison, paralysis
    }

    this.panel.style.display = "block";
    this.render(0);
    this.startAnimation();
  }

  private startAnimation(): void {
    const start = performance.now();
    const tick = () => {
      this.elapsed = performance.now() - start;
      const progress = Math.min(1, this.elapsed / CAMP_DURATION_MS);
      this.render(progress);
      if (progress < 1) {
        this.timerId = window.requestAnimationFrame(tick);
      } else {
        this.finish();
      }
    };
    this.timerId = window.requestAnimationFrame(tick);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.phase = "menu";
    this.renderMenu();
  }

  /** Route keypresses to the current phase. */
  handleKey(key: string): void {
    if (!this.finished) return; // ignore keys during animation
    const lower = key.toLowerCase();

    if (this.phase === "menu") {
      this.handleMenuKey(lower);
    } else if (this.phase === "charSheet") {
      if (lower === "escape" || key === "Enter" || key === " ") {
        this.phase = "menu";
        this.renderMenu();
      } else if (lower === "arrowup" || lower === "w") {
        this.sheetIndex = (this.sheetIndex - 1 + this.party.length) % this.party.length;
        this.renderCharSheet();
      } else if (lower === "arrowdown" || lower === "s") {
        this.sheetIndex = (this.sheetIndex + 1) % this.party.length;
        this.renderCharSheet();
      }
    } else if (this.phase === "reorder") {
      this.handleReorderKey(lower, key);
    }
  }

  private handleMenuKey(lower: string): void {
    switch (lower) {
      case "arrowup":
      case "w":
        this.menuIndex = (this.menuIndex - 1 + CAMP_MENU_ITEMS.length) % CAMP_MENU_ITEMS.length;
        this.renderMenu();
        break;
      case "arrowdown":
      case "s":
        this.menuIndex = (this.menuIndex + 1) % CAMP_MENU_ITEMS.length;
        this.renderMenu();
        break;
      case "enter":
      case " ":
        this.selectMenu();
        break;
      case "escape":
        this.dispose();
        this.onEnd();
        break;
    }
  }

  private selectMenu(): void {
    const item = CAMP_MENU_ITEMS[this.menuIndex];
    switch (item.key) {
      case "continue":
        this.dispose();
        this.onEnd();
        break;
      case "sheet":
        this.phase = "charSheet";
        this.sheetIndex = 0;
        this.renderCharSheet();
        break;
      case "reorder":
        this.phase = "reorder";
        this.reorderFirst = -1;
        this.renderReorder();
        break;
    }
  }

  private handleReorderKey(lower: string, key: string): void {
    if (lower === "escape") {
      this.phase = "menu";
      this.renderMenu();
      return;
    }
    const idx = parseInt(key, 10);
    if (isNaN(idx) || idx < 1 || idx > this.party.length) return;
    const slotIdx = idx - 1;
    if (this.reorderFirst === -1) {
      this.reorderFirst = slotIdx;
      this.renderReorder();
    } else {
      // Swap formation slots and array positions.
      const a = this.party[this.reorderFirst];
      const b = this.party[slotIdx];
      const tmpSlot = a.formationSlot;
      a.formationSlot = b.formationSlot;
      b.formationSlot = tmpSlot;
      this.party[this.reorderFirst] = b;
      this.party[slotIdx] = a;
      this.reorderFirst = -1;
      this.renderReorder();
    }
  }

  private dispose(): void {
    if (this.timerId !== undefined) {
      cancelAnimationFrame(this.timerId);
      this.timerId = undefined;
    }
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }

  // --- Rendering ----------------------------------------------------------

  private render(progress: number): void {
    if (this.phase !== "animating") return;
    // Eased progress so healing starts fast and slows near max — feels cozy.
    const eased = 1 - Math.pow(1 - progress, 2);

    const lines: string[] = [];
    lines.push(`<div class="camp-header">[C] CAMP — Day ${this.dayCount}</div>`);

    // Campfire visual: flickering orange lines. The flicker is driven by
    // progress so it animates during the camp.
    const flicker = Math.sin(this.elapsed * 0.012) * 0.5 + 0.5;
    lines.push(
      `<div class="campfire">` +
        `<span class="flame" style="opacity:${0.6 + flicker * 0.4}">~</span>` +
        `<span class="flame" style="opacity:${0.4 + flicker * 0.5};font-size:22px">~</span>` +
        `<span class="flame" style="opacity:${0.5 + flicker * 0.3};font-size:16px">~</span>` +
        `</div>`
    );

    // Party silhouettes with ticking HP/SP.
    const partyLines = this.anims.map((a, i) => {
      const rowLabel = charRow(a.char) === "front" ? "F" : "B";
      const curHp = Math.round(a.startHp + (a.targetHp - a.startHp) * eased);
      const curSp = Math.round(a.startSp + (a.targetSp - a.startSp) * eased);
      const hpPct = (curHp / a.targetHp) * 100;
      const spPct = a.targetSp > 0 ? (curSp / a.targetSp) * 100 : 0;
      const reviveTag = a.revived && progress > 0.3 ? " <span class='revived'>REVIVED</span>" : "";
      return (
        `<div class="camp-char">` +
        `<span class="cc-name">${i + 1}.[${rowLabel}] ${a.char.name}</span>` +
        `<span class="cc-bar-label">HP</span><span class="cc-bar"><span class="cc-bar-fill hp" style="width:${hpPct}%"></span></span>` +
        `<span class="cc-num">${curHp}/${a.targetHp}</span>` +
        `<span class="cc-bar-label">SP</span><span class="cc-bar"><span class="cc-bar-fill sp" style="width:${spPct}%"></span></span>` +
        `<span class="cc-num">${curSp}/${a.targetSp}</span>` +
        reviveTag +
        `</div>`
      );
    });
    lines.push(`<div class="camp-party">${partyLines.join("")}</div>`);

    if (progress < 1) {
      lines.push(`<div class="camp-resting">Resting...</div>`);
    }

    this.panel.innerHTML = lines.join("");
  }

  private renderMenu(): void {
    const lines: string[] = [];
    lines.push(`<div class="camp-header">[C] CAMP — Day ${this.dayCount} — Rested</div>`);
    lines.push(`<div class="camp-party">`);
    for (let i = 0; i < CAMP_MENU_ITEMS.length; i++) {
      const item = CAMP_MENU_ITEMS[i];
      const selected = i === this.menuIndex;
      const marker = selected ? "▶" : " ";
      lines.push(
        `<div class="camp-char">` +
        `<span class="cc-name">${marker} ${item.label}</span>` +
        `</div>`
      );
    }
    lines.push(`</div>`);
    lines.push(`<div class="camp-done">[↑/↓] navigate · [Enter] select · [Esc] continue</div>`);
    this.panel.innerHTML = lines.join("");
  }

  private renderCharSheet(): void {
    const c = this.party[this.sheetIndex];
    const rowLabel = charRow(c) === "front" ? "Front" : "Back";
    const s = c.stats;
    const spellNames = c.knownSpellIds.length > 0
      ? c.knownSpellIds.map((id) => SPELL_NAME_BY_ID[id] ?? id).join(", ")
      : "None";
    const lines: string[] = [];
    lines.push(`<div class="camp-header">[C] Character Sheet — ${this.sheetIndex + 1}/${this.party.length}</div>`);
    lines.push(`<div class="char-sheet">`);
    lines.push(`<div class="cs-name">${c.name} — Level ${c.level} ${c.race} ${c.class} (${c.alignment}, ${rowLabel} Row)</div>`);
    lines.push(`<div class="cs-stats">STR ${s.str} · INT ${s.int} · PIE ${s.pie} · VIT ${s.vit} · AGI ${s.agi} · LUK ${s.luk}</div>`);
    lines.push(`<div class="cs-stats">HP ${c.hp}/${c.maxHp} · SP ${c.sp}/${c.maxSp} · XP ${c.xp}</div>`);
    lines.push(`<div class="cs-spells">Spells: ${spellNames}</div>`);
    lines.push(`</div>`);
    lines.push(`<div class="camp-done">[↑/↓] cycle characters · [Enter/Esc] back to menu</div>`);
    this.panel.innerHTML = lines.join("");
  }

  private renderReorder(): void {
    const lines: string[] = [];
    lines.push(`<div class="camp-header">[C] Reorder Party</div>`);
    lines.push(`<div class="camp-party">`);
    for (let i = 0; i < this.party.length; i++) {
      const c = this.party[i];
      const rowLabel = charRow(c) === "front" ? "F" : "B";
      const isFirst = this.reorderFirst === i;
      const marker = isFirst ? "▶" : `${i + 1}.`;
      lines.push(
        `<div class="camp-char">` +
        `<span class="cc-name">${marker} [${rowLabel}] ${c.name} (${c.class})</span>` +
        `</div>`
      );
    }
    lines.push(`</div>`);
    if (this.reorderFirst === -1) {
      lines.push(`<div class="camp-done">Press 1-6 to select first character to swap · [Esc] back</div>`);
    } else {
      lines.push(`<div class="camp-done">Press 1-6 to select second character to swap with ${this.party[this.reorderFirst].name} · [Esc] cancel</div>`);
    }
    this.panel.innerHTML = lines.join("");
  }
}
