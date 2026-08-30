import type { CardTrialSimConfig } from "../../../src/game/card-trial/sim/experiment.ts";
import type { FightDefinition } from "../../../src/game/card-trial/sim/definition.ts";

const dummy: FightDefinition["enemies"][number] = {
  id: "dummy",
  name: "Training Dummy",
  maxHp: 18,
  visualRow: "front",
  cycle: [
    { kind: "row", row: "front", damage: 8 },
    { kind: "row", row: "back", damage: 6 },
  ],
  slot: "slow",
  order: 0,
};

const damageDecks: FightDefinition["decks"] = {
  "rat-king": ["nip", "nip", "brace", "tide"],
  "old-man": ["the-staff-speaks", "the-staff-speaks", "the-staff-speaks", "pale-ward"],
};

const guardDecks: FightDefinition["decks"] = {
  "rat-king": ["brace", "brace", "brace", "brace"],
  "old-man": ["pale-ward", "pale-ward", "pale-ward", "pale-ward"],
};

const config: CardTrialSimConfig = {
  id: "staff-kicker",
  name: "Staff Test vs Guard-only",
  notes: "Paired smoke: damage decks vs Guard-only decks on the same dummy and seeds.",
  baseline: {
    id: "staff-test",
    name: "Staff Test",
    decks: damageDecks,
    enemies: [dummy],
  },
  variant: {
    id: "staff-test-guard",
    name: "Guard only",
    decks: guardDecks,
    enemies: [dummy],
  },
};

export default config;
export { config };
