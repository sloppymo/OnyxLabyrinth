import { describe, it, expect } from "vitest";
import { classifyStripMismatch, severityLevel } from "./classify";

const base = {
  exists: true,
  width: 600,
  height: 100,
  frameWidth: 100,
  frameHeight: 100,
  declaredFrameCount: 6,
  layout: "single-row" as const,
};

describe("classifyStripMismatch", () => {
  it("returns ok for an exact match", () => {
    expect(classifyStripMismatch(base)).toEqual({ severity: "ok", message: null });
  });

  it("flags a missing file regardless of other params", () => {
    const result = classifyStripMismatch({ ...base, exists: false, width: 0, height: 0 });
    expect(result.severity).toBe("missing");
  });

  it("flags single-row height that isn't exactly frameHeight", () => {
    const result = classifyStripMismatch({ ...base, height: 200 });
    expect(result.severity).toBe("height-mismatch");
  });

  it("allows grid-layout height to be any multiple of frameHeight", () => {
    const result = classifyStripMismatch({
      ...base,
      layout: "grid",
      height: 200,
      declaredFrameCount: 12,
    });
    expect(result.severity).toBe("ok");
  });

  it("flags grid-layout height that isn't a multiple of frameHeight", () => {
    const result = classifyStripMismatch({ ...base, layout: "grid", height: 150 });
    expect(result.severity).toBe("height-mismatch");
  });

  it("flags width that isn't a multiple of frameWidth", () => {
    const result = classifyStripMismatch({ ...base, width: 650 });
    expect(result.severity).toBe("width-not-multiple");
  });

  it("flags fewer frames available than declared", () => {
    const result = classifyStripMismatch({ ...base, width: 400, declaredFrameCount: 6 });
    expect(result.severity).toBe("fewer-frames-than-declared");
  });

  it("flags more frames available than declared", () => {
    const result = classifyStripMismatch({ ...base, width: 800, declaredFrameCount: 6 });
    expect(result.severity).toBe("more-frames-than-declared");
  });

  it("checks height before width so a bad height doesn't leak into a width/frame verdict", () => {
    const result = classifyStripMismatch({ ...base, height: 200, width: 650 });
    expect(result.severity).toBe("height-mismatch");
  });
});

describe("severityLevel", () => {
  it("maps missing, height-mismatch, and fewer-frames-than-declared to critical", () => {
    expect(severityLevel("missing")).toBe("critical");
    expect(severityLevel("height-mismatch")).toBe("critical");
    expect(severityLevel("fewer-frames-than-declared")).toBe("critical");
  });

  it("maps width-not-multiple and more-frames-than-declared to warn", () => {
    expect(severityLevel("width-not-multiple")).toBe("warn");
    expect(severityLevel("more-frames-than-declared")).toBe("warn");
  });

  it("maps ok to ok", () => {
    expect(severityLevel("ok")).toBe("ok");
  });
});
