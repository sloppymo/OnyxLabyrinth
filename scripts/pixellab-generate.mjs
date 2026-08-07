// Reusable PixelLab API sprite generator.
// Usage:
//   node scripts/pixellab-generate.mjs --description "..." --out path.png \
//     [--palette path.png] [--size 64x64] [--background]
//
// Reads PIXELLAB_API_KEY from .env. Palette image (if given) forces the
// output color palette to match an existing sprite via PixelLab's
// color_image param, so results don't drift from this game's art style.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function loadEnvKey(name) {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const match = env.split("\n").find((line) => line.startsWith(`${name}=`));
  if (!match) throw new Error(`${name} not found in .env`);
  return match.slice(name.length + 1).trim();
}

function parseArgs(argv) {
  const args = { size: "64x64", background: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--description") args.description = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--palette") args.palette = argv[++i];
    else if (a === "--size") args.size = argv[++i];
    else if (a === "--background") args.background = true;
  }
  if (!args.description || !args.out) {
    throw new Error('Required: --description "..." --out path.png');
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const [width, height] = args.size.split("x").map(Number);
const apiKey = loadEnvKey("PIXELLAB_API_KEY");

const body = {
  description: args.description,
  image_size: { width, height },
  no_background: !args.background,
};

if (args.palette) {
  body.color_image = {
    type: "base64",
    base64: readFileSync(args.palette).toString("base64"),
  };
}

const res = await fetch("https://api.pixellab.ai/v2/create-image-pixflux", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, Buffer.from(data.image.base64, "base64"));

console.log(`Saved ${args.out}`);
console.log("Cost:", data.usage);
