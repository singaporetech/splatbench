import { afterEach, describe, expect, it } from 'vitest';
import {
  SEEDED_SWEEP_REPLICATE,
  SEEDED_SWEEP_TEST_ID,
  SEEDED_SWEEP_VIEWPOINT_ID,
  computeExpectedBenchmarkRows,
  createBenchmarkRunPlans,
  createSeededSweepRuns,
  measureSceneRadius,
  parseBenchmarkPairName,
  runSeededSweep,
  type BenchmarkRunPlan,
  type SeededSweepRun,
} from './useBatchTestRunner';
import type { Test, TestResult, TestScene } from '../lib/testing/types';
import { estimateSceneRadius, getScenePresets } from '../lib/camera/cameraPresets';
import { getBatchTests, getTest } from '../lib/testing/registry';
import { getSeed, resetSeed, setSeed } from '../lib/testing/trajectorySettings';
import { exportBenchmarkBatchResultsToCSV, type BenchmarkRuntimeInfo } from '../lib/export/benchmarkCsvExport';

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

const fakeScene = { primary: {}, reference: null } as unknown as TestScene;

const runtimeInfo: BenchmarkRuntimeInfo = {
  browserName: 'Chrome',
  browserVersion: '147.0',
  browserEngine: 'Blink',
  gpuRenderer: 'ANGLE Test GPU',
  webglVersion: 'WebGL 2.0',
  osPlatform: 'MacIntel',
  screenResolution: '1280x900',
  devicePixelRatio: 1,
};

/**
 * Stands in for the registered seeded test: like the real one, it reads the
 * seed from the settings store when it runs, not when it is built.
 */
function fakeSeededTest(
  overrides: { throwOn?: number; error?: Error } = {},
): Test & { seedsSeen: number[] } {
  const seedsSeen: number[] = [];
  const test = {
    id: SEEDED_SWEEP_TEST_ID,
    name: 'Seeded Random Trajectory',
    description: 'fake',
    category: 'Trajectory',
    seedsSeen,
    run: async (): Promise<TestResult> => {
      const seed = getSeed();
      seedsSeen.push(seed);
      if (overrides.throwOn === seed) {
        throw overrides.error ?? new Error('boom');
      }
      return {
        testId: SEEDED_SWEEP_TEST_ID,
        metrics: { interFrameSSIMMean: 0.99, trajectorySeed: seed },
        metricEntries: [],
        summary: `seed ${seed}`,
        passed: true,
        completedAt: '2026-04-12T05:28:00.947Z',
        durationMs: 10,
      };
    },
  };
  return test;
}

describe('createSeededSweepRuns', () => {
  const plans = createBenchmarkRunPlans('bonsai-splat')!;

  it('plans nothing when the sweep is off', () => {
    expect(createSeededSweepRuns(plans, undefined)).toEqual([]);
    expect(createSeededSweepRuns(plans, [])).toEqual([]);
    expect(createSeededSweepRuns([null], undefined)).toEqual([]);
  });

  it('leaves the matrix plans untouched, on and off', () => {
    // a sweep only adds rows and must never rewrite the matrix plans
    const before = createBenchmarkRunPlans('bonsai-splat')!;
    createSeededSweepRuns(plans, undefined);
    createSeededSweepRuns(plans, [42, 1337]);
    expect(plans).toEqual(before);
    expect(plans).toHaveLength(15);
  });

  it('runs once per seed, in the order the seeds were given', () => {
    const runs = createSeededSweepRuns(plans, [1337, 42]);
    expect(runs.map((run) => run.seed)).toEqual([1337, 42]);
  });

  it('pins every run to the pair front viewpoint at replicate 1', () => {
    const runs = createSeededSweepRuns(plans, [42, 1337]);
    const front = plans.find((plan) => plan.viewpointId === SEEDED_SWEEP_VIEWPOINT_ID)!;

    for (const run of runs) {
      expect(run.runPlan?.viewpointId).toBe(SEEDED_SWEEP_VIEWPOINT_ID);
      expect(run.runPlan?.replicate).toBe(SEEDED_SWEEP_REPLICATE);
      expect(run.runPlan?.preset).toBe(front.preset);
      expect(run.runPlan?.sceneName).toBe('bonsai');
      expect(run.runPlan?.testFormat).toBe('splat');
    }
  });

  it('is not multiplied by the viewpoint x replicate matrix', () => {
    // 15 matrix plans and 3 seeds give 3 sweep runs, not 45
    expect(createSeededSweepRuns(plans, [42, 1337, 2026])).toHaveLength(3);
  });

  it('picks the front viewpoint regardless of plan order', () => {
    const reversed = [...plans].reverse();
    expect(createSeededSweepRuns(reversed, [42])).toEqual(createSeededSweepRuns(plans, [42]));
  });

  it('carries no matrix metadata for a plain, non-benchmark pair', () => {
    const runs = createSeededSweepRuns([null], [42, 7]);
    expect(runs).toEqual([
      { seed: 42, runPlan: null },
      { seed: 7, runPlan: null },
    ]);
  });
});

