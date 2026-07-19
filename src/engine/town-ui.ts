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
import { restoreParty, charRow, type Character, type Stats } from "../game/party";
import { ALL_ITEMS, ITEMS_BY_ID, displayNameFor, type EquipSlot, type ItemDef } from "../data/items";
import {
  equipItem,
  findBestEquipTarget,
  getDisplacedItem,
  manualEquip,
  manualUnequip,
  canReach,
  effectiveWeaponRange,
} from "../game/combat";
import type { Loadout } from "../game/combat-types";
import { effectiveStats } from "../game/effective-stats";
import { xpForNextLevel } from "../game/leveling";
import { perksForCharacter, partyShopDiscount, discountedShopPrice } from "../game/perks";
import { FF6Window, type FF6WindowItem } from "./ff6-window-library";
import { audio } from "./audio";

type TownScreen = "main" | "inn" | "temple" | "shop" | "roster" | "equip";
type EquipPhase = "char" | "slot" | "item";
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
  { key: "equip", label: "Equip — Outfit party members", icon: "[E]" },
  { key: "reform", label: "Reform Party — Create a new party", icon: "[R]" },
  { key: "dungeon", label: "Enter Dungeon", icon: "[>]" },
  { key: "save", label: "Save / Load", icon: "[S]" },
] as const;

