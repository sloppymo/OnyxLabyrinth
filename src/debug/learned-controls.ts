/**
 * Controls the game has actually printed on screen this run.
 *
 * Blind play must not receive the debug snapshot's availableActions list.
 * Instead the harness accumulates hint strings the player has seen.
 */

const HINT_PATTERNS: Array<{ re: RegExp; control: string }> = [
  { re: /\bTab\s*:?\s*Actions\b/i, control: "Tab: Actions" },
  { re: /\bEsc(?:ape)?\s*:?\s*Save\b/i, control: "Escape: Save" },
  { re: /\bY\s*\/\s*V\b/i, control: "Y/V: Map" },
  { re: /\bU\s+Unlock\b/i, control: "U: Unlock" },
  { re: /\bG\b.*[Gg]rimoire|[Gg]rimoire/i, control: "G: Grimoire" },
  { re: /\[N\]|\bN\s*New Game/i, control: "N: New Game" },
  { re: /\[C\]|\bC\s*Continue/i, control: "C: Continue" },
  { re: /\[A\]|\bA\s*Arena/i, control: "A: Arena" },
  { re: /\bI\s+inspect\b/i, control: "I: Inspect" },
  { re: /\bD\s+disarm\b/i, control: "D: Disarm" },
  { re: /\bO\s+open\b/i, control: "O: Open" },
  { re: /\bL\s+leave\b/i, control: "L: Leave" },
  { re: /\bEnter\b.*select|A select/i, control: "Enter: Select" },
  { re: /D-pad navigate|Arrow/i, control: "Arrows: Navigate" },
  { re: /\bT\b.*[Tt]ech|Tech\b/i, control: "T: Technique" },
  { re: /\bM\b.*[Mm]agic|Magic\b/i, control: "M: Magic" },
  { re: /\bR\b.*[Rr]un|Run\b/i, control: "R: Run" },
  { re: /\bCamp\b/i, control: "Camp (Actions menu)" },
];

/** Keys the harness always accepts; not the same as "the player knows these". */
export const PHYSICAL_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Escape",
  " ",
  "Tab",
] as const;

export function extractControlHints(texts: readonly string[]): string[] {
  const found: string[] = [];
  const blob = texts.filter(Boolean).join(" · ");
  if (!blob.trim()) return found;
  for (const { re, control } of HINT_PATTERNS) {
    if (re.test(blob) && !found.includes(control)) found.push(control);
  }
  return found;
}

export function mergeLearnedControls(
  previous: readonly string[],
  visibleTexts: readonly string[]
): string[] {
  const next = [...previous];
  for (const hint of extractControlHints(visibleTexts)) {
    if (!next.includes(hint)) next.push(hint);
  }
  return next;
}