describe('runSeededSweep', () => {
  afterEach(() => {
    resetSeed();
  });

  function collect() {
    const results: { result: TestResult; run: SeededSweepRun }[] = [];
    return {
      results,
      onResult: (result: TestResult, run: SeededSweepRun) => results.push({ result, run }),
    };
  }

  it('runs the test once per seed, with each seed live during its run', async () => {
    const test = fakeSeededTest();
    const runs = createSeededSweepRuns([null], [7, 9]);
    const sink = collect();

    await runSeededSweep({
      scene: fakeScene,
      test,
      runs,
      signal: new AbortController().signal,
      onResult: sink.onResult,
    });

    expect(test.seedsSeen).toEqual([7, 9]);
    expect(sink.results).toHaveLength(2);
    expect(sink.results.map((entry) => entry.result.metrics.trajectorySeed)).toEqual([7, 9]);
  });

  it('restores the seed the panel had before the sweep', async () => {
    setSeed(2024);
    const runs = createSeededSweepRuns([null], [7, 9]);

    await runSeededSweep({
      scene: fakeScene,
      test: fakeSeededTest(),
      runs,
      signal: new AbortController().signal,
      onResult: () => {},
    });

    expect(getSeed()).toBe(2024);
  });

  it('restores the seed even when a run throws', async () => {
    setSeed(2024);
    const runs = createSeededSweepRuns([null], [7, 9]);
    const sink = collect();

    await runSeededSweep({
      scene: fakeScene,
      test: fakeSeededTest({ throwOn: 7 }),
      runs,
      signal: new AbortController().signal,
      onResult: sink.onResult,
    });

    expect(getSeed()).toBe(2024);
    // a failed seed is recorded as an error row rather than aborting the sweep
    expect(sink.results).toHaveLength(2);
    expect(sink.results[0].result.passed).toBe(false);
    expect(sink.results[0].result.summary).toBe('Error: boom');
    expect(sink.results[1].result.passed).toBe(true);
  });

  it('stops the sweep and restores the seed when a run is cancelled', async () => {
    setSeed(2024);
    const runs = createSeededSweepRuns([null], [7, 9]);
    const sink = collect();

    await runSeededSweep({
      scene: fakeScene,
      test: fakeSeededTest({ throwOn: 7, error: new Error('Test cancelled') }),
      runs,
      signal: new AbortController().signal,
      onResult: sink.onResult,
    });

    expect(sink.results).toHaveLength(0);
    expect(getSeed()).toBe(2024);
  });

  it('honours an abort raised between runs', async () => {
    const controller = new AbortController();
    const test = fakeSeededTest();
    const runs = createSeededSweepRuns([null], [7, 9, 11]);
    const sink = collect();

    await runSeededSweep({
      scene: fakeScene,
      test,
      runs,
      signal: controller.signal,
      onResult: (result, run) => {
        sink.onResult(result, run);
        controller.abort();
      },
    });

    expect(test.seedsSeen).toEqual([7]);
    expect(sink.results).toHaveLength(1);
  });

  it('applies the pinned viewpoint once, before the first run', async () => {
    const plans = createBenchmarkRunPlans('bonsai-splat')!;
    const runs = createSeededSweepRuns(plans, [42, 1337]);
    const applied: unknown[] = [];
    const prepared: (BenchmarkRunPlan | null)[] = [];

    await runSeededSweep({
      scene: fakeScene,
      test: fakeSeededTest(),
      runs,
      signal: new AbortController().signal,
      applyViewpoint: async (preset) => {
        applied.push(preset);
      },
      prepare: async (_test, runPlan) => {
        prepared.push(runPlan);
      },
      onResult: () => {},
    });

    expect(applied).toEqual([runs[0].runPlan!.preset]);
    expect(prepared).toHaveLength(2);
    expect(prepared.every((plan) => plan?.viewpointId === SEEDED_SWEEP_VIEWPOINT_ID)).toBe(true);
  });

  it('does nothing at all when the sweep is off', async () => {
    setSeed(2024);
    const test = fakeSeededTest();
    let applied = 0;

    await runSeededSweep({
      scene: fakeScene,
      test,
      runs: createSeededSweepRuns(createBenchmarkRunPlans('bonsai-splat')!, undefined),
      signal: new AbortController().signal,
      applyViewpoint: async () => {
        applied += 1;
      },
      onResult: () => {
        throw new Error('no run should have been recorded');
      },
    });

    expect(test.seedsSeen).toEqual([]);
    expect(applied).toBe(0);
    expect(getSeed()).toBe(2024);
  });

  it('exports sweep rows with the seeded source and the right seed', async () => {
    const plans = createBenchmarkRunPlans('bonsai-splat')!;
    const runs = createSeededSweepRuns(plans, [42, 1337]);
    const sink = collect();

    await runSeededSweep({
      scene: fakeScene,
      test: fakeSeededTest(),
      runs,
      signal: new AbortController().signal,
      onResult: sink.onResult,
    });

    const csv = exportBenchmarkBatchResultsToCSV(
      [
        {
          pairName: 'bonsai-splat',
          refFile: 'ref_bonsai-splat.ply',
          testFile: 'test_bonsai-splat.splat',
          results: sink.results.map((entry) => entry.result),
          benchmarkRows: sink.results.map((entry) => ({
            pairName: 'bonsai-splat',
            refFile: 'ref_bonsai-splat.ply',
            testFile: 'test_bonsai-splat.splat',
            result: entry.result,
            sceneName: entry.run.runPlan?.sceneName,
            testFormat: entry.run.runPlan?.testFormat,
            viewpointName: entry.run.runPlan?.viewpointId,
            replicate: entry.run.runPlan?.replicate,
          })),
        },
      ],
      runtimeInfo,
    );

    const [header, ...rows] = csv.split('\n');
    const columns = header.split(',');
    const cell = (row: string, name: string) => row.split(',')[columns.indexOf(name)];

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => cell(row, 'trajectory_source'))).toEqual(['seeded', 'seeded']);
    expect(rows.map((row) => cell(row, 'trajectory_seed'))).toEqual(['42', '1337']);
    expect(rows.map((row) => cell(row, 'viewpoint_name'))).toEqual(['front', 'front']);
    expect(rows.map((row) => cell(row, 'replicate'))).toEqual(['1', '1']);
  });
});

