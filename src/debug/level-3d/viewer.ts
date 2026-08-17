import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  FogExp2,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import type { FloorDef } from "../../data/floors";
import { createGameState } from "../../game/state";
import {
  floorSurfaceZAt,
  type FloorSurface,
} from "../../engine/maze-renderer/geometry/floor-surface";
import {
  LEGACY_VERTICAL_UNIT,
  resolveCellVolume,
} from "../../engine/maze-renderer/geometry/cell-volume";
import {
  loadTextures,
  ensureThemeLoaded,
  loadCeilingFeatures,
} from "../../engine/renderer";
import { tilesetThemesForFloor } from "../../game/floor-map";
import { loadDoorFeatures } from "../../engine/door-feature-cache";
import { loadArchitecturalProps } from "../../engine/architectural-prop-cache";
import {
  MazeMaterialLibrary,
} from "../../engine/maze-renderer/webgl/maze-materials";
import {
  MazeVisualCollection,
  preloadMazeVisuals,
} from "../../engine/maze-renderer/webgl/maze-visuals";
import {
  buildLevel3DModel,
  type Level3DCell,
  type Level3DFace,
  type Level3DModel,
  type Level3DPhysicalEdge,
  authoredYToWorldY,
  physicalEdgeForFace,
} from "./floor-adapter";
import {
  Level3DCameraController,
  type Level3DCameraMode,
} from "./camera";

export type Level3DDisplayMode = "textured" | "geometry" | "wireframe" | "height";
export type Level3DLightingMode = "inspection" | "atmosphere";

export interface Level3DInspectionHit {
  kind: "face" | "water" | "prop" | "marker";
  floor: FloorDef;
  cell?: Level3DCell;
  face?: Level3DFace;
  edge?: Level3DPhysicalEdge;
  world: { x: number; y: number; z: number };
  objectName: string;
  waterDepth?: number;
}

export interface Level3DViewerOptions {
  onInspect?: (hit: Level3DInspectionHit | null) => void;
}

interface GeometryRecord {
  mesh: Mesh<BufferGeometry, Material>;
  geometry: BufferGeometry;
  batchIndex: number;
  kind: "floor" | "ceiling" | "wall" | "door";
  materialKey: string;
  material: Material;
}

interface MarkerResources {
  geometries: BufferGeometry[];
  materials: Material[];
  textures: Texture[];
}

interface MarkerMeta {
  cellX: number;
  cellY: number;
  label: string;
  markerKind: string;
}

interface WaterMeta {
  cellX: number;
  cellY: number;
  depth: number;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const WATER_URLS = [
  `${BASE}assets/tilesets/water/floorA.png`,
  `${BASE}assets/tilesets/water/floorB.png`,
] as const;

const FEATURE_LABELS: Record<string, string> = {
  stairs_up: "↑",
  stairs_down: "↓",
  teleporter: "P",
  chute: "C",
  darkness: "D",
  treasure: "$",
  antimagic: "∅",
  water: "≈",
  npc: "N",
  event: "!",
  guardian: "G",
};

const FEATURE_COLORS: Record<string, number> = {
  stairs_up: 0x9ed6ff,
  stairs_down: 0x7cb7e8,
  teleporter: 0xd5b9ff,
  chute: 0xc6b09a,
  darkness: 0x5a4e75,
  treasure: 0xe8c15b,
  antimagic: 0x9f9aa8,
  water: 0x55b7c8,
  npc: 0xc9b37c,
  event: 0xf08963,
  guardian: 0xe06c6c,
};

const REGION_COLORS = [0x5f9eb5, 0xa278b5, 0xc89259, 0x75a982, 0xb76868];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function heightColor(value: number): [number, number, number] {
  const t = clamp01(value);
  const hue = (0.68 - t * 0.68) * Math.PI * 2;
  const saturation = 0.8;
  const lightness = 0.54;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / (Math.PI / 3)) % 2) - 1));
  const m = lightness - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  const sector = Math.floor(hue / (Math.PI / 3));
  if (sector === 0) [r, g, b] = [chroma, x, 0];
  else if (sector === 1) [r, g, b] = [x, chroma, 0];
  else if (sector === 2) [r, g, b] = [0, chroma, x];
  else if (sector === 3) [r, g, b] = [0, x, chroma];
  else if (sector === 4) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  return [r + m, g + m, b + m];
}

