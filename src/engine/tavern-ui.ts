/**
 * Hot Boi's tavern — the dedicated Floor 1 hub controller.
 *
 * Deliberately NOT built on the generic dungeon NPCController
 * (engine/npc-ui.ts): that panel exposes Barter/Give/Steal/Attack for
 * ordinary dungeon NPCs, and stuffing Rest/Rumors/Scorchboard/Companions
 * into it via more capability flags would make it responsible for two
 * unrelated interaction models. This is a narrow controller composed from
 * the same FF6Window primitive everything else in the game uses (see
 * camp-ui.ts / npc-ui.ts for the sibling pattern this follows: keyboard
 * input is handled manually per phase and re-renders; FF6Window's own
 * onHover/onConfirm/onBack only serve mouse/touch on top of that).
 *
 * Overlay input lives on `UiStack` in main.ts (id `"tavern"`). GameState.mode
 * stays dungeon — see the UiStack pitfall in AGENTS.md. Attack and Steal are
 * structurally absent: they are not in ROOT_ITEMS at all, not filtered out
 * at runtime.
 */

import type { GameState } from "../types";
import { FF6Window, type FF6WindowItem } from "./ff6-window-library";
import { audio } from "./audio";

/** Portrait art for Hot Boi, shown at the top of the tavern panel. */
const HOT_BOI_PORTRAIT_URL = `${import.meta.env.BASE_URL ?? "/"}assets/portraits/hot-boi.png`;
import {
  hotBoiGreeting,
  TALK_TOPICS,
  REST_PRICE,
  REST_CONFIRM_TEXT,
  REST_INSUFFICIENT_TEXT,
  REST_SUCCESS_TEXT,
  AMBIENT_DESCRIPTIONS,
} from "../data/hot-boi";
import {
  onTavernOpen,
  restParty,
  nextRumor,
  scorchboardEntries,
  refreshScorchboardReadiness,
  acceptScorchboardQuest,
  turnInScorchboardQuest,
} from "../game/tavern";
import { questStage, questStatus, type QuestStatus } from "../game/quests";
import { FIFTH_CHAIR, dismissCompanion, inviteCompanion } from "../game/companion";
import { ITEMS_BY_ID } from "../data/items";
import { FLOOR1_QUESTS_BY_ID } from "../data/quests-floor1";

type Phase = "root" | "talk" | "rest" | "rumors" | "scorchboard" | "questDetail" | "companions";

export interface TavernControllerOptions {
  panel: HTMLElement;
  state: GameState;
  /** Close the panel and return to the dungeon. */
  onClose: () => void;
  /** Called right after a gold/inventory/companion-changing transaction
   *  completes, so main.ts can autosave atomically (never mid-transaction). */
  onSave: () => void;
}

const ROOT_ITEMS = [
  { key: "talk", label: "Talk" },
  { key: "rest", label: "Rest" },
  { key: "rumors", label: "Rumors" },
  { key: "scorchboard", label: "Scorchboard" },
  { key: "companions", label: "Companions" },
  { key: "leave", label: "Leave" },
] as const;

function statusLabel(status: QuestStatus): string {
  switch (status) {
    case "available": return "available";
    case "active": return "in progress";
    case "ready": return "ready to turn in";
    case "completed": return "completed";
    case "failed": return "failed";
  }
}

export class TavernController {
  private panel: HTMLElement;
  private state: GameState;
  private onClose: () => void;
  private onSave: () => void;

  private phase: Phase = "root";
  private index = 0;
  private dialogue: string;
  /** Hot Boi's opening line — stable for this visit, restored whenever the
   *  player returns to root or Talk so a leftover Rest/Rumor/quest line
   *  from a different screen never bleeds into the next one. */
  private greeting: string;
  private ambient: string;
  private questDetailId: string | null = null;
  private lastPhaseKey = "";

  constructor(opts: TavernControllerOptions) {
    this.panel = opts.panel;
    this.state = opts.state;
    this.onClose = opts.onClose;
    this.onSave = opts.onSave;

    const firstVisit = onTavernOpen(this.state);
    this.greeting = hotBoiGreeting(this.state, firstVisit);
    this.dialogue = this.greeting;
    this.ambient = AMBIENT_DESCRIPTIONS[this.state.tavernRumorCursor % AMBIENT_DESCRIPTIONS.length];
    this.panel.style.display = "flex";
    this.render();
  }

