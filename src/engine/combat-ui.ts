/**
 * Combat UI controller — keyboard-driven action selection and round
 * resolution for the merged game's combat mode.
 *
 * Flow:
 * 1. Action selection: for each living, non-incapacitated character, the
 *    player picks an action (Attack/Cast/Defend/Item/Flee) and any target.
 * 2. Round resolution: the player presses Space to resolve the round via
 *    resolveCombatRound. Results are shown in the combat log.
 * 3. End handling: when combat ends (victory/wipe/fled), the player presses
 *    Space to return to the dungeon.
 *
 * The controller renders to a DOM element (#combat-panel) and receives
 * keypresses via handleKey(). main.ts routes keys here when mode==="combat".
 */

import {
  resolveCombatRound,
  type CombatState,
  type PlayerAction,
  type EnemyInstance,
} from "../game/combat";
import { charRow } from "../game/combat";
import type { Character } from "../game/party";
import type { SpellDef } from "../data/spells";
import type { ItemDef } from "../data/items";

type Phase =
  | "selectAction"
  | "selectEnemyTarget"
  | "selectAllyTarget"
  | "selectSpell"
  | "selectItem"
  | "ready"
  | "roundResult"
  | "ended";

interface PendingAction {
  actorId: string;
  kind?: PlayerAction["kind"];
  spellId?: string;
  itemId?: string;
}

export interface CombatControllerOptions {
  panel: HTMLElement;
  onEnd: (result: CombatState) => void;
}

export class CombatController {
  private state: CombatState;
  private panel: HTMLElement;
  private onEnd: (result: CombatState) => void;
  private phase: Phase = "selectAction";
  private actions: PlayerAction[] = [];
  private currentCharIndex = 0;
  private pending: PendingAction = { actorId: "" };

  constructor(state: CombatState, opts: CombatControllerOptions) {
    this.state = state;
    this.panel = opts.panel;
    this.onEnd = opts.onEnd;
    this.startActionSelection();
    this.render();
  }

