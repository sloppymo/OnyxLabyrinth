// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

type ShellModule = typeof import("./shell");

async function loadShell(): Promise<ShellModule> {
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  return import("./shell");
}

describe("dungeon message band", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("keeps an empty notification box hidden without hiding HUD chrome", async () => {
    const shell = await loadShell();
    shell.renderPartyStrip([], "N", "F1");
    shell.setMessage("");

    expect(document.querySelector<HTMLDivElement>("#message-box")!.hidden).toBe(true);
    expect(document.querySelector<HTMLDivElement>("#message-band")!.hidden).toBe(false);
    expect(shell.getMessageText()).toEqual({ text: "", visible: false });
  });

  it("reports only rendered glyphs, then completes and dismisses in two actions", async () => {
    const shell = await loadShell();
    shell.setMessage("A fresh notification.");

    expect(shell.getMessageText()).toEqual({ text: "", visible: true });
    expect(document.querySelector("#message")!.textContent).toBe("");

    shell.clearMessageOnPlayerAction();
    expect(shell.getMessageText()).toEqual({ text: "A fresh notification.", visible: true });

    shell.clearMessageOnPlayerAction();
    expect(shell.getMessageText()).toEqual({ text: "", visible: false });
    expect(document.querySelector<HTMLDivElement>("#message-box")!.hidden).toBe(true);
  });

  it("renders interactive prompts immediately and bounds long copy", async () => {
    const shell = await loadShell();
    const prompt = "Trapped! ↑↓+A · B leave\n▶[I]nsp· [D]ism· [O]pen· [L]ve";
    shell.setMessage(prompt, { instant: true });
    expect(shell.getMessageText()).toEqual({ text: prompt, visible: true });

    shell.setMessage("word ".repeat(60), { instant: true });
    const rendered = shell.getMessageText().text;
    expect(rendered.endsWith("…")).toBe(true);
    expect(rendered.length).toBeLessThanOrEqual(219);
  });

  it("shows controls only when no notification is competing with them", async () => {
    const shell = await loadShell();
    shell.renderPartyStrip([], "E", "F3");
    const band = document.querySelector<HTMLDivElement>("#message-band")!;
    const location = document.querySelector<HTMLSpanElement>("#hud-location")!;
    const controls = document.querySelector<HTMLSpanElement>("#hud-controls")!;

    expect(location.textContent).toBe("F3 · E");
    expect(controls.textContent).toContain("Tab:Actions");
    expect(band.classList.contains("has-message")).toBe(false);

    shell.setMessage("You enter the dungeon...\nTab: Actions · Esc: Save", { instant: true });
    expect(band.classList.contains("has-message")).toBe(true);

    shell.clearMessageOnPlayerAction();
    expect(band.classList.contains("has-message")).toBe(false);
    expect(controls.textContent).toContain("Esc:Save");
  });

  it("hides and restores the message band across map and mode changes", async () => {
    const shell = await loadShell();
    shell.renderPartyStrip([], "N", "F1");
    shell.setMessage("Map transition", { instant: true });
    const band = document.querySelector<HTMLDivElement>("#message-band")!;

    shell.showMode("dungeon", false);
    expect(band.style.display).toBe("");
    shell.showMode("dungeon", true);
    expect(band.style.display).toBe("none");
    shell.showMode("dungeon", false);
    expect(band.style.display).toBe("");
    expect(shell.getMessageText()).toEqual({ text: "Map transition", visible: true });

    shell.showMode("town", false);
    expect(band.style.display).toBe("none");
  });

  it("shows accessible quick-map chrome only during eligible dungeon display", async () => {
    const shell = await loadShell();
    const overlay = document.querySelector<HTMLDivElement>("#map-overlay")!;
    const toggle = document.querySelector<HTMLButtonElement>("#map-overlay-toggle")!;

    shell.showMode("dungeon", false, false);
    expect(overlay.hidden).toBe(true);
    expect(toggle.hidden).toBe(false);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toContain("V · MAP");

    shell.showMode("dungeon", false, true);
    expect(overlay.hidden).toBe(false);
    expect(overlay.getAttribute("aria-hidden")).toBe("false");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toContain("CLOSE MAP");

    shell.showMode("dungeon", true, true);
    expect(overlay.hidden).toBe(true);
    expect(toggle.hidden).toBe(true);

    shell.showMode("combat", false, true);
    expect(overlay.hidden).toBe(true);
    expect(toggle.hidden).toBe(true);
  });

  it("removes the quick-map button listener on teardown", async () => {
    const shell = await loadShell();
    const onToggle = vi.fn();
    const unbind = shell.bindMapOverlayButton(onToggle);
    const toggle = document.querySelector<HTMLButtonElement>("#map-overlay-toggle")!;

    toggle.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    unbind();
    toggle.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