  handleKey(key: string): boolean {
    audio.uiForMenuKey(key);
    const lower = key.toLowerCase();

    if (lower === "escape") {
      this.back();
      return true;
    }
    const len = this.listLength();
    if (lower === "arrowup") {
      if (len > 0) this.index = (this.index - 1 + len) % len;
      this.render();
      return true;
    }
    if (lower === "arrowdown") {
      if (len > 0) this.index = (this.index + 1) % len;
      this.render();
      return true;
    }
    if (key === "Enter" || key === " ") {
      this.confirm();
      return true;
    }
    return true; // swallow everything else while the panel is open
  }

  private listLength(): number {
    switch (this.phase) {
      case "root": return ROOT_ITEMS.length;
      case "talk": return TALK_TOPICS.filter((t) => t.available(this.state)).length;
      case "rest": return this.restItems().length;
      case "rumors": return 2; // Ask again / Back
      case "scorchboard": return scorchboardEntries(this.state).length;
      case "questDetail": return this.questDetailItems().length;
      case "companions": return this.companionItems().length;
    }
  }

  private back(): void {
    if (this.phase === "root") {
      this.close();
      return;
    }
    if (this.phase === "questDetail") {
      this.toScorchboard();
      return;
    }
    this.toRoot();
  }

  private close(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
    this.onClose();
  }

  /** The only way to land on "root" — always restores Hot Boi's stable
   *  greeting line, so a leftover Rest confirm / rumor / quest line from
   *  whatever screen the player was just on never bleeds into the next
   *  one (a real bug caught in manual playtesting: opening Scorchboard
   *  right after Rest showed "Rest for 20 gold?" over the quest board). */
  private toRoot(): void {
    this.phase = "root";
    this.index = 0;
    this.dialogue = this.greeting;
    this.render();
  }

  private toScorchboard(): void {
    this.phase = "scorchboard";
    this.index = 0;
    refreshScorchboardReadiness(this.state);
    this.dialogue = "\"Board's on the wall. Take what you can carry.\"";
    this.render();
  }

  // --- Confirm dispatch ------------------------------------------------

  private confirm(): void {
    switch (this.phase) {
      case "root": return this.confirmRoot();
      case "talk": return this.confirmTalk();
      case "rest": return this.confirmRest();
      case "rumors": return this.confirmRumors();
      case "scorchboard": return this.confirmScorchboard();
      case "questDetail": return this.confirmQuestDetail();
      case "companions": return this.confirmCompanions();
    }
  }

  private confirmRoot(): void {
    const item = ROOT_ITEMS[this.index];
    if (!item) return;
    switch (item.key) {
      case "talk":
        this.phase = "talk";
        this.index = 0;
        this.dialogue = this.greeting;
        this.render();
        return;
      case "rest":
        this.phase = "rest";
        this.index = 0;
        this.dialogue =
          this.state.partyGold >= REST_PRICE ? REST_CONFIRM_TEXT : REST_INSUFFICIENT_TEXT;
        this.render();
        return;
      case "rumors":
        this.phase = "rumors";
        this.index = 0;
        this.showNextRumor();
        return;
      case "scorchboard":
        this.toScorchboard();
        return;
      case "companions":
        this.phase = "companions";
        this.index = 0;
        this.dialogue = this.companionsDialogue();
        this.render();
        return;
      case "leave":
        this.close();
        return;
    }
  }

  private confirmTalk(): void {
    const topics = TALK_TOPICS.filter((t) => t.available(this.state));
    const topic = topics[this.index];
    if (!topic) return;
    this.dialogue = topic.text(this.state);
    this.render();
  }

  private restItems(): FF6WindowItem[] {
    if (this.state.partyGold < REST_PRICE) return [{ label: "Back" }];
    return [{ label: "Rest" }, { label: "Never mind" }];
  }

