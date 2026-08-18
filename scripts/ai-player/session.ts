/**
 * Embodied AI player session: one real browser, real keys, player-visible
 * observations, forensic capture on disk.
 */
// @ts-nocheck — Playwright driver; lib.mjs is untyped.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  launch,
  wait,
  waitForIdle,
  snap,
  sounds,
  ensureAudioResumed,
  captureFailureBundle,
  ensureOutDir,
} from "../playtests/lib.mjs";
import { stateHash } from "../replays/hash.mjs";
import {
  buildPlayerObservation,
  diffPlayerObservation,
  findProhibitedPlayerFields,
  publicCueLabel,
  type PlayerAudioCue,
  type PlayerObservation,
  type PlayerObservationDelta,
  type PlayerVisual,
} from "../../src/debug/player-observation";
import { mergeLearnedControls } from "../../src/debug/learned-controls";
import {
  classifyVisualChange,
  composeContactSheet,
  decodePng,
  encodePng,
  meanAbsDiff,
  nearestNeighborScale,
  subsampleFrames,
  type VisualKind,
} from "./media";
import {
  checkpointById,
  playerFacingCheckpoint,
  type CheckpointDef,
} from "./checkpoints";
import { EXPERIENCE_PROBE, MENTAL_MAP_PROBE, DEFAULT_PROBE_CONFIG } from "./probes";

export const HARNESS_SCHEMA = 1;
export const PLAYER_TIMEOUT_MS = 120_000;
const PHASE_SETTLE_MS = 5000;

export type RunMode = "blind" | "checkpoint" | "forensic";
export type ObserveDetail = "compact" | "full" | "motion";

export interface StartOptions {
  mode?: RunMode;
  seed?: number;
  fresh?: boolean;
  renderer?: "webgl" | "canvas";
  combatRenderer?: "phaser" | "canvas";
  headed?: boolean;
  channel?: string;
  viewport?: { width: number; height: number };
  url?: string;
  outDir?: string;
  checkpoint?: string;
}

export interface PlayerActionResult {
  elapsedMs: number;
  settled: boolean;
  observation: PlayerObservation;
  delta: PlayerObservationDelta;
  visualKind: VisualKind;
  screenshotPath?: string;
  contactSheetPath?: string;
  probe?: { kind: string; prompt: string };
  /** Checkpoint sweeps only. Never includes jumpTo / coordinates / labels. */
  playerIntro?: string;
  memory?: import("./checkpoints").PlayerMemoryPacket;
}

export interface PlayerNote {
  index: number;
  kind: "mental-map" | "reaction" | "hypothesis" | "experience";
  text: string;
  atMs: number;
}

interface TranscriptAction {
  index: number;
  timestamp: number;
  playerKey: string;
  routeBefore: string;
  preObservationHash: string;
  postObservationHash: string;
  stateHash: string;
  elapsedMs: number;
  visualChangeMetric: number;
  screenshotRef?: string;
  contactSheetRef?: string;
  audioEvents: PlayerAudioCue[];
  visibleTextDelta: string[];
  playerNotes?: string[];
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function hashJson(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function defaultUrl(combatRenderer: "phaser" | "canvas"): string {
  const base =
    process.env.ONYX_URL || "http://127.0.0.1:5173/OnyxLabyrinth/?debug=1";
  const url = new URL(base);
  url.searchParams.set("debug", "1");
  if (combatRenderer === "canvas") url.searchParams.set("phaser", "0");
  else url.searchParams.delete("phaser");
  return url.toString();
}

async function waitForPhaseSettle(page: { evaluate: Function }, timeout = PHASE_SETTLE_MS) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const s = await snap(page);
    if (s.route !== "combat") return s;
    if (s.combat?.phase !== "playback") return s;
    if (Date.now() >= deadline) return s;
    await wait(50);
  }
}

/**
 * Wait until the next player key is meaningful.
 *
 * Uses the real `__onyxDebug.isIdle()` predicate (camera tween, mode fade,
 * combat choreography). The prologue is the documented exception: `isIdle()`
 * stays false for the whole auto-play, but Escape/Enter are valid *during*
 * that sequence. Holding the harness until the cinematic ends would prevent
 * a human-like skip. Combat playback is NOT excepted — duration is UX.
 */
