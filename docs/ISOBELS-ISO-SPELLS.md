# Isobel's — Iso-spells

Maintenance note for the optional Floor 1 spell shop.

- Isobel is the `isobel` NPC in `src/content/floors/floor-1.json`, at `(17,28)`, inside a new six-cell nook immediately east of Surveyors' Rest. The single entrance is the door edge between `(15,28)` and `(16,28)`.
- Her `shop` field is a typed `NPCSpellShopDef`; inventory is six spell IDs plus positive integer gold prices.
- Iso-spells carry `acquisition: "iso-shop"`, so `spellsForClass` never grants them through ordinary tier progression.
- `src/game/spell-shop.ts` validates listings, charges party gold once, records `purchasedSpellIds`, and teaches every eligible current caster.
- `purchasedSpellIds` is serialized in save version 17; older saves default to an empty list.
- Isobel's NPC capabilities disable barter, give, steal, and attack. The existing NPC FF6 window owns Browse, confirmation, gold display, and learned-state presentation.
- The deterministic SVG assets are `public/assets/map-sprites/isobel-npc.svg` and `public/assets/wall-features/isobels-sign.svg`.
- The compact `isobels-shelves.svg` wall decal is placed on the nook's back wall so the room reads as stocked without adding furniture or walkable cells.
- Prices are 2,400g / 3,200g / 3,600g for Mage spells and 2,800g / 4,000g / 5,200g for Priest spells. The campaign's measured income is about 6,300g by the end of Floor 5 before discretionary gear spending, making one purchase a plausible late-game choice while the full 21,200g inventory remains a serious sink.
- Isovoid adds a four-strength enemy fizzle aftershock and preserves party Giant Strength; Isostorm deals 60 impact plus three 12-power lightning ticks; Isobarrier prevents 75% of hostile magical damage for eight rounds.