/** The four fixed equip-slot rows on the Equip screen, FF6-style. */
const EQUIP_SLOTS: { slot: EquipSlot; label: string }[] = [
  { slot: "hand", label: "Weapon" },
  { slot: "body", label: "Body" },
  { slot: "shield", label: "Shield" },
  { slot: "head", label: "Head" },
];

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

  // Equip screen state
  private equipPhase: EquipPhase = "char";
  private equipCharIndex = 0;
  private equipSlotIndex = 0;
  private equipItemIndex = 0;

  // Temple state (when cursed gear is equipped)
  private templeIndex = 0;

  /** Last rendered screen key — the FF6 window open animation plays only
   *  when the screen actually changes, not on every cursor move. */
  private lastScreenKey = "";

  constructor(opts: TownControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.onEnterDungeon = opts.onEnterDungeon;
    this.onOpenSave = opts.onOpenSave;
    this.onReformParty = opts.onReformParty;
    this.panel.style.display = "flex";
    this.render();
  }

  handleKey(key: string): void {
    audio.uiForMenuKey(key);
    const lower = key.toLowerCase();

    if (this.screen === "main") {
      this.handleMainKey(lower);
      return;
    }
    if (this.screen === "shop") {
      this.handleShopKey(lower);
      return;
    }
    if (this.screen === "equip") {
      this.handleEquipKey(lower);
      return;
    }
    // Roster: S/P and ←/→ switch tabs; E jumps to the Equip screen.
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
      if (lower === "e") {
        this.openEquipScreen();
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
        if (lower === "w") audio.uiCursor();
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
      audio.uiConfirm();
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
      case "equip":
        this.openEquipScreen();
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
    audio.uiCureMenu();
    this.state.party = restoreParty(this.state.party);
    this.screen = "inn";
    this.flash = "The party rests at the Inn. HP and SP fully restored!";
    this.render();
  }

  private doTemple(): void {
    audio.uiCureMenu();
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
      case "y":
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
    audio.uiBuySell();

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
    audio.uiBuySell();

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
  //
  // All town screens render through the FF6Window library so the town shares
  // the combat scene's blue window aesthetic. FF6Window is used statelessly:
  // the controller's own fields (selectedIndex/shopIndex/templeIndex/…)
  // remain the single source of truth and every keyboard handler above is
  // unchanged — the windows are rebuilt on state change, and their
  // onHover/onConfirm callbacks add mouse support by mirroring the same
  // actions the keys trigger.

  private render(): void {
    const screenKey =
      this.screen === "shop"
        ? `shop:${this.shopTab}`
        : this.screen === "equip"
          ? `equip:${this.equipPhase}`
          : this.screen;
    const animated = screenKey !== this.lastScreenKey;
    this.lastScreenKey = screenKey;
    this.panel.innerHTML = "";

    if (this.screen === "main") {
      this.renderMain(animated);
    } else if (this.screen === "shop") {
      this.renderShop(animated);
    } else if (this.screen === "roster") {
      this.renderRoster(animated);
    } else if (this.screen === "equip") {
      this.renderEquip(animated);
    } else {
      // inn / temple — flash message + party status
      this.renderFacility(animated);
    }
  }

  private renderMain(animated: boolean): void {
    const aliveCount = this.state.party.filter((c) => c.hp > 0).length;
    const avgLevel = Math.round(
      this.state.party.reduce((sum, c) => sum + c.level, 0) / this.state.party.length
    );

    const win = new FF6Window({
      title: "Town of Edgehollow",
      items: MAIN_MENU_ITEMS.map((item) => ({
        label: item.label,
        metadata: item.key,
      })),
      selectedIndex: this.selectedIndex,
      mode: "menu",
      flash: this.flash || null,
      footer: "D-pad navigate · A select · Select save",
      footer2: `Party: ${aliveCount}/${this.state.party.length} alive · Avg Lv${avgLevel} · Gold: ${this.state.partyGold}g`,
      animated,
      onHover: (i) => {
        this.selectedIndex = i;
      },
      onConfirm: (i) => {
        this.selectedIndex = i;
        this.flash = "";
        this.selectMain();
      },
      onBack: () => {
        this.panel.style.display = "none";
        this.panel.innerHTML = "";
        this.onOpenSave();
      },
    });
    this.panel.appendChild(win.render());
  }

  private renderShop(animated: boolean): void {
    if (this.shopTab === "buyConfirm") {
      this.renderBuyConfirm(animated);
      return;
    }

    const tabsHtml =
      `<div class="shop-tabs">` +
      `<span class="shop-tab ${this.shopTab === "buy" ? "active" : ""}">Buy</span>` +
      `<span class="shop-tab ${this.shopTab === "sell" ? "active" : ""}">Sell</span>` +
      `<span class="shop-tab ${this.shopTab === "appraise" ? "active" : ""}">Appraise</span>` +
      `</div>`;

    let items: FF6WindowItem[] = [];
    let emptyHtml = "";
    let help: string;
    let confirm: (i: number) => void;

    if (this.shopTab === "appraise") {
      const list = this.getAppraiseList();
      if (list.length === 0) emptyHtml = `<div class="shop-empty">Nothing needs appraising.</div>`;
      items = list.map((invIndex) => {
        const entry = this.state.inventory[invIndex];
        const item = ITEMS_BY_ID[entry.itemId];
        if (!item) return { label: "???", detail: `${APPRAISE_COST}g`, metadata: invIndex };
        return {
          label: `${displayNameFor(item, false)} — ?`,
          detail: `${APPRAISE_COST}g`,
          metadata: invIndex,
        };
      });
      help = `D-pad navigate · A appraise · ←→ tabs · B back`;
      confirm = (i) => this.appraiseItem(this.getAppraiseList()[i]);
    } else if (this.shopTab === "buy") {
      const buyList = this.getShopBuyList();
      items = buyList.map((item) => {
        const stats = this.itemStatsStr(item);
        return {
          label: stats ? `${item.name} — ${stats}` : item.name,
          detail: `${this.buyPrice(item)}g`,
          className: this.canAffordWithTradeIn(item) ? undefined : "unaffordable",
          metadata: item.id,
        };
      });
      help = `D-pad navigate · A compare · ←→ tabs · B back`;
      confirm = (i) => this.openBuyConfirm(this.getShopBuyList()[i]);
    } else {
      const inv = this.state.inventory;
      if (inv.length === 0) emptyHtml = `<div class="shop-empty">Your inventory is empty.</div>`;
      items = inv.map((entry) => {
        const item = ITEMS_BY_ID[entry.itemId];
        if (!item) return { label: "???", detail: "—", metadata: entry.itemId };
        const stats = entry.identified ? this.itemStatsStr(item) : "?";
        const name = displayNameFor(item, entry.identified);
        return {
          label: stats ? `${name} — ${stats}` : name,
          detail: entry.identified ? `${Math.floor(item.price / 2)}g` : "—",
          metadata: entry.itemId,
        };
      });
      help = `D-pad navigate · A sell · ←→ tabs · B back`;
      confirm = (i) => this.sellItem(i);
    }

    const win = new FF6Window({
      title: "Shop",
      contentHtml: tabsHtml + emptyHtml,
      items,
      selectedIndex: this.shopIndex,
      mode: "selection",
      allowMultilineLabels: true,
      flash: this.flash || null,
      footer: help,
      footer2: `Gold: ${this.state.partyGold}g`,
      animated,
      onHover: (i) => {
        if (i !== this.shopIndex) {
          this.shopIndex = i;
          this.flash = "";
          this.render(); // buy preview tracks the cursor
        }
      },
      onConfirm: (i) => {
        this.shopIndex = i;
        confirm(i);
      },
      onBack: () => {
        this.screen = "main";
        this.flash = "";
        this.render();
      },
    });
    this.panel.appendChild(win.render());

    if (this.shopTab === "buy") {
      const previewHtml = this.renderBuyPreview();
      if (previewHtml) {
        this.panel.appendChild(
          FF6Window.frame({ contentHtml: previewHtml, mode: "description", animated })
        );
      }
    }
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

  private renderBuyConfirm(animated: boolean): void {
    const item = this.buyConfirmItem;
    if (!item) return;

    const lines: string[] = [];
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

    this.panel.appendChild(
      FF6Window.frame({
        title: "Shop — Purchase",
        contentHtml: lines.join(""),
        flash: this.flash || null,
        footer: "A buy · Y trade-in · B cancel",
        mode: "description",
        animated,
      })
    );
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

  private renderRoster(animated: boolean): void {
    const lines: string[] = [];
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
    this.panel.appendChild(
      FF6Window.frame({
        title: "Guild — Party Roster",
        contentHtml: lines.join(""),
        flash: this.flash || null,
        footer: "←→ tabs · E equip · B back",
        mode: "status",
        animated,
      })
    );
  }

  // --- Equip screen -------------------------------------------------------
  //
  // FF6-style equipment management: pick a character → pick a slot (Weapon /
  // Body / Shield / Head, plus an Optimum command) → browse owned compatible
  // gear with a live stat-delta preview → confirm to swap. Manual swaps use
  // manualEquip/manualUnequip (downgrades allowed — the player's call);
  // Optimum reuses the shop's strictly-better equipItem semantics. Trinkets
  // stay carried (never slotted) and are shown read-only.

  private openEquipScreen(): void {
    this.screen = "equip";
    this.equipPhase = "char";
    this.equipCharIndex = Math.min(this.equipCharIndex, Math.max(0, this.state.party.length - 1));
    this.equipSlotIndex = 0;
    this.equipItemIndex = 0;
    this.flash = "";
    this.render();
  }

  private equipChar(): Character {
    return this.state.party[this.equipCharIndex];
  }

  private equipLoadout(): Loadout {
    return this.state.equipment[this.equipChar().id] ?? { armor: [] };
  }

  private equippedInSlot(loadout: Loadout, slot: EquipSlot): ItemDef | undefined {
    if (slot === "hand") return loadout.weapon;
    return loadout.armor.find((a) => a.slot === slot);
  }

  /** Inventory indices holding gear that fits `slot`. */
  private equipCandidateIndices(slot: EquipSlot): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.state.inventory.length; i++) {
      const item = ITEMS_BY_ID[this.state.inventory[i].itemId];
      if (!item) continue;
      const fits =
        slot === "hand" ? item.type === "weapon" : item.type === "armor" && item.slot === slot;
      if (fits) out.push(i);
    }
    return out;
  }

  /** Rows of the item-browse list: "(Remove)" followed by owned candidates. */
  private equipItemRows(): { kind: "remove" | "candidate"; invIndex?: number }[] {
    const slotIndex = Math.min(this.equipSlotIndex, EQUIP_SLOTS.length - 1);
    const rows: { kind: "remove" | "candidate"; invIndex?: number }[] = [{ kind: "remove" }];
    for (const invIndex of this.equipCandidateIndices(EQUIP_SLOTS[slotIndex].slot)) {
      rows.push({ kind: "candidate", invIndex });
    }
    return rows;
  }

  private cycleEquipChar(dir: number): void {
    const len = this.state.party.length;
    if (len === 0) return;
    this.equipCharIndex = (this.equipCharIndex + dir + len) % len;
    this.flash = "";
    this.render();
  }

  private handleEquipKey(lower: string): void {
    if (this.equipPhase === "char") {
      const len = this.state.party.length;
      switch (lower) {
        case "arrowup":
        case "w":
          if (len > 0) this.equipCharIndex = (this.equipCharIndex - 1 + len) % len;
          this.flash = "";
          this.render();
          break;
        case "arrowdown":
          if (len > 0) this.equipCharIndex = (this.equipCharIndex + 1) % len;
          this.flash = "";
          this.render();
          break;
        case "enter":
        case " ":
          this.equipPhase = "slot";
          this.equipSlotIndex = 0;
          this.flash = "";
          this.render();
          break;
        case "escape":
          this.screen = "main";
          this.flash = "";
          this.render();
          break;
      }
      return;
    }

    if (this.equipPhase === "slot") {
      const rows = EQUIP_SLOTS.length + 1; // + Optimum
      switch (lower) {
        case "arrowup":
        case "w":
          this.equipSlotIndex = (this.equipSlotIndex - 1 + rows) % rows;
          this.flash = "";
          this.render();
          break;
        case "arrowdown":
          this.equipSlotIndex = (this.equipSlotIndex + 1) % rows;
          this.flash = "";
          this.render();
          break;
        case "arrowleft":
          this.cycleEquipChar(-1);
          break;
        case "arrowright":
          this.cycleEquipChar(1);
          break;
        case "o":
          this.doOptimum();
          break;
        case "enter":
        case " ":
          this.confirmEquipSlotRow();
          break;
        case "escape":
          this.equipPhase = "char";
          this.flash = "";
          this.render();
          break;
      }
      return;
    }

    // item phase
    const len = this.equipItemRows().length;
    switch (lower) {
      case "arrowup":
      case "w":
        if (len > 0) this.equipItemIndex = (this.equipItemIndex - 1 + len) % len;
        this.flash = "";
        this.render();
        break;
      case "arrowdown":
        if (len > 0) this.equipItemIndex = (this.equipItemIndex + 1) % len;
        this.flash = "";
        this.render();
        break;
      case "enter":
      case " ":
        this.confirmEquipItemRow();
        break;
      case "escape":
        this.equipPhase = "slot";
        this.flash = "";
        this.render();
        break;
    }
  }

  private confirmEquipSlotRow(): void {
    if (this.equipSlotIndex >= EQUIP_SLOTS.length) {
      this.doOptimum();
      return;
    }
    const { slot, label } = EQUIP_SLOTS[this.equipSlotIndex];
    const current = this.equippedInSlot(this.equipLoadout(), slot);
    if (current?.cursed) {
      this.flash = `${current.name} is CURSED and cannot be removed — the Temple's Remove Curse (${REMOVE_CURSE_COST}g) can shatter it.`;
      this.render();
      return;
    }
    if (!current && this.equipCandidateIndices(slot).length === 0) {
      this.flash = `No ${label.toLowerCase()} gear in the inventory.`;
      this.render();
      return;
    }
    this.equipPhase = "item";
    this.equipItemIndex = 0;
    this.flash = "";
    this.render();
  }

  private confirmEquipItemRow(): void {
    const { slot, label } = EQUIP_SLOTS[this.equipSlotIndex];
    const c = this.equipChar();
    const loadout = this.equipLoadout();
    const row = this.equipItemRows()[this.equipItemIndex];
    if (!row) return;

    if (row.kind === "remove") {
      const res = manualUnequip(loadout, slot);
      if (!res) {
        const current = this.equippedInSlot(loadout, slot);
        this.flash = current?.cursed
          ? `${current.name} is CURSED and cannot be removed.`
          : `Nothing equipped in the ${label.toLowerCase()} slot.`;
        this.render();
        return;
      }
      this.state.equipment[c.id] = res.loadout;
      this.state.inventory.push({ itemId: res.removed.id, identified: true });
      audio.uiBuySell();
      this.flash = `Removed ${res.removed.name} from ${c.name} — returned to inventory.`;
      this.equipPhase = "slot";
      this.render();
      return;
    }

    const entry = this.state.inventory[row.invIndex!];
    const item = entry ? ITEMS_BY_ID[entry.itemId] : undefined;
    if (!entry || !item) return;
    if (item.cursed && entry.identified) {
      this.flash = `${item.name} is CURSED — equipping it would clamp it on forever. It stays in the pack.`;
      this.render();
      return;
    }
    const res = manualEquip(loadout, item);
    if (!res) {
      const current = this.equippedInSlot(loadout, slot);
      this.flash = current?.cursed
        ? `${current.name} is CURSED — the slot is locked until the Temple removes it.`
        : `${c.name} cannot equip that.`;
      this.render();
      return;
    }
    const wasUnidentified = !entry.identified;
    this.state.inventory.splice(row.invIndex!, 1);
    if (res.displaced) {
      this.state.inventory.push({ itemId: res.displaced.id, identified: true });
    }
    this.state.equipment[c.id] = res.loadout;
    audio.uiBuySell();
    const revealed = wasUnidentified
      ? ` It is a ${item.name}${item.cursed ? " — CURSED! It clamps on!" : "!"}`
      : "";
    const displacedNote = res.displaced ? ` ${res.displaced.name} returned to inventory.` : "";
    this.flash = wasUnidentified
      ? `${c.name} tries on the unknown item.${revealed}${displacedNote}`
      : `${c.name} equips ${item.name}.${displacedNote}`;
    this.equipPhase = "slot";
    this.render();
  }

  /** FF6 "Optimum": auto-equip the best owned gear for the selected character
   *  using the shop's strictly-better equipItem rule. Skips unappraised gear
   *  (unknown quality) and cursed gear (never a deliberate pick). */
  private doOptimum(): void {
    const c = this.equipChar();
    let loadout = this.equipLoadout();
    const equippedNames: string[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < this.state.inventory.length; i++) {
        const entry = this.state.inventory[i];
        const item = ITEMS_BY_ID[entry.itemId];
        if (!item || (item.type !== "weapon" && item.type !== "armor")) continue;
        if (!entry.identified || item.cursed) continue;
        const next = equipItem(loadout, item);
        if (next === loadout) continue;
        const displaced = getDisplacedItem(loadout, next, item);
        this.state.inventory.splice(i, 1);
        if (displaced) {
          this.state.inventory.push({ itemId: displaced.id, identified: true });
        }
        loadout = next;
        equippedNames.push(item.name);
        changed = true;
        break; // inventory indices shifted — restart the scan
      }
    }
    this.state.equipment[c.id] = loadout;
    if (equippedNames.length > 0) audio.uiBuySell();
    this.flash =
      equippedNames.length > 0
        ? `Optimum: equipped ${equippedNames.join(", ")} on ${c.name}.`
        : `${c.name}'s gear is already optimal (of what's owned and appraised).`;
    this.render();
  }

  private renderEquip(animated: boolean): void {
    if (this.equipPhase === "char") {
      this.renderEquipCharPhase(animated);
    } else if (this.equipPhase === "slot") {
      this.renderEquipSlotPhase(animated);
    } else {
      this.renderEquipItemPhase(animated);
    }
  }

  private renderEquipCharPhase(animated: boolean): void {
    const items: FF6WindowItem[] = this.state.party.map((c) => ({
      label: c.name,
      detail: `Lv${c.level} ${c.class} · ${charRow(c)} row`,
      metadata: c.id,
    }));
    const win = new FF6Window({
      title: "Equip — Choose a character",
      items,
      selectedIndex: this.equipCharIndex,
      mode: "selection",
      flash: this.flash || null,
      footer: "D-pad navigate · A select · B back",
      animated,
      onHover: (i) => {
        if (i !== this.equipCharIndex) {
          this.equipCharIndex = i;
          this.render(); // gear summary tracks the cursor
        }
      },
      onConfirm: (i) => {
        this.equipCharIndex = i;
        this.equipPhase = "slot";
        this.equipSlotIndex = 0;
        this.flash = "";
        this.render();
      },
      onBack: () => {
        this.screen = "main";
        this.flash = "";
        this.render();
      },
    });
    this.panel.appendChild(win.render());
    this.panel.appendChild(
      FF6Window.frame({ contentHtml: this.equipLoadoutSummaryHtml(), mode: "description", animated })
    );
  }

  private renderEquipSlotPhase(animated: boolean): void {
    const c = this.equipChar();
    const loadout = this.equipLoadout();
    const items: FF6WindowItem[] = EQUIP_SLOTS.map(({ slot, label }) => {
      const item = this.equippedInSlot(loadout, slot);
      return {
        label,
        detail: item ? `${item.name}${item.cursed ? " (CURSED)" : ""}` : "—",
        className: item?.cursed ? "equip-cursed" : undefined,
        metadata: slot,
      };
    });
    items.push({ label: "Optimum", detail: "auto-equip best owned gear", metadata: "optimum" });

    const win = new FF6Window({
      title: `Equip — ${c.name} (Lv${c.level} ${c.class}, ${charRow(c)} row)`,
      items,
      selectedIndex: this.equipSlotIndex,
      mode: "selection",
      allowMultilineLabels: true,
      flash: this.flash || null,
      footer: "A choose · ←→ character · O optimum · B back",
      animated,
      onHover: (i) => {
        this.equipSlotIndex = i;
      },
      onConfirm: (i) => {
        this.equipSlotIndex = i;
        this.confirmEquipSlotRow();
      },
      onBack: () => {
        this.equipPhase = "char";
        this.flash = "";
        this.render();
      },
    });
    this.panel.appendChild(win.render());
    this.panel.appendChild(
      FF6Window.frame({
        contentHtml: this.equipStatsHtml(c, loadout, null) + this.equipTrinketsHtml(),
        mode: "description",
        animated,
      })
    );
  }

  private renderEquipItemPhase(animated: boolean): void {
    const c = this.equipChar();
    const loadout = this.equipLoadout();
    const { slot, label } = EQUIP_SLOTS[this.equipSlotIndex];
    const current = this.equippedInSlot(loadout, slot);
    const rows = this.equipItemRows();

    const items: FF6WindowItem[] = rows.map((row) => {
      if (row.kind === "remove") {
        return {
          label: "(Remove)",
          detail: current ? `unequip ${current.name}` : "—",
          disabled: !current || current.cursed,
          metadata: "remove",
        };
      }
      const entry = this.state.inventory[row.invIndex!];
      const item = ITEMS_BY_ID[entry.itemId];
      const name = displayNameFor(item, entry.identified);
      const knownCursed = entry.identified && !!item.cursed;
      return {
        label: knownCursed ? `${name} (CURSED)` : name,
        detail: entry.identified ? this.itemStatsStr(item) || "no bonuses" : "unappraised — ?",
        disabled: knownCursed,
        className: knownCursed ? "equip-cursed" : undefined,
        metadata: row.invIndex,
      };
    });

    const win = new FF6Window({
      title: `Equip ${c.name} — ${label}`,
      items,
      selectedIndex: this.equipItemIndex,
      mode: "selection",
      allowMultilineLabels: true,
      flash: this.flash || null,
      footer: "D-pad navigate · A equip · B back",
      animated,
      onHover: (i) => {
        if (i !== this.equipItemIndex) {
          this.equipItemIndex = i;
          this.flash = "";
          this.render(); // delta preview tracks the cursor
        }
      },
      onConfirm: (i) => {
        this.equipItemIndex = i;
        this.confirmEquipItemRow();
      },
      onBack: () => {
        this.equipPhase = "slot";
        this.flash = "";
        this.render();
      },
    });
    this.panel.appendChild(win.render());

    const previewHtml = this.equipItemPreviewHtml(c, loadout, slot, rows[this.equipItemIndex]);
    this.panel.appendChild(
      FF6Window.frame({ contentHtml: previewHtml, mode: "description", animated })
    );
  }

  /** Delta panel for the highlighted browse row. */
  private equipItemPreviewHtml(
    c: Character,
    loadout: Loadout,
    slot: EquipSlot,
    row: { kind: "remove" | "candidate"; invIndex?: number } | undefined
  ): string {
    if (!row) {
      return `<div class="shop-compare">No compatible gear in the inventory.</div>`;
    }
    if (row.kind === "remove") {
      const res = manualUnequip(loadout, slot);
      if (!res) return this.equipStatsHtml(c, loadout, null);
      return this.equipStatsHtml(c, loadout, res.loadout);
    }
    const entry = this.state.inventory[row.invIndex!];
    const item = ITEMS_BY_ID[entry.itemId];
    if (!entry.identified) {
      return this.equipStatsHtml(
        c,
        loadout,
        null,
        `Unappraised — its true nature is unknown. Equipping identifies it (the shop appraises for ${APPRAISE_COST}g).`
      );
    }
    const res = manualEquip(loadout, item);
    if (!res) {
      const current = this.equippedInSlot(loadout, slot);
      return (
        `<div class="shop-compare equip-warning">` +
        `${current?.name ?? "This slot"} is CURSED — locked until the Temple's Remove Curse (${REMOVE_CURSE_COST}g).` +
        `</div>`
      );
    }
    let warning: string | undefined;
    if (item.type === "weapon") {
      const range = effectiveWeaponRange(c, item.range ?? "close");
      const reachable =
        canReach(c.formationSlot, range, "front") || canReach(c.formationSlot, range, "back");
      if (!reachable) {
        warning = `⚠ ${item.name} is ${item.range ?? "close"}-range — ${c.name} could not attack anything from the ${charRow(c)} row!`;
      }
    }
    return this.equipStatsHtml(c, loadout, res.loadout, warning, warning ? "warning" : "info");
  }

  /** Stat panel: ATK/DEF plus the six core stats, with ▲/▼ deltas when a
   *  preview loadout is supplied. ATK mirrors the melee base formula
   *  (effSTR + level + weapon attackBonus); DEF is total flat armor. */
  private equipStatsHtml(
    c: Character,
    oldLoadout: Loadout,
    nextLoadout: Loadout | null,
    note?: string,
    noteKind: "info" | "warning" = "info"
  ): string {
    const perks = perksForCharacter(c);
    const summarize = (l: Loadout) => {
      const eff = effectiveStats(c, l, perks);
      return {
        eff,
        atk: eff.str + c.level + (l.weapon?.attackBonus ?? 0),
        def: l.armor.reduce((sum, a) => sum + (a.defenseBonus ?? 0), 0),
      };
    };
    const before = summarize(oldLoadout);
    const after = nextLoadout ? summarize(nextLoadout) : null;

    const delta = (statLabel: string, a: number, b: number | null): string => {
      if (b === null || b === a) {
        return `<span class="equip-stat"><span class="equip-stat-label">${statLabel}</span> ${a}</span>`;
      }
      const cls = b > a ? "equip-delta-up" : "equip-delta-down";
      const arrow = b > a ? "▲" : "▼";
      return (
        `<span class="equip-stat"><span class="equip-stat-label">${statLabel}</span> ` +
        `${a} → <span class="${cls}">${b} ${arrow}</span></span>`
      );
    };

    const statKeys: (keyof Stats)[] = ["str", "int", "pie", "vit", "agi", "luk"];
    const coreCells = statKeys
      .map((k) => delta(k.toUpperCase(), before.eff[k], after ? after.eff[k] : null))
      .join("");
    const noteHtml = note
      ? `<div class="${noteKind === "warning" ? "equip-warning" : "equip-note"}">${note}</div>`
      : "";

    return (
      `<div class="equip-compare">` +
      `<div class="equip-stat-line">${delta("ATK", before.atk, after ? after.atk : null)}` +
      `${delta("DEF", before.def, after ? after.def : null)}</div>` +
      `<div class="equip-stat-grid">${coreCells}</div>` +
      noteHtml +
      `</div>`
    );
  }

  /** Gear summary for the character-select phase's lower panel. */
  private equipLoadoutSummaryHtml(): string {
    const loadout = this.equipLoadout();
    const rows = EQUIP_SLOTS.map(({ slot, label }) => {
      const item = this.equippedInSlot(loadout, slot);
      const name = item ? `${item.name}${item.cursed ? " (CURSED)" : ""}` : "—";
      const cls = item?.cursed ? " equip-cursed" : "";
      return (
        `<div class="equip-row"><span class="equip-row-label">${label}</span>` +
        `<span class="equip-row-value${cls}">${name}</span></div>`
      );
    }).join("");
    return `<div class="equip-summary">${rows}${this.equipTrinketsHtml()}</div>`;
  }

  /** Trinkets are carried party-wide, never slotted — shown read-only. */
  private equipTrinketsHtml(): string {
    const names = this.state.inventory
      .map((e) => ITEMS_BY_ID[e.itemId])
      .filter((i): i is ItemDef => !!i && i.type === "trinket")
      .map((i) => i.name);
    if (names.length === 0) return "";
    return `<div class="equip-trinkets">Trinkets (carried by the party): ${names.join(", ")}</div>`;
  }

  private renderFacility(animated: boolean): void {
    const title = this.screen === "temple" ? "Temple" : "Inn";
    const templeCurse = this.screen === "temple" && this.equippedCursed().length > 0;

    if (templeCurse) {
      const win = new FF6Window({
        title,
        items: [
          { label: "Back to menu", metadata: "back" },
          { label: `Remove Curse (${REMOVE_CURSE_COST}g)`, metadata: "curse" },
        ],
        selectedIndex: this.templeIndex,
        mode: "menu",
        flash: this.flash || null,
        footer: "D-pad navigate · A select · B back",
        animated,
        onHover: (i) => {
          this.templeIndex = i;
        },
        onConfirm: (i) => {
          this.templeIndex = i;
          if (i === 1) {
            this.doRemoveCurse();
          } else {
            this.screen = "main";
            this.flash = "";
            this.render();
          }
        },
        onBack: () => {
          this.screen = "main";
          this.flash = "";
          this.render();
        },
      });
      this.panel.appendChild(win.render());
    }

    // Party status after inn/temple
    const lines: string[] = [];
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

    this.panel.appendChild(
      FF6Window.frame({
        title: templeCurse ? undefined : title,
        contentHtml: lines.join(""),
        flash: templeCurse ? null : this.flash || null,
        footer: templeCurse ? undefined : "A / B back to menu",
        mode: "status",
        animated,
      })
    );
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