async function waitForHarnessSettle(page: { evaluate: Function }, timeout = PLAYER_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const idle = await page.evaluate(() => window.__onyxDebug.isIdle());
    if (idle) return true;
    const s = await snap(page);
    if (s.route === "prologue") return true;
    if (Date.now() >= deadline) return false;
    await wait(30);
  }
}

async function launchWithFallback(opts: {
  viewport: { width: number; height: number };
  headless: boolean;
  channel?: string;
}) {
  try {
    return await launch(opts);
  } catch (err) {
    const msg = String(err);
    if (!opts.channel && /Executable doesn't exist/.test(msg)) {
      return await launch({ ...opts, channel: "chrome" });
    }
    throw err;
  }
}

function audioDelta(before: { seq?: number; id: string; firedAt: number; durationMs: number | null; bufferMissing?: boolean }[], after: typeof before, t0: number): PlayerAudioCue[] {
  const start = before.length === 0 ? 0 : before[before.length - 1].firedAt;
  return after
    .filter((c) => c.firedAt > start)
    .map((c) => ({
      cue: publicCueLabel(c.id),
      atMs: Math.max(0, Math.round(c.firedAt - t0)),
      durationMs: c.durationMs,
      silent: !!c.bufferMissing,
    }));
}

export class AiPlayerSession {
  private browser: Awaited<ReturnType<typeof launch>>["browser"] | null = null;
  private page: Awaited<ReturnType<typeof launch>>["page"] | null = null;
  private errors: string[] = [];
  private previous: PlayerObservation | null = null;
  private previousFullPng: Buffer | null = null;
  private learnedControls: string[] = [];
  private actions: TranscriptAction[] = [];
  private notes: PlayerNote[] = [];
  private visitedScreens: string[] = [];
  private startingSave = "";
  private seed = 42;
  private mode: RunMode = "blind";
  private renderer = "webgl";
  private combatRenderer: "phaser" | "canvas" = "phaser";
  private viewport = { width: 1280, height: 800 };
  private outDir = "";
  private runId = "";
  private startedAt = 0;
  private checkpointId: string | null = null;
  private sawCombat = false;
  private lastHeading = "";
  private perf = {
    keyOverheadMs: [] as number[],
    shotMs: [] as number[],
    diffMs: [] as number[],
    sheetMs: [] as number[],
    compactBytes: [] as number[],
    fullBytes: [] as number[],
    compactObsBytes: [] as number[],
    fullObsBytes: [] as number[],
  };

  get directory(): string {
    return this.outDir;
  }

  get id(): string {
    return this.runId;
  }

  async start(opts: StartOptions = {}): Promise<PlayerActionResult> {
    this.mode = opts.mode ?? (opts.checkpoint ? "checkpoint" : "blind");
    this.seed = opts.seed ?? 42;
    this.combatRenderer = opts.combatRenderer ?? "phaser";
    this.viewport = opts.viewport ?? { width: 1280, height: 800 };
    this.runId = `run-${Date.now()}-${this.seed}`;
    this.outDir = ensureOutDir(opts.outDir ?? path.resolve(".tmp-ai-player", this.runId));
    fs.mkdirSync(path.join(this.outDir, "media"), { recursive: true });
    this.startedAt = Date.now();

    const launched = await launchWithFallback({
      viewport: this.viewport,
      headless: opts.headed === true ? false : process.env.ONYX_PLAYTEST_HEADED !== "1",
      channel: opts.channel ?? process.env.ONYX_PLAYTEST_CHANNEL,
    });
    this.browser = launched.browser;
    this.page = launched.page;
    this.errors = launched.errors;

    const url = opts.url ?? defaultUrl(this.combatRenderer);
    await this.page.goto(url, { waitUntil: "networkidle" });
    await wait(400);

    if (opts.fresh !== false && this.mode === "blind" && !opts.checkpoint) {
      await this.page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await this.page.reload({ waitUntil: "networkidle" });
      await wait(400);
    }

    await ensureAudioResumed(this.page);
    await this.page.evaluate((sd: number) => {
      window.__onyxDebug.setGameplayRng(window.__onyxDebug.createSeededRng(sd));
    }, this.seed);

    if (opts.checkpoint) {
      await this.applyCheckpoint(opts.checkpoint);
    }

    this.startingSave = await this.page.evaluate(() => window.__onyxDebug.dumpSave());
    const maze = await this.page.evaluate(() => window.__onyxDebug.mazeRendererInfo?.());
    this.renderer = maze?.active ?? maze?.requested ?? "webgl";

    fs.writeFileSync(
      path.join(this.outDir, "meta.json"),
      JSON.stringify(
        {
          harnessSchema: HARNESS_SCHEMA,
          playerObservationSchema: 1,
          runId: this.runId,
          mode: this.mode,
          seed: this.seed,
          buildSha: gitSha(),
          viewport: this.viewport,
          renderer: this.renderer,
          combatRenderer: this.combatRenderer,
          url,
          checkpointId: this.checkpointId,
        },
        null,
        2
      )
    );

    const result = await this.collect("start", 0, true);
    return this.attachCheckpointContext(result);
  }

