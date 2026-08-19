import { describe, expect, it } from "vitest";

import {
  createVignetteMemory,
  markVignetteShown,
  renderBeat,
  resetVignetteMemory,
  resolveTimedOut,
  selectVignette,
} from "./encounter-vignettes";
import {
  AUTHORED_REPEAT_SHOW_CHANCE,
  DEFAULT_FIRST_SHOW_CHANCE,
  DEFAULT_REPEAT_SHOW_CHANCE,
} from "./encounter-vignettes";
import {
  DEFAULT_VIGNETTE,
  VIGNETTES_BY_FAMILY,
  VIGNETTES_BY_FORMATION,
  type TimedOut,
} from "../data/encounter-vignettes";
import type { Character, CharacterClass } from "./party";

function mkChar(name: string, cls: CharacterClass, hp = 10): Character {
  return {
    id: name.toLowerCase(),
    name,
    race: "Human",
    alignment: "Neutral",
    class: cls,
    level: 1,
    xp: 0,
    stats: { str: 10, int: 10, pie: 10, vit: 10, agi: 10, lck: 10 },
    hp,
    sp: 5,
    maxHp: 10,
    maxSp: 5,
    formationSlot: 0,
    status: [],
    knownSpellIds: [],
    perkIds: [],
  } as unknown as Character;
}

const party = [
  mkChar("Aldric", "Fighter"),
  mkChar("Mira", "Mage"),
  mkChar("Tobbe", "Thief"),
  mkChar("Sera", "Priest"),
];

const rngZero = () => 0;

describe("renderBeat", () => {
  it("returns narration verbatim when no speaker is keyed", () => {
    expect(renderBeat({ text: "The corridor is quiet." }, party, rngZero)).toBe(
      "The corridor is quiet."
    );
  });

  it("prefers the first matching class, best-first", () => {
    const line = renderBeat(
      { speaker: ["Thief", "Fighter"], text: '"After you."' },
      party,
      rngZero
    );
    expect(line).toBe('Tobbe: "After you."');
  });

  it("skips dead preferred speakers", () => {
    const wounded = [mkChar("Tobbe", "Thief", 0), mkChar("Aldric", "Fighter")];
    const line = renderBeat(
      { speaker: ["Thief", "Fighter"], text: '"After you."' },
      wounded,
      rngZero
    );
    expect(line).toBe('Aldric: "After you."');
  });

  it("falls back to any living member when no preferred class is present", () => {
    const line = renderBeat(
      { speaker: ["Crusader"], text: '"Hold the line."' },
      party,
      rngZero
    );
    expect(line).toBe('Aldric: "Hold the line."');
  });

  it("degrades to narration when the whole party is down", () => {
    const downed = party.map((c) => ({ ...c, hp: 0 }));
    const line = renderBeat({ speaker: ["Mage"], text: '"..."' }, downed, rngZero);
    expect(line).toBe('"..."');
  });
});

