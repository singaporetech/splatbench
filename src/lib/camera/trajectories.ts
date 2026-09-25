import * as THREE from 'three';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TrajectoryType = 'orbit' | 'dolly' | 'pan' | 'seeded' | 'custom';

export interface TrajectoryConfig {
  type: TrajectoryType;
  frameCount: number;
  durationSeconds: number;
  center: { x: number; y: number; z: number };
  startDistance: number;
}

export interface OrbitConfig extends TrajectoryConfig {
  type: 'orbit';
  /** Azimuthal arc in degrees */
  arcDegrees: number;
  elevationDegrees: number;
  startAzimuthDegrees: number;
}

export interface DollyConfig extends TrajectoryConfig {
  type: 'dolly';
  endDistance: number;
}

export interface PanConfig extends TrajectoryConfig {
  type: 'pan';
  /** Lateral sweep distance in scene units, split evenly left/right */
  sweepDistance: number;
  heightOffset: number;
}

export interface SeededConfig extends TrajectoryConfig {
  type: 'seeded';
  // the same seed and app version always give the same keyframes
  seed: number;
  waypointCount: number;
  // sampled radius band, as fractions of startDistance
  minDistanceFactor: number;
  maxDistanceFactor: number;
}

export interface CustomPoint {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export interface CustomConfig extends TrajectoryConfig {
  type: 'custom';
  name: string;
  points: CustomPoint[];
}

export interface TrajectoryKeyframe {
  frameIndex: number;
  t: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface TrajectoryResult {
  config: TrajectoryConfig;
  keyframes: TrajectoryKeyframe[];
  description: string;
}

// ─── Default Configurations ──────────────────────────────────────────────────

export const DEFAULT_ORBIT_CONFIG: OrbitConfig = {
  type: 'orbit',
  frameCount: 60,
  durationSeconds: 2,
  center: { x: 0, y: 0, z: 0 },
  startDistance: 5,
  arcDegrees: 90,
  elevationDegrees: 15,
  startAzimuthDegrees: 0,
};

export const DEFAULT_DOLLY_CONFIG: DollyConfig = {
  type: 'dolly',
  frameCount: 60,
  durationSeconds: 2,
  center: { x: 0, y: 0, z: 0 },
  startDistance: 6,
  endDistance: 2,
};

export const DEFAULT_PAN_CONFIG: PanConfig = {
  type: 'pan',
  frameCount: 60,
  durationSeconds: 2,
  center: { x: 0, y: 0, z: 0 },
  startDistance: 5,
  sweepDistance: 4,
  heightOffset: 0,
};

export const DEFAULT_SEEDED_CONFIG: SeededConfig = {
  type: 'seeded',
  frameCount: 60,
  durationSeconds: 2,
  center: { x: 0, y: 0, z: 0 },
  startDistance: 5,
  seed: 42,
  waypointCount: 6,
  minDistanceFactor: 0.6,
  maxDistanceFactor: 1.4,
};

// ─── Seeded PRNG ─────────────────────────────────────────────────────────────

/**
 * Mulberry32, a small deterministic 32-bit PRNG returning values in [0, 1).
 * Trajectories never use Math.random, so a seed reproduces the same camera
 * path on any machine and browser.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Trajectory Generators ───────────────────────────────────────────────────

/**
 * Camera sweeps azimuthally around the scene center at fixed elevation and distance
 */
export function generateOrbitTrajectory(config: OrbitConfig): TrajectoryResult {
  const keyframes: TrajectoryKeyframe[] = [];
  const center = new THREE.Vector3(config.center.x, config.center.y, config.center.z);
  const elevationRad = THREE.MathUtils.degToRad(config.elevationDegrees);
  const startAzimuthRad = THREE.MathUtils.degToRad(config.startAzimuthDegrees);
  const arcRad = THREE.MathUtils.degToRad(config.arcDegrees);

  for (let i = 0; i < config.frameCount; i++) {
    const t = config.frameCount > 1 ? i / (config.frameCount - 1) : 0;
    const azimuth = startAzimuthRad + t * arcRad;

    const x = config.startDistance * Math.cos(elevationRad) * Math.sin(azimuth);
    const y = config.startDistance * Math.sin(elevationRad);
    const z = config.startDistance * Math.cos(elevationRad) * Math.cos(azimuth);

    keyframes.push({
      frameIndex: i,
      t,
      position: new THREE.Vector3(
        center.x + x,
        center.y + y,
        center.z + z,
      ),
      target: center.clone(),
    });
  }

  return {
    config,
    keyframes,
    description: `Orbit: ${config.arcDegrees} deg arc, ${config.elevationDegrees} deg elevation, ${config.startDistance} units radius, ${config.frameCount} frames`,
  };
}

/**
 * Camera moves along the view axis toward or away from the scene center
 */
export function generateDollyTrajectory(config: DollyConfig): TrajectoryResult {
  const keyframes: TrajectoryKeyframe[] = [];
  const center = new THREE.Vector3(config.center.x, config.center.y, config.center.z);

  for (let i = 0; i < config.frameCount; i++) {
    const t = config.frameCount > 1 ? i / (config.frameCount - 1) : 0;
    // cosine interpolation gives a smooth ease-in-out
    const smoothT = 0.5 * (1 - Math.cos(Math.PI * t));
    const distance = config.startDistance + (config.endDistance - config.startDistance) * smoothT;

    keyframes.push({
      frameIndex: i,
      t,
      position: new THREE.Vector3(center.x, center.y, center.z + distance),
      target: center.clone(),
    });
  }

  return {
    config,
    keyframes,
    description: `Dolly: ${config.startDistance} to ${config.endDistance} units, ${config.frameCount} frames`,
  };
}

/**
 * Camera sweeps laterally at a fixed distance while looking at the scene center
 */
export function generatePanTrajectory(config: PanConfig): TrajectoryResult {
  const keyframes: TrajectoryKeyframe[] = [];
  const center = new THREE.Vector3(config.center.x, config.center.y, config.center.z);
  const halfSweep = config.sweepDistance / 2;

  for (let i = 0; i < config.frameCount; i++) {
    const t = config.frameCount > 1 ? i / (config.frameCount - 1) : 0;
    // cosine interpolation gives a smooth lateral sweep
    const smoothT = 0.5 * (1 - Math.cos(Math.PI * t));
    const lateral = -halfSweep + smoothT * config.sweepDistance;

    keyframes.push({
      frameIndex: i,
      t,
      position: new THREE.Vector3(
        center.x + lateral,
        center.y + config.heightOffset,
        center.z + config.startDistance,
      ),
      target: center.clone(),
    });
  }

  return {
    config,
    keyframes,
    description: `Pan: ${config.sweepDistance} units sweep, ${config.startDistance} units depth, ${config.frameCount} frames`,
  };
}

/**
 * Camera follows a smooth open path through seeded pseudo-random waypoints.
 *
 * The draw order is part of the exported behaviour. Each waypoint consumes
 * exactly three draws, in this order:
 *   1. azimuth          uniform in [0, 2*pi)
 *   2. elevation        uniform in [-15 deg, +45 deg]
 *   3. distance factor  uniform in [minDistanceFactor, maxDistanceFactor]
 * Reordering, adding or removing a draw changes every path for a given seed.
 */
export function generateSeededTrajectory(config: SeededConfig): TrajectoryResult {
  if (config.waypointCount < 2) {
    throw new Error('Seeded trajectory needs at least 2 waypoints');
  }
  if (config.frameCount < 1) {
    throw new Error('Seeded trajectory needs at least 1 frame');
  }

  const center = new THREE.Vector3(config.center.x, config.center.y, config.center.z);
  const random = mulberry32(config.seed);

  const minElevationRad = THREE.MathUtils.degToRad(-15);
  const maxElevationRad = THREE.MathUtils.degToRad(45);

  const waypoints: THREE.Vector3[] = [];
  for (let i = 0; i < config.waypointCount; i++) {
    const azimuth = random() * Math.PI * 2;
    const elevation = minElevationRad + random() * (maxElevationRad - minElevationRad);
    const distance =
      config.startDistance *
      (config.minDistanceFactor +
        random() * (config.maxDistanceFactor - config.minDistanceFactor));

    waypoints.push(
      new THREE.Vector3(
        center.x + distance * Math.cos(elevation) * Math.sin(azimuth),
        center.y + distance * Math.sin(elevation),
        center.z + distance * Math.cos(elevation) * Math.cos(azimuth),
      ),
    );
  }

  const curve = new THREE.CatmullRomCurve3(waypoints, false, 'centripetal');

  // centripetal Catmull-Rom can overshoot between knots, so sampled radii are
  // clamped back into the configured band along the ray from the center
  const minRadius = config.startDistance * config.minDistanceFactor;
  const maxRadius = config.startDistance * config.maxDistanceFactor;

  const keyframes: TrajectoryKeyframe[] = [];
  for (let i = 0; i < config.frameCount; i++) {
    const t = config.frameCount > 1 ? i / (config.frameCount - 1) : 0;
    const point = curve.getPoint(t);

    const offset = point.clone().sub(center);
    const radius = offset.length();
    if (radius > 0) {
      const clamped = Math.min(Math.max(radius, minRadius), maxRadius);
      if (clamped !== radius) {
        offset.multiplyScalar(clamped / radius);
      }
    }

    keyframes.push({
      frameIndex: i,
      t,
      position: center.clone().add(offset),
      // targeting the center matches how the orbit controls frame the scene
      target: center.clone(),
    });
  }

  return {
    config,
    keyframes,
    description: `Seeded random: seed ${config.seed}, ${config.waypointCount} waypoints, ${config.frameCount} frames`,
  };
}

/**
 * Camera replays a user-supplied path verbatim, one keyframe per point.
 */
export function generateCustomTrajectory(config: CustomConfig): TrajectoryResult {
  if (config.points.length < 2) {
    throw new Error('Custom trajectory needs at least 2 points');
  }

  const total = config.points.length;
  const keyframes: TrajectoryKeyframe[] = config.points.map((point, i) => ({
    frameIndex: i,
    t: total > 1 ? i / (total - 1) : 0,
    position: new THREE.Vector3(point.position.x, point.position.y, point.position.z),
    target: new THREE.Vector3(point.target.x, point.target.y, point.target.z),
  }));

  return {
    config,
    keyframes,
    description: `Custom path "${config.name}": ${total} frames`,
  };
}

export function generateTrajectory(
  config: OrbitConfig | DollyConfig | PanConfig | SeededConfig | CustomConfig
): TrajectoryResult {
  switch (config.type) {
    case 'orbit':
      return generateOrbitTrajectory(config as OrbitConfig);
    case 'dolly':
      return generateDollyTrajectory(config as DollyConfig);
    case 'pan':
      return generatePanTrajectory(config as PanConfig);
    case 'seeded':
      return generateSeededTrajectory(config as SeededConfig);
    case 'custom':
      return generateCustomTrajectory(config as CustomConfig);
  }
}

// ─── Custom Path Parsing ─────────────────────────────────────────────────────

/** Frame-count bounds for a user-supplied path file. */
export const CUSTOM_MIN_FRAMES = 2;
export const CUSTOM_MAX_FRAMES = 600;

function parseVec3(
  value: unknown,
  frameIndex: number,
  field: 'position' | 'target',
): { x: number; y: number; z: number } {
  if (!Array.isArray(value)) {
    throw new Error(`Frame ${frameIndex}: "${field}" must be an array of 3 numbers`);
  }
  if (value.length !== 3) {
    throw new Error(
      `Frame ${frameIndex}: "${field}" must have exactly 3 numbers, got ${value.length}`,
    );
  }
  for (const component of value) {
    if (typeof component !== 'number' || !Number.isFinite(component)) {
      throw new Error(`Frame ${frameIndex}: "${field}" contains a non-finite number`);
    }
  }
  return { x: value[0], y: value[1], z: value[2] };
}

/**
 * Parse and validate a user-supplied camera path file:
 *   { "name": "my-path",
 *     "frames": [ { "position": [x,y,z], "target": [x,y,z] }, ... ] }
 *
 * `target` may be omitted and defaults to the origin. Errors name the first
 * offending frame index.
 */
export function parseCustomTrajectoryJSON(text: string): CustomConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Path file must be a JSON object');
  }

