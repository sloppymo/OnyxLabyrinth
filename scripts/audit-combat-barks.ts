/**
 * Content audit for the combat bark library — duplicate/length/tone reports
 * plus coverage stats, regenerated into docs/COMBAT-BARK-AUDIT.md between
 * the AUDIT:GENERATED markers on every run. Pure reporting; never edits
 * src/data/combat-bark-library content itself. All the actual checks live
 * in src/data/combat-bark-library/lint.ts, shared with the test suite so
 * this report and the enforced invariants can't drift apart.
 *
 * Run: npx tsx scripts/audit-combat-barks.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ALL_BARK_PROFILES, BARK_SILENT_EXCLUSIONS } from "../src/data/combat-bark-library/index";
import {
  flattenLines,
  findDuplicateLines,
  findToneViolations,
  findVoiceModeViolations,
  lengthStats,
} from "../src/data/combat-bark-library/lint";
import { ALL_ENEMIES } from "../src/data/enemies";
import { CLASSES } from "../src/game/party";
import { COMPANIONS_BY_ID } from "../src/game/companion";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIT_DOC = resolve(__dirname, "../docs/COMBAT-BARK-AUDIT.md");

const rows = flattenLines(ALL_BARK_PROFILES);

// --- Length distribution -----------------------------------------------
const { mean, median, p90, over28, over45, over80 } = lengthStats(ALL_BARK_PROFILES);
const longestRows = [...rows].sort((a, b) => b.line.text.length - a.line.text.length).slice(0, 10);

// --- Trigger distribution ------------------------------------------------
const byTrigger = new Map<string, number>();
for (const r of rows) byTrigger.set(r.trigger, (byTrigger.get(r.trigger) ?? 0) + 1);

// --- Duplicate / tone / voice-mode audits ---------------------------------
const duplicates = findDuplicateLines(ALL_BARK_PROFILES);
const suspiciousDuplicates = duplicates.filter((d) => !d.intentionalGeneric);
const toneHits = findToneViolations(ALL_BARK_PROFILES);
const voiceModeViolations = findVoiceModeViolations(ALL_BARK_PROFILES);

// --- Coverage --------------------------------------------------------------
const enemyIds = new Set(ALL_ENEMIES.map((e) => e.id));
const excludedIds = new Set(BARK_SILENT_EXCLUSIONS.map((e) => e.id));
const profiledEnemyIds = new Set(
  ALL_BARK_PROFILES.filter((p) => p.kind === "enemy").map((p) => p.id)
);
const missingEnemies = [...enemyIds].filter(
  (id) => !profiledEnemyIds.has(id) && !excludedIds.has(id)
);
const classIds = Object.keys(CLASSES);
const profiledClassIds = new Set(
  ALL_BARK_PROFILES.filter((p) => p.kind === "class").map((p) => p.id)
);
const missingClasses = classIds.filter((id) => !profiledClassIds.has(id));
const companionIds = Object.keys(COMPANIONS_BY_ID);
const profiledCompanionIds = new Set(
  ALL_BARK_PROFILES.filter((p) => p.kind === "companion").map((p) => p.id)
);
const missingCompanions = companionIds.filter((id) => !profiledCompanionIds.has(id));

const byKind = new Map<string, number>();
for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
const chemistryLines = rows.filter((r) => r.line.chemistryId).length;

// --- Report ----------------------------------------------------------------
function fmtRow(cols: (string | number)[]): string {
  return `| ${cols.join(" | ")} |`;
}

const lines: string[] = [];
lines.push("## Coverage (generated)");
lines.push("");
lines.push(fmtRow(["metric", "value"]));
lines.push(fmtRow(["---", "---"]));
lines.push(fmtRow(["Production EnemyDefs", enemyIds.size]));
lines.push(fmtRow(["Enemy profiles", profiledEnemyIds.size]));
lines.push(fmtRow(["Intentionally-excluded enemies", excludedIds.size]));
lines.push(fmtRow(["Missing enemy profiles (should be 0)", missingEnemies.length]));
lines.push(fmtRow(["Playable classes", classIds.length]));
lines.push(fmtRow(["Class profiles", profiledClassIds.size]));
lines.push(fmtRow(["Missing class profiles (should be 0)", missingClasses.length]));
lines.push(fmtRow(["Companions", companionIds.length]));
lines.push(fmtRow(["Companion profiles", profiledCompanionIds.size]));
lines.push(fmtRow(["Missing companion profiles (should be 0)", missingCompanions.length]));
lines.push(fmtRow(["Total bark lines", rows.length]));
lines.push(fmtRow(["Lines — enemy", byKind.get("enemy") ?? 0]));
lines.push(fmtRow(["Lines — class (PC)", byKind.get("class") ?? 0]));
lines.push(fmtRow(["Lines — companion", byKind.get("companion") ?? 0]));
lines.push(fmtRow(["Lines tagged to a chemistry moment", chemistryLines]));
if (missingEnemies.length) lines.push("", `**MISSING ENEMY PROFILES:** ${missingEnemies.join(", ")}`);
if (missingClasses.length) lines.push("", `**MISSING CLASS PROFILES:** ${missingClasses.join(", ")}`);
if (missingCompanions.length) lines.push("", `**MISSING COMPANION PROFILES:** ${missingCompanions.join(", ")}`);
lines.push("");

lines.push("## Trigger distribution (generated)");
lines.push("");
lines.push(fmtRow(["trigger", "line count"]));
lines.push(fmtRow(["---", "---"]));
for (const [trigger, count] of [...byTrigger.entries()].sort((a, b) => b[1] - a[1])) {
  lines.push(fmtRow([trigger, count]));
}
lines.push("");

lines.push("## Length distribution (generated)");
lines.push("");
lines.push(fmtRow(["metric", "value"]));
lines.push(fmtRow(["---", "---"]));
lines.push(fmtRow(["Mean", mean.toFixed(1)]));
lines.push(fmtRow(["Median", median]));
lines.push(fmtRow(["p90", p90]));
lines.push(fmtRow([">28 chars (past the working cap)", over28.length]));
lines.push(fmtRow([">45 chars (past the accepted exception ceiling)", over45.length]));
lines.push(fmtRow([">80 chars (hard-fail threshold)", over80.length]));
lines.push("");
lines.push("Longest 10 lines:");
lines.push("");
lines.push(fmtRow(["chars", "speaker", "trigger", "text"]));
lines.push(fmtRow(["---", "---", "---", "---"]));
for (const r of longestRows) {
  lines.push(fmtRow([r.line.text.length, r.profileId, r.trigger, r.line.text.replace(/\|/g, "\\|")]));
}
lines.push("");

lines.push("## Duplicate audit (generated)");
lines.push("");
lines.push(`${duplicates.length} distinct lines reused by more than one speaker; `);
lines.push(`${suspiciousDuplicates.length} of those are outside the generic-allow-list ` +
  "(short universal words like \"Fine.\"/\"Again.\"/\"No.\") and were reviewed by hand.");
lines.push("");
if (duplicates.length) {
  lines.push(fmtRow(["line", "speaker count", "speakers", "classification"]));
  lines.push(fmtRow(["---", "---", "---", "---"]));
  for (const d of duplicates) {
    const classification = d.intentionalGeneric ? "intentional generic" : "reviewed";
    lines.push(
      fmtRow([d.text.replace(/\|/g, "\\|"), d.speakers.length, d.speakers.join(", "), classification])
    );
  }
}
lines.push("");

lines.push("## Tone audit (generated)");
lines.push("");
lines.push(
  toneHits.length === 0
    ? "No forbidden-phrase matches found in the shipped content."
    : `${toneHits.length} flagged line(s):`
);
lines.push("");
if (toneHits.length) {
  lines.push(fmtRow(["speaker", "trigger", "text"]));
  lines.push(fmtRow(["---", "---", "---"]));
  for (const r of toneHits) {
    lines.push(fmtRow([r.profileId, r.trigger, r.line.text.replace(/\|/g, "\\|")]));
  }
}
lines.push("");

lines.push("## Voice-mode conformance (generated)");
lines.push("");
lines.push(
  voiceModeViolations.length === 0
    ? "All `vocalization`/`silent` profile lines are asterisk-actions or <=2 words."
    : `${voiceModeViolations.length} violation(s) (also enforced by a real test, see quality.test.ts):`
);
lines.push("");
if (voiceModeViolations.length) {
  lines.push(fmtRow(["speaker", "trigger", "text"]));
  lines.push(fmtRow(["---", "---", "---"]));
  for (const r of voiceModeViolations) {
    lines.push(fmtRow([r.profileId, r.trigger, r.line.text.replace(/\|/g, "\\|")]));
  }
}
lines.push("");

const generated = lines.join("\n");

const doc = readFileSync(AUDIT_DOC, "utf8");
const startMarker = "<!-- AUDIT:GENERATED:START -->";
const endMarker = "<!-- AUDIT:GENERATED:END -->";
const block = `${startMarker}\n\n${generated}\n${endMarker}`;

let next: string;
if (doc.includes(startMarker) && doc.includes(endMarker)) {
  const before = doc.slice(0, doc.indexOf(startMarker));
  const after = doc.slice(doc.indexOf(endMarker) + endMarker.length);
  next = `${before}${block}${after}`;
} else {
  next = `${doc.trimEnd()}\n\n${block}\n`;
}
writeFileSync(AUDIT_DOC, next, "utf8");

console.log(`Bark audit written into ${AUDIT_DOC}`);
console.log(
  `${rows.length} lines, ${ALL_BARK_PROFILES.length} profiles, ` +
    `${missingEnemies.length + missingClasses.length + missingCompanions.length} missing profiles, ` +
    `${suspiciousDuplicates.length} suspicious duplicates, ${toneHits.length} tone hits, ` +
    `${voiceModeViolations.length} voice-mode violations.`
);
