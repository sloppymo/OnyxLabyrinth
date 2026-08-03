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

const press = (button: "a" | "b" | "up" | "down" | "left" | "right") => ({
  kind: "press" as const,
  button,
});

describe("DungeonActionRingController", () => {
  it("A on Camp invokes onCamp then closes", () => {
    const { c, onCamp, onClose } = mount();
    c.handleInput(press("a"));
    expect(onCamp).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("B closes without choosing an action", () => {
    const { c, onCamp, onClose } = mount();
    c.handleInput(press("b"));
    expect(onCamp).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("D-pad right then A selects Map", () => {
    const { c, onToggleMap } = mount();
    c.handleInput(press("right"));
    c.handleInput(press("a"));
    expect(onToggleMap).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("D-pad down follows the two-column command grid", () => {
    const { c, onCastSpell } = mount();
    c.handleInput(press("down"));
    c.handleInput(press("a"));
    expect(onCastSpell).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("renders controller instructions and no keyboard shortcut badges", () => {
    const { c, panel } = mount();
    expect(panel.classList.contains("dungeon-actions-host")).toBe(true);
    expect(panel.querySelector(".ff6-window.dungeon-actions-window")).not.toBeNull();
    expect(panel.textContent).toMatch(/Dungeon Actions/i);
    expect(panel.textContent).toMatch(/Restore HP and SP/);
    expect(panel.textContent).toMatch(/D-PAD MOVE/);
    expect(panel.textContent).toMatch(/A SELECT/);
    expect(panel.textContent).toMatch(/B BACK/);
    expect(panel.textContent).not.toMatch(/keyboard/i);
    c.destroy();
  });

  it("updates the action description when the D-pad selection moves", () => {
    const { c, panel } = mount();
    c.handleInput(press("right"));
    expect(panel.textContent).toMatch(/explored-floor map/);
    c.destroy();
  });

  it("routes either lower command to the full-width Return to Town tile", () => {
    const { c, onTown } = mount();
    c.handleInput(press("right"));
    c.handleInput(press("down"));
    c.handleInput(press("down"));
    c.handleInput(press("a"));
    expect(onTown).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("keyboard ArrowRight then Enter selects Map", () => {
    const { c, onToggleMap, onClose } = mount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onToggleMap).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("keyboard Escape closes without choosing an action", () => {
    const { c, onCamp, onClose } = mount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCamp).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("ignores unmapped keyboard keys", () => {
    const { c, onClose } = mount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(onClose).not.toHaveBeenCalled();
    c.destroy();
  });
});
