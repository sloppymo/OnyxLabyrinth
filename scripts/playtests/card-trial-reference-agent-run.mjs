/**
 * Card Trial **reference-agent** sequential 1→10 run.
 *
 * This is not a human playtest. The `decide()` policy is frozen: do not
 * "improve" Heap-stay, Consume-decline, targeting, or leftover-energy
 * heuristics. Rerun it as a regression oracle after patches.
 *
 * Logs every turn decision, then dumps summarize() after fight 10.
 */
import fs from "fs";
import path from "path";
import { launch, wait, press, snap, waitForIdle, shot, ensureOutDir } from "./lib.mjs";

const BASE = process.env.ONYX_URL ?? "http://127.0.0.1:5193/OnyxLabyrinth/?debug=1";
const OUT = ensureOutDir("playtest-screenshots/card-trial-reference-agent-run");
const LOG = [];
const log = (...a) => {
  const line = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  console.log(line);
  LOG.push(line);
};

function viewOf(page) {
  return page.evaluate(() => window.__onyxDebug.cardTrial.view());
}
function phaseOf(page) {
  return page.evaluate(() => window.__onyxDebug.snapshot()?.combat?.phase ?? null);
}
function summaryOf(page) {
  return page.evaluate(() => window.__onyxDebug.cardTrial.summarize());
}
function telemetryOf(page) {
  return page.evaluate(() => window.__onyxDebug.cardTrial.telemetry());
}

function living(view) {
  return view.enemies.filter((e) => !e.dead);
}

function me(view) {
  return view.heroes.find((h) => h.id === view.actingHero);
}

function hitsOn(view, heroId) {
  const out = [];
  for (const intent of view.intents) {
    for (const c of intent.consequences) {
      if (c.heroId === heroId && !c.miss) {
        out.push({
          enemyId: intent.enemyId,
          label: intent.label,
          postGuard: c.postGuard,
          lethal: c.lethal,
          both: /both rows/i.test(intent.label),
          named: /in Front|in Back/i.test(intent.label),
        });
      }
    }
  }
  return out;
}

function otherRow(row) {
  return row === "front" ? "back" : "front";
}

function rowThreat(view, row) {
  return view.intents
    .filter((i) => !i.wouldMiss)
    .filter((i) => {
      const cons = i.consequences.filter((c) => !c.miss);
      return cons.some((c) => view.heroes.find((h) => h.id === c.heroId)?.row === row);
    })
    .map((i) => ({
      enemyId: i.enemyId,
      label: i.label,
      maxPost: Math.max(0, ...i.consequences.filter((c) => !c.miss).map((c) => c.postGuard)),
      both: /both rows/i.test(i.label),
    }));
}

function cardDmg(id, row, opened, liveCount, hasRat, ratRow) {
  switch (id) {
    case "nip":
      return 5;
    case "open-the-rank":
      return 4;
    case "from-the-dark":
      return 4 + (row === "back" && hasRat ? 3 : 0);
    case "swarm-the-wound":
      return 5 + (opened ? 4 : 0);
    case "burst-the-nest":
      return 8 + (opened && liveCount > 1 ? 4 * (liveCount - 1) : 0);
    case "litter":
      return 4;
    case "send-the-rat":
      return hasRat ? 5 : 4;
    case "tide":
      return 5 + (row === "front" ? 3 : 0);
    case "lunge":
      return 5;
    case "king-of-the-heap":
      return 7 + (row === "front" ? 3 : 0);
    case "staff":
      return 6;
    case "crack":
      return 5;
    case "split-bone":
      return 4;
    case "full-stop":
      return 8 + (opened ? 8 : 0);
    case "cut-the-line":
      return 5 + (opened && liveCount > 1 ? 5 : 0);
    case "threshold":
      return 5 + (row === "front" ? 4 : 0);
    case "from-afar":
      return 5;
    case "parting-blow":
      return 4;
    case "extinguish":
      return 4 * liveCount;
    case "stand-and-die":
      return 8 + (row === "front" ? 3 : 0);
    default:
      return 0;
  }
}

