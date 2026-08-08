# The Camp — PixelLab generation log

Branch: `agent/floor1-camp`
Started: 2026-08-08

## Production rules

- PixelLab.ai MCP is the production generator.
- Inspect current OnyxLabyrinth art before each family.
- Use positive physical descriptions; keep avoid lists short.
- Palette/reference conditioning is opt-in because it can erase canvas,
  timber, dirt, or sky material identity.
- Final visual decisions use native image inspection and raw in-engine views.
- Deterministic checks cover dimensions, alpha, transparent corners, bounding
  box, edge bleed, and color count.
- Edit/inpaint a strong composition before rerolling it.

## MCP baseline

- Connection: streamable HTTP MCP at the configured PixelLab server.
- Production tools available: `create_image_pixen`, `create_image_pixflux`,
  `create_image_pro`, `create_map_object`, `get_image`, `edit_image`, and
  `inpaint_image`.
- Opening subscription balance: 1,812 generations remaining.
- Fast Pixen/PixFlux calls cost one generation; Pro is reserved for a small
  number of hero families where multi-candidate quality justifies 20–40.

## False-sky prototype

| Asset | Role | Logical size | Primitive | Operation | Candidate | Decision | Reason / final path |
|---|---|---:|---|---|---:|---|---|
| camp-sky | false twilight ceiling | 64×64 → 256×256 | regional ceiling texture | deterministic draft | 1 | REJECT | Discrete elliptical clouds repeated as a polka-dot roof. |
| camp-sky | false twilight ceiling | 64×64 → 256×256 | regional ceiling texture | deterministic draft | 2 | KEEP FOR PROTOTYPE | Near-solid navy field survives long views; `public/assets/tilesets/camp/ceiling.png`. |
| camp-sky-star-a/b | sparse celestial marks | 64×64 → 256×256 | ceilingFeature | deterministic draft | 1 | KEEP FOR PROTOTYPE | Three isolated cells prevent a regular star grid; `public/assets/ceiling-features/`. |
| camp-ground-a/b | packed earth | 64×64 → 256×256 | regional floor textures | deterministic draft | 1 | KEEP FOR PROTOTYPE | Establishes worn-earth value and two-cell variation; requires PixelLab production replacement. |
| camp-wall | perimeter masonry | 64×64 → 256×256 | regional wall texture | deterministic draft | 1 | KEEP FOR PROTOTYPE | Keeps the chamber physically in the labyrinth; requires PixelLab production replacement. |

No PixelLab generations were spent before the false-sky gate passed.
