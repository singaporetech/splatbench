import { useState, useCallback, useRef, useMemo } from 'react';
import type { Test, TestResult, TestScene, TestProgress, TestStatus } from '../lib/testing/types';
import { getTests } from '../lib/testing/registry';
// register built-in tests through module side effects
import '../lib/testing/trajectoryTests';
import '../lib/testing/staticQualityTest';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TestRunState {
  status: TestStatus;
  progress: TestProgress | null;
  result: TestResult | null;
  error: string | null;
}

export interface UseTestRunnerReturn {
  tests: Test[];
  selectedIds: Set<string>;
  testStates: Map<string, TestRunState>;
  isRunning: boolean;
  activeTestId: string | null;
  batchProgress: number;
  completedCount: number;
  totalInBatch: number;

  // actions
  toggleTest: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  runSelected: (scene: TestScene) => Promise<void>;
  runAll: (scene: TestScene) => Promise<void>;
  cancel: () => void;
  reset: () => void;

  // computed
  results: TestResult[];
  summary: {
    passed: number;
    failed: number;
    qualityFailed: number;
    executionErrors: number;
    total: number;
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTestRunner(): UseTestRunnerReturn {
  const tests = useMemo(() => getTests(), []);

  // all tests selected by default
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(tests.map((t) => t.id)),
  );

  const [testStates, setTestStates] = useState<Map<string, TestRunState>>(
    () => new Map(),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalInBatch, setTotalInBatch] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  // ─── Selection ─────────────────────────────────────────────────────────────

  const toggleTest = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(tests.map((t) => t.id)));
  }, [tests]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ─── Execution ─────────────────────────────────────────────────────────────

  const runTests = useCallback(
    async (ids: string[], scene: TestScene) => {
      const testsToRun = ids
        .map((id) => tests.find((t) => t.id === id))
        .filter((t): t is Test => t !== undefined);

      if (testsToRun.length === 0) return;

      const controller = new AbortController();
      abortRef.current = controller;

      setIsRunning(true);
      setCompletedCount(0);
      setTotalInBatch(testsToRun.length);

      const initialStates = new Map<string, TestRunState>();
      for (const t of testsToRun) {
        initialStates.set(t.id, {
          status: 'idle',
          progress: null,
          result: null,
          error: null,
        });
      }
      setTestStates(initialStates);

      let completed = 0;

      for (const test of testsToRun) {
        if (controller.signal.aborted) break;

        setActiveTestId(test.id);
        setTestStates((prev) => {
          const next = new Map(prev);
          next.set(test.id, {
            status: 'running',
            progress: { fraction: 0, message: 'Starting...', phase: 'Initializing' },
            result: null,
            error: null,
          });
          return next;
        });

        try {
          const result = await test.run(
            scene,
            (progress) => {
              setTestStates((prev) => {
                const next = new Map(prev);
                const existing = next.get(test.id);
                if (existing) {
                  next.set(test.id, { ...existing, progress });
                }
                return next;
              });
            },
            controller.signal,
          );

          completed++;
          setCompletedCount(completed);

          setTestStates((prev) => {
            const next = new Map(prev);
            next.set(test.id, {
              status: 'done',
              progress: { fraction: 1, message: 'Complete', phase: 'Done' },
              result,
              error: null,
            });
            return next;
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';

          if (message === 'Test cancelled') {
            setTestStates((prev) => {
              const next = new Map(prev);
              next.set(test.id, {
                status: 'idle',
                progress: null,
                result: null,
                error: 'Cancelled',
              });
              return next;
            });
            break;
          }

          completed++;
          setCompletedCount(completed);

          setTestStates((prev) => {
            const next = new Map(prev);
            next.set(test.id, {
              status: 'failed',
              progress: null,
              result: null,
              error: message,
            });
            return next;
          });
        }
      }

      setIsRunning(false);
      setActiveTestId(null);
      abortRef.current = null;
    },
    [tests],
  );

  const runSelected = useCallback(
    (scene: TestScene) => runTests([...selectedIds], scene),
    [runTests, selectedIds],
  );

  const runAll = useCallback(
    (scene: TestScene) => runTests(tests.map((t) => t.id), scene),
    [runTests, tests],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTestStates(new Map());
    setIsRunning(false);
    setActiveTestId(null);
    setCompletedCount(0);
    setTotalInBatch(0);
  }, []);

  // ─── Computed ──────────────────────────────────────────────────────────────

  const batchProgress = totalInBatch > 0 ? completedCount / totalInBatch : 0;

  const results = useMemo(() => {
    const out: TestResult[] = [];
    for (const [, state] of testStates) {
      if (state.result) out.push(state.result);
    }
    return out;
  }, [testStates]);

  const summary = useMemo(() => {
    let passed = 0;
    let qualityFailed = 0;
    let executionErrors = 0;
    for (const r of results) {
      if (r.passed) passed++;
      else qualityFailed++;
    }
    for (const [, state] of testStates) {
      if (state.status === 'failed' && state.error && !state.result) {
        executionErrors++;
      }
    }
    return {
      passed,
      failed: qualityFailed + executionErrors,
      qualityFailed,
      executionErrors,
      total: results.length + executionErrors,
    };
  }, [results, testStates]);

  return {
    tests,
    selectedIds,
    testStates,
    isRunning,
    activeTestId,
    batchProgress,
    completedCount,
    totalInBatch,
    toggleTest,
    selectAll,
    deselectAll,
    runSelected,
    runAll,
    cancel,
    reset,
    results,
    summary,
  };
}
