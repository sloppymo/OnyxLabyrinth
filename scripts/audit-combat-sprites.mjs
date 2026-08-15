#!/usr/bin/env node

/**
 * Produce a reviewable inventory of the combat strips that are actually on
 * disk. This is intentionally independent of Vite/import.meta so it can run
 * from CI and from a clean checkout.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const states = ["idle", "attack", "hurt", "death"];
const partyStates = ["idle", "walk", "attack", "attack_ranged", "cast", "hurt", "death"];

function pngSize(file) {
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function strip(file) {
  const size = pngSize(file);
  if (!size) return null;
  return {
    frames: size.height === 100 ? Math.floor(size.width / 100) : 0,
    width: size.width,
    height: size.height,
    valid: size.height === 100 && size.width >= 100 && size.width % 100 === 0,
  };
}

function classify(id) {
  const value = id.toLowerCase();
  if (/slime|puddle|ooze|spawn/.test(value)) return "ooze";
  if (/hellbat|eyeball|moth|fly|bat/.test(value)) return "flying";
  if (/ghost|wraith|revenant|specter|spirit|phantom/.test(value)) return "ghost/wraith";
  if (/warlock|mage|wizard|caster|cantor|acolyte|caller|magus|succubus/.test(value)) return "caster";
  if (/golem|construct|armor|knight|guardian|dummy|sentinel|brute|ironclad|chorister/.test(value)) return "construct/heavy";
  if (/hellhound|werewolf|wolf|beast|viper|hound|demon|orc|minotaur|ogre|blood-monster/.test(value)) return "beast/heavy humanoid";
  if (/skeleton|red-bone|bone/.test(value)) return "undead humanoid";
  return "humanoid/other";
}

function listDirs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function scan(dir, names) {
  return names.map((state) => ({ state, strip: strip(path.join(dir, `${state}.png`)) }));
}

function concerns(id, rows) {
  const concerns = [];
  const missing = rows.filter((row) => !row.strip).map((row) => row.state);
  const invalid = rows.filter((row) => row.strip && !row.strip.valid).map((row) => row.state);
  if (missing.length) concerns.push(`missing ${missing.join(", ")}`);
  if (invalid.length) concerns.push(`invalid geometry ${invalid.join(", ")}`);
  const attack = rows.find((row) => row.state === "attack")?.strip;
  if (attack && attack.frames < 6) concerns.push("short attack strip");
  if (/slime|puddle|ooze/.test(id) && attack && attack.frames >= 6) concerns.push("needs hop/compress motion profile");
  if (/bat|ghost|wraith|eyeball|flame/.test(id)) concerns.push("avoid grounded walk illusion");
  return concerns.length ? concerns.join("; ") : "none observed in strip geometry";
}

function renderEntry(identity, spritePath, rows, style) {
  const details = rows.map(({ state, strip: info }) => {
    if (!info) return `${state}: missing`;
    return `${state}: ${info.frames}f (${info.width}×${info.height})`;
  }).join("; ");
  return `| ${identity} | \`${spritePath}\` | ${details} | ${style} | ${concerns(identity, rows)} |`;
}

const enemyRoot = path.join(root, "public/assets/enemies");
const partyRoot = path.join(root, "public/assets/party");
const enemyEntries = listDirs(enemyRoot).map((id) => {
  const rows = scan(path.join(enemyRoot, id), states);
  return renderEntry(id, `public/assets/enemies/${id}/`, rows, classify(id));
});
const partyEntries = listDirs(partyRoot).map((id) => {
  const rows = scan(path.join(partyRoot, id), partyStates);
  return renderEntry(id, `public/assets/party/${id}/`, rows, `party:${id}`);
});

const json = {
  generatedAt: new Date().toISOString(),
  baseline: "11573958c9a69875317ef952f660ee01dc707420",
  enemyStates: states,
  partyStates,
  enemies: listDirs(enemyRoot).map((id) => ({ id, style: classify(id), path: `public/assets/enemies/${id}/`, strips: Object.fromEntries(scan(path.join(enemyRoot, id), states).map(({ state, strip: info }) => [state, info])) })),
  party: listDirs(partyRoot).map((id) => ({ id, style: `party:${id}`, path: `public/assets/party/${id}/`, strips: Object.fromEntries(scan(path.join(partyRoot, id), partyStates).map(({ state, strip: info }) => [state, info])) })),
};

const markdown = `# Combat sprite inventory — baseline audit\n\nGenerated from the clean integration baseline \`${json.baseline}\`. Frame counts are read from PNG width ÷ 100; the manifest/cache remains authoritative for runtime aliases and playback rates. Motion style is presentation-only and is an audit classification, not gameplay taxonomy.\n\n## Summary\n\n- Enemy sprite directories: ${json.enemies.length}\n- Party sprite directories: ${json.party.length}\n- Required enemy states: ${states.join(", ")}\n- Required party states: idle, walk, attack, hurt, death\n- Optional party states: attack_ranged, cast\n\n## Party\n\n| Identity | Sprite path | Strips | Motion style | Presentation concerns |\n|---|---|---|---|---|\n${partyEntries.join("\n")}\n\n## Enemies and summons\n\n| Identity | Sprite path | Strips | Motion style | Presentation concerns |\n|---|---|---|---|---|\n${enemyEntries.join("\n")}`;

const outDir = path.join(root, "docs/combat");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "2026-08-15-combat-sprite-inventory.json"), `${JSON.stringify(json, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "2026-08-15-combat-sprite-inventory.md"), markdown);
console.log(`Wrote ${json.enemies.length} enemy and ${json.party.length} party identities`);