function pickTarget(view, preferOpened) {
  const live = living(view);
  if (live.length === 0) return null;
  if (preferOpened && view.openedEnemyId) {
    const o = live.find((e) => e.id === view.openedEnemyId);
    if (o) return o.id;
  }
  const threatening = new Set();
  for (const h of hitsOn(view, view.actingHero).concat(hitsOn(view, view.actingHero === "rat-king" ? "old-man" : "rat-king"))) {
    threatening.add(h.enemyId);
  }
  const threat = live.filter((e) => threatening.has(e.id)).sort((a, b) => a.hp - b.hp);
  if (threat[0]) return threat[0].id;
  return [...live].sort((a, b) => a.hp - b.hp)[0].id;
}

function pickSecond(view, firstId) {
  const live = living(view).filter((e) => e.id !== firstId);
  if (live.length === 0) return null;
  return [...live].sort((a, b) => b.hp - a.hp)[0].id;
}

/**
 * One action a design-aware first-run player would take. Not a solver.
 * Heap/Stand only when staying in a meaningfully threatened Front.
 * Consume can be declined (especially Burst on a lone Opened).
 */
function decide(view) {
  const hero = me(view);
  if (!hero || view.energy <= 0) return { kind: "pass", why: "no energy / no actor" };
  const hand = view.hand.filter((c) => !c.disabled);
  if (hand.length === 0 && !view.moveAvailable) return { kind: "pass", why: "nothing legal" };

  const live = living(view);
  const liveCount = live.length;
  const has = (id) => hand.find((c) => c.defId === id);
  const myHits = hitsOn(view, hero.id);
  const myMaxHit = Math.max(0, ...myHits.map((h) => h.postGuard));
  const lethal = myHits.some((h) => h.lethal);
  const frontThreats = rowThreat(view, "front");
  const backThreats = rowThreat(view, "back");
  const hereThreats = hero.row === "front" ? frontThreats : backThreats;
  const otherThreats = hero.row === "front" ? backThreats : frontThreats;
  const hereHeavy = hereThreats.some((t) => t.maxPost >= 10);
  const hereTax = hereThreats.some((t) => t.maxPost >= 8);
  const otherSafer =
    view.moveAvailable &&
    !otherThreats.some((t) => t.both) &&
    !hereThreats.every((t) => t.both) &&
    (otherThreats.length === 0 || Math.max(0, ...otherThreats.map((t) => t.maxPost)) + 3 < myMaxHit);
  const bothRowsOnMe = myHits.some((h) => h.both);
  const opened = view.openedEnemyId;
  const openedEnemy = live.find((e) => e.id === opened);
  const hasRat = !!view.ratRow;

  const play = (id, opts = {}) => {
    const card = has(id);
    if (!card) return null;
    const targetId = opts.none ? undefined : pickTarget(view, opts.opened ?? false);
    const secondTargetId = opts.second && targetId ? pickSecond(view, targetId) : undefined;
    return {
      kind: "play",
      defId: id,
      uid: card.uid,
      targetId,
      secondTargetId,
      why: opts.why,
    };
  };

  // 1. Named-hero / empty-row dodge: leaving is free of the hit.
  if (view.moveAvailable && lethal && otherSafer && !bothRowsOnMe) {
    return { kind: "move", why: `lethal ${myMaxHit} on ${hero.row}; other row looks safer` };
  }
  if (
    view.moveAvailable &&
    hereHeavy &&
    otherSafer &&
    !has("king-of-the-heap") &&
    !has("stand-and-die") &&
    !bothRowsOnMe
  ) {
    return { kind: "move", why: `${hero.row} taxed ~${myMaxHit} and I have no stay 2-cost` };
  }

  // 2. Stay 2-costs only if Front is a real tax and we're already Front (or Stand/Heap in Front).
  if (hero.row === "front" && hereHeavy && view.energy >= 2) {
    const stay = play("king-of-the-heap", { why: "stay in threatened Front with Heap Guard" })
      || play("stand-and-die", { why: "stay in threatened Front with Stand and Die" });
    if (stay) return stay;
  }

  // 3. Race the enemy that's about to hit someone, if a card clearly kills it.
  const raceTarget = [...myHits, ...hitsOn(view, hero.id === "rat-king" ? "old-man" : "rat-king")]
    .map((h) => live.find((e) => e.id === h.enemyId))
    .filter(Boolean)
    .sort((a, b) => a.hp - b.hp)[0];
  if (raceTarget) {
    const killers = hand
      .filter((c) => cardDmg(c.defId, hero.row, opened === raceTarget.id, liveCount, hasRat, view.ratRow) >= raceTarget.hp)
      .sort((a, b) => a.cost - b.cost);
    if (killers[0] && killers[0].cost <= view.energy) {
      const c = killers[0];
      return {
        kind: "play",
        defId: c.defId,
        uid: c.uid,
        targetId: c.defId === "extinguish" || c.defId === "brace" || c.defId === "ward" ? undefined : raceTarget.id,
        secondTargetId: c.defId === "cut-the-line" && c.consumeArmed ? pickSecond(view, raceTarget.id) : undefined,
        why: `race ${raceTarget.name} at ${raceTarget.hp} HP with ${c.name}`,
      };
    }
  }

  // 4. Good Consume — skip Burst on a lone Opened (leave it; that's a decline).
  if (openedEnemy) {
    const burst = has("burst-the-nest");
    if (burst && liveCount === 1 && view.energy >= 2) {
      // fall through — declined on purpose
    } else {
      const consume = ["full-stop", "swarm-the-wound", "cut-the-line", "burst-the-nest"]
        .map((id) => has(id))
        .filter((c) => c && c.consumeArmed && c.cost <= view.energy);
      if (consume[0]) {
        const c = consume[0];
        if (!(c.defId === "burst-the-nest" && liveCount === 1)) {
          return {
            kind: "play",
            defId: c.defId,
            uid: c.uid,
            targetId: openedEnemy.id,
            secondTargetId: c.defId === "cut-the-line" ? pickSecond(view, openedEnemy.id) : undefined,
            why: `consume Opened on ${openedEnemy.name} with ${c.name}`,
          };
        }
      }
    }
  }

  // 5. Create Opened if nobody is Opened.
  if (!opened) {
    const opener = play("open-the-rank", { why: "Open someone for the party" })
      || play("from-the-dark", { why: "Open (and maybe Rat bite from Back)" })
      || play("crack", { why: "Open with Crack" })
      || play("split-bone", { why: "Open with Split Bone" });
    if (opener && opener.targetId) return opener;
  }

  // 6. Cheap Front payoff if already Front and not diving into a tax we refused to stay for.
  if (hero.row === "front") {
    const bonus = play("tide", { why: "Front Tide" }) || play("threshold", { why: "Front Threshold" });
    if (bonus) return bonus;
  }

  // 7. Litter if no Rat — token should exist; not a full extra character.
  if (!hasRat && has("litter")) {
    return play("litter", { why: "spawn the Rat on my row" });
  }
  if (hasRat && has("send-the-rat")) {
    return play("send-the-rat", { why: "send the Rat to bite" });
  }

  // 8. Ordinary 1-cost contact / small Guard if staying in a mild tax.
  if (hereTax && view.energy === 1 && (has("brace") || has("ward") || has("from-afar") && hero.row === "back")) {
    return (
      play("brace", { none: true, why: "1 energy Brace to stay through a tax" }) ||
      play("ward", { none: true, why: "1 energy Ward to stay through a tax" }) ||
      play("from-afar", { why: "From Afar chip + Back Guard" })
    );
  }

  const cheap = [
    "nip",
    "staff",
    "from-afar",
    "open-the-rank",
    "from-the-dark",
    "crack",
    "split-bone",
    "parting-blow",
    "lunge",
    "brace",
    "ward",
  ]
    .map((id) => has(id))
    .filter(Boolean);
  // Don't Lunge into a heavy Front.
  const filtered = cheap.filter((c) => !(c.defId === "lunge" && frontThreats.some((t) => t.maxPost >= 10)));
  if (filtered[0]) {
    const c = filtered[0];
    const none = c.defId === "brace" || c.defId === "ward";
    return {
      kind: "play",
      defId: c.defId,
      uid: c.uid,
      targetId: none ? undefined : pickTarget(view, false),
      why: `spend leftover energy on ${c.name}`,
    };
  }

  // 9. Extinguish as a 2-cost beat vs 2+ bodies, not as a default.
  if (liveCount >= 2 && has("extinguish") && view.energy >= 2) {
    return play("extinguish", { none: true, why: "Extinguish hits everyone" });
  }

  // 10. Heap/Stand in a quiet Front is a possible 2-cost beat, but I prefer passing
  //     the 2-cost if I already spent 1-costs — if they're still in hand at 3 energy
  //     and Front is quiet, playing them is the "automatic" trap. Discard instead.
  if (hero.row === "front" && !hereTax && view.energy >= 2 && (has("king-of-the-heap") || has("stand-and-die"))) {
    return { kind: "pass", why: "quiet Front: not auto-firing Heap/Stand; discarding the 2-cost is the test" };
  }

  if (view.moveAvailable && otherSafer && hereTax) {
    return { kind: "move", why: "last look: paid Move away from a tax" };
  }

  return { kind: "pass", why: "no line I want; discard the rest" };
}

