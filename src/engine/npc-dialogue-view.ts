/**
 * Pure DOM construction for the cinematic NPC dialogue panel: portrait,
 * name/title/mood, spoken line (with a reveal-mask "typewriter" and a
 * pagination indicator), and a secondary slot for the root action bar,
 * the topic list, or the typed "Ask about…" strip.
 *
 * Deliberately dumb about game logic — npc-ui.ts (the controller) owns all
 * phase transitions, disposition, and combat hand-off. This module only
 * turns a view model into DOM, plus a couple of pure text helpers
 * (pagination, reveal timing) the controller schedules/reads.
 *
 * Barter/Give's item lists are NOT built here — they need real list
 * navigation (FF6Window already provides it), so npc-ui.ts mounts an
 * FF6Window into the `.npc-dlg-secondary` slot this module exposes for
 * those two phases, keeping the portrait/header/text elements untouched.
 */

import type { NPCMessageKind } from "../game/npc";
import { resolvePortraitUrl } from "./npc-portraits";

export interface DialogueActionItem {
  key: string;
  label: string;
  disabled?: boolean;
}

/** What appears in the secondary slot below the spoken line. `null` means
 *  nothing — used for the initial greeting, before it's acknowledged. */
export type DialogueSecondary =
  | { kind: "actions"; items: DialogueActionItem[]; selectedIndex: number }
  | { kind: "topics"; items: { label: string }[]; selectedIndex: number }
  | { kind: "ask"; typed: string }
  | { kind: "mount" } // barter/give: controller mounts an FF6Window here
  | null;

export interface DialogueViewModel {
  npcName: string;
  npcTitle: string;
  mood: string;
  portraitId?: string;
  /** Optional compact identity used by story speakers whose names share an
   * article ("The Rat King" / "The Old Man") while portrait art is pending. */
  portraitFallbackLabel?: string;
  portraitSide?: "left" | "right";
  dialogueAccent?: "neutral" | "warm" | "cold" | "hostile";
  /** Current page's text (already paginated by the caller). */
  text: string;
  hasMorePages: boolean;
  messageKind: NPCMessageKind;
  /** Whether the secondary slot may render at all (root actions stay
   *  hidden until the greeting is acknowledged; topics/ask/mount ignore
   *  this — they're only ever shown once the player has already dug in). */
  acknowledged: boolean;
  /** True once the reveal mask should already sit at 0 (skip animation —
   *  e.g. re-renders while the same page is still displayed, or when the
   *  page's reveal has already completed). */
  textRevealed: boolean;
  reducedMotion: boolean;
  secondary: DialogueSecondary;
  footer?: string;
  emptyLine?: string;
}

export interface DialogueRenderResult {
  root: HTMLElement;
  /** Mount point for phases that need a full FF6Window list (barter/give). */
  mountSlot: HTMLElement | null;
}

const MAX_CHARS_PER_PAGE = 220;
const MS_PER_CHAR = 22;
const MAX_REVEAL_MS = 900;
const MIN_REVEAL_MS = 120;

/**
 * Split dialogue text into readable pages instead of letting it overflow
 * or clip. Breaks on sentence boundaries where possible so a page never
 * ends mid-thought if a nearby period is available.
 */
export function paginateText(text: string, maxChars = MAX_CHARS_PER_PAGE): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [trimmed];

  const pages: string[] = [];
  let rest = trimmed;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    // Prefer breaking after the last sentence-ending punctuation in the
    // window; fall back to the last space so words never split.
    const sentenceBreak = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? ")
    );
    let cut = sentenceBreak > maxChars * 0.4 ? sentenceBreak + 1 : window.lastIndexOf(" ");
    if (cut <= 0) cut = maxChars;
    pages.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) pages.push(rest);
  return pages.length > 0 ? pages : [trimmed];
}

/** How long the reveal-mask animation should run for a page of this length. */
export function revealDurationMs(text: string): number {
  return Math.min(MAX_REVEAL_MS, Math.max(MIN_REVEAL_MS, text.length * MS_PER_CHAR));
}

function moodMetaLine(title: string, mood: string): string {
  return `${title.toUpperCase()} · ${mood.toUpperCase()}`;
}

function messageKindClass(kind: NPCMessageKind): string {
  return `npc-dlg-text-${kind}`;
}

/** Wrap spoken lines in curly quotes; every other kind renders plain. */
function formatLineText(text: string, kind: NPCMessageKind): string {
  if (kind === "speech") return `\u201C${text}\u201D`;
  return text;
}

