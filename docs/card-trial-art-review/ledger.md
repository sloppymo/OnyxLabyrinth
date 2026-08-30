# Card Trial production-art ledger

This ledger is copied from `src/game/card-trial/cards.ts`; the source file remains authoritative.
The live source contains 24 unique card IDs (24 entries across the two 12-card lists).

## Inventory

| Card ID | Name | Hero | Cost | Exact rules | Art status at pass start |
| --- | --- | --- | ---: | --- | --- |
| `nip` | Nip | Rat King | 1 | Deal 5. | Existing final |
| `fight-dirty` | Fight Dirty | Rat King | 1 | Reveal 3 Dirty Tricks. Choose 1; it costs 0. | New generated pilot art |
| `brace` | Brace | Rat King | 1 | Gain 6 Barrier. | Missing |
| `open-the-rank` | Open the Rank | Rat King | 1 | Deal 4. Open the target. | Missing |
| `from-the-dark` | From the Dark | Rat King | 1 | Deal 4. Open the target. Back: if Rat lives, it bites 3. | Missing |
| `swarm-the-wound` | Swarm the Wound | Rat King | 1 | Deal 5. Consume Opened: deal 4 more to that enemy. | Existing final |
| `burst-the-nest` | Burst the Nest | Rat King | 2 | Deal 8. Consume Opened: deal 4 to every other enemy. | Missing |
| `litter` | Litter | Rat King | 1 | Deal 4. If no Rat exists, spawn it on your row. | Missing |
| `send-the-rat` | Send the Rat | Rat King | 1 | If Rat exists, move it to the other row, then it bites 5. If none exists, deal 4 yourself. | Missing |
| `tide` | Tide | Rat King | 1 | Deal 5. Front: +3. | Existing final |
| `lunge` | Lunge | Rat King | 1 | Move to Front, then deal 5. | Missing |
| `king-of-the-heap` | King of the Heap | Rat King | 2 | Deal 7 and gain 8 Barrier. Front: +3 damage. | Existing final |
| `the-staff-speaks` | The Staff Speaks | Old Man | 1 | Deal 6. Hush next intent. | Existing final |
| `pale-ward` | Pale Ward | Old Man | 1 | Gain 7 Barrier. | Missing |
| `faultline` | Faultline | Old Man | 1 | Deal 5. Open the target. | Missing |
| `marrow-divide` | Marrow Divide | Old Man | 1 | Deal 4. Open the target. | Missing |
| `full-stop` | Full Stop | Old Man | 2 | Deal 8. Consume Opened: deal 8 more to that enemy. | Missing |
| `sever-the-thread` | Sever the Thread | Old Man | 1 | Deal 5. Consume Opened: deal 5 to a second enemy. | Missing |
| `the-threshold` | The Threshold | Old Man | 1 | Arm an Omen: when the target acts, deal 7 before its intent. | Missing |
| `distant-hand` | Distant Hand | Old Man | 1 | Deal 5. Back: gain 3 Barrier. | Missing |
| `parting-word` | Parting Word | Old Man | 1 | Deal 4, then move to Back. | Missing |
| `unlight` | Unlight | Old Man | 2 | Deal 4 to every enemy. | Missing |
| `last-bastion` | Last Bastion | Old Man | 2 | Deal 8 and gain 9 Barrier. Front: +3 damage. | Missing |
| `improvised-theorem` | Improvised Theorem | Old Man | 1 | Reveal 3 Arcane Responses. Choose 1; it costs 0. | New generated pilot art |

## Art direction and review

### Rat King family

| Card | Primary visual verb | Composition / dominant silhouette | Secondary element | Palette / background | Must include / avoid |
| --- | --- | --- | --- | --- | --- |
| Brace | brace | Low Rat King, cloak pulled wide like a barrier; cloak owns the frame. | One blocked impact mark or dark enemy edge. | Near-black fur, restrained red cloak, dull gold crown; simple stone floor. | Crown, red cloak, dark fur; no armor or shield UI. |
| Open the Rank | expose | Rat King cuts a narrow diagonal opening through one enemy mass. | Single opened enemy silhouette. | Black, red, dull steel, one muted wound-red accent; dark wall seam. | One target / one opening gesture; no multiple permanent wounds. |
| From the Dark | ambush | Rat King emerges from a black recess toward a single enemy; cloak trails backward. | One small living Rat ahead of him. | Black recess, brown-gray stone, dark red and gold. | Read as a back-row ambush; no rat corpse or timer. |
| Burst the Nest | overwhelm | Rat King at a low edge while a compact rat burst breaks around one opened target toward the other enemies. | Three large rat silhouettes, not a detailed swarm. | Sickly dungeon green/gray with restrained red and gold. | Splash direction; no glowing orb or dozens of particles. |
| Litter | spawn | Empty floor crack at left; a single Rat emerges while Rat King gestures from the opposite edge. | Nest crack / first Rat. | Near-black, brown, muted red, one dull gold. | One readable Rat; no claim that it dies or expires. |
| Send the Rat | reposition | A Rat travels on a hard horizontal/diagonal path between rows; Rat King remains a small directing silhouette. | One hooded enemy destination. | Dungeon brown/gray, red cloak accent, dark teal shadow. | Directional movement; avoid a pile of identical rats. |
| Lunge | rush | Rat King crosses into the foreground on a strong forward diagonal, cloak streaming behind. | Single enemy edge or impact wedge. | Red cloak against slate stone, gold crown highlight. | Clear movement into Front; no generic standing pose. |

