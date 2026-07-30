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
import combatBgUrl from "../assets/combat-bg.png";
import {
  createScene,
  updateScene,
  playTurn,
  isPlaybackDone,
  absorbDeaths,
  skipPlaybackToEnd,
  setBossIntroNameplate,
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
import { getEnemySpriteStrip, loadEnemySpriteBundle } from "./enemy-sprite-cache";
import { getPartySpriteStrip, loadPartySpriteBundle, PARTY_SPRITE_DIRS } from "./party-sprite-cache";
import { getEffectSprite } from "./effect-sprite-cache";
import {
  artFootFromTopFor,
  artTopFromTopFor,
  visualHeadY,
  MARKER_TIP_GAP_PX,
  COMBAT_DESIGN_W,
  COMBAT_DESIGN_H,
  resolveSlot,
  enemySlot,
  partySlot,
  geometryForBackdrop,
  type ResolvedSlot,
} from "./combat-scene-math";
import { combatCanvas, combatPhaserCanvas } from "./shell";
import type { CombatStage, CreateCombatStageOpts } from "./combat-stage";
import {
  applySpotlight,
  applyStatusTint,
  deathDissolveRecipe,
  DEATH_ANIM_MS,
  castBloomPulse,
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

/** Kill-switch for camera Glow/ColorMatrix (tint still applies). */
const PHASER_FX_SPOTLIGHT = true;
/** Kill-switch for hurt impact squash. */
const PHASER_FX_HIT_SQUASH = true;
/** Kill-switch for the per-sprite death mosaic/desaturate (harvest H1). */
const PHASER_FX_DEATH_DISSOLVE = true;
/** Kill-switch for the cast bloom pulse (harvest H2). */
const PHASER_FX_CAST_BLOOM = true;

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
   * Per-sprite death-dissolve controllers, allocated lazily on first death
   * frame. Kept on the entry rather than looked up from the sprite because
   * `ensureStripSprite` swaps the texture in place on state change, so the
   * Sprite (and therefore its filter list) survives idle→death.
   */
  dissolve?: {
    pixelate: Phaser.Filters.Pixelate;
    matrix: Phaser.Filters.ColorMatrix;
  } | null;
}

class OnyxCombatPhaserScene extends Phaser.Scene {
  latest: { scene: CombatScene; now: number } | null = null;
  private actors = new Map<string, ActorSpriteEntry>();
  private popups = new Map<string, Phaser.GameObjects.Text>();
  private barks = new Map<string, Phaser.GameObjects.Text>();
  private particles: Phaser.GameObjects.Arc[] = [];
  private effectSprites: Phaser.GameObjects.Sprite[] = [];
  private glowGraphics: Phaser.GameObjects.Graphics | null = null;
  private bgImage: Phaser.GameObjects.Image | null = null;
  private bannerText: Phaser.GameObjects.Text | null = null;
  private bannerBg: Phaser.GameObjects.Graphics | null = null;
  private nameplateText: Phaser.GameObjects.Text | null = null;
  private nameplateTag: Phaser.GameObjects.Text | null = null;
  private nameplateSub: Phaser.GameObjects.Text | null = null;
  private nameplateBg: Phaser.GameObjects.Graphics | null = null;
  private cursorMark: Phaser.GameObjects.Triangle | null = null;
  private activeMark: Phaser.GameObjects.Triangle | null = null;
  private fastCue: Phaser.GameObjects.Text | null = null;
  private autoCue: Phaser.GameObjects.Text | null = null;
  private pipGfx: Phaser.GameObjects.Graphics | null = null;
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

  constructor() {
    super(SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0d0b08");
    this.glowGraphics = this.add.graphics().setDepth(-50);
    this.pipGfx = this.add.graphics().setDepth(500);
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
      spotlightExternal: this.spotlight.glow ? 1 : 0,
    };
  }

  /**
   * Debug: how many actors currently hold death-dissolve controllers.
   * Used by the capture script to assert they are spliced out once the
   * corpses settle, since there is no `disableFilters()` to lean on.
   */
  debugDissolveCounts(): { active: number; keys: string[] } {
    const keys: string[] = [];
    for (const entry of this.actors.values()) {
      if (entry.dissolve) keys.push(entry.key);
    }
    return { active: keys.length, keys };
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
      void loadEnemySpriteBundle(e.id);
    }
    for (const c of scene.state.party) {
      void loadPartySpriteBundle(PARTY_SPRITE_DIRS[c.class]);
    }
    // Add spritesheets from already-decoded cache images when available.
    for (const e of [...scene.state.enemies.front, ...scene.state.enemies.back, ...scene.enemyCorpses]) {
      for (const st of ["idle", "attacking", "hit", "defeated"] as const) {
        const info = getEnemySpriteStrip(e.id, st);
        if (!info?.img || info.img.naturalWidth <= 0) continue;
        this.ensureSpriteSheet(
          `enemy:${e.id}:${st}`,
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
      this.cameras.main.setScroll((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    } else {
      this.cameras.main.setScroll(0, 0);
    }

    this.syncBackground(scene);
    this.syncGlows(scene, now);
    this.syncActors(scene, now, w, h);
    this.syncEffects(scene, now);
    this.syncParticles(scene);
    this.syncPopups(scene, now);
    this.syncBarks(scene, now, w, h);
    this.syncBanner(scene, now, w);
    this.syncNameplate(scene, now, w);
    this.syncMarkers(scene, now);
    this.syncCues(scene);
    this.syncHpPips(scene, now, w, h);
    this.syncSpotlight(scene);
    this.syncCastBloom(scene, now);
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
      const blend = (
        this.bloom.parallelFilters as unknown as { blendAmount?: number }
      );
      if ("blendAmount" in blend) blend.blendAmount = pulse.blendAmount;
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
    now: number
  ): void {
    if (!(entry.sprite instanceof Phaser.GameObjects.Sprite)) return;
    if (!PHASER_FX_DEATH_DISSOLVE || entry.isFallback || anim.state !== "death") {
      this.clearDeathDissolve(entry);
      return;
    }
    const recipe = deathDissolveRecipe((now - anim.stateStart) / DEATH_ANIM_MS);
    try {
      if (!entry.dissolve) {
        const sprite = entry.sprite.enableFilters();
        const internal = sprite.filters?.internal;
        if (!internal) return;
        entry.dissolve = {
          pixelate: internal.addPixelate(recipe.pixelate),
          matrix: internal.addColorMatrix(),
        };
      }
      entry.dissolve.pixelate.amount = recipe.pixelate;
      // Rebuild rather than accumulate: ColorMatrix ops multiply by default.
      entry.dissolve.matrix.colorMatrix.reset();
      entry.dissolve.matrix.colorMatrix.grayscale(recipe.grayscale);
    } catch {
      // CANVAS renderer / Filters unavailable — degrade to the opacity fade.
      this.clearDeathDissolve(entry);
    }
  }

  /** Splice dissolve controllers out (revive, or actor leaving death). */
  private clearDeathDissolve(entry: ActorSpriteEntry): void {
    if (!entry.dissolve) return;
    try {
      const internal = (
        entry.sprite as Phaser.GameObjects.Sprite
      ).filters?.internal;
      if (internal) {
        internal.remove(entry.dissolve.pixelate);
        internal.remove(entry.dissolve.matrix);
      }
    } catch {
      /* sprite already torn down */
    }
    entry.dissolve = null;
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

  clearSpotlightFilters(): void {
    clearSpotlight(this.spotlight, this.spotlightFilterLists());
  }

  private syncBackground(scene: CombatScene): void {
    const key = scene.backdrop && this.textures.exists("combat-backdrop")
      ? "combat-backdrop"
      : this.textures.exists("combat-bg")
        ? "combat-bg"
        : null;
    if (!key) return;
    if (!this.bgImage) {
      this.bgImage = this.add.image(COMBAT_DESIGN_W / 2, COMBAT_DESIGN_H / 2, key).setDepth(-1000);
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

  private syncActors(scene: CombatScene, now: number, w: number, h: number): void {
    const seen = new Set<string>();
    const s = scene.state;

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
      this.upsertParty(key, c, i, scene, now, w);
    }

    for (const [key, entry] of this.actors) {
      if (!seen.has(key)) {
        entry.sprite.destroy();
        entry.shadow.destroy();
        this.actors.delete(key);
      }
    }
  }

  private ensureFallback(
    key: string,
    kind: ActorKind,
    color: number
  ): ActorSpriteEntry {
    let entry = this.actors.get(key);
    if (entry && entry.isFallback) return entry;
    if (entry) {
      entry.sprite.destroy();
      entry.shadow.destroy();
    }
    const shadow = this.add.ellipse(0, 0, 40, 12, 0x000000, 0.4).setDepth(0);
    const sprite = this.add.ellipse(0, 0, 80, 100, color).setDepth(1);
    entry = { key, kind, sprite, shadow, isFallback: true };
    this.actors.set(key, entry);
    return entry;
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
    const shadow = this.add.ellipse(0, 0, 40, 12, 0x000000, 0.4).setDepth(0);
    // Origin (0.5, 0.5): position at ResolvedSlot.centerY — same contract as
    // canvas drawStripFrame(ctx, …, x, centerY, size). Never position at drawY
    // (frame top); that floats the whole formation ~½ sprite-height upward.
    const sprite = this.add.sprite(0, 0, texKey).setOrigin(0.5, 0.5).setDepth(1);
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
    const stripInfo = getEnemySpriteStrip(enemy.id, stripState);
    const hasStrip = !!(stripInfo?.img && stripInfo.img.naturalWidth > 0);
    const artFoot = artFootFromTopFor({
      hasStrip,
      stripArtFootFromTop: stripInfo?.strip.artFootFromTop,
    });
    const pos = toScreenFromResolve(
      resolveSlot(enemySlot(idxInRow, enemy.row), geometryForBackdrop(scene.backdropId), {
        spriteHeight: baseSize,
        canvasWidth: w,
        artFootFromTop: artFoot,
      })
    );
    const off = animOffset(anim, now);
    const x = pos.x + off.x;
    const y = pos.y + off.y;
    const footY = pos.footY + off.y;
    const drawSize = baseSize * pos.scale;

    const texKey = `enemy:${enemy.id}:${stripState}`;
    let entry =
      hasStrip && stripInfo
        ? this.ensureStripSprite(key, "enemy", texKey)
        : null;
    if (!entry) {
      entry = this.ensureFallback(key, "enemy", enemy.isBoss ? 0xaa4444 : 0x8a7a5a);
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
            : frameIndexFor(stripInfo.strip, stateAge);
      }
      entry.sprite.setFrame(frame);
      // Center at ResolvedSlot.centerY (pos.y) — canvas drawStripFrame contract.
      entry.sprite.setFlipX(false);
      applyStatusTint(
        entry.sprite,
        statusTintFor({
          poison: enemy.status.includes("poison"),
          burn: (scene.state.enemyDots[enemy.instanceId]?.length ?? 0) > 0,
        })
      );
      this.applyHitSquash(entry, anim, now, drawSize, x, y);
      this.applyDeathDissolve(entry, anim, now);
    } else {
      entry.sprite.setPosition(x, y);
      if (entry.sprite instanceof Phaser.GameObjects.Ellipse) {
        entry.sprite.setDisplaySize(drawSize * 0.55, drawSize * 0.7);
      }
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
          : frameIndexFor(stripInfo.strip, stateAge);
      entry.sprite.setFrame(frame);
      this.applyHitSquash(entry, anim, now, drawSize, x, y);
      this.applyDeathDissolve(entry, anim, now);
    } else {
      entry.sprite.setPosition(x, y);
      if (entry.sprite instanceof Phaser.GameObjects.Ellipse) {
        entry.sprite.setDisplaySize(drawSize * 0.4, drawSize * 0.4);
      }
    }
  }

  private upsertParty(
    key: string,
    char: Character,
    index: number,
    scene: CombatScene,
    now: number,
    w: number
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
    const pos = toScreenFromResolve(
      resolveSlot(partySlot(index), geometryForBackdrop(scene.backdropId), {
        spriteHeight: PARTY_SIZE,
        canvasWidth: w,
        artFootFromTop: artFoot,
      })
    );
    const off = animOffset(anim, now);
    const x = pos.x + off.x;
    const y = pos.y + off.y;
    const footY = pos.footY + off.y;
    const drawSize = PARTY_SIZE * pos.scale;
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
          : frameIndexFor(stripInfo.strip, stateAge);
      entry.sprite.setFrame(frame);
      entry.sprite.setFlipX(true);
      applyStatusTint(
        entry.sprite,
        statusTintFor({ poison: char.status.includes("poison") })
      );
      this.applyHitSquash(entry, anim, now, drawSize, x, y);
      this.applyDeathDissolve(entry, anim, now);
    } else {
      entry.sprite.setPosition(x, y);
      if (entry.sprite instanceof Phaser.GameObjects.Ellipse) {
        entry.sprite.setDisplaySize(drawSize * 0.4, drawSize * 0.65);
      }
    }
  }

  private syncEffects(scene: CombatScene, now: number): void {
    // Recreate lightly each frame — effect count is capped (~40).
    for (const s of this.effectSprites) s.destroy();
    this.effectSprites = [];
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
            const go = this.add
              .sprite(x, y, texKey, frame)
              .setDepth(600)
              .setRotation(angle);
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
            if (effect.glow) {
              try {
                go.setBlendMode(Phaser.BlendModes.ADD);
              } catch {
                /* CANVAS may ignore */
              }
            }
            this.effectSprites.push(go);
            continue;
          }
        }
      }
      // Procedural fallback burst.
      const go = this.add
        .circle(x, y, 12 + t * 36, 0x4488cc, effect.type === "burst" ? 1 - t : 0.7)
        .setDepth(600) as unknown as Phaser.GameObjects.Sprite;
      this.effectSprites.push(go);
    }
  }

  private syncParticles(scene: CombatScene): void {
    for (const p of this.particles) p.destroy();
    this.particles = [];
    for (const p of scene.particles) {
      const life = p.life / p.maxLife;
      const arc = this.add
        .circle(p.x, p.y, p.size * (1 - life * 0.5), 0xffffff, 1 - life)
        .setDepth(550);
      try {
        const c = Phaser.Display.Color.HexStringToColor(
          p.color.startsWith("#") ? p.color : "#ffffff"
        );
        arc.setFillStyle(c.color, 1 - life);
      } catch {
        /* keep white */
      }
      if (p.glow) arc.setBlendMode(Phaser.BlendModes.ADD);
      this.particles.push(arc);
    }
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
      sceneModel.state = s;
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
      };
      if (w.__onyxPhaserActors) delete w.__onyxPhaserActors;
      if (w.__onyxPhaserFilters) delete w.__onyxPhaserFilters;
      if (w.__onyxPhaserDissolves) delete w.__onyxPhaserDissolves;
    },
  };

  const dbg = window as unknown as {
    __onyxPhaserActors?: () => unknown;
    __onyxPhaserFilters?: () => unknown;
    __onyxPhaserDissolves?: () => unknown;
  };
  dbg.__onyxPhaserActors = () => phaserScene.debugActorLayout();
  dbg.__onyxPhaserFilters = () => phaserScene.debugFilterCounts();
  dbg.__onyxPhaserDissolves = () => phaserScene.debugDissolveCounts();

  return stage;
}
