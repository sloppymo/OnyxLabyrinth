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

  it("footer shows Start and A/B pad hints", () => {
    const { c, panel } = mount();
    expect(panel.innerHTML).toMatch(/\[A\] confirm/);
    expect(panel.innerHTML).toMatch(/\[B\/Esc\]/);
    expect(panel.innerHTML).toMatch(/Start/);
    c.destroy();
  });
});