describe('seeded sweep isolation from benchmark mode', () => {
  it('never adds the seeded test to the batch-visible registry', () => {
    expect(getBatchTests().map((test) => test.id)).not.toContain(SEEDED_SWEEP_TEST_ID);
    // the sweep reaches it directly, by ID, rather than through getBatchTests()
    expect(getTest(SEEDED_SWEEP_TEST_ID)?.id).toBe(SEEDED_SWEEP_TEST_ID);
  });

  it('leaves the expected row count unchanged when the sweep is off', () => {
    const pairs = ['bonsai-splat', 'garden-sog'];
    // 2 pairs x 15 matrix runs x 4 registered tests
    expect(computeExpectedBenchmarkRows(pairs, 4)).toBe(120);
    expect(computeExpectedBenchmarkRows(pairs, 4, 0)).toBe(120);
  });

  it('adds one row per seed per pair when the sweep is on', () => {
    const pairs = ['bonsai-splat', 'garden-sog'];
    expect(computeExpectedBenchmarkRows(pairs, 4, 3)).toBe(120 + 2 * 3);
  });

  it('counts sweep rows for pairs that are not benchmark pairs', () => {
    // a plain pair contributes no matrix rows but still gets its sweep rows
    expect(computeExpectedBenchmarkRows(['scratch'], 4, 2)).toBe(2);
  });
});
