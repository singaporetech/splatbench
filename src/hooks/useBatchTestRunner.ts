import { useState, useCallback, useRef } from 'react';
import type { FilePair } from './useBatchFolder';
import type { TestResult, TestScene, Test, OnProgress } from '../lib/testing/types';
import { getBatchTests, getTest } from '../lib/testing/registry';
import { getSeed, setSeed } from '../lib/testing/trajectorySettings';
import {
  applyCameraPreset,
  estimateSceneRadiusFromMesh,
  getScenePresets,
  resolveSceneRadius,
  type ViewpointPreset,
} from '../lib/camera/cameraPresets';
import type { BenchmarkBatchRowInput, BenchmarkMetricSnapshot } from '../lib/export/benchmarkCsvExport';

// register built-in tests through module side effects
import '../lib/testing/trajectoryTests';
import '../lib/testing/staticQualityTest';

/**
 * Canonical benchmark pair naming: `<scene>-<format>`, for example
 * `bonsai-splat` or `drjohnson-sog`. Any lowercase alphanumeric scene token is
 * accepted; scenes without a pinned radius are measured from the reference
 * asset once the pair has loaded.
 */
const BENCHMARK_SCENE_PATTERN = /^([a-z0-9]+)-(splat|ksplat|spz|sog)$/u;
const BENCHMARK_REPLICATES = ['1', '2', '3'] as const;

export interface ParsedBenchmarkPairName {
  sceneName: string;
  testFormat: string;
}

export interface BenchmarkRunPlan {
  sceneName: string;
  testFormat: string;
  viewpointId: string;
  replicate: string;
  preset: ViewpointPreset;
}

export function parseBenchmarkPairName(pairName: string): ParsedBenchmarkPairName | null {
  const match = pairName.toLowerCase().match(BENCHMARK_SCENE_PATTERN);
  if (!match) return null;

  return {
    sceneName: match[1],
    testFormat: match[2],
  };
}

/**
 * Expand a benchmark pair into its viewpoint x replicate matrix.
 * `estimatedRadius` only applies to scenes without a pinned radius.
 */
export function createBenchmarkRunPlans(
  pairName: string,
  estimatedRadius?: number | null,
): BenchmarkRunPlan[] | null {
  const parsed = parseBenchmarkPairName(pairName);
  if (!parsed) return null;

  return getScenePresets(parsed.sceneName, estimatedRadius).flatMap((preset) =>
    BENCHMARK_REPLICATES.map((replicate) => ({
      sceneName: parsed.sceneName,
      testFormat: parsed.testFormat,
      viewpointId: preset.id,
      replicate,
      preset,
    })),
  );
}

/**
 * Radius to scale a pair's viewpoints by, measured once per pair from the
 * reference asset, so a lossy test format cannot move the camera it is judged
 * at and every format of a scene lands on the same distances. Returns null for
 * scenes with a pinned radius or when nothing can be measured.
 */
export function measureSceneRadius(scene: TestScene, sceneName: string): number | null {
  if (resolveSceneRadius(sceneName).source === 'table') return null;

  const mesh = scene.reference?.splatMesh ?? scene.primary.splatMesh;
  if (!mesh) return null;

  try {
    const numSplats = mesh.packedSplats?.numSplats ?? 0;
    const radius = estimateSceneRadiusFromMesh(mesh, numSplats);
    return radius > 0 ? radius : null;
  } catch {
    // a mesh that cannot be enumerated falls back to the default radius
    return null;
  }
}

/** The seeded test a sweep runs; it is not part of getBatchTests(). */
export const SEEDED_SWEEP_TEST_ID = 'trajectory-seeded';

/**
 * Viewpoint and replicate every sweep run is pinned to. The seeds are the
 * variation, so a sweep is not multiplied by the viewpoint x replicate matrix.
 */
export const SEEDED_SWEEP_VIEWPOINT_ID = 'front';
export const SEEDED_SWEEP_REPLICATE = '1';

export interface SeededSweepOptions {
  // validated by parseSeedList in lib/testing/trajectorySettings
  seeds: number[];
}

export interface SeededSweepRun {
  seed: number;
  // the pair's front viewpoint at replicate 1 for benchmark pairs, null for
  // plain pairs, which carry no matrix metadata
  runPlan: BenchmarkRunPlan | null;
}

/**
 * One sweep run per seed, in the order given. Returns [] when no sweep was
 * requested, so a default batch is unchanged.
 */
