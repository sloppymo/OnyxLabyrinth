# Enemy Hardness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tag fixes + ~60% combat stats + denser encounter packs so enemies act more often.

**Files:** `src/data/enemies.ts` (defs + `ENCOUNTER_TABLES`), `src/data/enemies.test.ts`

## Task 1: Tests for tags + pack density

Add failing tests:

1. Identity tags (Gaze Wraith undead; Hellhound/Hellbat demon+fire resist; Skeleton Archer not flying; Failed Experiment poisonOnHit).
2. Stat floor: after pass, slime HP ≥ 12 and skeleton attack ≥ 3.
3. Pack density: for floors 1–5, weight-weighted average spawn count ≥ targets (F1≥3, F2≥3.5, F3+≥3.5); no floor-1 solo acid-puddle entry.

## Task 2: Apply tag + stat changes

Update every `EnemyDef` per spec; leave Training Dummy unchanged.

## Task 3: Rewrite encounter tables

Retune `ENCOUNTER_TABLES` 1–5 to denser packs per spec.

## Task 4: Verify

`npx vitest run src/data/enemies.test.ts` and `npm run build`.
