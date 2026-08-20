import { describe, expect, it, vi } from "vitest";
import type { DialogueEventDef } from "../game/dialogue-event";
import { DialogueEventController } from "./dialogue-event-ui";

const EVENT: DialogueEventDef = {
  id: "two-speaker-test",
  startNodeId: "rat",
  speakers: [
    {
      id: "rat",
      name: "The Rat King",
      title: "KING",
      mood: "pleased",
      portraitId: "rat-king",
      placeholderGlyph: "RK",
      portraitSide: "left",
      accent: "warm",
    },
    {
      id: "old",
      name: "The Old Man",
      title: "PILGRIM",
      mood: "weary",
      portraitId: "old-man",
      placeholderGlyph: "OM",
      portraitSide: "right",
      accent: "cold",
    },
  ],
  nodes: [
    { id: "rat", speakerId: "rat", text: "More humans.", nextNodeId: "old" },
    {
      id: "old",
      speakerId: "old",
      text: "For what?",
      choices: [
        { id: "answer", label: "Answer", nextNodeId: "last" },
        { id: "silence", label: "Say nothing" },
      ],
    },
    { id: "last", speakerId: "rat", text: "For everything." },
  ],
};

describe("DialogueEventController", () => {
  it("alternates speakers/sides and renders the approved speaker portraits", () => {
    const panel = document.createElement("div");
    const controller = new DialogueEventController({
      panel,
      event: EVENT,
      onClose: vi.fn(),
      reducedMotion: true,
    });
    expect(panel.querySelector(".npc-dlg-name")?.textContent).toBe("The Rat King");
    expect(panel.querySelector(".npc-dlg-side-left")).not.toBeNull();
    expect(panel.querySelector(".dialogue-event-dlg")).not.toBeNull();
    expect(panel.querySelector<HTMLImageElement>("img")?.src).toContain(
      "assets/portraits/rat-king/portrait.png",
    );

    controller.handleKey("Enter");
    expect(controller.currentNodeId).toBe("old");
    expect(panel.querySelector(".npc-dlg-name")?.textContent).toBe("The Old Man");
    expect(panel.querySelector(".npc-dlg-side-right")).not.toBeNull();
    expect(panel.querySelector<HTMLImageElement>("img")?.src).toContain(
      "assets/portraits/old-man/portrait.png",
    );
  });

  it("navigates a branch, reports the choice, and closes after the terminal line", () => {
    const panel = document.createElement("div");
    const onChoice = vi.fn();
    const onClose = vi.fn();
    const controller = new DialogueEventController({
      panel,
      event: EVENT,
      onChoice,
      onClose,
      reducedMotion: true,
    });
    controller.handleKey("Enter");
    expect(panel.querySelectorAll(".npc-dlg-topic")).toHaveLength(2);
    controller.handleKey("Enter");
    expect(onChoice).toHaveBeenCalledWith("answer", expect.any(Object));
    expect(controller.currentNodeId).toBe("last");
    controller.handleKey("Enter");
    expect(onClose).toHaveBeenCalledWith("complete", expect.any(Object));
    expect(controller.isActive).toBe(false);
    expect(panel.innerHTML).toBe("");
  });

  it("swallows Escape unless the event explicitly allows skipping", () => {
    const lockedClose = vi.fn();
    const locked = new DialogueEventController({
      panel: document.createElement("div"),
      event: EVENT,
      onClose: lockedClose,
      reducedMotion: true,
    });
    locked.handleKey("Escape");
    expect(lockedClose).not.toHaveBeenCalled();
    expect(locked.isActive).toBe(true);

    const skippableClose = vi.fn();
    const skippable = new DialogueEventController({
      panel: document.createElement("div"),
      event: { ...EVENT, allowSkip: true },
      onClose: skippableClose,
      reducedMotion: true,
    });
    skippable.handleKey("Escape");
    expect(skippableClose).toHaveBeenCalledWith("skipped", expect.any(Object));
  });
});
