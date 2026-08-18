import { describe, expect, it } from "vitest";
import { playerMenuFromElement } from "./visible-menu";

describe("playerMenuFromElement", () => {
  it("reads title, selected row, detail, and footer from an FF6 window", () => {
    document.body.innerHTML = `
      <div class="ff6-window">
        <div class="ff6-menu-title">THE DESCENT</div>
        <div class="ff6-selection-list">
          <div class="ff6-menu-item selected" data-index="0">
            <span class="ff6-sel-label">New Game</span>
          </div>
          <div class="ff6-menu-item" data-index="1">
            <span class="ff6-sel-label">Arena</span>
            <span class="ff6-sel-detail">[A]</span>
          </div>
        </div>
        <div class="ff6-footer">D-pad navigate · A select</div>
      </div>
    `;
    const menu = playerMenuFromElement(document.body);
    expect(menu).toEqual({
      title: "THE DESCENT",
      entries: [{ label: "New Game" }, { label: "Arena", detail: "[A]" }],
      selectedIndex: 0,
      footer: "D-pad navigate · A select",
    });
    expect(menu?.selectedIndex).toBe(0);
  });

  it("returns null when no window is mounted", () => {
    document.body.innerHTML = `<div id="empty"></div>`;
    expect(playerMenuFromElement(document.body)).toBeNull();
  });
});
