import * as THREE from 'three';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TrajectoryType = 'orbit' | 'dolly' | 'pan';

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

export function generateTrajectory(
  config: OrbitConfig | DollyConfig | PanConfig
): TrajectoryResult {
  switch (config.type) {
    case 'orbit':
      return generateOrbitTrajectory(config as OrbitConfig);
    case 'dolly':
      return generateDollyTrajectory(config as DollyConfig);
    case 'pan':
      return generatePanTrajectory(config as PanConfig);
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