describe("selectVignette", () => {
  it("shows a full authored intro on first meeting, with the out prompt appended", () => {
    const memory = createVignetteMemory();
    const picked = selectVignette(
      { id: "f1-orc-leap", family: "orc-pack" },
      party,
      memory,
      rngZero
    )!;
    expect(picked.firstTime).toBe(true);
    expect(picked.out).toBe(VIGNETTES_BY_FORMATION["f1-orc-leap"]!.out);
    const intro = VIGNETTES_BY_FORMATION["f1-orc-leap"]!.intros[0]!;
    expect(picked.pages.length).toBe(intro.length + 1);
    expect(picked.pages[picked.pages.length - 1]).toBe(
      VIGNETTES_BY_FORMATION["f1-orc-leap"]!.out!.prompt
    );
  });

  it("switches to the repeat pool after the vignette has been shown", () => {
    const memory = createVignetteMemory();
    markVignetteShown(memory, { id: "f1-orc-leap", family: "orc-pack" });
    const picked = selectVignette(
      { id: "f1-orc-leap", family: "orc-pack" },
      party,
      memory,
      rngZero
    )!;
    expect(picked.firstTime).toBe(false);
    // Repeat beats are single-page; out prompt still appended.
    expect(picked.pages.length).toBe(2);
  });

  it("rotates repeat variants by showing count", () => {
    const memory = createVignetteMemory();
    const entry = { id: "f1-orc-leap", family: "orc-pack" };
    markVignetteShown(memory, entry);
    const first = selectVignette(entry, party, memory, rngZero)!;
    markVignetteShown(memory, entry);
    const second = selectVignette(entry, party, memory, rngZero)!;
    expect(first.pages[0]).not.toBe(second.pages[0]);
  });

  it("falls back to the default pool for unauthored formations", () => {
    const memory = createVignetteMemory();
    const picked = selectVignette(
      { id: "f9-nonexistent", family: "no-such-family" },
      party,
      memory,
      rngZero
    )!;
    expect(picked.out).toBeUndefined();
    const defaultIntro = DEFAULT_VIGNETTE.intros[0]!;
    expect(picked.pages.length).toBe(defaultIntro.length);
  });

  it("tracks formations independently and resets with the memory", () => {
    const memory = createVignetteMemory();
    markVignetteShown(memory, { id: "f1-orc-leap", family: "orc-pack" });
    expect(
      selectVignette({ id: "f1-acid-burrow", family: "acid-anchor" }, party, memory, rngZero)!
        .firstTime
    ).toBe(true);
    resetVignetteMemory(memory);
    expect(
      selectVignette({ id: "f1-orc-leap", family: "orc-pack" }, party, memory, rngZero)!
        .firstTime
    ).toBe(true);
  });
});

describe("show-frequency (no tollbooth)", () => {
  const rngHigh = () => 0.99;

  it("always shows an authored formation's first meeting", () => {
    const memory = createVignetteMemory();
    const picked = selectVignette(
      { id: "f1-solo-guardian", family: "solo-guardian" },
      party,
      memory,
      rngHigh
    );
    expect(picked).not.toBeNull();
  });

  it("always shows authored repeats that carry a timed out", () => {
    const memory = createVignetteMemory();
    const entry = { id: "f1-orc-leap", family: "orc-pack" };
    markVignetteShown(memory, entry);
    expect(selectVignette(entry, party, memory, rngHigh)).not.toBeNull();
  });

  it("rolls authored repeats without an out against their show chance", () => {
    const memory = createVignetteMemory();
    const entry = { id: "f1-solo-guardian", family: "solo-guardian" };
    markVignetteShown(memory, entry);
    expect(selectVignette(entry, party, memory, rngHigh)).toBeNull();
    expect(
      selectVignette(entry, party, memory, () => AUTHORED_REPEAT_SHOW_CHANCE - 0.01)
    ).not.toBeNull();
  });

  it("often skips unauthored formations, first time and on repeats", () => {
    const memory = createVignetteMemory();
    const entry = { id: "f9-nonexistent", family: "no-such-family" };
    expect(selectVignette(entry, party, memory, rngHigh)).toBeNull();
    expect(
      selectVignette(entry, party, memory, () => DEFAULT_FIRST_SHOW_CHANCE - 0.01)
    ).not.toBeNull();
    markVignetteShown(memory, entry);
    expect(
      selectVignette(entry, party, memory, () => DEFAULT_FIRST_SHOW_CHANCE - 0.01)
    ).toBeNull();
    expect(
      selectVignette(entry, party, memory, () => DEFAULT_REPEAT_SHOW_CHANCE - 0.01)
    ).not.toBeNull();
  });

  it("a skipped first meeting still gets its full intro later", () => {
    const memory = createVignetteMemory();
    const entry = { id: "f9-nonexistent", family: "no-such-family" };
    // Skipped: caller does not mark the vignette as shown.
    expect(selectVignette(entry, party, memory, rngHigh)).toBeNull();
    const later = selectVignette(entry, party, memory, rngZero)!;
    expect(later.firstTime).toBe(true);
  });
});