  const root = parsed as Record<string, unknown>;

  if (typeof root.name !== 'string' || root.name.trim().length === 0) {
    throw new Error('Path file needs a non-empty "name" string');
  }

  if (!Array.isArray(root.frames)) {
    throw new Error('Path file needs a "frames" array');
  }

  const frames = root.frames;
  if (frames.length < CUSTOM_MIN_FRAMES || frames.length > CUSTOM_MAX_FRAMES) {
    throw new Error(
      `Path file needs between ${CUSTOM_MIN_FRAMES} and ${CUSTOM_MAX_FRAMES} frames, got ${frames.length}`,
    );
  }

  const points: CustomPoint[] = frames.map((frame, i) => {
    if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) {
      throw new Error(`Frame ${i}: each frame must be an object`);
    }
    const entry = frame as Record<string, unknown>;

    if (entry.position === undefined) {
      throw new Error(`Frame ${i}: missing "position"`);
    }

    return {
      position: parseVec3(entry.position, i, 'position'),
      target:
        entry.target === undefined
          ? { x: 0, y: 0, z: 0 }
          : parseVec3(entry.target, i, 'target'),
    };
  });

  const first = points[0];
  const startDistance = Math.hypot(
    first.position.x - first.target.x,
    first.position.y - first.target.y,
    first.position.z - first.target.z,
  );

  return {
    type: 'custom',
    name: root.name,
    points,
    frameCount: points.length,
    durationSeconds: 2,
    center: { x: 0, y: 0, z: 0 },
    startDistance,
  };
}