  async key(key: string): Promise<PlayerActionResult> {
    if (!this.page) throw new Error("Session not started");
    const page = this.page;
    const beforeSnap = await snap(page);
    const beforeSounds = await sounds(page, 80);
    const t0 = performance.now();
    const wall0 = Date.now();

    const wantMotion =
      beforeSnap.route === "combat" &&
      (key === "Enter" || key === " " || /^[a-zA-Z]$/.test(key));

    const motionFrames: { buf: Buffer; atMs: number }[] = [];
    await page.keyboard.press(key);

    const deadline = Date.now() + PLAYER_TIMEOUT_MS;
    let settled = false;
    if (wantMotion) {
      while (Date.now() < deadline) {
        const elapsed = Date.now() - wall0;
        const idle = await page.evaluate(() => window.__onyxDebug.isIdle());
        const due =
          motionFrames.length === 0 ||
          elapsed - motionFrames[motionFrames.length - 1].atMs >= 120;
        if (due && motionFrames.length < 4 && !idle) {
          try {
            motionFrames.push({ buf: await this.captureStage(), atMs: elapsed });
          } catch {
            /* ignore */
          }
        }
        if (idle) {
          settled = true;
          try {
            motionFrames.push({ buf: await this.captureStage(), atMs: elapsed });
          } catch {
            /* ignore */
          }
          break;
        }
        await wait(30);
      }
    } else {
      settled = await waitForHarnessSettle(page, PLAYER_TIMEOUT_MS);
    }

    if (beforeSnap.route === "combat" || (await snap(page)).route === "combat") {
      await waitForPhaseSettle(page);
    }

    const gameMs = Date.now() - wall0;
    const result = await this.collect(key, gameMs, settled, { motionFrames, t0, beforeSounds, beforeSnap });
    this.perf.keyOverheadMs.push(performance.now() - t0 - gameMs);
    return result;
  }

  async observe(detail: ObserveDetail = "compact"): Promise<PlayerActionResult> {
    if (!this.page) throw new Error("Session not started");
    await waitForHarnessSettle(this.page, 5000);
    return this.collect("observe", 0, true, { forceFull: detail !== "compact", forceMotion: detail === "motion" });
  }

  async checkpoint(id: string): Promise<PlayerActionResult> {
    if (!this.page) throw new Error("Session not started");
    await this.applyCheckpoint(id);
    const result = await this.collect("checkpoint", 0, true, { forceFull: true });
    return this.attachCheckpointContext(result);
  }

  async note(kind: PlayerNote["kind"], text: string): Promise<{ stored: true; index: number }> {
    const index = this.actions.length;
    this.notes.push({ index, kind, text, atMs: Date.now() - this.startedAt });
    const last = this.actions[this.actions.length - 1];
    if (last) {
      last.playerNotes = [...(last.playerNotes ?? []), `${kind}: ${text}`];
    }
    fs.writeFileSync(path.join(this.outDir, "notes.json"), JSON.stringify(this.notes, null, 2));
    return { stored: true, index };
  }

