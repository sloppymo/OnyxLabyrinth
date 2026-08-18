/**
 * Thin MCP adapter so Fable/Mythos receives screenshots as vision content
 * on the same playtest_key / playtest_observe call — not as a filesystem path
 * they have to open separately.
 *
 * Stdio JSON-RPC (Content-Length framing). No extra dependencies.
 *
 * Configure on a Player workspace that does NOT contain this repository:
 *
 *   command: /ABS/PATH/OnyxLabyrinth/scripts/ai-player/launch-mcp.sh
 *   env: { ONYX_URL: "http://127.0.0.1:5173/OnyxLabyrinth/?debug=1",
 *          ONYX_PLAYTEST_CHANNEL: "chrome" }
 *
 * Devin Desktop: command /usr/bin/bash, args [launch-mcp.sh], disabled: false.
 * Cloud Devin (app.devin.ai) cannot run this stdio server.
 */
// @ts-nocheck

import fs from "node:fs";
import { AiPlayerSession, type ObserveDetail, type StartOptions } from "./session";

const PROTOCOL = "2024-11-05";
const session = new AiPlayerSession();

type Rpc = { jsonrpc: "2.0"; id?: number | string; method?: string; params?: Record<string, unknown> };

function send(msg: unknown) {
  const json = JSON.stringify(msg);
  const body = Buffer.from(json, "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function textAndImage(result: Awaited<ReturnType<AiPlayerSession["key"]>>, full = false) {
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: JSON.stringify(session.playerFacingPayload(result, full)) },
  ];
  const imagePath = result.contactSheetPath ?? result.screenshotPath;
  if (imagePath && result.visualKind !== "none" && fs.existsSync(imagePath)) {
    content.push({
      type: "image",
      mimeType: "image/png",
      data: fs.readFileSync(imagePath).toString("base64"),
    });
  }
  return { content };
}

const TOOLS = [
  {
    name: "playtest_start",
    description:
      "Launch the game and return the first player-visible observation. Blind by default. One image attached when the frame is useful.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["blind", "checkpoint"] },
        seed: { type: "number" },
        fresh: { type: "boolean" },
        checkpoint: { type: "string" },
        headed: { type: "boolean" },
      },
    },
  },
  {
    name: "playtest_key",
    description:
      "Press one ordinary keyboard key, wait until the game is idle, return compact perception plus an image when the view changed.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    name: "playtest_observe",
    description: "Look without pressing a key. detail=full returns the complete player observation.",
    inputSchema: {
      type: "object",
      properties: { detail: { type: "string", enum: ["compact", "full", "motion"] } },
    },
  },
  {
    name: "playtest_checkpoint",
    description:
      "Operator setup for checkpoint sweeps. Returned observation and memory contain no coordinates or debug setup.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "playtest_note",
    description: "Store a mental-map, reaction, or hypothesis on the transcript.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["mental-map", "reaction", "hypothesis", "experience"] },
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "playtest_probe",
    description: "Fetch the current experience or mental-map prompt (answer via playtest_note).",
    inputSchema: {
      type: "object",
      properties: { kind: { type: "string", enum: ["experience", "mental-map"] } },
    },
  },
  {
    name: "playtest_finish",
    description: "End the run. Returns runId; forensic paths stay on disk for a later Director context.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "playtest_start") {
    const result = await session.start(args as StartOptions);
    return textAndImage(result, false);
  }
  if (name === "playtest_key") {
    const result = await session.key(String(args.key ?? ""));
    return textAndImage(result, false);
  }
  if (name === "playtest_observe") {
    const detail = (args.detail as ObserveDetail) ?? "compact";
    const result = await session.observe(detail);
    return textAndImage(result, detail === "full");
  }
  if (name === "playtest_checkpoint") {
    const result = await session.checkpoint(String(args.id));
    return textAndImage(result, false);
  }
  if (name === "playtest_note") {
    const stored = await session.note(
      (args.kind as "mental-map" | "reaction" | "hypothesis" | "experience") ?? "reaction",
      String(args.text ?? "")
    );
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...stored }) }] };
  }
  if (name === "playtest_probe") {
    const probe = await session.probe(args.kind === "mental-map" ? "mental-map" : "experience");
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...probe }) }] };
  }
  if (name === "playtest_finish") {
    const done = await session.finish();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: true,
            runId: done.runId,
            summary: "player-summary.json",
            forensic: "forensic.json",
            replay: "replay.json",
          }),
        },
      ],
    };
  }
  throw new Error(`unknown tool ${name}`);
}

async function handle(msg: Rpc) {
  if (msg.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "onyx-ai-player", version: "1" },
      },
    });
    return;
  }
  if (msg.method === "notifications/initialized" || msg.method === "initialized") return;
  if (msg.method === "tools/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
    return;
  }
  if (msg.method === "tools/call") {
    const name = String(msg.params?.name ?? "");
    const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
    try {
      const result = await callTool(name, args);
      send({ jsonrpc: "2.0", id: msg.id, result });
    } catch (err) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { content: [{ type: "text", text: String(err) }], isError: true },
      });
    }
    return;
  }
  if (msg.method === "ping") {
    send({ jsonrpc: "2.0", id: msg.id, result: {} });
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
  }
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  void drain();
});

async function drain() {
  for (;;) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) return;
      const line = buffer.slice(0, nl).toString("utf8").trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line.startsWith("Content-Length:")) continue;
      try {
        await handle(JSON.parse(line) as Rpc);
      } catch (err) {
        process.stderr.write(`mcp parse: ${err}\n`);
      }
      continue;
    }
    const header = buffer.slice(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = parseInt(match[1], 10);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const json = buffer.slice(start, start + length).toString("utf8");
    buffer = buffer.slice(start + length);
    try {
      await handle(JSON.parse(json) as Rpc);
    } catch (err) {
      process.stderr.write(`mcp parse: ${err}\n`);
    }
  }
}

process.stderr.write("onyx-ai-player MCP ready\n");
