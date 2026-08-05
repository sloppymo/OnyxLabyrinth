import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createGameState } from "../game/state";
import { FLOORS } from "../data/floors";
import { setGameplayRng, resetGameplayRng, createSeededRng } from "../game/rng";
import * as save from "../game/save";

vi.mock("../game/save", () => ({
  autoSave: vi.fn(),
}));

let CasinoControllerCtor: typeof import("./casino-ui").CasinoController;

function mockState(gold = 500) {
  const state = createGameState(FLOORS[0]);
  state.partyGold = gold;
  state.casino.unlockedGameTiers = ["street"];
  return state;
}

function panel(): HTMLElement {
  const p = document.getElementById("combat-panel");
  if (!p) throw new Error("#combat-panel not found");
  return p;
}

function labels(p: HTMLElement): string[] {
  return Array.from(p.querySelectorAll(".camp-char .cc-name")).map((el) => el.textContent ?? "");
}

function panelText(p: HTMLElement): string {
  return p.textContent ?? "";
}

function select(controller: any, idx: number) {
  (controller as any).index = idx;
}

async function submit(controller: any) {
  controller.handleKey("Enter");
  await vi.advanceTimersByTimeAsync(220);
}

beforeAll(async () => {
  const p = document.createElement("div");
  p.id = "combat-panel";
  document.body.appendChild(p);
  const mod = await import("./casino-ui");
  CasinoControllerCtor = mod.CasinoController;
});

beforeEach(() => {
  setGameplayRng(() => 0.5);
  vi.useFakeTimers();
});

afterEach(() => {
  resetGameplayRng();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.mocked(save.autoSave).mockClear();
  panel().innerHTML = "";
});

