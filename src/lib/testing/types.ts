/**
 * Every benchmark in SplatBench is a "Test": a named, self-describing
 * operation that manipulates the scene (or not), captures frames, and
 * computes one or more metrics. Tests are registered in a central
 * registry so the UI can discover them automatically.
 */

import type { SparkViewerContext } from '../../types';

// ─── Scene Handle ────────────────────────────────────────────────────────────

/**
 * Runtime context handed to every test. Wraps the primary viewer and
 * an optional reference viewer so that tests can read camera state,
 * capture frames, etc.
 */
export interface TestScene {
  primary: SparkViewerContext;
  reference: SparkViewerContext | null;
}

// ─── Test Interface ──────────────────────────────────────────────────────────

export type TestStatus = 'idle' | 'running' | 'done' | 'failed';

export interface TestMetricEntry {
  label: string;
  value: number;
  unit?: string;
  /** Higher-is-better true, lower-is-better false, neutral null */
  higherIsBetter?: boolean | null;
}

export interface TestResult {
  testId: string;
  metrics: Record<string, number>;
  metricEntries: TestMetricEntry[];
  summary: string;
  passed: boolean;
  completedAt: string;
  durationMs: number;
}

/**
 * Progress callback invoked during test execution so the UI can
 * render a progress bar and phase label.
 */
export interface TestProgress {
  fraction: number;
  message: string;
  phase?: string;
}

export type OnProgress = (progress: TestProgress) => void;

export interface Test {
  id: string;
  name: string;
  description: string;
  category: string;
  run(
    scene: TestScene,
    onProgress: OnProgress,
    signal: AbortSignal,
  ): Promise<TestResult>;
}
