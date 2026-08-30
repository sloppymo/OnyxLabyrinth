import { describe, expect, it } from "vitest";
import { createAdversarialTriangle, playerView } from "../game/card-trial/engine";
import type { CardTrialWindowsInput } from "./card-trial-view";
import {
  buildCardTrialUiRecipe,
  cardOutcomeSummary,
  conciseUnavailableReason,
} from "./card-trial-ui-model";

function handInput(overrides: Partial<CardTrialWindowsInput> = {}): CardTrialWindowsInput {
  const view = playerView(createAdversarialTriangle());
  return {
    view,
    phase: "hand",
    cursor: 0,
    targetIds: [],
    targetCursor: 0,
    flash: null,
    result: null,
    ...overrides,
  };
}

describe("buildCardTrialUiRecipe", () => {
  it("maps the exact initiative queue and current actor without a second order", () => {
    const input = handInput();
    const recipe = buildCardTrialUiRecipe(input);
    expect(recipe.initiative.map((tile) => tile.id)).toEqual(input.view.queue.map((actor) => actor.id));
    expect(recipe.initiative.map((tile) => tile.acting)).toEqual(
      input.view.queue.map((actor) => actor.acting)
    );
    expect(recipe.activeActorId).toBe(input.view.queue.find((actor) => actor.acting)?.id);
    expect(recipe.turnLabel).toContain(recipe.activeActorName);
  });

  it("uses bespoke portraits only for Rat King and Old Man", () => {
    const recipe = buildCardTrialUiRecipe(handInput());
    const heroes = recipe.initiative.filter((tile) => tile.kind === "hero");
    expect(heroes.find((tile) => tile.id === "rat-king")?.portraitUrl).toContain(
      "portrait-rat-king.png"
    );
    expect(heroes.find((tile) => tile.id === "old-man")?.portraitUrl).toContain(
      "portrait-old-man.png"
    );
    for (const enemy of recipe.initiative.filter((tile) => tile.kind === "enemy")) {
      expect(enemy.portraitIsStrip).toBe(true);
      expect(enemy.portraitUrl).toMatch(/\/assets\/enemies\/.+\/idle\.png$/);
    }
  });

  it("keeps hand cursor focus distinct from an armed card", () => {
    const focused = buildCardTrialUiRecipe(handInput({ cursor: 1 }));
    expect(focused.focusedControl).toEqual({ kind: "card", index: 1 });
    expect(focused.selectedCardIndex).toBe(1);
    expect(focused.armedCardIndex).toBeNull();
    expect(focused.cards[1]).toMatchObject({ focused: true, armed: false });

    const targetIds = focused.actors.filter((actor) => actor.kind === "enemy").map((actor) => actor.id);
    const armed = buildCardTrialUiRecipe(
      handInput({ phase: "target", cursor: 1, targetIds, targetCursor: 1 })
    );
    expect(armed.selectedCardIndex).toBeNull();
    expect(armed.armedCardIndex).toBe(1);
    expect(armed.cards[1]).toMatchObject({ focused: false, armed: true });
  });

  it("marks only live legal targets and the cursor target as selected", () => {
    const input = handInput();
    const living = input.view.enemies.filter((enemy) => !enemy.dead).map((enemy) => enemy.id);
    const recipe = buildCardTrialUiRecipe({
      ...input,
      phase: "target",
      targetIds: living,
      targetCursor: 1,
    });
    expect(recipe.legalTargetIds).toEqual(living);
    expect(recipe.selectedTargetId).toBe(living[1]);
    expect(recipe.actors.filter((actor) => actor.legalTarget).map((actor) => actor.id)).toEqual(living);
    expect(recipe.actors.filter((actor) => actor.selectedTarget).map((actor) => actor.id)).toEqual([
      living[1],
    ]);
    expect(recipe.actors.find((actor) => actor.id === "rat-king")?.plateVisible).toBe(true);
    expect(recipe.actors.find((actor) => actor.id === living[1])?.plateVisible).toBe(true);
    expect(recipe.actors.filter((actor) => actor.legalTarget && !actor.selectedTarget).every((actor) => !actor.plateVisible)).toBe(
      true
    );
  });

  it("shows only the acting decision actor's plate while idle", () => {
    const recipe = buildCardTrialUiRecipe(handInput());
    expect(recipe.actors.filter((actor) => actor.plateVisible).map((actor) => actor.id)).toEqual(["rat-king"]);
    expect(recipe.actors.filter((actor) => actor.id !== "rat-king").every((actor) => !actor.plateVisible)).toBe(true);
  });

  it("retains dead/row semantics while presentation can hide dead anchors", () => {
    const trial = createAdversarialTriangle();
    trial.enemies[0]!.hp = 0;
    trial.heroes["rat-king"].row = "back";
    const input = handInput({ view: playerView(trial) });
    const recipe = buildCardTrialUiRecipe(input);
    expect(recipe.actors.find((actor) => actor.id === trial.enemies[0]!.id)?.dead).toBe(true);
    expect(recipe.actors.find((actor) => actor.id === "rat-king")?.row).toBe("back");
  });

  it("exposes Details-held state without changing the initiative or target model", () => {
    const plain = buildCardTrialUiRecipe(handInput());
    const details = buildCardTrialUiRecipe(handInput({ detailsHeld: true }));
    expect(plain.detailsHeld).toBe(false);
    expect(details.detailsHeld).toBe(true);
    expect(details.initiative).toEqual(plain.initiative);
    expect(details.legalTargetIds).toEqual(plain.legalTargetIds);
  });

  it("makes 0-energy state explicit and reports concise unavailable reasons", () => {
    const trial = createAdversarialTriangle();
    trial.heroes["rat-king"].energy = 0;
    const recipe = buildCardTrialUiRecipe(handInput({ view: playerView(trial) }));
    expect(recipe.energy).toBe(0);
    expect(recipe.decisionInstruction).toBe("Ending turn");
    expect(recipe.handInstruction).toBe("No energy remaining");
    expect(recipe.cards.every((card) => card.unavailable)).toBe(true);
    expect(recipe.cards.every((card) => card.unavailableReason?.startsWith("Need "))).toBe(true);
    expect(conciseUnavailableReason("Not enough energy (costs 2)", 2)).toBe("Need 2 energy");
  });

  it("keeps the default decision cue distinct from the hand cue", () => {
    const recipe = buildCardTrialUiRecipe(handInput());
    expect(recipe.decisionInstruction).toBe("Choose an action");
    expect(recipe.handInstruction).toBe("");
  });
});

