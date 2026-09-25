import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENE_RADIUS,
  SCENE_CAMERA_CONFIGS,
  collectSplatCenters,
  estimateSceneRadius,
  estimateSceneRadiusFromMesh,
  getScenePresets,
  getScenePresetsForRadius,
  lookupSceneRadius,
  parseViewpointsJSON,
  resolveSceneRadius,
  serializeViewpoints,
} from './cameraPresets';
import type { ViewpointPreset } from './cameraPresets';

/** Distance of a preset from the origin, matching the CSV's camera_distance. */
function distanceOf(presets: ReturnType<typeof getScenePresets>, viewpointId: string): number {
  const preset = presets.find((p) => p.id === viewpointId);
  if (!preset) throw new Error(`no preset ${viewpointId}`);
  return Math.hypot(preset.position.x, preset.position.y, preset.position.z);
}

/**
 * camera_distance values the pinned scenes export, rounded to 2 dp as the
 * exporter writes them. Changing any of them breaks comparability with
 * previously exported results.
 */
const PINNED_DISTANCES: Record<string, Record<string, string>> = {
  bonsai: { close: '1.80', front: '4.20', left45: '4.24', right45: '4.24', wide: '7.59' },
  flower: { close: '1.20', front: '2.80', left45: '2.83', right45: '2.83', wide: '5.06' },
  garden: { close: '3.00', front: '7.00', left45: '7.07', right45: '7.07', wide: '12.65' },
  playroom: { close: '3.75', front: '8.75', left45: '8.84', right45: '8.84', wide: '15.81' },
  train: { close: '2.40', front: '5.60', left45: '5.66', right45: '5.66', wide: '10.12' },
  truck: { close: '2.70', front: '6.30', left45: '6.36', right45: '6.36', wide: '11.38' },
};

/** Splat centers on a sphere of a known radius, offset to a known center. */
function sphereShell(
  count: number,
  radius: number,
  center: [number, number, number] = [0, 0, 0],
): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // deterministic Fibonacci-ish spiral, no randomness
    const y = 1 - (2 * i) / Math.max(1, count - 1);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * 2.399963229728653;
    positions[i * 3] = center[0] + radius * r * Math.cos(theta);
    positions[i * 3 + 1] = center[1] + radius * y;
    positions[i * 3 + 2] = center[2] + radius * r * Math.sin(theta);
  }
  return positions;
}

describe('pinned scene camera distances', () => {
  it.each(Object.keys(PINNED_DISTANCES))('reproduces %s exactly', (scene) => {
    const presets = getScenePresets(scene);
    for (const [viewpoint, expected] of Object.entries(PINNED_DISTANCES[scene])) {
      expect(distanceOf(presets, viewpoint).toFixed(2)).toBe(expected);
    }
  });

  it('reads the same radius under the "flowers" spelling', () => {
    expect(lookupSceneRadius('flowers')).toBe(lookupSceneRadius('flower'));
    expect(getScenePresets('flowers')).toEqual(getScenePresets('flower'));
  });

  it('ignores a measured radius for scenes the table pins', () => {
    const measured = getScenePresets('bonsai', 42);
    expect(distanceOf(measured, 'front').toFixed(2)).toBe('4.20');
    expect(resolveSceneRadius('bonsai', 42).source).toBe('table');
    expect(resolveSceneRadius('flowers', 42).radius).toBe(
      SCENE_CAMERA_CONFIGS.flower.distanceMultiplier,
    );
  });
});