### Old Man family

| Card | Primary visual verb | Composition / dominant silhouette | Secondary element | Palette / background | Must include / avoid |
| --- | --- | --- | --- | --- | --- |
| Pale Ward | ward | Old Man plants the staff and braces a compact angular ward around himself. | Thin pale-gold/blue block shape. | Blue-purple robe, dull gold wrap, brown staff, dark arch. | Defensive posture; no literal HUD shield or rune circle. |
| Faultline | fracture | Staff lands against one enemy silhouette; a single hard crack splits the target's shape. | One opened enemy seam. | Near-black, muted blue, brown, restrained violet/red. | One target and one fracture; no blood spray. |
| Marrow Divide | split | Close staff strike against a bone-white enemy limb or mask, with one diagonal break. | Sparse bone fragments. | Robe blue-purple, bone pale, dark stone. | Chunky fracture graphic; no anatomy microtexture. |
| Full Stop | interrupt | Old Man's planted staff pins a single enemy at a hard horizontal stop. | Compact violet impact wedge. | Near-black, muted violet, blue robe, dull gold. | One target and one decisive stop; no giant orb. |
| Sever the Thread | sever | A staff sweep slices a line between two enemy silhouettes, with one target behind the break. | Two separated enemy masses. | Slate blue/purple and one pale-gold stroke. | Reposition/second-target read; no text, arrows, or meters. |
| The Threshold | threshold | Graphic doorway/ledge with a single advancing Old Man silhouette crossing its boundary. | Pale wave/line at the threshold. | Slate, muted teal, bone, restrained gold. | Environment/abstract card; avoid portrait repetition. |
| Distant Hand | reach | Old Man small in the lower corner; long staff or occult reach connects to a distant enemy. | Large negative space and one target. | Blue-purple robe, brown staff, dark stone, one violet accent. | Distance and Back read; no centered orb. |
| Parting Word | retreat | Old Man turns away after a short staff strike, robe and staff drawing back on a diagonal. | Receding enemy silhouette. | Blue-purple, brown, muted gold, dark floor. | Deal then movement to Back; no literal `BACK` label. |
| Unlight | extinguish | Old Man stands in a dark field as several small enemy silhouettes are swallowed by one broad shadow plane. | Three large dark shapes, not particles. | Near-black, blue-purple, one dim violet ember. | All-enemy scale; no fireball or smoke bloom. |
| Last Bastion | stand | Elderly Old Man planted squarely with staff vertical, absorbing the room's pressure. | Low enemy silhouettes stopped at the foreground. | Blue-purple robe, dull gold wrap, brown staff, near-black arch. | Guard + Front resolve; no armor or archmage transformation. |

## Production notes

- Source masters and runtime exports are both native 128×96.
- Existing final art (`nip`, `king-of-the-heap`, `tide`, `swarm-the-wound`, `the-staff-speaks`) is the binding style reference and is not regenerated.
- The selected remaining candidates were reviewed at native 1×, in 132×184 cards, and in real five-card hand sampling. Near-black normalization and stray-pixel cleanup were performed during the Aseprite pass; no mechanics or layout values were changed.
- `Consume` is represented only as an action/impact idea, never as card destruction. `Opened` is treated as one target at a time. Rat imagery never implies death or expiration.

## Final production records

The 17 missing-card candidates were already present in the shared detached
runtime-art worktree at pass start (`4aeba71`). I treated them as candidates,
not as approved finals: each was rechecked beside the five approved masters,
run through the native Aseprite finish/export pass, and reviewed in the real
sparse hand. Their original PixelLab job IDs were not retained in that
worktree, so the commit is recorded as the candidate provenance. A fresh
PixelLab Brace candidate (`799038b0-178b-4cba-a671-d9a45ede326a`) was rejected
because it read as a low attack instead of a defensive brace.

