/**
 * Visual design pass — pure screenshot capture, no assertions/findings.
 *
 * Walks the game through a cold-open path (title -> prologue -> party
 * creation -> town -> dungeon -> automap), forces combat scenarios (trash
 * fight, spell cast, melee hit, victory, boss, wipe/game-over, ending) and
 * an Arena session, saving every frame under playtest-screenshots/ for a
 * human (or the same agent, later, with the Read tool) to actually look at.
 *
 * Run: node scripts/playtests/visual-pass-2026-07-27.mjs
 * (assumes `npx vite preview --port 5176 --base /OnyxLabyrinth/` is already running)
 */
import {
  launch,
  wait,
  press,
  snap,
  waitForIdle,
  jumpTo,
  ensureOutDir,
  shot as libShot,
} from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/2026-07-27-visual-pass");

const log = (...a) => console.log(...a);
const manifest = [];

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });

async function shot(name, note = "") {
  const p = await libShot(page, OUT, name);
  manifest.push({ name, note });
  log(`  [shot] ${name}${note ? " — " + note : ""}`);
  return p;
}

async function freshBoot() {
  await page.goto(URL, { waitUntil: "networkidle" });
  await wait(400);
}

const jump = async (opts) => {
  await page.evaluate((o) => window.__onyxDebug.jumpTo(o), opts);
  await waitForIdle(page, 5000);
  return snap(page);
};

/**
 * exitDebugCombat() fires leaveCombat() (dissolve -> mode flip -> reveal) as
 * a detached promise, and computeIdle() never looks at combatTransitionActive
 * (it only tracks combatController, which leaveCombat nulls out *before* the
 * mode flip) — so waitForIdle can report idle a beat before route actually
 * leaves "combat". Poll route directly instead of trusting isIdle() here.
 */
async function exitCombatAndSettle(result, maxWaitMs = 6000) {
  await page.evaluate((r) => window.__onyxDebug.exitDebugCombat(r), result);
  const deadline = Date.now() + maxWaitMs;
  let st = await snap(page);
  while (st.route === "combat" && Date.now() < deadline) {
    await wait(150);
    st = await snap(page);
  }
  await waitForIdle(page, 3000);
  return snap(page);
}

/** Force a combat encounter (optionally requiring a boss) via the real startCombat() path. */
async function forceEncounter({ allowBoss = false } = {}) {
  return page.evaluate(async (allowBoss) => {
    const d = window.__onyxDebug;
    const s = d.state;
    let resolved = null;
    for (let attempts = 0; attempts < 300; attempts++) {
      const entry = d.rollEncounter(s.floor.id);
      if (!entry) return { ok: false };
      const r = d.resolveEncounter(entry);
      if (r.length === 0) continue;
      const hasBoss = r.some((e) => e.enemy.isBoss);
      if (hasBoss !== allowBoss) continue;
      resolved = r;
      break;
    }
    if (!resolved) return { ok: false };
    const combat = d.createCombatFromEncounter(
      s.party,
      resolved,
      d.SPELLS_BY_ID,
      d.ITEMS_BY_ID,
      s.equipment,
      s.inventory,
      s.inAntimagic,
      s.activeCharIds
    );
    await d.startCombat(combat);
    return { ok: true, enemyCount: resolved.length };
  }, allowBoss);
}

function section(name) {
  log(`\n=== ${name} ===`);
}

try {
  // =========================================================================
  section("1. Cold open — title / prologue / party creation");
  await freshBoot();
  let st = await snap(page);
  await shot("01-title.png", "boot title screen");

  await press(page, "n"); // New Game -> prologue
  await wait(600);
  await shot("02-prologue-early.png", "prologue, early beat");
  await wait(3500);
  await shot("03-prologue-mid.png", "prologue, mid beat (typewriter progressed)");

  // Two-stage skip: Escape may only advance one beat.
  for (let i = 0; i < 6; i++) {
    st = await snap(page);
    if (st.route === "party_creation") break;
    await press(page, "Escape");
    await wait(400);
  }
  st = await snap(page);
  await shot("04-party-choice.png", "party creation choice screen");

  // First key after open is swallowed by justOpened — burn it, then open the editor.
  await press(page, "ArrowDown");
  await wait(150);
  await press(page, "c"); // custom editor
  await wait(300);
  await shot("05-party-editor.png", "six-slot custom party editor");
  await press(page, "Escape"); // back to choice
  await wait(300);
  await press(page, "d"); // default party -> town
  await waitForIdle(page, 3000);
  st = await snap(page);
  await shot("06-town-main.png", `town hub main menu (route=${st.route})`);

  // One sub-screen: Shop.
  await press(page, "$");
  await wait(400);
  await shot("07-town-shop.png", "town shop screen");
  await press(page, "Escape");
  await wait(300);
} catch (e) {
  log("Section 1 threw:", e);
}

