/**
 * Generates a static, browsable catalog of the combat bark library for
 * human editorial review. Output is gitignored (see AGENTS.md — root
 * *-preview.html files are generated on demand, not committed).
 *
 * Run: npx tsx scripts/generate-combat-bark-preview.ts
 * Open: combat-bark-preview.html
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ALL_BARK_PROFILES, BARK_SILENT_EXCLUSIONS } from "../src/data/combat-bark-library/index";
import type { CombatBarkProfile } from "../src/data/combat-bark-library/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../combat-bark-preview.html");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function kindLabel(kind: string): string {
  if (kind === "class") return "PC";
  if (kind === "companion") return "Companion";
  return "Enemy";
}

function renderProfile(p: CombatBarkProfile): string {
  const triggerBlocks = Object.entries(p.pools)
    .map(([trigger, lines]) => {
      const rows = (lines ?? [])
        .map((l) => {
          const badges: string[] = [];
          if (l.chemistryId) badges.push(`<span class="badge chem">${esc(l.chemistryId)}</span>`);
          if (l.abilityId) badges.push(`<span class="badge ability">${esc(l.abilityId)}</span>`);
          if (l.status) badges.push(`<span class="badge status">${esc(l.status)}</span>`);
          if (l.oncePerCombat) badges.push(`<span class="badge once">once/combat</span>`);
          const len = l.text.length;
          const lenClass = len > 45 ? "len-hardfail" : len > 28 ? "len-warn" : "len-ok";
          return `<li class="line" data-text="${esc(l.text.toLowerCase())}"><span class="text">${esc(l.text)}</span><span class="${lenClass}">${len}</span>${badges.join("")}</li>`;
        })
        .join("");
      return `<div class="trigger-block" data-trigger="${esc(trigger)}"><h4>${esc(trigger)} <span class="count">(${(lines ?? []).length})</span></h4><ul class="lines">${rows}</ul></div>`;
    })
    .join("");

  const totalLines = Object.values(p.pools).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);

  return `
  <section class="profile" data-kind="${esc(p.kind)}" data-voice="${esc(p.voiceMode)}" data-id="${esc(p.id)}" data-name="${esc(p.displayName.toLowerCase())}">
    <header>
      <h3>${esc(p.displayName)} <code>${esc(p.id)}</code></h3>
      <div class="meta">
        <span class="pill kind-${esc(p.kind)}">${esc(kindLabel(p.kind))}</span>
        <span class="pill voice-${esc(p.voiceMode)}">${esc(p.voiceMode)}</span>
        <span class="pill count">${totalLines} lines</span>
      </div>
      <p class="voice-summary">${esc(p.voiceSummary)}</p>
    </header>
    <div class="triggers">${triggerBlocks}</div>
  </section>`;
}

const excludedSection = `
  <section class="profile excluded">
    <header>
      <h3>Intentionally excluded</h3>
    </header>
    <ul class="lines">
      ${BARK_SILENT_EXCLUSIONS.map((e) => `<li><code>${esc(e.id)}</code> — ${esc(e.reason)}</li>`).join("")}
    </ul>
  </section>`;

const sorted = [...ALL_BARK_PROFILES].sort((a, b) => {
  const order = { class: 0, companion: 1, enemy: 2 } as const;
  const ao = order[a.kind];
  const bo = order[b.kind];
  if (ao !== bo) return ao - bo;
  return a.displayName.localeCompare(b.displayName);
});

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Combat Bark Preview</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 0; background: #14141a; color: #e8e6f0; }
  header.top { position: sticky; top: 0; background: #1c1c26; padding: 12px 20px; border-bottom: 1px solid #33333f; z-index: 10; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  header.top h1 { font-size: 16px; margin: 0; margin-right: 12px; }
  header.top input, header.top select { background: #24242f; color: #e8e6f0; border: 1px solid #3a3a48; border-radius: 4px; padding: 6px 8px; font-size: 13px; }
  main { padding: 20px; max-width: 1100px; margin: 0 auto; }
  .profile { background: #1c1c26; border: 1px solid #2c2c38; border-radius: 8px; margin-bottom: 16px; padding: 14px 18px; }
  .profile header h3 { margin: 0 0 4px; font-size: 16px; }
  .profile header h3 code { font-size: 11px; color: #9a97b0; font-weight: normal; margin-left: 6px; }
  .meta { display: flex; gap: 6px; margin-bottom: 6px; }
  .pill { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: #2c2c3c; color: #b8b5c8; }
  .pill.kind-class { background: #1e3a5f; color: #9ecbff; }
  .pill.kind-companion { background: #4a2f5f; color: #d9a9ff; }
  .pill.kind-enemy { background: #4f2020; color: #ff9d9d; }
  .pill.voice-articulate { background: #22432b; color: #8fe0a4; }
  .pill.voice-fragmentary { background: #453b18; color: #e0c98f; }
  .pill.voice-vocalization { background: #1d3a44; color: #8fd6e0; }
  .pill.voice-silent { background: #2a2a2a; color: #999; }
  .voice-summary { font-size: 12px; color: #a8a5ba; margin: 4px 0 10px; font-style: italic; }
  .trigger-block { margin-bottom: 8px; }
  .trigger-block h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #8a87a0; margin: 8px 0 4px; }
  .trigger-block h4 .count { color: #5a5870; }
  ul.lines { list-style: none; margin: 0; padding: 0; }
  li.line { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 14px; border-bottom: 1px dotted #26262f; }
  li.line .text { flex: 1; }
  li.line .len-ok { font-size: 10px; color: #5a5870; }
  li.line .len-warn { font-size: 10px; color: #e0c98f; }
  li.line .len-hardfail { font-size: 10px; color: #ff6b6b; font-weight: bold; }
  .badge { font-size: 9px; padding: 1px 6px; border-radius: 8px; background: #2c2c3c; color: #9a97b0; }
  .badge.chem { background: #3a1e4a; color: #d9a9ff; }
  .badge.ability { background: #1e2e4a; color: #9ecbff; }
  .badge.once { background: #4a3a1e; color: #ffcf9e; }
  .excluded ul.lines li { font-size: 13px; color: #a8a5ba; padding: 4px 0; }
  .hidden { display: none !important; }
  .stats { font-size: 12px; color: #8a87a0; margin-left: auto; }
</style>
</head>
<body>
<header class="top">
  <h1>Combat Bark Preview</h1>
  <input id="search" type="text" placeholder="search text or id...">
  <select id="kindFilter">
    <option value="">All kinds</option>
    <option value="class">PC</option>
    <option value="companion">Companion</option>
    <option value="enemy">Enemy</option>
  </select>
  <select id="voiceFilter">
    <option value="">All voice modes</option>
    <option value="articulate">articulate</option>
    <option value="fragmentary">fragmentary</option>
    <option value="vocalization">vocalization</option>
    <option value="silent">silent</option>
  </select>
  <label style="font-size:12px;"><input type="checkbox" id="longOnly"> long lines only (&gt;28)</label>
  <span class="stats" id="stats"></span>
</header>
<main id="main">
${sorted.map(renderProfile).join("\n")}
${excludedSection}
</main>
<script>
  const search = document.getElementById("search");
  const kindFilter = document.getElementById("kindFilter");
  const voiceFilter = document.getElementById("voiceFilter");
  const longOnly = document.getElementById("longOnly");
  const profiles = Array.from(document.querySelectorAll(".profile:not(.excluded)"));
  const stats = document.getElementById("stats");

  function apply() {
    const q = search.value.trim().toLowerCase();
    const kind = kindFilter.value;
    const voice = voiceFilter.value;
    const onlyLong = longOnly.checked;
    let visibleProfiles = 0, visibleLines = 0;
    for (const p of profiles) {
      const pKind = p.dataset.kind, pVoice = p.dataset.voice, pId = p.dataset.id, pName = p.dataset.name;
      let anyLineVisible = false;
      const lineEls = p.querySelectorAll("li.line");
      for (const li of lineEls) {
        const text = li.dataset.text || "";
        const len = parseInt(li.querySelector(".len-ok,.len-warn,.len-hardfail")?.textContent || "0", 10);
        const matchesQ = !q || text.includes(q) || pId.includes(q) || pName.includes(q);
        const matchesLong = !onlyLong || len > 28;
        const show = matchesQ && matchesLong;
        li.classList.toggle("hidden", !show);
        if (show) { anyLineVisible = true; visibleLines++; }
      }
      const matchesKind = !kind || pKind === kind;
      const matchesVoice = !voice || pVoice === voice;
      const show = matchesKind && matchesVoice && anyLineVisible;
      p.classList.toggle("hidden", !show);
      if (show) visibleProfiles++;
    }
    stats.textContent = visibleProfiles + " profiles, " + visibleLines + " lines shown";
  }
  [search, kindFilter, voiceFilter, longOnly].forEach((el) => el.addEventListener("input", apply));
  apply();
</script>
</body>
</html>
`;

writeFileSync(OUT, html, "utf8");
console.log(`Wrote ${OUT}`);
