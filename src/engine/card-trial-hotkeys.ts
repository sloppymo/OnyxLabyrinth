/**
 * Card-row number keys. Move and Pass have dedicated bindings (M / B);
 * digits never alias onto those utilities as the hand shrinks.
 */

export type HandDigitAction = { kind: "card"; index: number } | { kind: "none" };

export function handDigitAction(digit: number, handLength: number): HandDigitAction {
  if (digit < 1 || digit > 5) return { kind: "none" };
  const index = digit - 1;
  if (index >= handLength) return { kind: "none" };
  return { kind: "card", index };
}