describe("cardOutcomeSummary", () => {
  it("omits Sever the Thread's consume clause when no second living enemy exists", () => {
    const trial = createAdversarialTriangle();
    const cleaver = trial.enemies.find((enemy) => enemy.id === "cleaver")!;
    cleaver.hp = 0;
    trial.opened = {
      enemyId: "ash",
      createdBy: "old-man",
      createdAtSlot: 0,
      movedBeforeConsume: false,
    };
    const view = playerView(trial);
    const ash = view.enemies.find((enemy) => enemy.id === "ash")!;
    const cut = { ...view.hand[0]!, defId: "sever-the-thread" as const, name: "Sever the Thread" };
    expect(cardOutcomeSummary(cut, view, ash)).toBe("Deal 5");
  });

  it("shows Sever the Thread's consume clause only with a legal second enemy", () => {
    const trial = createAdversarialTriangle();
    const view = playerView(trial);
    view.openedEnemyId = "cleaver";
    const cleaver = view.enemies.find((enemy) => enemy.id === "cleaver")!;
    const cut = { ...view.hand[0]!, defId: "sever-the-thread" as const, name: "Sever the Thread" };
    expect(cardOutcomeSummary(cut, view, cleaver)).toBe(
      "Deal 5 · Second enemy 5 · Consume Opened"
    );
  });

  it("derives guard and rider numbers from the rules layer", () => {
    const trial = createAdversarialTriangle();
    trial.heroes["rat-king"].row = "front";
    const view = playerView(trial);
    const cleaver = view.enemies.find((enemy) => enemy.id === "cleaver")!;
    const brace = { ...view.hand[0]!, defId: "brace" as const, name: "Brace" };
    expect(cardOutcomeSummary(brace, view, null)).toBe("Gain 6 Barrier");
    const heap = { ...view.hand[0]!, defId: "king-of-the-heap" as const, name: "King of the Heap" };
    expect(cardOutcomeSummary(heap, view, cleaver)).toBe("Deal 10 · Gain 8 Barrier · Crown target");
    view.openedEnemyId = cleaver.id;
    const fullStop = { ...view.hand[0]!, defId: "full-stop" as const, name: "Full Stop" };
    expect(cardOutcomeSummary(fullStop, view, cleaver)).toBe("Deal 16 · Consume Opened");
  });

  it("derives Reckoning Ward's consumed Barrier from the rules layer", () => {
    const trial = createAdversarialTriangle();
    const view = playerView(trial);
    const cleaver = view.enemies.find((enemy) => enemy.id === "cleaver")!;
    const ward = { ...view.hand[0]!, defId: "reckoning-ward" as const, name: "Reckoning Ward" };
    expect(cardOutcomeSummary(ward, view, cleaver)).toBe("Gain 4 Barrier");
    view.openedEnemyId = cleaver.id;
    expect(cardOutcomeSummary(ward, view, cleaver)).toBe(
      "Gain 10 Barrier · Move Back · Consume Opened"
    );
  });

  it("uses the selected card, live row, and target Opened state", () => {
    const trial = createAdversarialTriangle();
    trial.heroes["rat-king"].row = "front";
    const view = playerView(trial);
    const tide = { ...view.hand[0]!, defId: "tide" as const, name: "Tide" };
    expect(cardOutcomeSummary(tide, view, view.enemies[0]!)).toBe("Deal 8");

    view.openedEnemyId = view.enemies[0]!.id;
    const consume = {
      ...view.hand[0]!,
      defId: "swarm-the-wound" as const,
      name: "Swarm the Wound",
    };
    expect(cardOutcomeSummary(consume, view, view.enemies[0]!)).toContain("Deal 9");
    expect(cardOutcomeSummary(consume, view, view.enemies[0]!)).toContain("Consume Opened");
  });

  it("describes Old Man's Hush and Omen cards without inventing damage", () => {
    const trial = createAdversarialTriangle();
    const view = playerView(trial);
    const target = view.enemies.find((enemy) => enemy.id === "cleaver")!;
    const hush = { ...view.hand[0]!, defId: "the-staff-speaks" as const, name: "The Staff Speaks" };
    const omen = { ...view.hand[0]!, defId: "the-threshold" as const, name: "The Threshold" };
    expect(cardOutcomeSummary(hush, view, target)).toBe("Deal 6 · Hush next intent");
    expect(cardOutcomeSummary(omen, view, target)).toBe("Arm Omen · strike before target's next intent");
  });

  it("forecasts Kill · no Open when an opener's base hit would kill", () => {
    const trial = createAdversarialTriangle();
    const view = playerView(trial);
    const target = { ...view.enemies.find((enemy) => enemy.id === "cleaver")!, hp: 4 };
    const open = { ...view.hand[0]!, defId: "open-the-rank" as const, name: "Open the Rank", opens: true };
    expect(cardOutcomeSummary(open, view, target)).toBe("Deal 4 · Kill · no Open");
  });

  it("forecasts Consume even when the base hit would kill", () => {
    const trial = createAdversarialTriangle();
    const view = playerView(trial);
    const target = { ...view.enemies.find((enemy) => enemy.id === "cleaver")!, hp: 4 };
    view.openedEnemyId = target.id;
    const swarm = { ...view.hand[0]!, defId: "swarm-the-wound" as const, name: "Swarm the Wound" };
    expect(cardOutcomeSummary(swarm, view, target)).toContain("Consume Opened");
    expect(cardOutcomeSummary(swarm, view, target)).toContain("Deal 9");
  });
});
