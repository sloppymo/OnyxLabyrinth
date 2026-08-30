/** Rat King's campaign starter-build selection screen. */

import { CARD_DEFS } from "../game/card-trial/cards";
import { cardArtUrl } from "../game/card-trial/card-art";
import type { CardId } from "../game/card-trial/types";
import {
  RAT_KING_BUILDS,
  type RatKingBuildDef,
  type RatKingBuildId,
} from "../game/rat-king-builds";
import { FF6Window } from "./ff6-window-library";
import { audio } from "./audio";
import "./old-man-build-select.css";

export interface RatKingBuildSelectOptions {
  panel: HTMLElement;
  onChosen: (buildId: RatKingBuildId) => void;
  onCancel: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function summarizeCards(cardIds: readonly CardId[]): Array<{ id: CardId; count: number }> {
  const counts = new Map<CardId, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].map(([id, count]) => ({ id, count }));
}

function renderBuildDetail(build: RatKingBuildDef): string {
  const rows = summarizeCards(build.cards)
    .map(({ id, count }) => {
      const def = CARD_DEFS[id];
      const art = cardArtUrl(id);
      const thumb = art
        ? `<img class="omb-thumb" src="${art}" alt="" width="32" height="24">`
        : `<span class="omb-thumb omb-thumb-blank" aria-hidden="true"></span>`;
      const countBadge = count > 1 ? `<span class="omb-count">&times;${count}</span>` : "";
      return `<div class="omb-card-row">
        ${thumb}
        <div class="omb-card-body">
          <div class="omb-card-name">${escapeHtml(def.name)}<span class="omb-cost">${def.cost}⚡</span>${countBadge}</div>
          <div class="omb-card-text">${escapeHtml(def.text)}</div>
        </div>
      </div>`;
    })
    .join("");
  return `
    <div class="omb-name">${escapeHtml(build.name)}</div>
    <div class="omb-tagline">${escapeHtml(build.tagline)}</div>
    <div class="omb-mechanics">${escapeHtml(build.mechanics)}</div>
    <div class="omb-card-list">${rows}</div>
  `;
}

export class RatKingBuildSelectController {
  private panel: HTMLElement;
  private onChosen: (buildId: RatKingBuildId) => void;
  private onCancel: () => void;
  private selectedIndex = 0;
  private hasRendered = false;

  constructor(opts: RatKingBuildSelectOptions) {
    this.panel = opts.panel;
    this.onChosen = opts.onChosen;
    this.onCancel = opts.onCancel;
    this.panel.style.display = "flex";
    this.panel.classList.add("bg-title");
    this.render();
  }

  destroy(): void {
    this.panel.classList.remove("bg-title");
  }

  handleKey(key: string): void {
    const lower = key.toLowerCase();
    const count = RAT_KING_BUILDS.length;
    if (lower === "arrowup" || lower === "w") {
      this.selectedIndex = (this.selectedIndex - 1 + count) % count;
      audio.uiCursor();
      this.render();
    } else if (lower === "arrowdown" || lower === "s") {
      this.selectedIndex = (this.selectedIndex + 1) % count;
      audio.uiCursor();
      this.render();
    } else if (key === "Enter" || key === " ") {
      audio.uiConfirm();
      this.confirm();
    } else if (lower === "escape") {
      this.onCancel();
    }
  }

  private confirm(): void {
    const build = RAT_KING_BUILDS[this.selectedIndex];
    if (build) this.onChosen(build.id);
  }

  private render(): void {
    const animated = !this.hasRendered;
    this.hasRendered = true;
    const focused = RAT_KING_BUILDS[this.selectedIndex]!;
    const win = new FF6Window({
      title: "Choose Rat King's Path",
      contentHtml: renderBuildDetail(focused),
      items: RAT_KING_BUILDS.map((build) => ({ label: build.name, metadata: build.id })),
      selectedIndex: this.selectedIndex,
      mode: "selection",
      width: "full",
      maxHeight: 560,
      footer: "↑↓ choose a path · Enter confirm · Esc back",
      animated,
      onHover: (i) => {
        this.selectedIndex = i;
        this.render();
      },
      onConfirm: () => this.confirm(),
      onBack: () => this.onCancel(),
    });
    this.panel.innerHTML = "";
    this.panel.append(win.render());
  }
}
