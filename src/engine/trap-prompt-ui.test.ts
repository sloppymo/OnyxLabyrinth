import { describe, expect, it } from "vitest";
import { TrapPromptController } from "./trap-prompt-ui";

describe("TrapPromptController", () => {
  it("Enter on Leave returns leave", () => {
    const t = new TrapPromptController();
    t.handleKey("ArrowDown");
    t.handleKey("ArrowDown");
    t.handleKey("ArrowDown");
    expect(t.handleKey("Enter")).toBe("leave");
  });

  it("Escape returns leave", () => {
    expect(new TrapPromptController().handleKey("Escape")).toBe("leave");
  });

  it("letter i returns inspect without moving cursor", () => {
    const t = new TrapPromptController();
    expect(t.handleKey("i")).toBe("inspect");
    expect(t.handleKey("Enter")).toBe("inspect");
  });

  it("letter shortcuts are case-insensitive", () => {
    const t = new TrapPromptController();
    expect(t.handleKey("D")).toBe("disarm");
    expect(t.handleKey("O")).toBe("open");
    expect(t.handleKey("L")).toBe("leave");
  });

  it("ArrowDown wraps from leave to inspect", () => {
    const t = new TrapPromptController();
    t.handleKey("ArrowUp"); // wrap to leave (index 3)
    expect(t.handleKey("ArrowDown")).toBeNull();
    expect(t.handleKey("Enter")).toBe("inspect");
  });

  it("ArrowUp wraps from inspect to leave", () => {
    const t = new TrapPromptController();
    t.handleKey("ArrowUp");
    expect(t.handleKey("Enter")).toBe("leave");
  });

  it("navigation keys return null", () => {
    const t = new TrapPromptController();
    expect(t.handleKey("ArrowDown")).toBeNull();
    expect(t.handleKey("ArrowUp")).toBeNull();
  });

  it("Enter confirms the highlighted row", () => {
    const t = new TrapPromptController();
    t.handleKey("ArrowDown");
    expect(t.handleKey("Enter")).toBe("disarm");
    t.handleKey("ArrowDown");
    expect(t.handleKey("Enter")).toBe("open");
  });

  it("renderMessage marks the selected row with ▶", () => {
    const t = new TrapPromptController();
    expect(t.renderMessage(false)).toContain("▶");
    t.handleKey("ArrowDown");
    const msg = t.renderMessage(false);
    expect(msg).toContain("▶");
    expect(msg).toContain("[D]isarm");
  });

  it("renderMessage stays compact for #message overlay", () => {
    const t = new TrapPromptController();
    const msg = t.renderMessage(false);
    expect(msg.length).toBeLessThanOrEqual(70);
    expect(msg).toContain("[I]nspect");
    expect(msg).toContain("[L]eave");
  });

  it("renderMessage notes un-inspected chest", () => {
    const t = new TrapPromptController();
    expect(t.renderMessage(false)).toMatch(/trap/i);
    expect(t.renderMessage(true)).not.toMatch(/inspect first/i);
  });
});
