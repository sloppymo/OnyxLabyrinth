/**
 * Phaser combat stage — paints CombatScene via Phaser 4.
 *
 * Dynamically imported only (`createCombatStage` when kind is phaser).
 * Do NOT import this module from any `.test.ts` (Phaser breaks under jsdom).
 *
 * Choreography stays in combat-choreography.ts; this file only mirrors
 * scene model → GameObjects each paint().
 */

import * as Phaser from "phaser";
import type { CombatEvent, CombatState, EnemyInstance, SummonedAlly } from "../game/combat-types";
import type { Character } from "../game/party";
import { statusDrawScale } from "../game/combat-shared";
import combatBgUrl from "../assets/combat-bg.png";
import {
  createScene,
  setCombatSceneState,
  updateScene,
  playTurn,
  isPlaybackDone,
  absorbDeaths,
  skipPlaybackToEnd,
  setBossIntroNameplate,
  partyActorPos,
  enemyPos,
  allyPos,
  animOffset,
  getAnim,
  frameIndexFor,
  enemyStripState,
  effectFrame,
  popupOffsetY,
  sampleProjectilePose,
  getBarksEnabled,
  enemyHpPipsLit,
  enemySlotIndex,
  allySlotIndex,
  COLORS,
  PARTY_SIZE,
  ENEMY_SIZE,
  BOSS_SIZE,
  POPUP_DURATION,
  BARK_MAX_WIDTH_PX,
  BOSS_PRESENTATION,
  HP_PIP_COUNT,
  type CombatScene,
  type SceneCursor,
  type ActorAnim,
} from "./combat-choreography";
import { enemySpriteId, getEnemySpriteStrip, loadEnemySpriteBundle } from "./enemy-sprite-cache";
import { getPartySpriteStrip, loadPartySpriteBundle, PARTY_SPRITE_DIRS } from "./party-sprite-cache";
import { getEffectSprite } from "./effect-sprite-cache";
import { screenShakeOffset } from "./combat-motion";
import {
  ART_FOOT_FROM_TOP_FALLBACK,
  artFootFromTopFor,
  artTopFromTopFor,
  visualHeadY,
  MARKER_TIP_GAP_PX,
  COMBAT_DESIGN_W,
  COMBAT_DESIGN_H,
  resolveSlot,
  enemySlot,
  geometryForBackdrop,
  type ResolvedSlot,
} from "./combat-scene-math";
import { combatCanvas, combatPhaserCanvas } from "./shell";
import type { CombatStage, CreateCombatStageOpts } from "./combat-stage";
import {
  afterimageSamples,
  applySpotlight,
  applyStatusTint,
  deathDissolveRecipe,
  DEATH_ANIM_MS,
  castBloomPulse,
  shineTargetsFrom,
  SHINE_MS,
  clearSpotlight,
  createSpotlightState,
  hitSquashFootOffset,
  hitSquashScale,
  spotlightRecipe,
  statusTintFor,
  type SpotlightFilterLists,
  type SpotlightRecipe,
  type SpotlightState,
} from "./combat-phaser-fx";
import { GameObjectPool } from "./phaser-go-pool";
import {
  sampleZoom,
  sampleEnvironmentLight,
  sampleActorFlash,
} from "./combat-impact-fx";

/** GameObject "destroy" event name — see `clearShine`'s tidyup unhook. */
const DESTROY_EVENT = Phaser.GameObjects.Events.DESTROY;

/** Kill-switch for camera Glow/ColorMatrix (tint still applies). */
const PHASER_FX_SPOTLIGHT = true;
/** Kill-switch for hurt impact squash. */
const PHASER_FX_HIT_SQUASH = true;
/** Kill-switch for the per-sprite death mosaic/desaturate (harvest H1). */
const PHASER_FX_DEATH_DISSOLVE = true;
/**
 * Kill-switch for the new palette-crumble ash effect.
 *
 * When false the stage falls back to the legacy pixelate + grayscale dissolve,
 * which is also gated by `PHASER_FX_DEATH_DISSOLVE`.
 */
const PHASER_FX_PALETTE_CRUMBLE = true;
/** Kill-switch for the cast bloom pulse (harvest H2). */
const PHASER_FX_CAST_BLOOM = true;
/** Kill-switch for the heal Shine sweep (harvest H3). */
const PHASER_FX_SHINE = true;
/**
 * Walk-forward ghost clones (harvest H5) — implemented, measured, OFF.
 *
 * The effect works: `capture-phaser-afterimage-pool.mjs` measures a 3-ghost
 * trail spanning 28.6px, live only during a walk and gone at rest. It just does
 * not *read*. The reference is an FF6 dash across the screen; after the
 * target-aware motion pass, ordinary lunges are deliberately short and
 * silhouette-first, so the ghosts overlap the body by roughly two thirds and
 * read as a double-image artifact rather than speed. Probed at both 0.28 and
 * 0.6 alpha against the combat backdrop: invisible at the low end, and noisy
 * at the high end.
 *
 * Left wired and unit-tested rather than deleted — this is the plan's own
 * documented rollback ("disable afterimage constant; pooling can stay"), and
 * flipping this to `true` is the whole cost of revisiting if the approach
 * distance ever grows into a real lunge.
 */
const PHASER_FX_AFTERIMAGE = false;

function setPhaserStageActive(on: boolean): void {
  const wrap = combatPhaserCanvas.parentElement;
  if (wrap) wrap.classList.toggle("phaser-stage", on);
  // Clear any leftover inline display so the class rules win.
  combatCanvas.style.display = "";
  combatPhaserCanvas.style.display = "";
}

const SCENE_KEY = "onyx-combat";

type ActorKind = SceneCursor["kind"];

interface ActorSpriteEntry {
  key: string;
  kind: ActorKind;
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Ellipse;
  shadow: Phaser.GameObjects.Ellipse;
  isFallback: boolean;
  /**
   * Per-sprite palette-crumble controllers, allocated lazily on first death
   * frame. Kept on the entry rather than looked up from the sprite because
   * `ensureStripSprite` swaps the texture in place on state change, so the
   * Sprite (and therefore its filter list) survives idle→death.
   */
  crumble?: {
    pixelate?: Phaser.Filters.Pixelate;
    matrix?: Phaser.Filters.ColorMatrix;
    gradientMap?: Phaser.Filters.GradientMap;
    blocky?: Phaser.Filters.Blocky;
    wipe?: Phaser.Filters.Wipe;
  } | null;
  /** Transient ash-particle arcs for the crumble; destroyed on clear. */
  ashArcs?: Phaser.GameObjects.Arc[];
}

class OnyxCombatPhaserScene extends Phaser.Scene {
  latest: { scene: CombatScene; now: number } | null = null;
  private actors = new Map<string, ActorSpriteEntry>();
  private popups = new Map<string, Phaser.GameObjects.Text>();
  private barks = new Map<string, Phaser.GameObjects.Text>();
  /**
   * Pooled transient GOs (harvest H6). Effect sprites and the procedural
   * fallback arcs get separate pools on purpose: sharing one would mean handing
   * an Arc back where a Sprite is expected (the old code papered over this with
   * an `as unknown as Sprite` cast) and would cross-contaminate tint/blend
   * between two effect families.
   */
  private readonly particlePool = new GameObjectPool<Phaser.GameObjects.Arc>(() =>
    this.addTo(this.effectsLayer, this.add.circle(0, 0, 4, 0xffffff, 1).setDepth(550))
  );
  private readonly effectSpritePool = new GameObjectPool<Phaser.GameObjects.Sprite>(
    // "__DEFAULT" is Phaser's blank placeholder texture. Not "__MISSING",
    // which is the magenta error checkerboard — a pool slot is not an error.
    () => this.addTo(this.effectsLayer, this.add.sprite(0, 0, "__DEFAULT").setDepth(600))
  );
  private readonly effectArcPool = new GameObjectPool<Phaser.GameObjects.Arc>(() =>
    this.addTo(this.effectsLayer, this.add.circle(0, 0, 12, 0x4488cc, 1).setDepth(600))
  );
  private readonly ghostPool = new GameObjectPool<Phaser.GameObjects.Sprite>(() =>
    this.addTo(this.effectsLayer, this.add.sprite(0, 0, "__DEFAULT").setOrigin(0.5, 0.5))
  );
  private glowGraphics: Phaser.GameObjects.Graphics | null = null;
  private bgImage: Phaser.GameObjects.Image | null = null;
  /** Environmental lighting dim overlay (normal blend, black). */
  private envDimRect: Phaser.GameObjects.Rectangle | null = null;
  /** Environmental lighting flash overlay (additive blend, element color). */
  private envFlashRect: Phaser.GameObjects.Rectangle | null = null;
  /** Environmental lighting floor radial glow (additive, element color). */
  private envFloorGlow: Phaser.GameObjects.Graphics | null = null;
  /** Environmental lighting rim vignette (additive, element color). */
  private envRimGlow: Phaser.GameObjects.Graphics | null = null;
  private bannerText: Phaser.GameObjects.Text | null = null;
  private bannerBg: Phaser.GameObjects.Graphics | null = null;
  private nameplateText: Phaser.GameObjects.Text | null = null;
  private nameplateTag: Phaser.GameObjects.Text | null = null;
  private nameplateSub: Phaser.GameObjects.Text | null = null;
  private nameplateBg: Phaser.GameObjects.Graphics | null = null;
  private cursorMark: Phaser.GameObjects.Triangle | null = null;
  private activeMark: Phaser.GameObjects.Triangle | null = null;
  private guardMarks = new Map<
    string,
    { shield: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }
  >();
  private fastCue: Phaser.GameObjects.Text | null = null;
  private autoCue: Phaser.GameObjects.Text | null = null;
  private pipGfx: Phaser.GameObjects.Graphics | null = null;
  /** Root transform/filter target for all battlefield-only GameObjects. */
  private combatWorld!: Phaser.GameObjects.Container;
  private bgLayer!: Phaser.GameObjects.Container;
  private dimLayer!: Phaser.GameObjects.Container;
  private glowLayer!: Phaser.GameObjects.Container;
  private actorLayer!: Phaser.GameObjects.Container;
  private actorOverlayLayer!: Phaser.GameObjects.Container;
  private effectsLayer!: Phaser.GameObjects.Container;
  private fgLightingLayer!: Phaser.GameObjects.Container;
  private readonly spotlight: SpotlightState = createSpotlightState();
  /**
   * Cast bloom, deliberately kept out of `SpotlightState`: it lands on the same
   * camera external list but has its own (much shorter) lifetime, and folding a
   * third member into `clearSpotlight`'s identity-splice logic would muddy it.
   */
  private bloom: {
    parallelFilters: Phaser.Filters.ParallelFilters;
    /** `bannerStart` this pulse belongs to — a new banner restarts the pulse. */
    bannerStart: number;
  } | null = null;
  /**
   * Live heal Shines by actor key. Unlike every other effect here these own a
   * Phaser tween and a DynamicTexture, so each one must be explicitly disposed —
   * see `clearShine`.
   *
   * `sprite`/`tidyup` are what make early disposal safe: `AddEffectShine`
   * registers its own `sprite.on("destroy", …)` that destroys the same tween
   * and DynamicTexture, and `Texture.destroy()` nulls `manager`, so a second
   * destroy throws on `this.manager.stamp`. We keep the sprite we attached to
   * and the exact listener that was added so `clearShine` can unhook it.
   */
  private shines = new Map<
    string,
    {
      tween: Phaser.Tweens.Tween;
      dynamicTexture: Phaser.Textures.DynamicTexture;
      parallelFilters: Phaser.Filters.ParallelFilters | null;
      startedAt: number;
      /** The sprite the effect was attached to (may be replaced in the pool). */
      sprite: Phaser.GameObjects.Sprite;
      /** `AddEffectShine`'s own destroy handler, so we can remove it. */
      tidyup: Function | null;
    }
  >();

  constructor() {
    super(SCENE_KEY);
  }

