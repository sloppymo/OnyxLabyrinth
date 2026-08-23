#!/usr/bin/env node
import { spawn } from "node:child_process";

const port = process.env.PORT || "5223";
const base = "/OnyxLabyrinth/";

const build = spawn("npm", ["run", "build"], { stdio: "inherit", shell: false });
build.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const preview = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", port, "--strictPort", "--base", base],
    { stdio: "inherit", shell: false }
  );
  console.log(`\nCard Trial playtest build ready at http://127.0.0.1:${port}${base}?debug=1`);
  console.log("Session export: window.__onyxDebug.cardTrial.exportSession()");
  console.log("Keep this process open; Ctrl-C stops the preview.\n");
  const stop = () => preview.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  preview.on("exit", (previewCode) => process.exit(previewCode ?? 0));
});