// ─── Custom Path Recording ───────────────────────────────────────────────────

/** Decimals kept when a pose is written to a path file. */
const CUSTOM_FILE_PRECISION = 6;

/** Calls per recorded frame; about 15 Hz at 60 fps. */
export const RECORDER_SAMPLE_EVERY = 4;

function roundComponent(value: number): number {
  const scale = 10 ** CUSTOM_FILE_PRECISION;
  return Math.round(value * scale) / scale;
}

/**
 * Write points out in the shape `parseCustomTrajectoryJSON` reads, so a
 * recorded path and a hand-written one are the same kind of file.
 */
export function serializeCustomTrajectory(name: string, points: CustomPoint[]): string {
  return JSON.stringify(
    {
      name,
      frames: points.map(point => ({
        position: [
          roundComponent(point.position.x),
          roundComponent(point.position.y),
          roundComponent(point.position.z),
        ],
        target: [
          roundComponent(point.target.x),
          roundComponent(point.target.y),
          roundComponent(point.target.z),
        ],
      })),
    },
    null,
    2,
  );
}

export interface TrajectoryRecorderOptions {
  /** Record one frame every this many `sample` calls. */
  sampleEvery?: number;
  /** Hard cap on recorded frames, matching what the parser accepts. */
  maxFrames?: number;
}

