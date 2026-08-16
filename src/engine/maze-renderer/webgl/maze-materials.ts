import {
  CanvasTexture,
  AdditiveBlending,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  NearestFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Texture,
} from "three";
import {
  getCeilingFeatureSource,
  getTilesetForTheme,
  type LoadedTileset,
} from "../../renderer";
import {
  getDoorFeatureImage,
  getDoorFeatureTextImage,
} from "../../door-feature-cache";
import { LIGHTING } from "../../render-math";
import type { WallVariantSuffix } from "../../wall-variants";

type TextureSource = HTMLImageElement | HTMLCanvasElement;

const FALLBACK_COLORS: Record<string, number> = {
  wall: 0x3d3228,
  floorA: 0x2a221a,
  floorB: 0x241d17,
  ceiling: 0x1f1b16,
  door: 0x2d231c,
  stairs: 0x2d231c,
};

function sourceForSurface(
  tileset: LoadedTileset,
  surface: string,
  variant: WallVariantSuffix | undefined
): TextureSource | null {
  if (surface === "wall") return tileset.wallVariants.get(variant ?? "") ?? tileset.repeatedWall;
  if (surface === "floorA") return tileset.set.floorARepeated;
  if (surface === "floorB") return tileset.set.floorBRepeated;
  if (surface === "ceiling") return tileset.set.ceilingRepeated;
  if (surface === "stairs") return tileset.stairs ?? tileset.door ?? tileset.repeatedWall;
  if (surface === "door") return tileset.door ?? tileset.repeatedWall;
  return null;
}

/**
 * Inject the shared carried-light warm lift into a maze surface material.
 *
 * Mirrors the Canvas raycaster's `nearWarmChannelMuls`: surfaces within
 * `LIGHTING.nearWarmRadius` of the camera pick up the warm tint, easing
 * (smoothstep) to identity at the radius. Applied just before the fog mix so
 * the fog's cool far murk still wins at distance. `vFogDepth` is the fog
 * varying MeshBasicMaterial already computes when `fog: true` — no new
 * uniforms or varyings, so every maze material shares one program (the cache
 * key below keeps Three from treating each closure as a distinct shader).
 */
function applyNearWarmLift(material: MeshBasicMaterial): void {
  const { warmTint, nearWarmRadius, webglDarknessAlbedo } = LIGHTING;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOnyxDarkness = { value: 0 };
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_pars_fragment>",
      "#include <fog_pars_fragment>\nuniform float uOnyxDarkness;"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      [
        "#ifdef USE_FOG",
        `\tfloat onyxWarmT = (1.0 - uOnyxDarkness) * (1.0 - smoothstep(0.0, ${nearWarmRadius.toFixed(3)}, vFogDepth));`,
        `\tgl_FragColor.rgb *= mix(vec3(1.0), vec3(${warmTint.r.toFixed(3)}, ${warmTint.g.toFixed(3)}, ${warmTint.b.toFixed(3)}), onyxWarmT);`,
        `\tgl_FragColor.rgb *= mix(1.0, ${webglDarknessAlbedo.toFixed(3)}, uOnyxDarkness);`,
        "#endif",
        "#include <fog_fragment>",
      ].join("\n")
    );
    material.userData.onyxShader = shader;
  };
  material.customProgramCacheKey = () => "onyx-near-warm-v3";
}

function parseMaterialKey(materialKey: string): {
  theme: string;
  surface: string;
  featureId?: string;
  variant?: WallVariantSuffix;
} {
  if (materialKey.startsWith("doorFeature:")) {
    const featureId = materialKey.slice("doorFeature:".length).split("@")[0];
    const theme = materialKey.split("@").at(-1) ?? "f1";
    return { theme, surface: "door", featureId };
  }
  if (materialKey.startsWith("ceilingFeature:")) {
    const featureId = materialKey.slice("ceilingFeature:".length).split("@")[0];
    const theme = materialKey.split("@").at(-1) ?? "f1";
    return { theme, surface: "ceiling", featureId };
  }
  const separator = materialKey.lastIndexOf(":");
  if (separator < 0) return { theme: "f1", surface: "wall" };
  const surfaceToken = materialKey.slice(separator + 1);
  const variantSeparator = surfaceToken.indexOf("@");
  const surface = variantSeparator < 0 ? surfaceToken : surfaceToken.slice(0, variantSeparator);
  const variant = variantSeparator < 0
    ? undefined
    : surfaceToken.slice(variantSeparator + 1) as WallVariantSuffix;
  return {
    theme: materialKey.slice(0, separator),
    surface,
    variant,
  };
}

/** Shared prepared-image → GPU texture/material cache. */
export class MazeMaterialLibrary {
  private readonly textures = new Map<TextureSource, Texture>();
  private readonly materials = new Map<string, MeshBasicMaterial>();
  private readonly composites = new Map<string, HTMLCanvasElement>();

