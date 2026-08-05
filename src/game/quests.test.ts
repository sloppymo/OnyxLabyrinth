import { describe, it, expect } from "vitest";
import { createGameState } from "./state";
import { FLOORS } from "../data/floors";
import {
  acceptQuest,
  advanceQuestStage,
  setQuestFlag,
  incrementQuestCounter,
  markQuestReady,
  completeQuest,
  failQuest,
  questStatus,
  validateQuestDefs,
  type QuestDef,
} from "./quests";

function freshState() {
  return createGameState(FLOORS[0]);
}

describe("quest status policy", () => {
  it("a quest with no recorded progress is implicitly available", () => {
    const state = freshState();
    expect(questStatus(state, "unknown-quest")).toBe("available");
  });

  it("acceptQuest transitions available -> active, and only from available", () => {
    const state = freshState();
    expect(acceptQuest(state, "q1")).toBe(true);
    expect(questStatus(state, "q1")).toBe("active");
    // Already active — accepting again is a no-op.
    expect(acceptQuest(state, "q1")).toBe(false);
    expect(questStatus(state, "q1")).toBe("active");
  });

  it("advanceQuestStage/setQuestFlag/incrementQuestCounter only mutate an active quest", () => {
    const state = freshState();
    // Not yet accepted — every mutator must be a silent no-op.
    expect(advanceQuestStage(state, "q1", 2)).toBe(false);
    expect(setQuestFlag(state, "q1", "sawClue", true)).toBe(false);
    expect(incrementQuestCounter(state, "q1", "kills")).toBe(0);
    expect(questStatus(state, "q1")).toBe("available");

    acceptQuest(state, "q1");
    expect(advanceQuestStage(state, "q1", 2)).toBe(true);
    expect(setQuestFlag(state, "q1", "sawClue", true)).toBe(true);
    expect(incrementQuestCounter(state, "q1", "kills")).toBe(1);
    expect(incrementQuestCounter(state, "q1", "kills")).toBe(2);

    markQuestReady(state, "q1");
    completeQuest(state, "q1");
    // Completed — mutators are no-ops again, and don't retroactively apply.
    expect(advanceQuestStage(state, "q1", 5)).toBe(false);
    expect(incrementQuestCounter(state, "q1", "kills")).toBe(2);
  });

  it("completing an objective before acceptance is ignored, not pre-completed", () => {
    const state = freshState();
    // "Complete" the objective before the quest was ever accepted.
    expect(markQuestReady(state, "q1")).toBe(false);
    expect(questStatus(state, "q1")).toBe("available");
    // Accepting afterward starts fresh at active, not ready.
    acceptQuest(state, "q1");
    expect(questStatus(state, "q1")).toBe("active");
  });

  it("markQuestReady only transitions active -> ready", () => {
    const state = freshState();
    expect(markQuestReady(state, "q1")).toBe(false);
    acceptQuest(state, "q1");
    expect(markQuestReady(state, "q1")).toBe(true);
    expect(questStatus(state, "q1")).toBe("ready");
    expect(markQuestReady(state, "q1")).toBe(false);
  });

  it("completeQuest only transitions ready -> completed, and returns true exactly once", () => {
    const state = freshState();
    expect(completeQuest(state, "q1")).toBe(false); // not accepted
    acceptQuest(state, "q1");
    expect(completeQuest(state, "q1")).toBe(false); // active, not ready
    markQuestReady(state, "q1");
    expect(completeQuest(state, "q1")).toBe(true);
    expect(questStatus(state, "q1")).toBe("completed");
    // Accepting an already-completed quest does nothing.
    expect(acceptQuest(state, "q1")).toBe(false);
    // Turning it in again grants nothing — returns false every subsequent call.
    expect(completeQuest(state, "q1")).toBe(false);
    expect(completeQuest(state, "q1")).toBe(false);
  });

  it("failQuest transitions active/ready -> failed, never from available/completed", () => {
    const state = freshState();
    expect(failQuest(state, "q1")).toBe(false);
    acceptQuest(state, "q1");
    expect(failQuest(state, "q1")).toBe(true);
    expect(questStatus(state, "q1")).toBe("failed");
    expect(failQuest(state, "q1")).toBe(false);
  });
});

describe("validateQuestDefs", () => {
  const base: QuestDef = {
    id: "a",
    title: "A",
    boardText: "",
    acceptText: "",
    stages: [{ text: "stage" }],
    readyText: "",
    completeText: "",
    failPolicy: "",
  };

  it("accepts a valid, unique-id, non-empty-stage list", () => {
    expect(validateQuestDefs([base, { ...base, id: "b" }])).toEqual([]);
  });

  it("flags duplicate ids", () => {
    const errors = validateQuestDefs([base, { ...base }]);
    expect(errors).toContain("Duplicate quest id: a");
  });

  it("flags quests with no stages", () => {
    const errors = validateQuestDefs([{ ...base, stages: [] }]);
    expect(errors.some((e) => e.includes("no stages"))).toBe(true);
  });
});
