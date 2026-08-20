import { describe, expect, it } from "vitest";
import {
  advanceDialogue,
  nodeForSession,
  startDialogue,
  validateDialogueEvent,
  type DialogueEventDef,
} from "./dialogue-event";

function event(overrides: Partial<DialogueEventDef> = {}): DialogueEventDef {
  return {
    id: "test-talk",
    startNodeId: "hello",
    speakers: [{ id: "a", name: "A", title: "WITNESS", mood: "calm" }],
    nodes: [
      { id: "hello", speakerId: "a", text: "Hello.", nextNodeId: "answer" },
      {
        id: "answer",
        speakerId: "a",
        text: "Well?",
        choices: [
          { id: "stay", label: "Stay", nextNodeId: "stayed" },
          { id: "leave", label: "Leave" },
        ],
      },
      { id: "stayed", speakerId: "a", text: "Good." },
    ],
    ...overrides,
  };
}

describe("dialogue event graph", () => {
  it("advances through lines, branches by stable choice id, and retains history", () => {
    const def = event();
    const start = startDialogue(def);
    expect(nodeForSession(def, start)?.id).toBe("hello");

    const atChoice = advanceDialogue(def, start);
    expect(atChoice.completed).toBe(false);
    expect(atChoice.session.nodeId).toBe("answer");

    const atEnding = advanceDialogue(def, atChoice.session, "stay");
    expect(atEnding.selectedChoiceId).toBe("stay");
    expect(atEnding.session.selectedChoiceIds).toEqual(["stay"]);
    expect(atEnding.session.nodeId).toBe("stayed");

    const completed = advanceDialogue(def, atEnding.session);
    expect(completed.completed).toBe(true);
    expect(completed.session.visitedNodeIds).toEqual(["hello", "answer", "stayed"]);
  });

  it("allows a choice to terminate the conversation", () => {
    const def = event();
    const atChoice = advanceDialogue(def, startDialogue(def)).session;
    const result = advanceDialogue(def, atChoice, "leave");
    expect(result.completed).toBe(true);
    expect(result.session.selectedChoiceIds).toEqual(["leave"]);
  });

  it("rejects missing choices and choices on ordinary lines", () => {
    const def = event();
    const start = startDialogue(def);
    expect(() => advanceDialogue(def, start, "stay")).toThrow(/does not accept/);
    const atChoice = advanceDialogue(def, start).session;
    expect(() => advanceDialogue(def, atChoice)).toThrow(/requires a choice/);
  });

  it("reports unknown references, duplicate ids, and unreachable copy", () => {
    const errors = validateDialogueEvent(
      event({
        startNodeId: "missing",
        speakers: [
          { id: "a", name: "A", title: "T", mood: "M" },
          { id: "a", name: "Again", title: "T", mood: "M" },
        ],
        nodes: [
          { id: "one", speakerId: "nobody", text: "Text", nextNodeId: "nowhere" },
          { id: "one", speakerId: "a", text: "Duplicate" },
          { id: "orphan", speakerId: "a", text: "Unused" },
        ],
      }),
    );
    expect(errors.join("\n")).toMatch(/start node/);
    expect(errors.join("\n")).toMatch(/duplicate speaker/);
    expect(errors.join("\n")).toMatch(/duplicate node/);
    expect(errors.join("\n")).toMatch(/unknown speaker/);
    expect(errors.join("\n")).toMatch(/unknown node/);
  });
});