export function createSeededSweepRuns(
  runPlans: readonly (BenchmarkRunPlan | null)[],
  seeds: readonly number[] | undefined,
): SeededSweepRun[] {
  if (!seeds || seeds.length === 0) return [];

  const benchmarkPlans = runPlans.filter((plan): plan is BenchmarkRunPlan => plan !== null);
  const front =
    benchmarkPlans.find((plan) => plan.viewpointId === SEEDED_SWEEP_VIEWPOINT_ID) ??
    benchmarkPlans[0] ??
    null;
  const runPlan: BenchmarkRunPlan | null = front
    ? { ...front, replicate: SEEDED_SWEEP_REPLICATE }
    : null;

  return seeds.map((seed) => ({ seed, runPlan }));
}

// matrix and sweep runs share this, so a sweep row carries the same pair,
// scene and format metadata as the matrix rows and differs only in its
// trajectory columns
function buildBenchmarkRow(
  pair: FilePair,
  result: TestResult,
  runPlan: BenchmarkRunPlan | null,
  benchmarkMetrics: BenchmarkMetricSnapshot | undefined,
): BenchmarkBatchRowInput {
  return {
    pairName: pair.name,
    refFile: pair.ref.name,
    testFile: pair.test.name,
    refSizeBytes: pair.ref.size,
    testSizeBytes: pair.test.size,
    result,
    benchmarkMetrics,
    sceneName: runPlan?.sceneName,
    referenceFormat: pair.ref.format.replace('.', ''),
    testFormat: runPlan?.testFormat,
    viewpointName: runPlan?.viewpointId,
    replicate: runPlan?.replicate,
    variantOrBasename:
      runPlan?.sceneName && runPlan?.testFormat
        ? `${runPlan.sceneName}.${runPlan.testFormat}`
        : undefined,
  };
}

function makeErrorResult(testId: string, err: unknown): TestResult {
  return {
    testId,
    metrics: {},
    metricEntries: [],
    summary: `Error: ${(err as Error).message}`,
    passed: false,
    completedAt: new Date().toISOString(),
    durationMs: 0,
  };
}

export interface SeededSweepExecution {
  scene: TestScene;
  // the seeded trajectory test, which reads the seed at run time
  test: Test;
  runs: readonly SeededSweepRun[];
  signal: AbortSignal;
  // applied once, before the first run
  applyViewpoint?: (preset: ViewpointPreset) => Promise<void>;
  prepare?: (test: Test, runPlan: BenchmarkRunPlan | null) => Promise<void>;
  onRunStart?: (run: SeededSweepRun, index: number) => void;
  onProgress?: OnProgress;
  onResult: (result: TestResult, run: SeededSweepRun) => void;
}

/**
 * Run the seeded test once per seed. The registered test reads the seed from
 * the settings store, which the Single Pair panel shares, so the previous seed
 * is restored afterwards, including on error or cancellation.
 */
export async function runSeededSweep(execution: SeededSweepExecution): Promise<void> {
  const { scene, test, runs, signal } = execution;
  if (runs.length === 0) return;

  const previousSeed = getSeed();
  try {
    const preset = runs[0].runPlan?.preset;
    if (preset && execution.applyViewpoint) {
      await execution.applyViewpoint(preset);
    }

    for (let i = 0; i < runs.length; i++) {
      if (signal.aborted) break;

      const run = runs[i];
      setSeed(run.seed);
      execution.onRunStart?.(run, i);
      await execution.prepare?.(test, run.runPlan);

      let result: TestResult;
      try {
        result = await test.run(scene, execution.onProgress ?? (() => {}), signal);
      } catch (err) {
        if ((err as Error).message === 'Test cancelled') break;
        result = makeErrorResult(test.id, err);
      }

      execution.onResult(result, run);
    }
  } finally {
    setSeed(previousSeed);
  }
}

/**
 * CSV rows a folder is expected to produce: viewpoints x replicates x batch
 * tests for each benchmark pair, plus one row per seed for every pair.
 */
