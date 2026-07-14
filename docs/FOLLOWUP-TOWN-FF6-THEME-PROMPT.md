# Prompt: Restyle Town / Hub Menus to Match FF6 Combat Windows

You are a senior frontend / UI engineer on **OnyxLabyrinth** (`/home/sloppymo/OnyxLabyrinth`).

Two reference screenshots are attached:

1. **BEFORE — Town of Edgehollow** (current hub). Warm amber text on near-black, brown separators, amber left-border selection, dungeon key-hint bar still visible above. Reads like a DOS/Wizardry text menu, not SNES FF windows.
2. **AFTER TARGET — Combat action window** (already shipping in this game). Cobalt blue vertical gradient panel, light gray/white border, rounded corners, white ▶ cursor, **selected item in gold/yellow**, unselected in white, small footer under a hairline. This is the authentic SNES / FF6 look to match.

**Goal:** Replace the town / hub “main menu” visual theme so it matches screenshot 2’s chrome. Prefer **reusing** existing `.ff6-window` / `.ff6-menu-item` CSS tokens rather than inventing a third skin.

---

## Non-goals / constraints

- **Do not change game logic** (town actions, gold, shop math, temple/curse, save, party creation).
- **Do not change dungeon corridor renderer** perspective, fog, vignette, CRT, amber edge glow.
- **Do not change combat behavior** or combat window layout that already works in battle.
- **No new npm dependencies.** No WebGL.
- Keep keyboard shortcuts and menu structure (I / + / $ / G / R / > / S, ↑↓ Enter, Esc).
- Follow `AGENTS.md` hard rules. `shell.showMode()` remains the visibility authority.
- Build must pass: `npm run build` (0 TS errors). Run relevant tests if DOM tests exist; `npm test` should still pass.
- Do **not** commit or push unless asked.

---

## Read first

1. `src/styles.css` — especially:
   - `:root` / `--game-font` (already FF36)
   - `.town-*` (~533–580 and related shop/guild/help)
   - `.title-*` (title screen; same brown era look)
   - `.ff6-window`, `.ff6-menu-item`, `.ff6-menu-item.selected`, `.ff6-hint-row` (~1026–1365)
2. `src/engine/town-ui.ts` — markup: `town-header`, `town-gold`, `town-menu`, `town-menu-item`, `tm-marker`, `tm-icon`, `town-help`
3. `src/engine/shell.ts` — `#combat-panel` hosts town/title/camp/party HTML
4. Optional consistency pass targets (same visual language if low-cost):
   - `src/engine/title-ui.ts` (`.title-*`)
   - Party creation / save menus that share brown list styling

**Do not** rewrite dungeon `#hint` / `#message` into blue FF6 chrome unless required for town — dungeon key hint above town in the BEFORE shot is a **mode bleed** bug (town should not show dungeon movement hints).

---

## Exact visual target (match combat chrome)

Extract style from existing combat CSS (screenshot 2 equals these rules):

```css
/* Already in styles.css — reuse these values */
.ff6-window {
  background: linear-gradient(180deg, #3048b0 0%, #1a2c80 55%, #101c58 100%);
  border: 3px solid #e8e8f0;
  border-radius: 8px;
  box-shadow:
    inset 0 0 0 1px #5068c8,
    inset 0 0 0 2px #202c70,
    0 3px 8px rgba(0, 0, 0, 0.6);
}
.ff6-menu-item.selected { color: #ffd769; }
.ff6-menu-item.selected::before {
  content: "\25B6"; /* ▶ */
  color: #f5f0e6;
}
```

**Town menu should look like:**
- One centered FF6-style window (or header strip + menu window) on the dark page background.
- Menu rows: white default, **gold `#ffd769` when selected**, white ▶ (or keep `tm-marker` but restyle to match ▶, not amber bar).
- Remove brown `#2a2620` row borders and amber left selection bar.
- Footer / help line under a subtle light hairline, smaller text (like `.ff6-hint-row`).
- Header: gold title ok; gold or white gold line; party/gold meta in white / dim lavender-gray (`#8890b8`-like) not amber-only DOS look.
- Font: keep `var(--game-font)` / FF36; hard pixels already set globally.

