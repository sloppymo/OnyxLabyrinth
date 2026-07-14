#!/usr/bin/env npx tsx
/**
 * Floor authoring CLI — dump, validate, export campaign maps as JSON/ASCII.
 *
 * Usage:
 *   npx tsx scripts/floor-tool.ts validate [--floor N]
 *   npx tsx scripts/floor-tool.ts dump --floor N [--json|--ascii]
 *   npx tsx scripts/floor-tool.ts export-all --out tools/floor-data
 */

import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { FLOORS } from "../src/data/floors";
import { getFloors } from "../src/game/floor-registry";
import { floorDefToMap, parseFloorMapJSON, mapToFloorDef } from "../src/game/floor-map";
import { floorToAscii } from "../src/game/floor-ascii";
import { validateFloorDef, hasValidationErrors } from "../src/game/floor-validate";

const args = process.argv.slice(2);
const cmd = args[0];

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function opt(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function floorById(id: number) {
  const f = getFloors().find((x) => x.id === id);
  if (!f) throw new Error(`No floor with id ${id}`);
  return f;
}

function runValidate(): void {
  const idStr = opt("floor");
  // Validate the full runtime list (campaign + content packs) so cross-floor
  // links (stairs, teleporters) resolve against everything that ships.
  const floors = idStr ? [floorById(Number(idStr))] : [...getFloors()];
  let anyError = false;
  for (const floor of floors) {
    const issues = validateFloorDef(floor, { floors: getFloors() });
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    console.log(`\n=== Floor ${floor.id}: ${floor.name} ===`);
    if (!issues.length) {
      console.log("OK (no issues)");
      continue;
    }
    for (const i of errors) console.log(`ERROR [${i.code}] ${i.message}`);
    for (const i of warnings) console.log(`WARN  [${i.code}] ${i.message}`);
    if (errors.length) anyError = true;
  }
  if (anyError) process.exit(1);
}

function runDump(): void {
  const id = Number(opt("floor"));
  if (!Number.isInteger(id)) {
    console.error("dump requires --floor N");
    process.exit(1);
  }
  const floor = floorById(id);
  if (flag("json")) {
    console.log(JSON.stringify(floorDefToMap(floor), null, 2));
  } else {
    console.log(floorToAscii(floor));
  }
}

function runExportAll(): void {
  const outDir = opt("out") ?? "tools/floor-data";
  mkdirSync(outDir, { recursive: true });
  for (const floor of FLOORS) {
    const map = floorDefToMap(floor);
    const base = `floor-${floor.id}`;
    writeFileSync(join(outDir, `${base}.json`), JSON.stringify(map, null, 2));
    writeFileSync(join(outDir, `${base}.txt`), floorToAscii(floor));
    console.log(`Wrote ${base}.json and ${base}.txt`);
  }
  console.log(`Exported ${FLOORS.length} floors to ${outDir}`);
}

function runCheckImport(): void {
  const file = opt("file");
  if (!file) {
    console.error("check requires --file path/to/map.json");
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const map = parseFloorMapJSON(raw);
  const issues = validateFloorDef(mapToFloorDef(map), { floors: getFloors() });
  for (const i of issues) {
    console.log(`${i.severity.toUpperCase()} [${i.code}] ${i.message}`);
  }
  process.exit(hasValidationErrors(issues) ? 1 : 0);
}

async function main(): Promise<void> {
  switch (cmd) {
    case "validate":
      runValidate();
      break;
    case "dump":
      runDump();
      break;
    case "export-all":
      runExportAll();
      break;
    case "check":
      runCheckImport();
      break;
    default:
      console.log(`OnyxLabyrinth floor-tool

Commands:
  validate [--floor N]     Validate campaign floor(s)
  dump --floor N           ASCII map (default) or --json
  export-all [--out dir]   Write JSON + ASCII for all floors
  check --file map.json    Validate an editor export
`);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
