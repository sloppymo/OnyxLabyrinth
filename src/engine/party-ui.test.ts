/**
 * Party creation UI — layout must keep the active editor usable as the
 * confirmed roster grows (later slots used to push fields below the fold).
 */
import { describe, it, expect } from "vitest";
import { PartyCreationController } from "./party-ui";

function makePanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = "combat-panel";
  return panel;
}

/** Clear the post-open key swallow before driving the controller in tests. */
function clearJustOpened(ctrl: PartyCreationController): void {
  ctrl.handleKey("ArrowUp");
}

function openEditor(ctrl: PartyCreationController): void {
  clearJustOpened(ctrl);
  // Choice screen: 4 presets then Create Your Own — move to last row.
  for (let i = 0; i < 4; i++) ctrl.handleKey("ArrowDown");
  ctrl.handleKey("Enter");
}

function confirmSlot(ctrl: PartyCreationController): void {
  ctrl.handleKey("Enter");
}

describe("PartyCreationController open guard", () => {
  it("ignores the first Enter so a prologue confirm cannot auto-pick Default Party", () => {
    let confirmed = 0;
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {
        confirmed += 1;
      },
      onCancel: () => {},
    });
    expect(panel.textContent).toMatch(/All Trades|Default Party|Create/i);
    ctrl.handleKey("Enter"); // swallowed — still on choice
    expect(confirmed).toBe(0);
    expect(panel.textContent).not.toContain("Slot 1 of 4");
    ctrl.handleKey("Enter"); // now selects All Trades (choiceIndex 0)
    expect(confirmed).toBe(1);
  });

  it("ignores the first Escape so open cannot instantly cancel", () => {
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
    expect(cancelled).toBe(0);
    ctrl.handleKey("Escape");
    expect(cancelled).toBe(1);
  });
});

describe("PartyCreationController editor layout", () => {
  it("keeps the active editor above the confirmed roster after several confirms", () => {
    const panel = makePanel();
    panel.classList.add("party-create-host");
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    openEditor(ctrl);

    // Confirm slots 1–3 so we are editing slot 4 (the last slot) with a
    // confirmed list already showing.
    for (let i = 0; i < 3; i++) confirmSlot(ctrl);

    expect(panel.textContent).toContain("Slot 4 of 4");
    expect(panel.textContent).toContain("3 confirmed");

    const editor = panel.querySelector(".party-edit");
    const confirmed = panel.querySelector(".party-confirmed");
    expect(editor).not.toBeNull();
    expect(confirmed).not.toBeNull();

    // Confirmed chips sit below the editor (reference only).
    const position = editor!.compareDocumentPosition(confirmed!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // All four edit fields remain in the DOM (not clipped away by layout logic).
    expect(panel.querySelectorAll(".party-field")).toHaveLength(4);
    expect(panel.querySelector(".party-stats")).not.toBeNull();
    expect(panel.querySelector(".party-hint")).not.toBeNull();
    expect(panel.querySelector(".party-help")).not.toBeNull();
  });

  it("resets panel scroll when advancing to a new slot", () => {
    const panel = makePanel();
    panel.classList.add("party-create-host");
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
    // Move cursor to CLASS field.
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

  it("shows an idle class sprite on the choice screen and in the editor", () => {
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: () => {},
      onCancel: () => {},
    });
    // Choice: All Trades preset sprites (Aria Fighter, Coda Thief, …).
    expect(panel.textContent).toContain("All Trades");
    expect(panel.textContent).toContain("Shield Wall");
    const choiceImgs = panel.querySelectorAll<HTMLImageElement>(".party-choice-sprites img");
    expect(choiceImgs.length).toBe(4);
    expect(choiceImgs[0]!.getAttribute("src")).toMatch(/\/assets\/party\/fighter\/idle\.png$/);
    expect(choiceImgs[1]!.getAttribute("src")).toMatch(/\/assets\/party\/thief\/idle\.png$/);

    openEditor(ctrl);
    const stageImg = panel.querySelector<HTMLImageElement>(".party-sprite-stage img");
    expect(stageImg).not.toBeNull();
    expect(stageImg!.getAttribute("src")).toMatch(/\/assets\/party\/fighter\/idle\.png$/);
    expect(panel.querySelector(".party-sprite-caption")?.textContent).toBe("Fighter");

    // Cycle class → Mage; preview should follow.
    for (let i = 0; i < 3; i++) ctrl.handleKey("ArrowDown");
    ctrl.handleKey("ArrowRight"); // Fighter → Mage
    const mageImg = panel.querySelector<HTMLImageElement>(".party-sprite-stage img");
    expect(mageImg!.getAttribute("src")).toMatch(/\/assets\/party\/mage\/idle\.png$/);
    expect(panel.querySelector(".party-sprite-caption")?.textContent).toBe("Mage");
    expect(panel.querySelector(".party-sprite-stage")?.classList.contains("is-focus")).toBe(true);
  });

  it("confirms a non-balanced preset via number key", () => {
    let party: { name: string; class: string }[] | null = null;
    const panel = makePanel();
    const ctrl = new PartyCreationController({
      panel,
      onConfirm: (p) => {
        party = p.map((c) => ({ name: c.name, class: c.class }));
      },
      onCancel: () => {},
    });
    clearJustOpened(ctrl);
    ctrl.handleKey("2"); // Shield Wall
    expect(party).not.toBeNull();
    expect(party!.map((c) => c.name)).toEqual(["Bram", "Gareth", "Helga", "Mira"]);
    expect(party!.map((c) => c.class)).toEqual([
      "Fighter",
      "Crusader",
      "Halberdier",
      "Priest",
    ]);
  });
});

