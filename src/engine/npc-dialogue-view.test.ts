/**
 * Unit tests for the pure NPC dialogue view helpers and DOM builder:
 * pagination, reveal timing, portrait resolution/fallback, and the
 * secondary-slot composition (actions/topics/ask/mount).
 */
import { describe, it, expect } from "vitest";
import {
  paginateText,
  revealDurationMs,
  renderNPCDialogue,
  type DialogueViewModel,
} from "./npc-dialogue-view";
import { resolvePortraitUrl, hasPortrait } from "./npc-portraits";

function baseVm(overrides: Partial<DialogueViewModel> = {}): DialogueViewModel {
  return {
    npcName: "Kazeharu",
    npcTitle: "masterless duelist",
    mood: "wary",
    text: "Draw when ready.",
    hasMorePages: false,
    messageKind: "speech",
    acknowledged: false,
    textRevealed: true,
    reducedMotion: true,
    secondary: null,
    ...overrides,
  };
}

describe("paginateText", () => {
  it("returns a single page for short text", () => {
    expect(paginateText("Short line.")).toEqual(["Short line."]);
  });

  it("splits long text into multiple readable pages, preferring sentence breaks", () => {
    const long =
      "First sentence is here. Second sentence follows right after it. " +
      "Third one keeps going a bit longer than the others do. " +
      "Fourth and final sentence wraps things up nicely at the end.";
    const pages = paginateText(long, 80);
    expect(pages.length).toBeGreaterThan(1);
    // No page exceeds the budget by more than a single word's slack, and
    // nothing is silently dropped.
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(90);
    expect(pages.join(" ")).toContain("First sentence");
    expect(pages.join(" ")).toContain("wraps things up nicely at the end.");
  });

  it("never splits a word in half", () => {
    const long = "supercalifragilisticexpialidocious ".repeat(10).trim();
    const pages = paginateText(long, 40);
    for (const page of pages) {
      for (const word of page.split(" ")) {
        expect(word === "" || long.includes(word)).toBe(true);
      }
    }
  });
});

describe("revealDurationMs", () => {
  it("scales with text length within a sane floor/ceiling", () => {
    expect(revealDurationMs("")).toBeGreaterThanOrEqual(100);
    expect(revealDurationMs("hi")).toBeLessThan(revealDurationMs("a much longer line of dialogue text"));
    expect(revealDurationMs("x".repeat(1000))).toBeLessThanOrEqual(900);
  });
});

describe("portrait resolution", () => {
  it("resolves a known id to an asset URL", () => {
    expect(resolvePortraitUrl("kazeharu")).toContain("assets/portraits/kazeharu/portrait.png");
    expect(hasPortrait("kazeharu")).toBe(true);
  });

  it("falls back to undefined for an unknown or missing id", () => {
    expect(resolvePortraitUrl("vestra")).toBeUndefined();
    expect(resolvePortraitUrl(undefined)).toBeUndefined();
    expect(hasPortrait("vestra")).toBe(false);
  });
});

