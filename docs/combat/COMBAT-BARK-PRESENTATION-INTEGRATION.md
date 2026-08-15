# Combat Bark Presentation Integration

Date: 2026-08-15  
Branch: `feat/combat-bark-presentation-integration`

## Scope and decision

This is a safe presentation prototype for the expanded bark library. It does
not import Formation Chemistry, change combat formulas, alter enemy AI, or
consume the gameplay RNG stream. Chemistry-tagged pools remain dormant until
the chemistry branch emits the corresponding structured events.

The existing shipped bark MVP remains active. Its fire line, party heavy-hit
lines, party KO/death line, and three boss death/BeforeSpell lines keep their
existing wording and ledger behavior. The new library is layered only where
the MVP has no eligible line or where the new event surface is genuinely
additional. In particular, a boss death is not duplicated by the library
bridge when the legacy line already owns that moment.

This is the lower-risk migration path recommended by the content integration
contract: retain both systems while the new event vocabulary and eventual
Formation Chemistry events stabilize. A future full migration can wrap the
legacy entries into the new selector, but deleting the proven path in this
prototype would make behavior and save compatibility harder to prove.

## Runtime event flow

```text
structured CombatEvent
  -> library opportunity
  -> exact profile/trigger/ability/status filtering
  -> frequency governor
  -> isolated bark selector RNG
  -> CombatEvent(type=bark, source, speaker, landmark)
  -> shared choreography timeline
  -> Canvas and Phaser paint the same bark state
```

`src/game/combat-bark-runtime.ts` is the bridge. It observes events emitted by
both the round resolver and the per-turn resolver. It does not resolve damage,
choose targets, or write sprite-specific behavior. The pure selector remains
in `src/game/combat-bark-library.ts`; it receives a dedicated presentation RNG
and never advances gameplay randomness.

The bark event carries the speaker, source (`legacy` or `library`), duration,
and a semantic choreography landmark. The timeline maps those landmarks as
follows:

| Trigger family | Landmark |
| --- | --- |
| ordinary attack / start / miss | anticipation or contact |
| spell, heal, enemy ability | release |
| hit, heavy hit, critical reaction | reaction or contact |
| death / KO / defeated | settle |
| boss phase and future chemistry moments | authored reaction/anticipation |

The Canvas painter and Phaser stage consume the same `CombatScene`, `CombatBark`
and choreography timestamps. Neither renderer chooses a line or runs combat
logic.

## Frequency governor

The prototype is intentionally selective:

- ordinary opportunities require a two-round global gap;
- the same speaker requires a three-round gap;
- the same trigger requires a two-round gap;
- same-round opportunities of equal or lower priority are rejected;
- a six-line recent window avoids immediate exact-line cycling;
- a line marked `oncePerCombat` is removed after it is used;
- only death/KO, boss phase, and future signature/chemistry moments may
  interrupt the ordinary gap;
- critical and heavy-hit lines do not automatically interrupt every ordinary
  bark anymore;
- one library bark cannot cover a legacy bark or stack with another active
  library bark in the stage;
- the renderer keeps a 2.4-second wall-clock library gap and a two-entry
  non-death 100ms presentation window;
- library lines are length-based, capped at 700–1500ms, and do not pause the
  combat queue.

The policy is explicit in `src/data/combat-bark-policy.ts`. Suppression is
telemetried with a reason rather than treated as missing content.

## Preview and editorial mode

`combat-choreography-preview.html` is a real-stage preview, not a fake dialog
mock. It uses the production choreography and can render Canvas or Phaser.
It exposes:

- governed production mode versus forced editorial mode;
- trigger, speaker, and eligible-line selection;
- next-eligible-line cycling;
- priority, landmark, eligibility, chosen line, and suppression metadata;
- repeat and 0.25x/0.5x/1x/2x playback controls;
- representative PC, enemy, companion, scripted, and boss presets.

Forced mode intentionally bypasses the governor for line review. Governed mode
uses the same selector and governor path as combat. These modes must not be
interpreted as equivalent exposure rates.

## Instrumentation

Every `CombatState` owns a non-serialized bark runtime ledger containing:

- opportunities, eligible lines, selected events, and suppressed events by
  trigger;
- suppression reasons;
- line uses and unique lines;
- recent speaker/trigger/line history.

The deterministic exposure lab writes a machine-readable report to
`docs/playtests/2026-08-15-combat-bark-exposure.json` and is available through:

```bash
npm run playtest:combat-barks
```

The ledger is presentation-only and is not part of save data.

## Deliberate content tuning

The first exposure matrix caught the boss `headmasters-echo::bossPhase::More.`
line repeating on both phase opportunities. That was a real repetition defect,
not merely a large-library statistic. The line is now marked
`oncePerCombat`; the other two boss phase pools receive the same treatment for
their one-shot authored beats. The second phase may therefore communicate
through animation and silence rather than repeating a short line mechanically.

No bulk profile expansion was made. The content branch already has 852 lines
across 63 profiles; this pass changes only the runtime path, governor, and the
evidence-backed boss repetition behavior.

## Deferred integration

The following remain intentionally outside this branch:

- Formation Chemistry implementation and chemistry event production;
- audio/SFX selection;
- bark UI redesign;
- replacement of `CombatState.barkSaid` with a unified line ledger;
- campaign-wide balance or encounter changes.

Those can be evaluated after the chemistry branch supplies real event IDs and
resource/partner context. The current bridge accepts those fields without
inventing mechanics for them.
