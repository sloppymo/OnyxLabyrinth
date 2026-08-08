// PixelLab.ai MCP batch runner for The Camp production-art pass.
//
// This deliberately talks through the configured MCP endpoint via the MCP
// Inspector CLI; it does not use PixelLab's REST generation API. The bearer
// token is read at runtime from ~/.codex/config.toml and is never written to
// the repository or emitted in logs.
//
// Usage:
//   node scripts/pixellab-camp-batch.mjs queue materials
//   node scripts/pixellab-camp-batch.mjs poll

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = "/home/sloppymo/.codex/config.toml";
const MANIFEST_PATH = join(ROOT, "art", "pixellab", "camp-jobs.json");
const CANDIDATE_ROOT = join(ROOT, "art", "pixellab-candidates", "camp");
const MCP_URL = "https://api.pixellab.ai/mcp";
const CONCURRENCY = 6;

const config = readFileSync(CONFIG_PATH, "utf8");
const auth = config.match(/http_headers\s*=\s*\{\s*Authorization\s*=\s*"([^"]+)"/)?.[1];
if (!auth) throw new Error(`PixelLab Authorization header not found in ${CONFIG_PATH}`);

const materialStyle =
  "authentic low-logical-resolution 16-bit pixel art, hard square pixels, limited restrained palette, broad shading clusters, no antialiasing, seamless tile, orthographic surface with no baked perspective";
const heroStyle =
  "single coherent front-facing three-quarter world sprite on transparent background, grounded on the bottom baseline with generous transparent margin, authentic low-resolution 16-bit pixel art, hard pixels, selective dark outline, limited twilight palette, broad shading clusters, strong readable silhouette, practical dungeon-worn construction";
const supportStyle =
  "single practical world prop on transparent background, front-facing three-quarter view, grounded at the bottom with clear padding, authentic low-resolution 16-bit pixel art, hard pixels, limited muted camp palette, selective outline, broad shading clusters, simple readable silhouette, mismatched repairs and believable wear";
const peopleStyle =
  "transparent-background ambient world scene, front-facing three-quarter view, grounded at the bottom with clear padding, authentic low-resolution 16-bit pixel art, hard pixels, limited muted camp palette, selective dark outlines, broad shading clusters, tired practical dungeon-worn adventurers with mismatched equipment rather than glamorous heroes";

