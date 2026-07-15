/**
 * Tests for the FF6Window unified menu component.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FF6Window, type FF6WindowOptions } from "./ff6-window-library";
import type { ControllerInputEvent } from "./controller-input";

function makeOptions(overrides: Partial<FF6WindowOptions> = {}): FF6WindowOptions {
  return {
    items: [
      { label: "Inn", metadata: "inn" },
      { label: "Shop", detail: "10G", metadata: "shop" },
      { label: "Locked", disabled: true, metadata: "locked" },
    ],
    selectedIndex: 0,
    mode: "menu",
    onHover: vi.fn(),
    onConfirm: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

function press(button: ControllerInputEvent["button"]): ControllerInputEvent {
  return { kind: "press", button };
}

describe("FF6Window", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders with correct CSS classes", () => {
    const win = new FF6Window(makeOptions({ mode: "selection", width: "medium" }));
    const el = win.render();
    expect(el.classList.contains("ff6-window")).toBe(true);
    expect(el.classList.contains("standalone")).toBe(true);
    expect(el.classList.contains("mode-selection")).toBe(true);
    expect(el.classList.contains("width-medium")).toBe(true);
    expect(el.classList.contains("animated")).toBe(true);
  });

  it("renders title, items, detail column, and footers", () => {
    const win = new FF6Window(
      makeOptions({ title: "Town", footer: "[Esc] back", footer2: "Gold: 50g" })
    );
    const el = win.render();
    expect(el.querySelector(".ff6-menu-title")?.textContent).toBe("Town");
    const rows = el.querySelectorAll(".ff6-menu-item");
    expect(rows.length).toBe(3);
    expect(rows[1].querySelector(".ff6-sel-detail")?.textContent).toBe("10G");
    const footers = el.querySelectorAll(".ff6-footer");
    expect(footers[0].textContent).toBe("[Esc] back");
    expect(footers[1].textContent).toBe("Gold: 50g");
  });

  it("escapes HTML in labels and title", () => {
    const win = new FF6Window(
      makeOptions({
        title: "<img src=x>",
        items: [{ label: "<script>bad</script>" }],
      })
    );
    const el = win.render();
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector(".ff6-sel-label")?.textContent).toBe("<script>bad</script>");
  });

  it("navigates items with Up/Down and reports hover", () => {
    const opts = makeOptions();
    const win = new FF6Window(opts);
    const el = win.render();
    expect(win.handleKey("ArrowDown")).toBe(true);
    expect(win.getSelectedIndex()).toBe(1);
    expect(opts.onHover).toHaveBeenCalledWith(1);
    expect(el.querySelectorAll(".ff6-menu-item")[1].classList.contains("selected")).toBe(true);
    win.handleKey("ArrowUp");
    expect(win.getSelectedIndex()).toBe(0);
  });

  it("wraps selection (last → first on Down, first → last on Up)", () => {
    const win = new FF6Window(makeOptions({ selectedIndex: 2 }));
    win.render();
    win.handleKey("ArrowDown");
    expect(win.getSelectedIndex()).toBe(0);
    win.handleKey("ArrowUp");
    expect(win.getSelectedIndex()).toBe(2);
  });

  it("calls onConfirm on Enter and Space with the selected index", () => {
    const opts = makeOptions();
    const win = new FF6Window(opts);
    win.render();
    win.handleKey("ArrowDown");
    expect(win.handleKey("Enter")).toBe(true);
    expect(opts.onConfirm).toHaveBeenCalledWith(1);
    win.handleKey(" ");
    expect(opts.onConfirm).toHaveBeenCalledTimes(2);
  });

  it("does not confirm disabled items", () => {
    const opts = makeOptions({ selectedIndex: 2 });
    const win = new FF6Window(opts);
    win.render();
    expect(win.handleKey("Enter")).toBe(true); // consumed…
    expect(opts.onConfirm).not.toHaveBeenCalled(); // …but no action
  });

  it("calls onBack on Esc", () => {
    const opts = makeOptions();
    const win = new FF6Window(opts);
    win.render();
    expect(win.handleKey("Escape")).toBe(true);
    expect(opts.onBack).toHaveBeenCalledTimes(1);
  });

  it("lets unmapped keys bubble to the owning controller", () => {
    const win = new FF6Window(makeOptions());
    win.render();
    expect(win.handleKey("t")).toBe(false);
    expect(win.handleKey("Tab")).toBe(false);
    expect(win.handleKey("ArrowLeft")).toBe(false);
  });

  it("marks disabled items and custom classNames visually", () => {
    const win = new FF6Window(
      makeOptions({
        items: [
          { label: "A" },
          { label: "B", disabled: true },
          { label: "C", className: "unaffordable" },
        ],
      })
    );
    const el = win.render();
    const rows = el.querySelectorAll(".ff6-menu-item");
    expect(rows[1].classList.contains("disabled")).toBe(true);
    expect(rows[2].classList.contains("unaffordable")).toBe(true);
  });

  it("updates selectedIndex without a full re-render", () => {
    const win = new FF6Window(makeOptions());
    const el = win.render();
    const firstRow = el.querySelectorAll(".ff6-menu-item")[0];
    win.updateSelectedIndex(1);
    // Same DOM nodes (no rebuild), highlight moved.
    expect(el.querySelectorAll(".ff6-menu-item")[0]).toBe(firstRow);
    expect(firstRow.classList.contains("selected")).toBe(false);
    expect(el.querySelectorAll(".ff6-menu-item")[1].classList.contains("selected")).toBe(true);
  });

  it("clamps updateSelectedIndex into range", () => {
    const win = new FF6Window(makeOptions());
    win.render();
    win.updateSelectedIndex(99);
    expect(win.getSelectedIndex()).toBe(2);
    win.updateSelectedIndex(-5);
    expect(win.getSelectedIndex()).toBe(0);
  });

  it("handles gamepad input (dpad, A, B) and ignores shoulders", () => {
    const opts = makeOptions();
    const win = new FF6Window(opts);
    win.render();
    expect(win.handleInput(press("down"))).toBe(true);
    expect(win.getSelectedIndex()).toBe(1);
    expect(win.handleInput(press("a"))).toBe(true);
    expect(opts.onConfirm).toHaveBeenCalledWith(1);
    expect(win.handleInput(press("b"))).toBe(true);
    expect(opts.onBack).toHaveBeenCalledTimes(1);
    expect(win.handleInput(press("lb"))).toBe(false);
    expect(win.handleInput(press("rb"))).toBe(false);
    expect(win.handleInput(press("left"))).toBe(false);
    expect(win.handleInput({ kind: "hold", button: "a", holdSeconds: 1 })).toBe(false);
  });

  it("shows and hides the flash message", () => {
    const win = new FF6Window(makeOptions());
    const el = win.render();
    const flash = el.querySelector<HTMLElement>(".ff6-flash")!;
    expect(flash.style.display).toBe("none");
    win.setFlash("Not enough gold!");
    expect(flash.textContent).toBe("Not enough gold!");
    expect(flash.style.display).toBe("");
    win.setFlash(null);
    expect(flash.style.display).toBe("none");
  });

  it("updateItems rebuilds the list and clamps the cursor", () => {
    const win = new FF6Window(makeOptions({ selectedIndex: 2 }));
    const el = win.render();
    win.updateItems([{ label: "Only" }]);
    expect(el.querySelectorAll(".ff6-menu-item").length).toBe(1);
    expect(win.getSelectedIndex()).toBe(0);
    expect(win.getSelectedItem()?.label).toBe("Only");
  });

  it("exposes selected item metadata", () => {
    const win = new FF6Window(makeOptions({ selectedIndex: 1 }));
    win.render();
    expect(win.getSelectedMetadata<string>()).toBe("shop");
  });

  it("mouse click confirms an item; hover moves the highlight", () => {
    const opts = makeOptions();
    const win = new FF6Window(opts);
    const el = win.render();
    document.body.appendChild(el);
    const rows = el.querySelectorAll<HTMLElement>(".ff6-menu-item");
    rows[1].dispatchEvent(new MouseEvent("mouseenter"));
    expect(win.getSelectedIndex()).toBe(1);
    rows[1].click();
    expect(opts.onConfirm).toHaveBeenCalledWith(1);
    // Disabled row: click selects but never confirms.
    rows[2].click();
    expect(win.getSelectedIndex()).toBe(2);
    expect(opts.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("playConfirmAnimation toggles the confirming class", async () => {
    const win = new FF6Window(makeOptions());
    const el = win.render();
    const promise = win.playConfirmAnimation();
    expect(el.querySelector(".ff6-menu-item.selected")!.classList.contains("confirming")).toBe(
      true
    );
    await promise;
    expect(el.querySelector(".ff6-menu-item.selected")!.classList.contains("confirming")).toBe(
      false
    );
  });

  it("closeWindow plays the closing animation then removes the element", async () => {
    const win = new FF6Window(makeOptions());
    const el = win.render();
    document.body.appendChild(el);
    const promise = win.closeWindow();
    expect(el.classList.contains("closing")).toBe(true);
    await promise;
    expect(el.isConnected).toBe(false);
    expect(win.getElement()).toBeNull();
  });

  it("destroy removes the element immediately", () => {
    const win = new FF6Window(makeOptions());
    const el = win.render();
    document.body.appendChild(el);
    win.destroy();
    expect(el.isConnected).toBe(false);
  });

  it("renders trusted contentHtml for status/description modes", () => {
    const win = new FF6Window(
      makeOptions({
        mode: "status",
        items: [],
        contentHtml: `<div class="guild-char"><span class="gc-name">Aria</span></div>`,
      })
    );
    const el = win.render();
    expect(el.querySelector(".ff6-content .gc-name")?.textContent).toBe("Aria");
    // No item list when items are empty.
    expect(el.querySelector(".ff6-selection-list")).toBeNull();
  });

  it("static frame() wraps arbitrary content in FF6 chrome", () => {
    const el = FF6Window.frame({
      title: "Guild",
      contentHtml: "<p>roster</p>",
      footer: "[Esc] back",
      flash: "Saved!",
    });
    expect(el.classList.contains("ff6-window")).toBe(true);
    expect(el.classList.contains("standalone")).toBe(true);
    expect(el.querySelector(".ff6-menu-title")?.textContent).toBe("Guild");
    expect(el.querySelector(".ff6-content p")?.textContent).toBe("roster");
    expect(el.querySelector(".ff6-flash")?.textContent).toBe("Saved!");
    expect(el.querySelector(".ff6-footer")?.textContent).toBe("[Esc] back");
  });

  it("handles an empty item list without crashing", () => {
    const opts = makeOptions({ items: [], selectedIndex: 0 });
    const win = new FF6Window(opts);
    win.render();
    expect(win.handleKey("ArrowDown")).toBe(true);
    expect(win.handleKey("Enter")).toBe(true);
    expect(opts.onConfirm).not.toHaveBeenCalled();
    expect(win.getSelectedItem()).toBeUndefined();
  });
});
