# Shrink + Giant Strength Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship Mage Shrink + Priest Giant Strength per `docs/superpowers/specs/2026-08-01-shrink-giant-strength-design.md`.

**Architecture:** Status flags on combatants (`shrunk` / `giantStrength`) drive damage/evade modifiers and sprite scale. Giant Strength uses a round timer (like blind); Shrink is permanent until death/Dispel.

**Tech Stack:** TypeScript, Vitest, existing combat modules + FF6 combat scene/Phaser.

---

### Task 1: Data + status types

**Files:**
- Modify: `src/game/party.ts` (`StatusEffect`)
- Modify: `src/data/spells.ts`
- Modify: `src/engine/combat-display.ts` / `combat-select-action-view.ts` (tags + magic category)

- [x] Add statuses `shrunk` | `giantStrength`
- [x] Add spell defs `mage-shrink`, `priest-giant-strength`
- [x] Extend `SpellEffect` with apply-status kind (or dedicated shrink/giant kinds)
- [x] Tests: spell known at tier, display category

### Task 2: Combat resolve

**Files:**
- Modify: `src/game/combat-types.ts`, `combat.ts`, `combat-spells.ts`, `combat-shared.ts`, `combat-eor.ts`
- Modify: damage/evade sites (`combat-actions.ts`, `combat-enemy.ts`, `combat-techniques.ts`, spell damage path)
- Modify: `dispelMagic` clear path

- [x] Apply/refresh statuses from spells
- [x] Tick Giant Strength 3 rounds; Shrink never ticks off
- [x] ×0.5 / ×1.5 outgoing, ×1.2 incoming for giant, evade −0.20
- [x] Unit tests for each modifier + dispel + KO clear

### Task 3: Presentation

**Files:**
- Modify: `src/engine/combat-scene.ts`, `combat-phaser-stage.ts`
- Modify: choreography spell style map (optional)

- [x] Enemy with `shrunk` draws at half scale
- [x] Ally with `giantStrength` draws at 1.3× scale
- [x] Status tags visible

### Task 4: Verify

- [x] `npx vitest run` on touched combat/spell tests
- [x] `npm run build`