const definitions = [
  {
    key: "camp-sky-02",
    family: "materials",
    tool: "create_image_pixen",
    args: {
      description: `Dark false twilight sky texture: near-solid dusty navy and desaturated blue-gray, one enormous charcoal cloud band crossing two tile edges, extremely sparse dim pinprick stars, calm and beautiful, ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      detail: "low detail",
      seed: 81002,
    },
  },
  {
    key: "camp-sky-03",
    family: "materials",
    tool: "create_image_pixen",
    args: {
      description: `Deep muted twilight sky texture: broad near-solid navy field, low-contrast blue-gray tonal drift in enormous irregular pixel clusters, only one tiny faint star, atmospheric and restrained, ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      detail: "low detail",
      seed: 81003,
    },
  },
  {
    key: "camp-ground-01",
    family: "materials",
    tool: "create_image_pixen",
    args: {
      description: `Trampled settlement ground texture: packed dark brown earth, sparse dead olive grass, damp gray mud, embedded tiny old stone fragments, broad worn foot traffic, practical and occupied, ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      detail: "medium detail",
      seed: 81101,
    },
  },
  {
    key: "camp-ground-02",
    family: "materials",
    tool: "create_image_pixen",
    args: {
      description: `Packed dirt courtyard texture for a long-occupied camp: dark umber soil, charcoal damp patches, sparse muted olive and dead straw traces, occasional half-buried flat stones, irregular broad clusters, ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      detail: "medium detail",
      seed: 81102,
    },
  },
  {
    key: "camp-ground-trampled-01",
    family: "materials",
    tool: "create_image_pixen",
    args: {
      description: `Heavily trampled camp path texture: compacted brown-gray earth, two softened cart ruts, flattened straw and sparse dead grass, a few embedded flagstone corners, worn central walking route, ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      detail: "medium detail",
      seed: 81103,
    },
  },
  {
    key: "camp-wall-01",
    family: "materials",
    tool: "create_image_pixen",
    args: {
      description: `Ancient courtyard perimeter masonry texture: large uneven gray-brown stone courses, soot-dark mortar, chipped edges, two restrained root intrusions, salvaged and repaired by settlers, ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      detail: "medium detail",
      seed: 81201,
    },
  },
  {
    key: "camp-wall-02",
    family: "materials",
    tool: "create_image_pixen",
    args: {
      description: `Old labyrinth retaining wall texture used at a camp edge: irregular charcoal and damp gray blocks, rough lime repairs, subtle cracks, one timber brace socket, heavy functional masonry, ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      detail: "medium detail",
      seed: 81202,
    },
  },
  {
    key: "camp-wall-edge-01",
    family: "materials",
    tool: "create_image_pixen",
    args: {
      description: `Ruined courtyard edge masonry texture: ancient dark stone courses interrupted by a crude repaired section of scavenged timber and patched mortar, practical settlement construction, ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      detail: "medium detail",
      seed: 81203,
    },
  },
  {
    key: "camp-sky-04-img2img",
    family: "materials",
    tool: "create_image_pixflux",
    initPath: "art/pixellab/camp-references/camp-sky-draft-128.png",
    args: {
      description: `Refine this exact near-solid false-twilight texture into dusty navy and desaturated blue-gray with only broad low-contrast atmospheric pixel clusters. Preserve its flat seamless composition and restrained values. ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      shading: "flat shading",
      detail: "low detail",
      text_guidance_scale: 10,
      init_image_strength: 430,
      seed: 81301,
    },
  },
  {
    key: "camp-ground-03-img2img",
    family: "materials",
    tool: "create_image_pixflux",
    initPath: "art/pixellab/camp-references/camp-ground-a-draft-128.png",
    args: {
      description: `Refine this exact packed-earth tile with dark umber soil, charcoal damp patches, sparse dead olive grass and a few flattened straw traces. Preserve its seamless flat surface and broad worn route. ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      shading: "basic shading",
      detail: "medium detail",
      text_guidance_scale: 10,
      init_image_strength: 390,
      seed: 81302,
    },
  },
  {
    key: "camp-ground-04-img2img",
    family: "materials",
    tool: "create_image_pixflux",
    initPath: "art/pixellab/camp-references/camp-ground-b-draft-128.png",
    args: {
      description: `Refine this companion packed-earth tile with dark brown dirt, softened cart wear, sparse trampled olive growth and embedded tiny gray stones. Preserve the seamless flat composition and match the same camp-ground family. ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      shading: "basic shading",
      detail: "medium detail",
      text_guidance_scale: 10,
      init_image_strength: 390,
      seed: 81303,
    },
  },
  {
    key: "camp-wall-03-img2img",
    family: "materials",
    tool: "create_image_pixflux",
    initPath: "art/pixellab/camp-references/camp-wall-draft-128.png",
    args: {
      description: `Refine this exact old courtyard masonry tile: uneven damp gray-brown stone courses, soot-dark mortar, restrained chips and rough practical repairs. Preserve the seamless front-facing wall composition. ${materialStyle}`,
      width: 128,
      height: 128,
      no_background: false,
      outline: "lineless",
      shading: "basic shading",
      detail: "medium detail",
      text_guidance_scale: 10,
      init_image_strength: 410,
      seed: 81304,
    },
  },
  {
    key: "camp-wall-04-inpaint",
    family: "materials",
    tool: "inpaint_image",
    imagePath: "art/pixellab-candidates/camp/materials/camp-wall-02.png",
    args: {
      description: "Continue the same irregular old gray masonry courses through this lower strip, matching the existing blocks, cracks, palette, mortar, and hard-pixel style at the mask boundary.",
      mask_x: 0,
      mask_y: 110,
      mask_width: 128,
      mask_height: 18,
      crop_to_mask: true,
      no_background: false,
      seed: 81305,
    },
  },
  {
    key: "camp-ground-05-edit",
    family: "materials",
    tool: "edit_image",
    imagesPath: ["art/pixellab-candidates/camp/materials/camp-ground-02.png"],
    args: {
      description: "Keep the exact flat top-down pixel texture and earthy palette. Consolidate most bright rocks and vivid sprouts into broad packed dark-earth patches, leaving only sparse tiny stones, dead olive grass, damp gray mud, and worn foot traffic.",
      width: 128,
      height: 128,
      no_background: false,
      seed: 81306,
    },
  },
  {
    key: "camp-tent-large-01",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Large settlement pavilion tent dividing a room: broad ridge roof, heavy patched gray-tan canvas, mismatched repairs, thick timber poles, taut ropes and pegged lower edge, partly open front flap, ${heroStyle}`,
      width: 160,
      height: 112,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82001,
    },
  },
  {
    key: "camp-tent-large-02",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Substantial improvised command tent: asymmetrical canvas pavilion with a short side awning, dark weathered cloth, visible stitch patches, salvaged timber uprights and useful tied-back entrance, ${heroStyle}`,
      width: 160,
      height: 112,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82002,
    },
  },
  {
    key: "camp-wagon-01",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Large covered supply wagon landmark: chunky dark timber body, two clearly constructed worn wheels, patched gray canvas hoop cover, rope lashings, crates visible at the open rear, one repaired wheel spoke, ${heroStyle}`,
      width: 160,
      height: 112,
      no_background: true,
      view: "low top-down",
      direction: "west",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82101,
    },
  },
  {
    key: "camp-wagon-02",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Dungeon-worn covered merchant wagon in front three-quarter view: heavy plank bed, mismatched wheels, patched muted canvas canopy, tied bedroll and supply sacks, believable axles and braces, ${heroStyle}`,
      width: 160,
      height: 112,
      no_background: true,
      view: "low top-down",
      direction: "east",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82102,
    },
  },
  {
    key: "camp-fire-01",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Large communal campfire composition: low rough-stone fire ring, crossed charred logs, restrained amber flame, blackened iron cooking tripod and suspended pot, ash and two split-log seats, ${heroStyle}`,
      width: 96,
      height: 80,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82201,
    },
  },
  {
    key: "camp-fire-02",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Busy but readable communal fire: broad stone ring, settled coals and modest orange-yellow flames, iron spit frame with soot-black kettle, nearby poker and chopped log, ${heroStyle}`,
      width: 96,
      height: 80,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82202,
    },
  },
  {
    key: "camp-dead-tree-01",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Large dead tree landmark: thick split charcoal-brown trunk, five stark crooked limbs, starved bark, roots gripping a few ancient masonry fragments, one root extending subtly sideways, natural rather than magical, ${heroStyle}`,
      width: 96,
      height: 160,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82301,
    },
  },
  {
    key: "camp-dead-tree-02",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Tall strange dead courtyard tree: weathered forked trunk, sparse broken branches, exposed roots entangled with one squared dungeon stone, rope tie and faded cloth strip left by campers, quiet physical wrongness, ${heroStyle}`,
      width: 96,
      height: 160,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82302,
    },
  },
  {
    key: "camp-supply-stack-01",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Large coherent supply mound: five mismatched timber crates, three tied burlap sacks and two banded barrels stacked for stability under a small patched tarp, ropes and practical labels represented only by simple marks, ${heroStyle}`,
      width: 128,
      height: 96,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82401,
    },
  },
  {
    key: "camp-supply-stack-02",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Quartermaster supply pile with believable weight: uneven crates, patched grain sacks, one small barrel, bundled poles, rolled canvas and rope secured against collapse, improvised and heavily used, ${heroStyle}`,
      width: 128,
      height: 96,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82402,
    },
  },
  {
    key: "camp-smith-work-area-01",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Readable camp equipment work zone as one composition: scarred timber workbench, small practical anvil, hand-crank grindstone, tongs and two repairable weapons, rough awning post, warm work lantern, ${heroStyle}`,
      width: 160,
      height: 112,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82501,
    },
  },
  {
    key: "camp-smith-work-area-02",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Improvised armorer repair station: low plank bench on salvaged stone supports, compact anvil, foot grindstone, shield in repair clamps, hammer and organized tool pegs, soot and honest wear, ${heroStyle}`,
      width: 160,
      height: 112,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82502,
    },
  },
  {
    key: "camp-map-table-01",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Large expedition planning table: broad battered plank top, one unfurled abstract labyrinth map with simple lines only, weighted corners, compass, candle stub, four mismatched stools and packs underneath, ${heroStyle}`,
      width: 128,
      height: 88,
      no_background: true,
      view: "high top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82601,
    },
  },
  {
    key: "camp-map-table-02",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Horizontal adventurer map table landmark: thick scavenged wood on ancient stone-block legs, hand-drawn route sheet, markers, lantern and two rolled charts, repaired uneven construction, ${heroStyle}`,
      width: 128,
      height: 88,
      no_background: true,
      view: "high top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82602,
    },
  },
  {
    key: "camp-palisade-checkpoint-01",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Rough settlement checkpoint element: uneven sharpened timber palisade section, open central passage, braced watch platform, faded plain cloth banner, rope ties and one lantern hook, clearly improvised at a dungeon arch, ${heroStyle}`,
      width: 160,
      height: 128,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82701,
    },
  },
  {
    key: "camp-palisade-checkpoint-02",
    family: "heroes",
    tool: "create_image_pixen",
    args: {
      description: `Salvaged camp gate checkpoint: two crude timber towers joined by a simple crossbeam and canvas rain strip, open doorway, diagonal braces, notice board and practical hanging lamp, settlement ahead rather than fortress, ${heroStyle}`,
      width: 160,
      height: 128,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 82702,
    },
  },
  {
    key: "camp-tent-small-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Small low sleeping tent with patched gray-brown canvas, short ridge pole, tied flap and visible peg ropes, occupied and repaired rather than pristine, ${supportStyle}`,
      width: 128,
      height: 96,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83001,
    },
  },
  {
    key: "camp-tent-collapsed-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Collapsed camp tent as a low coherent mound: torn muted canvas folded over one snapped pole, loose rope, two pegs and a rolled blanket rescued from beneath it, ${supportStyle}`,
      width: 128,
      height: 80,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83002,
    },
  },
  {
    key: "camp-handcart-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Rough two-handled supply handcart with one pair of worn timber wheels, believable axle, plank bed, rope coil and two sacks, one repaired handle brace, ${supportStyle}`,
      width: 112,
      height: 80,
      no_background: true,
      view: "low top-down",
      direction: "west",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83101,
    },
  },
  {
    key: "camp-crate-stack-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Stable stack of four mismatched dark timber supply crates, iron corners, simple painted inventory marks rather than text, one lid repaired with a cross brace, ${supportStyle}`,
      width: 96,
      height: 80,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83102,
    },
  },
  {
    key: "camp-barrel-stack-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Three squat banded camp barrels stored together with two upright and one on a timber chock, dark stained staves, patched hoop and small bung, ${supportStyle}`,
      width: 96,
      height: 80,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83103,
    },
  },
  {
    key: "camp-bedrolls-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Cluster of three used adventurer bedrolls: one open blanket and two tied rolls, mismatched muted cloth, small boots and waterskin nearby, low horizontal composition, ${supportStyle}`,
      width: 112,
      height: 72,
      no_background: true,
      view: "high top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83201,
    },
  },
  {
    key: "camp-gear-pile-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Tired adventuring party gear pile: four packs, coiled rope, rolled cloaks, one plain shield and bundled tools arranged for use, mismatched and dungeon-worn, ${supportStyle}`,
      width: 112,
      height: 80,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83202,
    },
  },
  {
    key: "camp-weapon-rack-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Crude freestanding weapon rack made from scavenged lumber, holding two plain spears, two worn swords and a small axe with believable slots and weight, ${supportStyle}`,
      width: 96,
      height: 96,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83301,
    },
  },
  {
    key: "camp-armor-rack-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Rough timber armor stand holding one dented plain breastplate, mismatched shoulder plates, helmet and leather straps, repair tags shown as simple tied cloth, ${supportStyle}`,
      width: 96,
      height: 96,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83302,
    },
  },
  {
    key: "camp-grindstone-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Foot-powered sharpening wheel on a low repaired timber frame, gray stone disc, pedal linkage, water cup and small tray of filings, functional construction, ${supportStyle}`,
      width: 96,
      height: 80,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83401,
    },
  },
  {
    key: "camp-cookpot-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Soot-black communal stew pot hanging from a simple three-pole cooking tripod over low coals, wooden ladle and chopped root vegetables on one board, ${supportStyle}`,
      width: 96,
      height: 80,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83402,
    },
  },
  {
    key: "camp-lantern-post-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Tall rough timber camp lantern post with diagonal brace, rope-wrapped base and one modest warm iron lantern, slightly leaning but structurally sound, ${supportStyle}`,
      width: 64,
      height: 128,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83501,
    },
  },
  {
    key: "camp-banner-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Tall plain settlement banner pole: salvaged dark timber, faded desaturated ochre cloth with one simple stripe, frayed lower edge, rope ties and heavy stone foot, ${supportStyle}`,
      width: 64,
      height: 144,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83502,
    },
  },
  {
    key: "camp-rough-fence-01",
    family: "support",
    tool: "create_image_pixen",
    args: {
      description: `Low rough camp fence segment built from mismatched horizontal rails and uneven posts, rope lashings, one replaced board and open gaps, practical route divider, ${supportStyle}`,
      width: 128,
      height: 72,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 83601,
    },
  },
  {
    key: "camp-adventurer-cards-01",
    family: "people",
    tool: "create_image_pixen",
    args: {
      description: `Two visibly different adventurers seated on low stools at a tiny crate-table playing cards: one stocky in partial armor, one slim and cloaked, relaxed tired posture, cards and tin cups clearly visible, ${peopleStyle}`,
      width: 128,
      height: 96,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 84001,
    },
  },
  {
    key: "camp-adventurer-sleeping-01",
    family: "people",
    tool: "create_image_pixen",
    args: {
      description: `One exhausted cloaked adventurer sleeping curled on a worn bedroll, boots still on, pack used as pillow, one hand near a sheathed short sword, low horizontal silhouette, ${peopleStyle}`,
      width: 96,
      height: 80,
      no_background: true,
      view: "high top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 84002,
    },
  },
  {
    key: "camp-adventurer-sharpening-01",
    family: "people",
    tool: "create_image_pixen",
    args: {
      description: `One broad armored fighter seated on an upturned crate, calmly sharpening a plain sword with a whetstone across the knees, helmet beside one boot, practical absorbed pose, ${peopleStyle}`,
      width: 96,
      height: 96,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 84101,
    },
  },
  {
    key: "camp-adventurer-map-study-01",
    family: "people",
    tool: "create_image_pixen",
    args: {
      description: `Two mismatched adventurers leaning over a small expedition table studying a simple route map: a short hooded scout pointing and a tall lightly armored delver listening, packs at their feet, ${peopleStyle}`,
      width: 128,
      height: 96,
      no_background: true,
      view: "high top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 84102,
    },
  },
  {
    key: "camp-adventurer-stew-01",
    family: "people",
    tool: "create_image_pixen",
    args: {
      description: `One practical middle-aged camp cook kneeling beside a soot-black stew pot, stirring with a long ladle and tasting from a wooden spoon, apron over mismatched light armor, ${peopleStyle}`,
      width: 96,
      height: 96,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 84201,
    },
  },
  {
    key: "camp-adventurer-wounded-01",
    family: "people",
    tool: "create_image_pixen",
    args: {
      description: `One wounded adventurer sitting heavily against a supply crate, one leg bandaged and extended, dented round shield nearby, exhausted alert face, practical layered clothing, ${peopleStyle}`,
      width: 96,
      height: 96,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 84202,
    },
  },
  {
    key: "camp-adventurer-shield-repair-01",
    family: "people",
    tool: "create_image_pixen",
    args: {
      description: `One small sturdy adventurer kneeling at a low block repairing a cracked plain shield with hammer and rivets, rolled sleeves, tool pouch and concentrated posture, ${peopleStyle}`,
      width: 96,
      height: 96,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 84301,
    },
  },
  {
    key: "camp-adventurer-packing-01",
    family: "people",
    tool: "create_image_pixen",
    args: {
      description: `Two tired party members preparing packs together: one kneeling to tighten a bedroll strap while a taller cloaked companion checks rope and waterskins, distinct silhouettes and organized travel gear, ${peopleStyle}`,
      width: 128,
      height: 96,
      no_background: true,
      view: "low top-down",
      outline: "selective outline",
      detail: "medium detail",
      seed: 84302,
    },
  },
  {
    key: "camp-adventurer-watch-01",
    family: "people",
    tool: "create_image_pixen",
    args: {
      description: `One lean standing camp watch keeper in a patched cloak over light armor, plain spear held at rest, lantern at the belt, observant tired stance rather than combat pose, ${peopleStyle}`,
      width: 64,
      height: 112,
      no_background: true,
      view: "side",
      outline: "selective outline",
      detail: "medium detail",
      seed: 84401,
    },
  },
];

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function saveManifest(manifest) {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function mcpCall(toolName, args) {
  const inspectorArgs = [
    "-y",
    "@modelcontextprotocol/inspector",
    "--cli",
    "--server-url",
    MCP_URL,
    "--transport",
    "http",
    "--header",
    `Authorization: ${auth}`,
    "--method",
    "tools/call",
    "--tool-name",
    toolName,
    "--tool-args-json",
    JSON.stringify(args),
    "--format",
    "json",
  ];
  const { stdout, stderr } = await execFileAsync("npx", inspectorArgs, {
    cwd: ROOT,
    maxBuffer: 24 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (stderr && !stderr.includes("npm warn")) process.stderr.write(stderr);
  const parsed = JSON.parse(stdout);
  if (parsed.result?.isError) {
    const message = parsed.result.content?.map((part) => part.text ?? "").join("\n");
    throw new Error(`${toolName} failed: ${message}`);
  }
  return parsed.result?.content ?? [];
}

async function queueFamily(family) {
  const manifest = loadManifest();
  const existing = new Set(manifest.jobs.map((job) => job.key));
  const pending = definitions.filter((def) => def.family === family && !existing.has(def.key));
  console.log(`Queueing ${pending.length} ${family} jobs through PixelLab MCP...`);
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    const queued = await Promise.all(
      batch.map(async (def) => {
        let callArgs = def.args;
        if (def.initPath) {
          callArgs = {
            ...callArgs,
            init_image_base64: readFileSync(join(ROOT, def.initPath)).toString("base64"),
          };
        }
        if (def.imagePath) {
          callArgs = {
            ...callArgs,
            image_base64: readFileSync(join(ROOT, def.imagePath)).toString("base64"),
          };
        }
        if (def.imagesPath) {
          callArgs = {
            ...callArgs,
            images_base64: def.imagesPath.map((path) =>
              readFileSync(join(ROOT, path)).toString("base64")
            ),
          };
        }
        const content = await mcpCall(def.tool, callArgs);
        const text = content.find((part) => part.type === "text")?.text ?? "";
        const jobId = text.match(/\bid:\s*([0-9a-f-]{36})/i)?.[1];
        if (!jobId && /rate limit exceeded/i.test(text)) {
          console.log(`  ${def.key}: deferred by PixelLab concurrency limit`);
          return null;
        }
        if (!jobId) throw new Error(`No job id returned for ${def.key}: ${text}`);
        console.log(`  ${def.key}: ${jobId}`);
        return {
          key: def.key,
          family: def.family,
          tool: def.tool,
          jobId,
          args: def.args,
          ...(def.initPath ? { initPath: def.initPath } : {}),
          ...(def.imagePath ? { imagePath: def.imagePath } : {}),
          ...(def.imagesPath ? { imagesPath: def.imagesPath } : {}),
          status: "processing",
          outputPaths: [],
        };
      })
    );
    manifest.jobs.push(...queued.filter(Boolean));
    saveManifest(manifest);
  }
}

async function inspectJob(job) {
  const content = await mcpCall("get_image", { job_id: job.jobId });
  const text = content.find((part) => part.type === "text")?.text ?? "";
  if (/status:\s*processing/i.test(text)) return false;
  if (/status:\s*failed/i.test(text)) {
    job.status = "failed";
    job.error = text;
    return true;
  }
  const images = content.filter((part) => part.type === "image" && part.data);
  if (!images.length) throw new Error(`Completed ${job.key} returned no image: ${text}`);
  const outDir = join(CANDIDATE_ROOT, job.family);
  mkdirSync(outDir, { recursive: true });
  job.outputPaths = images.map((part, index) => {
    const suffix = images.length === 1 ? "" : `-${String.fromCharCode(97 + index)}`;
    const path = join(outDir, `${job.key}${suffix}.png`);
    writeFileSync(path, Buffer.from(part.data, "base64"));
    return path.slice(ROOT.length + 1);
  });
  job.status = "completed";
  job.result = text;
  console.log(`  saved ${job.key}: ${job.outputPaths.join(", ")}`);
  return true;
}

async function poll() {
  for (;;) {
    const manifest = loadManifest();
    const pending = manifest.jobs.filter((job) => job.status === "processing");
    if (!pending.length) {
      console.log("No pending PixelLab Camp jobs.");
      return;
    }
    console.log(`Polling ${pending.length} PixelLab jobs...`);
    let changed = false;
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const settled = await Promise.all(pending.slice(i, i + CONCURRENCY).map(inspectJob));
      changed ||= settled.some(Boolean);
      saveManifest(manifest);
    }
    if (!manifest.jobs.some((job) => job.status === "processing")) return;
    if (!changed) await new Promise((resolve) => setTimeout(resolve, 8000));
  }
}

const [command, family] = process.argv.slice(2);
if (command === "queue" && family) await queueFamily(family);
else if (command === "poll") await poll();
else {
  console.error("Usage: pixellab-camp-batch.mjs queue <family> | poll");
  process.exit(1);
}