  /** Coverage/leak-audit only. Not part of the Mythos tool surface. */
  async forceWipeForAudit(): Promise<PlayerActionResult> {
    if (!this.page) throw new Error("Session not started");
    await this.page.evaluate(() => {
      window.__onyxDebug.exitDebugCombat("wipe");
    });
    await waitForHarnessSettle(this.page, 8000);
    return this.collect("audit-wipe", 0, true, { forceFull: true });
  }

  async probe(kind: "experience" | "mental-map" = "experience"): Promise<{ prompt: string; index: number }> {
    const prompt = kind === "mental-map" ? MENTAL_MAP_PROBE : EXPERIENCE_PROBE;
    return { prompt, index: this.actions.length };
  }

  async finish(): Promise<{ summaryPath: string; forensicPath: string; replayPath: string; runId: string }> {
    if (!this.page) throw new Error("Session not started");
    const replayPath = this.writeReplayTranscript();
    const forensicPath = path.join(this.outDir, "forensic.json");
    const lastSnap = await snap(this.page, { map: true });
    fs.writeFileSync(
      forensicPath,
      JSON.stringify(
        {
          runId: this.runId,
          seed: this.seed,
          checkpointId: this.checkpointId,
          errors: this.errors,
          lastSnapshot: lastSnap,
          log: await this.page.evaluate((n: number) => window.__onyxDebug.log(n), 300),
          sounds: await sounds(this.page, 80),
          readiness: await this.page.evaluate(() => window.__onyxDebug.readiness()),
          notes: this.notes,
        },
        null,
        2
      )
    );
    const summaryPath = path.join(this.outDir, "player-summary.json");
    fs.writeFileSync(summaryPath, JSON.stringify(this.playerSummary(), null, 2));
    fs.writeFileSync(path.join(this.outDir, "perf.json"), JSON.stringify(this.perfStats(), null, 2));
    await this.browser?.close();
    this.browser = null;
    this.page = null;
    return { summaryPath, forensicPath, replayPath, runId: this.runId };
  }

  private async applyCheckpoint(id: string): Promise<void> {
    if (!this.page) throw new Error("Session not started");
    const def = checkpointById(id);
    this.checkpointId = def.id;
    this.mode = "checkpoint";
    if (def.setup.jumpTo) {
      await this.page.evaluate((o) => window.__onyxDebug.jumpTo(o), { ...def.setup.jumpTo, autosave: false });
      await waitForIdle(this.page, 8000);
    }
    if (def.setup.damagePartyRatio) {
      const ratio = def.setup.damagePartyRatio;
      await this.page.evaluate((r: number) => {
        const st = window.__onyxDebug.state;
        for (const c of st.party) c.hp = Math.max(1, Math.floor(c.maxHp * r));
      }, ratio);
    }
    if (def.setup.forceCombat) {
      await this.forceCombat();
    }
    await this.page.evaluate((sd: number) => {
      window.__onyxDebug.setGameplayRng(window.__onyxDebug.createSeededRng(sd));
    }, def.setup.seed ?? this.seed);
  }

  private attachCheckpointContext(result: PlayerActionResult): PlayerActionResult {
    if (!this.checkpointId) return result;
    const facing = playerFacingCheckpoint(checkpointById(this.checkpointId));
    result.playerIntro = facing.intro;
    result.memory = facing.memory;
    return result;
  }

  private async forceCombat(): Promise<void> {
    if (!this.page) return;
    const info = await this.page.evaluate(async () => {
      const d = window.__onyxDebug;
      const st = d.state;
      for (let attempts = 0; attempts < 400; attempts++) {
        const entry = d.rollEncounter(st.floor.id);
        if (!entry) return { ok: false, reason: "no encounter rolled" };
        const r = d.resolveEncounter(entry);
        if (r.length === 0) continue;
        const combat = d.createCombatFromEncounter(
          st.party,
          r,
          d.SPELLS_BY_ID,
          d.ITEMS_BY_ID,
          st.equipment,
          st.inventory,
          st.inAntimagic,
          st.activeCharIds
        );
        await d.startCombat(combat);
        return { ok: true };
      }
      return { ok: false, reason: "no valid encounter" };
    });
    if (!info.ok) throw new Error(`forceCombat failed: ${info.reason}`);
    await waitForIdle(this.page, 8000);
  }

