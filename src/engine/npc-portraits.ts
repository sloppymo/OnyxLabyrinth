/**
 * NPC dialogue portrait manifest — resolves a stable `NPCDef.portraitId`
 * (never a literal path, never inferred from name/id by the renderer) to an
 * asset URL, the same `${BASE_URL}assets/<category>/<id>/...` convention
 * `sprite-manifest.ts` uses for enemy strips. Missing/unlisted ids resolve
 * to `undefined`; callers (npc-dialogue-view.ts) render a deliberate
 * silhouette instead of a broken-image icon.
 *
 * Source art: approved 16-bit portraits supplied by the author and packaged
 * through Aseprite (see the matching production log under
 * art/pixellab-candidates/dialogue-portraits). The portraits are vertical
 * head-and-shoulders art with binary alpha and no baked UI border; the
 * dialogue frame supplies the border and keeps the pixels crisp.
 */

const ASSET_BASE = import.meta.env.BASE_URL ?? "/";

/** Portrait ids with real shipped art. Add an entry here, never a path
 *  literal at a render call site, when wiring a new NPC's portrait. */
const NPC_PORTRAIT_IDS: readonly string[] = ["kazeharu", "isobel", "rat-king", "old-man"];

export function resolvePortraitUrl(portraitId: string | undefined): string | undefined {
  if (!portraitId || !NPC_PORTRAIT_IDS.includes(portraitId)) return undefined;
  // Isobel's approved shop sprite is already a crisp production asset. Until
  // a dedicated head-and-shoulders portrait exists, present it as a compact
  // merchant card rather than scaling a placeholder initial to cinematic size.
  if (portraitId === "isobel") {
    return `${ASSET_BASE}assets/map-sprites/isobel-npc-pixellab.png`;
  }
  return `${ASSET_BASE}assets/portraits/${portraitId}/portrait.png`;
}

/** Whether a portraitId has real art (vs. falling back to the silhouette). */
export function hasPortrait(portraitId: string | undefined): boolean {
  return resolvePortraitUrl(portraitId) !== undefined;
}
