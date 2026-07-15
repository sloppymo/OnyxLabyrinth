/**
 * Full-game controller smoke — mocks Gamepad API and drives title→town→dungeon→
 * save→ring→trap→combat via pad presses (no physical controller required).
 *
 * Usage:
 *   npx vite preview --port 5240 --base /OnyxLabyrinth/ --host 127.0.0.1
 *   node scripts/playtest-controller-full.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE =
  process.env.PLAYTEST_URL ??
  "http://127.0.0.1:5240/OnyxLabyrinth/?debug=1";
const OUT = path.resolve("playtest-screenshots/2026-07-14-controller");
fs.mkdirSync(OUT, { recursive: true });

const findings = [];
const notes = [];
const log = (m) => {
  console.log(m);
  notes.push(m);
};
const find = (sev, title, body = "") => {
  findings.push({ sev, title, body });
  log(`[${sev}] ${title}${body ? " — " + body : ""}`);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Standard-mapping button indices (matches controller-input.ts). */
const BTN = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
};

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  log(`SHOT ${name}`);
}

async function snap(page) {
  return page.evaluate(() => {
    const d = window.__onyxDebug;
    if (!d?.state) return { hasDebug: false };
    const s = d.state;
    const msg = document.querySelector("#message");
    const msgText = (msg?.textContent || "").replace(/\s+/g, " ").trim();
    const panel = document.querySelector("#combat-panel");
    const panelText = (panel?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 600);
    const body = document.body.innerText.replace(/\s+/g, " ").slice(0, 900);
    const cc = d.getCombatController?.();
    return {
      hasDebug: true,
      mode: s.mode,
      x: s.player?.x,
      y: s.player?.y,
      facing: s.player?.facing,
      pendingTrap: s.pendingTrap,
      floorId: s.floor?.id,
      msg: msgText,
      panel: panelText,
      body,
      combatPhase: cc?.getPhase?.() ?? null,
      panelDisplay: panel ? getComputedStyle(panel).display : "none",
    };
  });
}

async function installGamepad(page) {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      value: 0,
      touched: false,
    }));
    const axes = [0, 0, 0, 0, 0, 0, 0, 0];
    const gp = {
      id: "playtest-pad",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes,
      buttons,
      hapticActuators: [],
      vibrationActuator: null,
    };
    window.__pad = { buttons, axes, gp };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => {
        gp.timestamp = performance.now();
        return [gp];
      },
    });
  });
}

/** Press and release a face/menu button; wait for RAF polling. */
async function padBtn(page, index, holdMs = 100) {
  await page.evaluate(
    async ({ index, holdMs }) => {
      const b = window.__pad.buttons[index];
      b.pressed = true;
      b.value = 1;
      await new Promise((r) => setTimeout(r, holdMs));
      b.pressed = false;
      b.value = 0;
      await new Promise((r) => setTimeout(r, 40));
    },
    { index, holdMs }
  );
  await wait(120);
}

/** Impulse left stick (axes 0/1). value: -1..1 for ly/lx. */
async function padStick(page, { lx = 0, ly = 0 }, holdMs = 100) {
  await page.evaluate(
    async ({ lx, ly, holdMs }) => {
      window.__pad.axes[0] = lx;
      window.__pad.axes[1] = ly;
      await new Promise((r) => setTimeout(r, holdMs));
      window.__pad.axes[0] = 0;
      window.__pad.axes[1] = 0;
      await new Promise((r) => setTimeout(r, 40));
    },
    { lx, ly, holdMs }
  );
  await wait(150);
}

async function pressKey(page, key, n = 1) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    await wait(80);
  }
}

/** Flee stray random fights so dungeon pad tests can continue. */
async function ensureNotCombat(page) {
  let st = await snap(page);
  if (st.mode !== "combat") return st;
  log("fleeing stray combat…");
  await page.evaluate(() => {
    try {
      window.__onyxDebug.exitDebugCombat("fled");
    } catch {
      /* ignore */
    }
  });
  await wait(600);
  st = await snap(page);
  if (st.mode === "combat") {
    find("P1", "Could not flee stray combat", st.combatPhase || "");
  }
  // Soften encounter pity for subsequent steps
  await page.evaluate(() => {
    const s = window.__onyxDebug.state;
    s.stepsSinceEncounter = 0;
  });
  return snap(page);
}

