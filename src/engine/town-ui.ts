/**
 * Town / Hub UI controller — design doc Section 11.
 *
 * The town is the game's hub. From here the player can:
 *   - Inn: Full heal + clear status (free)
 *   - Temple: Same as Inn (free)
 *   - Shop: Buy/sell equipment and consumables
 *   - Guild: View party roster
 *   - Training: Process level-ups (free)
 *   - Enter Dungeon: Transition to dungeon exploration
 *
 * Keyboard controls:
 *   Up/Down — navigate menu items
 *   Enter/Space — select
 *   Esc — go back / close sub-menu
 *
 * The controller renders to a DOM element and calls onEnterDungeon() or
 * onClose() to transition out of town mode.
 */

import type { GameState, Character } from "../types";
import { restoreParty, CLASSES } from "../game/party";
import { ALL_ITEMS, ITEMS_BY_ID, displayNameFor, type ItemDef } from "../data/items";
import { spellsForClass } from "../data/spells";
import { equipItem, findBestEquipTarget } from "../game/combat";

type TownScreen = "main" | "inn" | "temple" | "shop" | "guild" | "training";
type ShopTab = "buy" | "sell" | "appraise";

/** Temple fee to shatter all equipped cursed gear. */
const REMOVE_CURSE_COST = 100;

/** Shop fee to identify one unidentified item. */
const APPRAISE_COST = 50;

export interface TownControllerOptions {
  panel: HTMLElement;
  state: GameState;
  onEnterDungeon: () => void;
  onOpenSave: () => void;
  onReformParty: () => void;
}

const MAIN_MENU_ITEMS = [
  { key: "inn", label: "Inn — Rest and heal (Free)", icon: "[I]" },
  { key: "temple", label: "Temple — Healing and cleansing (Free)", icon: "[+]" },
  { key: "shop", label: "Shop — Buy and sell equipment", icon: "[$]" },
  { key: "guild", label: "Guild — View party roster", icon: "[G]" },
  { key: "training", label: "Training Ground — Level up", icon: "[T]" },
  { key: "reform", label: "Reform Party — Create a new party", icon: "[R]" },
  { key: "dungeon", label: "Enter Dungeon", icon: "[>]" },
  { key: "save", label: "Save / Load", icon: "[S]" },
] as const;

// XP required to reach the next level. Generous curve so a 30-minute session
// sees multiple level-ups: roughly 5-8 Floor 1 fights to level 2.
function xpForNextLevel(level: number): number {
  return level * 20;
}

/** Level up a character: increase level, recompute max HP/SP, full heal,
 *  and grant new spells by tier (Level 1→T1, 3→T2, 5→T3, 7→T4, 9→T5, 11→T6, 13→T7). */