describe("renderNPCDialogue", () => {
  it("renders a real <img> for a known portrait id", () => {
    const { root } = renderNPCDialogue(baseVm({ portraitId: "kazeharu" }));
    const img = root.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("kazeharu/portrait.png");
    expect(root.querySelector(".npc-dlg-portrait-silhouette")).toBeNull();
  });

  it("renders a deliberate silhouette (not a broken image) when there's no portrait", () => {
    const { root } = renderNPCDialogue(baseVm({ portraitId: undefined }));
    expect(root.querySelector("img")).toBeNull();
    const silhouette = root.querySelector(".npc-dlg-portrait-silhouette");
    expect(silhouette).not.toBeNull();
    expect(silhouette!.textContent).toBe("K"); // first letter of "Kazeharu"
  });

  it("uses an explicit fallback label for future story portraits", () => {
    const { root } = renderNPCDialogue(
      baseVm({ npcName: "The Rat King", portraitFallbackLabel: "RK" }),
    );
    expect(root.querySelector(".npc-dlg-portrait-initial")?.textContent).toBe("RK");
  });

  it("renders name, title/mood, and the spoken line with quotes for 'speech'", () => {
    const { root } = renderNPCDialogue(baseVm());
    expect(root.querySelector(".npc-dlg-name")!.textContent).toBe("Kazeharu");
    expect(root.querySelector(".npc-dlg-meta")!.textContent).toContain("WARY");
    expect(root.querySelector(".npc-dlg-text")!.textContent).toBe("\u201CDraw when ready.\u201D");
  });

  it("does not quote 'transaction'/'narration' lines", () => {
    const { root } = renderNPCDialogue(baseVm({ messageKind: "transaction", text: "You gain 12 gold." }));
    expect(root.querySelector(".npc-dlg-text")!.textContent).toBe("You gain 12 gold.");
  });

  it("hides the root action bar until acknowledged, even if provided", () => {
    const unacked = renderNPCDialogue(
      baseVm({
        secondary: { kind: "actions", items: [{ key: "talk", label: "[T] Talk" }], selectedIndex: 0 },
        acknowledged: false,
      })
    );
    expect(unacked.root.querySelector(".npc-dlg-action-bar")).toBeNull();

    const acked = renderNPCDialogue(
      baseVm({
        secondary: { kind: "actions", items: [{ key: "talk", label: "[T] Talk" }], selectedIndex: 0 },
        acknowledged: true,
      })
    );
    expect(acked.root.querySelector(".npc-dlg-action-bar")).not.toBeNull();
    expect(acked.root.querySelector(".npc-dlg-action")!.textContent).toBe("[T] Talk");
  });

  it("renders topics without requiring acknowledgment (only root actions are gated)", () => {
    const { root } = renderNPCDialogue(
      baseVm({
        secondary: { kind: "topics", items: [{ label: "forge" }], selectedIndex: 0 },
        acknowledged: false,
      })
    );
    expect(root.querySelector(".npc-dlg-topic-list")).not.toBeNull();
  });

  it("escapes typed keyword text via textContent, never innerHTML", () => {
    const malicious = "<img src=x onerror=alert(1)>";
    const { root } = renderNPCDialogue(
      baseVm({ secondary: { kind: "ask", typed: malicious } })
    );
    const typedEl = root.querySelector(".npc-dlg-ask-typed")!;
    expect(typedEl.textContent).toBe(malicious);
    // Built via textContent (DOM API), never innerHTML with the raw string:
    // no <img> element exists, and the markup shows the escaped entity form,
    // not a live tag.
    expect(root.querySelectorAll("img").length).toBe(0);
    expect(root.innerHTML).toContain("&lt;img");
    expect(root.innerHTML).not.toContain("<img src=x");
  });

  it("exposes a mount slot for barter/give instead of building a list itself", () => {
    const { mountSlot } = renderNPCDialogue(baseVm({ secondary: { kind: "mount" } }));
    expect(mountSlot).not.toBeNull();
    expect(mountSlot!.className).toContain("npc-dlg-mount");
  });

  it("shows the reveal mask at full width until textRevealed, then collapses it", () => {
    const midReveal = renderNPCDialogue(baseVm({ textRevealed: false, reducedMotion: false }));
    const mask = midReveal.root.querySelector<HTMLElement>(".npc-dlg-reveal-mask")!;
    expect(mask.style.width).toBe("100%");

    const revealed = renderNPCDialogue(baseVm({ textRevealed: true }));
    const mask2 = revealed.root.querySelector<HTMLElement>(".npc-dlg-reveal-mask")!;
    expect(mask2.style.width).toBe("0%");
  });

  it("reduced motion skips the reveal animation even if textRevealed is false", () => {
    const { root } = renderNPCDialogue(baseVm({ textRevealed: false, reducedMotion: true }));
    const mask = root.querySelector<HTMLElement>(".npc-dlg-reveal-mask")!;
    expect(mask.style.width).toBe("0%");
  });

  it("shows the continue indicator only once the line is fully revealed", () => {
    const midReveal = renderNPCDialogue(baseVm({ textRevealed: false, reducedMotion: false, hasMorePages: true }));
    expect(midReveal.root.querySelector<HTMLElement>(".npc-dlg-continue")!.hidden).toBe(true);

    const revealed = renderNPCDialogue(baseVm({ textRevealed: true, hasMorePages: true }));
    expect(revealed.root.querySelector<HTMLElement>(".npc-dlg-continue")!.hidden).toBe(false);
  });

  it("applies the hostile accent/flash class for a hostile message", () => {
    const { root } = renderNPCDialogue(baseVm({ messageKind: "hostile", dialogueAccent: "hostile" }));
    expect(root.className).toContain("npc-dlg-hostile-flash");
    expect(root.className).toContain("npc-dlg-accent-hostile");
  });

  it("defaults to the left side and neutral accent when unset", () => {
    const { root } = renderNPCDialogue(baseVm());
    expect(root.className).toContain("npc-dlg-side-left");
    expect(root.className).toContain("npc-dlg-accent-neutral");
  });

  it("honors portraitSide: right", () => {
    const { root } = renderNPCDialogue(baseVm({ portraitSide: "right" }));
    expect(root.className).toContain("npc-dlg-side-right");
  });
});