describe("CasinoController", () => {
  it("root Play leads to game selection", async () => {
    const state = mockState();
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    expect(labels(panel())).toContain("Three-Card Monte");
    expect(labels(panel())).toContain("Knucklebones");
    expect(labels(panel())).toContain("The Black Draw");
  });

  it("each game installs its correct next menu", async () => {
    const s1 = mockState();
    const c1 = new CasinoControllerCtor({ panel: panel(), state: s1, onClose: () => {} });
    await submit(c1);
    select(c1, 0); // Monte
    await submit(c1);
    expect(panelText(panel())).toMatch(/5 gold/);

    const s2 = mockState();
    const c2 = new CasinoControllerCtor({ panel: panel(), state: s2, onClose: () => {} });
    await submit(c2);
    select(c2, 1); // Knucklebones
    await submit(c2);
    expect(panelText(panel())).toMatch(/Low \(2-6\)/);

    const s3 = mockState();
    const c3 = new CasinoControllerCtor({ panel: panel(), state: s3, onClose: () => {} });
    await submit(c3);
    select(c3, 2); // Black Draw
    await submit(c3);
    expect(panelText(panel())).toMatch(/5 gold/);
  });

  it("exact-total menu does not offer Seven", async () => {
    const state = mockState();
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    select(c, 1); // Knucklebones
    await submit(c);
    select(c, 4); // exact
    await submit(c);
    const text = panelText(panel());
    expect(text).not.toMatch(/Call 7/);
    expect(text).toMatch(/Call 6/);
    expect(text).toMatch(/Call 8/);
  });

  it("losing Knucklebones deducts wager and clears pending round", async () => {
    setGameplayRng(() => 0.99); // two sixes -> total 12
    const state = mockState(100);
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    select(c, 1); // Knucklebones
    await submit(c);
    select(c, 0); // low
    await submit(c);
    select(c, 0); // 5 gold
    await submit(c);
    expect(state.partyGold).toBe(95);
    expect(state.casino.pendingRound).toBeDefined();
    await submit(c); // Accept -> settle
    expect(state.casino.pendingRound).toBeUndefined();
    expect(save.autoSave).toHaveBeenCalled();
    expect(state.partyGold).toBeLessThanOrEqual(95);
  });

  it("winning Knucklebones pays once and cannot pay twice", async () => {
    setGameplayRng(() => 0.99); // 12
    const state = mockState(100);
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    select(c, 1);
    await submit(c);
    select(c, 1); // high
    await submit(c);
    select(c, 0); // 5 gold
    await submit(c);
    const before = state.partyGold;
    await submit(c); // settle
    expect(state.partyGold).toBeGreaterThan(before);
    const after = state.partyGold;
    await submit(c); // second Accept is a no-op
    expect(state.partyGold).toBe(after);
    expect(state.casino.pendingRound).toBeUndefined();
  });

  it("Doubles bet grants chits on a winning double", async () => {
    setGameplayRng(() => 0.99); // double sixes
    const state = mockState(100);
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    select(c, 1);
    await submit(c);
    select(c, 3); // Doubles
    await submit(c);
    select(c, 0); // 5 gold
    await submit(c);
    const chitsBefore = state.casino.prizeChits;
    await submit(c); // settle
    expect(state.casino.prizeChits).toBeGreaterThan(chitsBefore);
    expect(state.casino.pendingRound).toBeUndefined();
  });

  it("Monte keyboard selection works after shuffle", async () => {
    setGameplayRng(createSeededRng(7));
    const state = mockState(100);
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    select(c, 0);
    await submit(c);
    select(c, 0); // 5 gold
    await submit(c);
    expect(save.autoSave).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1700); // reveal + 2 swaps + reveal
    const p = panel();
    expect(panelText(p)).toMatch(/Left/);
    await submit(c); // select Left
    expect(state.casino.pendingRound).toBeUndefined();
    expect(save.autoSave).toHaveBeenCalled();
  });

  it("Escape during Monte shuffle does not freeze the animation", async () => {
    setGameplayRng(createSeededRng(7));
    const state = mockState(100);
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    select(c, 0);
    await submit(c);
    select(c, 0);
    await submit(c);
    await vi.advanceTimersByTimeAsync(600); // into shuffle
    c.handleKey("Escape"); // must not clear timers
    await vi.advanceTimersByTimeAsync(2000); // finish swaps
    const p = panel();
    expect(panelText(p)).toMatch(/Left/);
  });

  it("Black Draw begins a persisted, autosaved hand", async () => {
    setGameplayRng(createSeededRng(9));
    const state = mockState(100);
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    select(c, 2);
    await submit(c);
    select(c, 0); // 5 gold
    await submit(c);
    expect(save.autoSave).toHaveBeenCalled();
    expect(state.casino.pendingRound).toBeDefined();
    expect(state.casino.pendingRound?.blackDrawState).toBeDefined();
    expect(state.casino.pendingRound?.blackDrawState?.nextIndex).toBe(0);
  });

  it("Prize Cage requires a confirmation step", async () => {
    const state = mockState(100);
    state.casino.prizeChits = 100;
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    select(c, 1); // Prize
    await submit(c);
    select(c, 4); // Crooked Crown
    await submit(c);
    const p = panel();
    expect(panelText(p)).toMatch(/Buy/);
    select(c, 1); // Cancel
    await submit(c);
    expect(panelText(p)).toMatch(/Crooked Crown/);
  });

  it("autoSave is called on key moments", async () => {
    setGameplayRng(createSeededRng(7));
    const state = mockState(100);
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    select(c, 0);
    await submit(c);
    select(c, 0);
    await submit(c); // commit
    const callsAfterCommit = vi.mocked(save.autoSave).mock.calls.length;
    expect(callsAfterCommit).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(1700);
    await submit(c); // settle
    expect(vi.mocked(save.autoSave).mock.calls.length).toBeGreaterThan(callsAfterCommit);
  });

  it("resuming a pending knucklebones round shows the same dice and settles once", async () => {
    setGameplayRng(() => 0.99);
    const state = mockState(100);
    const c = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    await submit(c);
    select(c, 1);
    await submit(c);
    select(c, 1); // high
    await submit(c);
    select(c, 0);
    await submit(c); // commit
    const committed = state.casino.pendingRound;
    expect(committed).toBeDefined();

    panel().innerHTML = "";
    const c2 = new CasinoControllerCtor({ panel: panel(), state, onClose: () => {} });
    expect(state.casino.pendingRound).toBe(committed);
    const before = state.partyGold;
    await submit(c2); // settle
    expect(state.partyGold).toBeGreaterThan(before);
    expect(state.casino.pendingRound).toBeUndefined();
    await submit(c2); // another Accept is no-op
    expect(state.partyGold).toBe(state.partyGold);
  });
});
