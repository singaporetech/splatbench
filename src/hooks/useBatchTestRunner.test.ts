import { describe, expect, it } from 'vitest';
import {
  createBenchmarkRunPlans,
  measureSceneRadius,
  parseBenchmarkPairName,
} from './useBatchTestRunner';
import type { TestScene } from '../lib/testing/types';
import { estimateSceneRadius, getScenePresets } from '../lib/camera/cameraPresets';

describe('useBatchTestRunner benchmark protocol helpers', () => {
  it('parses canonical benchmark pair names', () => {
    expect(parseBenchmarkPairName('bonsai-ksplat')).toEqual({
      sceneName: 'bonsai',
      testFormat: 'ksplat',
    });
    expect(parseBenchmarkPairName('truck-spz')).toEqual({
      sceneName: 'truck',
      testFormat: 'spz',
    });
    expect(parseBenchmarkPairName('garden-sog')).toEqual({
      sceneName: 'garden',
      testFormat: 'sog',
    });
  });

  it('accepts the full four-format benchmark matrix', () => {
    const scenes = ['bonsai', 'flower', 'garden', 'playroom', 'train', 'truck'];
    const formats = ['splat', 'ksplat', 'spz', 'sog'];

    const plans = scenes.flatMap((scene) =>
      formats.flatMap((format) => createBenchmarkRunPlans(`${scene}-${format}`) ?? []),
    );

    // 6 scenes x 4 formats x 5 viewpoints x 3 replicates x 4 tests = 1,440 CSV rows
    expect(plans).toHaveLength(6 * 4 * 5 * 3);
    expect(new Set(plans.map((plan) => plan.testFormat))).toEqual(new Set(formats));
  });

  it('creates 5 viewpoints x 3 replicates for benchmark pairs', () => {
    const plans = createBenchmarkRunPlans('bonsai-splat');

    expect(plans).not.toBeNull();
    expect(plans).toHaveLength(15);
    expect(plans?.slice(0, 3).map((plan) => `${plan.viewpointId}-r${plan.replicate}`)).toEqual([
      'front-r1',
      'front-r2',
      'front-r3',
    ]);
    expect(plans?.slice(-3).map((plan) => `${plan.viewpointId}-r${plan.replicate}`)).toEqual([
      'right45-r1',
      'right45-r2',
      'right45-r3',
    ]);
  });

  it('rejects non-benchmark pair names', () => {
    expect(parseBenchmarkPairName('bonsai')).toBeNull();
    expect(parseBenchmarkPairName('bonsai-ply')).toBeNull();
    expect(parseBenchmarkPairName('custom-scene-splat')).toBeNull();
  });
});

describe('scenes outside the six pinned scenes', () => {
  const inriaScenes = [
    'bicycle',
    'counter',
    'drjohnson',
    'kitchen',
    'room',
    'stump',
    'treehill',
  ];

  it.each(inriaScenes)('parses %s as a benchmark pair', (scene) => {
    expect(parseBenchmarkPairName(`${scene}-sog`)).toEqual({
      sceneName: scene,
      testFormat: 'sog',
    });
  });

  it.each(inriaScenes)('expands %s into the full viewpoint matrix', (scene) => {
    const plans = createBenchmarkRunPlans(`${scene}-splat`);
    expect(plans).toHaveLength(15);
    expect(new Set(plans?.map((plan) => plan.viewpointId))).toEqual(
      new Set(['front', 'close', 'wide', 'left45', 'right45']),
    );
    expect(new Set(plans?.map((plan) => plan.sceneName))).toEqual(new Set([scene]));
  });

  it('accepts the "flowers" spelling', () => {
    expect(parseBenchmarkPairName('flowers-sog')).toEqual({
      sceneName: 'flowers',
      testFormat: 'sog',
    });

    // same camera as `flower`
    const flowers = createBenchmarkRunPlans('flowers-splat')!;
    const flower = createBenchmarkRunPlans('flower-splat')!;
    expect(flowers.map((plan) => plan.preset)).toEqual(flower.map((plan) => plan.preset));
  });

  it('places an unknown scene at the measured radius', () => {
    const plans = createBenchmarkRunPlans('bicycle-splat', 3.2)!;
    const front = plans.find((plan) => plan.viewpointId === 'front')!.preset;
    expect(Math.hypot(front.position.x, front.position.y, front.position.z)).toBeCloseTo(
      3.5 * 3.2,
      10,
    );
  });

  it('gives every viewpoint and replicate of a pair the same radius', () => {
    const plans = createBenchmarkRunPlans('treehill-spz', 2.4)!;
    const expected = getScenePresets('treehill', 2.4);

    for (const plan of plans) {
      const preset = expected.find((p) => p.id === plan.viewpointId)!;
      expect(plan.preset.position).toEqual(preset.position);
    }
  });

  it('is deterministic: the same pair and radius produce identical plans', () => {
    expect(createBenchmarkRunPlans('stump-sog', 1.875)).toEqual(
      createBenchmarkRunPlans('stump-sog', 1.875),
    );
  });

  it('keeps the six pinned scenes on their radius even when a measurement is passed', () => {
    for (const scene of ['bonsai', 'flower', 'flowers', 'garden', 'playroom', 'train', 'truck']) {
      expect(createBenchmarkRunPlans(`${scene}-splat`, 99)).toEqual(
        createBenchmarkRunPlans(`${scene}-splat`),
      );
    }
  });
});

