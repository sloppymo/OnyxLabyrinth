import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandCardView, CardTrialPlayerView } from "../game/card-trial/types";
import type { CardTrialWindowsInput, CardTrialViewHandlers } from "./card-trial-view";
import { setReducedMotion } from "./combat-impact-fx";
import {
  CardTrialHandPresentation,
  DEFAULT_HAND_TUNING,
  computeCardTarget,
  fanSlotPose,
  focusedAndArmedIndices,
  isCardHandFlag,
  isSparseCardTrialUi,
} from "./card-trial-hand";

function card(uid: string, overrides: Partial<HandCardView> = {}): HandCardView {
  return {
    uid,
    defId: "nip",
    name: `Card ${uid}`,
    cost: 1,
    text: "text",
    opens: false,
    consume: "none",
    disabled: false,
    disabledReason: null,
    consumeArmed: false,
    consumeDimmed: false,
    ...overrides,
  };
}

function baseView(hand: HandCardView[]): CardTrialPlayerView {
  return {
    fightId: 1,
    fightName: "Test",
    round: 1,
    actingHero: "rat-king",
    phase: "hero-turn",
    result: null,
    energy: 3,
    hand,
    moveAvailable: true,
    moveDisabledReason: null,
    drawCount: 0,
    discardCount: 0,
    heroes: [
      { id: "rat-king", name: "Rat King", hp: 32, maxHp: 40, guard: 0, row: "front", dead: false },
      { id: "old-man", name: "Old Man", hp: 40, maxHp: 40, guard: 0, row: "back", dead: false },
    ],
    enemies: [],
    queue: [
      { id: "rat-king", kind: "hero", name: "Rat King", acting: true, done: false, dead: false },
    ],
    intents: [],
    openedEnemyId: null,
    ratRow: null,
    pileCountsOnly: true,
  };
}

function input(hand: HandCardView[], overrides: Partial<CardTrialWindowsInput> = {}): CardTrialWindowsInput {
  return {
    view: baseView(hand),
    phase: "hand",
    cursor: 0,
    targetIds: [],
    targetCursor: 0,
    flash: null,
    result: null,
    ...overrides,
  };
}

const noopHandlers: CardTrialViewHandlers = {
  onHoverCard: () => {},
  onConfirmCard: () => {},
  onMove: () => {},
  onPass: () => {},
  onHoverTarget: () => {},
  onConfirmTarget: () => {},
  onCancel: () => {},
};

describe("isSparseCardTrialUi", () => {
  it("is on by default, including unrelated query params", () => {
    expect(isSparseCardTrialUi("")).toBe(true);
    expect(isSparseCardTrialUi("?debug=1")).toBe(true);
    expect(isCardHandFlag("?cardHand=1")).toBe(true);
  });
  it("rolls back for ?cardHand=0 or ?legacyCt=1", () => {
    expect(isSparseCardTrialUi("?cardHand=0")).toBe(false);
    expect(isSparseCardTrialUi("?legacyCt=1")).toBe(false);
  });
});

describe("focusedAndArmedIndices", () => {
  it("treats hand-cursor cards as focused, not armed", () => {
    expect(focusedAndArmedIndices("hand", 0, 5)).toEqual({ focusedIndex: 0, armedIndex: null });
    expect(focusedAndArmedIndices("hand", 5, 5)).toEqual({ focusedIndex: null, armedIndex: null });
    expect(focusedAndArmedIndices("hand", 6, 5)).toEqual({ focusedIndex: null, armedIndex: null });
  });
  it("treats targeting as armed on the pending card", () => {
    expect(focusedAndArmedIndices("target", 2, 5)).toEqual({ focusedIndex: null, armedIndex: 2 });
    expect(focusedAndArmedIndices("target2", 0, 5)).toEqual({ focusedIndex: null, armedIndex: 0 });
  });
});