  /** Add a freshly created GameObject to the specified world subcontainer. */
  private addTo<T extends Phaser.GameObjects.GameObject>(
    layer: Phaser.GameObjects.Container,
    object: T
  ): T {
    layer.add(object);
    return object;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0d0b08");

    this.combatWorld = this.add.container(0, 0);
    this.bgLayer = this.addTo(this.combatWorld, this.add.container(0, 0));
    this.dimLayer = this.addTo(this.combatWorld, this.add.container(0, 0));
    this.glowLayer = this.addTo(this.combatWorld, this.add.container(0, 0));
    this.actorLayer = this.addTo(this.combatWorld, this.add.container(0, 0));
    this.actorOverlayLayer = this.addTo(this.combatWorld, this.add.container(0, 0));
    this.effectsLayer = this.addTo(this.combatWorld, this.add.container(0, 0));
    this.fgLightingLayer = this.addTo(this.combatWorld, this.add.container(0, 0));

    this.glowGraphics = this.addTo(this.glowLayer, this.add.graphics().setDepth(-50));
    this.pipGfx = this.addTo(this.actorOverlayLayer, this.add.graphics().setDepth(500));
    this.bannerBg = this.add.graphics().setDepth(900).setVisible(false);
    this.bannerText = this.add
      .text(0, 0, "", {
        fontFamily: "FF36, monospace",
        fontSize: "22px",
        color: COLORS.banner,
      })
      .setOrigin(0.5)
      .setDepth(901)
      .setVisible(false);
    this.nameplateBg = this.add.graphics().setDepth(910).setVisible(false);
    this.nameplateTag = this.add
      .text(0, 0, "", {
        fontFamily: "FF36, monospace",
        fontSize: "14px",
        color: "#e07070",
      })
      .setOrigin(0.5)
      .setDepth(911)
      .setVisible(false);
    this.nameplateText = this.add
      .text(0, 0, "", {
        fontFamily: "FF36, monospace",
        fontSize: "28px",
        color: COLORS.banner,
      })
      .setOrigin(0.5)
      .setDepth(911)
      .setVisible(false);
    this.nameplateSub = this.add
      .text(0, 0, "", {
        fontFamily: "FF36, monospace",
        fontSize: "12px",
        color: "#e07070",
      })
      .setOrigin(0.5)
      .setDepth(911)
      .setVisible(false);
    this.cursorMark = this.add
      .triangle(0, 0, 0, 12, -9, 0, 9, 0, 0xffd700)
      .setDepth(800)
      .setVisible(false);
    this.activeMark = this.add
      .triangle(0, 0, 0, 12, -9, 0, 9, 0, 0xffd700)
      .setDepth(800)
      .setVisible(false);
    this.fastCue = this.add
      .text(COMBAT_DESIGN_W - 12, 10, "FAST", {
        fontFamily: "FF36, monospace",
        fontSize: "16px",
        color: "#ffe566",
        backgroundColor: "#00000073",
      })
      .setOrigin(1, 0)
      .setDepth(950)
      .setVisible(false);
    this.autoCue = this.add
      .text(COMBAT_DESIGN_W - 12, 30, "AUTO", {
        fontFamily: "FF36, monospace",
        fontSize: "16px",
        color: "#7ec8ff",
        backgroundColor: "#00000073",
      })
      .setOrigin(1, 0)
      .setDepth(950)
      .setVisible(false);

    // Static combat bg fallback texture.
    this.load.image("combat-bg", combatBgUrl);
    this.load.start();
  }

  acceptFrame(scene: CombatScene, now: number): void {
    this.latest = { scene, now };
    this.ensureFightTextures(scene);
  }

  /** Debug: live actor centers/feet for ground-plane A/B. */
  debugActorLayout(): Array<{
    key: string;
    kind: ActorKind;
    x: number;
    centerY: number;
    footY: number;
    h: number;
    tex: string | null;
  }> {
    const out: Array<{
      key: string;
      kind: ActorKind;
      x: number;
      centerY: number;
      footY: number;
      h: number;
      tex: string | null;
    }> = [];
    for (const entry of this.actors.values()) {
      if (!entry.sprite.visible) continue;
      const h = entry.sprite.displayHeight;
      const centerY = entry.sprite.y;
      // Reconstruct foot from center assuming artFoot 0.57 for strips;
      // shadow.y is a better oracle (planted at foot − bias).
      const footFromShadow = entry.shadow.y + entry.shadow.displayHeight * 0.175;
      out.push({
        key: entry.key,
        kind: entry.kind,
        x: Math.round(entry.sprite.x),
        centerY: Math.round(centerY),
        footY: Math.round(footFromShadow),
        h: Math.round(h),
        tex:
          entry.sprite instanceof Phaser.GameObjects.Sprite
            ? entry.sprite.texture.key
            : null,
      });
    }
    return out.sort((a, b) => a.footY - b.footY);
  }

  /**
   * Debug: live camera filter-list sizes for the spotlight leak check.
   * `ensureSpotlightFilters` promises at most one Glow (external) + one
   * ColorMatrix (internal); anything above that means a recipe churn is
   * stranding controllers instead of splicing them out.
   */
  debugFilterCounts(): {
    external: number;
    internal: number;
    key: string;
    /** Whether syncSpotlight's gate was open on the last paint. */
    gate: boolean;
    webgl: boolean;
    bloom: boolean;
    /**
     * Live `blend.amount` of the bloom, or -1 when no bloom is up. Exposed
     * because "a bloom exists" is not the property that matters — an envelope
     * written to the wrong field still yields a bloom, just a frozen one.
     */
    bloomAmount: number;
    spotlightExternal: number;
  } {
    const cam = this.cameras?.main;
    const list = (l: unknown): number =>
      Array.isArray((l as { list?: unknown[] })?.list)
        ? (l as { list: unknown[] }).list.length
        : 0;
    const scene = this.latest?.scene;
    return {
      external: list(cam?.filters?.external),
      internal: list(cam?.filters?.internal),
      key: this.spotlight.key,
      gate: !!(scene && (scene.introNameplate || (scene.banner && scene.banner.length))),
      webgl: this.game?.renderer?.type === Phaser.WEBGL,
      // Reported separately from the raw counts so the leak assertion can stay
      // "<=1 spotlight external AND bloom only during its pulse", rather than a
      // bare cap that the bloom would legitimately trip.
      bloom: !!this.bloom,
      bloomAmount: this.bloom ? this.bloom.parallelFilters.blend.amount : -1,
      spotlightExternal: this.spotlight.glow ? 1 : 0,
    };
  }

  /**
   * Debug: how many actors currently hold death-dissolve controllers.
   * Used by the capture script to assert they are spliced out once the
   * corpses settle, since there is no `disableFilters()` to lean on.
   *
   * `ramps` reads the animated values back **out of the filter controllers**,
   * never from `deathDissolveRecipe`. That distinction is the whole point: the
   * H2 cast bloom shipped with its envelope written to `parallelFilters.blendAmount`
   * instead of `parallelFilters.blend.amount`, a silent no-op, and every probe
   * that only proved "a filter exists and is torn down" stayed green throughout.
   * Recomputing the recipe here would reproduce that blind spot exactly.
   *
   * Reported per key rather than as one aggregate so a capture can track a
   * single actor's progression — otherwise N corpses each frozen at a different
   * value would look like a ramp when nothing is animating at all.
   */
  debugDissolveCounts(): {
    active: number;
    keys: string[];
    shines: number;
    tweenTimeScale: number;
    /**
     * Per dissolving actor: the Pixelate controller's own `amount`, and row 0
     * col 0 of the ColorMatrix. `grayscale(v)` delegates to `saturate(-v)`,
     * which writes `x = 1 - 2v/3` there — so 1 means untouched and ~0.333 means
     * fully grey. Monotonic in `v`, which is all an assertion needs.
     */
    ramps: { key: string; pixelate: number; saturation: number }[];
    /**
     * Per live Shine: `gradient.offset`, the property `AddEffectShine`'s tween
     * actually animates. Reached through `tween.targets[0]` so the stage does
     * not have to retain the gradient just to be observable.
     */
    shineOffsets: { key: string; offset: number }[];
    /**
     * The TweenManager's *global* timeScale, reported separately from the
     * Shines' own, plus the playback rate that should never reach it.
     *
     * This stage must retime Shines per-tween: the manager's value multiplies
     * into every tween in the scene, so pinning it to playback rate would
     * silently retime anything added later by unrelated code. Both are needed
     * to assert that — at 1x the two implementations write the same value, so
     * a capture must confirm it sampled at rate > 1 before claiming a pass.
     */
    managerTimeScale: number;
    playbackRate: number;
  } {
    const keys: string[] = [];
    const ramps: { key: string; pixelate: number; saturation: number }[] = [];
    for (const entry of this.actors.values()) {
      if (!entry.crumble) continue;
      keys.push(entry.key);
      let saturation = Number.NaN;
      try {
        saturation =
          entry.crumble.matrix?.colorMatrix.getData()[0] ?? Number.NaN;
      } catch {
        /* controller torn down mid-probe */
      }
      ramps.push({
        key: entry.key,
        pixelate: entry.crumble.pixelate?.amount ?? Number.NaN,
        saturation,
      });
    }
    const shineOffsets: { key: string; offset: number }[] = [];
    for (const [key, shine] of this.shines) {
      const gradient = shine.tween.targets?.[0] as { offset?: number } | undefined;
      if (typeof gradient?.offset === "number") {
        shineOffsets.push({ key, offset: gradient.offset });
      }
    }
    // Report the Shines' own timeScale (they carry it per-tween, so the
    // manager's global value stays 1) — falling back to the manager when no
    // Shine is live, which is what "at rest" looks like.
    let tweenTimeScale = this.tweens?.timeScale ?? 1;
    for (const shine of this.shines.values()) {
      tweenTimeScale = shine.tween.timeScale;
      break;
    }
    return {
      active: keys.length,
      keys,
      shines: this.shines.size,
      tweenTimeScale,
      ramps,
      shineOffsets,
      managerTimeScale: this.tweens?.timeScale ?? 1,
      playbackRate: this.latest?.scene.playbackRate ?? 1,
    };
  }

  /**
   * Debug: pool occupancy and — the part that matters — lifetime allocation
   * counts (harvest H6).
   *
   * A size-only probe cannot distinguish "reused 12 objects" from "destroyed and
   * re-created 12 objects" every frame; both report 12. `created` is monotonic,
   * so the assertion that can actually fail is: run combat for N seconds and
   * confirm `created` plateaus while `sceneParticles` keeps churning.
   */
  debugPoolCounts(): {
    particles: { live: number; size: number; created: number };
    effectSprites: { live: number; size: number; created: number };
    effectArcs: { live: number; size: number; created: number };
    ghosts: { live: number; size: number; created: number };
    /**
     * Widest gap between live ghosts, in px. Counting ghosts proves objects
     * exist; only the spread proves they are drawn at *different* past
     * positions rather than stacked invisibly under the body.
     */
    ghostSpreadPx: number;
    /** So a capture can tell "afterimage off by design" from "afterimage broken". */
    afterimageEnabled: boolean;
    sceneParticles: number;
    sceneEffects: number;
  } {
    const of = (p: { live: number; size: number; created: number }) => ({
      live: p.live,
      size: p.size,
      created: p.created,
    });
    return {
      particles: of(this.particlePool),
      effectSprites: of(this.effectSpritePool),
      effectArcs: of(this.effectArcPool),
      ghosts: of(this.ghostPool),
      ghostSpreadPx: this.ghostPool.spreadPx(),
      afterimageEnabled: PHASER_FX_AFTERIMAGE,
      sceneParticles: this.latest?.scene.particles.length ?? 0,
      sceneEffects: this.latest?.scene.effects.length ?? 0,
    };
  }

  /** Toggle a development-only world-layer transform to prove UI isolation. */
  setWorldDebugTransform(enabled: boolean): void {
    if (!this.combatWorld) return;
    this.combatWorld.setScale(enabled ? 0.96 : 1);
    this.combatWorld.setPosition(enabled ? 12 : 0, enabled ? 6 : 0);
  }