// ============================================================================
try {
  section("2. Dungeon corridor walk + automap");
  await freshBoot();
  await jump({ floorId: 1, x: 5, y: 9, facing: 0, autosave: false, partyLevel: 8 });
  await shot("08-corridor-entry-hall.png", "facing north from entry hall spawn");

  await press(page, "ArrowUp", 2, 250);
  await waitForIdle(page, 2000);
  await shot("09-corridor-straight.png", "straight vertical corridor mid-walk");

  await press(page, "ArrowUp", 1, 250);
  await waitForIdle(page, 2000);
  await shot("10-corridor-crossroads.png", "crossroads (5,5): wall ahead, openings left/right");

  await press(page, "ArrowRight", 1, 250); // face east
  await waitForIdle(page, 1000);
  await shot("11-corridor-turned-east.png", "turned to face the east gallery corridor");

  await press(page, "ArrowUp", 2, 250);
  await waitForIdle(page, 2000);
  await shot("12-corridor-flooded-gallery.png", "flooded east gallery, water tile underfoot");

  await press(page, "ArrowUp", 1, 250);
  await waitForIdle(page, 2000);
  await shot("13-corridor-darkness.png", "darkness zone tile, visibility should drop");

  await press(page, "m");
  await wait(400);
  await shot("14-automap.png", "automap overlay (M)");
  await press(page, "m");
  await wait(300);

  await press(page, "g");
  await wait(400);
  await shot("15-grimoire.png", "dungeon grimoire / utility spell menu (G)");
  await press(page, "Escape");
  await wait(300);

  await press(page, "Escape");
  await wait(400);
  await shot("16-save-menu.png", "save/load menu (Esc from dungeon)");
  await press(page, "Escape");
  await wait(300);
} catch (e) {
  log("Section 2 threw:", e);
}

// ============================================================================
try {
  section("3. Combat — trash fight, spell cast, melee hit, victory");
  await freshBoot();
  await jump({ floorId: 1, x: 5, y: 7, facing: 0, autosave: false, partyLevel: 10 });

  const res = await forceEncounter();
  if (!res.ok) {
    log("Could not force a trash encounter — skipping combat shots");
  } else {
    await waitForIdle(page, 4000);
    let st = await snap(page);
    await shot("17-combat-trash-start.png", `combat start, ${st.combat?.enemies.length ?? "?"} enemies`);

    // Wait out any opening playback, land on the root palette for the first actor.
    for (let i = 0; i < 60 && (await snap(page)).combat?.phase === "playback"; i++) await wait(100);
    st = await snap(page);
    await shot("18-combat-palette.png", `FF6 action palette, acting=${st.combat?.actingCharId}`);

    // Drive turns until a caster (Dell c3 / Eve c4) is up, or cap attempts.
    let sawSpell = false;
    let sawMelee = false;
    for (let turn = 0; turn < 8 && (!sawSpell || !sawMelee); turn++) {
      st = await snap(page);
      if (st.route !== "combat" || st.combat?.phase !== "palette") break;
      const acting = st.combat.actingCharId;
      const isCaster = acting === "c3" || acting === "c4";

      if (isCaster && !sawSpell) {
        await press(page, "c"); // cast shortcut -> Magic list
        await wait(300);
        st = await snap(page);
        if (st.combat?.selection) {
          await shot("19-combat-spell-menu.png", "Magic selection window, spell list + detail");
          await press(page, "Enter"); // pick highlighted spell
          await wait(300);
          st = await snap(page);
          if (st.combat?.selection) {
            await press(page, "Enter"); // confirm target
          }
          await wait(250);
          await shot("20-combat-spell-cast.png", "spell banner + burst mid-cast");
          sawSpell = true;
        }
      } else if (!sawMelee) {
        await press(page, "a"); // attack -> target select
        await wait(250);
        st = await snap(page);
        if (st.combat?.selection) {
          await shot("21-combat-target-select.png", "target cursor on enemy candidate");
          await press(page, "Enter");
        }
        await wait(250);
        await shot("22-combat-melee-hit.png", "melee swing / hurt animation + damage popup");
        sawMelee = true;
      } else {
        await press(page, "a");
        await wait(200);
        st = await snap(page);
        if (st.combat?.selection) await press(page, "Enter");
      }

      for (let i = 0; i < 60 && (await snap(page)).combat?.phase === "playback"; i++) await wait(100);
      await wait(200);
    }

    // Force victory to see the result window (unless the real fight already ended it).
    st = await snap(page);
    if (st.route === "combat") {
      st = await exitCombatAndSettle("victory");
    }
    if (st.route === "perk") {
      for (let i = 0; i < 10 && st.route === "perk"; i++) {
        await press(page, "ArrowLeft");
        await press(page, "Enter");
        await waitForIdle(page, 3000);
        st = await snap(page);
      }
    }
    await shot("23-combat-victory-or-post.png", `post-combat route=${st.route}`);
  }
} catch (e) {
  log("Section 3 threw:", e);
}

