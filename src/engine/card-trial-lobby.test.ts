import { describe, expect, it, vi } from "vitest";
import { CardTrialLobbyController } from "./card-trial-lobby";

vi.mock("./audio", () => ({
  audio: { uiForMenuKey: () => {} },
}));

const nops = {
  onFight: () => {},
  onTriangle: () => {},
  onExit: () => {},
};

describe("CardTrialLobbyController QA summary", () => {
  it("does not render telemetry in the player-facing lobby", () => {
    const panel = document.createElement("div");
    new CardTrialLobbyController({
      panel,
      debug: false,
      summary: "# Card Trial run\nDecision samples: 17",
      ...nops,
    });
    expect(panel.querySelector(".ct-summary")).toBeNull();
  });

  it("renders telemetry when ?debug=1 is on", () => {
    const panel = document.createElement("div");
    new CardTrialLobbyController({
      panel,
      debug: true,
      summary: "# Card Trial run\nDecision samples: 17",
      ...nops,
    });
    expect(panel.querySelector(".ct-summary")?.textContent).toContain("Decision samples: 17");
  });
});