describe('resolveSceneRadius for unknown scenes', () => {
  const unknownScenes = [
    'bicycle',
    'counter',
    'drjohnson',
    'kitchen',
    'room',
    'stump',
    'treehill',
  ];

  it.each(unknownScenes)('%s has no pinned radius', (scene) => {
    expect(lookupSceneRadius(scene)).toBeNull();
  });

  it.each(unknownScenes)('%s falls back to the default without a measurement', (scene) => {
    const resolved = resolveSceneRadius(scene);
    expect(resolved.radius).toBe(DEFAULT_SCENE_RADIUS);
    expect(resolved.source).toBe('default');
  });

  it.each(unknownScenes)('%s uses the measured radius when one is available', (scene) => {
    const resolved = resolveSceneRadius(scene, 2.75);
    expect(resolved.radius).toBe(2.75);
    expect(resolved.source).toBe('estimated');
  });

  it('rejects a non-positive or absent measurement', () => {
    for (const bad of [0, -1, null, undefined, Number.NaN]) {
      const resolved = resolveSceneRadius('bicycle', bad as number | null | undefined);
      expect(resolved.radius).toBe(DEFAULT_SCENE_RADIUS);
      expect(resolved.source).toBe('default');
    }
  });

  it('scales the whole protocol by the measured radius', () => {
    const presets = getScenePresets('bicycle', 2);
    expect(distanceOf(presets, 'close')).toBeCloseTo(1.5 * 2, 10);
    expect(distanceOf(presets, 'front')).toBeCloseTo(3.5 * 2, 10);
    expect(distanceOf(presets, 'left45')).toBeCloseTo(Math.hypot(2.5, 2.5) * 2, 10);
    expect(distanceOf(presets, 'right45')).toBeCloseTo(Math.hypot(2.5, 2.5) * 2, 10);
    expect(distanceOf(presets, 'wide')).toBeCloseTo(Math.hypot(2, 6) * 2, 10);
  });

  it('keeps the five protocol viewpoints and their targets', () => {
    const presets = getScenePresets('treehill', 3.1);
    expect(presets.map((p) => p.id)).toEqual(['front', 'close', 'wide', 'left45', 'right45']);
    for (const preset of presets) {
      expect(preset.target).toEqual({ x: 0, y: 0, z: 0 });
    }
  });
});

describe('estimateSceneRadius', () => {
  it('recovers the radius of a centered shell', () => {
    expect(estimateSceneRadius(sphereShell(5000, 4))).toBeCloseTo(4, 2);
  });

  it('is robust to an off-origin scene center', () => {
    expect(estimateSceneRadius(sphereShell(5000, 4, [100, -50, 25]))).toBeCloseTo(4, 2);
  });

  it('is not dragged out by a handful of floaters', () => {
    const shell = sphereShell(5000, 4);
    const withFloaters = new Float32Array(shell.length + 30);
    withFloaters.set(shell);
    for (let i = 0; i < 10; i++) {
      withFloaters[shell.length + i * 3] = 10_000;
      withFloaters[shell.length + i * 3 + 1] = 10_000;
      withFloaters[shell.length + i * 3 + 2] = 10_000;
    }
    // a max-distance estimator would report about 17,320 here
    expect(estimateSceneRadius(withFloaters)).toBeCloseTo(4, 1);
  });

  it('is deterministic across repeated calls and across copies of the input', () => {
    const positions = sphereShell(20_000, 2.5, [1, 2, 3]);
    const first = estimateSceneRadius(positions);
    for (let i = 0; i < 5; i++) {
      expect(estimateSceneRadius(positions)).toBe(first);
    }
    expect(estimateSceneRadius(Float32Array.from(positions))).toBe(first);
  });

  it('rounds to a fixed precision so float noise cannot move the camera', () => {
    const radius = estimateSceneRadius(sphereShell(1000, Math.PI));
    expect(radius).toBe(Number(radius.toFixed(3)));
  });

  it('skips non-finite splats rather than poisoning the estimate', () => {
    const shell = sphereShell(1000, 4);
    const withNaN = new Float32Array(shell.length + 6);
    withNaN.set(shell);
    withNaN[shell.length] = Number.NaN;
    withNaN[shell.length + 4] = Number.POSITIVE_INFINITY;
    expect(estimateSceneRadius(withNaN)).toBeCloseTo(4, 2);
  });

  it('reports no estimate for an empty scene', () => {
    expect(estimateSceneRadius(new Float32Array(0))).toBe(0);
  });
});

