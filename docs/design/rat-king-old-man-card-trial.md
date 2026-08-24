# Rat King / Old Man Card Trial

**Status:** Experimental — Arena prototype only. Not campaign authority.  
**Date:** 2026-08-21  
**Decision record (2026-08-22):** [`docs/superpowers/specs/2026-08-22-card-trial-human-test-decision.md`](../superpowers/specs/2026-08-22-card-trial-human-test-decision.md) — mechanical/reference-agent validation passed; **no balance iteration** until the naive-human batch. Canonical mechanics stay in the spec below.

**Turn-model experiment (2026-08-23):** [`docs/superpowers/specs/2026-08-23-card-trial-turn-model-experiment.md`](../superpowers/specs/2026-08-23-card-trial-turn-model-experiment.md) — architecture screening forked turn sequencing (`interleaved` / `shared` / `handoff`) without changing cards, energy, or encounters. Merged into `feat/card-trial-production-feel`. The alternating-turn lock below is the frozen **control** (`interleaved`, still the default), not a ban on the experiment.

The sixteen-ability wrapper (Revision 3 / Arena-plan kit, Court, Red Eye, retain-1 tactical decks) is **withdrawn**. It is not this prototype.

**Canonical spec:** [`docs/superpowers/specs/2026-08-21-card-trial-poc-design.md`](../superpowers/specs/2026-08-21-card-trial-poc-design.md)

That document is the lock: energy turns, two decks, rows, Opened, the 24-card lists, enemy bands, and the ten-fight test. Do not implement the old kit from chat history or from a `*3` overlay.