  /** Guarded by the phase transition itself: once "Rest" is confirmed the
   *  controller leaves phase "rest" for "root" in the same call, so a held
   *  Enter key (or a second confirm before the next render) cannot charge
   *  twice — there is no window where phase stays "rest" after a
   *  successful charge. */
  private confirmRest(): void {
    const items = this.restItems();
    const choice = items[this.index]?.label;
    if (!choice) return;
    if (choice === "Back") {
      this.toRoot();
      return;
    }
    if (choice === "Never mind") {
      this.dialogue = "\"Suit yourself.\"";
      this.phase = "root";
      this.index = 0;
      this.render();
      return;
    }
    // choice === "Rest"
    const result = restParty(this.state);
    this.dialogue = result.ok ? REST_SUCCESS_TEXT : REST_INSUFFICIENT_TEXT;
    this.phase = "root";
    this.index = 0;
    this.render();
    if (result.ok) this.onSave();
  }

  private showNextRumor(): void {
    const rumor = nextRumor(this.state);
    this.dialogue = rumor ? rumor.text : "\"Nothing new making the rounds tonight.\"";
    this.render();
  }

  private confirmRumors(): void {
    if (this.index === 0) {
      this.showNextRumor();
      return;
    }
    this.toRoot();
  }

  private confirmScorchboard(): void {
    const entries = scorchboardEntries(this.state);
    const entry = entries[this.index];
    if (!entry) {
      this.toRoot();
      return;
    }
    this.questDetailId = entry.def.id;
    this.phase = "questDetail";
    this.index = 0;
    this.dialogue = this.questDetailText(entry.def.id);
    this.render();
  }

  /** Board/stage/ready/complete/fail text for the currently open quest,
   *  matching its live status. */
  private questDetailText(id: string): string {
    const def = FLOOR1_QUESTS_BY_ID[id];
    if (!def) return "";
    const status = questStatus(this.state, id);
    switch (status) {
      case "available": return def.boardText;
      case "active": return def.stages[questStage(this.state, id)]?.text ?? def.stages[0].text;
      case "ready": return def.readyText;
      case "completed": return def.completeText;
      case "failed": return def.failPolicy;
    }
  }

  private questDetailItems(): FF6WindowItem[] {
    if (!this.questDetailId) return [{ label: "Back" }];
    const status = questStatus(this.state, this.questDetailId);
    if (status === "available") return [{ label: "Accept" }, { label: "Back" }];
    if (status === "ready") return [{ label: "Turn in" }, { label: "Back" }];
    return [{ label: "Back" }];
  }

  private confirmQuestDetail(): void {
    const id = this.questDetailId;
    if (!id) {
      this.back();
      return;
    }
    const items = this.questDetailItems();
    const choice = items[this.index]?.label;
    if (choice === "Accept") {
      acceptScorchboardQuest(this.state, id);
      this.dialogue = this.questDetailText(id);
      this.index = 0;
      this.render();
      return;
    }
    if (choice === "Turn in") {
      const def = FLOOR1_QUESTS_BY_ID[id];
      const result = turnInScorchboardQuest(this.state, id);
      if (result.ok && def) {
        const parts: string[] = [];
        if (result.goldGained > 0) parts.push(`+${result.goldGained}g`);
        if (result.itemGained) parts.push(`+${ITEMS_BY_ID[result.itemGained]?.name ?? result.itemGained}`);
        if (result.companionGained) parts.push(`${FIFTH_CHAIR.name} joins the party`);
        this.dialogue =
          def.completeText + (parts.length > 0 ? `<div class="npc-empty-line">${parts.join(", ")}</div>` : "");
        this.onSave();
      }
      this.index = 0;
      this.render();
      return;
    }
    // Back
    this.phase = "scorchboard";
    this.index = 0;
    this.render();
  }

  private companionsDialogue(): string {
    const recruited = questStatus(this.state, "fifth-chair") === "completed";
    if (!recruited) {
      return "\"The fifth chair's still empty.\" Hot Boi tips his head toward it. \"Might be worth asking who normally sits there.\"";
    }
    const c = this.state.companion;
    const hpLine = c ? ` (${c.hp}/${FIFTH_CHAIR.maxHp} HP)` : "";
    return c?.withParty
      ? `${FIFTH_CHAIR.name} is traveling with you${hpLine}.`
      : `${FIFTH_CHAIR.name} is resting here${hpLine}.`;
  }