/**
 * Accumulates camera poses into a replayable custom path. The caller drives it
 * from its own loop; consecutive identical poses are dropped, so a camera left
 * still costs one frame.
 */
export class TrajectoryRecorder {
  private readonly sampleEvery: number;
  private readonly maxFrames: number;
  private callCount = 0;
  private recorded: CustomPoint[] = [];

  constructor(options: TrajectoryRecorderOptions = {}) {
    this.sampleEvery = Math.max(1, Math.floor(options.sampleEvery ?? RECORDER_SAMPLE_EVERY));
    this.maxFrames = Math.max(1, Math.floor(options.maxFrames ?? CUSTOM_MAX_FRAMES));
  }

  /** Recorded frames so far. */
  get frameCount(): number {
    return this.recorded.length;
  }

  /** True once the frame cap is reached and further samples are ignored. */
  get full(): boolean {
    return this.recorded.length >= this.maxFrames;
  }

  /** Copies, so callers cannot mutate the recording. */
  get points(): CustomPoint[] {
    return this.recorded.map(point => ({
      position: { ...point.position },
      target: { ...point.target },
    }));
  }

  sample(
    position: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
  ): void {
    if (this.full) return;

    // the first call records, then every sampleEvery-th call after it
    const tick = this.callCount;
    this.callCount += 1;
    if (tick % this.sampleEvery !== 0) return;

    const last = this.recorded[this.recorded.length - 1];
    if (
      last &&
      last.position.x === position.x &&
      last.position.y === position.y &&
      last.position.z === position.z &&
      last.target.x === target.x &&
      last.target.y === target.y &&
      last.target.z === target.z
    ) {
      return;
    }

    this.recorded.push({
      position: { x: position.x, y: position.y, z: position.z },
      target: { x: target.x, y: target.y, z: target.z },
    });
  }
}

export function applyKeyframe(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  keyframe: TrajectoryKeyframe,
): void {
  camera.position.copy(keyframe.position);
  controls.target.copy(keyframe.target);
  controls.update();
}

export function getTrajectoryPresets(
  sceneCenter: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  sceneRadius: number = 3,
): { orbit: OrbitConfig; dolly: DollyConfig; pan: PanConfig } {
  return {
    orbit: {
      ...DEFAULT_ORBIT_CONFIG,
      center: sceneCenter,
      startDistance: sceneRadius * 1.5,
    },
    dolly: {
      ...DEFAULT_DOLLY_CONFIG,
      center: sceneCenter,
      startDistance: sceneRadius * 2.5,
      endDistance: sceneRadius * 0.8,
    },
    pan: {
      ...DEFAULT_PAN_CONFIG,
      center: sceneCenter,
      startDistance: sceneRadius * 1.5,
      sweepDistance: sceneRadius * 1.5,
    },
  };
}
