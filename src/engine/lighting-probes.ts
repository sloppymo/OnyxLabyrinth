/**
 * Pass/fail lighting probes for maze-canvas screenshots.
 *
 * Probe numbers are computed from RGBA (Playwright element shots decoded in
 * the page, or synthetic buffers in tests). HUD must stay out of the buffer —
 * callers screenshot `#view` / `#maze-webgl`, not the full page.
 */

export type LightingProbe = {
  w: number;
  h: number;
  meanLuma: number;
  p05: number;
  p50: number;
  p95: number;
  meanRGB: [number, number, number];
  meanChroma: number;
  uniqueColours: number;
};

export type LightingPoseResult = {
  name: string;
  backend: "canvas" | "webgl";
  inDarkness: boolean | null;
  probe: LightingProbe;
  errorCount?: number;
};

export type LightingCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export const LIGHTING_PROBE_GATES = {
  /** Below this is a black / failed frame. */
  blackFrameLuma: 3,
  /** Floor of a living dungeon view (darkness included). */
  meanLumaMin: 5,
  /** Cap so a global brighten cannot silently pass. */
  meanLumaMax: 85,
  uniqueColoursMin: 64,
  meanChromaMin: 1.2,
  /**
   * Darkness poses must read as desaturated vs a sibling lit pose.
   * Whole-frame mean luma is not a darkness signal: far fog is a similar
   * mid-grey, so a long lit corridor can be darker in luma than a near
   * darkness cell.
   */
  darknessPairs: [
    { dark: "f1-darkness", lit: "f1-straight" },
  ] as const,
} as const;

const luma = (r: number, g: number, b: number): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Build a probe from packed RGBA (same formula as the Playwright capture). */
export function computeLightingProbe(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): LightingProbe {
  const hist = new Float64Array(256);
  let sumL = 0, sumR = 0, sumG = 0, sumB = 0, sumC = 0;
  const colours = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const L = luma(r, g, b);
    sumL += L;
    sumR += r;
    sumG += g;
    sumB += b;
    sumC += Math.max(r, g, b) - Math.min(r, g, b);
    hist[Math.min(255, L | 0)]++;
    colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
  }
  const N = (data.length / 4) | 0;
  const pct = (p: number): number => {
    let acc = 0;
    const want = N * p;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= want) return i;
    }
    return 255;
  };
  const mR = sumR / N, mG = sumG / N, mB = sumB / N;
  return {
    w: width,
    h: height,
    meanLuma: +(sumL / N).toFixed(2),
    p05: pct(0.05),
    p50: pct(0.5),
    p95: pct(0.95),
    meanRGB: [+mR.toFixed(1), +mG.toFixed(1), +mB.toFixed(1)],
    meanChroma: +(sumC / N).toFixed(2),
    uniqueColours: colours.size,
  };
}

function findPose(
  results: LightingPoseResult[],
  backend: string,
  name: string
): LightingPoseResult | undefined {
  return results.find((r) => r.backend === backend && r.name === name);
}

/** Evaluate one capture run. Empty array of failures means pass. */
export function evaluateLightingRun(results: LightingPoseResult[]): LightingCheck[] {
  const checks: LightingCheck[] = [];
  const backends = [...new Set(results.map((r) => r.backend))];

  for (const r of results) {
    const p = r.probe;
    const tag = `${r.backend}/${r.name}`;
    checks.push({
      id: `${tag}/black-frame`,
      ok: p.meanLuma >= LIGHTING_PROBE_GATES.blackFrameLuma,
      detail: `meanLuma=${p.meanLuma}`,
    });
    checks.push({
      id: `${tag}/luma-band`,
      ok:
        p.meanLuma >= LIGHTING_PROBE_GATES.meanLumaMin &&
        p.meanLuma <= LIGHTING_PROBE_GATES.meanLumaMax,
      detail: `meanLuma=${p.meanLuma} (want ${LIGHTING_PROBE_GATES.meanLumaMin}–${LIGHTING_PROBE_GATES.meanLumaMax})`,
    });
    checks.push({
      id: `${tag}/chroma`,
      ok: p.meanChroma >= LIGHTING_PROBE_GATES.meanChromaMin,
      detail: `meanChroma=${p.meanChroma}`,
    });
    checks.push({
      id: `${tag}/colours`,
      ok: p.uniqueColours >= LIGHTING_PROBE_GATES.uniqueColoursMin,
      detail: `uniqueColours=${p.uniqueColours}`,
    });
  }

  for (const backend of backends) {
    for (const pair of LIGHTING_PROBE_GATES.darknessPairs) {
      const dark = findPose(results, backend, pair.dark);
      const lit = findPose(results, backend, pair.lit);
      if (!dark || !lit) continue;
      checks.push({
        id: `${backend}/${pair.dark}-chroma<${pair.lit}`,
        ok: dark.probe.meanChroma < lit.probe.meanChroma,
        detail: `darkChroma=${dark.probe.meanChroma} litChroma=${lit.probe.meanChroma}`,
      });
    }
  }

  return checks;
}

export function lightingRunPassed(checks: LightingCheck[]): boolean {
  return checks.every((c) => c.ok);
}
