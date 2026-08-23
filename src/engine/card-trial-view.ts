/**
 * Card Trial hand / intent rail DOM. Cards are the selection UI; they
 * empty during playback so existing sprite choreography can play.
 */

import type { CardTrialPlayerView, HandCardView } from "../game/card-trial/types";

export interface CardTrialViewHandlers {
  onHoverCard: (index: number) => void;
  onConfirmCard: (index: number) => void;
  onMove: () => void;
  onPass: () => void;
  onHoverTarget: (index: number) => void;
  onConfirmTarget: (index: number) => void;
  onCancel: () => void;
}

export type CardTrialUiPhase = "hand" | "target" | "target2" | "playback" | "result";

export interface CardTrialWindowsInput {
  view: CardTrialPlayerView;
  phase: CardTrialUiPhase;
  cursor: number;
  targetIds: string[];
  targetCursor: number;
  flash: string | null;
  result: { title: string; lines: string[] } | null;
  /** Hold-to-inspect intents. Presentation only. */
  detailsHeld?: boolean;
  /** Sparse battlefield UI: skip the legacy FF6 hand/intents/party panes. */
  hideLegacyPanes?: boolean;
  /** Compact action cue while the resolved event choreography is running. */
  playbackLabel?: string | null;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardHtml(card: HandCardView, selected: boolean): string {
  const cls = [
    "ct-card",
    selected ? "selected" : "",
    card.disabled ? "disabled" : "",
    card.opens ? "ct-opens" : "",
    card.consume !== "none" ? "ct-has-consume" : "",
    card.consumeDimmed ? "ct-consume-dim" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const openMark = card.opens ? `<span class="ct-opened-mark" title="Opens">◉</span>` : "";
  const consumeCls = [
    "ct-consume",
    card.consumeArmed ? "armed" : "",
    card.consumeDimmed ? "dim" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const consume = card.consume === "none"
    ? ""
    : `<div class="${consumeCls}"><span class="ct-opened-mark" title="Consume">◉</span> Consume</div>`;
  const why = card.disabled && card.disabledReason
    ? `<div class="ct-why">${esc(card.disabledReason)}</div>`
    : "";
  return `<button type="button" class="${cls}" data-uid="${esc(card.uid)}" ${card.disabled ? "disabled" : ""}>
    <div class="ct-card-cost">${card.cost}</div>
    <div class="ct-card-name">${openMark}${esc(card.name)}</div>
    <div class="ct-card-text">${esc(card.text)}</div>
    ${consume}${why}
  </button>`;
}

function intentHtml(view: CardTrialPlayerView): string {
  return view.intents
    .map((intent) => {
      const cons = intent.consequences
        .filter((c) => !c.miss)
        .map((c) => {
          const lethal = c.lethal ? ` <span class="ct-lethal">☠ ${c.heroName}</span>` : "";
          return `<div class="ct-intent-hp">${esc(c.heroName)} loses <strong>${c.postGuard}</strong> HP${lethal}</div>`;
        })
        .join("");
      const miss = intent.wouldMiss ? `<div class="ct-intent-miss">miss (empty)</div>` : "";
      const opened = view.openedEnemyId === intent.enemyId
        ? `<span class="ct-opened-mark" title="Opened">◉</span> `
        : "";
      return `<div class="ct-intent${intent.wouldMiss ? " miss" : ""}">
        <div class="ct-intent-raw">${opened}${esc(intent.label)}</div>
        ${cons}${miss}
      </div>`;
    })
    .join("");
}

export function renderCardTrialWindows(
  host: HTMLElement,
  input: CardTrialWindowsInput,
  handlers: CardTrialViewHandlers
): void {
  if (input.hideLegacyPanes) {
    host.innerHTML = "";
    return;
  }
  const { view, phase, cursor, flash, result } = input;
  if (result) {
    host.innerHTML = `<div class="ff6-windows ct-windows">
      <div class="ff6-window ct-result">
        <div class="ff6-menu-title">${esc(result.title)}</div>
        ${result.lines.map((l) => `<div class="ct-result-line">${esc(l)}</div>`).join("")}
        <div class="ff6-hint-row">A / Enter continue</div>
      </div>
    </div>`;
    return;
  }

  if (phase === "playback") {
    host.innerHTML = `<div class="ff6-windows ct-windows ct-playback">
      <div class="ff6-window"><div class="ff6-hint-row">Shift fast · Esc skip</div></div>
    </div>`;
    return;
  }

  const acting = view.heroes.find((h) => h.id === view.actingHero);
  const handPane =
    phase === "hand"
      ? `<div class="ff6-window ct-hand">
          <div class="ff6-menu-title">${esc(acting?.name ?? "—")} · ${view.energy} energy</div>
          <div class="ct-hand-row">
            ${view.hand.map((c, i) => cardHtml(c, i === cursor)).join("")}
          </div>
          <div class="ct-utils">
            <button type="button" class="ct-util ${cursor === view.hand.length ? "selected" : ""}" data-act="move" ${view.moveAvailable ? "" : "disabled"}>
              Move 1${view.moveDisabledReason ? ` · ${esc(view.moveDisabledReason)}` : ""}
            </button>
            <button type="button" class="ct-util ${cursor === view.hand.length + 1 ? "selected" : ""}" data-act="pass">Pass</button>
          </div>
          ${flash ? `<div class="ct-flash">${esc(flash)}</div>` : ""}
          <div class="ff6-hint-row">D-pad · A play · B pass · piles ${view.drawCount}/${view.discardCount}</div>
        </div>`
      : `<div class="ff6-window ct-hand">
          <div class="ff6-menu-title">${phase === "target2" ? "Second enemy" : "Target"}</div>
          ${input.targetIds
            .map((id) => view.enemies.find((e) => e.id === id))
            .filter((e): e is NonNullable<typeof e> => !!e && !e.dead)
            .map((e, i) => {
              const opened = e.opened ? `<span class="ct-opened-mark" title="Opened">◉</span>` : "";
              return `<button type="button" class="ct-target ${i === input.targetCursor ? "selected" : ""}" data-eid="${esc(e.id)}">${opened}${esc(e.name)} · ${e.hp}/${e.maxHp}</button>`;
            })
            .join("")}
          <div class="ff6-hint-row">A confirm · B cancel</div>
        </div>`;

  const enemyPane = `<div class="ff6-window ct-intents">
    <div class="ff6-menu-title">Intents</div>
    ${intentHtml(view)}
    ${view.openedEnemyId ? `<div class="ct-opened-line"><span class="ct-opened-mark">◉</span> Opened: ${esc(view.enemies.find((e) => e.id === view.openedEnemyId)?.name ?? view.openedEnemyId)}</div>` : `<div class="ct-opened-line dim">No Opened</div>`}
  </div>`;

  const rat = view.ratRow
    ? `<div class="ct-rat">RAT — ${view.ratRow === "front" ? "Front" : "Back"} · assists Rat King attacks</div>`
    : `<div class="ct-rat dim">No Rat</div>`;
  const partyPane = `<div class="ff6-window ct-party">
    <div class="ff6-menu-title">Fight ${view.fightId} · ${esc(view.fightName)}</div>
    ${view.heroes
      .map((h) => {
        const actingMark = h.id === view.actingHero ? " acting" : "";
        return `<div class="ct-hero${actingMark}${h.dead ? " dead" : ""}">
          <div class="ct-hero-name">${esc(h.name)}</div>
          <div class="ct-hero-hp">${h.hp}/${h.maxHp}${h.guard ? ` · G${h.guard}` : ""}</div>
        </div>`;
      })
      .join("")}
    ${rat}
  </div>`;

  host.innerHTML = `<div class="ff6-windows ct-windows">${handPane}${enemyPane}${partyPane}</div>`;

  host.querySelectorAll<HTMLButtonElement>(".ct-card").forEach((btn, i) => {
    btn.addEventListener("pointerenter", () => handlers.onHoverCard(i));
    btn.addEventListener("click", () => handlers.onConfirmCard(i));
  });
  const moveBtn = host.querySelector<HTMLButtonElement>("[data-act=move]");
  moveBtn?.addEventListener("click", () => handlers.onMove());
  const passBtn = host.querySelector<HTMLButtonElement>("[data-act=pass]");
  passBtn?.addEventListener("click", () => handlers.onPass());
  host.querySelectorAll<HTMLButtonElement>(".ct-target").forEach((btn, i) => {
    btn.addEventListener("pointerenter", () => handlers.onHoverTarget(i));
    btn.addEventListener("click", () => handlers.onConfirmTarget(i));
  });
}