async function selectTargetByKey(page, enemyId) {
  for (let i = 0; i < 10; i++) {
    const selected = await page.evaluate(() => {
      const snap = window.__onyxDebug.snapshot();
      const sel = snap.combat?.selection;
      if (sel && (sel.title === "Target" || sel.title === "Second enemy")) {
        return sel.entries?.[sel.index] ?? null;
      }
      const chip = document.querySelector(".ct-actor-chip.enemy.targeted");
      const fromChip = chip?.getAttribute("data-actor")?.replace(/^enemy:/, "") ?? null;
      const legacy = document.querySelector(".ct-target.selected")?.getAttribute("data-eid") ?? null;
      return fromChip ?? legacy;
    });
    if (!enemyId || selected === enemyId) break;
    await page.keyboard.press("ArrowDown");
    await wait(40);
  }
  await page.keyboard.press("Enter");
}

async function perform(page, view, action) {
  if (action.kind === "pass") {
    await page.keyboard.press("Escape");
    return;
  }
  if (action.kind === "move") {
    await page.keyboard.press("m");
    return;
  }
  const idx = view.hand.findIndex((c) => c.uid === action.uid);
  if (idx < 0 || idx > 4) {
    await page.keyboard.press("Escape");
    return;
  }
  await page.keyboard.press(String(idx + 1));
  await wait(80);
  let p = await phaseOf(page);
  if (p === "target") {
    await selectTargetByKey(page, action.targetId);
    await wait(80);
    p = await phaseOf(page);
  }
  if (p === "target2") {
    await selectTargetByKey(page, action.secondTargetId);
  }
}

