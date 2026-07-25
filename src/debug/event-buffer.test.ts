import { describe, it, expect } from "vitest";
import { DebugEventBuffer } from "./event-buffer";

function fixedClock(start = 1000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("DebugEventBuffer", () => {
  it("records events in chronological order with monotonic seq", () => {
    const clock = fixedClock();
    const buf = new DebugEventBuffer({ now: clock.now });
    buf.push("modeChange", { to: "town" });
    clock.advance(50);
    buf.push("message", { text: "hi" });

    const log = buf.log();
    expect(log.map((e) => e.kind)).toEqual(["modeChange", "message"]);
    expect(log[0]!.seq).toBe(1);
    expect(log[1]!.seq).toBe(2);
    expect(log[0]!.t).toBe(1000);
    expect(log[1]!.t).toBe(1050);
  });

  it("carries the event payload through untouched", () => {
    const buf = new DebugEventBuffer();
    buf.push("feature", { kind: "treasure", looted: true });
    expect(buf.log()[0]!.data).toEqual({ kind: "treasure", looted: true });
  });

  it("drops the oldest events past capacity", () => {
    const buf = new DebugEventBuffer({ capacity: 3 });
    for (let i = 0; i < 5; i++) buf.push("message", { i });

    const log = buf.log();
    expect(log).toHaveLength(3);
    expect(log.map((e) => e.data.i)).toEqual([2, 3, 4]);
    // seq keeps counting across drops so gaps are detectable.
    expect(log[0]!.seq).toBe(3);
  });

  it("log(n) returns only the most recent n, still chronological", () => {
    const buf = new DebugEventBuffer();
    for (let i = 0; i < 6; i++) buf.push("message", { i });
    expect(buf.log(2).map((e) => e.data.i)).toEqual([4, 5]);
  });

  it("log() returns a copy so callers cannot mutate the buffer", () => {
    const buf = new DebugEventBuffer();
    buf.push("message", { i: 0 });
    buf.log().push({ seq: 99, t: 0, kind: "error", data: {} });
    expect(buf.log()).toHaveLength(1);
  });

  it("clear() empties the buffer but does not reset seq", () => {
    const buf = new DebugEventBuffer();
    buf.push("message", {});
    buf.clear();
    expect(buf.log()).toHaveLength(0);
    buf.push("message", {});
    expect(buf.log()[0]!.seq).toBe(2);
  });

  it("filters by kind", () => {
    const buf = new DebugEventBuffer();
    buf.push("message", {});
    buf.push("audioCue", { id: "ui:cursor" });
    buf.push("message", {});
    expect(buf.log(undefined, "audioCue")).toHaveLength(1);
  });
});