export function renderNPCDialogue(vm: DialogueViewModel): DialogueRenderResult {
  const root = document.createElement("div");
  const portraitUrl = resolvePortraitUrl(vm.portraitId);
  root.className = [
    "npc-dlg",
    `npc-dlg-side-${vm.portraitSide ?? "left"}`,
    `npc-dlg-accent-${vm.dialogueAccent ?? "neutral"}`,
    portraitUrl ? "npc-dlg-has-portrait" : "npc-dlg-card-only",
    vm.messageKind === "hostile" ? "npc-dlg-hostile-flash" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const portrait = document.createElement("div");
  portrait.className = "npc-dlg-portrait";
  if (portraitUrl) {
    if (vm.portraitId === "isobel") portrait.classList.add("npc-dlg-portrait-sprite-card");
    const img = document.createElement("img");
    img.src = portraitUrl;
    img.alt = vm.npcName;
    img.draggable = false;
    portrait.appendChild(img);
  } else {
    portrait.classList.add("npc-dlg-portrait-silhouette");
    const initial = document.createElement("span");
    initial.className = "npc-dlg-portrait-initial";
    initial.textContent = vm.portraitFallbackLabel ?? vm.npcName.charAt(0).toUpperCase();
    portrait.appendChild(initial);
  }

  const body = document.createElement("div");
  body.className = "npc-dlg-body";

  const header = document.createElement("div");
  header.className = "npc-dlg-header";
  const nameEl = document.createElement("div");
  nameEl.className = "npc-dlg-name";
  nameEl.textContent = vm.npcName;
  const metaEl = document.createElement("div");
  metaEl.className = "npc-dlg-meta";
  metaEl.textContent = moodMetaLine(vm.npcTitle, vm.mood);
  header.append(nameEl, metaEl);

  const textWrap = document.createElement("div");
  textWrap.className = "npc-dlg-text-wrap";
  const textEl = document.createElement("div");
  textEl.className = `npc-dlg-text ${messageKindClass(vm.messageKind)}`;
  textEl.textContent = formatLineText(vm.text, vm.messageKind);
  const mask = document.createElement("div");
  mask.className = "npc-dlg-reveal-mask";
  const revealed = vm.textRevealed || vm.reducedMotion;
  mask.style.width = revealed ? "0%" : "100%";
  if (!revealed) {
    mask.style.transitionDuration = `${revealDurationMs(vm.text)}ms`;
  }
  textWrap.append(textEl, mask);

  const continueEl = document.createElement("div");
  continueEl.className = "npc-dlg-continue";
  continueEl.textContent = "\u25BC";
  continueEl.hidden = !(revealed && (vm.hasMorePages || !vm.secondary));

  body.append(header, textWrap, continueEl);

  let mountSlot: HTMLElement | null = null;
  const secondary = vm.secondary;
  if (secondary && (secondary.kind !== "actions" || vm.acknowledged)) {
    const secondaryEl = document.createElement("div");
    secondaryEl.className = "npc-dlg-secondary";

    if (secondary.kind === "actions") {
      secondaryEl.classList.add("npc-dlg-action-bar");
      for (let i = 0; i < secondary.items.length; i++) {
        const item = secondary.items[i];
        const btn = document.createElement("div");
        btn.className = "npc-dlg-action";
        if (i === secondary.selectedIndex) btn.classList.add("selected");
        if (item.disabled) btn.classList.add("disabled");
        btn.textContent = item.label;
        btn.dataset.actionKey = item.key;
        secondaryEl.appendChild(btn);
      }
    } else if (secondary.kind === "topics") {
      secondaryEl.classList.add("npc-dlg-topic-list");
      secondary.items.forEach((item, i) => {
        const row = document.createElement("div");
        row.className = "npc-dlg-topic";
        if (i === secondary.selectedIndex) row.classList.add("selected");
        row.textContent = item.label;
        secondaryEl.appendChild(row);
      });
    } else if (secondary.kind === "ask") {
      secondaryEl.classList.add("npc-dlg-ask-strip");
      const label = document.createElement("span");
      label.textContent = "Ask about: ";
      const typed = document.createElement("span");
      typed.className = "npc-dlg-ask-typed";
      typed.textContent = secondary.typed;
      const caret = document.createElement("span");
      caret.className = "npc-caret";
      caret.textContent = "_";
      secondaryEl.append(label, typed, caret);
    } else if (secondary.kind === "mount") {
      secondaryEl.classList.add("npc-dlg-mount");
      mountSlot = secondaryEl;
    }

    if (vm.emptyLine) {
      const empty = document.createElement("div");
      empty.className = "npc-dlg-empty-line";
      empty.textContent = vm.emptyLine;
      secondaryEl.appendChild(empty);
    }

    body.appendChild(secondaryEl);
  }

  if (vm.footer) {
    const footerEl = document.createElement("div");
    footerEl.className = "npc-dlg-footer";
    footerEl.textContent = vm.footer;
    body.appendChild(footerEl);
  }

  root.append(portrait, body);
  return { root, mountSlot };
}
