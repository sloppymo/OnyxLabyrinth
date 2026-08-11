import {
  Group,
  Mesh,
  PlaneGeometry,
  type Camera,
  type Material,
} from "three";
import type { FloorDef } from "../../../data/floors";
import { featurePropSpriteIds } from "../../../data/maze-props";
import { isTreasureLooted } from "../../../game/features";
import { isCorridorMarkerFeature, PROP_MAX_WALL_FRAC } from "../../render-math";
import {
  getMapSpriteAlphaBounds,
  getMapSpriteDef,
  getMapSpriteImage,
  loadMapSprites,
} from "../../map-sprite-cache";
import {
  getWallFeatureDef,
  getWallFeatureImage,
  getWallFeatureTextImage,
  loadWallFeatures,
} from "../../wall-feature-cache";
import {
  getCeilingSpriteDef,
  getCeilingSpriteImage,
  loadCeilingSprites,
} from "../../ceiling-sprite-cache";
import { LEGACY_VERTICAL_UNIT, resolveCellVolume } from "../geometry/cell-volume";
import type { MazeMaterialLibrary } from "./maze-materials";

interface BillboardMeta {
  baseX: number;
  baseZ: number;
  depthBias: number;
  cellX: number;
  cellY: number;
  featureKind?: "npc" | "treasure-unlooted" | "treasure-looted" | "tile";
}

export class MazeVisualCollection {
  readonly wallFeatures = new Group();
  readonly billboards = new Group();
  private readonly geometries: PlaneGeometry[] = [];
  private readonly billboardMeshes: Mesh<PlaneGeometry, Material>[] = [];

  constructor(private readonly materials: MazeMaterialLibrary) {
    this.wallFeatures.name = "maze-wall-features";
    this.billboards.name = "maze-billboards";
  }

  loadFloor(floor: FloorDef): void {
    this.clear();
    this.addWallFeatures(floor);
    this.addDecor(floor);
    this.addFeatureProps(floor);
    this.addCeilingSprites(floor);
  }

  update(floor: FloorDef, camera: Camera): void {
    for (const mesh of this.billboardMeshes) {
      const meta = mesh.userData.mazeBillboard as BillboardMeta;
      mesh.quaternion.copy(camera.quaternion);
      if (meta.depthBias > 0) {
        const dx = camera.position.x - meta.baseX;
        const dz = camera.position.z - meta.baseZ;
        const length = Math.hypot(dx, dz) || 1;
        mesh.position.x = meta.baseX + (dx / length) * meta.depthBias;
        mesh.position.z = meta.baseZ + (dz / length) * meta.depthBias;
      }
      if (meta.featureKind === "npc") {
        mesh.visible = floor.grid[meta.cellY]?.[meta.cellX]?.tile === "npc";
      } else if (meta.featureKind === "treasure-unlooted") {
        mesh.visible = !isTreasureLooted(floor, meta.cellX, meta.cellY);
      } else if (meta.featureKind === "treasure-looted") {
        mesh.visible = isTreasureLooted(floor, meta.cellX, meta.cellY);
      } else if (meta.featureKind === "tile") {
        mesh.visible = isCorridorMarkerFeature(
          floor.grid[meta.cellY]?.[meta.cellX]?.tile
        );
      }
    }
  }

  visibleBillboardCount(): number {
    let count = 0;
    for (const mesh of this.billboardMeshes) if (mesh.visible) count += 1;
    return count;
  }

  private plane(width: number, height: number): PlaneGeometry {
    const geometry = new PlaneGeometry(width, height);
    this.geometries.push(geometry);
    return geometry;
  }

