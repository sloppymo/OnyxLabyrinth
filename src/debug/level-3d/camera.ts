import { PerspectiveCamera, Vector3 } from "three";

export type Level3DCameraMode = "orbit" | "fly";

export interface Level3DBounds {
  width: number;
  height: number;
  maxWorldY: number;
}

const UP = new Vector3(0, 1, 0);

/** Camera controller for the standalone level inspection scene. */
export class Level3DCameraController {
  readonly camera: PerspectiveCamera;
  private readonly target = new Vector3();
  private readonly flyForward = new Vector3();
  private readonly flyRight = new Vector3();
  private bounds: Level3DBounds = { width: 16, height: 16, maxWorldY: 1 };
  private mode: Level3DCameraMode = "orbit";
  private distance = 24;
  private azimuth = Math.PI * 0.75;
  private polar = 0.9;
  private flyYaw = 0;
  private flyPitch = 0;
  private flySpeed = 5;

  constructor(aspect = 1) {
    this.camera = new PerspectiveCamera(48, aspect, 0.01, 1000);
    this.camera.rotation.order = "YXZ";
    this.reset(this.bounds);
  }

  get cameraMode(): Level3DCameraMode {
    return this.mode;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = Math.max(0.1, aspect);
    this.camera.updateProjectionMatrix();
  }

  setBounds(bounds: Level3DBounds): void {
    this.bounds = {
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
      maxWorldY: Math.max(0.5, bounds.maxWorldY),
    };
    this.distance = Math.min(
      Math.max(this.distance, this.minimumDistance()),
      this.maximumDistance()
    );
  }

  setMode(mode: Level3DCameraMode): void {
    if (mode === this.mode) return;
    if (mode === "fly") {
      this.syncFlyFromOrbit();
    } else {
      this.syncOrbitFromFly();
    }
    this.mode = mode;
  }

  reset(bounds = this.bounds): void {
    this.setBounds(bounds);
    this.mode = "orbit";
    this.target.set(
      this.bounds.width / 2,
      Math.min(this.bounds.maxWorldY * 0.35, 0.8),
      this.bounds.height / 2
    );
    this.azimuth = Math.PI * 0.72;
    this.polar = 0.86;
    this.distance = Math.min(
      this.maximumDistance(),
      Math.max(this.minimumDistance(), Math.max(this.bounds.width, this.bounds.height) * 1.12)
    );
    this.update(0, new Set());
  }

  topView(): void {
    this.mode = "orbit";
    this.target.set(
      this.bounds.width / 2,
      0,
      this.bounds.height / 2
    );
    this.polar = 0.035;
    this.azimuth = 0;
    this.distance = Math.min(
      this.maximumDistance(),
      Math.max(this.minimumDistance(), Math.hypot(this.bounds.width, this.bounds.height) * 0.92)
    );
    this.update(0, new Set());
  }

  isometricView(): void {
    this.mode = "orbit";
    this.target.set(
      this.bounds.width / 2,
      Math.min(this.bounds.maxWorldY * 0.3, 0.75),
      this.bounds.height / 2
    );
    this.polar = 0.78;
    this.azimuth = Math.PI * 0.72;
    this.distance = Math.min(
      this.maximumDistance(),
      Math.max(this.minimumDistance(), Math.max(this.bounds.width, this.bounds.height) * 1.05)
    );
    this.update(0, new Set());
  }

  orbitRotate(deltaX: number, deltaY: number): void {
    if (this.mode !== "orbit") return;
    this.azimuth -= deltaX * 0.008;
    this.polar = Math.max(0.035, Math.min(Math.PI - 0.035, this.polar + deltaY * 0.008));
    this.update(0, new Set());
  }

  orbitPan(deltaX: number, deltaY: number): void {
    if (this.mode !== "orbit") return;
    const scale = this.distance * 0.0014;
    this.target.x -= (Math.cos(this.azimuth) * deltaX + Math.sin(this.azimuth) * deltaY) * scale;
    this.target.z -= (Math.sin(this.azimuth) * deltaX - Math.cos(this.azimuth) * deltaY) * scale;
    this.update(0, new Set());
  }

  zoom(deltaY: number): void {
    if (this.mode !== "orbit") return;
    this.distance = Math.max(
      this.minimumDistance(),
      Math.min(this.maximumDistance(), this.distance * Math.exp(deltaY * 0.001))
    );
    this.update(0, new Set());
  }

  flyLook(deltaX: number, deltaY: number): void {
    if (this.mode !== "fly") return;
    this.flyYaw -= deltaX * 0.0022;
    this.flyPitch = Math.max(-1.48, Math.min(1.48, this.flyPitch - deltaY * 0.0022));
    this.updateFlyRotation();
  }

  update(deltaSeconds: number, keys: ReadonlySet<string>): void {
    if (this.mode === "fly") {
      this.updateFlyMovement(deltaSeconds, keys);
      this.updateFlyRotation();
      return;
    }
    const sinPolar = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.distance * sinPolar * Math.sin(this.azimuth),
      this.target.y + this.distance * Math.cos(this.polar),
      this.target.z + this.distance * sinPolar * Math.cos(this.azimuth)
    );
    this.camera.lookAt(this.target);
  }

  private updateFlyMovement(deltaSeconds: number, keys: ReadonlySet<string>): void {
    if (deltaSeconds <= 0) return;
    const forward = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
    const strafe = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
    const vertical = Number(keys.has("KeyE")) - Number(keys.has("KeyQ"));
    if (forward === 0 && strafe === 0 && vertical === 0) return;

    this.flyForward.set(Math.sin(this.flyYaw), 0, -Math.cos(this.flyYaw)).normalize();
    this.flyRight.set(Math.cos(this.flyYaw), 0, Math.sin(this.flyYaw)).normalize();
    const movement = new Vector3()
      .addScaledVector(this.flyForward, forward)
      .addScaledVector(this.flyRight, strafe)
      .addScaledVector(UP, vertical);
    if (movement.lengthSq() > 1) movement.normalize();
    this.camera.position.addScaledVector(movement, this.flySpeed * deltaSeconds);
  }

  private updateFlyRotation(): void {
    this.camera.rotation.set(this.flyPitch, this.flyYaw, 0, "YXZ");
  }

  private syncFlyFromOrbit(): void {
    this.update(0, new Set());
    this.flyForward.subVectors(this.target, this.camera.position).normalize();
    this.flyYaw = Math.atan2(this.flyForward.x, -this.flyForward.z);
    this.flyPitch = Math.asin(Math.max(-1, Math.min(1, this.flyForward.y)));
    this.flySpeed = Math.max(2, Math.max(this.bounds.width, this.bounds.height) * 0.32);
  }

  private syncOrbitFromFly(): void {
    this.flyForward.set(
      Math.cos(this.flyPitch) * Math.sin(this.flyYaw),
      Math.sin(this.flyPitch),
      -Math.cos(this.flyPitch) * Math.cos(this.flyYaw)
    ).normalize();
    this.target.copy(this.camera.position).addScaledVector(this.flyForward, Math.max(6, this.distance));
    this.distance = Math.max(this.minimumDistance(), Math.min(this.maximumDistance(), this.distance));
    this.azimuth = Math.atan2(-this.flyForward.x, -this.flyForward.z);
    this.polar = Math.max(0.035, Math.min(Math.PI - 0.035, Math.acos(this.flyForward.y)));
  }

  private minimumDistance(): number {
    return Math.max(2, Math.min(this.bounds.width, this.bounds.height) * 0.2);
  }

  private maximumDistance(): number {
    return Math.max(40, Math.max(this.bounds.width, this.bounds.height) * 4);
  }
}