  private async captureStage(): Promise<Buffer> {
    if (!this.page) throw new Error("no page");
    const shot0 = performance.now();
    const buf = await this.page.locator("#game-wrap").screenshot({ type: "png" });
    this.perf.shotMs.push(performance.now() - shot0);
    return buf;
  }

  private async collect(
    playerKey: string,
    elapsedMs: number,
    settled: boolean,
    extra: {
      motionFrames?: { buf: Buffer; atMs: number }[];
      t0?: number;
      beforeSounds?: { id: string; firedAt: number; durationMs: number | null; bufferMissing?: boolean }[];
      beforeSnap?: { route: string; combat?: { phase: string } | null };
      forceFull?: boolean;
      forceMotion?: boolean;
    } = {}
  ): Promise<PlayerActionResult> {
    if (!this.page) throw new Error("Session not started");
    const page = this.page;
    const forensic = await snap(page);
    const afterSounds = await sounds(page, 80);
    let presentation = await page.evaluate(() => window.__onyxDebug.playerView());
    if (!presentation) {
      throw new Error("playerView() missing — serve a current build with ?debug=1");
    }

    const leaks = findProhibitedPlayerFields(presentation);
    if (leaks.length > 0) {
      fs.writeFileSync(path.join(this.outDir, "leak-alert.json"), JSON.stringify({ leaks, presentation }, null, 2));
      throw new Error(`Player observation leaked prohibited fields: ${leaks.join(", ")}`);
    }

    const cues = extra.beforeSounds
      ? audioDelta(extra.beforeSounds, afterSounds, extra.t0 ?? performance.now())
      : [];
    const hintTexts = [
      ...(presentation.hints ?? []),
      presentation.prompt ?? "",
      presentation.menu?.footer ?? "",
      presentation.heading ?? "",
    ];
    this.learnedControls = mergeLearnedControls(this.learnedControls, hintTexts);

    let png: Buffer | null = null;
    let fullPng: Buffer | null = null;
    let metric = 0;
    let visualKind: VisualKind = "none";
    let screenshotPath: string | undefined;
    let contactSheetPath: string | undefined;

    try {
      fullPng = await this.captureStage();
      png = fullPng;
      if (this.previousFullPng) {
        const d0 = performance.now();
        metric = meanAbsDiff(decodePng(this.previousFullPng), decodePng(fullPng));
        this.perf.diffMs.push(performance.now() - d0);
      } else {
        metric = 1;
      }
    } catch {
      png = null;
      fullPng = null;
    }

    const menuAppeared = presentation.menu && !this.previous?.menu;
    const screenChanged = presentation.screen !== this.previous?.screen;
    const significantMotion =
      extra.forceMotion ||
      (extra.motionFrames && extra.motionFrames.length >= 2 && elapsedMs >= 400 && forensic.route === "combat");

    const classified = classifyVisualChange(metric, !!(extra.forceFull || menuAppeared || screenChanged));
    const haveSheet =
      !!(significantMotion && extra.motionFrames && extra.motionFrames.length > 0);
    visualKind = haveSheet ? "contactSheet" : classified.kind;
    if (!png) visualKind = "none";

    if (haveSheet && extra.motionFrames) {
      const s0 = performance.now();
      const sampled = subsampleFrames(extra.motionFrames, 5);
      const frames = sampled.map((f) => ({
        png: nearestNeighborScale(decodePng(f.buf), 0.5),
        atMs: f.atMs,
      }));
      const sheet = composeContactSheet(frames);
      const sheetBuf = encodePng(sheet);
      contactSheetPath = path.join("media", `step-${this.actions.length}-sheet.png`);
      fs.writeFileSync(path.join(this.outDir, contactSheetPath), sheetBuf);
      fs.writeFileSync(
        path.join(this.outDir, `media/step-${this.actions.length}-sheet.json`),
        JSON.stringify({ timestampsMs: sampled.map((f) => f.atMs) }, null, 2)
      );
      this.perf.sheetMs.push(performance.now() - s0);
      screenshotPath = contactSheetPath;
      png = sheetBuf;
      this.perf.fullBytes.push(sheetBuf.length);
    } else if (png && visualKind === "compact") {
      const compact = encodePng(nearestNeighborScale(decodePng(png), 0.5));
      if (compact.length < png.length) {
        png = compact;
        this.perf.compactBytes.push(png.length);
      } else {
        visualKind = "full";
        this.perf.fullBytes.push(png.length);
      }
    } else if (png && (visualKind === "full" || visualKind === "still")) {
      this.perf.fullBytes.push(png.length);
    }

    if (png && visualKind !== "none" && !contactSheetPath) {
      screenshotPath = path.join("media", `step-${this.actions.length}-${visualKind}.png`);
      fs.writeFileSync(path.join(this.outDir, screenshotPath), png);
    }
    if (fullPng) this.previousFullPng = fullPng;

    const visual: PlayerVisual = { changed: visualKind !== "none", kind: visualKind };
    const observation = buildPlayerObservation({
      ...presentation,
      learnedControls: this.learnedControls,
      audioDelta: cues,
      timing: { actionToIdleMs: elapsedMs },
      visual,
    });

    const delta = diffPlayerObservation(this.previous, observation);
    this.perf.compactObsBytes.push(Buffer.byteLength(JSON.stringify(delta)));
    this.perf.fullObsBytes.push(Buffer.byteLength(JSON.stringify(observation)));
    const preHash = this.previous ? hashJson(this.previous) : "start";
    const postHash = hashJson(observation);

    const visibleTextDelta: string[] = [];
    if (observation.message && observation.message !== this.previous?.message) {
      visibleTextDelta.push(observation.message);
    }

    this.actions.push({
      index: this.actions.length,
      timestamp: Date.now() - this.startedAt,
      playerKey,
      routeBefore: extra.beforeSnap?.route ?? forensic.route,
      preObservationHash: preHash,
      postObservationHash: postHash,
      stateHash: stateHash(forensic),
      elapsedMs,
      visualChangeMetric: metric,
      screenshotRef: screenshotPath,
      contactSheetRef: contactSheetPath,
      audioEvents: cues,
      visibleTextDelta,
    });
    this.previous = observation;
    this.visitedScreens.push(observation.screen);
    if (observation.screen === "combat") this.sawCombat = true;
    if (observation.heading) this.lastHeading = observation.heading;

    fs.writeFileSync(
      path.join(this.outDir, "transcript.json"),
      JSON.stringify({ schema: HARNESS_SCHEMA, actions: this.actions, notes: this.notes }, null, 2)
    );
    fs.writeFileSync(path.join(this.outDir, "forensic-last.json"), JSON.stringify(forensic, null, 2));

    const probe = this.maybeProbe(observation, forensic);

    const result: PlayerActionResult = {
      elapsedMs,
      settled,
      observation: extra.forceFull ? observation : { ...observation, ...stripUnchanged(observation, delta) },
      delta,
      visualKind,
      screenshotPath: screenshotPath ? path.join(this.outDir, screenshotPath) : undefined,
      contactSheetPath: contactSheetPath ? path.join(this.outDir, contactSheetPath) : undefined,
      probe,
    };
    if (playerKey === "start" || playerKey === "checkpoint") {
      this.attachCheckpointContext(result);
    }
    this.appendPlayerLog(playerKey, result);
    return result;
  }