describe("resolveTimedOut", () => {
  const out: TimedOut = {
    prompt: "Choose.",
    timerMs: 4000,
    perfectWindowMs: 1500,
    options: [
      {
        label: "Wave",
        result: "avoid",
        goldReward: 10,
        resultBeats: [{ text: "They wave back." }],
        perfect: { text: "They also tip you.", gold: 20 },
      },
      {
        label: "Scowl",
        result: "fight",
        resultBeats: [{ text: "They take it personally." }],
      },
    ],
    timeoutBeats: [{ text: "You dithered." }],
  };

  it("avoids the fight on a correct pick and grants the base reward", () => {
    const res = resolveTimedOut(out, "0", 3000, party, rngZero);
    expect(res.fight).toBe(false);
    expect(res.perfect).toBe(false);
    expect(res.gold).toBe(10);
    expect(res.pages).toEqual(["They wave back."]);
  });

  it("out-rewards fighting on a perfect (fast) pick", () => {
    const res = resolveTimedOut(out, "0", 1200, party, rngZero);
    expect(res.perfect).toBe(true);
    expect(res.gold).toBe(30);
    expect(res.pages).toEqual(["They wave back.", "They also tip you."]);
  });

  it("starts the fight with the punchline on a wrong pick", () => {
    const res = resolveTimedOut(out, "1", 100, party, rngZero);
    expect(res.fight).toBe(true);
    expect(res.gold).toBe(0);
    expect(res.pages).toEqual(["They take it personally."]);
  });

  it("treats a timeout as a fight with the timeout beats", () => {
    const res = resolveTimedOut(out, "timeout", 4000, party, rngZero);
    expect(res.fight).toBe(true);
    expect(res.pages).toEqual(["You dithered."]);
  });

  it("treats garbage values defensively as a timeout", () => {
    const res = resolveTimedOut(out, "999", 100, party, rngZero);
    expect(res.fight).toBe(true);
    expect(res.pages).toEqual(["You dithered."]);
  });
});

describe("authored content sanity", () => {
  it("every authored vignette has at least one intro and one repeat", () => {
    for (const [id, def] of Object.entries(VIGNETTES_BY_FORMATION)) {
      expect(def.intros.length, `${id} intros`).toBeGreaterThan(0);
      expect(def.repeats.length, `${id} repeats`).toBeGreaterThan(0);
    }
    expect(DEFAULT_VIGNETTE.intros.length).toBeGreaterThan(0);
    expect(DEFAULT_VIGNETTE.repeats.length).toBeGreaterThan(0);
  });

  it("every timed out has a timeout punchline and at least one avoid option", () => {
    for (const [id, def] of Object.entries(VIGNETTES_BY_FORMATION)) {
      if (!def.out) continue;
      expect(def.out.timeoutBeats.length, `${id} timeout`).toBeGreaterThan(0);
      expect(
        def.out.options.some((o) => o.result === "avoid"),
        `${id} avoid option`
      ).toBe(true);
      expect(def.out.perfectWindowMs).toBeLessThan(def.out.timerMs);
    }
  });
});

describe("Phase 1b.1 — family vignette fallback", () => {
  it("armored-line family vignette resolves for formations without a formation-level vignette", () => {
    const memory = createVignetteMemory();
    const picked = selectVignette(
      { id: "f2-armored-archer", family: "armored-line" },
      party,
      memory,
      rngZero
    )!;
    expect(picked.firstTime).toBe(true);
    const intro = VIGNETTES_BY_FAMILY["armored-line"]!.intros[0]!;
    expect(picked.pages.length).toBe(intro.length);
  });

  it("f2-orc-squad inherits the orc-warband family vignette (not armored-line)", () => {
    const memory = createVignetteMemory();
    const picked = selectVignette(
      { id: "f2-orc-squad", family: "orc-warband" },
      party,
      memory,
      rngZero
    )!;
    expect(picked.firstTime).toBe(true);
    // Same intro beats as the orc-warband family def
    const familyIntro = VIGNETTES_BY_FAMILY["orc-warband"]!.intros[0]!;
    expect(picked.pages.length).toBe(familyIntro.length);
  });

  it("family vignette is authored (always shows first meeting)", () => {
    const memory = createVignetteMemory();
    // rngHigh (0.99) would skip an unauthored first meeting (chance 0.4),
    // but an authored one always shows.
    const picked = selectVignette(
      { id: "f2-armored-orc-archer", family: "armored-line" },
      party,
      memory,
      () => 0.99
    );
    expect(picked).not.toBeNull();
  });

  it("formation vignette takes priority over family vignette", () => {
    // f2-lab-keepers has a formation vignette; even if it shared a family,
    // the formation def would win. Verify the resolution order directly.
    const memory = createVignetteMemory();
    const picked = selectVignette(
      { id: "f2-lab-keepers", family: "some-other-family" },
      party,
      memory,
      rngZero
    )!;
    const formationIntro = VIGNETTES_BY_FORMATION["f2-lab-keepers"]!.intros[0]!;
    expect(picked.pages.length).toBe(formationIntro.length);
  });
});

