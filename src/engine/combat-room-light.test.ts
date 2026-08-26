import { describe, expect, it } from "vitest";
import type { CombatState } from "../game/combat-types";
import {
  CARD_TRIAL_SCONCE_X,
  CARD_TRIAL_TORCH_SIDE,
  contactShadowPlacement,
  normalizeCombatStageOpts,
  resolveRoomLightEnabled,
  roomKeyLightForActor,
  roomLightRecipeOrNull,
  shouldApplyRoomLight,
  type RoomKeyLightInput,
} from "./combat-room-light";

const base = (over: Partial<RoomKeyLightInput> = {}): RoomKeyLightInput => ({
  x: 400,
  y: 300,
  drawSize: 100,
  opacity: 1,
  visible: true,
  torchSide: "left",
  sconceX: CARD_TRIAL_SCONCE_X,
  ...over,
});

describe("Card Trial room key-light recipe", () => {
  it("uses the left sconce and keeps warm/cool geometry deterministic", () => {
    const light = roomKeyLightForActor(base());
    expect(CARD_TRIAL_TORCH_SIDE).toBe("left");
    expect(light.warmRect).toMatchObject({ x: 350, y: 250, width: 50, height: 100 });
    expect(light.coolRect).toMatchObject({ x: 400, y: 250, width: 50, height: 100 });
    expect(light.rimEdge).toMatchObject({ x: 350, y: 250, width: 1, height: 100 });
    expect(light.warmRect.alpha).toBeCloseTo(0.2);
    expect(light.coolRect.alpha).toBeCloseTo(0.14);
    expect(light.rimEdge.alpha).toBeCloseTo(0.3);
  });

  it("flips the lit halves and rim for a right-side torch", () => {
    const light = roomKeyLightForActor(base({ torchSide: "right" }));
    expect(light.warmRect.x).toBe(400);
    expect(light.coolRect.x).toBe(350);
    expect(light.rimEdge.x).toBe(449);
  });

  it("moves and widens the contact shadow away from the sconce", () => {
    const light = roomKeyLightForActor(base({ x: 400, sconceX: 100 }));
    expect(light.shadowDx).toBeCloseTo(8);
    expect(contactShadowPlacement(200, 40, light)).toEqual({ x: 208, width: 50 });
    expect(contactShadowPlacement(10, 40, null)).toEqual({ x: 10, width: 40 });
  });

  it("keeps overlay strengths constant and carries fade in recipe alpha", () => {
    const light = roomKeyLightForActor(base({ opacity: 0.5 }));
    expect(light.alpha).toBe(0.5);
    expect(light.warmRect.alpha).toBeCloseTo(0.2);
    expect(light.coolRect.alpha).toBeCloseTo(0.14);
    expect(roomKeyLightForActor(base({ visible: false })).visible).toBe(false);
    expect(roomKeyLightForActor(base({ opacity: 0 })).alpha).toBe(0);
  });
});

describe("room-light gate and option parser", () => {
  const campaign = { partyFormation: undefined } as CombatState;
  const trial = { partyFormation: { kind: "card-trial-rows", rowsByActorId: {} } } as CombatState;

  it("only opens for Card Trial rows when enabled", () => {
    expect(shouldApplyRoomLight(campaign, true)).toBe(false);
    expect(shouldApplyRoomLight(trial, true)).toBe(true);
    expect(shouldApplyRoomLight(trial, false)).toBe(false);
    expect(roomLightRecipeOrNull(campaign, true, base())).toBeNull();
    expect(roomLightRecipeOrNull(trial, true, base())).not.toBeNull();
  });

  it("parses the kill switch without reading a browser global", () => {
    expect(resolveRoomLightEnabled("")).toBe(true);
    expect(resolveRoomLightEnabled("?roomLight=0")).toBe(false);
    expect(resolveRoomLightEnabled("roomLight=0")).toBe(false);
    const canvasOpts: { kind: "canvas"; roomLightEnabled?: boolean } = { kind: "canvas" };
    expect(normalizeCombatStageOpts(canvasOpts, "?roomLight=0").roomLightEnabled).toBe(false);
    expect(normalizeCombatStageOpts({ ...canvasOpts, roomLightEnabled: true }, "?roomLight=0").roomLightEnabled).toBe(true);
  });
});
