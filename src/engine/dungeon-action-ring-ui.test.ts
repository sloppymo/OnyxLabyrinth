import { describe, expect, it, vi } from "vitest";
import { DungeonActionRingController } from "./dungeon-action-ring-ui";

function mount() {
  const panel = document.createElement("div");
  const onCamp = vi.fn();
  const onToggleMap = vi.fn();
  const onCastSpell = vi.fn();
  const onUnlock = vi.fn();
  const onTown = vi.fn();
  const onClose = vi.fn();
  const c = new DungeonActionRingController({
    panel,
    onCamp,
    onToggleMap,
    onCastSpell,
    onUnlock,
    onTown,
    onClose,
  });
  return { c, panel, onCamp, onToggleMap, onCastSpell, onUnlock, onTown, onClose };
}

describe("DungeonActionRingController", () => {
  it("Enter on Camp invokes onCamp then onClose", () => {
    const { c, onCamp, onClose } = mount();
    c.handleKey("Enter");
    expect(onCamp).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("Escape cancels without side effects", () => {
    const { c, onCamp, onClose } = mount();
    c.handleKey("Escape");
    expect(onCamp).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("ArrowDown then Enter selects Map", () => {
    const { c, onToggleMap } = mount();
    c.handleKey("ArrowDown");
    c.handleKey("Enter");
    expect(onToggleMap).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("renders the shared window chrome with descriptions and controls", () => {
    const { c, panel } = mount();
    expect(panel.classList.contains("dungeon-actions-host")).toBe(true);
    expect(panel.querySelector(".ff6-window.dungeon-actions-window")).not.toBeNull();
    expect(panel.textContent).toMatch(/Dungeon Actions/i);
    expect(panel.textContent).toMatch(/Restore HP and SP/);
    expect(panel.textContent).toMatch(/D-pad navigate/);
    expect(panel.textContent).toMatch(/A confirm/);
    expect(panel.textContent).toMatch(/B close/);
    c.destroy();
  });

  it("updates the action description when the cursor moves", () => {
    const { c, panel } = mount();
    c.handleKey("ArrowDown");
    expect(panel.textContent).toMatch(/explored-floor map/);
    c.destroy();
  });

  it("supports direct letter shortcuts", () => {
    const { c, onTown, onClose } = mount();
    c.handleKey("t");
    expect(onTown).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    c.destroy();
  });
});
