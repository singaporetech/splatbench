/**
 * Modular Test System -- Core Types
 *
 * Every benchmark in SplatBench is a "Test": a named, self-describing
 * operation that manipulates the scene (or not), captures frames, and
 * computes one or more metrics.  Tests are registered in a central
 * registry so the UI can discover them automatically.
 *
 * To add a new test, implement the `Test` interface, register it via
 * `registerTest()`, and it will appear in the Test Panel immediately.
 */

import type { SparkViewerContext } from '../../types';

// ─── Scene Handle ───────────────────────────────────────────────────────────

/**
 * Runtime context handed to every test.  Wraps the primary viewer and
 * an optional reference viewer so that tests can read camera state,
 * capture frames, etc.
 */
export interface TestScene {
  /** Primary (Splat A) viewer */
  primary: SparkViewerContext;
  /** Optional reference (Splat B) viewer for quality comparison */
  reference: SparkViewerContext | null;
}

// ─── Test Interface ─────────────────────────────────────────────────────────

export type TestStatus = 'idle' | 'running' | 'done' | 'failed';

export interface TestMetricEntry {
  /** Human-readable label, e.g. "Inter-frame SSIM mean" */
  label: string;
  /** Numeric value */
  value: number;
  /** Optional unit string, e.g. "dB", "ms" */
  unit?: string;
  /** Higher-is-better (true) or lower-is-better (false). Null = neutral. */
  higherIsBetter?: boolean | null;
}

export interface TestResult {
  testId: string;
  /** Flat bag of key -> number for programmatic access */
  metrics: Record<string, number>;
  /** Structured metric list for display */
  metricEntries: TestMetricEntry[];
  /** One-line human-readable summary */
  summary: string;
  /** Did the test "pass"? For trajectory tests this grades the score. */
  passed: boolean;
  /** ISO timestamp */
  completedAt: string;
  /** How long the test took, in ms */
  durationMs: number;
}

/**
 * Progress callback invoked during test execution so the UI can
 * render a progress bar and phase label.
 */
export interface TestProgress {
  /** 0-1 */
  fraction: number;
  /** e.g. "Capturing frame 12 / 60" */
  message: string;
  /** Optional phase label e.g. "Phase 1: Capturing" */
  phase?: string;
}

export type OnProgress = (progress: TestProgress) => void;

/**
 * The core abstraction.  Every benchmark test implements this interface.
 */
export interface Test {
  /** Unique, stable identifier, e.g. "trajectory-orbit" */
  id: string;
  /** Display name, e.g. "Orbit Trajectory" */
  name: string;
  /** Short description shown in the UI */
  description: string;
  /** Grouping category, e.g. "trajectory", "static", "stress" */
  category: string;
  /** Run the test.  Must be cancellable via AbortSignal. */
  run(
    scene: TestScene,
    onProgress: OnProgress,
    signal: AbortSignal,
  ): Promise<TestResult>;
}
