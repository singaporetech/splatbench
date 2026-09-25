import * as THREE from 'three';
import { canonicalSceneName } from '../scenes/sceneCatalog';

export interface ViewpointPreset {
  id: string;
  name: string;
  description: string;
  // position relative to scene center, scaled by scene radius
  position: { x: number; y: number; z: number };
  // look-at target, usually scene center
  target: { x: number; y: number; z: number };
  fov?: number;
}

/**
 * Standard 5-viewpoint evaluation protocol
 * Based on experimental procedures documented in EXPERIMENTAL_PROCEDURES.md
 *
 * Positions are in units of the scene radius r, so the distances are
 * close = 1.5r, front = 3.5r, left45 and right45 = sqrt(2) * 2.5r ~ 3.54r, and
 * wide = sqrt(40) * r ~ 6.32r with a 2r elevation.
 */
export const STANDARD_VIEWPOINTS: ViewpointPreset[] = [
  {
    id: 'front',
    name: 'Front Center',
    description: 'Default head-on view at medium distance',
    position: { x: 0, y: 0, z: 3.5 },
    target: { x: 0, y: 0, z: 0 },
  },
  {
    id: 'close',
    name: 'Close-Up Detail',
    description: 'Zoomed in for texture detail inspection',
    position: { x: 0, y: 0, z: 1.5 },
    target: { x: 0, y: 0, z: 0 },
  },
  {
    id: 'wide',
    name: 'Wide Angle',
    description: 'Full scene overview from elevated position',
    position: { x: 0, y: 2, z: 6 },
    target: { x: 0, y: 0, z: 0 },
  },
  {
    id: 'left45',
    name: 'Left 45°',
    description: '45-degree rotation to the left',
    position: { x: -2.5, y: 0, z: 2.5 },
    target: { x: 0, y: 0, z: 0 },
  },
  {
    id: 'right45',
    name: 'Right 45°',
    description: '45-degree rotation to the right',
    position: { x: 2.5, y: 0, z: 2.5 },
    target: { x: 0, y: 0, z: 0 },
  },
];

/**
 * Scene-specific camera configurations
 *
 * `distanceMultiplier` is the scene radius r that every standard viewpoint is
 * scaled by, and the only field that reaches the camera. Changing a value
 * changes that scene's camera_distance column, so results exported before and
 * after the change are no longer comparable. `estimatedRadius` is descriptive
 * only and is not used to place the camera.
 */
export interface SceneCameraConfig {
  sceneId: string;
  distanceMultiplier: number;
  estimatedRadius: number;
  customPresets?: ViewpointPreset[];
}

export const SCENE_CAMERA_CONFIGS: Record<string, SceneCameraConfig> = {
  'bonsai': {
    sceneId: 'bonsai',
    distanceMultiplier: 1.2,
    estimatedRadius: 1.5,
  },
  'garden': {
    sceneId: 'garden',
    distanceMultiplier: 2.0,
    estimatedRadius: 3.0,
  },
  'playroom': {
    sceneId: 'playroom',
    distanceMultiplier: 2.5,
    estimatedRadius: 4.0,
  },
  'truck': {
    sceneId: 'truck',
    distanceMultiplier: 1.8,
    estimatedRadius: 2.5,
  },
  'train': {
    sceneId: 'train',
    distanceMultiplier: 1.6,
    estimatedRadius: 2.2,
  },
  'flower': {
    sceneId: 'flower',
    distanceMultiplier: 0.8,
    estimatedRadius: 0.8,
  },
};

/** Radius used when a scene is neither tabulated nor measurable. */
export const DEFAULT_SCENE_RADIUS = 1.5;

/** Decimal places the estimated radius is rounded to before it is used. */
export const SCENE_RADIUS_PRECISION = 3;

/** Fraction of splats that must fall inside the estimated radius. */
export const SCENE_RADIUS_PERCENTILE = 0.9;

/** Upper bound on splats inspected by the estimator, for cost not accuracy. */
export const SCENE_RADIUS_MAX_SAMPLES = 200_000;

/** Where a scene's radius came from. */
export type SceneRadiusSource = 'table' | 'estimated' | 'default';

export interface ResolvedSceneRadius {
  /** Scene name as the batch spelled it. */
  sceneName: string;
  /** Internal id used for the table lookup (`flowers` resolves to `flower`). */
  canonicalSceneName: string;
  radius: number;
  source: SceneRadiusSource;
}

/** Pinned radius for a scene, or null when the scene is not tabulated. */
export function lookupSceneRadius(sceneName: string): number | null {
  const config = SCENE_CAMERA_CONFIGS[canonicalSceneName(sceneName)];
  return config ? config.distanceMultiplier : null;
}

/**
 * Radius a scene's viewpoints are scaled by: the pinned table value when there
 * is one, otherwise a radius measured from the asset, otherwise
 * DEFAULT_SCENE_RADIUS.
 */
export function resolveSceneRadius(
  sceneName: string,
  estimatedRadius?: number | null,
): ResolvedSceneRadius {
  const canonical = canonicalSceneName(sceneName);
  const tabulated = lookupSceneRadius(canonical);

  if (tabulated !== null) {
    return { sceneName, canonicalSceneName: canonical, radius: tabulated, source: 'table' };
  }

  if (estimatedRadius !== null && estimatedRadius !== undefined && estimatedRadius > 0) {
    return {
      sceneName,
      canonicalSceneName: canonical,
      radius: estimatedRadius,
      source: 'estimated',
    };
  }

  return {
    sceneName,
    canonicalSceneName: canonical,
    radius: DEFAULT_SCENE_RADIUS,
    source: 'default',
  };
}

