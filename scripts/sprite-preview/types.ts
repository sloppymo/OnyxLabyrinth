/**
 * Shared data shapes for the sprite preview generator and its embedded
 * client script. The Node side (generate-sprite-preview.ts) builds one
 * PreviewSnapshot and serializes it into the output HTML as a JSON blob;
 * the client reads that same shape to render + animate every card. Keeping
 * both sides on this one type is what lets a later --watch/--json mode
 * reuse collectSnapshot() unchanged.
 */

export type MismatchSeverity =
  | "ok"
  | "missing"
  | "height-mismatch"
  | "width-not-multiple"
  | "fewer-frames-than-declared"
  | "more-frames-than-declared";

export interface MismatchResult {
  severity: MismatchSeverity;
  message: string | null;
}

export interface StripCard {
  kind: "strip";
  domId: string;
  label: string;
  /** Path relative to the repo root (e.g. "public/assets/enemies/orc/idle.png") so the
   *  output HTML works opened directly via file:// as well as over a local server. */
  src: string;
  frameWidth: number;
  frameHeight: number;
  /** Frame count the game code declares (manifest field, or derived-from-width for party). */
  declaredFrameCount: number;
  /** Frame count the actual PNG dimensions support at frameWidth x frameHeight. */
  naturalFrameCount: number;
  /** What the client should actually animate: min(declared, natural), best-effort if missing. */
  playbackFrameCount: number;
  /** Source-sheet columns (grid sampling; effects can be multi-row). */
  cols: number;
  fps: number;
  loop: boolean;
  fileSize: number;
  width: number;
  height: number;
  exists: boolean;
  mismatch: MismatchResult;
  /** e.g. "shares art with: flame-golem" for boss/elite reuse mappings. */
  note?: string;
  /** Canvas draw box size in px; defaults client-side if omitted. */
  displaySize?: number;
  /** Runtime whole-frame visual scale for compact enemy packs. */
  visualScale?: number;
}

export interface StaticCard {
  kind: "static";
  domId: string;
  label: string;
  src: string;
  width: number;
  height: number;
  fileSize: number;
  exists: boolean;
  note?: string;
  displaySize?: number;
}

export type Card = StripCard | StaticCard;

export interface CardGroup {
  id: string;
  title: string;
  note?: string;
  cards: Card[];
}

export interface Section {
  id: string;
  title: string;
  hint?: string;
  groups: CardGroup[];
}

export interface PreviewSnapshot {
  generatedAt: string;
  sections: Section[];
}
