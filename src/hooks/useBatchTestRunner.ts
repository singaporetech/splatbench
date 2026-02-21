/**
 * useBatchTestRunner Hook
 *
 * Orchestrates batch testing: iterates over file pairs, loads each pair
 * into the viewer contexts, runs all selected tests, and aggregates results.
 *
 * This hook works with the existing useTestRunner for per-pair test execution,
 * and useBatchFolder for pair detection.
 */

import { useState, useCallback, useRef } from 'react';
import type { FilePair } from './useBatchFolder';
import type { TestResult, TestScene, Test, OnProgress } from '../lib/testing/types';
import { getTests } from '../lib/testing/registry';

// Ensure built-in tests are registered
import '../lib/testing/trajectoryTests';
import '../lib/testing/staticQualityTest';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BatchPairResult {
  pairName: string;
  refFile: string;
  testFile: string;
  results: TestResult[];
  error: string | null;
}

export type BatchStatus = 'idle' | 'running' | 'done' | 'cancelled';

export interface UseBatchTestRunnerReturn {
  /** Overall batch status */
  status: BatchStatus;
  /** Index of the pair currently being processed (0-based) */
  currentPairIndex: number;
  /** Total number of pairs */
  totalPairs: number;
  /** Name of the pair currently being tested */
  currentPairName: string;
  /** Name of the test currently running within the current pair */
  currentTestName: string;
  /** Progress of the current test (0-1) */
  currentTestProgress: number;
  /** Progress message for the current test */
  currentTestMessage: string;
  /** All pair results collected so far */
  pairResults: BatchPairResult[];
  /** Start batch testing on a list of pairs */
  startBatch: (
    pairs: FilePair[],
    loadPair: (ref: FilePair['ref'], test: FilePair['test']) => Promise<TestScene | null>,
  ) => Promise<void>;
  /** Cancel the running batch */
  cancelBatch: () => void;
  /** Reset all batch state */
  resetBatch: () => void;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

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
    ) => {
      if (pairs.length === 0) return;

      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('running');
      setTotalPairs(pairs.length);
      setCurrentPairIndex(0);
      setPairResults([]);

      const allTests: Test[] = getTests();
      const collectedResults: BatchPairResult[] = [];

      for (let pairIdx = 0; pairIdx < pairs.length; pairIdx++) {
        if (controller.signal.aborted) break;

        const pair = pairs[pairIdx];
        setCurrentPairIndex(pairIdx);
        setCurrentPairName(pair.name);
        setCurrentTestName('Loading files...');
        setCurrentTestProgress(0);
        setCurrentTestMessage(`Loading pair: ${pair.name}`);

        const pairResult: BatchPairResult = {
          pairName: pair.name,
          refFile: pair.ref.name,
          testFile: pair.test.name,
          results: [],
          error: null,
        };

        try {
          // Load the pair into the viewers
          const scene = await loadPair(pair.ref, pair.test);

          if (!scene) {
            pairResult.error = 'Failed to load files into viewers';
            collectedResults.push(pairResult);
            setPairResults([...collectedResults]);
            continue;
          }

          // Run each test on this pair
          for (let testIdx = 0; testIdx < allTests.length; testIdx++) {
            if (controller.signal.aborted) break;

            const test = allTests[testIdx];
            setCurrentTestName(test.name);
            setCurrentTestProgress(0);
            setCurrentTestMessage(`Starting ${test.name}...`);

            const onProgress: OnProgress = (progress) => {
              setCurrentTestProgress(progress.fraction);
              setCurrentTestMessage(progress.message);
            };

            try {
              const result = await test.run(scene, onProgress, controller.signal);
              pairResult.results.push(result);
            } catch (err) {
              if ((err as Error).message === 'Test cancelled') break;
              // Record the error but continue with next test
              pairResult.results.push({
                testId: test.id,
                metrics: {},
                metricEntries: [],
                summary: `Error: ${(err as Error).message}`,
                passed: false,
                completedAt: new Date().toISOString(),
                durationMs: 0,
              });
            }
          }
        } catch (err) {
          pairResult.error = (err as Error).message;
        }

        collectedResults.push(pairResult);
        setPairResults([...collectedResults]);
      }

      setStatus(controller.signal.aborted ? 'cancelled' : 'done');
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