describe("fanSlotPose", () => {
  it("centers a lone card with zero rotation", () => {
    const pose = fanSlotPose(0, 1, DEFAULT_HAND_TUNING);
    expect(pose.x).toBeCloseTo(DEFAULT_HAND_TUNING.restingCenterX, 5);
    expect(pose.rotation).toBe(0);
  });

  it("is symmetric around center for 2..5 cards", () => {
    for (const count of [2, 3, 4, 5]) {
      const poses = Array.from({ length: count }, (_, i) => fanSlotPose(i, count, DEFAULT_HAND_TUNING));
      const xs = poses.map((p) => p.x - DEFAULT_HAND_TUNING.restingCenterX);
      for (let i = 0; i < count; i++) {
        expect(xs[i]).toBeCloseTo(-xs[count - 1 - i], 5);
        expect(poses[i].rotation).toBeCloseTo(-poses[count - 1 - i].rotation, 5);
      }
      for (let i = 1; i < count; i++) expect(poses[i].x).toBeGreaterThan(poses[i - 1].x);
    }
  });

  it("fits a five-card fan inside 768px without a scrollbar", () => {
    const left = fanSlotPose(0, 5, DEFAULT_HAND_TUNING);
    const right = fanSlotPose(4, 5, DEFAULT_HAND_TUNING);
    const half = DEFAULT_HAND_TUNING.cardWidth / 2;
    expect(left.x - half).toBeGreaterThan(0);
    expect(right.x + half).toBeLessThan(768);
  });

  it("keeps resting card bottoms above the Move/Pass gutter", () => {
    const outer = fanSlotPose(0, 5, DEFAULT_HAND_TUNING);
    const bottom = outer.y + DEFAULT_HAND_TUNING.cardHeight / 2;
    expect(bottom).toBeLessThanOrEqual(640);
  });
});

describe("computeCardTarget", () => {
  it("gives ordinary focus a small lift, not a 96px leap", () => {
    const pose = computeCardTarget(0, 5, 0, null, false, DEFAULT_HAND_TUNING);
    expect(pose.scale).toBe(DEFAULT_HAND_TUNING.focusScale);
    expect(pose.y).toBeCloseTo(DEFAULT_HAND_TUNING.restingCenterY - DEFAULT_HAND_TUNING.focusLift, 5);
    expect(DEFAULT_HAND_TUNING.focusLift).toBeLessThan(20);
    expect(pose.y).toBeGreaterThan(DEFAULT_HAND_TUNING.restingCenterY - 20);
  });

  it("straightens and lifts the armed card more than focus", () => {
    const focused = computeCardTarget(1, 5, 1, null, false, DEFAULT_HAND_TUNING);
    const armed = computeCardTarget(1, 5, null, 1, false, DEFAULT_HAND_TUNING);
    expect(armed.rotation).toBe(0);
    expect(armed.scale).toBe(DEFAULT_HAND_TUNING.armedScale);
    expect(armed.y).toBeLessThan(focused.y);
    expect(armed.scale).toBeGreaterThan(focused.scale);
  });

  it("opens a local neighbor gap that decays with distance", () => {
    const base0 = fanSlotPose(0, 5, DEFAULT_HAND_TUNING);
    const base1 = fanSlotPose(1, 5, DEFAULT_HAND_TUNING);
    const base4 = fanSlotPose(4, 5, DEFAULT_HAND_TUNING);
    const n1 = computeCardTarget(1, 5, 2, null, false, DEFAULT_HAND_TUNING);
    const n3 = computeCardTarget(0, 5, 2, null, false, DEFAULT_HAND_TUNING);
    const far = computeCardTarget(4, 5, 2, null, false, DEFAULT_HAND_TUNING);
    expect(n1.x - base1.x).toBeLessThan(0);
    expect(Math.abs(n3.x - base0.x)).toBeLessThan(Math.abs(n1.x - base1.x));
    expect(Math.abs(far.x - base4.x)).toBeCloseTo(DEFAULT_HAND_TUNING.neighborSeparation * DEFAULT_HAND_TUNING.neighborFalloff, 5);
  });

  it("does not shove unfocused cards when the cursor is on Move/Pass", () => {
    const rest = fanSlotPose(0, 5, DEFAULT_HAND_TUNING);
    const pose = computeCardTarget(0, 5, null, null, false, DEFAULT_HAND_TUNING);
    expect(pose.x).toBeCloseTo(rest.x, 5);
    expect(pose.y).toBeCloseTo(rest.y, 5);
  });

  it("drops and shrinks a disabled card without touching its rotation", () => {
    const normal = computeCardTarget(2, 5, null, null, false, DEFAULT_HAND_TUNING);
    const disabled = computeCardTarget(2, 5, null, null, true, DEFAULT_HAND_TUNING);
    expect(disabled.y).toBeGreaterThan(normal.y);
    expect(disabled.scale).toBeLessThan(1);
    expect(disabled.rotation).toBeCloseTo(normal.rotation, 6);
  });
});

