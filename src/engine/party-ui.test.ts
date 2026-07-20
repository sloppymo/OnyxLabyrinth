/**
 * Party creation UI — layout must keep the active editor usable as the
 * confirmed roster grows (slots 4–6 used to push fields below the fold).
 */
import { describe, it, expect } from "vitest";
import { PartyCreationController } from "./party-ui";

function makePanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = "combat-panel";
  return panel;
}

function openEditor(ctrl: PartyCreationController): void {
  // Choice screen → Create Your Own
  ctrl.handleKey("ArrowDown");
  ctrl.handleKey("Enter");
}

function confirmSlot(ctrl: PartyCreationController): void {
  ctrl.handleKey("Enter");
}

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

    // Confirm slots 1–4 so we are editing slot 5 with a long confirmed list.
    for (let i = 0; i < 4; i++) confirmSlot(ctrl);

    expect(panel.textContent).toContain("Slot 5 of 6");
    expect(panel.textContent).toContain("4 confirmed");

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
    for (let i = 0; i < 4; i++) confirmSlot(ctrl);

    const confirmed = panel.querySelector(".party-confirmed");
    expect(confirmed).not.toBeNull();
    expect(confirmed!.querySelectorAll(".party-confirmed-chip")).toHaveLength(4);
  });
});