async function waitHandOrResult(page, ms = 25000) {
  const deadline = Date.now() + ms;
  let held = false;
  try {
    while (Date.now() < deadline) {
      const p = await phaseOf(page);
      if (p === "hand" || p === "result") return p;
      if (p === "playback" && !held) {
        await page.keyboard.down("Shift");
        held = true;
      }
      await wait(40);
    }
    return await phaseOf(page);
  } finally {
    if (held) await page.keyboard.up("Shift");
  }
}

const { browser, page, errors } = await launch({ viewport: { width: 1400, height: 900 } });

try {
  log("=== boot sequential 1→10 ===");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(500);
  await press(page, "a");
  await waitForIdle(page, 5000);
  await press(page, "ArrowDown", 5, 70);
  await press(page, "Enter");
  await waitForIdle(page, 5000);
  await press(page, "ArrowDown", 10, 70);
  await press(page, "Enter");
  await waitHandOrResult(page, 20000);

  let fightId = 0;
  let lastShotFight = 0;
  let handsShot = 0;
  let consumeShot = 0;
  let guard = 0;
  let stuckKey = "";
  let stuckN = 0;
  const turns = [];
  while (guard++ < 800) {
    const route = (await snap(page)).route;
    const phase = await phaseOf(page);
    const view = await viewOf(page);
    const body = await page.evaluate(() => document.body.innerText);

    if (!view) {
      if (/Begin sequential/.test(body) && fightId >= 1) {
        log(`lobby after fight ${fightId} route=${route}`);
        break;
      }
      log("no view yet", { route, phase });
      await wait(250);
      continue;
    }

    if (view.fightId !== fightId && view.fightId) {
      fightId = view.fightId;
      lastShotFight = 0;
      log(`\n######## FIGHT ${fightId} ${view.fightName} ########`);
    }

    if (phase === "playback") {
      await waitHandOrResult(page, 20000);
      continue;
    }

    if (phase === "result" || view.result) {
      const rk = view.heroes.find((h) => h.id === "rat-king");
      const om = view.heroes.find((h) => h.id === "old-man");
      log(`  RESULT ${view.result} RK ${rk?.hp} OM ${om?.hp}`);
      await shot(page, OUT, `${String(fightId).padStart(2, "0")}-result.png`);
      await press(page, "Enter");
      await waitForIdle(page, 18000);
      await wait(400);
      continue;
    }

    if (phase === "target" || phase === "target2") {
      log("  stuck in target; cancel");
      await press(page, "Escape");
      await wait(120);
      continue;
    }

    if (phase !== "hand") {
      await wait(80);
      continue;
    }

    if (lastShotFight !== fightId) {
      lastShotFight = fightId;
      await shot(page, OUT, `${String(fightId).padStart(2, "0")}-start.png`);
    }
    if (handsShot < 8 && view.hand.length >= 5) {
      handsShot += 1;
      await shot(page, OUT, `hand-5card-${handsShot}.png`);
    }
    if (consumeShot < 4 && view.hand.some((c) => c.consumeArmed)) {
      consumeShot += 1;
      await shot(page, OUT, `consume-armed-${consumeShot}.png`);
    }

    const key = `${view.fightId}-${view.round}-${view.actingHero}-${view.energy}-${view.hand.map((c) => c.uid).join("|")}`;
    if (key === stuckKey) stuckN += 1;
    else {
      stuckKey = key;
      stuckN = 0;
    }
    let action = decide(view);
    if (stuckN >= 5) {
      log("  stuck repeating the same hand; forcing Pass");
      action = { kind: "pass", why: "stuck-loop failsafe" };
    }
    const hero = me(view);
    log(
      `  r${view.round} ${hero?.name} ${hero?.row} HP${hero?.hp} G${hero?.guard} E${view.energy} Opened=${view.openedEnemyId ?? "-"} Rat=${view.ratRow ?? "-"}`
    );
    log(`    hand: ${view.hand.map((c) => `${c.name}${c.disabled ? "*" : ""}${c.consumeArmed ? "✓" : ""}`).join(", ")}`);
    log(`    intents: ${view.intents.map((i) => i.label).join(" | ")}`);
    log(`    → ${action.kind}${action.defId ? " " + action.defId : ""} ${action.why}`);
    turns.push({
      fightId: view.fightId,
      fightName: view.fightName,
      round: view.round,
      hero: view.actingHero,
      energy: view.energy,
      row: hero?.row,
      hp: hero?.hp,
      opened: view.openedEnemyId,
      rat: view.ratRow,
      hand: view.hand.map((c) => c.defId),
      intents: view.intents.map((i) => i.label),
      action,
    });

    try {
      await perform(page, view, action);
      await waitHandOrResult(page, 22000);
    } catch (err) {
      log("  input failed", String(err));
      const p = await phaseOf(page);
      if (p === "hand") await page.keyboard.press("Escape");
      await waitHandOrResult(page, 12000);
    }
  }
  fs.writeFileSync(path.join(OUT, "turns.json"), JSON.stringify(turns, null, 2));

  const summary = await summaryOf(page);
  const telemetry = await telemetryOf(page);
  fs.writeFileSync(path.join(OUT, "summary.txt"), summary ?? "(no summary)");
  fs.writeFileSync(path.join(OUT, "telemetry.json"), JSON.stringify(telemetry, null, 2));
  fs.writeFileSync(path.join(OUT, "decisions.log"), LOG.join("\n"));
  log("\n======== SUMMARIZE ========\n");
  log(summary ?? "(none)");
  log("\npage errors", errors);
} catch (err) {
  log("FATAL", String(err?.stack || err));
  fs.writeFileSync(path.join(OUT, "decisions.log"), LOG.join("\n"));
  throw err;
} finally {
  await browser.close();
}
