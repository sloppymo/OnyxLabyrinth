# Combat sprite inventory — baseline audit

Generated from the clean integration baseline `11573958c9a69875317ef952f660ee01dc707420`. Frame counts are read from PNG width ÷ 100; the manifest/cache remains authoritative for runtime aliases and playback rates. Motion style is presentation-only and is an audit classification, not gameplay taxonomy.

## Summary

- Enemy sprite directories: 47
- Party sprite directories: 7
- Required enemy states: idle, attack, hurt, death
- Required party states: idle, walk, attack, hurt, death
- Optional party states: attack_ranged, cast

## Party

| Identity | Sprite path | Strips | Motion style | Presentation concerns |
|---|---|---|---|---|
| crusader | `public/assets/party/crusader/` | idle: 6f (600×100); walk: 8f (800×100); attack: 7f (700×100); attack_ranged: missing; cast: missing; hurt: 4f (400×100); death: 4f (400×100) | party:crusader | missing attack_ranged, cast |
| duelist | `public/assets/party/duelist/` | idle: 6f (600×100); walk: 8f (800×100); attack: 7f (700×100); attack_ranged: missing; cast: missing; hurt: 5f (500×100); death: 4f (400×100) | party:duelist | missing attack_ranged, cast |
| fighter | `public/assets/party/fighter/` | idle: 6f (600×100); walk: 8f (800×100); attack: 7f (700×100); attack_ranged: missing; cast: missing; hurt: 4f (400×100); death: 4f (400×100) | party:fighter | missing attack_ranged, cast |
| halberdier | `public/assets/party/halberdier/` | idle: 6f (600×100); walk: 8f (800×100); attack: 9f (900×100); attack_ranged: missing; cast: missing; hurt: 4f (400×100); death: 4f (400×100) | party:halberdier | missing attack_ranged, cast |
| mage | `public/assets/party/mage/` | idle: 6f (600×100); walk: 8f (800×100); attack: 6f (600×100); attack_ranged: missing; cast: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | party:mage | missing attack_ranged |
| priest | `public/assets/party/priest/` | idle: 6f (600×100); walk: 8f (800×100); attack: 9f (900×100); attack_ranged: missing; cast: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | party:priest | missing attack_ranged |
| thief | `public/assets/party/thief/` | idle: 6f (600×100); walk: 8f (800×100); attack: 12f (1200×100); attack_ranged: 9f (900×100); cast: missing; hurt: 4f (400×100); death: 4f (400×100) | party:thief | missing cast |

## Enemies and summons

