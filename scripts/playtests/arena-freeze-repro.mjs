/**
 * Arena action-freeze repro (2026-08-01).
 *
 * Drives Arena and takes turns, sampling combat phase + playbackDone every
 * 50ms so a stall shows up as a timeline, not a vibe.
 *
 * The discriminator: if `phase === "playback"` while `playbackDone === true`
 * for more than a frame or two, the combat-ui render loop is dead (its
 * `tick()` threw and never rescheduled the RAF) — see combat-ui.ts
 * startRenderLoop. If both stay "playback"/false for seconds, the
 * choreography itself scheduled a long/empty animation.
 *
 * Env:
 *   ONYX_STAGE=canvas   append ?phaser=0 (canvas stage instead of Phaser)
 *   ONYX_LEVEL=<0..4>   arena level picker index ([1,3,6,9,12])
 *   ONYX_VERB=attack|magic   what to do each turn (magic cycles spell entries)
 *
 * Run: node scripts/playtests/arena-freeze-repro.mjs
 * (assumes `npx vite preview --port 5176 --base /OnyxLabyrinth/` is running)
 */
import { launch, wait, press, snap, ensureAudioResumed, debugLog } from "./lib.mjs";

const URL = process.env.ONYX_URL ?? "http://127.0.0.1:5176/OnyxLabyrinth/?debug=1";
const STAGE = process.env.ONYX_STAGE ?? "";
const LEVEL_IDX = Number(process.env.ONYX_LEVEL ?? 0);
const VERB = process.env.ONYX_VERB ?? "attack";
const WANT = process.env.ONYX_SPELL ?? ""; // substring of a spell entry to force
const url = STAGE === "canvas" ? `${URL}&phaser=0` : URL;

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
const log = (...a) => console.log(...a);

// Full stacks + firing time for uncaught errors (lib's launch only keeps `${e}`).
const stacks = [];
page.on("pageerror", (e) => {
  stacks.push({ at: Date.now(), message: e.message, stack: e.stack });
  log(`\n!!! PAGEERROR @${new Date().toISOString()}: ${e.message}\n${e.stack}\n`);
});

/** Sample phase/playbackDone until it leaves playback, or the deadline hits. */
async function samplePlayback(maxMs = 15000, interval = 50) {
  const t0 = Date.now();
  const timeline = [];
  let last = null;
  for (;;) {
    const st = await snap(page);
    const key = `${st.route}|${st.combat?.phase}|${st.combat?.playbackDone}`;
    if (key !== last) {
      timeline.push({
        ms: Date.now() - t0,
        route: st.route,
        phase: st.combat?.phase ?? null,
        playbackDone: st.combat?.playbackDone ?? null,
        acting: st.combat?.actingCharId ?? null,
      });
      last = key;
    }
    if (st.route !== "combat") return { timeline, done: true, st };
    if (st.combat?.phase !== "playback") return { timeline, done: true, st };
    if (Date.now() - t0 > maxMs) return { timeline, done: false, st };
    await wait(interval);
  }
}

async function reportStall(res, label) {
  log(`  !! ${label} STALLED`);
  log(`  timeline: ${JSON.stringify(res.timeline)}`);
  const dlog = await debugLog(page, 40);
  log("  recent debug events:", JSON.stringify(dlog.slice(-12), null, 2));
  log("  recent combat log:", JSON.stringify(res.st.combat?.recentLog));
  log("  page errors:", JSON.stringify(errors, null, 2));
}

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await wait(500);
  await ensureAudioResumed(page);

  await press(page, "a"); // Arena from title
  await wait(600);
  if (LEVEL_IDX > 0) await press(page, "ArrowDown", LEVEL_IDX, 150);
  await press(page, "Enter");
  await wait(3000);

  let st = await snap(page);
  log(`stage=${STAGE || "phaser"} levelIdx=${LEVEL_IDX} verb=${VERB}`);
  log(`after entry: route=${st.route} phase=${st.combat?.phase} enemies=${st.combat?.enemies?.length}`);

  const opening = await samplePlayback(20000);
  if (!opening.done) await reportStall(opening, "opening playback");

  let spellCursor = 0;
  for (let turn = 0; turn < 24; turn++) {
    st = await snap(page);
    if (st.route !== "combat") {
      log(`turn ${turn}: route=${st.route} — combat over, stopping`);
      break;
    }
    if (st.combat?.phase !== "palette") {
      const w = await samplePlayback(20000);
      if (!w.done) {
        await reportStall(w, `turn ${turn} pre-wait`);
        break;
      }
      st = await snap(page);
      if (st.combat?.phase !== "palette") {
        log(`turn ${turn}: phase=${st.combat?.phase} after wait — stopping`);
        break;
      }
    }

    const acting = st.combat.actingCharId;
    let what = "attack";

    if (VERB === "magic") {
      await press(page, "c", 1, 180);
      st = await snap(page);
      if (st.combat?.phase === "selectSpell") {
        const entries = st.combat.selection?.entries ?? [];
        let idx = entries.length ? spellCursor % entries.length : 0;
        spellCursor += 1;
        if (WANT) {
          const found = entries.findIndex((e) => e.toLowerCase().includes(WANT.toLowerCase()));
          if (found >= 0) idx = found;
          else {
            // This caster doesn't know the wanted spell — pass the turn cheaply.
            await press(page, "Escape", 1, 120);
            await press(page, "a", 1, 150);
            st = await snap(page);
            if (st.combat?.phase === "selectTarget") await press(page, "Enter", 1, 150);
            const skip = await samplePlayback(20000);
            log(`turn ${turn} (actor=${acting}) attack (no ${WANT}): ${skip.done ? "ok" : "STALLED"}`);
            if (!skip.done) {
              await reportStall(skip, `turn ${turn}`);
              break;
            }
            continue;
          }
        }
        what = `magic:${entries[idx] ?? "?"} (of ${JSON.stringify(entries)})`;
        for (let i = 0; i < idx; i++) await press(page, "ArrowDown", 1, 60);
        await press(page, "Enter", 1, 180);
        st = await snap(page);
        if (st.combat?.phase === "selectTarget") await press(page, "Enter", 1, 180);
      } else {
        await press(page, "Escape", 1, 120);
        await press(page, "a", 1, 150);
        st = await snap(page);
        if (st.combat?.phase === "selectTarget") await press(page, "Enter", 1, 150);
        what = "attack (no magic)";
      }
    } else {
      // Attack has NO palette letter (PALETTE_LETTER_SHORTCUTS is t/c/m/i/f/r/h/n/v);
      // "a" falls through to WASD and moves the cursor LEFT, which is how an
      // earlier version of this script silently confirmed Defend on some actors.
      // Attack is the palette's default slot — just confirm it.
      await press(page, "Enter", 1, 150);
      st = await snap(page);
      if (st.combat?.phase === "selectTarget") await press(page, "Enter", 1, 150);
    }

    const t0 = Date.now();
    const res = await samplePlayback(20000);
    const elapsed = Date.now() - t0;
    log(`turn ${turn} (actor=${acting}) ${what}: ${elapsed}ms${res.done ? "" : "  <<< STALLED"}`);
    if (elapsed < 900) {
      log(`  SHORT playback — log tail: ${JSON.stringify((res.st.combat?.recentLog ?? []).slice(-4))}`);
    }
    if (!res.done) {
      await reportStall(res, `turn ${turn}`);
      break;
    }
  }

  log("\npage errors:", errors.length ? JSON.stringify(errors, null, 2) : "(none)");
} catch (e) {
  log("script threw:", e);
  log("page errors:", JSON.stringify(errors, null, 2));
} finally {
  await browser.close();
}