describe('measureSceneRadius', () => {
  function fakeViewer(positions: Float32Array | null) {
    const numSplats = positions ? positions.length / 3 : 0;
    const splatMesh = positions
      ? {
          packedSplats: { numSplats },
          forEachSplat(cb: (i: number, c: { x: number; y: number; z: number }) => void) {
            for (let i = 0; i < numSplats; i++) {
              cb(i, {
                x: positions[i * 3],
                y: positions[i * 3 + 1],
                z: positions[i * 3 + 2],
              });
            }
          },
        }
      : null;
    return { splatMesh } as unknown as TestScene['primary'];
  }

  /** Deterministic cube of splat centers with a known extent. */
  function cube(side: number, steps: number): Float32Array {
    const positions = new Float32Array(steps * steps * steps * 3);
    let w = 0;
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        for (let k = 0; k < steps; k++) {
          positions[w++] = (i / (steps - 1) - 0.5) * side;
          positions[w++] = (j / (steps - 1) - 0.5) * side;
          positions[w++] = (k / (steps - 1) - 0.5) * side;
        }
      }
    }
    return positions;
  }

  it('returns null for scenes with a pinned radius', () => {
    const scene: TestScene = {
      primary: fakeViewer(cube(4, 12)),
      reference: fakeViewer(cube(4, 12)),
    };
    for (const name of ['bonsai', 'flower', 'flowers', 'garden', 'playroom', 'train', 'truck']) {
      expect(measureSceneRadius(scene, name)).toBeNull();
    }
  });

  it('measures the reference viewer, not the asset under test', () => {
    const referencePositions = cube(4, 12);
    const scene: TestScene = {
      // a degenerate test asset must not pull the camera in
      primary: fakeViewer(cube(0.1, 12)),
      reference: fakeViewer(referencePositions),
    };

    expect(measureSceneRadius(scene, 'bicycle')).toBe(estimateSceneRadius(referencePositions));
  });

  it('is deterministic across repeated measurements of the same asset', () => {
    const scene: TestScene = {
      primary: fakeViewer(cube(3, 10)),
      reference: fakeViewer(cube(6, 14)),
    };
    const first = measureSceneRadius(scene, 'kitchen');
    expect(first).not.toBeNull();
    for (let i = 0; i < 5; i++) {
      expect(measureSceneRadius(scene, 'kitchen')).toBe(first);
    }
  });

  it('falls back to the primary viewer when there is no reference', () => {
    const positions = cube(5, 12);
    const scene: TestScene = { primary: fakeViewer(positions), reference: null };
    expect(measureSceneRadius(scene, 'room')).toBe(estimateSceneRadius(positions));
  });

  it('reports no measurement when nothing is loaded', () => {
    const scene: TestScene = { primary: fakeViewer(null), reference: null };
    expect(measureSceneRadius(scene, 'counter')).toBeNull();
  });

  it('reports no measurement rather than throwing when a mesh will not enumerate', () => {
    const broken = {
      splatMesh: {
        packedSplats: { numSplats: 10 },
        forEachSplat() {
          throw new Error('mesh disposed');
        },
      },
    } as unknown as TestScene['primary'];

    expect(measureSceneRadius({ primary: broken, reference: null }, 'stump')).toBeNull();
  });
});
