/**
 * Development-only asset fallback warnings.
 *
 * Logs to `console.warn` only in browser development builds. Suppressed in
 * tests, CI, and production so procedural fallbacks remain safe and the test
 * output stays clean.
 */

const g = globalThis as { process?: { env?: Record<string, string | undefined> } };

const inTest =
  g.process?.env?.NODE_ENV === "test" || g.process?.env?.VITEST === "true";

const inCi = g.process?.env?.CI === "true" || g.process?.env?.CI === "1";

export function warnAsset(message: string): void {
  if (inTest || inCi) return;
  if (import.meta.env.DEV) {
    console.warn(`[assets] ${message}`);
  }
}
