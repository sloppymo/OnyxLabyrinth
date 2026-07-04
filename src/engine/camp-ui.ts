/**
 * Camp UI controller — design doc Section 5.
 *
 * When the player presses C in dungeon mode, main.ts switches to "camp" mode
 * and creates a CampController. The controller renders a static camp screen
 * (party silhouettes around a campfire) and runs a ~3 second healing
 * animation where each character's HP/SP ticks up from their current value
 * to maximum. When the animation completes, the party is fully restored
 * (HP/SP to max, poison/paralysis cleared, KO'd characters revived to 1 HP)
 * and the onEnd callback fires so main.ts can return to dungeon mode.
 *
 * Restrictions (§5.2): no camping on hazard tiles or with enemies within 3
 * tiles. Neither system exists yet (no hazard tiles, no on-map enemies), so
 * these checks are deferred — main.ts validates only that we're in dungeon
 * mode and not in combat.
 */

import type { Character } from "../game/party";
import { charRow } from "../game/party";

export interface CampControllerOptions {
  panel: HTMLElement;
  party: Character[];
  dayCount: number;
  onEnd: () => void;
}

const CAMP_DURATION_MS = 3000;

interface CharAnim {
  char: Character;
  startHp: number;
  startSp: number;
  targetHp: number;
  targetSp: number;
  wasKO: boolean;
  revived: boolean;
}

export class CampController {
  private panel: HTMLElement;
  private party: Character[];
  private dayCount: number;
  private onEnd: () => void;
  private anims: CharAnim[];
  private elapsed = 0;
  private finished = false;
  private timerId: number | undefined;

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
    this.render(1);
    // Show the "press any key" prompt after the animation completes.
    this.panel.innerHTML += `<div class="camp-done">Day ${this.dayCount}. Press any key to continue.</div>`;
  }

  /** Allow main.ts to dismiss the camp screen after the animation. */
  handleKey(_key: string): void {
    if (this.finished) {
      this.dispose();
      this.onEnd();
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
    // Eased progress so healing starts fast and slows near max — feels cozy.
    const eased = 1 - Math.pow(1 - progress, 2);

    const lines: string[] = [];
    lines.push(`<div class="camp-header">⛺ CAMP — Day ${this.dayCount}</div>`);

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
}
