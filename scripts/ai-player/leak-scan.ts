/**
 * Outside-the-implementation leak scan: inspect serialized player payloads
 * (player-log.jsonl), not TypeScript types.
 */

import { findProhibitedPlayerFields } from "../../src/debug/player-observation";

const PATH_RE = /\/home\/|\/Users\/|OnyxLabyrinth|\.tmp-ai-player/i;
const COORDINATE_HUD_OK = /^F\d+\s*·/;

export interface LeakHit {
  index: number;
  playerKey?: string;
  tokens: string[];
  excerpt?: string;
}

export interface LeakScanResult {
  actions: number;
  screens: string[];
  hits: LeakHit[];
}

export function scanPlayerLogLine(line: string, index: number): LeakHit | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: { playerKey?: string; emitted?: unknown; observation?: unknown };
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { index, tokens: ["invalid-json"], excerpt: trimmed.slice(0, 120) };
  }
  const tokens = new Set<string>();
  for (const blob of [parsed.emitted, parsed.observation, parsed]) {
    for (const t of findProhibitedPlayerFields(blob)) tokens.add(t);
    const json = JSON.stringify(blob);
    if (PATH_RE.test(json)) tokens.add("filesystemPath");
  }
  if (tokens.size === 0) return null;
  return { index, playerKey: parsed.playerKey, tokens: [...tokens] };
}

export function scanPlayerLog(text: string): LeakScanResult {
  const lines = text.split(/\n/);
  const hits: LeakHit[] = [];
  const screens = new Set<string>();
  let actions = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    actions += 1;
    try {
      const row = JSON.parse(lines[i]);
      const screen = row.emitted?.screen ?? row.observation?.screen;
      if (typeof screen === "string") screens.add(screen);
    } catch {
      /* counted as a hit below */
    }
    const hit = scanPlayerLogLine(lines[i], i);
    if (hit) hits.push(hit);
  }
  void COORDINATE_HUD_OK;
  return { actions, screens: [...screens], hits };
}