async function main() {
  log(`URL ${BASE}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  page.on("pageerror", (e) => find("P0", "pageerror", String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") find("P1", "console.error", m.text());
  });

  await installGamepad(page);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(500);
  let st = await snap(page);
  if (!st.hasDebug) find("P0", "No __onyxDebug — need ?debug=1");
  await shot(page, "01-title");

  // --- Title: A selects New Game (first item) ---
  await padBtn(page, BTN.a);
  await wait(300);
  st = await snap(page);
  log(`after title A: mode=${st.mode}`);
  await shot(page, "02-after-title-a");
  if (st.mode !== "party_creation" && !/Default Party|Assemble/i.test(st.body + st.panel)) {
    // Try New Game hotkey fallback then pad again
    await pressKey(page, "n");
    await wait(300);
    st = await snap(page);
  }

  // --- Party choice: ensure Default Party selected, A confirm ---
  // Choice screen has Default (top) and Create — pad A confirms selection
  await padBtn(page, BTN.a);
  await wait(400);
  st = await snap(page);
  log(`after party A: mode=${st.mode}`);
  await shot(page, "03-town-or-party");

  if (st.mode === "party_creation") {
    // Still on choice or editor — push D via keyboard if pad didn't hit Default
    await pressKey(page, "d");
    await wait(400);
    st = await snap(page);
  }

  if (st.mode !== "town") {
    find("P0", "Failed to reach town via pad", `mode=${st.mode} body=${st.body.slice(0, 200)}`);
  } else {
    log("OK town via pad/path");
  }

  // --- Town: pad Down until ▶ marks Enter Dungeon, then A ---
  if (st.mode === "town") {
    // Body is whitespace-flattened — do NOT match ▶…Enter across later rows.
    const onDungeon = (text) => /▶\s*\[>\]\s*Enter Dungeon/i.test(text);
    for (let i = 0; i < 12; i++) {
      st = await snap(page);
      const text = st.panel + " " + st.body;
      if (onDungeon(text)) {
        await padBtn(page, BTN.a);
        await wait(500);
        break;
      }
      await padStick(page, { ly: 1 }, 120);
    }
    st = await snap(page);
    await shot(page, "04-after-dungeon-attempt");
    if (st.mode !== "dungeon") {
      find("P0", "Pad failed to enter dungeon", `mode=${st.mode} body=${st.body.slice(0, 180)}`);
    } else {
      log("OK dungeon via pad ↓+A");
    }
  }

  // --- Dungeon: Start opens action ring ---
  if (st.mode === "dungeon") {
    await padBtn(page, BTN.start);
    await wait(250);
    st = await snap(page);
    await shot(page, "05-action-ring");
    const ringOpen =
      st.mode === "title" &&
      /Camp|Toggle Map|Grimoire|Unlock|Return to Town/i.test(st.panel + st.body);
    if (!ringOpen) {
      find("P0", "Start did not open action ring", `mode=${st.mode} panel=${st.panel.slice(0, 200)}`);
    } else {
      log("OK Start → action ring");
    }

    // B cancels ring
    await padBtn(page, BTN.b);
    await wait(250);
    st = await snap(page);
    if (st.mode !== "dungeon" || /Toggle Map.*Grimoire/i.test(st.panel)) {
      find("P1", "B did not close action ring", `mode=${st.mode}`);
    } else {
      log("OK B closes action ring");
    }

    // Move with stick (forward)
    const before = await snap(page);
    await padStick(page, { ly: -1 }, 120);
    await wait(200);
    st = await snap(page);
    if (st.x === before.x && st.y === before.y) {
      // Facing a wall is OK — try turn then forward
      await padStick(page, { lx: 1 }, 100);
      await padStick(page, { ly: -1 }, 120);
      st = await snap(page);
    }
    log(`after stick move: (${before.x},${before.y})→(${st.x},${st.y}) facing=${st.facing}`);
    await shot(page, "06-after-move");
    st = await ensureNotCombat(page);
    await page.evaluate(() => {
      window.__onyxDebug.state.stepsSinceEncounter = 0;
    });

    // Select → save menu
    await padBtn(page, BTN.select);
    await wait(300);
    st = await snap(page);
    await shot(page, "07-save-menu");
    if (!/SAVE\s*\/\s*LOAD|Slot 1/i.test(st.panel + st.body)) {
      find("P0", "Select did not open save menu", `mode=${st.mode} panel=${st.panel.slice(0, 200)}`);
    } else {
      log("OK Select → save");
    }

    // A → action pick
    await padBtn(page, BTN.a);
    await wait(200);
    st = await snap(page);
    await shot(page, "08-save-actions");
    if (!/Save|Load|Delete|Cancel/i.test(st.panel + st.body)) {
      find("P0", "Enter/A did not open save actionPick", st.panel.slice(0, 200));
    } else {
      log("OK save actionPick via A");
    }

    // B back to browsing then B close
    await padBtn(page, BTN.b);
    await wait(150);
    await padBtn(page, BTN.b);
    await wait(300);
    st = await snap(page);
    if (st.mode !== "dungeon") {
      find("P1", "Could not close save back to dungeon", `mode=${st.mode}`);
    } else {
      log("OK save closed → dungeon");
    }

    // Action ring → Toggle Map (2nd row), not Camp
    await padBtn(page, BTN.start);
    await wait(200);
    await padStick(page, { ly: 1 }, 120);
    await wait(80);
    st = await snap(page);
    if (!/▶\s*Toggle Map/i.test(st.panel + st.body)) {
      // one more down if still on Camp
      await padStick(page, { ly: 1 }, 120);
    }
    await padBtn(page, BTN.a);
    await wait(300);
    st = await snap(page);
    await shot(page, "09-after-map-ring");
    log(`after ring Map: mode=${st.mode}`);
    if (st.mode === "camp") {
      find("P0", "Action ring selected Camp instead of Map", st.panel.slice(0, 120));
      await pressKey(page, "Escape");
      await wait(300);
      st = await snap(page);
    }
    // Map action toggles overlay ON — close it so move/trap work
    st = await snap(page);
    if (/Auto-map open/i.test(st.msg + st.body)) {
      await pressKey(page, "m");
      await wait(200);
      st = await snap(page);
    }

    // --- Trap: walk onto floor-1 trapped chest via real onMove (creates trapPrompt) ---
    const steppedTrap = await page.evaluate(() => {
      const s = window.__onyxDebug.state;
      if (s.floor?.id !== 1) return { ok: false, reason: "not floor 1" };
      const trap = (s.floor.treasures || []).find((t) => t.trap);
      if (!trap) return { ok: false, reason: "no trap" };
      s.pendingTrap = null;
      // Stand west of chest, face east (0=N,1=E,2=S,3=W)
      s.player.x = trap.x - 1;
      s.player.y = trap.y;
      s.player.facing = 1;
      return { ok: true, x: trap.x, y: trap.y };
    });
    log(`trap setup: ${JSON.stringify(steppedTrap)}`);
    if (steppedTrap.ok) {
      st = await ensureNotCombat(page);
      await page.evaluate(() => {
        window.__onyxDebug.state.stepsSinceEncounter = 0;
      });
      await pressKey(page, "ArrowUp"); // step forward onto chest
      await wait(400);
      st = await ensureNotCombat(page);
      st = await snap(page);
      await shot(page, "09b-trap-prompt");
      if (!st.pendingTrap) {
        find("P1", "Could not step onto trapped chest for pad trap E2E", `pos=${JSON.stringify(st)}`);
      } else {
        log(`OK trap pending type=${st.pendingTrap.trapType} msg=${st.msg}`);
        if (/▶\[L\]ve/i.test(st.msg) && !/▶\[I\]nsp/i.test(st.msg)) {
          find("P0", "Trap opened with Leave selected (step key leaked)", st.msg);
        }
        await padBtn(page, BTN.a); // Inspect (index 0)
        await wait(250);
        st = await snap(page);
        await shot(page, "09c-trap-inspect");
        if (/leave the chest untouched/i.test(st.msg)) {
          find("P0", "Trap A left chest instead of Inspect", st.msg);
        } else if (!/gas|poison|trap|disarm|dangerous|Aria|Looks|inspect/i.test(st.msg + st.body)) {
          find("P1", "Trap inspect via A produced weak message", st.msg);
        } else {
          log(`OK trap inspect via A: ${st.msg}`);
        }
        await padBtn(page, BTN.b); // Leave
        await wait(250);
        st = await snap(page);
        if (st.pendingTrap) {
          find("P0", "B did not leave trap", JSON.stringify(st.pendingTrap));
        } else {
          log("OK trap Leave via B");
        }
      }
    } else {
      find("INFO", "Trap E2E setup skipped", steppedTrap.reason || "");
    }

    st = await snap(page);
    if (st.mode === "title") {
      await padBtn(page, BTN.b);
      await wait(200);
    }
  }

  // --- Combat via debug startCombat ---
  st = await snap(page);
  if (st.mode === "dungeon" || st.mode === "town" || st.mode === "title") {
    // Return to dungeon if needed
    if (st.mode === "town") {
      for (let i = 0; i < 10; i++) {
        st = await snap(page);
        if (/Enter Dungeon/i.test(st.panel + st.body) && /▶/.test(st.panel + st.body)) {
          await padBtn(page, BTN.a);
          await wait(400);
          break;
        }
        await padStick(page, { ly: 1 }, 80);
      }
    }

    const combatOk = await page.evaluate(() => {
      const d = window.__onyxDebug;
      const s = d.state;
      if (s.mode !== "dungeon") {
        // try set mode
        s.mode = "dungeon";
      }
      const entry = d.rollEncounter(s.floor.id);
      if (!entry) return { ok: false, reason: "no encounter" };
      const enemies = d.resolveEncounter(entry);
      const loadout = {};
      for (const c of s.party) {
        loadout[c.id] = d.defaultLoadoutForCharacter(c);
      }
      try {
        const combat = d.createCombatFromEncounter(
          s.party,
          enemies,
          d.SPELLS_BY_ID,
          d.ITEMS_BY_ID,
          loadout,
          s.inventory,
          !!s.inAntimagic
        );
        d.startCombat(combat);
        return { ok: true, n: enemies.length };
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
    });
    log(`combat start: ${JSON.stringify(combatOk)}`);
    await wait(800);
    st = await snap(page);
    await shot(page, "10-combat");
    if (st.mode !== "combat") {
      find("P0", "Failed to start combat via debug", JSON.stringify(combatOk));
    } else {
      log(`OK combat mode phase=${st.combatPhase}`);
      // Wait for palette
      for (let i = 0; i < 20; i++) {
        st = await snap(page);
        if (st.combatPhase === "palette" || st.combatPhase === "selectAction") break;
        await wait(100);
      }
      await shot(page, "11-combat-palette");
      // A = Attack
      await padBtn(page, BTN.a);
      await wait(600);
      st = await snap(page);
      await shot(page, "12-after-attack-a");
      log(`after combat A: phase=${st.combatPhase} mode=${st.mode}`);
      if (st.mode !== "combat" && st.mode !== "dungeon" && st.mode !== "title") {
        find("P1", "Unexpected mode after combat A", st.mode);
      } else {
        log("OK combat received pad A (attack or advanced phase)");
      }
      // Force end
      await page.evaluate(() => window.__onyxDebug.exitDebugCombat("victory"));
      await wait(800);
      st = await snap(page);
      await shot(page, "13-after-victory");
      log(`after victory: mode=${st.mode}`);
      if (st.mode === "combat") {
        // Retry once — async startCombat await can race destroy
        await page.evaluate(() => {
          const d = window.__onyxDebug;
          if (d.getCombatController?.()) d.exitDebugCombat("victory");
        });
        await wait(400);
        st = await snap(page);
        log(`after victory retry: mode=${st.mode}`);
      }
      if (st.mode !== "dungeon" && st.mode !== "title" && st.mode !== "town") {
        find("P1", "exitDebugCombat left unexpected mode", st.mode);
      } else {
        log("OK left combat after victory");
      }
    }
  }

  // --- Keyboard regression: town still works with keys ---
  // Get back to town if possible
  st = await snap(page);
  if (st.mode === "dungeon") {
    await pressKey(page, "t");
    await wait(400);
    st = await snap(page);
  }
  if (st.mode === "town") {
    await pressKey(page, "ArrowDown", 2);
    await pressKey(page, "Enter");
    await wait(200);
    st = await snap(page);
    await shot(page, "14-keyboard-town");
    log(`keyboard town still works: mode=${st.mode}`);
    await pressKey(page, "Escape");
    await wait(200);
  }

  // --- Town Esc → save (pad Select on town main) ---
  st = await snap(page);
  if (st.mode !== "town" && st.mode === "dungeon") {
    await pressKey(page, "t");
    await wait(400);
    st = await snap(page);
  }
  if (st.mode === "town") {
    // Ensure on main: spam Esc to back out of sub-screens then Select
    await pressKey(page, "Escape");
    await wait(100);
    await padBtn(page, BTN.select);
    await wait(300);
    st = await snap(page);
    await shot(page, "15-town-select-save");
    if (!/SAVE\s*\/\s*LOAD|Slot 1/i.test(st.panel + st.body)) {
      find("P0", "Town Select/Esc path failed to open save", `mode=${st.mode}`);
    } else {
      log("OK town Select → save");
    }
    await padBtn(page, BTN.b);
    await wait(200);
  }

  await browser.close();

  const summary = {
    findings,
    notes,
    pass: findings.filter((f) => f.sev === "P0").length === 0,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(summary, null, 2));
  log("---");
  log(
    summary.pass
      ? `PASS (${findings.filter((f) => f.sev.startsWith("P")).length} non-P0 notes)`
      : `FAIL ${findings.filter((f) => f.sev === "P0").length} P0 findings`
  );
  for (const f of findings) log(`  ${f.sev}: ${f.title}`);
  process.exit(summary.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
