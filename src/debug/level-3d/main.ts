import "../../../tools/level-3d.css";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { getFloors } from "../../game/floor-registry";
import {
  authoredYToWorldY,
  formatMaterialKey,
  type Level3DModel,
} from "./floor-adapter";
import type { Level3DCameraMode } from "./camera";
import {
  Level3DViewer,
  type Level3DInspectionHit,
  type Level3DDisplayMode,
  type Level3DLightingMode,
} from "./viewer";

const floors = [...getFloors()].sort((a, b) => a.id - b.id);
const floorById = new Map(floors.map((floor) => [floor.id, floor]));

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Level 3D viewer is missing #${id}`);
  return node as T;
}

function formatRange(range: readonly [number, number]): string {
  return `${range[0].toFixed(2)}–${range[1].toFixed(2)}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function addMetric(container: HTMLElement, label: string, value: string): void {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  container.append(term, description);
}

function materialClass(materialKey: string): string {
  const parsed = formatMaterialKey(materialKey);
  if (parsed.featureId) return "feature";
  if (parsed.surface === "floorA" || parsed.surface === "floorB") return "floor";
  return parsed.surface === "wall" || parsed.surface === "door" ? "wall" : "";
}

function materialSource(materialKey: string): string {
  const parsed = formatMaterialKey(materialKey);
  if (parsed.featureId) {
    return `feature ${parsed.featureId} · theme ${parsed.theme}`;
  }
  if (!parsed.theme || !parsed.surface) return "game fallback material";
  if (parsed.variant) {
    return `src/assets/${parsed.theme}_wall${parsed.variant}_256.png · canonical variant`;
  }
  return `public/assets/tilesets/${parsed.theme}/${parsed.surface}.png`;
}

function displayCellSurface(cell: NonNullable<Level3DModel["cells"]>[number]): string {
  if (cell.surface.kind === "flat") return `flat ${cell.surface.z.toFixed(2)}`;
  return `${cell.surface.kind} ${cell.surface.lowZ.toFixed(2)}→${cell.surface.highZ.toFixed(2)} (${cell.surface.dir})`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

const floorSelect = element<HTMLSelectElement>("floor-select");
const displaySelect = element<HTMLSelectElement>("display-mode");
const lightingSelect = element<HTMLSelectElement>("lighting-mode");
const showCeilings = element<HTMLInputElement>("show-ceilings");
const transparentCeilings = element<HTMLInputElement>("transparent-ceilings");
const showFloors = element<HTMLInputElement>("show-floors");
const showProps = element<HTMLInputElement>("show-props");
const showMarkers = element<HTMLInputElement>("show-markers");
const showRegions = element<HTMLInputElement>("show-regions");
const coverage = element<HTMLElement>("coverage");
const materialList = element<HTMLElement>("material-list");
const inspector = element<HTMLElement>("inspector");
const loadingStatus = element<HTMLElement>("loading-status");
const viewportError = element<HTMLElement>("viewport-error");
const exportButton = element<HTMLButtonElement>("export-glb");
const exportStatus = element<HTMLElement>("export-status");
const canvas = element<HTMLCanvasElement>("level-canvas");
const buildMeta = element<HTMLElement>("build-meta");

for (const floor of floors) {
  const option = document.createElement("option");
  option.value = String(floor.id);
  option.textContent = `Floor ${floor.id} — ${floor.name}`;
  floorSelect.append(option);
}

const build = (window as unknown as { __onyxBuild?: { sha?: string; branch?: string; builtAt?: string } }).__onyxBuild;
buildMeta.textContent = build
  ? `${build.branch ?? "unknown branch"}\n${build.sha ?? "unknown SHA"} · ${build.builtAt ?? "dev"}`
  : "dev server · build identity unavailable";

let viewer: Level3DViewer | null = null;
let currentModel: Level3DModel | null = null;

function renderCoverage(model: Level3DModel): void {
  const stats = model.stats;
  coverage.replaceChildren();
  addMetric(coverage, "Dimensions", `${model.floor.width} × ${model.floor.height}`);
  addMetric(coverage, "Grid cells", formatCount(stats.cellCount));
  addMetric(coverage, "Interior cells", formatCount(stats.interiorCellCount));
  addMetric(coverage, "Void cells", formatCount(stats.voidCellCount));
  addMetric(coverage, "No-ceiling cells", formatCount(stats.noCeilingCellCount));
  addMetric(coverage, "Floor faces", formatCount(stats.surfaceCounts.floor));
  addMetric(coverage, "Ceiling faces", formatCount(stats.surfaceCounts.ceiling));
  addMetric(coverage, "Wall faces", formatCount(stats.surfaceCounts.wall));
  addMetric(coverage, "Door faces", formatCount(stats.surfaceCounts.door));
  addMetric(coverage, "Physical edges", formatCount(stats.physicalEdgeCount));
  addMetric(coverage, "Ramps / stairs", `${stats.rampCount} / ${stats.stairCount}`);
  addMetric(coverage, "Doors / locks / gates", `${stats.doorCount} / ${stats.lockedDoorCount} / ${stats.barredGateCount}`);
  addMetric(coverage, "Source props", formatCount(stats.propCount));
  addMetric(coverage, "Debug markers", formatCount(stats.markerCount));
  addMetric(coverage, "Floor Z range", formatRange(stats.floorZRange));
  addMetric(coverage, "Ceiling Z range", formatRange(stats.ceilingZRange));
  addMetric(coverage, "Themes", stats.themes.join(", ") || "—");
  addMetric(coverage, "Compiled triangles", formatCount(model.geometry.stats.triangles));

  materialList.replaceChildren();
  const materialKeys = [...new Set(model.faces.map((face) => face.materialKey))].sort();
  if (materialKeys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No compiled materials.";
    materialList.append(empty);
    return;
  }
  for (const materialKey of materialKeys) {
    const entry = document.createElement("div");
    entry.className = `material-entry ${materialClass(materialKey)}`;
    entry.textContent = `${materialKey}\n${materialSource(materialKey)}`;
    materialList.append(entry);
  }
}

function renderInspector(hit: Level3DInspectionHit | null): void {
  if (!hit) {
    inspector.textContent = "Hover a face, prop, marker, or water tile.";
    return;
  }
  const lines = [
    `Floor: ${hit.floor.id} — ${hit.floor.name}`,
    `World: (${hit.world.x.toFixed(3)}, ${hit.world.y.toFixed(3)}, ${hit.world.z.toFixed(3)})`,
    `Object: ${hit.objectName}`,
    `Kind: ${hit.kind}`,
  ];
  if (hit.cell) {
    lines.push(
      `Cell: (${hit.cell.x}, ${hit.cell.y})`,
      `Theme: ${hit.cell.theme}`,
      `Surface: ${displayCellSurface(hit.cell)}`,
      `Floor Z: ${hit.cell.volume.floorZ.toFixed(3)} (${authoredYToWorldY(hit.cell.volume.floorZ).toFixed(3)} world)`,
      `Ceiling Z: ${hit.cell.volume.ceilingZ.toFixed(3)} (${authoredYToWorldY(hit.cell.volume.ceilingZ).toFixed(3)} world)`,
    );
  }
  if (hit.face) {
    const parsed = formatMaterialKey(hit.face.materialKey);
    lines.push(
      `Face: ${hit.face.source.kind} / ${hit.face.source.role}`,
      `Material key: ${hit.face.materialKey}`,
      `Texture: ${materialSource(hit.face.materialKey)}`,
      `Face Z: ${hit.face.zRange[0].toFixed(3)}–${hit.face.zRange[1].toFixed(3)} authored`,
      `Surface token: ${parsed.surface}${parsed.variant ? ` @ ${parsed.variant}` : ""}`,
    );
    if (hit.face.source.dir) {
      lines.push(`Direction: ${hit.face.source.dir.toUpperCase()}`);
    }
    if (hit.face.source.edge) {
      lines.push(`Edge: ${hit.face.source.edge}`);
    }
    if (hit.edge) {
      lines.push(
        `Neighbor: (${hit.edge.neighborX}, ${hit.edge.neighborY})`,
        `Opposite edge: ${hit.edge.oppositeEdge ?? "out of bounds"}`,
        `Symmetric: ${hit.edge.symmetric ? "yes" : "NO — authored mismatch"}`,
      );
    }
  }
  if (hit.waterDepth !== undefined) lines.push(`Water depth: ${hit.waterDepth}`);
  inspector.textContent = lines.join("\n");
}

function setCameraButtonState(mode: Level3DCameraMode): void {
  for (const [id, buttonMode] of [["camera-orbit", "orbit"], ["camera-fly", "fly"]] as const) {
    element<HTMLButtonElement>(id).ariaPressed = String(mode === buttonMode);
  }
}

function setLoading(message: string, loading: boolean): void {
  loadingStatus.textContent = message;
  loadingStatus.hidden = !loading;
  floorSelect.disabled = loading;
}

async function loadSelectedFloor(id: number): Promise<void> {
  const floor = floorById.get(id);
  if (!floor || !viewer) return;
  setLoading(`Loading Floor ${floor.id} assets and geometry…`, true);
  viewportError.hidden = true;
  try {
    await viewer.loadFloor(floor);
    currentModel = viewer.currentModel;
    if (!currentModel) throw new Error("Floor load completed without a model");
    renderCoverage(currentModel);
    renderInspector(null);
    setCameraButtonState(viewer.cameraMode);
    const url = new URL(window.location.href);
    url.searchParams.set("floor", String(floor.id));
    window.history.replaceState(null, "", url);
    setLoading(`Floor ${floor.id} ready · ${currentModel.geometry.stats.triangles.toLocaleString("en-US")} triangles`, false);
  } catch (error) {
    currentModel = null;
    viewportError.textContent = `Unable to load canonical floor.\n\n${errorText(error)}`;
    viewportError.hidden = false;
    setLoading("Floor load failed", false);
  }
}

async function exportVisibleScene(): Promise<void> {
  if (!viewer?.currentFloor || !currentModel) return;
  exportButton.disabled = true;
  exportStatus.textContent = "Encoding GLB…";
  try {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(viewer.scene, {
      binary: true,
      embedImages: true,
      onlyVisible: true,
    });
    if (!(result instanceof ArrayBuffer)) throw new Error("GLTF exporter returned JSON instead of binary GLB");
    const blob = new Blob([result], { type: "model/gltf-binary" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `onyxlabyrinth-floor-${viewer.currentFloor.id}.glb`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportStatus.textContent = `Exported ${Math.round(blob.size / 1024)} KiB GLB.`;
  } catch (error) {
    exportStatus.textContent = `Export failed: ${errorText(error)}`;
  } finally {
    exportButton.disabled = false;
  }
}

function connectControls(): void {
  floorSelect.addEventListener("change", () => {
    void loadSelectedFloor(Number(floorSelect.value));
  });
  displaySelect.addEventListener("change", () => {
    viewer?.setDisplayMode(displaySelect.value as Level3DDisplayMode);
  });
  lightingSelect.addEventListener("change", () => {
    viewer?.setLightingMode(lightingSelect.value as Level3DLightingMode);
  });
  showCeilings.addEventListener("change", () => {
    if (!viewer) return;
    viewer.setCeilingsVisible(showCeilings.checked);
    transparentCeilings.disabled = !showCeilings.checked;
  });
  transparentCeilings.addEventListener("change", () => viewer?.setCeilingsTransparent(transparentCeilings.checked));
  showFloors.addEventListener("change", () => viewer?.setFloorsVisible(showFloors.checked));
  showProps.addEventListener("change", () => viewer?.setPropsVisible(showProps.checked));
  showMarkers.addEventListener("change", () => viewer?.setMarkersVisible(showMarkers.checked));
  showRegions.addEventListener("change", () => viewer?.setRegionsVisible(showRegions.checked));

  element<HTMLButtonElement>("camera-orbit").addEventListener("click", () => {
    viewer?.setCameraMode("orbit");
    if (viewer) setCameraButtonState(viewer.cameraMode);
  });
  element<HTMLButtonElement>("camera-fly").addEventListener("click", () => {
    viewer?.setCameraMode("fly");
    if (viewer) setCameraButtonState(viewer.cameraMode);
    canvas.focus();
  });
  element<HTMLButtonElement>("camera-top").addEventListener("click", () => {
    viewer?.topView();
    if (viewer) setCameraButtonState(viewer.cameraMode);
  });
  element<HTMLButtonElement>("camera-iso").addEventListener("click", () => {
    viewer?.isometricView();
    if (viewer) setCameraButtonState(viewer.cameraMode);
  });
  element<HTMLButtonElement>("camera-reset").addEventListener("click", () => {
    viewer?.resetCamera();
    if (viewer) setCameraButtonState(viewer.cameraMode);
  });
  exportButton.addEventListener("click", () => void exportVisibleScene());

  canvas.addEventListener("pointermove", (event) => {
    viewer?.inspectAt(event.clientX, event.clientY);
  });
  canvas.addEventListener("pointerleave", () => renderInspector(null));
  canvas.addEventListener("click", (event) => {
    viewer?.inspectAt(event.clientX, event.clientY);
  });

  const flyKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);
  window.addEventListener("keydown", (event) => {
    if (!viewer || viewer.cameraMode !== "fly" || !flyKeys.has(event.code)) return;
    viewer.handleKeyDown(event.code);
    event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    if (!viewer || !flyKeys.has(event.code)) return;
    viewer.handleKeyUp(event.code);
    event.preventDefault();
  });
  window.addEventListener("blur", () => viewer?.clearKeys());
  window.addEventListener("resize", () => viewer?.resize());
}

try {
  viewer = new Level3DViewer(canvas, { onInspect: renderInspector });
  connectControls();
  const requestedFloor = Number(new URL(window.location.href).searchParams.get("floor"));
  const initialFloor = floorById.has(requestedFloor) ? requestedFloor : floors[0]?.id;
  if (initialFloor === undefined) throw new Error("No canonical floors are registered");
  floorSelect.value = String(initialFloor);
  void loadSelectedFloor(initialFloor);
  const frame = (now: number): void => {
    viewer?.update(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} catch (error) {
  viewportError.textContent = `The 3D viewer could not start.\n\n${errorText(error)}`;
  viewportError.hidden = false;
  loadingStatus.hidden = true;
}