  /** Blind-model JSON (no absolute paths). MCP attaches PNGs separately. */
  playerFacingPayload(result: PlayerActionResult, full = false): Record<string, unknown> {
    return {
      elapsedMs: result.elapsedMs,
      settled: result.settled,
      screen: result.observation.screen,
      delta: result.delta,
      visualKind: result.visualKind,
      screenshot: result.screenshotPath ? path.basename(result.screenshotPath) : undefined,
      contactSheet: result.contactSheetPath ? path.basename(result.contactSheetPath) : undefined,
      probe: result.probe,
      playerIntro: result.playerIntro,
      memory: result.memory,
      ...(full ? { observation: result.observation } : {}),
    };
  }

  private appendPlayerLog(playerKey: string, result: PlayerActionResult) {
    const line = JSON.stringify({
      index: this.actions.length - 1,
      playerKey,
      emitted: this.playerFacingPayload(result, false),
      observation: result.observation,
    });
    fs.appendFileSync(path.join(this.outDir, "player-log.jsonl"), `${line}\n`);
  }

  private maybeProbe(observation: PlayerObservation, forensic: { route: string }): { kind: string; prompt: string } | undefined {
    const n = this.actions.length;
    if (n > 0 && n % DEFAULT_PROBE_CONFIG.everyActions === 0) {
      return { kind: "experience", prompt: EXPERIENCE_PROBE };
    }
    if (DEFAULT_PROBE_CONFIG.onFirstCombat && observation.screen === "combat" && this.actions.filter((a) => a).length && !this.notes.some((n) => n.kind === "experience")) {
      if (this.sawCombat && n <= 3) return { kind: "experience", prompt: EXPERIENCE_PROBE };
    }
    void forensic;
    return undefined;
  }

