/**
 * Party creation UI — carousel choice phase + editor layout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PartyCreationController } from "./party-ui";

const SLIDE_MS = 220;

function makePanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = "combat-panel";
  panel.classList.add("party-create-host", "ff6-menu-host");
  return panel;
}

function cycleRight(ctrl: PartyCreationController): void {
  ctrl.handleKey("ArrowRight");
  vi.advanceTimersByTime(SLIDE_MS);
  ctrl.releaseDirection(1);
}

function cycleLeft(ctrl: PartyCreationController): void {
  ctrl.handleKey("ArrowLeft");
  vi.advanceTimersByTime(SLIDE_MS);
  ctrl.releaseDirection(-1);
}

/** Choice screen: 4 presets then Custom — move to last stop via Left/Right. */
function openEditor(ctrl: PartyCreationController): void {
  for (let i = 0; i < 4; i++) cycleRight(ctrl);
  ctrl.handleKey("Enter");
  // Confirm flash uses a short timeout before enterEditor — advance timers.
  vi.runAllTimers();
}

function confirmSlot(ctrl: PartyCreationController): void {
  ctrl.handleKey("Enter");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PartyCreationController first input", () => {
  it("confirms All Trades on the first Enter", () => {
    let confirmed = 0;
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {
        confirmed += 1;
      },
      onCancel: () => {},
    });
    expect(panel.textContent).toMatch(/All Trades|Assemble Your Party|Custom/i);
    ctrl.handleKey("Enter");
    vi.runAllTimers();
    expect(confirmed).toBe(1);
  });

  it("cancels on the first Escape", () => {
    let cancelled = 0;
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {
        cancelled += 1;
      },
    });
    ctrl.handleKey("Escape");
    expect(cancelled).toBe(1);
  });
});

describe("PartyCreationController choice carousel", () => {
  it("cycles Left/Right through 4 presets + Custom with wrap", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    expect(panel.querySelector(".party-carousel-card--focus")?.textContent).toMatch(/All Trades/);

    cycleRight(ctrl);
    expect(panel.querySelector(".party-carousel-card--focus")?.textContent).toMatch(/Shield Wall/);

    cycleRight(ctrl);
    expect(panel.querySelector(".party-carousel-card--focus")?.textContent).toMatch(/Glass Cannons/);

    cycleRight(ctrl);
    expect(panel.querySelector(".party-carousel-card--focus")?.textContent).toMatch(/All Steel/);

    cycleRight(ctrl);
    expect(panel.querySelector(".party-carousel-card--focus")?.textContent).toMatch(/Custom Party/);

    cycleRight(ctrl);
    expect(panel.querySelector(".party-carousel-card--focus")?.textContent).toMatch(/All Trades/);

    cycleLeft(ctrl);
    expect(panel.querySelector(".party-carousel-card--focus")?.textContent).toMatch(/Custom Party/);
  });

  it("shows peeks of neighboring cards and a persistent detail strip", () => {
    const panel = makePanel();
    new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });

    expect(panel.querySelector(".party-carousel-card--peek-left")).not.toBeNull();
    expect(panel.querySelector(".party-carousel-card--peek-right")).not.toBeNull();
    expect(panel.querySelector(".party-carousel-pro")?.textContent).toMatch(/Flexible/);
    expect(panel.querySelector(".party-carousel-con")?.textContent).toMatch(/mediocre/);
    expect(panel.querySelector(".ff6-footer")?.textContent).toMatch(/Y edit/);
  });

  it("does not confirm via number-key or C shortcuts", () => {
    let confirmed = 0;
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {
        confirmed += 1;
      },
      onCancel: () => {},
    });
    ctrl.handleKey("2");
    ctrl.handleKey("c");
    expect(confirmed).toBe(0);
    expect(panel.textContent).not.toContain("Slot 1 of 4");
  });

  it("Up/Down do not change the carousel index", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowUp");
    expect(panel.querySelector(".party-carousel-card--focus")?.textContent).toMatch(/All Trades/);
  });

  it("Enter on Custom opens an empty editor", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    openEditor(ctrl);
    expect(panel.textContent).toContain("Slot 1 of 4");
    expect(panel.querySelector(".party-field .pf-value")?.textContent).toBe("Aria");
  });

  it("Y on a preset opens the editor seeded with that roster", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    cycleRight(ctrl); // Shield Wall
    ctrl.handleKey("y");
    expect(panel.textContent).toContain("Slot 1 of 4");
    expect(panel.querySelector(".party-field .pf-value")?.textContent).toBe("Bram");
    confirmSlot(ctrl);
    expect(panel.querySelector(".party-field .pf-value")?.textContent).toBe("Gareth");
  });

  it("Y on Custom opens an empty editor like Enter", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    for (let i = 0; i < 4; i++) cycleRight(ctrl);
    ctrl.handleKey("y");
    expect(panel.textContent).toContain("Slot 1 of 4");
    expect(panel.querySelector(".party-field .pf-value")?.textContent).toBe("Aria");
  });

  it("renders 2×2 idle sprites ordered by formation slot on the center card", () => {
    const panel = makePanel();
    new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    const focus = panel.querySelector(".party-carousel-card--focus")!;
    const names = [...focus.querySelectorAll(".party-carousel-slot-name")].map(
      (el) => el.textContent
    );
    expect(names).toEqual(["Fighter", "Thief", "Mage", "Priest"]);
    const imgs = focus.querySelectorAll<HTMLImageElement>(".party-carousel-grid img");
    expect(imgs).toHaveLength(4);
    expect(imgs[0]!.getAttribute("src")).toMatch(/\/assets\/party\/fighter\/idle\.png$/);
    expect(imgs[1]!.getAttribute("src")).toMatch(/\/assets\/party\/thief\/idle\.png$/);
    expect(imgs[2]!.getAttribute("src")).toMatch(/\/assets\/party\/mage\/idle\.png$/);
    expect(imgs[3]!.getAttribute("src")).toMatch(/\/assets\/party\/priest\/idle\.png$/);
    expect(focus.querySelectorAll(".party-role-pip")).toHaveLength(4);
  });

  it("keeps center-card focus class contract across two cycles", () => {
    const panel = makePanel();
    document.body.appendChild(panel);
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    const before = panel.querySelector(".party-carousel-card--focus")!;
    const beforeClass = before.className;
    cycleRight(ctrl);
    cycleRight(ctrl);
    const after = panel.querySelector(".party-carousel-card--focus")!;
    expect(after.className).toBe(beforeClass);
    expect(after.classList.contains("party-carousel-card--focus")).toBe(true);
    panel.remove();
  });

  it("releaseDirection clears held carousel direction", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    ctrl.handleKey("ArrowRight");
    vi.advanceTimersByTime(SLIDE_MS);
    ctrl.releaseDirection(1);
    // A second press should move again (not treated as OS-repeat of a held key).
    ctrl.handleKey("ArrowRight");
    vi.advanceTimersByTime(SLIDE_MS);
    expect(panel.querySelector(".party-carousel-card--focus")?.textContent).toMatch(/Glass Cannons/);
  });
});