  private addWallFeatures(floor: FloorDef): void {
    for (const placement of floor.wallFeatures ?? []) {
      const def = getWallFeatureDef(placement.spriteId);
      const image = getWallFeatureImage(placement.spriteId);
      if (!def || !image) continue;
      const volume = resolveCellVolume(floor, placement.x, placement.y);
      const panelMin = volume.floorZ * LEGACY_VERTICAL_UNIT;
      const panelMax = Math.min(
        volume.ceilingZ,
        volume.floorZ + 1
      ) * LEGACY_VERTICAL_UNIT;
      const panelHeight = panelMax - panelMin;
      const height = panelHeight * def.heightFrac;
      const width = def.widthFrac;
      let centerY = (panelMin + panelMax) / 2;
      if (def.anchor === "bottom") centerY = panelMin + height / 2;
      if (def.anchor === "top") centerY = panelMax - height / 2;
      const material = this.materials.getImage(
        `wall:${placement.spriteId}`,
        image,
        getWallFeatureTextImage(placement.spriteId)
      );
      const mesh = new Mesh(this.plane(width, height), material);
      const inset = 0.002;
      const x = placement.x;
      const z = placement.y;
      if (placement.dir === "n") mesh.position.set(x + 0.5, centerY, z + inset);
      if (placement.dir === "s") mesh.position.set(x + 0.5, centerY, z + 1 - inset);
      if (placement.dir === "e") {
        mesh.position.set(x + 1 - inset, centerY, z + 0.5);
        mesh.rotation.y = Math.PI / 2;
      }
      if (placement.dir === "w") {
        mesh.position.set(x + inset, centerY, z + 0.5);
        mesh.rotation.y = Math.PI / 2;
      }
      mesh.name = `wall-feature:${placement.spriteId}`;
      this.wallFeatures.add(mesh);
    }
  }

  private addDecor(floor: FloorDef): void {
    for (const placement of floor.mapSprites ?? []) {
      const def = getMapSpriteDef(placement.spriteId);
      if (!def) continue;
      this.addFloorBillboard(
        floor,
        placement.x,
        placement.y,
        placement.spriteId,
        def.baseSize / 56,
        def.foreground ? 0.08 : 0.03,
        undefined
      );
      if (def.light) {
        this.addGlowBillboard(
          floor,
          placement.x,
          placement.y,
          placement.spriteId,
          (def.baseSize / 56) * def.light.radiusScale * 2,
          def.light.color,
          def.light.intensity
        );
      }
    }
  }

