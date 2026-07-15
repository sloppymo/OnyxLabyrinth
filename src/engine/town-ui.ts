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

import type { GameState } from "../types";
import { restoreParty, type Stats } from "../game/party";
import { ALL_ITEMS, ITEMS_BY_ID, displayNameFor, type ItemDef } from "../data/items";
import { equipItem, findBestEquipTarget, getDisplacedItem, type Loadout } from "../game/combat";
import { xpForNextLevel } from "../game/leveling";
import { perksForCharacter, partyShopDiscount, discountedShopPrice } from "../game/perks";

type TownScreen = "main" | "inn" | "temple" | "shop" | "roster";
type ShopTab = "buy" | "sell" | "appraise" | "buyConfirm";
type RosterTab = "status" | "progress";

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
  { key: "roster", label: "Guild — Party roster", icon: "[G]" },
  { key: "reform", label: "Reform Party — Create a new party", icon: "[R]" },
  { key: "dungeon", label: "Enter Dungeon", icon: "[>]" },
  { key: "save", label: "Save / Load", icon: "[S]" },
] as const;

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
  private tradeIn = true;

  // Buy-confirm state
  private buyConfirmItem?: ItemDef;
  private buyConfirmTarget?: { id: string; name: string };
  private buyConfirmOldLoadout?: Loadout;
  private buyConfirmNextLoadout?: Loadout;

  // Roster state
  private rosterTab: RosterTab = "status";

  // Temple state (when cursed gear is equipped)
  private templeIndex = 0;

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
    // Roster: S/P and ←/→ switch tabs.
    if (this.screen === "roster") {
      if (lower === "s" || lower === "arrowleft") {
        this.rosterTab = "status";
        this.render();
        return;
      }
      if (lower === "p" || lower === "arrowright") {
        this.rosterTab = "progress";
        this.render();
        return;
      }
    }
    if (this.screen === "temple") {
      this.handleTempleKey(lower, key);
      return;
    }
    // inn, roster — dismiss with Esc/Enter/Space
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

  private handleTempleKey(lower: string, key: string): void {
    if (lower === "r") {
      this.doRemoveCurse();
      return;
    }

    const hasCursed = this.equippedCursed().length > 0;
    if (hasCursed) {
      switch (lower) {
        case "arrowup":
        case "w":
          this.templeIndex = 0;
          this.render();
          break;
        case "arrowdown":
        case "s":
          this.templeIndex = 1;
          this.render();
          break;
        case "enter":
        case " ":
          if (this.templeIndex === 1) {
            this.doRemoveCurse();
          } else {
            this.screen = "main";
            this.flash = "";
            this.render();
          }
          break;
        case "escape":
          this.screen = "main";
          this.flash = "";
          this.render();
          break;
      }
      return;
    }

    if (lower === "escape" || key === "Enter" || key === " ") {
      this.screen = "main";
      this.flash = "";
      this.render();
    }
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
        this.panel.style.display = "none";
        this.panel.innerHTML = "";
        this.onOpenSave();
        break;
    }

    // Bracketed icon hotkeys (e.g. [I] Inn, [$] Shop, [>] Dungeon).
    const hotIndex = MAIN_MENU_ITEMS.findIndex(
      (item) => item.icon[1].toLowerCase() === lower
    );
    if (hotIndex !== -1) {
      this.selectedIndex = hotIndex;
      this.flash = "";
      this.selectMain();
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
      case "roster":
        this.screen = "roster";
        this.rosterTab = "status";
        this.flash = "";
        this.render();
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
    this.templeIndex = 0;
    this.flash = "The Temple's blessing restores the party. HP and SP fully restored!";
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
    if (this.shopTab === "buyConfirm") {
      this.handleBuyConfirmKey(lower);
      return;
    }

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
      case "arrowleft":
      case "arrowright": {
        const order = ["buy", "sell", "appraise"] as const;
        const i = order.indexOf(this.shopTab);
        if (i < 0) break;
        const dir = lower === "arrowleft" ? -1 : 1;
        this.shopTab = order[(i + dir + order.length) % order.length];
        this.shopIndex = 0;
        this.flash = "";
        this.render();
        break;
      }
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
          this.openBuyConfirm(buyList[this.shopIndex]);
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

  private handleBuyConfirmKey(lower: string): void {
    switch (lower) {
      case "t":
        this.tradeIn = !this.tradeIn;
        this.render();
        break;
      case "enter":
      case " ":
        this.buyConfirmed();
        break;
      case "escape":
        this.shopTab = "buy";
        this.flash = "";
        this.render();
        break;
    }
  }

  private openBuyConfirm(item: ItemDef | undefined): void {
    if (!item) return;
    this.buyConfirmItem = item;
    this.shopTab = "buyConfirm";
    this.tradeIn = true;
    this.flash = "";

    if (item.type !== "consumable") {
      const targetId = findBestEquipTarget(this.state.party, this.state.equipment, item);
      if (targetId) {
        const target = this.state.party.find((c) => c.id === targetId);
        this.buyConfirmTarget = target ? { id: targetId, name: target.name } : { id: targetId, name: "someone" };
        this.buyConfirmOldLoadout = this.state.equipment[targetId];
        this.buyConfirmNextLoadout = equipItem(this.buyConfirmOldLoadout, item);
      } else {
        this.buyConfirmTarget = undefined;
        this.buyConfirmOldLoadout = undefined;
        this.buyConfirmNextLoadout = undefined;
      }
    } else {
      this.buyConfirmTarget = undefined;
      this.buyConfirmOldLoadout = undefined;
      this.buyConfirmNextLoadout = undefined;
    }

    this.render();
  }

  private buyConfirmed(): void {
    const item = this.buyConfirmItem;
    if (!item) return;

    const old = this.buyConfirmOldLoadout;
    const next = this.buyConfirmNextLoadout;
    const targetId = this.buyConfirmTarget?.id;
    const willEquip = next !== undefined && next !== old;
    const displaced = willEquip && old ? getDisplacedItem(old, next, item) : undefined;
    const price = this.buyPrice(item);
    const tradeInValue = this.tradeIn && displaced ? Math.floor(displaced.price / 2) : 0;
    const netCost = price - tradeInValue;

    if (this.state.partyGold < netCost) {
      this.flash = `Not enough gold — you need ${netCost}g.`;
      this.render();
      return;
    }

    this.state.partyGold -= netCost;

    if (willEquip && targetId) {
      this.state.equipment[targetId] = next;
      if (displaced && !this.tradeIn) {
        this.state.inventory.push({ itemId: displaced.id, identified: true });
      }
      const targetName = this.buyConfirmTarget?.name ?? "someone";
      if (displaced && this.tradeIn) {
        this.flash = `Bought ${item.name} for ${price}g, trading in ${displaced.name} for ${tradeInValue}g (net ${netCost}g), and equipped it on ${targetName}.`;
      } else if (displaced) {
        this.flash = `Bought ${item.name} for ${price}g and equipped it on ${targetName}. ${displaced.name} placed in your inventory.`;
      } else {
        this.flash = `Bought ${item.name} for ${price}g and equipped it on ${targetName}.`;
      }
    } else {
      this.state.inventory.push({ itemId: item.id, identified: true });
      this.flash = `Bought ${item.name} for ${price}g.`;
    }

    this.shopTab = "buy";
    this.buyConfirmItem = undefined;
    this.buyConfirmTarget = undefined;
    this.buyConfirmOldLoadout = undefined;
    this.buyConfirmNextLoadout = undefined;
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
    } else if (this.screen === "roster") {
      this.renderRoster(lines);
    } else {
      // inn / temple — flash message + party status
      this.renderFacility(lines);
    }

    if (this.flash) {
      lines.push(`<div class="town-flash">${this.flash}</div>`);
    }

    this.panel.innerHTML = lines.join("");
    if (this.screen === "shop") {
      this.scrollShopSelectionIntoView();
    }
  }

  private scrollShopSelectionIntoView(): void {
    const selected = this.panel.querySelector<HTMLElement>(".shop-item.selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
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
    lines.push(`<div class="town-help">[↑/↓] navigate · [A/Enter] select · letter jumps · [Select/Esc] save</div>`);
  }

  private renderShop(lines: string[]): void {
    if (this.shopTab === "buyConfirm") {
      this.renderBuyConfirm(lines);
      return;
    }

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
      lines.push(`<div class="town-help">[↑/↓] navigate · [Enter] appraise · [←/→] tabs · [B/S/A] jump · [Esc] back</div>`);
      return;
    }

    if (this.shopTab === "buy") {
      const buyList = this.getShopBuyList();
      lines.push(`<div class="shop-list">`);
      for (let i = 0; i < buyList.length; i++) {
        const item = buyList[i];
        const selected = i === this.shopIndex;
        const marker = selected ? "▶" : " ";
        const affordable = this.canAffordWithTradeIn(item);
        const cls = `shop-item ${selected ? "selected" : ""} ${affordable ? "" : "unaffordable"}`;
        const stats = this.itemStatsStr(item);
        lines.push(
          `<div class="${cls}">` +
            `<span class="si-marker">${marker}</span>` +
            `<span class="si-name">${item.name}</span>` +
            `<span class="si-stats">${stats}</span>` +
            `<span class="si-price">${this.buyPrice(item)}g</span>` +
            `</div>`
        );
      }
      lines.push(`</div>`);
      lines.push(this.renderBuyPreview());
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
    const help =
      this.shopTab === "buy"
        ? `[↑/↓] navigate · [Enter] compare · [←/→] tabs · [B/S/A] jump · [Esc] back`
        : `[↑/↓] navigate · [Enter] buy/sell · [←/→] tabs · [B/S/A] jump · [Esc] back`;
    lines.push(`<div class="town-help">${help}</div>`);
  }

  private renderBuyPreview(): string {
    const buyList = this.getShopBuyList();
    const item = buyList[this.shopIndex];
    if (!item) return "";

    if (item.type === "consumable") {
      return `<div class="shop-compare">Use in combat (e.g., Healing Potion restores 30 HP).</div>`;
    }

    const targetId = findBestEquipTarget(this.state.party, this.state.equipment, item);
    if (!targetId) {
      return `<div class="shop-compare">No party member can equip this. Will be added to inventory.</div>`;
    }

    const old = this.state.equipment[targetId];
    const next = equipItem(old, item);
    const targetName = this.state.party.find((c) => c.id === targetId)?.name ?? "someone";

    if (next === old) {
      const current = this.equipmentItemFor(old, item);
      return `<div class="shop-compare">Not an upgrade for ${targetName} (current: ${this.itemNameFor(current)} ${this.itemStatsStr(current)}). Adds to inventory.</div>`;
    }

    const displaced = getDisplacedItem(old, next, item);
    const current = displaced ?? undefined;
    const tradeInValue = displaced ? Math.floor(displaced.price / 2) : 0;
    const tradeInText = displaced ? ` · trade-in: ${tradeInValue}g` : "";
    return (
      `<div class="shop-compare">` +
      `Compare: ${targetName} — ` +
      `Current: ${this.itemNameFor(current)} ${this.itemStatsStr(current)} → ` +
      `New: ${item.name} ${this.itemStatsStr(item)}` +
      `${tradeInText}` +
      `</div>`
    );
  }

  private renderBuyConfirm(lines: string[]): void {
    const item = this.buyConfirmItem;
    if (!item) return;

    lines.push(`<div class="buy-confirm-header">${item.name}</div>`);
    lines.push(`<div class="buy-confirm-sub">${this.itemStatsStr(item) || "no bonuses"}</div>`);

    const old = this.buyConfirmOldLoadout;
    const next = this.buyConfirmNextLoadout;
    const targetName = this.buyConfirmTarget?.name;
    const willEquip = next !== undefined && next !== old;
    const displaced = willEquip && old ? getDisplacedItem(old, next, item) : undefined;

    if (targetName && willEquip) {
      const current = displaced ?? undefined;
      lines.push(`<div class="buy-compare-row">`);
      lines.push(`<span class="buy-compare-label">Target:</span> <span class="buy-compare-value">${targetName}</span>`);
      lines.push(`</div>`);
      lines.push(`<div class="buy-compare-row">`);
      lines.push(`<span class="buy-compare-label">Current:</span> <span class="buy-compare-current">${this.itemNameFor(current)} — ${this.itemStatsStr(current) || "none"}</span>`);
      lines.push(`</div>`);
      lines.push(`<div class="buy-compare-row">`);
      lines.push(`<span class="buy-compare-label">New:</span> <span class="buy-compare-new">${item.name} — ${this.itemStatsStr(item) || "none"}</span>`);
      lines.push(`</div>`);

      const price = this.buyPrice(item);
      if (displaced) {
        const tradeInValue = Math.floor(displaced.price / 2);
        const netCost = price - (this.tradeIn ? tradeInValue : 0);
        const tradeInLabel = this.tradeIn ? "ON" : "OFF";
        lines.push(`<div class="buy-compare-row">`);
        lines.push(`<span class="buy-compare-label">Trade-in:</span> <span class="buy-compare-value ${this.tradeIn ? "tradein-on" : "tradein-off"}">${tradeInLabel}</span> (old ${displaced.name} → ${tradeInValue}g)`);
        lines.push(`</div>`);
        lines.push(`<div class="buy-compare-row">`);
        lines.push(`<span class="buy-compare-label">Price:</span> ${price}g · <span class="buy-compare-label">Net:</span> ${netCost}g`);
        lines.push(`</div>`);
        lines.push(`<div class="buy-compare-row">`);
        lines.push(`<span class="buy-compare-label">Current gold:</span> ${this.state.partyGold}g`);
        lines.push(`</div>`);
        if (this.state.partyGold < netCost) {
          lines.push(`<div class="buy-compare-warning">Not enough gold — need ${netCost}g.</div>`);
        }
      } else {
        lines.push(`<div class="buy-compare-row">`);
        lines.push(`<span class="buy-compare-label">No old item to trade in.</span>`);
        lines.push(`</div>`);
        lines.push(`<div class="buy-compare-row">`);
        lines.push(`<span class="buy-compare-label">Price:</span> ${price}g · <span class="buy-compare-label">Current gold:</span> ${this.state.partyGold}g`);
        lines.push(`</div>`);
        if (this.state.partyGold < price) {
          lines.push(`<div class="buy-compare-warning">Not enough gold — need ${price}g.</div>`);
        }
      }
    } else {
      const price = this.buyPrice(item);
      lines.push(`<div class="buy-compare-row">`);
      lines.push(`<span class="buy-compare-label">Will be added to inventory.</span>`);
      lines.push(`</div>`);
      lines.push(`<div class="buy-compare-row">`);
      lines.push(`<span class="buy-compare-label">Price:</span> ${price}g · <span class="buy-compare-label">Current gold:</span> ${this.state.partyGold}g`);
      lines.push(`</div>`);
      if (this.state.partyGold < price) {
        lines.push(`<div class="buy-compare-warning">Not enough gold — need ${price}g.</div>`);
      }
    }

    lines.push(`<div class="town-help">[Enter] buy · [T] toggle trade-in · [Esc] cancel</div>`);
  }

  private itemNameFor(item: ItemDef | undefined): string {
    return item ? item.name : "None";
  }

  private equipmentItemFor(loadout: Loadout, item: ItemDef): ItemDef | undefined {
    if (item.type === "weapon") return loadout.weapon;
    if (item.slot) return loadout.armor.find((a) => a.slot === item.slot);
    return undefined;
  }

  /** Buy price after the party's perk discount (thief-swindler). Sell and
   *  trade-in values stay at base price. */
  private buyPrice(item: ItemDef): number {
    return discountedShopPrice(item.price, partyShopDiscount(this.state.party));
  }

  private canAffordWithTradeIn(item: ItemDef): boolean {
    const price = this.buyPrice(item);
    if (item.type === "consumable") return this.state.partyGold >= price;
    const targetId = findBestEquipTarget(this.state.party, this.state.equipment, item);
    if (!targetId) return this.state.partyGold >= price;
    const old = this.state.equipment[targetId];
    const next = equipItem(old, item);
    if (next === old) return this.state.partyGold >= price;
    const displaced = getDisplacedItem(old, next, item);
    const net = price - (displaced ? Math.floor(displaced.price / 2) : 0);
    return this.state.partyGold >= net;
  }

  private renderRoster(lines: string[]): void {
    lines.push(`<div class="shop-tabs">`);
    lines.push(
      `<span class="shop-tab ${this.rosterTab === "status" ? "active" : ""}">Status [S]</span>`
    );
    lines.push(
      `<span class="shop-tab ${this.rosterTab === "progress" ? "active" : ""}">Progress [P]</span>`
    );
    lines.push(`</div>`);

    lines.push(`<div class="guild-roster">`);
    if (this.rosterTab === "status") {
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
    } else {
      for (const c of this.state.party) {
        const xpNeeded = xpForNextLevel(c.level);
        const xpRemaining = Math.max(0, xpNeeded - c.xp);
        const perks = perksForCharacter(c);
        const perksStr = perks.length > 0 ? perks.map((p) => p.name).join(", ") : "None";
        lines.push(
          `<div class="guild-char">` +
            `<span class="gc-name">${c.name}</span>` +
            `<span class="gc-class">Lv${c.level} ${c.class}</span>` +
            `<span class="gc-xp">XP ${c.xp} · ${xpRemaining} to next</span>` +
            `<span class="gc-status">Perks: ${perksStr}</span>` +
            `</div>`
        );
      }
    }
    lines.push(`</div>`);
    lines.push(`<div class="town-help">[←/→] tabs · [S/P] jump · [Esc/Enter] back</div>`);
  }

  private renderFacility(lines: string[]): void {
    if (this.screen === "temple" && this.equippedCursed().length > 0) {
      lines.push(`<div class="temple-menu">`);
      const backSelected = this.templeIndex === 0;
      lines.push(
        `<div class="temple-menu-item ${backSelected ? "selected" : ""}">` +
          `<span class="tm-marker">${backSelected ? "▶" : " "}</span>` +
          `<span>Back to menu</span>` +
          `</div>`
      );
      const curseSelected = this.templeIndex === 1;
      lines.push(
        `<div class="temple-menu-item ${curseSelected ? "selected" : ""}">` +
          `<span class="tm-marker">${curseSelected ? "▶" : " "}</span>` +
          `<span>Remove Curse (${REMOVE_CURSE_COST}g) [R]</span>` +
          `</div>`
      );
      lines.push(`</div>`);
    }
    // Show party status after inn/temple
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
    const templeHelp =
      this.screen === "temple" && this.equippedCursed().length > 0
        ? `[↑/↓] navigate · [Enter] select · [R] remove curse · [Esc] back`
        : `[Esc/Enter] back to menu`;
    lines.push(`<div class="town-help">${templeHelp}</div>`);
  }

  private itemStatsStr(item: ItemDef | undefined): string {
    if (!item) return "";
    const parts: string[] = [];
    if (item.cursed) parts.push("Cursed");
    if (item.attackBonus !== undefined && item.attackBonus !== 0) {
      parts.push(item.attackBonus > 0 ? `ATK+${item.attackBonus}` : `ATK${item.attackBonus}`);
    }
    if (item.defenseBonus !== undefined && item.defenseBonus !== 0) {
      parts.push(item.defenseBonus > 0 ? `DEF+${item.defenseBonus}` : `DEF${item.defenseBonus}`);
    }
    if (item.type === "weapon" && item.range) {
      parts.push(item.range[0].toUpperCase() + item.range.slice(1));
    }
    if (item.type === "armor" && item.slot) {
      parts.push(item.slot[0].toUpperCase() + item.slot.slice(1));
    }
    if (item.statBonuses) {
      for (const key of ["str", "int", "pie", "vit", "agi", "luk"] as (keyof Stats)[]) {
        const value = item.statBonuses[key];
        if (value !== undefined && value !== 0) {
          parts.push(`${value > 0 ? "+" : ""}${value} ${key.toUpperCase()}`);
        }
      }
    }
    if (item.effect) {
      if (item.effect.kind === "heal") parts.push(`Heal ${item.effect.power}`);
      if (item.effect.kind === "cure") parts.push(`Cure ${item.effect.status}`);
      if (item.effect.kind === "revive") parts.push(`Revive`);
    }
    return parts.join(" · ");
  }
}