---

## Required product behavior

### 1. Town root menu (primary — must match screenshots)
Restyle `#combat-panel` content for town modes so the BEFORE screen becomes visually congruent with the AFTER window:
- `[T] Town of Edgehollow`
- Gold / party summary
- Inn, Temple, Shop, Guild, Reform Party, Enter Dungeon, Save/Load
- Nav footer

Selection: ▶ + yellow selected label (screenshot 2), not amber left bar (screenshot 1).

### 2. Mode chrome bleed (must fix if present)
When `state.mode === "town"`, the dungeon `#hint` bar (`↑/W forward…`) must **not** appear above the town menu. Use / verify `shell.showMode("town", …)` hides dungeon-only chrome. Same for other hub modes using `#combat-panel`.

### 3. Secondary town screens (same skin, no redesign of flows)
Shop tabs/lists, Temple/Inn status, Guild roster, Reform, Save/Load opened from town — apply the same blue window + white/gold selection language so entering Shop doesn’t snap back to brown DOS lists. Preserve existing layouts and keybindings.

### 4. Title screen (recommended, in-scope if cheap)
`.title-menu` / `.title-menu-item` should share the same FF6 window language so “main menu” feel is consistent from boot → town.

---

## Implementation guidance (preferred approach)

1. **Extract shared tokens** (optional but clean): e.g. CSS variables  
   `--ff6-blue-top`, `--ff6-blue-mid`, `--ff6-blue-bottom`, `--ff6-border`, `--ff6-selected`, `--ff6-muted`  
   used by both `.ff6-window` and town/title.
2. **Prefer CSS-first:** retheme `.town-header`, `.town-menu`, `.town-menu-item`, `.town-help`, `.town-gold` to sit inside an FF6 panel. Minimal HTML changes in `town-ui.ts` (e.g. wrap menu in `<div class="ff6-window town-window">` or add `town-window` class that duplicates `.ff6-window` rules).
3. **Selection marker:** either CSS `::before` ▶ like `.ff6-menu-item.selected`, or restyle `.tm-marker` to white ▶ and drop the amber left border.
4. **Icons** (`[I]`, `[+]`, …): keep bracket keys; mute icon column to white/gold, not amber-brown.
5. Avoid duplicate competing “selected” styles.

**Do not** copy screenshot 2 so literally that town becomes a tiny bottom combat strip — town is a full-panel hub. Scale the FF6 window larger/centered while keeping the same materials (blue fill, border, type, cursor, selected color).

---

## Acceptance criteria (visual)

Compare to the two attachments:

| Check | Pass when |
|-------|-----------|
| Palette | Cobalt blue panel, not amber-on-black list |
| Border | Light `#e8e8f0`-style border + inset depth like combat |
| Selection | Gold text + ▶; no brown highlight bar |
| Type | FF36 / pixel font retained |
| Footer | Hint row inside / under window, combat-like |
| Bleed | No dungeon movement hint bar during town |
| Combat unchanged | Entering a fight still looks like screenshot 2 |
| Shop/guild | Still FF6-skinned, flows unchanged |
| Build | `npm run build` clean |

## Verification steps

1. `npm run build`
2. `npm run dev` or `npx vite preview --port 5176 --base /OnyxLabyrinth/`
3. New Game → Default Party → **Town** — screenshot and compare to attachment 2’s materials
4. Open Shop, Guild, Temple — confirm skin continuity
5. Enter Dungeon — corridor atmosphere unchanged; `#hint` appropriate for dungeon
6. Start Arena / combat — FF6 combat windows unchanged
7. Title screen if you restyled it — screenshot

## Deliverable summary

List files changed, note any HTML wrappers added, call out leftover brown screens if intentionally deferred, and attach before/after town screenshots.

---

## Out of scope

- Redesigning dungeon message box / party strip to FF6 blue (separate task; dungeon chrome may stay amber Wizardry-adjacent).
- Combat menu content changes (Tech footer, spell scroll — other prompts).
- New art assets / font files (FF36 is already in repo).
- Mobile-only redesign beyond making the new town window readable at ~390px width.