  private addFeatureProps(floor: FloorDef): void {
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        const tile = floor.grid[y]?.[x]?.tile;
        if (!isCorridorMarkerFeature(tile)) continue;
        if (tile === "npc") {
          const npc = floor.npcs?.find((candidate) => candidate.x === x && candidate.y === y);
          if (npc?.mapSpriteId) {
            const def = getMapSpriteDef(npc.mapSpriteId);
            if (def) {
              this.addFloorBillboard(
                floor,
                x,
                y,
                npc.mapSpriteId,
                Math.min(def.baseSize / 56, LEGACY_VERTICAL_UNIT * PROP_MAX_WALL_FRAC),
                0,
                "npc"
              );
            }
          }
          continue;
        }

        if (tile === "treasure") {
          this.addFirstFeatureCandidate(floor, x, y, tile, false, "treasure-unlooted");
          this.addFirstFeatureCandidate(floor, x, y, tile, true, "treasure-looted");
        } else {
          this.addFirstFeatureCandidate(floor, x, y, tile, false, "tile");
        }
      }
    }
  }

  private addFirstFeatureCandidate(
    floor: FloorDef,
    x: number,
    y: number,
    tile: NonNullable<FloorDef["grid"][number][number]["tile"]>,
    looted: boolean,
    kind: BillboardMeta["featureKind"]
  ): void {
    for (const spriteId of featurePropSpriteIds(tile, { looted })) {
      const def = getMapSpriteDef(spriteId);
      if (!def || !getMapSpriteImage(spriteId)) continue;
      this.addFloorBillboard(
        floor,
        x,
        y,
        spriteId,
        Math.min(def.baseSize / 56, LEGACY_VERTICAL_UNIT * PROP_MAX_WALL_FRAC),
        0,
        kind
      );
      break;
    }
  }

  private addFloorBillboard(
    floor: FloorDef,
    x: number,
    y: number,
    spriteId: string,
    height: number,
    depthBias: number,
    featureKind: BillboardMeta["featureKind"]
  ): void {
    const image = getMapSpriteImage(spriteId);
    if (!image || height <= 0) return;
    const sourceWidth = (image as HTMLImageElement).naturalWidth || image.width;
    const sourceHeight = (image as HTMLImageElement).naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return;
    const width = height * (sourceWidth / sourceHeight);
    const bounds = getMapSpriteAlphaBounds(spriteId);
    const bottomPadding = bounds?.bottomPadding ?? 0;
    const floorY = resolveCellVolume(floor, x, y).floorZ * LEGACY_VERTICAL_UNIT;
    const paddingDrop = height * (bottomPadding / sourceHeight);
    const geometry = this.plane(width, height);
    const material = this.materials.getImage(`map:${spriteId}`, image);
    const mesh = new Mesh(geometry, material);
    const baseX = x + 0.5;
    const baseZ = y + 0.5;
    mesh.position.set(baseX, floorY + height / 2 - paddingDrop, baseZ);
    mesh.name = `billboard:${spriteId}`;
    mesh.userData.mazeBillboard = {
      baseX,
      baseZ,
      depthBias,
      cellX: x,
      cellY: y,
      featureKind,
    } satisfies BillboardMeta;
    this.billboardMeshes.push(mesh);
    this.billboards.add(mesh);
  }

  private addGlowBillboard(
    floor: FloorDef,
    x: number,
    y: number,
    spriteId: string,
    size: number,
    color: string,
    intensity: number
  ): void {
    const floorY = resolveCellVolume(floor, x, y).floorZ * LEGACY_VERTICAL_UNIT;
    const mesh = new Mesh(
      this.plane(size, size),
      this.materials.getGlow(spriteId, color, intensity)
    );
    const baseX = x + 0.5;
    const baseZ = y + 0.5;
    mesh.position.set(baseX, floorY + size * 0.45, baseZ);
    mesh.name = `glow:${spriteId}`;
    mesh.userData.mazeBillboard = {
      baseX,
      baseZ,
      depthBias: 0.015,
      cellX: x,
      cellY: y,
    } satisfies BillboardMeta;
    this.billboardMeshes.push(mesh);
    this.billboards.add(mesh);
  }

  private addCeilingSprites(floor: FloorDef): void {
    for (const placement of floor.ceilingSprites ?? []) {
      const def = getCeilingSpriteDef(placement.spriteId);
      const image = getCeilingSpriteImage(placement.spriteId);
      if (!def || !image) continue;
      const scale = placement.scale && placement.scale > 0 ? placement.scale : 1;
      const height = (def.baseSize / 56) * scale;
      const sourceWidth = (image as HTMLImageElement).naturalWidth || image.width;
      const sourceHeight = (image as HTMLImageElement).naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) continue;
      const width = height * (sourceWidth / sourceHeight);
      const volume = resolveCellVolume(floor, placement.x, placement.y);
      const ceilingY = volume.ceilingZ * LEGACY_VERTICAL_UNIT;
      const mesh = new Mesh(
        this.plane(width, height),
        this.materials.getImage(`ceiling-sprite:${placement.spriteId}`, image)
      );
      const baseX = placement.x + 0.5;
      const baseZ = placement.y + 0.5;
      mesh.position.set(baseX, ceilingY - height / 2, baseZ);
      mesh.name = `ceiling-sprite:${placement.spriteId}`;
      mesh.userData.mazeBillboard = {
        baseX,
        baseZ,
        depthBias: 0,
        cellX: placement.x,
        cellY: placement.y,
      } satisfies BillboardMeta;
      this.billboardMeshes.push(mesh);
      this.billboards.add(mesh);
    }
  }

  clear(): void {
    this.wallFeatures.clear();
    this.billboards.clear();
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    this.billboardMeshes.length = 0;
  }

  dispose(): void {
    this.clear();
  }
}

export function preloadMazeVisuals(): Promise<void> {
  return Promise.all([loadMapSprites(), loadWallFeatures(), loadCeilingSprites()]).then(
    () => undefined
  );
}