  /** Consumables currently held by the party, with stack counts. */
  private availableItems(): { item: ItemDef; count: number }[] {
    return Object.entries(this.state.inventory)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({ item: this.state.items[id], count }))
      .filter(
        (entry): entry is { item: ItemDef; count: number } =>
          entry.item !== undefined && entry.item.type === "consumable"
      );
  }

  // --- Public API ---------------------------------------------------------

  /** Route a keypress to the controller. Called by main.ts for combat mode. */
  handleKey(key: string): void {
    if (this.phase === "roundResult") {
      if (key === " " || key === "Enter") {
        this.startActionSelection();
        this.render();
      }
      return;
    }

    if (this.phase === "ended") {
      if (key === " " || key === "Enter") {
        this.onEnd(this.state);
      }
      return;
    }

    if (this.phase === "ready") {
      if (key === " " || key === "Enter") {
        this.resolveRound();
      }
      return;
    }

    if (this.phase === "selectAction") {
      this.handleActionKey(key);
      return;
    }

    if (this.phase === "selectEnemyTarget") {
      this.handleEnemyTargetKey(key);
      return;
    }

    if (this.phase === "selectAllyTarget") {
      this.handleAllyTargetKey(key);
      return;
    }

    if (this.phase === "selectSpell") {
      this.handleSpellKey(key);
      return;
    }

    if (this.phase === "selectItem") {
      this.handleItemKey(key);
      return;
    }
  }

  // --- Action selection ---------------------------------------------------

  private startActionSelection(): void {
    this.actions = [];
    this.currentCharIndex = 0;
    this.phase = "selectAction";
    this.pending = { actorId: "" };
    this.advanceToNextActor();
  }

  /** Advance to the next living, non-incapacitated character. */
  private advanceToNextActor(): void {
    const party = this.state.party;
    while (this.currentCharIndex < party.length) {
      const c = party[this.currentCharIndex];
      if (c.hp > 0 && !c.status.includes("sleep") && !c.status.includes("paralysis")) {
        this.pending = { actorId: c.id };
        return;
      }
      this.currentCharIndex++;
    }
    // All characters have actions — ready to resolve.
    this.phase = "ready";
  }

  private currentChar(): Character | undefined {
    return this.state.party.find((c) => c.id === this.pending.actorId);
  }

  private handleActionKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;
    const lower = key.toLowerCase();
    // Space = quick-attack the first living enemy (skips target selection).
    // Huge keypress saver for trivial fights: one Space per character instead
    // of "a" + number.
    if (key === " " || key === "Enter") {
      const enemies = this.livingEnemies();
      if (enemies.length === 0) {
        this.render("No enemies to attack.");
        return;
      }
      this.actions.push({
        kind: "attack",
        actorId: c.id,
        targetInstanceId: enemies[0].instanceId,
      });
      this.currentCharIndex++;
      this.advanceToNextActor();
      this.render();
      return;
    }
    switch (lower) {
      case "a":
        this.pending.kind = "attack";
        this.phase = "selectEnemyTarget";
        this.render();
        break;
      case "c": {
        // Only casters with known spells can cast.
        const knownSpells = c.knownSpellIds
          .map((id) => this.state.spells[id])
          .filter((s): s is SpellDef => s !== undefined);
        if (knownSpells.length === 0) {
          // No spells known — flash a message but stay on action selection.
          this.render(`${c.name} has no spells to cast.`);
          break;
        }
        if (this.state.silencedThisRound.includes(c.id)) {
          this.render(`${c.name} is silenced and cannot cast.`);
          break;
        }
        this.pending.kind = "cast";
        this.phase = "selectSpell";
        this.render();
        break;
      }
      case "d":
        this.actions.push({ kind: "defend", actorId: c.id });
        this.currentCharIndex++;
        this.advanceToNextActor();
        this.render();
        break;
      case "i": {
        const available = this.availableItems();
        if (available.length === 0) {
          this.render(`No items available.`);
          break;
        }
        this.pending.kind = "item";
        this.phase = "selectItem";
        this.render();
        break;
      }
      case "f":
        this.actions.push({ kind: "flee", actorId: c.id });
        // Flee is a party-level action; skip remaining characters.
        this.phase = "ready";
        this.render();
        break;
    }
  }

  private handleEnemyTargetKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;
    const enemies = this.livingEnemies();
    const idx = parseInt(key, 10);
    if (isNaN(idx) || idx < 1 || idx > enemies.length) return;
    const target = enemies[idx - 1];

    // The enemy-target phase is reached from both Attack and Cast (singleEnemy).
    // Push the correct action type based on what the player was doing.
    if (this.pending.kind === "cast") {
      this.actions.push({
        kind: "cast",
        actorId: c.id,
        spellId: this.pending.spellId!,
        targetInstanceId: target.instanceId,
      });
    } else {
      this.actions.push({
        kind: "attack",
        actorId: c.id,
        targetInstanceId: target.instanceId,
      });
    }
    this.currentCharIndex++;
    this.advanceToNextActor();
    this.phase = this.phase === "ready" ? "ready" : "selectAction";
    this.render();
  }

  private handleAllyTargetKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;
    const allies = this.state.party.filter((p) => p.hp > 0 || p.status.includes("knockedOut"));
    const idx = parseInt(key, 10);
    if (isNaN(idx) || idx < 1 || idx > allies.length) return;
    const target = allies[idx - 1];

    if (this.pending.kind === "cast") {
      this.actions.push({
        kind: "cast",
        actorId: c.id,
        spellId: this.pending.spellId!,
        targetAllyId: target.id,
      });
    } else if (this.pending.kind === "item") {
      this.actions.push({
        kind: "item",
        actorId: c.id,
        itemId: this.pending.itemId!,
        targetAllyId: target.id,
      });
    }
    this.currentCharIndex++;
    this.advanceToNextActor();
    this.phase = this.phase === "ready" ? "ready" : "selectAction";
    this.render();
  }

  private handleSpellKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;
    const knownSpells = c.knownSpellIds
      .map((id) => this.state.spells[id])
      .filter((s): s is SpellDef => s !== undefined);
    const idx = parseInt(key, 10);
    if (isNaN(idx) || idx < 1 || idx > knownSpells.length) return;
    const spell = knownSpells[idx - 1];
    this.pending.spellId = spell.id;

    // Determine if this spell needs a target.
    if (spell.target === "singleEnemy") {
      this.phase = "selectEnemyTarget";
    } else if (spell.target === "singleAlly") {
      this.phase = "selectAllyTarget";
    } else {
      // self / groupEnemies / allEnemies / allAllies / groupAllies — no target needed.
      this.actions.push({
        kind: "cast",
        actorId: c.id,
        spellId: spell.id,
      });
      this.currentCharIndex++;
      this.advanceToNextActor();
      this.phase = this.phase === "ready" ? "ready" : "selectAction";
    }
    this.render();
  }

  private handleItemKey(key: string): void {
    const c = this.currentChar();
    if (!c) return;
    const items = this.availableItems();
    const idx = parseInt(key, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) return;
    const item = items[idx - 1].item;
    this.pending.itemId = item.id;

    // Items that heal or revive need an ally target; cure items also need one.
    this.phase = "selectAllyTarget";
    this.render();
  }

  // --- Round resolution ---------------------------------------------------

  private resolveRound(): void {
    this.state = resolveCombatRound(this.state, this.actions);
    if (this.state.ended) {
      this.phase = "ended";
    } else {
      this.phase = "roundResult";
    }
    this.render();
  }

  // --- Helpers ------------------------------------------------------------

  private livingEnemies(): EnemyInstance[] {
    return [
      ...this.state.enemies.front.filter((e) => e.currentHp > 0),
      ...this.state.enemies.back.filter((e) => e.currentHp > 0),
    ];
  }

  private statusLabel(c: Character): string {
    if (c.status.length === 0) return "";
    return ` [${c.status.join(",")}]`;
  }

  // --- Rendering ----------------------------------------------------------

  private render(flash?: string): void {
    const s = this.state;
    const lines: string[] = [];

    // Header
    lines.push(`<div class="combat-header">[!] COMBAT — Round ${s.round}${s.isBoss ? " (BOSS)" : ""}</div>`);

    // Enemy formation
    lines.push(`<div class="combat-section">ENEMIES:</div>`);
    const enemies = this.livingEnemies();
    if (enemies.length === 0) {
      lines.push(`<div class="combat-enemies">No enemies remaining.</div>`);
    } else {
      const enemyLines = enemies.map((e, i) => {
        const rowLabel = e.row === "front" ? "F" : "B";
        const statuses = e.status.length ? ` [${e.status.join(",")}]` : "";
        const targetable = this.phase === "selectEnemyTarget";
        const prefix = targetable ? `<b>${i + 1}.</b> ` : `${i + 1}. `;
        return `${prefix}[${rowLabel}] ${e.name} HP:${e.currentHp}/${e.hp}${statuses}`;
      });
      lines.push(`<div class="combat-enemies">${enemyLines.join("<br>")}</div>`);
    }

    // Party
    lines.push(`<div class="combat-section">PARTY:</div>`);
    const partyLines = s.party.map((c, i) => {
      const rowLabel = charRow(c) === "front" ? "F" : "B";
      const st = this.statusLabel(c);
      const isCurrent =
        this.phase !== "ready" &&
        this.phase !== "roundResult" &&
        this.phase !== "ended" &&
        c.id === this.pending.actorId;
      const marker = isCurrent ? "▶" : " ";
      const hpDisplay = c.hp <= 0 ? "KO" : `${c.hp}/${c.maxHp}`;
      return `${marker} ${i + 1}.[${rowLabel}] ${c.name} (${c.class}) HP:${hpDisplay} SP:${c.sp}/${c.maxSp}${st}`;
    });
    lines.push(`<div class="combat-party">${partyLines.join("<br>")}</div>`);

    // Log (scrollable; don't truncate — boss silence and other first-action
    // messages must remain visible). Color-coded by content for readability.
    if (s.log.length > 0) {
      const coloredLog = s.log.map((l) => {
        let cls = "";
        if (/victory|defeated|wins/i.test(l)) cls = "log-victory";
        else if (/wipe|knocked out|falls/i.test(l)) cls = "log-defeat";
        else if (/casts|spell/i.test(l)) cls = "log-spell";
        else if (/heals|healed|HP restored/i.test(l)) cls = "log-damage-dealt";
        else if (/hits|damage|strikes/i.test(l) && !/party|ally/i.test(l)) cls = "log-damage-taken";
        return `• <span class="${cls}">${l}</span>`;
      });
      lines.push(`<div class="combat-log">${coloredLog.join("<br>")}</div>`);
    }

    // Prompt / instructions
    lines.push(`<div class="combat-prompt">`);
    if (flash) {
      lines.push(`<span class="combat-flash">${flash}</span><br>`);
    }
    switch (this.phase) {
      case "selectAction": {
        const c = this.currentChar();
        if (c) {
          lines.push(`${c.name}: [Space] quick-attack · [A]ttack [C]ast [D]efend [I]tem [F]lee`);
        }
        break;
      }
      case "selectEnemyTarget": {
        lines.push(`Select target (1-${enemies.length}):`);
        break;
      }
      case "selectAllyTarget": {
        const allies = s.party.filter((p) => p.hp > 0 || p.status.includes("knockedOut"));
        lines.push(`Select ally (1-${allies.length}):`);
        break;
      }
      case "selectSpell": {
        const c = this.currentChar();
        if (c) {
          const knownSpells = c.knownSpellIds
            .map((id) => s.spells[id])
            .filter((sp): sp is SpellDef => sp !== undefined);
          const spellList = knownSpells
            .map((sp, i) => `${i + 1}.${sp.name}(${sp.spCost}SP)`)
            .join(" ");
          lines.push(`Select spell: ${spellList}`);
        }
        break;
      }
      case "selectItem": {
        const items = this.availableItems();
        const itemList = items
          .map(({ item, count }, i) => `${i + 1}.${item.name} x${count}`)
          .join(" ");
        lines.push(`Select item: ${itemList}`);
        break;
      }
      case "ready":
        lines.push(`Actions ready. Press [Space] to resolve round.`);
        break;
      case "roundResult":
        lines.push(`Round ${s.round} resolved. Press [Space] for next round.`);
        break;
      case "ended": {
        const resultLabel = s.result?.toUpperCase() ?? "ENDED";
        const resultColor = s.result === "victory" ? "var(--amber)" : "var(--danger-red)";
        lines.push(`<span style="color:${resultColor};font-size:16px;font-weight:bold">${resultLabel}</span>`);
        if (s.result === "victory") {
          lines.push(`<br><span style="color:var(--heal-green)">+${s.goldEarned} gold · +${s.xpEarned} XP each</span>`);
        } else if (s.result === "wipe") {
          lines.push(`<br><span style="color:var(--text-dim)">The party retreats to the entrance and revives at 1 HP.</span>`);
        }
        lines.push(`<br>Press [Space] to continue.`);
        break;
      }
    }
    lines.push(`</div>`);

    this.panel.innerHTML = lines.join("\n");
  }
}