  private writeReplayTranscript(): string {
    const replay = {
      version: 1,
      name: `ai-player-${this.runId}`,
      seed: this.seed,
      startingSave: this.startingSave,
      renderer: this.combatRenderer,
      viewport: this.viewport,
      forceCombat: false,
      actions: this.actions
        .filter((a) => a.playerKey !== "start" && a.playerKey !== "observe" && a.playerKey !== "checkpoint")
        .map((a) => ({
          index: a.index,
          routeBefore: a.routeBefore,
          action: "player-key",
          key: a.playerKey,
          stateHashAfter: a.stateHash,
        })),
    };
    const replayPath = path.join(this.outDir, "replay.json");
    fs.writeFileSync(replayPath, JSON.stringify(replay, null, 2));
    return replayPath;
  }

  private playerSummary() {
    return {
      runId: this.runId,
      mode: this.mode,
      seed: this.seed,
      checkpointId: this.checkpointId,
      actions: this.actions.length,
      screens: [...new Set(this.visitedScreens)],
      lastHeading: this.lastHeading,
      sawCombat: this.sawCombat,
      learnedControls: this.learnedControls,
      playerIntro: this.checkpointId ? playerFacingCheckpoint(checkpointById(this.checkpointId)).intro : undefined,
      memory: this.checkpointId ? playerFacingCheckpoint(checkpointById(this.checkpointId)).memory : undefined,
      notes: this.notes,
      wouldContinue: this.notes.filter((n) => /keep playing/i.test(n.text)),
      mentalMaps: this.notes.filter((n) => n.kind === "mental-map"),
      hypotheses: this.notes.filter((n) => n.kind === "hypothesis"),
    };
  }

  private perfStats() {
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const med = (xs: number[]) => {
      if (!xs.length) return 0;
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    return {
      avgKeyOverheadMs: avg(this.perf.keyOverheadMs),
      avgShotMs: avg(this.perf.shotMs),
      avgDiffMs: avg(this.perf.diffMs),
      avgSheetMs: avg(this.perf.sheetMs),
      medianCompactBytes: med(this.perf.compactBytes),
      medianFullBytes: med(this.perf.fullBytes),
      medianCompactObservationBytes: med(this.perf.compactObsBytes),
      medianFullObservationBytes: med(this.perf.fullObsBytes),
    };
  }
}

function stripUnchanged(
  observation: PlayerObservation,
  delta: PlayerObservationDelta
): Partial<PlayerObservation> {
  // compact API: still return full observation; delta is the compact view.
  void delta;
  return observation;
}

export { checkpointById, playerFacingCheckpoint, EXPERIENCE_PROBE, MENTAL_MAP_PROBE };
