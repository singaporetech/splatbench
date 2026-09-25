import { useState, useCallback, useRef } from 'react';
import type { FilePair } from './useBatchFolder';
import type { TestResult, TestScene, Test, OnProgress } from '../lib/testing/types';
import { getTests } from '../lib/testing/registry';
import {
  applyCameraPreset,
  getScenePresets,
  type ViewpointPreset,
} from '../lib/camera/cameraPresets';
import type { BenchmarkBatchRowInput, BenchmarkMetricSnapshot } from '../lib/export/benchmarkCsvExport';

// register built-in tests through module side effects
import '../lib/testing/trajectoryTests';
import '../lib/testing/staticQualityTest';

const BENCHMARK_SCENE_PATTERN = /^(bonsai|flower|garden|playroom|train|truck)-(splat|ksplat|spz)$/u;
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

export function createBenchmarkRunPlans(pairName: string): BenchmarkRunPlan[] | null {
  const parsed = parseBenchmarkPairName(pairName);
  if (!parsed) return null;

  return getScenePresets(parsed.sceneName).flatMap((preset) =>
    BENCHMARK_REPLICATES.map((replicate) => ({
      sceneName: parsed.sceneName,
      testFormat: parsed.testFormat,
      viewpointId: preset.id,
      replicate,
      preset,
    })),
  );
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
    ) => {
      if (pairs.length === 0) return;

      const controller = new AbortController();
      abortRef.current = controller;

      const plannedRuns = pairs.reduce(
        (sum, pair) => sum + (createBenchmarkRunPlans(pair.name)?.length ?? 1),
        0,
      );

      setStatus('running');
      setTotalPairs(plannedRuns);
      setCurrentPairIndex(0);
      setPairResults([]);

      const allTests: Test[] = getTests();
      const collectedResults: BatchPairResult[] = [];
      let completedRuns = 0;

      for (let pairIdx = 0; pairIdx < pairs.length; pairIdx++) {
        if (controller.signal.aborted) break;

        const pair = pairs[pairIdx];
        const benchmarkRunPlans = createBenchmarkRunPlans(pair.name);
        const runPlans = benchmarkRunPlans ?? [null];
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

        try {
          const scene = await loadPair(pair.ref, pair.test);

          if (!scene) {
            pairResult.error = 'Failed to load files into viewers';
            completedRuns = pairRunStartIndex + runPlans.length;
            collectedResults.push(pairResult);
            setPairResults([...collectedResults]);
            continue;
          }

          await settleViewers(scene);

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
                result = {
                  testId: test.id,
                  metrics: {},
                  metricEntries: [],
                  summary: `Error: ${(err as Error).message}`,
                  passed: false,
                  completedAt: new Date().toISOString(),
                  durationMs: 0,
                };
              }

              pairResult.results.push(result);

              const benchmarkMetrics = collectBenchmarkMetrics?.(scene, pair, result);
              pairResult.benchmarkRows.push({
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
              });
            }

            completedRuns += 1;
          }
        } catch (err) {
          pairResult.error = (err as Error).message;
          completedRuns = pairRunStartIndex + runPlans.length;
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
