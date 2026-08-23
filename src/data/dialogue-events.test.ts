import { describe, expect, it } from "vitest";
import {
  advanceDialogue,
  nodeForSession,
  startDialogue,
  validateDialogueEvent,
} from "../game/dialogue-event";
import { paginateText } from "../engine/npc-dialogue-view";
import {
  DIALOGUE_EVENTS,
  DIALOGUE_EVENTS_BY_ID,
  GREAT_GATE_OLD_MAN_RAT_KING,
} from "./dialogue-events";

describe("authored dialogue events", () => {
  it("have unique registry ids and valid, fully reachable graphs", () => {
    expect(Object.keys(DIALOGUE_EVENTS_BY_ID)).toHaveLength(DIALOGUE_EVENTS.length);
    for (const event of DIALOGUE_EVENTS) {
      expect(validateDialogueEvent(event), event.id).toEqual([]);
      expect(DIALOGUE_EVENTS_BY_ID[event.id]).toBe(event);
    }
  });

  it("keeps the Rat King and Old Man on stable future portrait ids", () => {
    const thesis = DIALOGUE_EVENTS_BY_ID["rat-king-old-man-thesis"];
    expect(thesis.speakers.find((speaker) => speaker.id === "rat-king")?.portraitId).toBe(
      "rat-king",
    );
    expect(thesis.speakers.find((speaker) => speaker.id === "old-man")?.portraitId).toBe(
      "old-man",
    );
  });

  it("can advance the complete Great Gate scene in authored speaker order", () => {
    let session = startDialogue(GREAT_GATE_OLD_MAN_RAT_KING);
    const texts: string[] = [];
    const speakers: string[] = [];
    let completed = false;

    for (let index = 0; index < GREAT_GATE_OLD_MAN_RAT_KING.nodes.length; index++) {
      const node = nodeForSession(GREAT_GATE_OLD_MAN_RAT_KING, session);
      expect(node).toBeDefined();
      texts.push(node!.text);
      speakers.push(node!.speakerId);
      const result = advanceDialogue(GREAT_GATE_OLD_MAN_RAT_KING, session);
      session = result.session;
      completed = result.completed;
      if (completed) break;
    }

    expect(completed).toBe(true);
    expect(session.visitedNodeIds).toHaveLength(27);
    expect(texts[0]).toBe("This is it, then? The great gate to the labyrinth?");
    expect(texts.at(-1)).toBe("Shut up.");
    expect(texts.some((text) => text.includes("You sowed the world with tasty grains"))).toBe(true);
    expect(texts).toContain("Did you win the mole wars? I can't remember.");
    expect(speakers).toEqual(
      speakers.map((_, index) => (index % 2 === 0 ? "rat-king" : "old-man")),
    );
  });

  it("paginates the longest Great Gate line without losing its text", () => {
    const line = GREAT_GATE_OLD_MAN_RAT_KING.nodes.find(
      (node) => node.id === "great-gate-stories",
    )!.text;
    const pages = paginateText(line);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.length <= 220)).toBe(true);
    expect(pages.join(" ")).toBe(line);
  });
});