function faceMidHeight(face: Level3DFace, minZ: number, maxZ: number): number {
  return clamp01(((face.zRange[0] + face.zRange[1]) / 2 - minZ) / Math.max(0.0001, maxZ - minZ));
}

function surfaceCenterY(surface: FloorSurface): number {
  if (surface.kind === "flat") return surface.z;
  return (surface.lowZ + surface.highZ) / 2;
}

function meshMaterial(mesh: Mesh<BufferGeometry, Material>): Material {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

export class Level3DViewer {
  readonly scene = new Scene();
  readonly cameraController: Level3DCameraController;

  private readonly renderer: WebGLRenderer;
  private readonly geometryGroup = new Group();
  private readonly waterGroup = new Group();
  private readonly markerGroup = new Group();
  private readonly regionGroup = new Group();
  private readonly materials = new MazeMaterialLibrary();
  private readonly visuals = new MazeVisualCollection(this.materials);
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly geometryRecords: GeometryRecord[] = [];
  private readonly ownedMaterials = new Set<Material>();
  private readonly markerResources: MarkerResources = {
    geometries: [],
    materials: [],
    textures: [],
  };
  private readonly waterGeometries: BufferGeometry[] = [];
  private readonly waterMaterials: Material[] = [];
  private readonly waterTextures: Array<Texture | null> = [null, null];
  private readonly keys = new Set<string>();
  private readonly options: Level3DViewerOptions;
  private floor: FloorDef | null = null;
  private model: Level3DModel | null = null;
  private viewerState: ReturnType<typeof createGameState> | null = null;
  private displayMode: Level3DDisplayMode = "textured";
  private lightingMode: Level3DLightingMode = "inspection";
  private showCeilings = true;
  private transparentCeilings = false;
  private showFloors = true;
  private showProps = true;
  private showMarkers = false;
  private showRegions = false;
  private lastFrameAt = 0;
  private loadGeneration = 0;
  private dragging = false;
  private dragButton = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: Level3DViewerOptions = {}
  ) {
    this.options = options;
    this.cameraController = new Level3DCameraController(1);
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      depth: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(2, Math.max(1, window.devicePixelRatio || 1)));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x101116, 1);
    this.scene.background = new Color(0x101116);
    this.scene.add(this.geometryGroup);
    this.scene.add(this.waterGroup);
    this.scene.add(this.visuals.wallFeatures);
    this.scene.add(this.visuals.architecturalProps);
    this.scene.add(this.visuals.environmentalSprites);
    this.scene.add(this.visuals.billboards);
    this.scene.add(this.regionGroup);
    this.scene.add(this.markerGroup);
    this.bindCanvasInput();
    this.resize();
  }

  get currentFloor(): FloorDef | null {
    return this.floor;
  }

  get currentModel(): Level3DModel | null {
    return this.model;
  }

  get cameraMode(): Level3DCameraMode {
    return this.cameraController.cameraMode;
  }

  setDisplayMode(mode: Level3DDisplayMode): void {
    this.displayMode = mode;
    this.applyMaterials();
  }

  setLightingMode(mode: Level3DLightingMode): void {
    this.lightingMode = mode;
    const atmosphere = mode === "atmosphere";
    const color = atmosphere ? 0x0e0d0a : 0x101116;
    this.scene.background = new Color(color);
    this.scene.fog = atmosphere ? new FogExp2(color, 0.035) : null;
    this.renderer.setClearColor(color, 1);
    for (const material of this.waterMaterials) {
      if (material instanceof MeshBasicMaterial) material.fog = atmosphere;
    }
    this.applyMaterials();
  }

  setCeilingsVisible(visible: boolean): void {
    this.showCeilings = visible;
    this.syncVisibility();
  }

  setCeilingsTransparent(transparent: boolean): void {
    this.transparentCeilings = transparent;
    this.applyMaterials();
  }

  setFloorsVisible(visible: boolean): void {
    this.showFloors = visible;
    this.syncVisibility();
  }

  setPropsVisible(visible: boolean): void {
    this.showProps = visible;
    this.syncVisibility();
  }

  setMarkersVisible(visible: boolean): void {
    this.showMarkers = visible;
    this.syncVisibility();
  }

  setRegionsVisible(visible: boolean): void {
    this.showRegions = visible;
    this.syncVisibility();
  }

  setCameraMode(mode: Level3DCameraMode): void {
    this.cameraController.setMode(mode);
  }

  handleKeyDown(code: string): void {
    this.keys.add(code);
  }

  handleKeyUp(code: string): void {
    this.keys.delete(code);
  }

  clearKeys(): void {
    this.keys.clear();
  }

  resetCamera(): void {
    if (!this.model) return;
    this.cameraController.reset(this.cameraBounds());
  }

  topView(): void {
    if (!this.model) return;
    this.cameraController.topView();
  }

  isometricView(): void {
    if (!this.model) return;
    this.cameraController.isometricView();
  }

  resize(): void {
    const width = Math.max(1, Math.floor(this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 960));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 640));
    this.renderer.setSize(width, height, false);
    this.cameraController.setAspect(width / height);
  }

  async loadFloor(floor: FloorDef): Promise<void> {
    const generation = ++this.loadGeneration;
    const model = buildLevel3DModel(floor);
    await Promise.all([
      loadTextures(),
      loadDoorFeatures(),
      loadCeilingFeatures(),
      preloadMazeVisuals(),
      loadArchitecturalProps(floor.architecturalProps ?? []),
      this.loadWaterTextures(),
      ...tilesetThemesForFloor(floor).map((theme) => ensureThemeLoaded(theme)),
    ]);
    if (generation !== this.loadGeneration) return;

    this.clearFloorObjects();
    this.floor = floor;
    this.model = model;
    this.viewerState = createGameState(floor);
    this.viewerState.floor = floor;
    this.viewerState.mode = "dungeon";
    this.buildGeometry(model);
    this.buildWater(model);
    this.visuals.loadFloor(floor);
    this.buildRegions(model);
    this.buildMarkers(model);
    this.cameraController.reset(this.cameraBounds());
    this.applyMaterials();
    this.syncVisibility();
  }

  update(now = performance.now()): void {
    const deltaSeconds = this.lastFrameAt === 0
      ? 0
      : Math.min(0.08, Math.max(0, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    this.cameraController.update(deltaSeconds, this.keys);
    if (this.viewerState) this.visuals.update(this.viewerState, this.cameraController.camera, now);
    this.syncVisibility();
    this.renderer.render(this.scene, this.cameraController.camera);
  }

  inspectAt(clientX: number, clientY: number): Level3DInspectionHit | null {
    if (!this.model || !this.floor) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.cameraController.camera);
    const roots: Object3D[] = [
      this.geometryGroup,
      this.waterGroup,
      this.visuals.wallFeatures,
      this.visuals.architecturalProps,
      this.visuals.environmentalSprites,
      this.visuals.billboards,
      this.markerGroup,
    ];
    const intersections = this.raycaster.intersectObjects(roots, true);
    for (const intersection of intersections) {
      const hit = this.inspectionForObject(intersection.object, intersection.point, intersection.faceIndex);
      if (hit) {
        this.options.onInspect?.(hit);
        return hit;
      }
    }
    this.options.onInspect?.(null);
    return null;
  }

  dispose(): void {
    this.loadGeneration += 1;
    this.clearFloorObjects();
    this.visuals.dispose();
    this.materials.dispose();
    for (const texture of this.waterTextures) texture?.dispose();
    this.renderer.dispose();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.dragButton = event.button;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = event.clientX - this.lastPointerX;
    const dy = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    if (this.cameraMode === "fly") {
      this.cameraController.flyLook(dx, dy);
    } else if (this.dragButton === 2 || event.shiftKey || event.button === 1) {
      this.cameraController.orbitPan(dx, dy);
    } else {
      this.cameraController.orbitRotate(dx, dy);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.cameraController.zoom(event.deltaY);
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private bindCanvasInput(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  private cameraBounds(): { width: number; height: number; maxWorldY: number } {
    if (!this.model) return { width: 16, height: 16, maxWorldY: LEGACY_VERTICAL_UNIT };
    const maxWorldY = this.model.stats.ceilingZRange[1] * LEGACY_VERTICAL_UNIT;
    return { width: this.model.floor.width, height: this.model.floor.height, maxWorldY };
  }

  private clearFloorObjects(): void {
    this.visuals.clear();
    this.geometryGroup.clear();
    this.waterGroup.clear();
    this.regionGroup.clear();
    this.markerGroup.clear();
    for (const record of this.geometryRecords) {
      record.geometry.dispose();
      this.disposeOwnedMaterial(record.material);
    }
    this.geometryRecords.length = 0;
    for (const geometry of this.waterGeometries) geometry.dispose();
    this.waterGeometries.length = 0;
    for (const material of this.waterMaterials) material.dispose();
    this.waterMaterials.length = 0;
    this.clearMarkerResources();
    this.floor = null;
    this.model = null;
    this.viewerState = null;
  }

  private buildGeometry(model: Level3DModel): void {
    for (const [batchIndex, batch] of model.geometry.batches.entries()) {
      if (!batch.indices.length) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(batch.positions, 3));
      geometry.setAttribute("normal", new Float32BufferAttribute(batch.normals, 3));
      geometry.setAttribute("uv", new Float32BufferAttribute(batch.uvs, 2));
      geometry.setAttribute("color", new Float32BufferAttribute(this.vertexColorsForBatch(model, batchIndex), 3));
      geometry.setIndex(batch.indices);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: 0xffffff }));
      mesh.name = `level:${batch.kind}:${batch.materialKey}`;
      mesh.userData.levelBatch = { batchIndex, kind: batch.kind, materialKey: batch.materialKey };
      this.geometryGroup.add(mesh);
      const material = meshMaterial(mesh);
      this.ownedMaterials.add(material);
      this.geometryRecords.push({
        mesh,
        geometry,
        batchIndex,
        kind: batch.kind,
        materialKey: batch.materialKey,
        material,
      });
    }
  }

  private vertexColorsForBatch(model: Level3DModel, batchIndex: number): number[] {
    const batch = model.geometry.batches[batchIndex];
    const minZ = model.stats.floorZRange[0];
    const maxZ = model.stats.ceilingZRange[1];
    const values: number[] = [];
    for (const source of batch.faces) {
      const face = model.faces.find((candidate) =>
        candidate.batchIndex === batchIndex && candidate.faceIndex === values.length / 12
      );
      const color = face ? heightColor(faceMidHeight(face, minZ, maxZ)) : [0.7, 0.7, 0.7];
      for (let vertex = 0; vertex < 4; vertex++) values.push(...color);
      // `source` is intentionally read here to keep the loop aligned with the
      // compiler's one-face-per-four-vertices contract.
      void source;
    }
    return values;
  }

  private applyMaterials(): void {
    for (const record of this.geometryRecords) this.disposeOwnedMaterial(record.material);
    for (const record of this.geometryRecords) {
      const material = this.makeGeometryMaterial(record);
      record.material = material;
      record.mesh.material = material;
      this.ownedMaterials.add(material);
    }
  }

  private makeGeometryMaterial(record: GeometryRecord): MeshBasicMaterial {
    const atmosphere = this.lightingMode === "atmosphere";
    if (this.displayMode === "textured") {
      const shared = this.materials.get(record.materialKey) as MeshBasicMaterial;
      const material = shared.clone();
      material.side = DoubleSide;
      material.fog = atmosphere;
      material.toneMapped = false;
      if (atmosphere) material.color.multiplyScalar(0.78);
      this.applyCeilingTransparency(material, record.kind);
      return material;
    }
    if (this.displayMode === "height") {
      const material = new MeshBasicMaterial({
        vertexColors: true,
        side: DoubleSide,
        fog: atmosphere,
        toneMapped: false,
      });
      this.applyCeilingTransparency(material, record.kind);
      return material;
    }
    const color = record.kind === "floor"
      ? 0x8c8174
      : record.kind === "ceiling"
        ? 0x56535a
        : record.kind === "door"
          ? 0xc6a15f
          : 0x756b63;
    const material = new MeshBasicMaterial({
      color,
      wireframe: this.displayMode === "wireframe",
      side: DoubleSide,
      fog: atmosphere,
      toneMapped: false,
    });
    if (atmosphere) material.color.multiplyScalar(0.78);
    this.applyCeilingTransparency(material, record.kind);
    return material;
  }

  private applyCeilingTransparency(material: MeshBasicMaterial, kind: GeometryRecord["kind"]): void {
    if (kind !== "ceiling" || !this.transparentCeilings) return;
    material.transparent = true;
    material.opacity = 0.22;
    material.depthWrite = false;
    material.side = DoubleSide;
  }

  private syncVisibility(): void {
    for (const record of this.geometryRecords) {
      record.mesh.visible = record.kind === "floor"
        ? this.showFloors
        : record.kind === "ceiling"
          ? this.showCeilings
          : true;
    }
    this.visuals.architecturalProps.visible = this.showProps;
    this.visuals.wallFeatures.visible = this.showProps;
    this.visuals.environmentalSprites.visible = this.showProps;
    this.visuals.billboards.visible = this.showProps;
    this.visuals.billboards.traverse((object) => {
      if (object.name.startsWith("ceiling-sprite:")) object.visible = this.showProps && this.showCeilings;
    });
    this.waterGroup.visible = this.showFloors;
    this.markerGroup.visible = this.showMarkers;
    this.regionGroup.visible = this.showRegions;
  }

  private async loadWaterTextures(): Promise<void> {
    if (this.waterTextures.every((texture) => texture !== null)) return;
    const loader = new TextureLoader();
    await Promise.all(WATER_URLS.map(async (url, index) => {
      if (this.waterTextures[index]) return;
      try {
        const texture = await loader.loadAsync(url);
        texture.magFilter = NearestFilter;
        texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = SRGBColorSpace;
        this.waterTextures[index] = texture;
      } catch {
        this.waterTextures[index] = null;
      }
    }));
  }

  private buildWater(model: Level3DModel): void {
    const waterDefs = new Map(
      (model.floor.waters ?? []).map((water) => [`${water.x},${water.y}`, water] as const)
    );
    for (const cell of model.cells) {
      if (cell.cell.void || cell.feature !== "water") continue;
      const water = waterDefs.get(`${cell.x},${cell.y}`);
      const depth = water?.depth ?? 1;
      const surface = cell.surface;
      const locals = [[0, 0], [0, 1], [1, 1], [1, 0]] as const;
      const positions = locals.flatMap(([lx, lz]) => [
        cell.x + lx,
        authoredYToWorldY(floorSurfaceZAt(surface, lx, lz)) + 0.004,
        cell.y + lz,
      ]);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      geometry.setAttribute("uv", new Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeBoundingSphere();
      const texture = this.waterTextures[(cell.x + cell.y) % 2] ?? null;
      const material = new MeshBasicMaterial({
        map: texture,
        color: texture ? 0xffffff : 0x315c65,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        side: DoubleSide,
        fog: this.lightingMode === "atmosphere",
        toneMapped: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.name = `water:${cell.x},${cell.y}:depth-${depth}`;
      mesh.userData.levelWater = { cellX: cell.x, cellY: cell.y, depth } satisfies WaterMeta;
      this.waterGroup.add(mesh);
      this.waterGeometries.push(geometry);
      this.waterMaterials.push(material);
    }
  }

  private buildRegions(model: Level3DModel): void {
    const floor = model.floor;
    let colorIndex = 0;
    for (const zone of floor.tilesetZones ?? []) {
      this.addRegionPlane(
        zone.x1,
        zone.y1,
        zone.x2,
        zone.y2,
        REGION_COLORS[colorIndex++ % REGION_COLORS.length],
        `tileset ${zone.id}: ${zone.theme}`,
        this.zoneFloorY(model, zone.x1, zone.y1)
      );
    }
    for (const zone of floor.heightZones ?? []) {
      this.addRegionPlane(
        zone.x1,
        zone.y1,
        zone.x2,
        zone.y2,
        REGION_COLORS[colorIndex++ % REGION_COLORS.length],
        `height ${zone.id}: floor ${zone.floorZ ?? "inherit"}, ceiling ${zone.ceilingZ ?? "inherit"}`,
        authoredYToWorldY(zone.floorZ ?? resolveCellVolume(floor, zone.x1, zone.y1).floorZ) + 0.012
      );
    }
    for (const zone of floor.encounterZones ?? []) {
      this.addRegionPlane(
        zone.x1,
        zone.y1,
        zone.x2,
        zone.y2,
        REGION_COLORS[colorIndex++ % REGION_COLORS.length],
        `encounter ${zone.id}: ×${zone.rateMul}`,
        this.zoneFloorY(model, zone.x1, zone.y1)
      );
    }
  }

  private zoneFloorY(model: Level3DModel, x: number, y: number): number {
    const cell = model.cells.find((candidate) => candidate.x === x && candidate.y === y);
    return authoredYToWorldY(cell ? surfaceCenterY(cell.surface) : 0) + 0.012;
  }

  private addRegionPlane(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    label: string,
    worldY: number
  ): void {
    const width = x2 - x1 + 1;
    const height = y2 - y1 + 1;
    const geometry = new PlaneGeometry(width, height);
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x1 + width / 2, worldY, y1 + height / 2);
    mesh.name = `region:${label}`;
    this.regionGroup.add(mesh);
    const labelSprite = this.makeLabel(label, color, 0.72);
    labelSprite.position.set(mesh.position.x, worldY + 0.04, mesh.position.z);
    this.regionGroup.add(labelSprite);
    this.markerResources.geometries.push(geometry);
    this.markerResources.materials.push(material);
  }

  private buildMarkers(model: Level3DModel): void {
    const floor = model.floor;
    this.addCellMarker(model, floor.startX, floor.startY, "S", "start", 0xbfe5aa);
    for (const cell of model.cells) {
      if (!cell.feature) continue;
      const label = FEATURE_LABELS[cell.feature] ?? "?";
      const color = FEATURE_COLORS[cell.feature] ?? 0xd0c0a0;
      this.addCellMarker(model, cell.x, cell.y, label, cell.feature, color);
    }
    for (const ramp of floor.ramps ?? []) {
      this.addCellMarker(model, ramp.x, ramp.y, ramp.surface === "stairs" ? "⇧" : "↗", `${ramp.surface}-${ramp.dir}`, 0xe4b76a);
    }
    for (const event of floor.events ?? []) {
      if (model.floor.grid[event.y]?.[event.x]?.tile !== "event") {
        this.addCellMarker(model, event.x, event.y, "!", `event-${event.kind}`, 0xf08963);
      }
    }
    for (const teleporter of floor.teleporters ?? []) {
      if (model.floor.grid[teleporter.y]?.[teleporter.x]?.tile !== "teleporter") {
        this.addCellMarker(model, teleporter.x, teleporter.y, "P", "teleporter-link", 0xd5b9ff);
      }
    }
    for (const chute of floor.chuteDrops ?? []) {
      if (model.floor.grid[chute.y]?.[chute.x]?.tile !== "chute") {
        this.addCellMarker(model, chute.x, chute.y, "C", "chute-link", 0xc6b09a);
      }
    }
    for (const edge of model.physicalEdges.filter((candidate) => candidate.edge === "locked" || candidate.edge === "barred")) {
      this.addEdgeMarker(model, edge);
    }
    if (floor.stairsGuardian) {
      this.addCellMarker(model, floor.stairsGuardian.x, floor.stairsGuardian.y, "G", "stairs-guardian", 0xf06c6c);
    }
  }

  private addCellMarker(
    model: Level3DModel,
    x: number,
    y: number,
    label: string,
    markerKind: string,
    color: number
  ): void {
    const cell = model.cells.find((candidate) => candidate.x === x && candidate.y === y);
    if (!cell || cell.cell.void) return;
    const worldY = authoredYToWorldY(floorSurfaceZAt(cell.surface, 0.5, 0.5));
    const geometry = new SphereGeometry(0.09, 6, 4);
    const material = new MeshBasicMaterial({ color, toneMapped: false });
    const marker = new Mesh(geometry, material);
    marker.position.set(x + 0.5, worldY + 0.18, y + 0.5);
    marker.name = `marker:${markerKind}@${x},${y}`;
    marker.userData.levelMarker = { cellX: x, cellY: y, label, markerKind } satisfies MarkerMeta;
    this.markerGroup.add(marker);
    const labelSprite = this.makeLabel(label, color, 0.42);
    labelSprite.position.set(x + 0.5, worldY + 0.45, y + 0.5);
    labelSprite.name = marker.name;
    labelSprite.userData.levelMarker = marker.userData.levelMarker;
    this.markerGroup.add(labelSprite);
    this.markerResources.geometries.push(geometry);
    this.markerResources.materials.push(material);
  }

  private addEdgeMarker(model: Level3DModel, edge: Level3DPhysicalEdge): void {
    const cell = model.cells.find((candidate) => candidate.x === edge.x && candidate.y === edge.y);
    if (!cell || cell.cell.void) return;
    const worldY = authoredYToWorldY(surfaceCenterY(cell.surface)) + 0.08;
    const color = edge.edge === "locked" ? 0xe06c6c : 0xd4b285;
    const label = edge.edge === "locked" ? "L" : "B";
    const marker = new Mesh(new SphereGeometry(0.07, 6, 4), new MeshBasicMaterial({ color, toneMapped: false }));
    if (edge.dir === "n") marker.position.set(edge.x + 0.5, worldY, edge.y + 0.02);
    else if (edge.dir === "e") marker.position.set(edge.x + 0.98, worldY, edge.y + 0.5);
    else if (edge.dir === "s") marker.position.set(edge.x + 0.5, worldY, edge.y + 0.98);
    else marker.position.set(edge.x + 0.02, worldY, edge.y + 0.5);
    marker.name = `marker:${edge.edge}-edge@${edge.x},${edge.y},${edge.dir}`;
    marker.userData.levelMarker = { cellX: edge.x, cellY: edge.y, label, markerKind: edge.edge } satisfies MarkerMeta;
    this.markerGroup.add(marker);
    this.markerResources.geometries.push(marker.geometry);
    this.markerResources.materials.push(meshMaterial(marker));
  }

  private makeLabel(text: string, color: number, scale: number): Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 48;
    const context = canvas.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "rgba(10, 12, 16, 0.88)";
    context.fillRect(2, 2, 124, 44);
    context.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
    context.strokeRect(2.5, 2.5, 123, 43);
    context.fillStyle = "#f4e6c7";
    context.font = "bold 22px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 64, 24);
    const texture = new CanvasTexture(canvas);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new Sprite(material);
    sprite.scale.set(scale, scale * 0.375, 1);
    this.markerResources.textures.push(texture);
    this.markerResources.materials.push(material);
    return sprite;
  }

  private clearMarkerResources(): void {
    for (const geometry of this.markerResources.geometries) geometry.dispose();
    for (const material of this.markerResources.materials) material.dispose();
    for (const texture of this.markerResources.textures) texture.dispose();
    this.markerResources.geometries.length = 0;
    this.markerResources.materials.length = 0;
    this.markerResources.textures.length = 0;
  }

  private disposeOwnedMaterial(material: Material): void {
    if (!this.ownedMaterials.delete(material)) return;
    material.dispose();
  }

  private inspectionForObject(
    object: Object3D,
    point: Vector3,
    faceIndex: number | null | undefined
  ): Level3DInspectionHit | null {
    if (!this.floor || !this.model) return null;
    const world = { x: point.x, y: point.y, z: point.z };
    const batch = object.userData.levelBatch as { batchIndex: number } | undefined;
    if (batch && faceIndex !== undefined && faceIndex !== null) {
      const faceIndexInBatch = Math.floor(faceIndex / 2);
      const face = this.model.faces.find((candidate) =>
        candidate.batchIndex === batch.batchIndex && candidate.faceIndex === faceIndexInBatch
      );
      if (face) {
        const cell = this.model.cells.find((candidate) =>
          candidate.x === face.source.cellX && candidate.y === face.source.cellY
        );
        const edge = physicalEdgeForFace(this.model, face);
        return {
          kind: "face",
          floor: this.floor,
          cell,
          face,
          edge,
          world,
          objectName: object.name,
        };
      }
    }
    const water = object.userData.levelWater as WaterMeta | undefined;
    if (water) {
      return {
        kind: "water",
        floor: this.floor,
        cell: this.model.cells.find((candidate) => candidate.x === water.cellX && candidate.y === water.cellY),
        world,
        objectName: object.name,
        waterDepth: water.depth,
      };
    }
    const marker = object.userData.levelMarker as MarkerMeta | undefined;
    if (marker) {
      return {
        kind: "marker",
        floor: this.floor,
        cell: this.model.cells.find((candidate) => candidate.x === marker.cellX && candidate.y === marker.cellY),
        world,
        objectName: object.name,
      };
    }
    if (object.name.startsWith("architectural-prop:") || object.name.startsWith("billboard:") || object.name.startsWith("wall-feature:") || object.name.startsWith("environmental-sprite:")) {
      const billboard = object.userData.mazeBillboard as { cellX?: number; cellY?: number } | undefined;
      const cell = billboard?.cellX !== undefined && billboard.cellY !== undefined
        ? this.model.cells.find((candidate) => candidate.x === billboard.cellX && candidate.y === billboard.cellY)
        : undefined;
      return { kind: "prop", floor: this.floor, cell, world, objectName: object.name };
    }
    return null;
  }
}