describe("Phase 1b.1 — new Floor 1 vignettes name the mechanic", () => {
  // The 6 silent [chem] vignettes must surface the existing mechanic in banter.
  // We verify each formation resolves to an authored intro (not the default pool).
  const silentChemFormations = [
    "f1-ogre-toss",
    "f1-living-shield",
    "f1-hunting-pack",
    "f1-spawn-bomb",
    "f1-rune-overload",
    "f1-guarded-bomb",
  ] as const;

  it.each(silentChemFormations)("%s has an authored vignette with intros and repeats", (id) => {
    const def = VIGNETTES_BY_FORMATION[id];
    expect(def, `${id} registered`).toBeDefined();
    expect(def!.intros.length).toBeGreaterThan(0);
    expect(def!.repeats.length).toBeGreaterThan(0);
  });

  it.each(silentChemFormations)("%s resolves to its authored intro on first meeting", (id) => {
    const memory = createVignetteMemory();
    const picked = selectVignette({ id, family: id }, party, memory, rngZero)!;
    expect(picked.firstTime).toBe(true);
    const intro = VIGNETTES_BY_FORMATION[id]!.intros[0]!;
    expect(picked.pages.length).toBe(intro.length);
  });

  const t0Formations = [
    "f1-wraith-pincer",
    "f1-gaze-slime",
    "f1-flame-forge",
    "f1-ghostfire-duet",
  ] as const;

  it.each(t0Formations)("%s has an authored vignette with intros and repeats", (id) => {
    const def = VIGNETTES_BY_FORMATION[id];
    expect(def, `${id} registered`).toBeDefined();
    expect(def!.intros.length).toBeGreaterThan(0);
    expect(def!.repeats.length).toBeGreaterThan(0);
  });
});

describe("Phase 1b.1 — Floor 2 identity vignettes", () => {
  const f2Formations = ["f2-lab-keepers", "f2-displacer-lab"] as const;

  it.each(f2Formations)("%s has an authored vignette with intros and repeats", (id) => {
    const def = VIGNETTES_BY_FORMATION[id];
    expect(def, `${id} registered`).toBeDefined();
    expect(def!.intros.length).toBeGreaterThan(0);
    expect(def!.repeats.length).toBeGreaterThan(0);
  });

  it("f2-lab-keepers intro names the assistant→experiment relationship", () => {
    const def = VIGNETTES_BY_FORMATION["f2-lab-keepers"]!;
    const introText = def.intros.map((b) => b.map((x) => x.text).join(" ")).join(" ");
    expect(introText).toMatch(/syringe|heal|experiment|assistant/i);
  });

  it("f2-displacer-lab intro names the blink mechanic", () => {
    const def = VIGNETTES_BY_FORMATION["f2-displacer-lab"]!;
    const introText = def.intros.map((b) => b.map((x) => x.text).join(" ")).join(" ");
    expect(introText).toMatch(/blink|displacer/i);
  });

  it("armored-line family intro names the rush-the-archers hook", () => {
    const def = VIGNETTES_BY_FAMILY["armored-line"]!;
    const introText = def.intros.map((b) => b.map((x) => x.text).join(" ")).join(" ");
    expect(introText).toMatch(/archer|rush|bow|arrow/i);
  });
});