  private composite(
    key: string,
    base: TextureSource,
    overlay: TextureSource | null
  ): TextureSource {
    if (!overlay) return base;
    const cached = this.composites.get(key);
    if (cached) return cached;
    const width = (base as HTMLImageElement).naturalWidth || base.width;
    const height = (base as HTMLImageElement).naturalHeight || base.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return base;
    context.imageSmoothingEnabled = false;
    context.drawImage(base, 0, 0, width, height);
    context.drawImage(overlay, 0, 0, width, height);
    this.composites.set(key, canvas);
    return canvas;
  }

  private textureFor(source: TextureSource, repeating: boolean): Texture {
    let texture = this.textures.get(source);
    if (texture) return texture;
    texture = new CanvasTexture(source);
    texture.wrapS = repeating ? RepeatWrapping : ClampToEdgeWrapping;
    texture.wrapT = repeating ? RepeatWrapping : ClampToEdgeWrapping;
    texture.magFilter = NearestFilter;
    texture.minFilter = repeating ? NearestMipmapNearestFilter : NearestFilter;
    texture.generateMipmaps = repeating;
    texture.anisotropy = 1;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    this.textures.set(source, texture);
    return texture;
  }

  get(materialKey: string): Material {
    const cached = this.materials.get(materialKey);
    if (cached) return cached;

    const { theme, surface, featureId, variant } = parseMaterialKey(materialKey);
    const tileset = getTilesetForTheme(theme);
    let source = tileset ? sourceForSurface(tileset, surface, variant) : null;
    let alphaTest = 0;
    if (featureId && materialKey.startsWith("doorFeature:")) {
      const feature = getDoorFeatureImage(featureId);
      if (feature) {
        source = this.composite(
          `door:${featureId}`,
          feature,
          getDoorFeatureTextImage(featureId)
        );
        alphaTest = 0.5;
      }
    } else if (featureId && materialKey.startsWith("ceilingFeature:")) {
      source = getCeilingFeatureSource(featureId) ?? source;
    }
    let map: Texture | null = null;
    if (source) {
      map = this.textureFor(source, true);
    }

    const material = new MeshBasicMaterial({
      map,
      color: map ? 0xeeeeee : new Color(FALLBACK_COLORS[surface] ?? FALLBACK_COLORS.wall),
      fog: true,
      toneMapped: false,
      alphaTest,
      // Per-vertex light-pool brightness from the compiled geometry (see
      // CompiledMazeBatch.colors). Only compiled maze surfaces use `get()`,
      // and all of them carry the attribute.
      vertexColors: true,
    });
    applyNearWarmLift(material);
    this.materials.set(materialKey, material);
    return material;
  }

  getImage(
    key: string,
    source: TextureSource,
    overlay: TextureSource | null = null,
    alphaMode: "opaque" | "cutout" = "cutout"
  ): Material {
    const materialKey = `image:${key}:${alphaMode}`;
    const cached = this.materials.get(materialKey);
    if (cached) return cached;
    const composite = this.composite(materialKey, source, overlay);
    const material = new MeshBasicMaterial({
      map: this.textureFor(composite, false),
      color: 0xeeeeee,
      alphaTest: alphaMode === "cutout" ? 0.5 : 0,
      depthTest: true,
      depthWrite: true,
      fog: true,
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.set(materialKey, material);
    return material;
  }

  /** Notify Three that a cached canvas-backed image changed in place. */
  markImageDirty(source: HTMLCanvasElement): void {
    const texture = this.textures.get(source);
    if (texture) texture.needsUpdate = true;
  }

  /** Suppress the carried-light warm lift and scale albedo inside darkness zones. */
  setInDarkness(inDarkness: boolean): void {
    const value = inDarkness ? 1 : 0;
    for (const material of this.materials.values()) {
      const shader = material.userData.onyxShader as { uniforms?: { uOnyxDarkness?: { value: number } } } | undefined;
      if (shader?.uniforms?.uOnyxDarkness) shader.uniforms.uOnyxDarkness.value = value;
    }
  }

  getGlow(key: string, color: string, intensity: number): MeshBasicMaterial {
    const materialKey = `glow:${key}`;
    const cached = this.materials.get(materialKey);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, `rgba(${color}, ${intensity})`);
    gradient.addColorStop(0.45, `rgba(${color}, ${intensity * 0.34})`);
    gradient.addColorStop(1, `rgba(${color}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.composites.set(materialKey, canvas);
    const material = new MeshBasicMaterial({
      map: this.textureFor(canvas, false),
      color: 0xffffff,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.set(materialKey, material);
    return material;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.materials.clear();
    this.textures.clear();
    this.composites.clear();
  }
}