describe("PartyCreationController editor layout", () => {
  it("keeps the active editor above the confirmed roster after several confirms", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    openEditor(ctrl);

    for (let i = 0; i < 3; i++) confirmSlot(ctrl);

    expect(panel.textContent).toContain("Slot 4 of 4");
    expect(panel.textContent).toContain("3 confirmed");

    const editor = panel.querySelector(".party-edit");
    const confirmed = panel.querySelector(".party-confirmed");
    expect(editor).not.toBeNull();
    expect(confirmed).not.toBeNull();

    const position = editor!.compareDocumentPosition(confirmed!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(panel.querySelectorAll(".party-field")).toHaveLength(4);
    expect(panel.querySelector(".party-stats")).not.toBeNull();
    expect(panel.querySelector(".party-hint")).not.toBeNull();
    expect(panel.querySelector(".party-help")).not.toBeNull();
  });

  it("resets panel scroll when advancing to a new slot", () => {
    const panel = makePanel();
    panel.style.height = "200px";
    panel.style.overflow = "auto";
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    openEditor(ctrl);
    panel.scrollTop = 999;
    confirmSlot(ctrl);
    expect(panel.scrollTop).toBe(0);
  });

  it("renders compact field values without inline class descriptions", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    openEditor(ctrl);
    for (let i = 0; i < 3; i++) ctrl.handleKey("ArrowDown");

    const classValue = panel.querySelectorAll(".party-field")[3]?.querySelector(".pf-value");
    expect(classValue?.textContent).toBe("Fighter");
    expect(panel.querySelector(".party-hint")?.textContent).toContain("Frontline warrior");
  });

  it("renders a compact confirmed roster rather than a tall per-line dump", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    openEditor(ctrl);
    for (let i = 0; i < 3; i++) confirmSlot(ctrl);

    const confirmed = panel.querySelector(".party-confirmed");
    expect(confirmed).not.toBeNull();
    expect(confirmed!.querySelectorAll(".party-confirmed-chip")).toHaveLength(3);
  });

  it("shows an idle class sprite in the editor and follows class changes", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    expect(panel.textContent).toContain("All Trades");
    expect(panel.textContent).toContain("Shield Wall");

    openEditor(ctrl);
    const stageImg = panel.querySelector<HTMLImageElement>(".party-sprite-stage img");
    expect(stageImg).not.toBeNull();
    expect(stageImg!.getAttribute("src")).toMatch(/\/assets\/party\/fighter\/idle\.png$/);
    expect(panel.querySelector(".party-sprite-caption")?.textContent).toBe("Fighter");

    for (let i = 0; i < 3; i++) ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowRight"); // Fighter → Mage
    const mageImg = panel.querySelector<HTMLImageElement>(".party-sprite-stage img");
    expect(mageImg!.getAttribute("src")).toMatch(/\/assets\/party\/mage\/idle\.png$/);
    expect(panel.querySelector(".party-sprite-caption")?.textContent).toBe("Mage");
    expect(panel.querySelector(".party-sprite-stage")?.classList.contains("is-focus")).toBe(true);
  });
});
