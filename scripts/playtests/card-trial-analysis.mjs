import fs from "node:fs";

export function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function emptyCard(cardId) {
  return {
    cardId,
    seen: 0,
    playable: 0,
    focused: 0,
    armed: 0,
    canceled: 0,
    played: 0,
    decisionMs: [],
  };
}

function addCard(into, card) {
  const out = into[card.cardId] ?? (into[card.cardId] = emptyCard(card.cardId));
  for (const key of ["seen", "playable", "focused", "armed", "canceled", "played"]) {
    out[key] += Number(card[key] ?? 0);
  }
  out.decisionMs.push(...(card.decisionMs ?? []));
}

export function summarizeSessions(sessions) {
  const fights = sessions.flatMap((session) => session.fights ?? []);
  const actions = fights.flatMap((fight) => fight.actions ?? []);
  const interactions = fights.flatMap((fight) => fight.interactions ?? []);
  const decisions = actions.map((action) => action.decisionMs).filter(Number.isFinite);
  const cards = {};
  const heroes = {};
  for (const fight of fights) {
    for (const card of Object.values(fight.cards ?? {})) addCard(cards, card);
    for (const action of fight.actions ?? []) {
      const hero = heroes[action.heroId] ?? (heroes[action.heroId] = {
        heroId: action.heroId,
        actions: 0,
        cardsPlayed: 0,
        moves: 0,
        passes: 0,
        damageDealt: 0,
        decisionMs: [],
      });
      hero.actions += 1;
      hero.cardsPlayed += action.kind === "card" ? 1 : 0;
      hero.moves += action.kind === "move" ? 1 : 0;
      hero.passes += action.kind === "pass" ? 1 : 0;
      hero.decisionMs.push(action.decisionMs);
    }
  }
  const holdOpens = interactions.filter((event) => event.kind === "details-open");
  const targetChanges = interactions.filter((event) => event.kind === "target-change").length;
  const targetCancels = interactions.filter((event) => event.kind === "target-cancel").length;
  const disabledAttempts = interactions.filter((event) => event.kind === "disabled-attempt").length;
  const highEnergyPasses = actions.filter((action) => action.kind === "pass" && action.context?.energyBefore >= 2).length;
  const summary = {
    schemaVersion: 1,
    sessions: sessions.length,
    sessionIds: sessions.map((session) => session.sessionId),
    fightCount: fights.length,
    victories: fights.filter((fight) => fight.result === "victory").length,
    defeats: fights.filter((fight) => fight.result === "defeat").length,
    abandoned: fights.filter((fight) => fight.result === "abandoned").length,
    actions: actions.length,
    cardsSeen: Object.values(cards).reduce((n, card) => n + card.seen, 0),
    cardsPlayed: actions.filter((action) => action.kind === "card").length,
    decisionMs: {
      count: decisions.length,
      median: median(decisions),
      p90: percentile(decisions, 0.9),
      longest: decisions.length ? Math.max(...decisions) : 0,
    },
    move: {
      opportunities: fights.reduce((n, fight) => n + (fight.summary?.moves ?? 0), 0),
      uses: actions.filter((action) => action.kind === "move").length,
    },
    pass: {
      uses: actions.filter((action) => action.kind === "pass").length,
      withTwoOrMoreEnergy: highEnergyPasses,
    },
    opened: {
      applied: fights.reduce((n, fight) => n + (fight.summary?.openedApplied ?? 0), 0),
      consumed: fights.reduce((n, fight) => n + (fight.summary?.openedConsumed ?? 0), 0),
    },
    interaction: {
      detailsOpened: holdOpens.length,
      targetChanges,
      targetCancels,
      disabledAttempts,
    },
    cards: Object.fromEntries(Object.entries(cards).sort(([a], [b]) => a.localeCompare(b)).map(([id, card]) => [id, {
      ...card,
      playRate: card.playable ? card.played / card.playable : null,
      medianDecisionMs: median(card.decisionMs),
    }])),
    fightRecords: fights.map((fight) => ({
      fightId: fight.fightId,
      fightName: fight.fightName,
      result: fight.result ?? "unfinished",
      setup: fight.setup,
      seed: fight.seed,
      rounds: fight.summary?.rounds ?? 0,
      durationMs: fight.endedAt && fight.startedAt ? fight.endedAt - fight.startedAt : null,
      cardsPlayed: fight.summary?.cardsPlayed ?? 0,
      moves: fight.summary?.moves ?? 0,
      passes: fight.summary?.passes ?? 0,
      damageDealt: fight.summary?.damageDealt ?? 0,
      damageTaken: fight.summary?.damageTaken ?? 0,
      medianDecisionMs: median((fight.actions ?? []).map((action) => action.decisionMs)),
      longestDecisionMs: Math.max(0, ...(fight.actions ?? []).map((action) => action.decisionMs)),
    })),
    heroes: Object.fromEntries(Object.entries(heroes).map(([id, hero]) => [id, {
      ...hero,
      medianDecisionMs: median(hero.decisionMs),
    }])),
    observations: {
      highEnergyPasses,
      disabledAttempts,
      targetCancels,
      repeatedTargetChanges: targetChanges >= Math.max(3, actions.length),
    },
  };
  return summary;
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

export function renderSummary(summary) {
  const lines = [
    "# Card Trial Session Summary",
    "",
    `Sessions: ${summary.sessions} (${summary.sessionIds.join(", ") || "none"})`,
    `Fights: ${summary.fightCount} · victories ${summary.victories} · defeats ${summary.defeats} · abandoned ${summary.abandoned}`,
    `Actions: ${summary.actions} · cards seen ${summary.cardsSeen} · cards played ${summary.cardsPlayed}`,
    `Decision time: median ${seconds(summary.decisionMs.median)} · p90 ${seconds(summary.decisionMs.p90)} · longest ${seconds(summary.decisionMs.longest)}`,
    `Move: ${summary.move.uses} uses across ${summary.move.opportunities} recorded fight opportunities`,
    `Pass: ${summary.pass.uses} uses · ${summary.pass.withTwoOrMoreEnergy} with 2+ energy remaining (observation only)`,
    `Opened: ${summary.opened.applied} applied · ${summary.opened.consumed} consumed`,
    `Details: ${summary.interaction.detailsOpened} opens · target changes ${summary.interaction.targetChanges} · cancels ${summary.interaction.targetCancels} · disabled attempts ${summary.interaction.disabledAttempts}`,
    "",
    "## Per-card exposure",
    "",
    "| Card | Seen | Playable | Played | Play rate | Canceled | Median decision |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const card of Object.values(summary.cards)) {
    lines.push(`| ${card.cardId} | ${card.seen} | ${card.playable} | ${card.played} | ${card.playRate === null ? "—" : `${(card.playRate * 100).toFixed(0)}%`} | ${card.canceled} | ${seconds(card.medianDecisionMs)} |`);
  }
  lines.push("", "## Per-fight", "", "| Fight | Result | Rounds | Duration | Cards | Move | Pass | Median decision |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const fight of summary.fightRecords) {
    lines.push(`| ${fight.fightId} — ${fight.fightName} | ${fight.result} | ${fight.rounds} | ${fight.durationMs === null ? "—" : seconds(fight.durationMs)} | ${fight.cardsPlayed} | ${fight.moves} | ${fight.passes} | ${seconds(fight.medianDecisionMs)} |`);
  }
  lines.push("", "## Hero actions", "", "| Hero | Actions | Cards | Move | Pass | Median decision |", "| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const hero of Object.values(summary.heroes)) {
    lines.push(`| ${hero.heroId} | ${hero.actions} | ${hero.cardsPlayed} | ${hero.moves} | ${hero.passes} | ${seconds(hero.medianDecisionMs)} |`);
  }
  lines.push("", "## Observations", "", "These are signals for human review, not automated balance conclusions.", "");
  if (summary.observations.highEnergyPasses) lines.push(`- OBSERVATION: ${summary.observations.highEnergyPasses} Pass decisions left 2+ energy and may merit observer notes.`);
  if (summary.observations.disabledAttempts) lines.push(`- OBSERVATION: ${summary.observations.disabledAttempts} disabled-card attempts were recorded.`);
  if (summary.observations.targetCancels) lines.push(`- OBSERVATION: ${summary.observations.targetCancels} target cancels occurred.`);
  if (!summary.observations.highEnergyPasses && !summary.observations.disabledAttempts && !summary.observations.targetCancels) lines.push("- No flagged interaction patterns in this sample.");
  return `${lines.join("\n")}\n`;
}

export function readSessions(paths) {
  return paths.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
}