| Card | Selected candidate | Controlled edit / cleanup | Palette | Editable master | Runtime PNG | Review |
| --- | --- | --- | ---: | --- | --- | --- |
| `nip` | Existing approved final | Preserved unchanged | 37 | `art/card-trial/cards/nip.aseprite` | `public/assets/card-trial/cards/nip.png` | pass |
| `fight-dirty` | GPT imagegen pilot | Cropped to native 128×96 with point sampling and bounded palette | 96 | — | `public/assets/card-trial/cards/fight-dirty.png` | pass — pilot |
| `brace` | Inherited PixelLab candidate; fresh job rejected | Near-black normalization; MCP crown highlight and cleanup layer | 33 | `art/card-trial/cards/brace.aseprite` | `public/assets/card-trial/cards/brace.png` | pass |
| `open-the-rank` | Inherited PixelLab candidate | Near-black normalization; silhouette/edge review | 25 | `art/card-trial/cards/open-the-rank.aseprite` | `public/assets/card-trial/cards/open-the-rank.png` | pass |
| `from-the-dark` | Inherited PixelLab candidate | Near-black normalization; silhouette/edge review | 34 | `art/card-trial/cards/from-the-dark.aseprite` | `public/assets/card-trial/cards/from-the-dark.png` | pass |
| `swarm-the-wound` | Existing approved final | Preserved unchanged | 20 | `art/card-trial/cards/swarm-the-wound.aseprite` | `public/assets/card-trial/cards/swarm-the-wound.png` | pass |
| `burst-the-nest` | Inherited PixelLab candidate | Near-black normalization; rat-mass simplification review | 28 | `art/card-trial/cards/burst-the-nest.aseprite` | `public/assets/card-trial/cards/burst-the-nest.png` | pass |
| `litter` | Inherited PixelLab candidate | Near-black normalization; single-Rat readability review | 32 | `art/card-trial/cards/litter.aseprite` | `public/assets/card-trial/cards/litter.png` | pass |
| `send-the-rat` | Inherited PixelLab candidate | Near-black normalization; directional-read review | 26 | `art/card-trial/cards/send-the-rat.aseprite` | `public/assets/card-trial/cards/send-the-rat.png` | pass |
| `tide` | Existing approved final | Preserved unchanged | 12 | `art/card-trial/cards/tide.aseprite` | `public/assets/card-trial/cards/tide.png` | pass |
| `lunge` | Inherited PixelLab candidate | Near-black normalization; forward silhouette review | 44 | `art/card-trial/cards/lunge.aseprite` | `public/assets/card-trial/cards/lunge.png` | pass |
| `king-of-the-heap` | Existing approved final/style master | Preserved unchanged | 44 | `art/card-trial/cards/king-of-the-heap.aseprite` | `public/assets/card-trial/cards/king-of-the-heap.png` | pass |
| `the-staff-speaks` | Existing approved final | Preserved unchanged | 41 | `art/card-trial/cards/the-staff-speaks.aseprite` | `public/assets/card-trial/cards/the-staff-speaks.png` | pass |
| `pale-ward` | Inherited PixelLab candidate | Near-black normalization; defensive silhouette review | 36 | `art/card-trial/cards/pale-ward.aseprite` | `public/assets/card-trial/cards/pale-ward.png` | pass |
| `faultline` | Inherited PixelLab candidate | Near-black normalization; single fracture review | 35 | `art/card-trial/cards/faultline.aseprite` | `public/assets/card-trial/cards/faultline.png` | pass |
| `marrow-divide` | Inherited PixelLab candidate | Near-black normalization; diagonal impact review | 35 | `art/card-trial/cards/marrow-divide.aseprite` | `public/assets/card-trial/cards/marrow-divide.png` | pass |
| `full-stop` | Inherited PixelLab candidate | Near-black normalization; single-target stop review | 51 | `art/card-trial/cards/full-stop.aseprite` | `public/assets/card-trial/cards/full-stop.png` | pass |
| `sever-the-thread` | Inherited PixelLab candidate | Near-black normalization; two-target separation review | 60 | `art/card-trial/cards/sever-the-thread.aseprite` | `public/assets/card-trial/cards/sever-the-thread.png` | pass |
| `the-threshold` | Inherited PixelLab candidate | Near-black normalization; graphic/environment review | 31 | `art/card-trial/cards/the-threshold.aseprite` | `public/assets/card-trial/cards/the-threshold.png` | pass |
| `distant-hand` | Inherited PixelLab candidate | Near-black normalization; distance/negative-space review | 30 | `art/card-trial/cards/distant-hand.aseprite` | `public/assets/card-trial/cards/distant-hand.png` | pass |
| `parting-word` | Inherited PixelLab candidate | Near-black normalization; retreat-direction review | 33 | `art/card-trial/cards/parting-word.aseprite` | `public/assets/card-trial/cards/parting-word.png` | pass |
| `unlight` | Inherited PixelLab candidate | Near-black normalization; broad shadow-mass review | 43 | `art/card-trial/cards/unlight.aseprite` | `public/assets/card-trial/cards/unlight.png` | pass |
| `last-bastion` | Inherited PixelLab candidate | Near-black normalization; planted Old Man silhouette review | 43 | `art/card-trial/cards/last-bastion.aseprite` | `public/assets/card-trial/cards/last-bastion.png` | pass |
| `improvised-theorem` | GPT imagegen pilot | Cropped to native 128×96 with point sampling and bounded palette | 96 | — | `public/assets/card-trial/cards/improvised-theorem.png` | pass — pilot |