function levelUpChar(c: Character): Character {
  const newLevel = c.level + 1;
  // HP growth: VIT * 2 + class bonus, +10% per level above 1.
  const hpGrowth = Math.floor((c.stats.vit * 2 + CLASSES[c.class].hpBonus) * 0.5);
  const newMaxHp = c.maxHp + hpGrowth;
  // SP growth: spellcasters get +50% of their casting stat per level.
  const spellClass = CLASSES[c.class].spellClass;
  let spGrowth = 0;
  if (spellClass === "Mage") spGrowth = Math.floor(c.stats.int * 0.5);
  if (spellClass === "Priest") spGrowth = Math.floor(c.stats.pie * 0.5);
  const newMaxSp = c.maxSp + spGrowth;

  // Spell progression: grant every spell up to the tier unlocked by this level.
  const newTier = Math.min(7, Math.ceil(newLevel / 2)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const knownSet = new Set(c.knownSpellIds);
  for (const s of spellsForClass(c.class, newTier)) knownSet.add(s.id);

  return {
    ...c,
    level: newLevel,
    maxHp: newMaxHp,
    maxSp: newMaxSp,
    hp: newMaxHp,
    sp: newMaxSp,
    status: [],
    knownSpellIds: [...knownSet],
  };
}

export class TownController {
  private panel: HTMLElement;
  private state: GameState;
  private onEnterDungeon: () => void;
  private onOpenSave: () => void;
  private onReformParty: () => void;
  private screen: TownScreen = "main";
  private selectedIndex = 0;
  private flash = "";

  // Shop state
  private shopTab: ShopTab = "buy";
  private shopIndex = 0;

  constructor(opts: TownControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.onEnterDungeon = opts.onEnterDungeon;
    this.onOpenSave = opts.onOpenSave;
    this.onReformParty = opts.onReformParty;
    this.panel.style.display = "block";
    this.render();
  }

  handleKey(key: string): void {
    const lower = key.toLowerCase();

    if (this.screen === "main") {
      this.handleMainKey(lower);
      return;
    }
    if (this.screen === "shop") {
      this.handleShopKey(lower);
      return;
    }
    // Temple: R lifts curses (when any cursed gear is equipped).
    if (this.screen === "temple" && lower === "r") {
      this.doRemoveCurse();
      return;
    }
    // inn, temple, guild, training — all dismiss with Esc/Enter/Space
    if (lower === "escape" || key === "Enter" || key === " ") {
      this.screen = "main";
      this.flash = "";
      this.render();
    }
  }

  /** All cursed items currently equipped by anyone. */
  private equippedCursed(): { charName: string; item: ItemDef }[] {
    const out: { charName: string; item: ItemDef }[] = [];
    for (const c of this.state.party) {
      const loadout = this.state.equipment[c.id];
      if (!loadout) continue;
      if (loadout.weapon?.cursed) out.push({ charName: c.name, item: loadout.weapon });
      for (const a of loadout.armor) {
        if (a.cursed) out.push({ charName: c.name, item: a });
      }
    }
    return out;
  }

  private doRemoveCurse(): void {
    const cursed = this.equippedCursed();
    if (cursed.length === 0) {
      this.flash = "No curses afflict the party.";
      this.render();
      return;
    }
    if (this.state.partyGold < REMOVE_CURSE_COST) {
      this.flash = `Remove Curse costs ${REMOVE_CURSE_COST}g — you can't afford it.`;
      this.render();
      return;
    }
    this.state.partyGold -= REMOVE_CURSE_COST;
    // Strip cursed gear from every loadout and destroy it (inventory too).
    for (const c of this.state.party) {
      const loadout = this.state.equipment[c.id];
      if (!loadout) continue;
      this.state.equipment[c.id] = {
        ...loadout,
        weapon: loadout.weapon?.cursed ? undefined : loadout.weapon,
        armor: loadout.armor.filter((a) => !a.cursed),
      };
    }
    this.state.inventory = this.state.inventory.filter(
      (e) => !ITEMS_BY_ID[e.itemId]?.cursed
    );
    const names = cursed.map((c) => `${c.item.name} (${c.charName})`).join(", ");
    this.flash = `The priests shatter the cursed gear: ${names}.`;
    this.render();
  }

  private handleMainKey(lower: string): void {
    switch (lower) {
      case "arrowup":
      case "w":
        this.selectedIndex = (this.selectedIndex - 1 + MAIN_MENU_ITEMS.length) % MAIN_MENU_ITEMS.length;
        this.flash = "";
        this.render();
        break;
      case "arrowdown":
        this.selectedIndex = (this.selectedIndex + 1) % MAIN_MENU_ITEMS.length;
        this.flash = "";
        this.render();
        break;
      case "enter":
      case " ":
        this.selectMain();
        break;
      case "escape":
        // Esc in town does nothing — town is the hub. (Could open save menu
        // but that's wired to a separate handler in main.ts.)
        break;
    }
  }

  private selectMain(): void {
    const item = MAIN_MENU_ITEMS[this.selectedIndex];
    switch (item.key) {
      case "inn":
        this.doInn();
        break;
      case "temple":
        this.doTemple();
        break;
      case "shop":
        this.screen = "shop";
        this.shopTab = "buy";
        this.shopIndex = 0;
        this.flash = "";
        this.render();
        break;
      case "guild":
        this.screen = "guild";
        this.flash = "";
        this.render();
        break;
      case "training":
        this.doTraining();
        break;
      case "reform":
        this.panel.style.display = "none";
        this.panel.innerHTML = "";
        this.onReformParty();
        break;
      case "dungeon":
        this.panel.style.display = "none";
        this.panel.innerHTML = "";
        this.onEnterDungeon();
        break;
      case "save":
        this.panel.style.display = "none";
        this.panel.innerHTML = "";
        this.onOpenSave();
        break;
    }
  }

  // --- Facility actions ---------------------------------------------------

  private doInn(): void {
    this.state.party = restoreParty(this.state.party);
    this.screen = "inn";
    this.flash = "The party rests at the Inn. HP and SP fully restored!";
    this.render();
  }

  private doTemple(): void {
    this.state.party = restoreParty(this.state.party);
    this.screen = "temple";
    this.flash = "The Temple's blessing restores the party. HP and SP fully restored!";
    this.render();
  }

  private doTraining(): void {
    // Process level-ups for all characters who have enough XP.
    let leveledUp = 0;
    const results: string[] = [];
    this.state.party = this.state.party.map((c) => {
      let char = c;
      while (char.xp >= xpForNextLevel(char.level)) {
        char = levelUpChar(char);
        leveledUp++;
        results.push(`${char.name} → Level ${char.level}!`);
      }
      return char;
    });
    this.screen = "training";
    if (leveledUp === 0) {
      this.flash = "No one has enough XP to level up yet.";
    } else {
      this.flash = results.join(" ");
    }
    this.render();
  }

  // --- Shop ---------------------------------------------------------------

  private getShopBuyList(): ItemDef[] {
    // Shop sells tier-1 and tier-2 items (appropriate for early game).
    // Trinkets (dungeon finds) and cursed gear are never stock.
    return ALL_ITEMS.filter(
      (item) => item.type !== "trinket" && !item.cursed && (item.dropFloorTier ?? 1) <= 2
    );
  }

  /** Indices into state.inventory of entries awaiting appraisal. */
  private getAppraiseList(): number[] {
    return this.state.inventory
      .map((e, i) => (e.identified ? -1 : i))
      .filter((i) => i >= 0);
  }

  private handleShopKey(lower: string): void {
    const buyList = this.getShopBuyList();
    const appraiseList = this.getAppraiseList();
    const listLen =
      this.shopTab === "buy"
        ? buyList.length
        : this.shopTab === "sell"
          ? this.state.inventory.length
          : appraiseList.length;

    switch (lower) {
      case "tab":
        // Tab cycles buy → sell → appraise
        this.shopTab =
          this.shopTab === "buy" ? "sell" : this.shopTab === "sell" ? "appraise" : "buy";
        this.shopIndex = 0;
        this.flash = "";
        this.render();
        break;
      case "b":
        this.shopTab = "buy";
        this.shopIndex = 0;
        this.flash = "";
        this.render();
        break;
      case "s":
        this.shopTab = "sell";
        this.shopIndex = 0;
        this.flash = "";
        this.render();
        break;
      case "a":
        this.shopTab = "appraise";
        this.shopIndex = 0;
        this.flash = "";
        this.render();
        break;
      case "arrowup":
      case "w":
        if (listLen > 0) this.shopIndex = (this.shopIndex - 1 + listLen) % listLen;
        this.flash = "";
        this.render();
        break;
      case "arrowdown":
        if (listLen > 0) this.shopIndex = (this.shopIndex + 1) % listLen;
        this.flash = "";
        this.render();
        break;
      case "enter":
      case " ":
        if (this.shopTab === "buy") {
          this.buyItem(buyList[this.shopIndex]);
        } else if (this.shopTab === "sell") {
          this.sellItem(this.shopIndex);
        } else {
          this.appraiseItem(appraiseList[this.shopIndex]);
        }
        break;
      case "escape":
        this.screen = "main";
        this.flash = "";
        this.render();
        break;
    }
  }

  private buyItem(item: ItemDef | undefined): void {
    if (!item) return;
    if (this.state.partyGold < item.price) {
      this.flash = `Not enough gold for ${item.name} (${item.price}g).`;
      this.render();
      return;
    }
    this.state.partyGold -= item.price;
    // Shop stock is always identified.
    this.state.inventory.push({ itemId: item.id, identified: true });

    // Auto-equip gear to the party member who needs it most.
    if (item.type !== "consumable") {
      const targetId = findBestEquipTarget(this.state.party, this.state.equipment, item);
      if (targetId) {
        this.state.equipment[targetId] = equipItem(this.state.equipment[targetId], item);
        const targetName = this.state.party.find((c) => c.id === targetId)?.name ?? "someone";
        this.flash = `Bought ${item.name} for ${item.price}g and equipped it on ${targetName}.`;
        this.render();
        return;
      }
    }

    this.flash = `Bought ${item.name} for ${item.price}g.`;
    this.render();
  }

  private sellItem(invIndex: number): void {
    const entry = this.state.inventory[invIndex];
    if (!entry) return;
    const itemId = entry.itemId;
    const item = ITEMS_BY_ID[itemId];
    if (!item) return;
    if (!entry.identified) {
      this.flash = "The shopkeep won't buy unidentified goods. Appraise it first.";
      this.render();
      return;
    }
    if (item.cursed) {
      this.flash = "The shopkeep wants nothing to do with cursed goods.";
      this.render();
      return;
    }
    const sellPrice = Math.floor(item.price / 2);
    this.state.inventory.splice(invIndex, 1);
    this.state.partyGold += sellPrice;

    // If this exact item is currently equipped, remove it from that character.
    for (const c of this.state.party) {
      const loadout = this.state.equipment[c.id];
      if (!loadout) continue;
      if (loadout.weapon?.id === itemId) {
        this.state.equipment[c.id] = { ...loadout, weapon: undefined };
      }
      if (loadout.armor.some((a) => a.id === itemId)) {
        this.state.equipment[c.id] = {
          ...loadout,
          armor: loadout.armor.filter((a) => a.id !== itemId),
        };
      }
    }

    // Clamp index
    if (this.shopIndex >= this.state.inventory.length) {
      this.shopIndex = Math.max(0, this.state.inventory.length - 1);
    }
    this.flash = `Sold ${item.name} for ${sellPrice}g.`;
    this.render();
  }

  private appraiseItem(invIndex: number | undefined): void {
    if (invIndex === undefined) return;
    const entry = this.state.inventory[invIndex];
    if (!entry || entry.identified) return;
    const item = ITEMS_BY_ID[entry.itemId];
    if (!item) return;
    if (this.state.partyGold < APPRAISE_COST) {
      this.flash = `Appraisal costs ${APPRAISE_COST}g — you can't afford it.`;
      this.render();
      return;
    }
    this.state.partyGold -= APPRAISE_COST;
    entry.identified = true;
    this.flash = item.cursed
      ? `The appraiser recoils — it's a ${item.name}, and it is CURSED!`
      : `Appraised: ${item.name} (${this.itemStatsStr(item) || "no bonuses"}).`;
    // Keep the cursor valid as the unidentified list shrinks.
    const remaining = this.getAppraiseList().length;
    if (this.shopIndex >= remaining) this.shopIndex = Math.max(0, remaining - 1);
    this.render();
  }

  // --- Rendering ----------------------------------------------------------

  private render(): void {
    const lines: string[] = [];
    lines.push(`<div class="town-header">[T] Town of Edgehollow</div>`);
    lines.push(`<div class="town-gold">Gold: ${this.state.partyGold}g</div>`);

    if (this.screen === "main") {
      this.renderMain(lines);
    } else if (this.screen === "shop") {
      this.renderShop(lines);
    } else if (this.screen === "guild") {
      this.renderGuild(lines);
    } else {
      // inn / temple / training — flash message + party status
      this.renderFacility(lines);
    }

    if (this.flash) {
      lines.push(`<div class="town-flash">${this.flash}</div>`);
    }

    this.panel.innerHTML = lines.join("");
  }

  private renderMain(lines: string[]): void {
    // Party status summary (left panel equivalent — shown above menu)
    const aliveCount = this.state.party.filter((c) => c.hp > 0).length;
    const avgLevel = Math.round(
      this.state.party.reduce((sum, c) => sum + c.level, 0) / this.state.party.length
    );
    lines.push(
      `<div class="town-gold">Party: ${aliveCount}/${this.state.party.length} alive · Avg Lv${avgLevel} · Gold: ${this.state.partyGold}g</div>`
    );

    lines.push(`<div class="town-menu">`);
    for (let i = 0; i < MAIN_MENU_ITEMS.length; i++) {
      const item = MAIN_MENU_ITEMS[i];
      const selected = i === this.selectedIndex;
      const marker = selected ? "▶" : " ";
      lines.push(
        `<div class="town-menu-item ${selected ? "selected" : ""}">` +
          `<span class="tm-marker">${marker}</span>` +
          `<span class="tm-icon">${item.icon}</span>` +
          `<span>${item.label}</span>` +
          `</div>`
      );
    }
    lines.push(`</div>`);
    lines.push(`<div class="town-help">[↑/↓] navigate · [Enter] select · [Esc] save menu</div>`);
  }

  private renderShop(lines: string[]): void {
    lines.push(`<div class="shop-tabs">`);
    lines.push(`<span class="shop-tab ${this.shopTab === "buy" ? "active" : ""}">Buy [B]</span>`);
    lines.push(`<span class="shop-tab ${this.shopTab === "sell" ? "active" : ""}">Sell [S]</span>`);
    lines.push(`<span class="shop-tab ${this.shopTab === "appraise" ? "active" : ""}">Appraise [A]</span>`);
    lines.push(`</div>`);

    if (this.shopTab === "appraise") {
      const list = this.getAppraiseList();
      lines.push(`<div class="shop-list">`);
      if (list.length === 0) {
        lines.push(`<div class="shop-empty">Nothing needs appraising.</div>`);
      }
      for (let i = 0; i < list.length; i++) {
        const entry = this.state.inventory[list[i]];
        const item = ITEMS_BY_ID[entry.itemId];
        if (!item) continue;
        const selected = i === this.shopIndex;
        const marker = selected ? "▶" : " ";
        lines.push(
          `<div class="shop-item ${selected ? "selected" : ""}">` +
            `<span class="si-marker">${marker}</span>` +
            `<span class="si-name">${displayNameFor(item, false)}</span>` +
            `<span class="si-stats">?</span>` +
            `<span class="si-price">${APPRAISE_COST}g</span>` +
            `</div>`
        );
      }
      lines.push(`</div>`);
      lines.push(`<div class="town-help">[↑/↓] navigate · [Enter] appraise · [B/S] other tabs · [Esc] back</div>`);
      return;
    }

    if (this.shopTab === "buy") {
      const buyList = this.getShopBuyList();
      lines.push(`<div class="shop-list">`);
      for (let i = 0; i < buyList.length; i++) {
        const item = buyList[i];
        const selected = i === this.shopIndex;
        const marker = selected ? "▶" : " ";
        const affordable = this.state.partyGold >= item.price;
        const cls = `shop-item ${selected ? "selected" : ""} ${affordable ? "" : "unaffordable"}`;
        const stats = this.itemStatsStr(item);
        lines.push(
          `<div class="${cls}">` +
            `<span class="si-marker">${marker}</span>` +
            `<span class="si-name">${item.name}</span>` +
            `<span class="si-stats">${stats}</span>` +
            `<span class="si-price">${item.price}g</span>` +
            `</div>`
        );
      }
      lines.push(`</div>`);
    } else {
      const inv = this.state.inventory;
      lines.push(`<div class="shop-list">`);
      if (inv.length === 0) {
        lines.push(`<div class="shop-empty">Your inventory is empty.</div>`);
      }
      for (let i = 0; i < inv.length; i++) {
        const entry = inv[i];
        const item = ITEMS_BY_ID[entry.itemId];
        if (!item) continue;
        const selected = i === this.shopIndex;
        const marker = selected ? "▶" : " ";
        const sellPrice = Math.floor(item.price / 2);
        const stats = entry.identified ? this.itemStatsStr(item) : "?";
        const name = displayNameFor(item, entry.identified);
        lines.push(
          `<div class="shop-item ${selected ? "selected" : ""}">` +
            `<span class="si-marker">${marker}</span>` +
            `<span class="si-name">${name}</span>` +
            `<span class="si-stats">${stats}</span>` +
            `<span class="si-price">${entry.identified ? `${sellPrice}g` : "—"}</span>` +
            `</div>`
        );
      }
      lines.push(`</div>`);
    }
    lines.push(`<div class="town-help">[↑/↓] navigate · [Enter] buy/sell · [B] buy tab · [S] sell tab · [Esc] back</div>`);
  }

  private renderGuild(lines: string[]): void {
    lines.push(`<div class="guild-roster">`);
    for (const c of this.state.party) {
      const hpPct = Math.round((c.hp / c.maxHp) * 100);
      const spPct = c.maxSp > 0 ? Math.round((c.sp / c.maxSp) * 100) : 100;
      const xpNeeded = xpForNextLevel(c.level);
      const status = c.status.length > 0 ? ` [${c.status.join(",")}]` : "";
      lines.push(
        `<div class="guild-char">` +
          `<span class="gc-name">${c.name}</span>` +
          `<span class="gc-class">Lv${c.level} ${c.race} ${c.class}</span>` +
          `<span class="gc-hp">HP ${c.hp}/${c.maxHp} (${hpPct}%)</span>` +
          `<span class="gc-sp">SP ${c.sp}/${c.maxSp} (${spPct}%)</span>` +
          `<span class="gc-xp">XP ${c.xp}/${xpNeeded}</span>` +
          `<span class="gc-status">${status}</span>` +
          `</div>`
      );
    }
    lines.push(`</div>`);
    lines.push(`<div class="town-help">[Esc/Enter] back to menu</div>`);
  }

  private renderFacility(lines: string[]): void {
    // Temple advertises Remove Curse while any cursed gear is equipped.
    if (this.screen === "temple" && this.equippedCursed().length > 0) {
      lines.push(
        `<div class="town-gold">Cursed gear detected! [R] Remove Curse (${REMOVE_CURSE_COST}g)</div>`
      );
    }
    // Show party status after inn/temple/training
    lines.push(`<div class="guild-roster">`);
    for (const c of this.state.party) {
      const hpPct = Math.round((c.hp / c.maxHp) * 100);
      const spPct = c.maxSp > 0 ? Math.round((c.sp / c.maxSp) * 100) : 100;
      const xpNeeded = xpForNextLevel(c.level);
      lines.push(
        `<div class="guild-char">` +
          `<span class="gc-name">${c.name}</span>` +
          `<span class="gc-class">Lv${c.level} ${c.class}</span>` +
          `<span class="gc-hp">HP ${c.hp}/${c.maxHp} (${hpPct}%)</span>` +
          `<span class="gc-sp">SP ${c.sp}/${c.maxSp} (${spPct}%)</span>` +
          `<span class="gc-xp">XP ${c.xp}/${xpNeeded}</span>` +
          `</div>`
      );
    }
    lines.push(`</div>`);
    lines.push(`<div class="town-help">[Esc/Enter] back to menu</div>`);
  }

  private itemStatsStr(item: ItemDef): string {
    const parts: string[] = [];
    if (item.attackBonus) parts.push(`ATK+${item.attackBonus}`);
    if (item.defenseBonus) parts.push(`DEF+${item.defenseBonus}`);
    if (item.effect) {
      if (item.effect.kind === "heal") parts.push(`Heal ${item.effect.power}`);
      if (item.effect.kind === "cure") parts.push(`Cure ${item.effect.status}`);
      if (item.effect.kind === "revive") parts.push(`Revive`);
    }
    return parts.join(" · ");
  }
}