// ============================================================================
try {
  section("4. Wipe / Game Over (century wipe text)");
  await freshBoot();
  await jump({ floorId: 1, x: 5, y: 7, facing: 0, autosave: false, partyLevel: 3 });
  const res = await forceEncounter();
  if (res.ok) {
    await waitForIdle(page, 4000);
    await exitCombatAndSettle("wipe");
    await shot("24-game-over-wipe.png", "party wipe / century wipe text");
  }
} catch (e) {
  log("Section 4 threw:", e);
}

// ============================================================================
try {
  section("5. Boss fight + ending");
  await freshBoot();
  await jump({ floorId: 5, x: 2, y: 2, facing: 0, autosave: false, partyLevel: 14 });
  const res = await forceEncounter({ allowBoss: true });
  if (!res.ok) {
    log("Could not force a boss encounter on Floor 5");
  } else {
    await waitForIdle(page, 4000);
    let st = await snap(page);
    await shot("25-boss-start.png", "boss nameplate / intro");
    await wait(1200);
    await shot("26-boss-mid.png", "boss fight mid-round");

    // One real player action against the boss for a combat-vs-boss visual.
    for (let i = 0; i < 60 && (await snap(page)).combat?.phase === "playback"; i++) await wait(100);
    st = await snap(page);
    if (st.combat?.phase === "palette") {
      await press(page, "a");
      await wait(250);
      st = await snap(page);
      if (st.combat?.selection) await press(page, "Enter");
      await wait(300);
      await shot("27-boss-player-turn.png", "party turn against the boss");
      for (let i = 0; i < 60 && (await snap(page)).combat?.phase === "playback"; i++) await wait(100);
    }

    st = await exitCombatAndSettle("victory");
    if (st.route === "perk") {
      for (let i = 0; i < 10 && st.route === "perk"; i++) {
        await press(page, "ArrowLeft");
        await press(page, "Enter");
        await waitForIdle(page, 3000);
        st = await snap(page);
      }
    }
    await shot("28-post-boss.png", `route after boss victory = ${st.route}`);

    if (st.route === "ending") {
      await shot("29-ending-beat1.png", "ending scene, first beat");
      for (let i = 0; i < 20 && st.route === "ending"; i++) {
        await press(page, "Enter", 1, 350);
        await waitForIdle(page, 4000);
        st = await snap(page);
      }
      await shot("30-ending-beat-late.png", "ending scene, late beat / close");
    }
    await shot("31-post-ending-return.png", `final route = ${st.route}`);
  }
} catch (e) {
  log("Section 5 threw:", e);
}

// ============================================================================
try {
  section("6. Arena");
  await freshBoot();
  await press(page, "a");
  await waitForIdle(page, 3000);
  await shot("32-arena-setup.png", "arena setup — choose starting party level");

  // A single Enter picks "Level 1" and kicks off startArena -> startNextArenaFight
  // (fire-and-forget). Sending a *second* Enter while combatTransitionActive
  // hasn't flipped true yet appears to wedge the transition (combatController
  // never gets assigned, route sticks at "none" forever) — reproduced in
  // isolation; one press + a real wait is reliable, a tight retry loop is not.
  await press(page, "Enter");
  await wait(2000);
  let st = await snap(page);
  if (st.route !== "combat") await wait(2000);
  st = await snap(page);

  if (st.route === "combat") {
    await shot("33-arena-wave1-combat.png", "arena, wave 1 combat");
    st = await exitCombatAndSettle("victory");
    if (st.route === "perk") {
      for (let i = 0; i < 10 && st.route === "perk"; i++) {
        await press(page, "ArrowLeft");
        await press(page, "Enter");
        await waitForIdle(page, 3000);
        st = await snap(page);
      }
    }
    if (st.route === "arena") {
      await shot("33b-arena-hub.png", "arena wave hub (Next Fight / Exit)");
      await press(page, "Enter");
      await wait(2000);
      st = await snap(page);
      if (st.route !== "combat") await wait(2000);
      st = await snap(page);
      if (st.route === "combat") {
        await shot("34-arena-wave2-combat.png", "arena, wave 2+ combat");
      } else {
        log(`arena wave 2 did not reach combat (route=${st.route})`);
      }
    }
  } else {
    log(`arena wave 1 did not reach combat (route=${st.route})`);
  }
} catch (e) {
  log("Section 6 threw:", e);
}

console.log("\n=== manifest ===");
console.log(JSON.stringify(manifest, null, 2));

await browser.close();