/** Scale the standard protocol by an explicit scene radius. */
export function getScenePresetsForRadius(radius: number): ViewpointPreset[] {
  return STANDARD_VIEWPOINTS.map(preset => ({
    ...preset,
    position: {
      x: preset.position.x * radius,
      y: preset.position.y * radius,
      z: preset.position.z * radius,
    },
  }));
}

/**
 * Standard viewpoints for a scene.
 *
 * Passing `estimatedRadius` only changes the result for scenes missing from
 * SCENE_CAMERA_CONFIGS; tabulated scenes ignore it.
 */
export function getScenePresets(
  sceneName: string,
  estimatedRadius?: number | null,
): ViewpointPreset[] {
  return getScenePresetsForRadius(resolveSceneRadius(sceneName, estimatedRadius).radius);
}

function roundToPrecision(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * Scene radius from splat centers laid out as x,y,z triples. The sample uses a
 * fixed stride, the center is a per-axis median and the radius a percentile,
 * so stray floaters cannot drag either, and the result is rounded so repeated
 * runs over the same asset place the camera identically. Returns 0 when there
 * is nothing to measure.
 */
export function estimateSceneRadius(
  splatPositions: Float32Array,
  options: { percentile?: number; maxSamples?: number } = {},
): number {
  const percentile = options.percentile ?? SCENE_RADIUS_PERCENTILE;
  const maxSamples = options.maxSamples ?? SCENE_RADIUS_MAX_SAMPLES;

  const count = Math.floor(splatPositions.length / 3);
  if (count === 0) return 0;

  const stride = Math.max(1, Math.ceil(count / maxSamples));
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];

  for (let i = 0; i < count; i += stride) {
    const x = splatPositions[i * 3];
    const y = splatPositions[i * 3 + 1];
    const z = splatPositions[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    xs.push(x);
    ys.push(y);
    zs.push(z);
  }

  if (xs.length === 0) return 0;

  const cx = median(xs);
  const cy = median(ys);
  const cz = median(zs);

  const distances = new Array<number>(xs.length);
  for (let i = 0; i < xs.length; i++) {
    distances[i] = Math.hypot(xs[i] - cx, ys[i] - cy, zs[i] - cz);
  }
  distances.sort((a, b) => a - b);

  const index = Math.min(
    distances.length - 1,
    Math.max(0, Math.floor(percentile * (distances.length - 1))),
  );
  return roundToPrecision(distances[index], SCENE_RADIUS_PRECISION);
}

/** Median of a numeric sample; sorts a copy. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Minimal view of a Spark SplatMesh, so this module stays renderer-agnostic. */
export interface SplatCenterSource {
  forEachSplat(
    callback: (index: number, center: { x: number; y: number; z: number }) => void,
  ): void;
}

/**
 * Strided sample of splat centers from a loaded mesh. `numSplats` only sizes
 * the stride, so an inaccurate count costs accuracy, not correctness.
 */
export function collectSplatCenters(
  source: SplatCenterSource,
  numSplats: number,
  maxSamples: number = SCENE_RADIUS_MAX_SAMPLES,
): Float32Array {
  const stride = numSplats > 0 ? Math.max(1, Math.ceil(numSplats / maxSamples)) : 1;
  const sampled: number[] = [];

  source.forEachSplat((index, center) => {
    if (index % stride !== 0) return;
    sampled.push(center.x, center.y, center.z);
  });

  return Float32Array.from(sampled);
}

/**
 * Radius of a loaded mesh. Sampling happens in `collectSplatCenters`, so the
 * estimator itself must not thin the sample a second time.
 */
export function estimateSceneRadiusFromMesh(
  source: SplatCenterSource,
  numSplats: number,
  maxSamples: number = SCENE_RADIUS_MAX_SAMPLES,
): number {
  const centers = collectSplatCenters(source, numSplats, maxSamples);
  return estimateSceneRadius(centers, { maxSamples: Number.POSITIVE_INFINITY });
}

/**
 * Reset accumulated damping momentum on OrbitControls.
 *
 * When enableDamping is true, OrbitControls stores angular velocity in
 * internal _sphericalDelta and translation velocity in _panOffset. These
 * must be cleared when teleporting the camera to a preset, otherwise the
 * residual momentum causes the view to drift immediately after switching.
 */
export function resetControlsMomentum(controls: any /* OrbitControls */): void {
  // clear rotational momentum; theta is azimuth and phi is polar
  if (controls._sphericalDelta) {
    controls._sphericalDelta.set(0, 0, 0);
  }
  // clear pan momentum
  if (controls._panOffset) {
    controls._panOffset.set(0, 0, 0);
  }
  // clear zoom momentum
  if (controls._scale !== undefined) {
    controls._scale = 1;
  }
}

export function applyCameraPreset(
  camera: THREE.PerspectiveCamera,
  controls: any, // OrbitControls
  preset: ViewpointPreset
): void {
  // clear damping momentum before applying a new pose
  resetControlsMomentum(controls);

  camera.position.set(
    preset.position.x,
    preset.position.y,
    preset.position.z
  );
  controls.target.set(
    preset.target.x,
    preset.target.y,
    preset.target.z
  );
  
  if (preset.fov) {
    camera.fov = preset.fov;
    camera.updateProjectionMatrix();
  }
  
  controls.update();
}

export function captureCurrentView(
  camera: THREE.PerspectiveCamera,
  controls: any
): ViewpointPreset {
  return {
    id: `custom_${Date.now()}`,
    name: 'Custom View',
    description: 'User-defined viewpoint',
    position: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    target: {
      x: controls.target.x,
      y: controls.target.y,
      z: controls.target.z,
    },
    fov: camera.fov,
  };
}

export function getCameraDistance(camera: THREE.PerspectiveCamera): number {
  return camera.position.length();
}

export function formatDistance(distance: number): string {
  return `${distance.toFixed(2)} units`;
}
