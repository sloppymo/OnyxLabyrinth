import { describe, expect, it } from "vitest";
import { requestedMazeRendererBackend } from "./renderer-factory";

describe("requestedMazeRendererBackend", () => {
  it("uses WebGL as the production default", () => {
    expect(requestedMazeRendererBackend("")).toBe("webgl");
  });

  it("accepts explicit Canvas and WebGL selectors", () => {
    expect(requestedMazeRendererBackend("?mazeRenderer=canvas")).toBe("canvas");
    expect(requestedMazeRendererBackend("?debug=1&mazeRenderer=webgl")).toBe("webgl");
  });

  it("ignores unknown selectors", () => {
    expect(requestedMazeRendererBackend("?mazeRenderer=webgpu")).toBe("webgl");
  });
});