export function computeExpectedBenchmarkRows(
  pairNames: readonly string[],
  registeredTestCount: number,
  sweepSeedCount = 0,
): number {
  const matrixRuns = pairNames.reduce(
    (sum, name) => sum + (createBenchmarkRunPlans(name)?.length ?? 0),
    0,
  );
  return matrixRuns * registeredTestCount + pairNames.length * sweepSeedCount;
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function settleViewers(scene: TestScene): Promise<void> {
  scene.primary.forceRender();
  scene.reference?.forceRender();
  await waitForFrame();
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function applyBenchmarkViewpoint(scene: TestScene, preset: ViewpointPreset): Promise<void> {
  applyCameraPreset(scene.primary.camera, scene.primary.controls, preset);
  if (scene.reference) {
    applyCameraPreset(scene.reference.camera, scene.reference.controls, preset);
  }
  await settleViewers(scene);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BatchPairResult {
  pairName: string;
  refFile: string;
  testFile: string;
  refSizeBytes: number;
  testSizeBytes: number;
  results: TestResult[];
  benchmarkRows: BenchmarkBatchRowInput[];
  error: string | null;
}

export type BatchStatus = 'idle' | 'running' | 'done' | 'cancelled';

export interface BatchRunOptions {
  // opt-in seeded trajectory sweep; omitted by default, so a batch runs
  // exactly the tests in getBatchTests()
  seededSweep?: SeededSweepOptions;
}

export interface UseBatchTestRunnerReturn {
  status: BatchStatus;
  currentPairIndex: number;
  totalPairs: number;
  currentPairName: string;
  currentTestName: string;
  currentTestProgress: number;
  currentTestMessage: string;
  pairResults: BatchPairResult[];
  startBatch: (
    pairs: FilePair[],
    loadPair: (ref: FilePair['ref'], test: FilePair['test']) => Promise<TestScene | null>,
    collectBenchmarkMetrics?: (
      scene: TestScene,
      pair: FilePair,
      result: TestResult,
    ) => BenchmarkMetricSnapshot,
    prepareForTest?: (
      scene: TestScene,
      pair: FilePair,
      test: Test,
      runPlan: BenchmarkRunPlan | null,
    ) => Promise<void>,
    options?: BatchRunOptions,
  ) => Promise<void>;
  cancelBatch: () => void;
  resetBatch: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBatchTestRunner(): UseBatchTestRunnerReturn {
  const [status, setStatus] = useState<BatchStatus>('idle');
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const [totalPairs, setTotalPairs] = useState(0);
  const [currentPairName, setCurrentPairName] = useState('');
  const [currentTestName, setCurrentTestName] = useState('');
  const [currentTestProgress, setCurrentTestProgress] = useState(0);
  const [currentTestMessage, setCurrentTestMessage] = useState('');
  const [pairResults, setPairResults] = useState<BatchPairResult[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const startBatch = useCallback(
    async (
      pairs: FilePair[],
      loadPair: (
        ref: FilePair['ref'],
        test: FilePair['test'],
      ) => Promise<TestScene | null>,
      collectBenchmarkMetrics?: (
        scene: TestScene,
        pair: FilePair,
        result: TestResult,
      ) => BenchmarkMetricSnapshot,
      prepareForTest?: (
        scene: TestScene,
        pair: FilePair,
        test: Test,
        runPlan: BenchmarkRunPlan | null,
      ) => Promise<void>,
      options?: BatchRunOptions,
    ) => {
      if (pairs.length === 0) return;

      const sweepSeeds = options?.seededSweep?.seeds ?? [];
      const controller = new AbortController();
      abortRef.current = controller;

      const plannedRuns = pairs.reduce(
        (sum, pair) =>
          sum + (createBenchmarkRunPlans(pair.name)?.length ?? 1) + sweepSeeds.length,
        0,
      );

      setStatus('running');
      setTotalPairs(plannedRuns);
      setCurrentPairIndex(0);
      setPairResults([]);

      const allTests: Test[] = getBatchTests();
      const collectedResults: BatchPairResult[] = [];
      let completedRuns = 0;

      for (let pairIdx = 0; pairIdx < pairs.length; pairIdx++) {
        if (controller.signal.aborted) break;

        const pair = pairs[pairIdx];
        const plannedBenchmarkRuns = createBenchmarkRunPlans(pair.name);
        const pairRunStartIndex = completedRuns;

        setCurrentPairIndex(completedRuns);
        setCurrentPairName(pair.name);
        setCurrentTestName('Loading files...');
        setCurrentTestProgress(0);
        setCurrentTestMessage(`Loading pair: ${pair.name}`);

        const pairResult: BatchPairResult = {
          pairName: pair.name,
          refFile: pair.ref.name,
          testFile: pair.test.name,
          refSizeBytes: pair.ref.size,
          testSizeBytes: pair.test.size,
          results: [],
          benchmarkRows: [],
          error: null,
        };

        let runPlans: (BenchmarkRunPlan | null)[] = plannedBenchmarkRuns ?? [null];

        try {
          const scene = await loadPair(pair.ref, pair.test);

          if (!scene) {
            pairResult.error = 'Failed to load files into viewers';
            completedRuns = pairRunStartIndex + runPlans.length + sweepSeeds.length;
            collectedResults.push(pairResult);
            setPairResults([...collectedResults]);
            continue;
          }

          await settleViewers(scene);

          // pin the radius once, from the reference asset, before any viewpoint
          // is applied; scenes with a pinned radius skip the measurement
          if (plannedBenchmarkRuns) {
            const measuredRadius = measureSceneRadius(scene, plannedBenchmarkRuns[0].sceneName);
            if (measuredRadius !== null) {
              runPlans = createBenchmarkRunPlans(pair.name, measuredRadius) ?? runPlans;
            }
          }

          for (const runPlan of runPlans) {
            if (controller.signal.aborted) break;

            const runLabel = runPlan
              ? `${pair.name} / ${runPlan.viewpointId} / r${runPlan.replicate}`
              : pair.name;

            setCurrentPairIndex(completedRuns);
            setCurrentPairName(runLabel);

            if (runPlan) {
              setCurrentTestName('Applying viewpoint...');
              setCurrentTestProgress(0);
              setCurrentTestMessage(
                `Applying ${runPlan.viewpointId} preset (replicate ${runPlan.replicate})`,
              );
              await applyBenchmarkViewpoint(scene, runPlan.preset);
            }

            for (let testIdx = 0; testIdx < allTests.length; testIdx++) {
              if (controller.signal.aborted) break;

              const test = allTests[testIdx];
              if (prepareForTest) {
                await prepareForTest(scene, pair, test, runPlan);
              }
              setCurrentTestName(test.name);
              setCurrentTestProgress(0);
              setCurrentTestMessage(`Starting ${test.name}...`);

              const onProgress: OnProgress = (progress) => {
                setCurrentTestProgress(progress.fraction);
                setCurrentTestMessage(progress.message);
              };

              let result: TestResult;
              try {
                result = await test.run(scene, onProgress, controller.signal);
              } catch (err) {
                if ((err as Error).message === 'Test cancelled') break;
                result = makeErrorResult(test.id, err);
              }

              pairResult.results.push(result);
              pairResult.benchmarkRows.push(
                buildBenchmarkRow(pair, result, runPlan, collectBenchmarkMetrics?.(scene, pair, result)),
              );
            }

            completedRuns += 1;
          }

          // opt-in seeded sweep, after the matrix and while the pair is still
          // loaded; it only adds rows and leaves the matrix unchanged
          const sweepRuns = createSeededSweepRuns(runPlans, sweepSeeds);
          const seededTest = sweepRuns.length > 0 ? getTest(SEEDED_SWEEP_TEST_ID) : undefined;
          if (seededTest && !controller.signal.aborted) {
            await runSeededSweep({
              scene,
              test: seededTest,
              runs: sweepRuns,
              signal: controller.signal,
              applyViewpoint: (preset) => applyBenchmarkViewpoint(scene, preset),
              prepare: prepareForTest
                ? (test, runPlan) => prepareForTest(scene, pair, test, runPlan)
                : undefined,
              onRunStart: (run) => {
                setCurrentPairIndex(completedRuns);
                setCurrentPairName(`${pair.name} / seed ${run.seed}`);
                setCurrentTestName(seededTest.name);
                setCurrentTestProgress(0);
                setCurrentTestMessage(`Seeded sweep: seed ${run.seed}`);
              },
              onProgress: (progress) => {
                setCurrentTestProgress(progress.fraction);
                setCurrentTestMessage(progress.message);
              },
              onResult: (result, run) => {
                pairResult.results.push(result);
                pairResult.benchmarkRows.push(
                  buildBenchmarkRow(
                    pair,
                    result,
                    run.runPlan,
                    collectBenchmarkMetrics?.(scene, pair, result),
                  ),
                );
                completedRuns += 1;
              },
            });
          }
        } catch (err) {
          pairResult.error = (err as Error).message;
          completedRuns = pairRunStartIndex + runPlans.length + sweepSeeds.length;
        }

        collectedResults.push(pairResult);
        setPairResults([...collectedResults]);
      }

      setStatus(controller.signal.aborted ? 'cancelled' : 'done');
      setCurrentPairIndex(completedRuns);
      setCurrentTestName('');
      setCurrentTestMessage('');
      abortRef.current = null;
    },
    [],
  );

  const cancelBatch = useCallback(() => {
    abortRef.current?.abort();
    setStatus('cancelled');
  }, []);

  const resetBatch = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setCurrentPairIndex(0);
    setTotalPairs(0);
    setCurrentPairName('');
    setCurrentTestName('');
    setCurrentTestProgress(0);
    setCurrentTestMessage('');
    setPairResults([]);
  }, []);

  return {
    status,
    currentPairIndex,
    totalPairs,
    currentPairName,
    currentTestName,
    currentTestProgress,
    currentTestMessage,
    pairResults,
    startBatch,
    cancelBatch,
    resetBatch,
  };
}