describe('estimateSceneRadiusFromMesh', () => {
  /** Stand-in for a Spark SplatMesh: enumerates centers in a fixed order. */
  function meshOf(positions: Float32Array) {
    const numSplats = positions.length / 3;
    return {
      numSplats,
      forEachSplat(callback: (i: number, c: { x: number; y: number; z: number }) => void) {
        for (let i = 0; i < numSplats; i++) {
          callback(i, {
            x: positions[i * 3],
            y: positions[i * 3 + 1],
            z: positions[i * 3 + 2],
          });
        }
      },
    };
  }

  it('matches the array estimator on the same data', () => {
    const positions = sphereShell(3000, 1.75, [-2, 4, 0]);
    const mesh = meshOf(positions);
    expect(estimateSceneRadiusFromMesh(mesh, mesh.numSplats)).toBe(
      estimateSceneRadius(positions),
    );
  });

  it('thins large meshes on a fixed stride, not at random', () => {
    const positions = sphereShell(4000, 3);
    const mesh = meshOf(positions);

    const centers = collectSplatCenters(mesh, mesh.numSplats, 100);
    expect(centers.length / 3).toBe(Math.ceil(4000 / 40));
    expect(centers).toEqual(collectSplatCenters(mesh, mesh.numSplats, 100));

    const radius = estimateSceneRadiusFromMesh(mesh, mesh.numSplats, 100);
    expect(estimateSceneRadiusFromMesh(mesh, mesh.numSplats, 100)).toBe(radius);
    expect(radius).toBeCloseTo(3, 1);
  });

  it('drives both viewers of an unknown scene from one shared radius', () => {
    const mesh = meshOf(sphereShell(3000, 2.25));
    const radius = estimateSceneRadiusFromMesh(mesh, mesh.numSplats);

    // a batch resolves the radius once and hands the same presets to both
    // viewers, so their poses are identical by construction
    const shared = getScenePresetsForRadius(resolveSceneRadius('stump', radius).radius);
    expect(shared).toEqual(getScenePresets('stump', radius));
    expect(distanceOf(shared, 'front')).toBeCloseTo(3.5 * radius, 10);
  });
});

