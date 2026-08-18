import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

function rpc(method: string, id: number, params: unknown = {}) {
  const json = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
}

function readMessage(buf: Buffer): { rest: Buffer; msg?: unknown } {
  const headerEnd = buf.indexOf("\r\n\r\n");
  if (headerEnd === -1) return { rest: buf };
  const header = buf.slice(0, headerEnd).toString("utf8");
  const match = /Content-Length:\s*(\d+)/i.exec(header);
  if (!match) return { rest: buf.slice(headerEnd + 4) };
  const length = parseInt(match[1], 10);
  const start = headerEnd + 4;
  if (buf.length < start + length) return { rest: buf };
  const msg = JSON.parse(buf.slice(start, start + length).toString("utf8"));
  return { rest: buf.slice(start + length), msg };
}

describe("onyx-ai-player MCP adapter", () => {
  it("initializes and lists playtest_key as an image-capable tool", async () => {
    const child = spawn("npx", ["tsx", "scripts/ai-player/mcp.ts"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf: Buffer = Buffer.alloc(0);
    const messages: unknown[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const { rest, msg } = readMessage(buf);
        buf = rest;
        if (!msg) break;
        messages.push(msg);
      }
    });
    child.stdin.write(rpc("initialize", 1, { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } }));
    await new Promise((r) => setTimeout(r, 2500));
    child.stdin.write(rpc("tools/list", 2));
    const deadline = Date.now() + 8000;
    while (messages.length < 2 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    child.kill();
    const init = messages.find((m) => (m as { id?: number }).id === 1) as { result?: { serverInfo?: { name?: string } } };
    const list = messages.find((m) => (m as { id?: number }).id === 2) as {
      result?: { tools?: Array<{ name: string; description?: string }> };
    };
    expect(init?.result?.serverInfo?.name).toBe("onyx-ai-player");
    const names = (list?.result?.tools ?? []).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "playtest_start",
        "playtest_key",
        "playtest_observe",
        "playtest_finish",
      ])
    );
    const key = list?.result?.tools?.find((t) => t.name === "playtest_key");
    expect(key?.description).toMatch(/image/i);
  }, 20_000);
});