  /** Debug probe reporting world-layer ownership and transform. */
  debugWorldLayer(): {
    layerCounts: Record<string, number>;
    worldTransform: { x: number; y: number; scaleX: number; scaleY: number };
  } {
    const count = (c: Phaser.GameObjects.Container | undefined) =>
      c ? c.list.length : 0;
    return {
      layerCounts: {
        bg: count(this.bgLayer),
        dim: count(this.dimLayer),
        glow: count(this.glowLayer),
        actors: count(this.actorLayer),
        actorOverlays: count(this.actorOverlayLayer),
        effects: count(this.effectsLayer),
        fgLighting: count(this.fgLightingLayer),
      },
      worldTransform: {
        x: this.combatWorld.x,
        y: this.combatWorld.y,
        scaleX: this.combatWorld.scaleX,
        scaleY: this.combatWorld.scaleY,
      },
    };
  }

  /** Defensive NEAREST after HTMLImageElement sheets (game config pixelArt alone can miss). */
  private assertNearest(key: string): void {
    if (!this.textures.exists(key)) return;
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private ensureSpriteSheet(
    key: string,
    img: HTMLImageElement,
    frameWidth: number,
    frameHeight: number
  ): void {
    if (this.textures.exists(key)) {
      this.assertNearest(key);
      return;
    }
    try {
      this.textures.addSpriteSheet(key, img, { frameWidth, frameHeight });
      this.assertNearest(key);
    } catch {
      /* duplicate / incomplete */
    }
  }

  /**
   * Mirror canvas `drawFF6Window`: vertical #3048b0→#101c58 gradient, dual stroke.
   * Optional accent rim matches canvas intro nameplate (stroke outside the plate).
   */
  private drawFf6Window(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    accentRim?: number
  ): void {
    g.clear();
    if (accentRim !== undefined) {
      g.lineStyle(3, accentRim, 1);
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
    g.fillGradientStyle(0x3048b0, 0x3048b0, 0x101c58, 0x101c58, 1);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(3, 0xe8e8f0, 1);
    g.strokeRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, 0x5068c8, 1);
    g.strokeRoundedRect(x, y, w, h, 6);
  }

  private ensureFightTextures(scene: CombatScene): void {
    for (const e of [...scene.state.enemies.front, ...scene.state.enemies.back]) {
      void loadEnemySpriteBundle(enemySpriteId(e));
    }
    for (const c of scene.state.party) {
      void loadPartySpriteBundle(PARTY_SPRITE_DIRS[c.class]);
    }
    // Add spritesheets from already-decoded cache images when available.
    for (const e of [...scene.state.enemies.front, ...scene.state.enemies.back, ...scene.enemyCorpses]) {
      const spriteId = enemySpriteId(e);
      for (const st of ["idle", "attacking", "hit", "defeated"] as const) {
        const info = getEnemySpriteStrip(spriteId, st);
        if (!info?.img || info.img.naturalWidth <= 0) continue;
        this.ensureSpriteSheet(
          `enemy:${spriteId}:${st}`,
          info.img,
          info.strip.frameWidth,
          info.strip.frameHeight
        );
      }
    }
    for (const c of scene.state.party) {
      for (const st of ["idle", "walk", "attack", "attack_ranged", "cast", "hurt", "death"] as const) {
        const info = getPartySpriteStrip(c.class, st);
        if (!info?.img || info.img.naturalWidth <= 0) continue;
        this.ensureSpriteSheet(
          `party:${c.class}:${st}`,
          info.img,
          info.strip.frameWidth,
          info.strip.frameHeight
        );
      }
    }
    for (const a of [...scene.state.summonedAllies, ...scene.allyCorpses]) {
      if (!a.spriteId) continue;
      void loadEnemySpriteBundle(a.spriteId);
      for (const st of ["idle", "attacking", "hit", "defeated"] as const) {
        const info = getEnemySpriteStrip(a.spriteId, st);
        if (!info?.img || info.img.naturalWidth <= 0) continue;
        this.ensureSpriteSheet(
          `enemy:${a.spriteId}:${st}`,
          info.img,
          info.strip.frameWidth,
          info.strip.frameHeight
        );
      }
    }
    // Backdrop canvas → texture (once). Re-remove/re-add every paint
    // invalidates the live Image's TextureFrame.source and throws
    // "Cannot read properties of null (reading 'resolution')" in WebGL.
    if (scene.backdrop && !this.textures.exists("combat-backdrop")) {
      try {
        this.textures.addCanvas("combat-backdrop", scene.backdrop);
      } catch {
        /* ignore */
      }
    }
  }

  update(): void {
    const frame = this.latest;
    if (!frame) return;
    const { scene, now } = frame;
    const w = COMBAT_DESIGN_W;
    const h = COMBAT_DESIGN_H;

    // Screen shake via camera scroll.
    if (scene.screenShake.amount > 0) {
      const a = scene.screenShake.amount;
      const shake = screenShakeOffset(a, now);
      this.cameras.main.setScroll(shake.x, shake.y);
    } else {
      this.cameras.main.setScroll(0, 0);
    }

    // Bounded impact zoom: scale the camera around the impact focus point.
    const zoom = sampleZoom(scene.impact.zoom, now);
    if (zoom.scale > 1.001) {
      // Adjust scroll so the focus point stays centered after zoom.
      const cx = w / 2;
      const cy = h / 2;
      const dx = zoom.focusX - cx;
      const dy = zoom.focusY - cy;
      this.cameras.main.setZoom(zoom.scale);
      this.cameras.main.centerOn(zoom.focusX - dx / zoom.scale, zoom.focusY - dy / zoom.scale);
    } else {
      this.cameras.main.setZoom(1);
    }

    this.syncBackground(scene);
    this.syncEnvLight(scene, now, w, h);
    this.syncGlows(scene, now);
    this.syncActors(scene, now, w, h);
    this.syncEffects(scene, now);
    this.syncParticles(scene);
    this.syncPopups(scene, now);
    this.syncBarks(scene, now, w, h);
    this.syncBanner(scene, now, w);
    this.syncNameplate(scene, now, w);
    this.syncMarkers(scene, now);
    this.syncGuardMarkers(scene, now);
    this.syncCues(scene);
    this.syncHpPips(scene, now, w, h);
    this.syncSpotlight(scene);
    this.syncCastBloom(scene, now);
    this.syncHealShine(scene, now);
    this.sortWorldLayers();
  }

  /**
   * Container children render by list order, not by their `setDepth` values.
   * Re-sort the layers that contain dynamic objects so the intended depth
   * values still define render order.
   */
  private sortWorldLayers(): void {
    const byDepth = (a: Phaser.GameObjects.GameObject, b: Phaser.GameObjects.GameObject) =>
      ((a as unknown as { depth: number }).depth - (b as unknown as { depth: number }).depth);
    this.actorLayer.list.sort(byDepth);
    this.effectsLayer.list.sort(byDepth);
    this.fgLightingLayer.list.sort(byDepth);
  }

  /**
   * Sweep a specular Shine across bodies that were just healed (harvest H3).
   *
   * `Phaser.Actions.AddEffectShine` is the one effect in this file that runs on
   * Phaser's own tween manager rather than the choreography clock. Left alone it
   * would keep running at 1x while Shift-2x / Tab-FAST doubles playback, so the
   * shine would visibly drift away from the heal it illustrates. `tweens.timeScale`
   * is pinned to `scene.playbackRate` every paint to keep the two in step.
   */
  private syncHealShine(scene: CombatScene, now: number): void {
    if (!PHASER_FX_SHINE) {
      this.clearAllShines();
      return;
    }
    // Keep the Shine tweens on the same clock as playback (FAST / skip).
    //
    // Per-tween `timeScale`, not `TweenManager.timeScale`: the manager's value
    // multiplies into every tween in the scene, so scaling it here would
    // silently retime any tween added later by unrelated code. Tween.timeScale
    // is multiplied by the manager's, so this stays correct if that ever
    // changes for another reason.
    const rate = Math.max(0.1, scene.playbackRate || 1);
    for (const shine of this.shines.values()) shine.tween.timeScale = rate;

    // Popups carry a bare actor id; the sprite pool is keyed "<kind>:<id>".
    // Probe the three kinds rather than scanning, so an id that happens to be a
    // suffix of another can never match the wrong body.
    const wanted = new Set<string>();
    for (const id of shineTargetsFrom(scene.popups, now, COLORS.heal)) {
      for (const kind of ["party", "ally", "enemy"] as const) {
        const key = this.actorPoolKey(kind, id);
        if (this.actors.has(key)) wanted.add(key);
      }
    }

    for (const [key, shine] of this.shines) {
      if (!wanted.has(key) || now - shine.startedAt > SHINE_MS) {
        this.clearShine(key);
      }
    }

    for (const key of wanted) {
      if (this.shines.has(key)) continue;
      const entry = this.actors.get(key);
      if (!entry || entry.isFallback) continue;
      if (!(entry.sprite instanceof Phaser.GameObjects.Sprite)) continue;
      const sprite = entry.sprite;
      try {
        // Diff the sprite's destroy listeners around the call: the one that
        // appears is `AddEffectShine`'s internal `tidyup`, which `clearShine`
        // must remove before disposing the same resources itself. This assumes
        // the call adds exactly ONE destroy listener (true as of Phaser 4.2.1)
        // — if a future version adds a second, `.find` would unhook the wrong
        // one and the double-destroy freeze comes back.
        const before = new Set(sprite.listeners(DESTROY_EVENT));
        const [added] = Phaser.Actions.AddEffectShine(sprite, {
          radius: 0.35,
          direction: 0.6,
          scale: 1.4,
        });
        if (!added?.tween) continue;
        // Adopt the current playback rate immediately; a Shine started during
        // FAST must not run its first frames at 1x.
        added.tween.timeScale = rate;
        this.shines.set(key, {
          tween: added.tween,
          dynamicTexture: added.dynamicTexture,
          parallelFilters: added.parallelFilters,
          startedAt: now,
          sprite,
          tidyup: sprite.listeners(DESTROY_EVENT).find((l) => !before.has(l)) ?? null,
        });
      } catch {
        // CANVAS renderer / Filters unavailable — heal still reads via popup.
      }
    }
  }

  /**
   * Dispose one Shine: tween, filter, and the DynamicTexture it draws into.
   *
   * Unhooking `AddEffectShine`'s own destroy handler FIRST is load-bearing, not
   * tidiness. Left attached, it re-destroys this same DynamicTexture whenever
   * the sprite is later destroyed (pool prune in `syncActors`, strip/fallback
   * swap, scene teardown), and `Texture.destroy()` has already nulled `manager`
   * — so it throws `Cannot read properties of null (reading 'stamp')` from
   * inside `scene.update`. Phaser's `RequestAnimationFrame.step` reschedules
   * only after `callback()` returns, so that throw permanently stops the
   * render loop: the battle canvas freezes mid-fight while the DOM menus and
   * combat logic (combat-ui's own RAF) keep running. Fixed 2026-08-01.
   */
  private clearShine(key: string): void {
    const shine = this.shines.get(key);
    if (!shine) return;
    this.shines.delete(key);
    try {
      if (shine.tidyup) {
        shine.sprite.off(DESTROY_EVENT, shine.tidyup as (...args: unknown[]) => void);
      }
    } catch {
      /* sprite already torn down — its tidyup has run, nothing to unhook */
    }
    try {
      shine.tween.destroy();
      const internal = shine.sprite.filters?.internal;
      if (shine.parallelFilters && internal) {
        internal.remove(shine.parallelFilters);
      }
      shine.dynamicTexture.destroy();
    } catch {
      /* sprite/texture already torn down */
    }
  }

  clearAllShines(): void {
    for (const key of [...this.shines.keys()]) this.clearShine(key);
  }

  /**
   * One short bloom flash per cast banner (harvest H2).
   *
   * Keyed off `scene.bannerStart`, not a tween, so FAST playback and skip carry
   * it correctly. `castBloomPulse` going inactive is the teardown cue — the
   * bloom must never outlive its window, because it shares the camera external
   * list with the spotlight Glow and two stacked multi-pass filters for a whole
   * cast is exactly what the budget rule forbids.
   */
  private syncCastBloom(scene: CombatScene, now: number): void {
    if (!PHASER_FX_CAST_BLOOM) {
      this.clearCastBloom();
      return;
    }
    const casting = !!(scene.banner && scene.banner.length > 0);
    if (!casting) {
      this.clearCastBloom();
      return;
    }
    const pulse = castBloomPulse(now - scene.bannerStart);
    if (!pulse.active) {
      this.clearCastBloom();
      return;
    }
    if (this.bloom && this.bloom.bannerStart !== scene.bannerStart) {
      this.clearCastBloom();
    }
    try {
      if (!this.bloom) {
        const [added] = Phaser.Actions.AddEffectBloom(this.cameras.main, {
          threshold: 0.55,
          blurRadius: 6,
          blurSteps: 2,
          blurQuality: 1,
          blendAmount: pulse.blendAmount,
        });
        if (!added?.parallelFilters) return;
        this.bloom = {
          parallelFilters: added.parallelFilters,
          bannerStart: scene.bannerStart,
        };
      }
      // `AddEffectBloom`'s `blendAmount` config lands on `parallelFilters.blend.amount`
      // (Blend filter), NOT a `blendAmount` property on the ParallelFilters itself.
      // Writing the latter is a silent no-op that freezes the bloom at whatever
      // amplitude its first frame happened to create it with.
      this.bloom.parallelFilters.blend.amount = pulse.blendAmount;
    } catch {
      // CANVAS renderer / Filters unavailable — no bloom, spotlight unaffected.
      this.clearCastBloom();
    }
  }

  clearCastBloom(): void {
    if (!this.bloom) return;
    try {
      this.cameras?.main?.filters?.external.remove(this.bloom.parallelFilters);
    } catch {
      /* camera already torn down */
    }
    this.bloom = null;
  }

  private syncSpotlight(scene: CombatScene): void {
    if (!PHASER_FX_SPOTLIGHT) {
      this.clearSpotlightFilters();
      return;
    }
    // Gate to intro / cast banner only — NOT activeActorId (palette phase
    // would run camera-wide Glow+dim for the whole player turn).
    const casting = !!(scene.banner && scene.banner.length > 0);
    const intro = !!scene.introNameplate;
    if (!intro && !casting) {
      this.clearSpotlightFilters();
      return;
    }
    const bossAccent =
      intro && scene.introBossId
        ? BOSS_PRESENTATION[scene.introBossId]?.accent ?? null
        : null;
    const recipe = spotlightRecipe({
      bossAccentHex: bossAccent,
      casting,
    });
    this.ensureSpotlightFilters(recipe);
  }

  /** `camera.filters` as the structural shape `combat-phaser-fx` expects. */
  private spotlightFilterLists(): SpotlightFilterLists | null {
    const f = this.cameras?.main?.filters;
    return (f as unknown as SpotlightFilterLists) ?? null;
  }

  private ensureSpotlightFilters(recipe: SpotlightRecipe): void {
    // One Glow + one ColorMatrix max (plan risk table); see applySpotlight.
    applySpotlight(this.spotlight, this.spotlightFilterLists(), recipe);
  }

  /**
   * Mosaic-and-drain the actor across its death animation (harvest H1).
   *
   * Per-sprite Filters are WebGL-only, so this silently no-ops on the CANVAS
   * renderer — the existing `anim.opacity` / `fadeOutStart` fade still owns the
   * actual disappearance there, which is the documented canvas fallback.
   *
   * Note there is no `disableFilters()` in Phaser 4: `enableFilters()` allocates
   * a framebuffer that lives until the Sprite is destroyed. That is why this is
   * gated to actors that actually die rather than enabled up front — the cost is
   * bounded by the corpse count, and the whole Game is torn down per fight.
   */
  private applyDeathDissolve(
    entry: ActorSpriteEntry,
    anim: ActorAnim,
    now: number,
    x: number,
    footY: number,
    drawSize: number
  ): void {
    if (!(entry.sprite instanceof Phaser.GameObjects.Sprite)) return;
    if (!PHASER_FX_DEATH_DISSOLVE || entry.isFallback || anim.state !== "death") {
      this.clearDeathDissolve(entry);
      return;
    }
    const t = (now - anim.stateStart) / DEATH_ANIM_MS;
    const recipe = deathDissolveRecipe(t, "default");
    try {
      if (!entry.crumble) {
        const sprite = entry.sprite.enableFilters();
        const internal = sprite.filters?.internal;
        if (!internal) return;
        entry.crumble = {};
        if (PHASER_FX_PALETTE_CRUMBLE) {
          entry.crumble.gradientMap = internal.addGradientMap({
            ramp: recipe.gradientMap.ramp,
            dither: recipe.gradientMap.dither,
            alpha: 0,
          });
          entry.crumble.blocky = internal.addBlocky({ size: 1 });
          entry.crumble.wipe = internal.addWipe(
            recipe.wipe.width,
            1, // bottom-to-top
            1, // Y axis
            0 // fade (not reveal)
          );
        } else {
          entry.crumble.pixelate = internal.addPixelate(recipe.pixelate);
          entry.crumble.matrix = internal.addColorMatrix();
        }
      }
      if (PHASER_FX_PALETTE_CRUMBLE) {
        if (entry.crumble.gradientMap) {
          entry.crumble.gradientMap.alpha = recipe.gradientMap.alpha;
        }
        if (entry.crumble.blocky) {
          const size = recipe.blocky.size;
          entry.crumble.blocky.size = { x: size, y: size };
        }
        if (entry.crumble.wipe) {
          entry.crumble.wipe.progress = recipe.wipe.progress;
        }
        this.updateAshParticles(entry, recipe, t, x, footY, drawSize);
      } else {
        if (entry.crumble.pixelate) {
          entry.crumble.pixelate.amount = recipe.pixelate;
        }
        if (entry.crumble.matrix) {
          entry.crumble.matrix.colorMatrix.reset();
          entry.crumble.matrix.colorMatrix.grayscale(recipe.grayscale);
        }
      }
    } catch {
      // CANVAS renderer / Filters unavailable — degrade to the opacity fade.
      this.clearDeathDissolve(entry);
    }
  }

  /** Splice crumble controllers and ash arcs out (revive, actor leaving death). */
  private clearDeathDissolve(entry: ActorSpriteEntry): void {
    this.clearAshArcs(entry);
    if (!entry.crumble) return;
    try {
      const internal = (
        entry.sprite as Phaser.GameObjects.Sprite
      ).filters?.internal;
      if (internal) {
        if (entry.crumble.pixelate) internal.remove(entry.crumble.pixelate);
        if (entry.crumble.matrix) internal.remove(entry.crumble.matrix);
        if (entry.crumble.gradientMap) internal.remove(entry.crumble.gradientMap);
        if (entry.crumble.blocky) internal.remove(entry.crumble.blocky);
        if (entry.crumble.wipe) internal.remove(entry.crumble.wipe);
      }
    } catch {
      /* sprite already torn down */
    }
    entry.crumble = null;
  }

  private clearAshArcs(entry: ActorSpriteEntry): void {
    if (!entry.ashArcs?.length) return;
    for (const arc of entry.ashArcs) {
      try {
        arc.destroy();
      } catch {
        /* already destroyed */
      }
    }
    entry.ashArcs = [];
  }

  /** Explicit teardown before the scene is destroyed, so no filter leaks. */
  clearAllCrumble(): void {
    for (const entry of this.actors.values()) {
      this.clearDeathDissolve(entry);
    }
  }

  private updateAshParticles(
    entry: ActorSpriteEntry,
    recipe: ReturnType<typeof deathDissolveRecipe>,
    t: number,
    x: number,
    footY: number,
    drawSize: number
  ): void {
    if (recipe.ash.count <= 0) {
      entry.ashArcs?.forEach((arc) => arc.setVisible(false));
      return;
    }
    entry.ashArcs ??= [];
    const desired = recipe.ash.count;
    while (entry.ashArcs.length < desired) {
      const arc = this.addTo(this.effectsLayer, this.add.circle(0, 0, 2, recipe.ash.color, 0));
      arc.setDepth(footY);
      arc.setBlendMode(Phaser.BlendModes.NORMAL);
      arc.setVisible(false);
      entry.ashArcs.push(arc);
    }
    for (let i = 0; i < desired; i++) {
      const arc = entry.ashArcs[i];
      if (!arc) continue;
      const speed = (i % 3) + 1;
      const phase = desired > 1 ? i / (desired - 1) : 0.5;
      const spread = (i % 2 === 0 ? 1 : -1) * (0.2 + (i % 5) * 0.05) * drawSize * 0.5;
      const baseY = footY - drawSize * (0.2 + phase * 0.4);
      const rise = t * speed * drawSize * 0.3;
      arc.x = x + spread;
      arc.y = baseY - rise;
      arc.setFillStyle(recipe.ash.color, recipe.ash.alpha);
      arc.setVisible(true);
    }
    for (let i = desired; i < entry.ashArcs.length; i++) {
      entry.ashArcs[i]?.setVisible(false);
    }
  }

  private applyHitSquash(
    entry: ActorSpriteEntry,
    anim: ActorAnim,
    now: number,
    drawSize: number,
    centerX: number,
    centerY: number
  ): void {
    let sx = 1;
    let sy = 1;
    if (
      PHASER_FX_HIT_SQUASH &&
      !entry.isFallback &&
      anim.state === "hurt"
    ) {
      const t01 = Math.min(1, Math.max(0, (now - anim.stateStart) / 450));
      ({ sx, sy } = hitSquashScale(t01));
    }
    // Fold squash into display size — setScale after setDisplaySize would
    // discard the combat draw size (Phaser maps display size via scale).
    entry.sprite.setDisplaySize(drawSize * sx, drawSize * sy);
    // Origin is (0.5, 0.5): shortening sy lifts feet off the shadow.
    // Push Y down so the foot edge stays planted.
    entry.sprite.setPosition(
      centerX,
      centerY + hitSquashFootOffset(drawSize, sy)
    );
  }

  /**
   * Apply impact silhouette flash as a sprite tint override.
   * Called after applyStatusTint so the flash takes precedence when active.
   * When the flash expires, the next applyStatusTint call restores the normal tint.
   */
  private applyActorFlash(
    entry: ActorSpriteEntry,
    actorId: string,
    scene: CombatScene,
    now: number
  ): void {
    const flash = sampleActorFlash(scene.impact.actorFlashes.get(actorId) ?? null, now);
    if (flash.strength > 0.01 && !entry.isFallback) {
      const colorHex = flash.color.replace("#", "0x");
      const colorNum = parseInt(colorHex, 16) || 0xffffff;
      // Use ADD tint mode so the flash brightens the sprite rather than replacing it.
      const sprite = entry.sprite as Phaser.GameObjects.Sprite;
      sprite.setTint(colorNum);
    }
  }

  clearSpotlightFilters(): void {
    clearSpotlight(this.spotlight, this.spotlightFilterLists());
  }

  private syncEnvLight(scene: CombatScene, now: number, w: number, h: number): void {
    const env = sampleEnvironmentLight(scene.impact.environment, now);
    if (!env.active) {
      if (this.envDimRect) this.envDimRect.setVisible(false);
      if (this.envFlashRect) this.envFlashRect.setVisible(false);
      if (this.envFloorGlow) this.envFloorGlow.setVisible(false);
      if (this.envRimGlow) this.envRimGlow.setVisible(false);
      return;
    }
    const colorHex = scene.impact.environment?.color ?? "#ffffff";
    const colorNum = parseInt(colorHex.replace("#", "0x"), 16) || 0xffffff;
    const srcX = scene.impact.environment?.sourceX ?? w * 0.5;
    const srcY = scene.impact.environment?.sourceY ?? h * 0.7;

    // Dim overlay (normal blend, black, alpha = backdropDim).
    if (!this.envDimRect) {
      this.envDimRect = this.addTo(this.dimLayer, this.add.rectangle(0, 0, w, h, 0x000000, 0).setOrigin(0, 0).setDepth(-900));
    }
    this.envDimRect.setVisible(true);
    this.envDimRect.setAlpha(env.backdropDim);

    // Screen flash (additive, very brief).
    if (env.screenFlashStrength > 0.001) {
      if (!this.envFlashRect) {
        this.envFlashRect = this.add.rectangle(0, 0, w, h, colorNum, 0).setOrigin(0, 0).setDepth(899).setBlendMode(Phaser.BlendModes.ADD);
      }
      this.envFlashRect.setVisible(true);
      this.envFlashRect.setFillStyle(colorNum);
      this.envFlashRect.setAlpha(env.screenFlashStrength);
    } else if (this.envFlashRect) {
      this.envFlashRect.setVisible(false);
    }

    // Floor radial glow (additive, impact-centered).
    if (env.floorStrength > 0.001) {
      if (!this.envFloorGlow) {
        this.envFloorGlow = this.addTo(this.fgLightingLayer, this.add.graphics().setDepth(898).setBlendMode(Phaser.BlendModes.ADD));
      }
      this.envFloorGlow.setVisible(true);
      this.envFloorGlow.clear();
      const radius = w * 0.5;
      const alpha = env.floorStrength * 0.5;
      // Draw concentric circles from outer (transparent) to inner (color).
      for (let i = 5; i >= 0; i--) {
        const r = radius * (1 - i * 0.15);
        const a = alpha * (i / 5);
        this.envFloorGlow.fillStyle(colorNum, a);
        this.envFloorGlow.fillCircle(srcX, srcY, r);
      }
    } else if (this.envFloorGlow) {
      this.envFloorGlow.setVisible(false);
    }

    // Rim vignette (additive, top-down gradient).
    if (env.rimStrength > 0.001) {
      if (!this.envRimGlow) {
        this.envRimGlow = this.addTo(this.fgLightingLayer, this.add.graphics().setDepth(897).setBlendMode(Phaser.BlendModes.ADD));
      }
      this.envRimGlow.setVisible(true);
      this.envRimGlow.clear();
      const rimAlpha = env.rimStrength * 0.3;
      // Draw horizontal bands fading from top to mid-screen.
      for (let i = 0; i < 6; i++) {
        const bandH = h * 0.4 / 6;
        const a = rimAlpha * (1 - i / 6);
        this.envRimGlow.fillStyle(colorNum, a);
        this.envRimGlow.fillRect(0, i * bandH, w, bandH);
      }
    } else if (this.envRimGlow) {
      this.envRimGlow.setVisible(false);
    }
  }

  private syncBackground(scene: CombatScene): void {
    const key = scene.backdrop && this.textures.exists("combat-backdrop")
      ? "combat-backdrop"
      : this.textures.exists("combat-bg")
        ? "combat-bg"
        : null;
    if (!key) return;
    if (!this.bgImage) {
      this.bgImage = this.addTo(this.bgLayer, this.add.image(COMBAT_DESIGN_W / 2, COMBAT_DESIGN_H / 2, key).setDepth(-1000));
      this.bgImage.setDisplaySize(COMBAT_DESIGN_W, COMBAT_DESIGN_H);
    } else if (this.bgImage.texture.key !== key) {
      this.bgImage.setTexture(key);
      this.bgImage.setDisplaySize(COMBAT_DESIGN_W, COMBAT_DESIGN_H);
    }
  }

  private syncGlows(scene: CombatScene, now: number): void {
    const g = this.glowGraphics;
    if (!g) return;
    g.clear();
    for (const glow of scene.lightGlows) {
      const p = (now - glow.start) / glow.duration;
      if (p < 0 || p >= 1) continue;
      const alpha = (1 - p) * 0.35;
      const r = glow.radius * (0.6 + p * 0.5);
      const color = Phaser.Display.Color.IntegerToColor(
        Phaser.Display.Color.HexStringToColor(
          glow.color.startsWith("#") ? glow.color : "#ffffff"
        ).color
      );
      // Approximate additive soft circle.
      g.fillStyle(color.color, alpha);
      g.fillCircle(glow.x, glow.y, r);
    }
  }

  private actorPoolKey(kind: ActorKind, id: string): string {
    return `${kind}:${id}`;
  }

  /**
   * Ghost clones trailing an actor mid-walk (harvest H5).
   *
   * Past positions come from replaying `animOffset` at earlier timestamps rather
   * than from a history buffer — the move is an analytic ease, so sampling it is
   * exact and costs nothing to keep. `afterimageSamples` guarantees every age it
   * returns is inside the move, which matters: `animOffset` does not clamp `t` at
   * 0, so an age reaching back before `moveStart` would place a ghost *ahead* of
   * the actor.
   *
   * Phaser-only by design; `?phaser=0` keeps the plain walk.
   */
  private applyAfterimage(opts: {
    anim: ActorAnim;
    now: number;
    baseX: number;
    baseY: number;
    baseFootY: number;
    drawSize: number;
    flipX: boolean;
    texKey: string;
    opacity: number;
    frameFor: (ageMs: number) => number;
  }): void {
    if (!PHASER_FX_AFTERIMAGE) return;
    const { anim, now } = opts;
    if (anim.state !== "walk") return;
    const samples = afterimageSamples({
      elapsedMs: now - anim.moveStart,
      moveDurationMs: anim.moveDuration,
    });
    for (const g of samples) {
      const past = animOffset(anim, now - g.ageMs);
      const ghost = this.ghostPool.acquire();
      ghost.setTexture(opts.texKey, opts.frameFor(g.ageMs));
      ghost.setPosition(opts.baseX + past.x, opts.baseY + past.y);
      ghost.setDisplaySize(opts.drawSize, opts.drawSize);
      ghost.setFlipX(opts.flipX);
      ghost.setAlpha(g.alpha * opts.opacity);
      // Behind the body, in front of its contact shadow (which sits at -0.5).
      ghost.setDepth(opts.baseFootY + past.y - 0.4);
    }
  }

  private syncActors(scene: CombatScene, now: number, w: number, h: number): void {
    const seen = new Set<string>();
    const s = scene.state;
    this.ghostPool.begin();

    const placeEnemy = (e: EnemyInstance, slot: number) => {
      const key = this.actorPoolKey("enemy", e.instanceId);
      seen.add(key);
      this.upsertEnemy(key, e, slot, scene, now, w);
    };
    for (const e of s.enemies.back) {
      placeEnemy(e, enemySlotIndex(scene, "back", e.instanceId));
    }
    for (const e of s.enemies.front) {
      placeEnemy(e, enemySlotIndex(scene, "front", e.instanceId));
    }
    for (const e of scene.enemyCorpses) {
      const slot =
        scene.enemySlots.get(e.instanceId) ??
        enemySlotIndex(scene, e.row, e.instanceId);
      placeEnemy(e, slot);
    }

    for (const a of s.summonedAllies) {
      const key = this.actorPoolKey("ally", a.id);
      seen.add(key);
      this.upsertAlly(key, a, allySlotIndex(scene, a.id), scene, now, w, h);
    }
    for (const a of scene.allyCorpses) {
      const key = this.actorPoolKey("ally", a.id);
      seen.add(key);
      const idx = scene.allySlots.get(a.id) ?? allySlotIndex(scene, a.id);
      this.upsertAlly(key, a, idx, scene, now, w, h);
    }

    for (let i = 0; i < s.party.length; i++) {
      const c = s.party[i]!;
      const key = this.actorPoolKey("party", c.id);
      seen.add(key);
      this.upsertParty(key, c, i, scene, now, w, h);
    }

    for (const [key, entry] of this.actors) {
      if (!seen.has(key)) {
        entry.sprite.destroy();
        entry.shadow.destroy();
        this.actors.delete(key);
      }
    }
    // Nothing acquired this frame => every ghost hides. That is the whole
    // clear-on-skip/turn-end story: the trail is derived from live anim state,
    // so it cannot outlive the walk that produced it.
    this.ghostPool.end();
  }

  private ensureFallback(
    key: string,
    kind: ActorKind,
    color: number
  ): ActorSpriteEntry {
    const textureKey = `onyx:fallback:${kind}:${color.toString(16).padStart(6, "0")}`;
    let entry = this.actors.get(key);
    if (
      entry &&
      entry.isFallback &&
      ((entry.sprite instanceof Phaser.GameObjects.Sprite &&
        entry.sprite.texture.key === textureKey) ||
        entry.sprite instanceof Phaser.GameObjects.Ellipse)
    ) {
      return entry;
    }
    if (entry) {
      entry.sprite.destroy();
      entry.shadow.destroy();
    }

    if (!this.textures.exists(textureKey)) {
      const texture = this.textures.createCanvas(textureKey, 100, 100);
      if (texture) {
        const ctx = texture.getContext();
        const fill = `#${color.toString(16).padStart(6, "0")}`;
        ctx.clearRect(0, 0, 100, 100);
        ctx.imageSmoothingEnabled = false;

        // Chunky 16-bit silhouettes, deliberately compact inside the 100×100
        // actor square. The old Phaser fallback filled 55×70% with one opaque
        // ellipse, which became a tan screen-covering slab in dense packs.
        // These shapes keep a dark outline, sparse luminous detail, and feet at
        // y=92 to honor ART_FOOT_FROM_TOP_FALLBACK's ground-plane contract.
        ctx.fillStyle = "#14110d";
        if (kind === "party") {
          ctx.fillRect(35, 20, 30, 27);
          ctx.fillRect(28, 43, 44, 34);
          ctx.fillRect(30, 73, 17, 20);
          ctx.fillRect(53, 73, 17, 20);
          ctx.fillStyle = fill;
          ctx.fillRect(39, 24, 22, 19);
          ctx.fillRect(33, 47, 34, 27);
          ctx.fillRect(34, 74, 11, 15);
          ctx.fillRect(55, 74, 11, 15);
        } else if (kind === "ally") {
          ctx.fillRect(39, 24, 22, 68);
          ctx.fillRect(28, 35, 44, 42);
          ctx.fillRect(34, 29, 32, 54);
          ctx.fillStyle = fill;
          ctx.fillRect(42, 29, 16, 58);
          ctx.fillRect(33, 40, 34, 32);
          ctx.fillStyle = "#f5f0e6";
          ctx.fillRect(47, 48, 6, 6);
        } else {
          ctx.fillRect(30, 24, 40, 16);
          ctx.fillRect(23, 35, 60, 43);
          ctx.fillRect(29, 73, 19, 20);
          ctx.fillRect(58, 73, 19, 20);
          ctx.fillStyle = fill;
          ctx.fillRect(34, 29, 32, 12);
          ctx.fillRect(28, 40, 50, 34);
          ctx.fillRect(33, 73, 13, 16);
          ctx.fillRect(60, 73, 13, 16);
          // Eyes face the party, matching the canvas rollback convention.
          ctx.fillStyle = "#14110d";
          ctx.fillRect(55, 45, 7, 7);
          ctx.fillRect(68, 45, 7, 7);
          ctx.fillStyle = "#e0a458";
          ctx.fillRect(57, 47, 3, 3);
          ctx.fillRect(70, 47, 3, 3);
        }
        texture.refresh();
      }
    }

    const shadow = this.addTo(this.actorLayer, this.add.ellipse(0, 0, 40, 12, 0x000000, 0.4).setDepth(0));
    const sprite = this.textures.exists(textureKey)
      ? this.addTo(this.actorLayer, this.add.sprite(0, 0, textureKey).setOrigin(0.5, 0.5).setDepth(1))
      : this.addTo(this.actorLayer, this.add.ellipse(0, 0, 44, 62, color).setDepth(1));
    entry = { key, kind, sprite, shadow, isFallback: true };
    this.actors.set(key, entry);
    return entry;
  }

  private placeFallback(
    entry: ActorSpriteEntry,
    x: number,
    footY: number,
    drawSize: number
  ): void {
    if (entry.sprite instanceof Phaser.GameObjects.Sprite) {
      // Match the opaque footprint of pack art. Pack frames are drawSize square
      // but their figures occupy only a compact center crop; drawing the full
      // fallback texture at drawSize recreates the screen-covering slab.
      const displaySize = drawSize * 0.46;
      entry.sprite.setDisplaySize(displaySize, displaySize);
      entry.sprite.setPosition(
        x,
        footY - displaySize * (ART_FOOT_FROM_TOP_FALLBACK - 0.5)
      );
      return;
    }
    const displayW = drawSize * 0.34;
    const displayH = drawSize * 0.45;
    entry.sprite.setDisplaySize(displayW, displayH);
    entry.sprite.setPosition(x, footY - displayH / 2);
  }

  private ensureStripSprite(
    key: string,
    kind: ActorKind,
    texKey: string
  ): ActorSpriteEntry | null {
    if (!this.textures.exists(texKey)) return null;
    let entry = this.actors.get(key);
    if (entry && !entry.isFallback && entry.sprite instanceof Phaser.GameObjects.Sprite) {
      if (entry.sprite.texture.key !== texKey) {
        entry.sprite.setTexture(texKey);
      }
      return entry;
    }
    if (entry) {
      entry.sprite.destroy();
      entry.shadow.destroy();
    }
    const shadow = this.addTo(this.actorLayer, this.add.ellipse(0, 0, 40, 12, 0x000000, 0.4).setDepth(0));
    // Origin (0.5, 0.5): position at ResolvedSlot.centerY — same contract as
    // canvas drawStripFrame(ctx, …, x, centerY, size). Never position at drawY
    // (frame top); that floats the whole formation ~½ sprite-height upward.
    const sprite = this.addTo(this.actorLayer, this.add.sprite(0, 0, texKey).setOrigin(0.5, 0.5).setDepth(1));
    entry = { key, kind, sprite, shadow, isFallback: false };
    this.actors.set(key, entry);
    return entry;
  }

  private upsertEnemy(
    key: string,
    enemy: EnemyInstance,
    idxInRow: number,
    scene: CombatScene,
    now: number,
    w: number
  ): void {
    const anim = getAnim(scene, "enemy", enemy.instanceId, now);
    if (anim.opacity <= 0) {
      const existing = this.actors.get(key);
      if (existing) {
        existing.sprite.setVisible(false);
        existing.shadow.setVisible(false);
      }
      return;
    }
    const baseSize = enemy.isBoss ? BOSS_SIZE : ENEMY_SIZE;
    const stripState = enemyStripState(anim.state);
    const spriteId = enemySpriteId(enemy);
    const stripInfo = getEnemySpriteStrip(spriteId, stripState);
    const hasStrip = !!(stripInfo?.img && stripInfo.img.naturalWidth > 0);
    const artFoot = artFootFromTopFor({
      hasStrip,
      stripArtFootFromTop: stripInfo?.strip.artFootFromTop,
    });
    const statusScale = statusDrawScale(enemy.status);
    const pos = toScreenFromResolve(
      resolveSlot(enemySlot(idxInRow, enemy.row), geometryForBackdrop(scene.backdropId), {
        spriteHeight: baseSize * statusScale,
        canvasWidth: w,
        artFootFromTop: artFoot,
      })
    );
    const off = animOffset(anim, now);
    const x = pos.x + off.x;
    const y = pos.y + off.y;
    const footY = pos.footY + off.y;
    const drawSize = baseSize * pos.scale * statusScale;

    const texKey = `enemy:${spriteId}:${stripState}`;
    let entry =
      hasStrip && stripInfo
        ? this.ensureStripSprite(key, "enemy", texKey)
        : null;
    if (!entry) {
      entry = this.ensureFallback(key, "enemy", enemy.isBoss ? 0x8f3f3f : 0x6f674f);
    }

    entry.sprite.setVisible(true);
    entry.shadow.setVisible(true);
    // Match canvas drawContactShadow: ellipse centered slightly above footY.
    const shadowRx = Math.max(8, drawSize * 0.45 * 0.28);
    entry.shadow.setPosition(x, footY - shadowRx * 0.28 * 0.35);
    entry.shadow.setDisplaySize(shadowRx * 2, shadowRx * 0.56);
    entry.shadow.setDepth(footY - 0.5);
    entry.sprite.setAlpha(anim.opacity);
    entry.sprite.setDepth(footY);

    if (!entry.isFallback && entry.sprite instanceof Phaser.GameObjects.Sprite && stripInfo) {
      const stateAge = now - anim.stateStart;
      let frame: number;
      if (anim.state === "death") {
        frame = Math.min(
          stripInfo.strip.frameCount - 1,
          Math.floor((stateAge / 675) * stripInfo.strip.frameCount)
        );
      } else {
        const frozen =
          enemy.status.includes("sleep") || enemy.status.includes("paralysis");
        frame =
          frozen && anim.state === "idle"
            ? 0
            : frameIndexFor(stripInfo.strip, stateAge, anim.frameRateScale);
      }
      entry.sprite.setFrame(frame);
      // Center at ResolvedSlot.centerY (pos.y) — canvas drawStripFrame contract.
      entry.sprite.setFlipX(false);
      this.applyAfterimage({
        anim,
        now,
        baseX: pos.x,
        baseY: pos.y,
        baseFootY: pos.footY,
        drawSize,
        flipX: false,
        texKey,
        opacity: anim.opacity,
        frameFor: (ageMs) =>
          frameIndexFor(stripInfo.strip, Math.max(0, stateAge - ageMs), anim.frameRateScale),
      });
      applyStatusTint(
        entry.sprite,
        statusTintFor({
          poison: enemy.status.includes("poison"),
          burn: (scene.state.enemyDots[enemy.instanceId]?.length ?? 0) > 0,
        })
      );
      this.applyHitSquash(entry, anim, now, drawSize, x, y);
      this.applyDeathDissolve(entry, anim, now, x, footY, drawSize);
      this.applyActorFlash(entry, enemy.instanceId, scene, now);
    } else {
      this.placeFallback(entry, x, footY, drawSize);
    }
  }

  private upsertAlly(
    key: string,
    ally: SummonedAlly,
    index: number,
    scene: CombatScene,
    now: number,
    w: number,
    h: number
  ): void {
    const anim = getAnim(scene, "ally", ally.id, now);
    if (anim.opacity <= 0) {
      const existing = this.actors.get(key);
      if (existing) {
        existing.sprite.setVisible(false);
        existing.shadow.setVisible(false);
      }
      return;
    }
    const pos = allyPos(index, w, h, scene.backdropId);
    const off = animOffset(anim, now);
    const x = pos.x + off.x;
    const y = pos.y + off.y;
    const footY = pos.footY + off.y;
    const drawSize = ENEMY_SIZE * pos.scale;
    const stripState = enemyStripState(anim.state);
    const stripInfo = ally.spriteId
      ? getEnemySpriteStrip(ally.spriteId, stripState)
      : null;
    const hasStrip = !!(stripInfo?.img && stripInfo.img.naturalWidth > 0);
    const texKey = ally.spriteId ? `enemy:${ally.spriteId}:${stripState}` : "";
    let entry =
      hasStrip && ally.spriteId
        ? this.ensureStripSprite(key, "ally", texKey)
        : null;
    if (!entry) {
      entry = this.ensureFallback(key, "ally", 0x48cccc);
    }
    entry.sprite.setVisible(true);
    entry.shadow.setVisible(true);
    const shadowRx = Math.max(8, drawSize * 0.45 * 0.28);
    entry.shadow.setPosition(x, footY - shadowRx * 0.28 * 0.35);
    entry.shadow.setDisplaySize(shadowRx * 2, shadowRx * 0.56);
    entry.shadow.setDepth(footY - 0.5);
    entry.sprite.setAlpha(anim.opacity);
    entry.sprite.setDepth(footY);
    if (!entry.isFallback && entry.sprite instanceof Phaser.GameObjects.Sprite && stripInfo) {
      const stateAge = now - anim.stateStart;
      const frame =
        anim.state === "death"
          ? Math.min(
              stripInfo.strip.frameCount - 1,
              Math.floor((stateAge / 675) * stripInfo.strip.frameCount)
            )
          : frameIndexFor(stripInfo.strip, stateAge, anim.frameRateScale);
      entry.sprite.setFrame(frame);
      // Enemy strips face RIGHT; summons stand with the party side of the
      // stage and must face LEFT toward enemies (canvas drawAlly mirrors too).
      entry.sprite.setFlipX(true);
      this.applyAfterimage({
        anim,
        now,
        baseX: pos.x,
        baseY: pos.y,
        baseFootY: pos.footY,
        drawSize,
        flipX: true,
        texKey,
        opacity: anim.opacity,
        frameFor: (ageMs) =>
          frameIndexFor(stripInfo.strip, Math.max(0, stateAge - ageMs), anim.frameRateScale),
      });
      this.applyHitSquash(entry, anim, now, drawSize, x, y);
      this.applyDeathDissolve(entry, anim, now, x, footY, drawSize);
      this.applyActorFlash(entry, ally.id, scene, now);
    } else {
      this.placeFallback(entry, x, footY, drawSize);
    }
  }

  private upsertParty(
    key: string,
    char: Character,
    index: number,
    scene: CombatScene,
    now: number,
    w: number,
    h: number
  ): void {
    const anim = getAnim(scene, "party", char.id, now);
    const isDead = char.hp <= 0 || char.status.includes("knockedOut");
    const stripInfo = getPartySpriteStrip(char.class, anim.state);
    const hasStrip = !!(stripInfo?.img && stripInfo.img.naturalWidth > 0);
    const artFoot = artFootFromTopFor({
      hasStrip,
      stripArtFootFromTop: stripInfo?.strip.artFootFromTop,
    });
    // Mirror canvas drawPartyMember: resolve with strip-specific artFoot.
    // Fold statusDrawScale into spriteHeight so centreY foot-anchors (Shrink /
    // Giant Strength); multiplying drawSize alone after resolve floats/sinks.
    const statusScale = statusDrawScale(char.status);
    const pos = partyActorPos(
      scene.state,
      index,
      char.id,
      w,
      h,
      scene.backdropId,
      {
        spriteHeight: PARTY_SIZE * statusScale,
        artFootFromTop: artFoot,
      }
    );
    const off = animOffset(anim, now);
    const x = pos.x + off.x;
    const y = pos.y + off.y;
    const footY = pos.footY + off.y;
    const drawSize = PARTY_SIZE * pos.scale * statusScale;
    const texKey = `party:${char.class}:${anim.state}`;
    let entry = hasStrip ? this.ensureStripSprite(key, "party", texKey) : null;
    if (!entry) {
      const classColors: Record<string, number> = {
        Fighter: 0xcc4444,
        Mage: 0x4488cc,
        Priest: 0xe0d0a0,
        Thief: 0x44aa44,
        Halberdier: 0xaa5533,
        Duelist: 0xaa66cc,
        Crusader: 0xeeaa44,
      };
      entry = this.ensureFallback(key, "party", classColors[char.class] ?? 0xcccccc);
    }
    const hidden = char.status.includes("hidden");
    const opacity = (hidden ? 0.35 : 1) * anim.opacity * (isDead ? 0.85 : 1);
    entry.sprite.setVisible(true);
    entry.shadow.setVisible(!isDead);
    const shadowRx = Math.max(8, drawSize * 0.45 * 0.28);
    entry.shadow.setPosition(x, footY - shadowRx * 0.28 * 0.35);
    entry.shadow.setDisplaySize(shadowRx * 2, shadowRx * 0.56);
    entry.shadow.setDepth(footY - 0.5);
    entry.sprite.setAlpha(opacity);
    entry.sprite.setDepth(footY);
    if (!entry.isFallback && entry.sprite instanceof Phaser.GameObjects.Sprite && stripInfo) {
      const stateAge = now - anim.stateStart;
      const frozen =
        char.status.includes("sleep") || char.status.includes("paralysis");
      const frame =
        frozen && anim.state === "idle"
          ? 0
          : frameIndexFor(stripInfo.strip, stateAge, anim.frameRateScale);
      entry.sprite.setFrame(frame);
      entry.sprite.setFlipX(true);
      this.applyAfterimage({
        anim,
        now,
        baseX: pos.x,
        baseY: pos.y,
        baseFootY: pos.footY,
        drawSize,
        // Party strips are drawn mirrored — a ghost that misses this faces
        // backwards behind its own body.
        flipX: true,
        texKey,
        opacity,
        frameFor: (ageMs) =>
          frameIndexFor(stripInfo.strip, Math.max(0, stateAge - ageMs), anim.frameRateScale),
      });
      applyStatusTint(
        entry.sprite,
        statusTintFor({ poison: char.status.includes("poison") })
      );
      this.applyHitSquash(entry, anim, now, drawSize, x, y);
      this.applyDeathDissolve(entry, anim, now, x, footY, drawSize);
      this.applyActorFlash(entry, char.id, scene, now);
    } else {
      this.placeFallback(entry, x, footY, drawSize);
    }
  }

  /**
   * Paint `scene.effects` from the pools (harvest H6).
   *
   * Every property this sets must be set unconditionally, because a pooled GO
   * arrives carrying the last frame's state. Blend mode is the trap: it used to
   * be applied only under `if (effect.glow)`, which on a pooled object means the
   * first glowing effect leaves ADD on that slot forever.
   */
  private syncEffects(scene: CombatScene, now: number): void {
    this.effectSpritePool.begin();
    this.effectArcPool.begin();
    for (const effect of scene.effects) {
      const tRaw = (now - effect.start) / effect.duration;
      const t = Math.min(1, Math.max(0, tRaw));
      let x = effect.x;
      let y = effect.y;
      let angle = 0;
      if (effect.type === "charge") {
        y -= 60;
      } else if (effect.type === "projectile") {
        const pose = sampleProjectilePose(
          t,
          effect.fromX ?? effect.x,
          effect.fromY ?? effect.y,
          effect.toX ?? effect.x,
          effect.toY ?? effect.y,
          {
            apexX: effect.apexX,
            apexY: effect.apexY,
            riseFrac: effect.riseFrac,
          }
        );
        x = pose.x;
        y = pose.y;
        angle = pose.angle;
      }
      if (effect.effect) {
        const sprite = getEffectSprite(effect.effect);
        if (sprite?.img && sprite.img.naturalWidth > 0) {
          const texKey = `effect:${effect.effect}`;
          this.ensureSpriteSheet(
            texKey,
            sprite.img,
            sprite.strip.frameWidth,
            sprite.strip.frameHeight
          );
          if (this.textures.exists(texKey)) {
            const frame = effectFrame(sprite, effect.start, now, effect.type);
            const go = this.effectSpritePool.acquire();
            go.setTexture(texKey, frame);
            go.setPosition(x, y).setDepth(600).setRotation(angle);
            const scale = effect.scale ?? 1;
            go.setDisplaySize(
              sprite.strip.frameWidth * scale,
              sprite.strip.frameHeight * scale
            );
            const alpha =
              effect.type === "burst"
                ? 1 - t
                : effect.type === "field"
                  ? 1 - t * 0.5
                  : 1;
            go.setAlpha(alpha);
            try {
              go.setBlendMode(
                effect.glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL
              );
            } catch {
              /* CANVAS may ignore */
            }
            continue;
          }
        }
      }
      // Procedural fallback burst.
      const arc = this.effectArcPool.acquire();
      arc.setPosition(x, y).setDepth(600);
      arc.setRadius(12 + t * 36);
      arc.setFillStyle(0x4488cc, effect.type === "burst" ? 1 - t : 0.7);
    }
    this.effectSpritePool.end();
    this.effectArcPool.end();
  }

  private syncParticles(scene: CombatScene): void {
    this.particlePool.begin();
    for (const p of scene.particles) {
      const life = p.life / p.maxLife;
      const arc = this.particlePool.acquire();
      arc.setPosition(p.x, p.y).setDepth(550);
      arc.setRadius(p.size * (1 - life * 0.5));
      let color = 0xffffff;
      try {
        color = Phaser.Display.Color.HexStringToColor(
          p.color.startsWith("#") ? p.color : "#ffffff"
        ).color;
      } catch {
        /* keep white */
      }
      arc.setFillStyle(color, 1 - life);
      // Unconditional: a pooled arc keeps whatever blend the last one had.
      arc.setBlendMode(p.glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    }
    this.particlePool.end();
  }

  private syncPopups(scene: CombatScene, now: number): void {
    const seen = new Set<string>();
    for (let i = 0; i < scene.popups.length; i++) {
      const p = scene.popups[i]!;
      const id = `popup:${i}:${p.start}:${p.text}`;
      seen.add(id);
      let text = this.popups.get(id);
      const t = Math.min(1, (now - p.start) / POPUP_DURATION);
      const dy = popupOffsetY(t);
      const alpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      const color = p.color;
      if (!text) {
        text = this.add
          .text(p.x, p.y + dy, p.text, {
            fontFamily: "FF36, monospace",
            fontSize: p.big ? "28px" : "22px",
            color,
            stroke: "#000000",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(700);
        this.popups.set(id, text);
      } else {
        text.setPosition(p.x, p.y + dy);
        text.setAlpha(alpha);
      }
    }
    for (const [id, text] of this.popups) {
      if (!seen.has(id)) {
        text.destroy();
        this.popups.delete(id);
      }
    }
  }

  private syncBarks(
    scene: CombatScene,
    now: number,
    w: number,
    h: number
  ): void {
    if (!getBarksEnabled()) {
      for (const [, t] of this.barks) t.destroy();
      this.barks.clear();
      return;
    }
    const seen = new Set<string>();
    // Phaser text measure: use a probe.
    const probe =
      this.barks.values().next().value ??
      this.add
        .text(-9999, -9999, "", { fontFamily: "FF36, monospace", fontSize: "19px" })
        .setVisible(false);
    for (let i = 0; i < scene.barks.length; i++) {
      const b = scene.barks[i]!;
      const id = `bark:${i}:${b.start}:${b.text}`;
      probe.setText(b.text);
      if (probe.width > BARK_MAX_WIDTH_PX) continue;
      // Find actor
      const kinds: ActorKind[] = ["party", "enemy", "ally"];
      let ax = 0;
      let ay = 0;
      let found = false;
      let anim: ActorAnim | null = null;
      for (const kind of kinds) {
        const entry = this.actors.get(this.actorPoolKey(kind, b.actorId));
        if (entry) {
          ax = entry.sprite.x;
          ay = entry.sprite.y - 36;
          anim = getAnim(scene, kind, b.actorId, now);
          found = true;
          break;
        }
      }
      if (!found || !anim || anim.opacity <= 0) continue;
      seen.add(id);
      const t = Math.min(1, (now - b.start) / b.durationMs);
      const alpha = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
      const dy = popupOffsetY(t);
      let text = this.barks.get(id);
      if (!text) {
        text = this.add
          .text(ax, ay + dy, b.text, {
            fontFamily: "FF36, monospace",
            fontSize: "19px",
            color: b.color || "#f0e0c0",
            stroke: "#000000",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(750);
        this.barks.set(id, text);
      } else {
        text.setPosition(ax, ay + dy);
        text.setAlpha(alpha);
      }
    }
    for (const [id, text] of this.barks) {
      if (!seen.has(id)) {
        text.destroy();
        this.barks.delete(id);
      }
    }
    void w;
    void h;
  }

  private syncBanner(scene: CombatScene, now: number, w: number): void {
    if (!this.bannerText || !this.bannerBg) return;
    if (!scene.banner) {
      this.bannerText.setVisible(false);
      this.bannerBg.clear().setVisible(false);
      return;
    }
    const age = now - scene.bannerStart;
    const remaining = scene.bannerUntil - now;
    let alpha = 0.88;
    if (age < 120) alpha *= Math.max(0, age / 120);
    else if (remaining < 220) alpha *= Math.max(0, remaining / 220);
    if (alpha <= 0.01) {
      this.bannerText.setVisible(false);
      this.bannerBg.clear().setVisible(false);
      return;
    }
    this.bannerText.setText(scene.banner);
    const boxW = Math.max(220, this.bannerText.width + 56);
    const boxH = 42;
    const x = (w - boxW) / 2;
    const y = 10;
    this.drawFf6Window(this.bannerBg, x, y, boxW, boxH);
    this.bannerBg.setAlpha(alpha).setVisible(true);
    this.bannerText.setPosition(w / 2, y + boxH / 2 + 1);
    this.bannerText.setAlpha(alpha);
    this.bannerText.setVisible(true);
  }

  private syncNameplate(scene: CombatScene, now: number, w: number): void {
    if (!this.nameplateText || !this.nameplateBg || !this.nameplateTag || !this.nameplateSub)
      return;
    if (!scene.introNameplate) {
      this.nameplateText.setVisible(false);
      this.nameplateBg.clear().setVisible(false);
      this.nameplateTag.setVisible(false);
      this.nameplateSub.setVisible(false);
      return;
    }
    const age = now - scene.introNameplateStart;
    const remaining = scene.introNameplateUntil - now;
    let alpha = 0.95;
    if (age < 180) alpha *= Math.max(0, age / 180);
    else if (remaining < 320) alpha *= Math.max(0, remaining / 320);
    if (alpha <= 0.01) {
      this.nameplateText.setVisible(false);
      this.nameplateBg.clear().setVisible(false);
      this.nameplateTag.setVisible(false);
      this.nameplateSub.setVisible(false);
      return;
    }
    const style =
      (scene.introBossId && BOSS_PRESENTATION[scene.introBossId]) || {
        tag: "BOSS",
        accent: "#e07070",
        glow: "rgba(180, 60, 60, 0.35)",
        subtitle: "",
      };
    this.nameplateText.setText(scene.introNameplate);
    this.nameplateTag.setText(style.tag);
    this.nameplateSub.setText(style.subtitle);
    const boxW = Math.max(
      300,
      Math.max(this.nameplateText.width, this.nameplateTag.width, this.nameplateSub.width) + 80
    );
    const boxH = style.subtitle ? 78 : 64;
    const accent = Phaser.Display.Color.HexStringToColor(style.accent).color;
    const x = (w - boxW) / 2;
    const y = 12;
    this.drawFf6Window(this.nameplateBg, x, y, boxW, boxH, accent);
    this.nameplateBg.setAlpha(alpha).setVisible(true);
    this.nameplateTag.setColor(style.accent);
    this.nameplateTag.setPosition(w / 2, y + 16);
    this.nameplateTag.setAlpha(alpha);
    this.nameplateTag.setVisible(true);
    this.nameplateText.setPosition(w / 2, y + (style.subtitle ? 40 : 42));
    this.nameplateText.setAlpha(alpha);
    this.nameplateText.setVisible(true);
    if (style.subtitle) {
      this.nameplateSub.setColor(style.accent);
      this.nameplateSub.setPosition(w / 2, y + 62);
      this.nameplateSub.setAlpha(alpha * 0.85);
      this.nameplateSub.setVisible(true);
    } else {
      this.nameplateSub.setVisible(false);
    }
  }

  private placeMarker(
    mark: Phaser.GameObjects.Triangle,
    entry: ActorSpriteEntry,
    fill: number,
    bounce: number
  ): void {
    // Sprite.y is centerY; drawY = center − halfHeight. Match canvas visualHeadY.
    const drawH = entry.sprite.displayHeight;
    const drawY = entry.sprite.y - drawH / 2;
    const artTop = artTopFromTopFor({ hasStrip: !entry.isFallback });
    const headY = visualHeadY(drawY, drawH, artTop);
    mark
      .setPosition(entry.sprite.x, headY - MARKER_TIP_GAP_PX + bounce)
      .setVisible(true)
      .setFillStyle(fill);
  }

  private syncMarkers(scene: CombatScene, now: number): void {
    const bounce = Math.sin(now / 120) * 3;
    if (this.activeMark) {
      if (scene.activeActorId) {
        const entry =
          this.actors.get(this.actorPoolKey("party", scene.activeActorId)) ??
          this.actors.get(this.actorPoolKey("enemy", scene.activeActorId)) ??
          this.actors.get(this.actorPoolKey("ally", scene.activeActorId));
        if (entry) this.placeMarker(this.activeMark, entry, 0xffd700, bounce);
        else this.activeMark.setVisible(false);
      } else {
        this.activeMark.setVisible(false);
      }
    }
    if (this.cursorMark) {
      if (scene.cursor) {
        const entry = this.actors.get(
          this.actorPoolKey(scene.cursor.kind, scene.cursor.id)
        );
        if (entry) {
          this.placeMarker(
            this.cursorMark,
            entry,
            scene.cursor.kill ? 0xe05050 : 0xffd700,
            bounce
          );
        } else {
          this.cursorMark.setVisible(false);
        }
      } else {
        this.cursorMark.setVisible(false);
      }
    }
  }

  /** Persistent Living Shield marker; the state carries the token, not the painter. */
  private syncGuardMarkers(scene: CombatScene, now: number): void {
    const guards = scene.state.enemyGuards ?? {};
    for (const [targetId, mark] of this.guardMarks) {
      if (!guards[targetId]) {
        mark.shield.destroy();
        mark.label.destroy();
        this.guardMarks.delete(targetId);
      }
    }

    for (const targetId of Object.keys(guards)) {
      const entry = this.actors.get(this.actorPoolKey("enemy", targetId));
      if (!entry) continue;
      let mark = this.guardMarks.get(targetId);
      if (!mark) {
        mark = {
          shield: this.addTo(
            this.actorOverlayLayer,
            this.add.graphics().setDepth(805)
          ),
          label: this.addTo(
            this.actorOverlayLayer,
            this.add
              .text(0, 0, "GUARDED", {
                fontFamily: "FF36, monospace",
                fontSize: "10px",
                color: "#d9f8ff",
                stroke: "#101820",
                strokeThickness: 2,
              })
              .setOrigin(0.5)
              .setDepth(806)
          ),
        };
        this.guardMarks.set(targetId, mark);
      }
      const drawH = entry.sprite.displayHeight;
      const drawY = entry.sprite.y - drawH / 2;
      const artTop = artTopFromTopFor({ hasStrip: !entry.isFallback });
      const headY = visualHeadY(drawY, drawH, artTop);
      const pulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(now / 230));
      mark.shield.clear();
      mark.shield.lineStyle(2.5, 0x73e7ff, pulse);
      mark.shield.fillStyle(0x37b1dc, 0.18 * pulse);
      mark.shield.beginPath();
      mark.shield.arc(entry.sprite.x, headY + 13, 17, Math.PI * 0.15, Math.PI * 0.85);
      mark.shield.lineTo(entry.sprite.x + 12, headY + 26);
      mark.shield.lineTo(entry.sprite.x, headY + 32);
      mark.shield.lineTo(entry.sprite.x - 12, headY + 26);
      mark.shield.closePath();
      mark.shield.fillPath();
      mark.shield.strokePath();
      mark.shield.setVisible(true);
      mark.label
        .setPosition(entry.sprite.x, headY + 45)
        .setAlpha(pulse)
        .setVisible(true);
    }
  }

  private syncCues(scene: CombatScene): void {
    this.fastCue?.setVisible(scene.showFastCue);
    this.autoCue?.setVisible(scene.showAutoCue);
  }

  private syncHpPips(
    scene: CombatScene,
    now: number,
    w: number,
    h: number
  ): void {
    const g = this.pipGfx;
    if (!g) return;
    g.clear();
    const drawFor = (e: EnemyInstance, slot: number) => {
      const lit = enemyHpPipsLit(e);
      if (lit === null) return;
      const baseSize = e.isBoss ? BOSS_SIZE : ENEMY_SIZE;
      const pos = enemyPos(slot, e.row, w, h, scene.backdropId, baseSize);
      const anim = getAnim(scene, "enemy", e.instanceId, now);
      const off = animOffset(anim, now);
      const footX = pos.x + off.x;
      const footY = pos.footY + off.y;
      const spriteWidth = baseSize * pos.scale;
      const pipW = 6;
      const gap = 2;
      const totalW = HP_PIP_COUNT * pipW + (HP_PIP_COUNT - 1) * gap;
      const startX = footX - totalW / 2;
      const y = footY + Math.max(4, spriteWidth * 0.08);
      const ratio = e.currentHp / e.hp;
      const color =
        ratio <= 0.25 ? 0xf07070 : ratio <= 0.5 ? 0xe8a060 : 0xffe790;
      for (let i = 0; i < HP_PIP_COUNT; i++) {
        g.fillStyle(i < lit ? color : 0x101c58, i < lit ? 1 : 0.55);
        g.fillRect(startX + i * (pipW + gap), y, pipW, 3);
      }
    };
    for (const e of scene.state.enemies.back) {
      drawFor(e, enemySlotIndex(scene, "back", e.instanceId));
    }
    for (const e of scene.state.enemies.front) {
      drawFor(e, enemySlotIndex(scene, "front", e.instanceId));
    }
  }
}

function toScreenFromResolve(r: ResolvedSlot): {
  x: number;
  y: number;
  scale: number;
  footY: number;
  drawY: number;
} {
  return {
    x: r.x,
    y: r.centerY,
    scale: r.scale,
    footY: r.footY,
    drawY: r.drawY,
  };
}

let cachedRenderType: number | null = null;

function pickRenderType(): number {
  // Phaser 4 throws if config.canvas is set and type is AUTO ("custom
  // environment"). Keep AUTO's intent: WebGL when available, else Canvas.
  //
  // Cached, and the probe context is explicitly released. A fresh probe canvas
  // per fight strands a live WebGL context on a detached element every time —
  // browsers cap live contexts (~16 in Chrome) and force-lose the oldest long
  // before GC reclaims them, which can kill the live combat context mid-fight.
  if (cachedRenderType !== null) return cachedRenderType;

  let type = Phaser.CANVAS;
  try {
    const probe = document.createElement("canvas");
    const gl = (probe.getContext("webgl2") ??
      probe.getContext("webgl")) as WebGLRenderingContext | null;
    if (gl) {
      type = Phaser.WEBGL;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    /* fall through to Canvas */
  }
  cachedRenderType = type;
  return type;
}

function createPhaserGame(
  phaserScene: OnyxCombatPhaserScene,
  preferredType: number
): Phaser.Game {
  const base = {
    canvas: combatPhaserCanvas,
    width: COMBAT_DESIGN_W,
    height: COMBAT_DESIGN_H,
    backgroundColor: "#0d0b08",
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    pixelArt: true,
    render: {
      antialias: false,
      pixelArt: true,
      preserveDrawingBuffer: true,
    },
    input: { keyboard: false, mouse: false, touch: false },
    audio: { noAudio: true },
    scene: phaserScene,
  } as const;

  try {
    return new Phaser.Game({ ...base, type: preferredType });
  } catch (err) {
    if (preferredType === Phaser.WEBGL) {
      console.warn("[combat] WebGL Phaser boot failed; retrying Canvas", err);
      return new Phaser.Game({ ...base, type: Phaser.CANVAS });
    }
    throw err;
  }
}

export async function createPhaserCombatStage(
  opts: CreateCombatStageOpts
): Promise<CombatStage> {
  const sceneModel = createScene(opts.state);
  sceneModel.backdrop = opts.backdrop ?? null;
  sceneModel.backdropId =
    opts.backdropId ?? (opts.backdrop ? "arena" : "combat-bg");

  setPhaserStageActive(true);
  combatPhaserCanvas.style.width = "100%";
  combatPhaserCanvas.style.height = "100%";
  combatPhaserCanvas.classList.add("combat-stage-canvas");

  const phaserScene = new OnyxCombatPhaserScene();
  const game = createPhaserGame(phaserScene, pickRenderType());

  await new Promise<void>((resolve) => {
    game.events.once("ready", () => resolve());
  });

  // Extra beat for scene.create + first load.
  await new Promise<void>((r) => setTimeout(r, 0));

  let destroyed = false;

  const stage: CombatStage = {
    scene: sceneModel,
    setState(s: CombatState) {
      setCombatSceneState(sceneModel, s);
    },
    absorbDeaths(s: CombatState) {
      absorbDeaths(sceneModel, s);
    },
    setActiveActor(id) {
      sceneModel.activeActorId = id;
    },
    setCursor(c) {
      sceneModel.cursor = c;
    },
    setPlaybackRate(rate) {
      sceneModel.playbackRate = rate;
    },
    setCues(o) {
      sceneModel.showFastCue = o.fast;
      sceneModel.showAutoCue = o.auto;
    },
    clearBanner() {
      sceneModel.banner = null;
    },
    setBossIntroNameplate(name, durationMs, bossId) {
      setBossIntroNameplate(
        sceneModel,
        name,
        performance.now(),
        durationMs,
        bossId
      );
    },
    playTurn(
      events: CombatEvent[],
      spellNameFor,
      techniqueNameFor,
      now
    ) {
      return playTurn(
        sceneModel,
        events,
        spellNameFor,
        now,
        COMBAT_DESIGN_W,
        COMBAT_DESIGN_H,
        techniqueNameFor
      );
    },
    isPlaybackDone(now) {
      return isPlaybackDone(sceneModel, now);
    },
    skipPlaybackToEnd(now) {
      skipPlaybackToEnd(sceneModel, now);
    },
    update(now) {
      updateScene(sceneModel, now);
    },
    paint(now) {
      if (destroyed) return;
      phaserScene.acceptFrame(sceneModel, now);
    },
    tick(now) {
      this.update(now);
      this.paint(now);
    },
    snapshotCanvas() {
      return combatPhaserCanvas;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        phaserScene.clearSpotlightFilters();
        phaserScene.clearCastBloom();
        phaserScene.clearAllShines();
        phaserScene.clearAllCrumble();
      } catch {
        /* ignore */
      }
      try {
        // Game.destroy() only sets `pendingDestroy`. The actual teardown
        // (runDestroy -> scene.destroy, renderer.destroy, loop.destroy) is
        // gated at the top of Game.step(), which the game loop drives. We are
        // called from leaveCombat, which is tearing frame loops down around
        // us, so a further step may never arrive — drive it synchronously.
        // Without this, renderer.destroy() never runs and every fight strands
        // its GPU textures (measured: ~150-290 per fight, never freed).
        //
        // removeCanvas MUST stay false: #combat-phaser-canvas is created by
        // shell.ts, captured in a module-level const, and reused by the next
        // fight. Letting Phaser detach it renders fight #2 into an orphan.
        game.destroy(false);
        const g = game as unknown as {
          pendingDestroy?: boolean;
          runDestroy?: () => void;
        };
        // If runDestroy is ever unavailable, the loop is deliberately left
        // running so the pendingDestroy gate still tears down next frame.
        if (g.pendingDestroy && typeof g.runDestroy === "function") {
          g.runDestroy();
        }
      } catch {
        /* already torn down */
      }
      setPhaserStageActive(false);
      const w = window as unknown as {
        __onyxPhaserActors?: unknown;
        __onyxPhaserFilters?: unknown;
        __onyxPhaserDissolves?: unknown;
        __onyxPhaserPools?: unknown;
        __onyxPhaserWorldTransform?: unknown;
        __onyxPhaserWorldLayer?: unknown;
      };
      if (w.__onyxPhaserActors) delete w.__onyxPhaserActors;
      if (w.__onyxPhaserFilters) delete w.__onyxPhaserFilters;
      if (w.__onyxPhaserDissolves) delete w.__onyxPhaserDissolves;
      if (w.__onyxPhaserPools) delete w.__onyxPhaserPools;
      if (w.__onyxPhaserWorldTransform) delete w.__onyxPhaserWorldTransform;
      if (w.__onyxPhaserWorldLayer) delete w.__onyxPhaserWorldLayer;
    },
  };

  const dbg = window as unknown as {
    __onyxPhaserActors?: () => unknown;
    __onyxPhaserFilters?: () => unknown;
    __onyxPhaserDissolves?: () => unknown;
    __onyxPhaserPools?: () => unknown;
    __onyxPhaserWorldTransform?: (enabled: boolean) => void;
    __onyxPhaserWorldLayer?: () => unknown;
  };
  dbg.__onyxPhaserActors = () => phaserScene.debugActorLayout();
  dbg.__onyxPhaserFilters = () => phaserScene.debugFilterCounts();
  dbg.__onyxPhaserDissolves = () => phaserScene.debugDissolveCounts();
  dbg.__onyxPhaserPools = () => phaserScene.debugPoolCounts();
  dbg.__onyxPhaserWorldTransform = (enabled: boolean) =>
    phaserScene.setWorldDebugTransform(enabled);
  dbg.__onyxPhaserWorldLayer = () => phaserScene.debugWorldLayer();

  return stage;
}