  private companionItems(): FF6WindowItem[] {
    const recruited = questStatus(this.state, "fifth-chair") === "completed";
    if (!recruited) return [{ label: "Back" }];
    const c = this.state.companion;
    if (c?.withParty) return [{ label: `Send ${FIFTH_CHAIR.name} back to rest` }, { label: "Back" }];
    return [{ label: `Invite ${FIFTH_CHAIR.name} along` }, { label: "Back" }];
  }

  private confirmCompanions(): void {
    const recruited = questStatus(this.state, "fifth-chair") === "completed";
    const items = this.companionItems();
    const choice = items[this.index]?.label;
    if (!recruited || choice === "Back") {
      this.toRoot();
      return;
    }
    if (choice?.startsWith("Send")) {
      dismissCompanion(this.state);
      this.onSave();
    } else if (choice?.startsWith("Invite")) {
      inviteCompanion(this.state);
      this.onSave();
    }
    this.dialogue = this.companionsDialogue();
    this.index = 0;
    this.render();
  }

  // --- Rendering ---------------------------------------------------------

  private render(): void {
    const animated = this.lastPhaseKey !== this.phase;
    this.lastPhaseKey = this.phase;
    this.panel.innerHTML = "";

    let items: FF6WindowItem[] = [];
    let footer = "[↑/↓] select · [Enter] confirm · [Esc] back";
    let title = "Hot Boi's";

    switch (this.phase) {
      case "root":
        items = ROOT_ITEMS.map((it) => ({ label: it.label }));
        footer = "[↑/↓] select · [Enter] confirm · [Esc] leave";
        break;
      case "talk":
        title = "Hot Boi's — Talk";
        items = TALK_TOPICS.filter((t) => t.available(this.state)).map((t) => ({ label: t.label }));
        footer = "[↑/↓] topic · [Enter] ask · [Esc] back";
        break;
      case "rest":
        title = "Hot Boi's — Rest";
        items = this.restItems();
        break;
      case "rumors":
        title = "Hot Boi's — Rumors";
        items = [{ label: "Ask about something else" }, { label: "Back to the bar" }];
        break;
      case "scorchboard": {
        title = "The Scorchboard";
        const entries = scorchboardEntries(this.state);
        items =
          entries.length > 0
            ? entries.map((e) => ({ label: e.def.title, detail: statusLabel(e.status) }))
            : [];
        footer = "[↑/↓] select · [Enter] read · [Esc] back";
        break;
      }
      case "questDetail":
        title = "The Scorchboard";
        items = this.questDetailItems();
        break;
      case "companions":
        title = "Hot Boi's — Companions";
        items = this.companionItems();
        break;
    }

    const isRoot = this.phase === "root";
    const subtitle = isRoot ? `<div class="tavern-subtitle">Tavern &amp; Adventurers' Hall</div>` : "";
    const portraitHtml = `<div class="tavern-portrait"><img src="${HOT_BOI_PORTRAIT_URL}" alt="Hot Boi" /></div>`;
    const dialogueHtml = `<div class="npc-dialogue">${this.dialogue}</div>`;
    const ambientHtml =
      isRoot ? `<div class="tavern-ambient">${this.ambient}</div>` : "";
    const emptyBoardHtml =
      this.phase === "scorchboard" && items.length === 0
        ? `<div class="npc-empty-line">Nothing posted right now.</div>`
        : "";

    const headerHtml = `<div class="tavern-header">${portraitHtml}<div class="tavern-dialogue-block">${subtitle}${dialogueHtml}${ambientHtml}</div></div>`;

    const win = new FF6Window({
      title,
      contentHtml: headerHtml + emptyBoardHtml,
      items,
      selectedIndex: this.index,
      mode: "menu",
      footer,
      animated,
      onHover: (i) => {
        this.index = i;
      },
      onConfirm: (i) => {
        this.index = i;
        this.confirm();
      },
      onBack: () => {
        this.back();
      },
    });
    this.panel.appendChild(win.render());
  }

  /** Tear down without closing (used by tests / hard mode transitions). */
  destroy(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }
}
