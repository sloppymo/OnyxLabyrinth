/**
 * Content-quality invariants for the combat bark library: no empty/malformed
 * lines, a hard length ceiling, voice-mode conformance, and the duplicate/
 * tone diagnostics actually working (not just "the script ran").
 */
import { describe, expect, it } from "vitest";
import { ALL_BARK_PROFILES } from "./index";
import {
  findDuplicateLines,
  findToneViolations,
  findVoiceModeViolations,
  flattenLines,
  lengthStats,
} from "./lint";
import type { CombatBarkProfile } from "./types";

const rows = flattenLines(ALL_BARK_PROFILES);

describe("line hygiene", () => {
  it("has no empty text", () => {
    const empties = rows.filter((r) => r.line.text.trim().length === 0);
    expect(empties).toEqual([]);
  });

  it("has no newlines in any line (no miniature speeches)", () => {
    const withNewlines = rows.filter((r) => r.line.text.includes("\n"));
    expect(withNewlines.map((r) => `${r.profileId}:${r.trigger}`)).toEqual([]);
  });

  it("hard-fails any line over 80 characters", () => {
    const { over80 } = lengthStats(ALL_BARK_PROFILES);
    expect(
      over80.map((r) => `${r.profileId} (${r.line.text.length}): ${r.line.text}`)
    ).toEqual([]);
  });

  it("keeps every line at or under the 45-char accepted-exception ceiling", () => {
    const { over45 } = lengthStats(ALL_BARK_PROFILES);
    expect(
      over45.map((r) => `${r.profileId} (${r.line.text.length}): ${r.line.text}`)
    ).toEqual([]);
  });

  it("every profile id is non-empty with no surrounding whitespace", () => {
    for (const p of ALL_BARK_PROFILES) {
      expect(p.id.trim()).toBe(p.id);
      expect(p.id.length).toBeGreaterThan(0);
    }
  });

  it("every profile has at least one trigger pool with at least one line", () => {
    for (const p of ALL_BARK_PROFILES) {
      const total = Object.values(p.pools).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
      expect(total, `${p.id} has zero lines`).toBeGreaterThan(0);
    }
  });
});

describe("voice-mode conformance", () => {
  it("vocalization/silent profiles stick to asterisk-actions or <=2 words", () => {
    const violations = findVoiceModeViolations(ALL_BARK_PROFILES);
    expect(
      violations.map((v) => `${v.profileId}/${v.trigger}: "${v.line.text}"`)
    ).toEqual([]);
  });

  it("caps total line count for silent profiles (rare contributors, not chatty)", () => {
    const silentProfiles = ALL_BARK_PROFILES.filter((p) => p.voiceMode === "silent");
    expect(silentProfiles.length).toBeGreaterThan(0);
    for (const p of silentProfiles) {
      const total = Object.values(p.pools).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
      expect(total, `${p.id} has ${total} lines, too chatty for "silent"`).toBeLessThanOrEqual(8);
    }
  });
});

describe("diagnostic tooling correctness", () => {
  it("findDuplicateLines detects a real duplicate and ignores unique lines", () => {
    const fixture: CombatBarkProfile[] = [
      {
        id: "test-a",
        displayName: "Test A",
        kind: "enemy",
        voiceMode: "articulate",
        voiceSummary: "fixture",
        pools: { combatStart: [{ text: "Shared line." }, { text: "Unique to A." }] },
      },
      {
        id: "test-b",
        displayName: "Test B",
        kind: "enemy",
        voiceMode: "articulate",
        voiceSummary: "fixture",
        pools: { combatStart: [{ text: "Shared line." }, { text: "Unique to B." }] },
      },
    ];
    const dupes = findDuplicateLines(fixture);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]!.text).toBe("Shared line.");
    expect([...dupes[0]!.speakers].sort()).toEqual(["test-a", "test-b"]);
  });

  it("findDuplicateLines classifies generic-allow-list words as intentional", () => {
    const fixture: CombatBarkProfile[] = [
      {
        id: "test-a",
        displayName: "Test A",
        kind: "enemy",
        voiceMode: "articulate",
        voiceSummary: "fixture",
        pools: { combatStart: [{ text: "Fine." }] },
      },
      {
        id: "test-b",
        displayName: "Test B",
        kind: "enemy",
        voiceMode: "articulate",
        voiceSummary: "fixture",
        pools: { combatStart: [{ text: "Fine." }] },
      },
    ];
    const dupes = findDuplicateLines(fixture);
    expect(dupes[0]!.intentionalGeneric).toBe(true);
  });

  it("findToneViolations matches whole words only, not substrings (no Jesus/sus false positive)", () => {
    const fixture: CombatBarkProfile[] = [
      {
        id: "test-mage",
        displayName: "Test Mage",
        kind: "class",
        voiceMode: "articulate",
        voiceSummary: "fixture",
        pools: { takeHeavyHit: [{ text: "Jesus." }] },
      },
    ];
    expect(findToneViolations(fixture)).toEqual([]);
  });

  it("findToneViolations catches an actual forbidden phrase", () => {
    const fixture: CombatBarkProfile[] = [
      {
        id: "test-cringe",
        displayName: "Test",
        kind: "enemy",
        voiceMode: "articulate",
        voiceSummary: "fixture",
        pools: { rare: [{ text: "Skill issue, honestly." }] },
      },
    ];
    const hits = findToneViolations(fixture);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.profileId).toBe("test-cringe");
  });

  it("the real library has zero tone violations", () => {
    expect(findToneViolations(ALL_BARK_PROFILES)).toEqual([]);
  });

  it("lengthStats computes correct mean/median for a known fixture", () => {
    const fixture: CombatBarkProfile[] = [
      {
        id: "test-a",
        displayName: "Test A",
        kind: "enemy",
        voiceMode: "articulate",
        voiceSummary: "fixture",
        pools: { combatStart: [{ text: "a" }, { text: "abc" }, { text: "abcde" }] },
      },
    ];
    const stats = lengthStats(fixture);
    expect(stats.mean).toBeCloseTo(3, 5);
    expect(stats.median).toBe(3);
  });
});
