/**
 * Corridor-preserving presenter for authored labyrinth dialogue events.
 *
 * The controller owns only presentation and graph traversal. Floor trigger
 * persistence remains in game/features.ts, input ownership remains UiStack,
 * and any gameplay consequence of a selected choice belongs to the caller.
 */

import {
  advanceDialogue,
  nodeForSession,
  speakerForNode,
  startDialogue,
  type DialogueEventDef,
  type DialogueSession,
} from "../game/dialogue-event";
import { audio } from "./audio";
import {
  paginateText,
  renderNPCDialogue,
  revealDurationMs,
  type DialogueSecondary,
} from "./npc-dialogue-view";

export type DialogueEventCloseReason = "complete" | "skipped";

export interface DialogueEventControllerOptions {
  panel: HTMLElement;
  event: DialogueEventDef;
  onChoice?: (choiceId: string, session: DialogueSession) => void;
  onClose: (reason: DialogueEventCloseReason, session: DialogueSession) => void;
  /** Deterministic test/preview seam. Production follows prefers-reduced-motion. */
  reducedMotion?: boolean;
}

export class DialogueEventController {
  private readonly panel: HTMLElement;
  private readonly event: DialogueEventDef;
  private readonly onChoice: DialogueEventControllerOptions["onChoice"];
  private readonly onClose: DialogueEventControllerOptions["onClose"];
  private readonly reducedMotion: boolean;
  private session: DialogueSession;
  private pages: string[] = [];
  private pageIndex = 0;
  private choiceIndex = 0;
  private textRevealed = true;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private active = true;

  constructor(opts: DialogueEventControllerOptions) {
    this.panel = opts.panel;
    this.event = opts.event;
    this.onChoice = opts.onChoice;
    this.onClose = opts.onClose;
    this.reducedMotion =
      opts.reducedMotion ??
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.session = startDialogue(this.event);
    this.loadCurrentNode();
    this.panel.style.display = "flex";
    this.render();
  }

  get currentNodeId(): string {
    return this.session.nodeId;
  }

  get selectedChoiceIndex(): number {
    return this.choiceIndex;
  }

  get isActive(): boolean {
    return this.active;
  }

  handleKey(key: string): boolean {
    if (!this.active) return false;
    const lower = key.toLowerCase();
    const confirm = key === "Enter" || key === " ";
    const node = nodeForSession(this.event, this.session)!;
    const onFinalPage = this.pageIndex >= this.pages.length - 1;

    if (confirm) {
      if (!this.textRevealed) {
        this.completeReveal();
        return true;
      }
      if (!onFinalPage) {
        this.pageIndex++;
        this.startReveal();
        this.render();
        return true;
      }
      if (node.choices?.length) {
        const choice = node.choices[this.choiceIndex];
        if (choice) this.advance(choice.id);
        return true;
      }
      this.advance();
      return true;
    }

    if (
      (lower === "arrowup" || lower === "arrowdown") &&
      this.textRevealed &&
      onFinalPage &&
      node.choices?.length
    ) {
      audio.uiForMenuKey(key);
      const delta = lower === "arrowdown" ? 1 : -1;
      this.choiceIndex = (this.choiceIndex + delta + node.choices.length) % node.choices.length;
      this.render();
      return true;
    }

    if (lower === "escape") {
      audio.uiForMenuKey(key);
      if (this.event.allowSkip) this.close("skipped");
      return true;
    }

    return true;
  }

  /** Tear down without reporting completion (OverlayRuntime.closeAll/tests). */
  destroy(): void {
    if (!this.active) return;
    this.active = false;
    this.clearRevealTimer();
    this.panel.innerHTML = "";
    this.panel.style.display = "none";
    this.panel.classList.remove("npc-dialogue-active");
  }

  private advance(choiceId?: string): void {
    const result = advanceDialogue(this.event, this.session, choiceId);
    this.session = result.session;
    if (result.selectedChoiceId) this.onChoice?.(result.selectedChoiceId, this.session);
    if (result.completed) {
      this.close("complete");
      return;
    }
    this.loadCurrentNode();
    this.render();
  }

  private close(reason: DialogueEventCloseReason): void {
    if (!this.active) return;
    const finalSession = this.session;
    this.destroy();
    this.onClose(reason, finalSession);
  }

  private loadCurrentNode(): void {
    const node = nodeForSession(this.event, this.session)!;
    this.pages = paginateText(node.text);
    this.pageIndex = 0;
    this.choiceIndex = 0;
    this.startReveal();
  }

  private startReveal(): void {
    this.clearRevealTimer();
    if (this.reducedMotion) {
      this.textRevealed = true;
      return;
    }
    this.textRevealed = false;
    const duration = revealDurationMs(this.pages[this.pageIndex] ?? "");
    this.revealTimer = setTimeout(() => {
      this.textRevealed = true;
      this.revealTimer = null;
      this.render();
    }, duration);
  }

  private completeReveal(): void {
    this.clearRevealTimer();
    this.textRevealed = true;
    this.render();
  }

  private clearRevealTimer(): void {
    if (this.revealTimer !== null) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
  }

  private render(): void {
    const node = nodeForSession(this.event, this.session)!;
    const speaker = speakerForNode(this.event, node)!;
    const onFinalPage = this.pageIndex >= this.pages.length - 1;
    let secondary: DialogueSecondary = null;
    if (this.textRevealed && onFinalPage && node.choices?.length) {
      secondary = {
        kind: "topics",
        items: node.choices.map((choice) => ({ label: choice.label })),
        selectedIndex: this.choiceIndex,
      };
    }

    this.panel.innerHTML = "";
    this.panel.classList.add("npc-dialogue-active");
    const { root } = renderNPCDialogue({
      npcName: speaker.name,
      npcTitle: speaker.title,
      mood: node.mood ?? speaker.mood,
      portraitId: speaker.portraitId,
      portraitFallbackLabel: speaker.placeholderGlyph,
      portraitSide: speaker.portraitSide,
      dialogueAccent: node.accent ?? speaker.accent,
      text: this.pages[this.pageIndex] ?? "",
      hasMorePages: !onFinalPage,
      messageKind: node.tone ?? "speech",
      acknowledged: true,
      textRevealed: this.textRevealed,
      reducedMotion: this.reducedMotion,
      secondary,
      footer: node.choices?.length
        ? "\u2191/\u2193 choose \u00b7 Enter confirm"
        : "Enter continue",
    });
    root.classList.add("dialogue-event-dlg");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-live", "polite");
    root.dataset.dialogueEventId = this.event.id;
    root.dataset.dialogueNodeId = node.id;
    this.panel.appendChild(root);

    if (!this.reducedMotion && !this.textRevealed) {
      const mask = root.querySelector<HTMLElement>(".npc-dlg-reveal-mask");
      if (mask) {
        requestAnimationFrame(() => {
          mask.style.width = "0%";
        });
      }
    }
  }
}