describe('viewpoint files', () => {
  const saved: ViewpointPreset[] = [
    {
      id: 'custom_a',
      name: 'Custom 1',
      description: 'Saved from the current camera pose',
      position: { x: 1.5, y: -2.25, z: 3.125 },
      target: { x: 0, y: 0.5, z: 0 },
      fov: 50,
    },
    {
      id: 'custom_b',
      name: 'Custom 2',
      description: 'Saved from the current camera pose',
      position: { x: -4, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
    },
  ];

  it('round-trips poses and fov through serialize and parse', () => {
    const parsed = parseViewpointsJSON(serializeViewpoints('garden', saved));

    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('Custom 1');
    expect(parsed[0].position).toEqual(saved[0].position);
    expect(parsed[0].target).toEqual(saved[0].target);
    expect(parsed[0].fov).toBe(50);
    expect(parsed[1].position).toEqual(saved[1].position);
    expect(parsed[1].fov).toBeUndefined();
  });

  it('omits fov rather than writing a null', () => {
    const written = JSON.parse(serializeViewpoints('garden', saved));

    expect(written.name).toBe('garden');
    expect(written.viewpoints[0]).toEqual({
      name: 'Custom 1',
      position: [1.5, -2.25, 3.125],
      target: [0, 0.5, 0],
      fov: 50,
    });
    expect('fov' in written.viewpoints[1]).toBe(false);
  });

  it('mints a fresh unique id for every imported viewpoint', () => {
    const parsed = parseViewpointsJSON(serializeViewpoints('garden', saved));
    const again = parseViewpointsJSON(serializeViewpoints('garden', saved));
    const ids = [...parsed, ...again].map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
    // an imported viewpoint never claims the id it was exported under
    expect(ids).not.toContain('custom_a');
  });

  it('defaults an omitted target to the origin', () => {
    const parsed = parseViewpointsJSON(
      JSON.stringify({ name: 'x', viewpoints: [{ name: 'v', position: [1, 0, 0] }] }),
    );

    expect(parsed[0].target).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('rejects non-JSON input', () => {
    expect(() => parseViewpointsJSON('not json')).toThrow('Not valid JSON');
  });

  it('rejects a top-level array', () => {
    expect(() => parseViewpointsJSON('[]')).toThrow('Viewpoint file must be a JSON object');
  });

  it('rejects a missing name', () => {
    expect(() => parseViewpointsJSON(JSON.stringify({ viewpoints: [] }))).toThrow(
      'Viewpoint file needs a non-empty "name" string',
    );
  });

  it('rejects a missing viewpoints array', () => {
    expect(() => parseViewpointsJSON(JSON.stringify({ name: 'x' }))).toThrow(
      'Viewpoint file needs a "viewpoints" array',
    );
  });

  it('rejects an empty viewpoints array', () => {
    expect(() => parseViewpointsJSON(JSON.stringify({ name: 'x', viewpoints: [] }))).toThrow(
      'Viewpoint file needs between 1 and 50 viewpoints, got 0',
    );
  });

  it('rejects 51 viewpoints', () => {
    const viewpoints = Array.from({ length: 51 }, (_, i) => ({
      name: `v${i}`,
      position: [0, 0, i],
    }));

    expect(() => parseViewpointsJSON(JSON.stringify({ name: 'x', viewpoints }))).toThrow(
      'Viewpoint file needs between 1 and 50 viewpoints, got 51',
    );
  });

  it('names the offending viewpoint index for a missing position', () => {
    expect(() =>
      parseViewpointsJSON(
        JSON.stringify({
          name: 'x',
          viewpoints: [{ name: 'a', position: [0, 0, 0] }, { name: 'b' }],
        }),
      ),
    ).toThrow('Viewpoint 1: missing "position"');
  });

  it('names the offending viewpoint index for a malformed position', () => {
    expect(() =>
      parseViewpointsJSON(
        JSON.stringify({
          name: 'x',
          viewpoints: [{ name: 'a', position: [0, 0, 0] }, { name: 'b', position: [1, 2] }],
        }),
      ),
    ).toThrow('Viewpoint 1: "position" must have exactly 3 numbers, got 2');
  });

  it('names the offending viewpoint index for a non-array position', () => {
    expect(() =>
      parseViewpointsJSON(
        JSON.stringify({ name: 'x', viewpoints: [{ name: 'a', position: 'nope' }] }),
      ),
    ).toThrow('Viewpoint 0: "position" must be an array of 3 numbers');
  });

  it('names the offending viewpoint index for a non-finite number', () => {
    expect(() =>
      parseViewpointsJSON(
        JSON.stringify({
          name: 'x',
          viewpoints: [{ name: 'a', position: [0, 0, 0], target: [0, null, 0] }],
        }),
      ),
    ).toThrow('Viewpoint 0: "target" contains a non-finite number');
  });

  it('names the offending viewpoint index for a missing name', () => {
    expect(() =>
      parseViewpointsJSON(JSON.stringify({ name: 'x', viewpoints: [{ position: [0, 0, 0] }] })),
    ).toThrow('Viewpoint 0: needs a non-empty "name" string');
  });

  it('rejects an out-of-range fov', () => {
    expect(() =>
      parseViewpointsJSON(
        JSON.stringify({
          name: 'x',
          viewpoints: [{ name: 'a', position: [0, 0, 0], fov: 180 }],
        }),
      ),
    ).toThrow('Viewpoint 0: "fov" must be between 0 and 180 degrees');
  });

  it('rejects a non-numeric fov', () => {
    expect(() =>
      parseViewpointsJSON(
        JSON.stringify({
          name: 'x',
          viewpoints: [{ name: 'a', position: [0, 0, 0], fov: '50' }],
        }),
      ),
    ).toThrow('Viewpoint 0: "fov" must be a number');
  });
});
