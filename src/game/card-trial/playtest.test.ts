import { describe, expect, it } from "vitest";
import { createFight, nextFight, playerView } from "./engine";
import {
  cardTrialActionContext,
  cardTrialStateFingerprint,
  cardTrialStateHash,
  CardTrialPlaytestRecorder,
} from "./playtest";

describe("Card Trial playtest fingerprints", () => {
  it("is stable for equivalent seeded fights and changes for gameplay state", () => {
    const a = createFight(2, { seed: 44 });
    const b = createFight(2, { seed: 44 });
    const c = createFight(2, { seed: 45 });

    expect(cardTrialStateHash(a)).toBe(cardTrialStateHash(b));
    expect(cardTrialStateHash(a)).not.toBe(cardTrialStateHash(c));

    a.heroes["rat-king"].energy -= 1;
    expect(cardTrialStateHash(a)).not.toBe(cardTrialStateHash(b));
  });
});

describe("Card Trial playtest recorder", () => {
  it("records compact semantic actions and exposure without presentation state", () => {
    let now = 1000;
    const state = createFight(1, { seed: 7 });
    const recorder = new CardTrialPlaytestRecorder({
      now: () => now,
      sessionId: "session-test",
      build: { commit: "test" },
    });

    recorder.beginFight(state);
    const view = playerView(state);
    recorder.observe(state, "hand", 0, view.hand);
    recorder.recordInteraction("focus", state, {
      cardUid: view.hand[0]?.uid,
      cardId: view.hand[0]?.defId,
    });
    const before = cardTrialStateFingerprint(state);
    const card = view.hand[0]!;
    recorder.beginAction({
      kind: "card",
      stateBefore: before,
      decisionMs: 420,
      heroId: "rat-king",
      cardUid: card.uid,
      cardId: card.defId,
      targetId: state.enemies[0]?.id,
      context: cardTrialActionContext(state),
    });
    now += 420;
    const action = recorder.finishAction(state);
    expect(action?.stateHashBefore).toBe(cardTrialStateHash(before));
    expect(action?.stateHashAfter).toBe(cardTrialStateHash(state));
    expect(action?.decisionMs).toBe(420);

    recorder.finishFight(state, "abandoned");
    const session = recorder.snapshot()!;
    expect(session.schemaVersion).toBe(1);
    expect(session.sessionId).toBe("session-test");
    expect(session.fights).toHaveLength(1);
    expect(session.fights[0]!.actions).toHaveLength(1);
    expect(session.fights[0]!.cards[card.defId].seen).toBe(1);
    expect(session.fights[0]!.cards[card.defId].played).toBe(1);
    expect(JSON.stringify(session)).not.toContain("soundsPlaying");
    expect(JSON.stringify(session)).not.toContain("document");
  });

  it("keeps sequential fight summaries scoped to their own telemetry", () => {
    const first = createFight(1, { seed: 11 });
    const recorder = new CardTrialPlaytestRecorder({ sessionId: "sequential-test" });
    recorder.beginFight(first);
    recorder.finishFight(first, "abandoned");

    const second = nextFight(first, 2);
    recorder.beginFight(second);
    recorder.finishFight(second, "abandoned");
    const session = recorder.snapshot()!;

    expect(session.fights).toHaveLength(2);
    expect(session.fights[0]!.summary.cardsPlayed).toBe(0);
    expect(session.fights[1]!.summary.cardsPlayed).toBe(0);
    expect(session.fights[0]!.summary.openedApplied).toBe(0);
    expect(session.fights[1]!.summary.openedApplied).toBe(0);
  });

  it("closes an active fight as abandoned when a session is exported mid-fight", () => {
    const state = createFight(3, { seed: 21 });
    const recorder = new CardTrialPlaytestRecorder({ sessionId: "abandoned-test" });
    recorder.beginFight(state);
    const session = recorder.endSession(state)!;

    expect(session.fights[0]!.result).toBe("abandoned");
    expect(session.endedAt).toBeDefined();
  });
});