describe("CardTrialHandPresentation", () => {
  let host: HTMLDivElement;
  let nowSpy: ReturnType<typeof vi.spyOn>;
  let clock: number;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    clock = 1000;
    nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    setReducedMotion(false);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    host.remove();
    setReducedMotion(false);
  });

  function tick(ms: number) {
    clock += ms;
  }

  it("keeps the same DOM node for a UID across syncs (no innerHTML rebuild)", () => {
    const presentation = new CardTrialHandPresentation(host);
    const hand = [card("a"), card("b"), card("c")];
    presentation.sync(input(hand), noopHandlers);
    const elA1 = host.querySelector('[data-uid="a"]');
    expect(elA1).not.toBeNull();

    presentation.sync(input([card("a"), card("b"), card("c")]), noopHandlers);
    const elA2 = host.querySelector('[data-uid="a"]');
    expect(elA2).toBe(elA1);
  });

  it("creates exactly one card element per uid for a 1..5 card hand", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const h2 = document.createElement("div");
      const presentation = new CardTrialHandPresentation(h2);
      const hand = Array.from({ length: count }, (_, i) => card(`u${i}`));
      presentation.sync(input(hand), noopHandlers);
      expect(h2.querySelectorAll(".ct2-card").length).toBe(count);
    }
  });

  it("marks the cursor card as focused, not armed", () => {
    const presentation = new CardTrialHandPresentation(host);
    const hand = [card("a"), card("b"), card("c")];
    presentation.sync(input(hand, { cursor: 1 }), noopHandlers);
    expect(host.querySelectorAll(".ct2-card.focused").length).toBe(1);
    expect((host.querySelector(".ct2-card.focused") as HTMLElement).dataset.uid).toBe("b");
    expect(host.querySelectorAll(".ct2-card.armed").length).toBe(0);
  });

  it("marks the pending card as armed while targeting", () => {
    const presentation = new CardTrialHandPresentation(host);
    presentation.sync(input([card("a"), card("b")], { phase: "target", cursor: 0 }), noopHandlers);
    expect(host.querySelectorAll(".ct2-card.armed").length).toBe(1);
    expect(host.querySelectorAll(".ct2-card.focused").length).toBe(0);
    expect((host.querySelector(".ct2-card.armed") as HTMLElement).dataset.uid).toBe("a");
  });

  it("does not focus a card when the cursor is on Move", () => {
    const presentation = new CardTrialHandPresentation(host);
    presentation.sync(input([card("a"), card("b")], { cursor: 2 }), noopHandlers);
    expect(host.querySelectorAll(".ct2-card.focused").length).toBe(0);
  });

  it("wires production art by id for both heroes", () => {
    const presentation = new CardTrialHandPresentation(host);
    presentation.sync(
      input([
        card("art", { defId: "nip", name: "Nip", text: "Deal 5." }),
        card("fb", { defId: "brace", name: "Brace", text: "Gain 6 Guard." }),
      ]),
      noopHandlers
    );
    const nip = host.querySelector('[data-uid="art"]') as HTMLElement;
    const brace = host.querySelector('[data-uid="fb"]') as HTMLElement;
    expect(nip.querySelector("img")?.getAttribute("src")).toContain("nip.png");
    expect(brace.querySelector("img")?.getAttribute("src")).toContain("brace.png");
    expect(brace.querySelector(".ct2-card-art")?.classList.contains("fallback")).toBe(false);
  });

  it("keeps full rules text visible at rest", () => {
    const presentation = new CardTrialHandPresentation(host);
    presentation.sync(
      input([
        card("s", {
          defId: "swarm-the-wound",
          name: "Swarm the Wound",
          text: "Deal 5. Consume Opened: deal 4 more to that enemy.",
          consume: "same-target",
        }),
      ]),
      noopHandlers
    );
    expect(host.querySelector(".ct2-card-text")?.textContent).toContain("Consume Opened");
  });

  it("removes a single played card via playing -> discarding -> removed, without disturbing survivors' identity", () => {
    const presentation = new CardTrialHandPresentation(host);
    const hand = [card("a"), card("b"), card("c")];
    presentation.sync(input(hand), noopHandlers);
    presentation.update(clock);

    presentation.sync(input([card("a"), card("c")]), noopHandlers);
    expect(host.querySelector('[data-uid="b"]')).not.toBeNull();

    tick(50);
    presentation.update(clock);
    expect(host.querySelector('[data-uid="b"]')).not.toBeNull();

    tick(500);
    presentation.update(clock);
    expect(host.querySelector('[data-uid="b"]')).not.toBeNull();

    tick(400);
    presentation.update(clock);
    expect(host.querySelector('[data-uid="b"]')).toBeNull();
    expect(host.querySelectorAll(".ct2-card").length).toBe(2);
  });

  it("bulk-discards the remaining hand on Pass (multiple uids vanish at once)", () => {
    const presentation = new CardTrialHandPresentation(host);
    presentation.sync(input([card("a"), card("b"), card("c")]), noopHandlers);
    presentation.update(clock);

    presentation.sync(input([]), noopHandlers);
    tick(1000);
    presentation.update(clock);
    expect(host.querySelectorAll(".ct2-card").length).toBe(0);
  });

  it("deals a fresh hand for the next hero as newly-created bodies", () => {
    const presentation = new CardTrialHandPresentation(host);
    presentation.sync(input([card("a"), card("b")]), noopHandlers);
    presentation.update(clock);
    presentation.sync(input([]), noopHandlers);
    tick(1000);
    presentation.update(clock);
    expect(host.querySelectorAll(".ct2-card").length).toBe(0);

    presentation.sync(input([card("x"), card("y")]), noopHandlers);
    expect(host.querySelectorAll(".ct2-card").length).toBe(2);
    expect(host.querySelector('[data-uid="x"]')).not.toBeNull();
  });

  it("applies the disabled class from HandCardView.disabled", () => {
    const presentation = new CardTrialHandPresentation(host);
    presentation.sync(input([card("a", { disabled: true, disabledReason: "Not enough energy" })]), noopHandlers);
    const el = host.querySelector('[data-uid="a"]') as HTMLElement;
    expect(el.classList.contains("disabled")).toBe(true);
    expect(el.querySelector(".ct2-card-why")?.textContent).toBe("Not enough energy");
  });

  it("snaps immediately to the small focus pose under reduced motion", () => {
    setReducedMotion(true);
    const presentation = new CardTrialHandPresentation(host);
    presentation.sync(input([card("a"), card("b"), card("c")], { cursor: 1 }), noopHandlers);
    presentation.update(clock);
    const el = host.querySelector('[data-uid="b"]') as HTMLElement;
    const expectedY = DEFAULT_HAND_TUNING.restingCenterY - DEFAULT_HAND_TUNING.focusLift;
    const translateY = Number(el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)?.[2]);
    expect(translateY).toBeCloseTo(expectedY, 3);
  });

  it("never disables the DOM button, so disabled-card clicks still route through the handler", () => {
    const presentation = new CardTrialHandPresentation(host);
    let confirmed = -1;
    const handlers: CardTrialViewHandlers = {
      ...noopHandlers,
      onConfirmCard: (i) => {
        confirmed = i;
      },
    };
    presentation.sync(input([card("a", { disabled: true })]), handlers);
    const el = host.querySelector('[data-uid="a"]') as HTMLButtonElement;
    expect(el.disabled).toBe(false);
    el.dispatchEvent(new Event("click", { bubbles: true }));
    expect(confirmed).toBe(0);
  });

  it("routes sparse card clicks by UID when a hand is reflowing", () => {
    const presentation = new CardTrialHandPresentation(host);
    let confirmedUid = "";
    const handlers: CardTrialViewHandlers = {
      ...noopHandlers,
      onConfirmCardUid: (uid) => {
        confirmedUid = uid;
      },
    };
    presentation.sync(input([card("old")]), handlers);
    presentation.sync(input([card("new"), card("target")]), handlers);
    (host.querySelector('[data-uid="target"]') as HTMLButtonElement).dispatchEvent(
      new Event("click", { bubbles: true })
    );
    expect(confirmedUid).toBe("target");
  });

  it("revives a UID that returns before its discard animation finishes", () => {
    const presentation = new CardTrialHandPresentation(host);
    presentation.sync(input([card("reuse"), card("other")]), noopHandlers);
    presentation.update(clock);
    presentation.sync(input([]), noopHandlers);
    expect((host.querySelector('[data-uid="reuse"]') as HTMLElement).dataset.state).toBe("discarding");

    presentation.sync(input([card("reuse")]), noopHandlers);
    expect((host.querySelector('[data-uid="reuse"]') as HTMLElement).dataset.state).toBe("dealing");
  });
});