| Identity | Sprite path | Strips | Motion style | Presentation concerns |
|---|---|---|---|---|
| acid-puddle | `public/assets/enemies/acid-puddle/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | ooze | needs hop/compress motion profile |
| animated-armor | `public/assets/enemies/animated-armor/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| armored-skeleton | `public/assets/enemies/armored-skeleton/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| big-titty-ogre | `public/assets/enemies/big-titty-ogre/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| black-knight | `public/assets/enemies/black-knight/` | idle: 6f (600×100); attack: 16f (1600×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| blood-monster | `public/assets/enemies/blood-monster/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| blood-wraith | `public/assets/enemies/blood-wraith/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 6f (600×100) | ghost/wraith | avoid grounded walk illusion |
| demon | `public/assets/enemies/demon/` | idle: 6f (600×100); attack: 7f (700×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| demon-brawler | `public/assets/enemies/demon-brawler/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| demon-champion | `public/assets/enemies/demon-champion/` | idle: 6f (600×100); attack: 11f (1100×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| demon-mage | `public/assets/enemies/demon-mage/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 4f (400×100) | caster | none observed in strip geometry |
| demon-spawn | `public/assets/enemies/demon-spawn/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | ooze | none observed in strip geometry |
| demoness | `public/assets/enemies/demoness/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| displacer-beast | `public/assets/enemies/displacer-beast/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| elite-orc | `public/assets/enemies/elite-orc/` | idle: 6f (600×100); attack: 7f (700×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| eyeball-monster | `public/assets/enemies/eyeball-monster/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 4f (400×100) | flying | avoid grounded walk illusion |
| failed-experiment | `public/assets/enemies/failed-experiment/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 4f (400×100) | humanoid/other | none observed in strip geometry |
| flame-golem | `public/assets/enemies/flame-golem/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 6f (600×100) | construct/heavy | avoid grounded walk illusion |
| ghostfire | `public/assets/enemies/ghostfire/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 6f (600×100) | ghost/wraith | avoid grounded walk illusion |
| headmasters-echo | `public/assets/enemies/headmasters-echo/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 6f (600×100) | humanoid/other | none observed in strip geometry |
| hellbat | `public/assets/enemies/hellbat/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | flying | avoid grounded walk illusion |
| hellhound | `public/assets/enemies/hellhound/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| ice-golem | `public/assets/enemies/ice-golem/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 6f (600×100) | construct/heavy | none observed in strip geometry |
| ironclad-knight | `public/assets/enemies/ironclad-knight/` | idle: 6f (600×100); attack: 7f (700×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| lab-assistant | `public/assets/enemies/lab-assistant/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 4f (400×100) | humanoid/other | none observed in strip geometry |
| lava-slime | `public/assets/enemies/lava-slime/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | ooze | needs hop/compress motion profile |
| lesser-construct | `public/assets/enemies/lesser-construct/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| minotaur | `public/assets/enemies/minotaur/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| orc | `public/assets/enemies/orc/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| red-skeleton | `public/assets/enemies/red-skeleton/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | undead humanoid | none observed in strip geometry |
| rune-knight | `public/assets/enemies/rune-knight/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 10f (1000×100) | construct/heavy | none observed in strip geometry |
| skeleton | `public/assets/enemies/skeleton/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | undead humanoid | none observed in strip geometry |
| skeleton-archer | `public/assets/enemies/skeleton-archer/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 4f (400×100) | undead humanoid | none observed in strip geometry |
| slime | `public/assets/enemies/slime/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | ooze | needs hop/compress motion profile |
| stone-guardian | `public/assets/enemies/stone-guardian/` | idle: 6f (600×100); attack: 7f (700×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| succubus | `public/assets/enemies/succubus/` | idle: 6f (600×100); attack: 8f (800×100); hurt: 4f (400×100); death: 4f (400×100) | caster | none observed in strip geometry |
| summon-celestial | `public/assets/enemies/summon-celestial/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | humanoid/other | none observed in strip geometry |
| summon-celestial-guardian | `public/assets/enemies/summon-celestial-guardian/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| summon-eldritch-guardian | `public/assets/enemies/summon-eldritch-guardian/` | idle: 6f (600×100); attack: 7f (700×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| summon-elemental | `public/assets/enemies/summon-elemental/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 4f (400×100) | humanoid/other | none observed in strip geometry |
| summon-fire-elemental | `public/assets/enemies/summon-fire-elemental/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | humanoid/other | none observed in strip geometry |
| summon-holy-guardian | `public/assets/enemies/summon-holy-guardian/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| summon-slime | `public/assets/enemies/summon-slime/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | ooze | needs hop/compress motion profile |
| training-dummy | `public/assets/enemies/training-dummy/` | idle: 6f (600×100); attack: 6f (600×100); hurt: 4f (400×100); death: 4f (400×100) | construct/heavy | none observed in strip geometry |
| viper-man | `public/assets/enemies/viper-man/` | idle: 6f (600×100); attack: 16f (1600×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |
| warlock | `public/assets/enemies/warlock/` | idle: 6f (600×100); attack: 7f (700×100); hurt: 4f (400×100); death: 11f (1100×100) | caster | none observed in strip geometry |
| werewolf | `public/assets/enemies/werewolf/` | idle: 6f (600×100); attack: 9f (900×100); hurt: 4f (400×100); death: 4f (400×100) | beast/heavy humanoid | none observed in strip geometry |