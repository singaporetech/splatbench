/**
 * TestPanel: Modular test runner UI with Current Models and Batch sub-tabs.
 *
 * - "Current Models" sub-tab: runs selected tests on the currently loaded
 *   reference (left pane) and test (right pane) models. Clear per-test
 *   progress with no confusing "batch" terminology.
 *
 * - "Batch" sub-tab: folder-based batch testing. Select a folder containing
 *   ref_<name>.<ext> and test_<name>.<ext> file pairs, preview detected
 *   pairs, and run all tests on each pair sequentially.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SparkViewerContext } from '../../types';
import type { GSFile } from '../../types';
import type { TestScene, TestStatus } from '../../lib/testing/types';
import { useTestRunner } from '../../hooks/useTestRunner';
import type { TestRunState } from '../../hooks/useTestRunner';
import { BatchTestPanel } from './BatchTestPanel';

// Ensure built-in tests are registered
import '../../lib/testing/trajectoryTests';
import '../../lib/testing/staticQualityTest';

interface TestPanelProps {
  contextA: SparkViewerContext | null;
  contextB: SparkViewerContext | null;
  /** Callback to load a file into the reference (left) viewer, returns context */
  onLoadRef?: (file: GSFile) => Promise<SparkViewerContext | null>;
  /** Callback to load a file into the test (right) viewer, returns context */
  onLoadTest?: (file: GSFile) => Promise<SparkViewerContext | null>;
}

type SubTab = 'current' | 'batch';

// ─── Status Indicator ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TestStatus,
  { dot: string; label: string; textColor: string }
> = {
  idle: { dot: '#888', label: 'Idle', textColor: '#888' },
  running: { dot: '#B39DFF', label: 'Running', textColor: '#B39DFF' },
  done: { dot: '#BEFF74', label: 'Done', textColor: '#BEFF74' },
  failed: { dot: '#FF575F', label: 'Failed', textColor: '#FF575F' },
};

function StatusDot({ status }: { status: TestStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{
        backgroundColor: cfg.dot,
        boxShadow: status === 'running' ? `0 0 6px ${cfg.dot}` : 'none',
        animation: status === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }}
      title={cfg.label}
    />
  );
}

// ─── Info Tooltip (viewport-aware) ──────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [flipLeft, setFlipLeft] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const toggle = useCallback(() => setShow((v) => !v), []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Flip tooltip to the left when trigger is in the right half of viewport
    setFlipLeft(rect.left > window.innerWidth / 2);
  }, []);

  const handleShow = useCallback(() => {
    updatePosition();
    setShow(true);
  }, [updatePosition]);

  // Tap-outside-to-dismiss for touch devices
  useEffect(() => {
    if (!show) return;
    const handleOutside = (e: Event) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [show]);

  return (
    <span ref={triggerRef} className="relative inline-flex items-center" style={{ touchAction: 'manipulation' }}>
      <svg
        className="w-4 h-4 cursor-help"
        fill="none"
        stroke="#888"
        viewBox="0 0 24 24"
        onMouseEnter={handleShow}
        onMouseLeave={() => setShow(false)}
        onClick={toggle}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {show && (
        <div
          className="absolute top-0 p-3 rounded-lg shadow-lg text-xs leading-relaxed"
          style={{
            zIndex: 9999,
            width: '240px',
            backgroundColor: '#2D2D2D',
            border: '1px solid #555',
            color: '#FDFDFB',
            ...(flipLeft ? { right: '24px' } : { left: '20px' }),
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

// ─── Progress Bar ───────────────────────────────────────────────────────────

function ProgressBar({
  fraction,
  message,
  phase,
}: {
  fraction: number;
  message: string;
  phase?: string;
}) {
  const isMetricsPhase = phase?.toLowerCase().includes('metric');
  const barColor = isMetricsPhase ? '#FFACBF' : '#B39DFF';
  const phaseColor = isMetricsPhase ? '#FFACBF' : '#B39DFF';

  return (
    <div className="mt-3">
      {phase && (
        <div
          className="text-xs mb-1 font-semibold uppercase tracking-wide"
          style={{ color: phaseColor }}
        >
          {phase}
        </div>
      )}
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#FFACBF' }}>{message}</span>
        <span className="font-mono" style={{ color: '#FDFDFB' }}>
          {Math.round(fraction * 100)}%
        </span>
      </div>
      <div
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: '#555' }}
      >
        <div
          className="h-1.5 rounded-full transition-all duration-150"
          style={{
            width: `${Math.min(fraction * 100, 100)}%`,
            backgroundColor: barColor,
            animation: isMetricsPhase && fraction < 1 ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        />
      </div>
    </div>
  );
}

// ─── Test Queue Progress ────────────────────────────────────────────────────

function TestQueueProgress({
  completed,
  total,
  isRunning,
}: {
  completed: number;
  total: number;
  isRunning: boolean;
}) {
  if (total === 0) return null;
  // During execution, show 1-based index of the test currently running
  // After completion, show final counts
  const currentTest = isRunning ? Math.min(completed + 1, total) : completed;
  const fraction = completed / total;
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#FFACBF' }}>
          {isRunning
            ? `Running test ${currentTest} of ${total}`
            : `${completed} of ${total} complete`}
        </span>
        <span className="font-mono" style={{ color: '#FDFDFB' }}>
          {completed} / {total}
        </span>
      </div>
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: '#555' }}
      >
        <div
          className="h-2 rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(fraction * 100, 100)}%`,
            backgroundColor: '#BEFF74',
          }}
        />
      </div>
    </div>
  );
}

// ─── Test Result Card ───────────────────────────────────────────────────────

function TestResultCard({ state, testName }: { state: TestRunState; testName: string }) {
  const result = state.result;

  // Execution error: test threw an exception and has no result
  if (!result && state.error) {
    return (
      <div
        className="mt-3 p-3 rounded-lg"
        style={{
          backgroundColor: 'rgba(255, 87, 95, 0.08)',
          border: '1px solid #FF575F40',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: '#FDFDFB' }}>
            {testName}
          </span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: '#FF575F20', color: '#FF575F' }}
          >
            ERROR
          </span>
        </div>
        <div className="text-xs mb-1" style={{ color: '#FF575F' }}>
          Execution error: {state.error}
        </div>
        <div className="text-xs" style={{ color: '#888' }}>
          This test could not run. Ensure both models are loaded correctly and try again.
        </div>
      </div>
    );
  }

  if (!result) return null;

  const gradeColor = result.passed ? '#BEFF74' : '#FFD59B';
  const gradeLabel = result.passed ? 'PASS' : 'LOW QUALITY';

  return (
    <div
      className="mt-3 p-3 rounded-lg"
      style={{
        backgroundColor: 'rgba(62, 62, 62, 0.5)',
        border: `1px solid ${gradeColor}40`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: '#FDFDFB' }}>
          {testName}
        </span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: `${gradeColor}20`, color: gradeColor }}
        >
          {gradeLabel}
        </span>
      </div>

      {/* Summary */}
      <div className="text-xs mb-2" style={{ color: '#888' }}>
        {result.summary}
      </div>

      {/* Metrics */}
      <div className="space-y-1">
        {result.metricEntries.map((entry, i) => {
          let valueColor = '#FDFDFB';
          if (entry.higherIsBetter === true) {
            valueColor =
              entry.value > 0.95
                ? '#BEFF74'
                : entry.value > 0.85
                  ? '#FFD59B'
                  : '#FF575F';
          } else if (entry.higherIsBetter === false) {
            // Lower is better (e.g., std dev)
            valueColor =
              entry.value < 0.005
                ? '#BEFF74'
                : entry.value < 0.015
                  ? '#FFD59B'
                  : '#FF575F';
          }

          const formatted =
            entry.label.includes('Frame')
              ? `#${entry.value}`
              : entry.value < 0.01
                ? entry.value.toFixed(6)
                : entry.value.toFixed(4);

          return (
            <div
              key={i}
              className="flex justify-between items-center py-1"
              style={{ borderBottom: '1px solid #44444480' }}
            >
              <span className="text-xs" style={{ color: '#FFACBF' }}>
                {entry.label}
              </span>
              <span
                className="font-mono text-xs font-semibold"
                style={{ color: valueColor }}
              >
                {formatted}
                {entry.unit ? ` ${entry.unit}` : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* Duration */}
      <div className="mt-2 text-xs" style={{ color: '#666' }}>
        {(result.durationMs / 1000).toFixed(1)}s
      </div>
    </div>
  );
}

// ─── Results Summary ────────────────────────────────────────────────────────

function ResultsSummary({
  passed,
  failed,
  qualityFailed,
  executionErrors,
  total,
}: {
  passed: number;
  failed: number;
  qualityFailed: number;
  executionErrors: number;
  total: number;
}) {
  if (total === 0) return null;

  const allPassed = failed === 0;
  const borderColor = allPassed ? '#BEFF74' : '#FF575F';

  return (
    <div
      className="mt-4 p-4 rounded-lg text-center"
      style={{
        backgroundColor: 'rgba(62, 62, 62, 0.7)',
        border: `1px solid ${borderColor}`,
      }}
    >
      <div
        className="text-xs uppercase tracking-wide mb-1"
        style={{ color: '#FFACBF' }}
      >
        Results Summary
      </div>
      <div
        className="text-lg font-semibold font-mono"
        style={{ color: borderColor }}
      >
        {passed} / {total} Passed
      </div>
      {qualityFailed > 0 && (
        <div className="text-xs mt-1" style={{ color: '#FFD59B' }}>
          {qualityFailed} test{qualityFailed > 1 ? 's' : ''} scored below quality threshold
        </div>
      )}
      {executionErrors > 0 && (
        <div className="text-xs mt-1" style={{ color: '#FF575F' }}>
          {executionErrors} test{executionErrors > 1 ? 's' : ''} could not run (execution error)
        </div>
      )}
    </div>
  );
}

// ─── Current Models Sub-Panel ───────────────────────────────────────────────

function CurrentModelsPanel({
  contextA,
  contextB,
}: {
  contextA: SparkViewerContext | null;
  contextB: SparkViewerContext | null;
}) {
  const runner = useTestRunner();

  // Build the TestScene from viewer contexts
  const scene: TestScene | null = contextA
    ? { primary: contextA, reference: contextB ?? null }
    : null;

  const canRun = !!scene && !runner.isRunning && runner.selectedIds.size > 0;

  const handleRunSelected = () => {
    if (scene) runner.runSelected(scene);
  };

  const handleRunAll = () => {
    if (scene) runner.runAll(scene);
  };

  const hasResults = runner.results.length > 0 || runner.summary.executionErrors > 0;
  const showQueueProgress = runner.isRunning && runner.totalInBatch > 1;

  // Active test progress data
  const activeState = runner.activeTestId
    ? runner.testStates.get(runner.activeTestId)
    : null;

  return (
    <div>
      {/* Sticky progress container -- visible only when tests are running */}
      {runner.isRunning && (
        <div
          className="px-6 py-3 -mx-6 -mt-0 mb-4"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backgroundColor: '#3E3E3E',
            borderBottom: '1px solid #44444480',
          }}
        >
          {showQueueProgress && (
            <TestQueueProgress
              completed={runner.completedCount}
              total={runner.totalInBatch}
              isRunning={runner.isRunning}
            />
          )}
          {activeState?.progress && (
            <ProgressBar
              fraction={activeState.progress.fraction}
              message={activeState.progress.message}
              phase={activeState.progress.phase}
            />
          )}
          {activeState?.error && (
            <div
              className="mt-2 p-2 rounded-lg text-xs"
              style={{
                backgroundColor: 'rgba(255, 87, 95, 0.15)',
                border: '1px solid #FF575F',
                color: '#FF575F',
              }}
            >
              {activeState.error}
            </div>
          )}
        </div>
      )}

      {/* Explanation */}
      <p className="text-xs mb-3" style={{ color: '#888' }}>
        Compare a{' '}
        <span style={{ color: '#FFACBF' }}>test model</span> (right pane) against a fixed{' '}
        <span style={{ color: '#B39DFF' }}>reference model</span> (left pane) using quantitative
        metrics.{' '}
        <InfoTooltip text="Each selected test captures frames from both the reference and test splats at matching camera positions, then computes quality metrics (PSNR, SSIM) and temporal consistency scores. The reference stays fixed as the ground truth." />
      </p>
      <div
        className="flex items-center gap-3 text-xs mb-5 px-3 py-2 rounded-lg"
        style={{ backgroundColor: 'rgba(179, 157, 255, 0.08)', border: '1px solid #44444480' }}
      >
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#B39DFF' }} />
          <span style={{ color: '#B39DFF' }}>Reference</span>
          <span style={{ color: '#666' }}>(left)</span>
        </div>
        <span style={{ color: '#555' }}>vs</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: '#FFACBF' }} />
          <span style={{ color: '#FFACBF' }}>Test</span>
          <span style={{ color: '#666' }}>(right)</span>
        </div>
      </div>

      {/* Selection controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={runner.selectAll}
            disabled={runner.isRunning}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{
              backgroundColor: '#555',
              color: '#FDFDFB',
              cursor: runner.isRunning ? 'not-allowed' : 'pointer',
              opacity: runner.isRunning ? 0.5 : 1,
            }}
          >
            All
          </button>
          <button
            onClick={runner.deselectAll}
            disabled={runner.isRunning}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{
              backgroundColor: '#555',
              color: '#FDFDFB',
              cursor: runner.isRunning ? 'not-allowed' : 'pointer',
              opacity: runner.isRunning ? 0.5 : 1,
            }}
          >
            None
          </button>
        </div>
        <span className="text-xs" style={{ color: '#888' }}>
          {runner.selectedIds.size} / {runner.tests.length} selected
        </span>
      </div>

      {/* Test list -- flat numbered list (no category headers) */}
      <div className="mb-5 space-y-1">
        {runner.tests.map((test, index) => {
          const state = runner.testStates.get(test.id);
          const status: TestStatus = state?.status ?? 'idle';
          const isSelected = runner.selectedIds.has(test.id);

          return (
            <label
              key={test.id}
              className="flex items-center gap-2 py-2 px-2 rounded cursor-pointer transition-colors"
              style={{
                backgroundColor:
                  runner.activeTestId === test.id
                    ? 'rgba(179, 157, 255, 0.1)'
                    : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => runner.toggleTest(test.id)}
                disabled={runner.isRunning}
                className="rounded flex-shrink-0"
                style={{ accentColor: '#B39DFF' }}
              />
              <span
                className="text-xs font-mono w-5 text-center flex-shrink-0"
                style={{ color: '#888' }}
              >
                {index + 1}
              </span>
              <StatusDot status={status} />
              <span
                className="text-sm font-semibold"
                style={{ color: '#FDFDFB' }}
              >
                {test.name}
              </span>
              <InfoTooltip text={test.description} />
            </label>
          );
        })}
      </div>

      {/* Run / Cancel buttons */}
      <div className="flex gap-2 mb-4">
        {runner.isRunning ? (
          <button
            onClick={runner.cancel}
            className="flex-1 py-3 text-sm font-semibold rounded-lg transition-colors"
            style={{ backgroundColor: '#FF575F', color: '#FDFDFB' }}
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              onClick={handleRunSelected}
              disabled={!canRun}
              className="flex-1 py-3 text-sm font-semibold rounded-lg transition-colors"
              style={{
                backgroundColor: canRun ? '#B39DFF' : '#555',
                color: canRun ? '#1F1F1F' : '#888',
                cursor: canRun ? 'pointer' : 'not-allowed',
              }}
            >
              Run on Current Models
            </button>
            <button
              onClick={handleRunAll}
              disabled={!scene || runner.isRunning}
              className="py-3 px-4 text-sm font-semibold rounded-lg transition-colors"
              style={{
                backgroundColor:
                  scene && !runner.isRunning ? '#555' : '#444',
                color: scene && !runner.isRunning ? '#FDFDFB' : '#666',
                cursor:
                  scene && !runner.isRunning ? 'pointer' : 'not-allowed',
              }}
            >
              All
            </button>
          </>
        )}
      </div>

      {!contextA && (
        <div className="text-xs mb-4 text-center" style={{ color: '#888' }}>
          Load a reference model (left pane) to run tests
        </div>
      )}
      {contextA && !contextB && (
        <div className="text-xs mb-4 text-center" style={{ color: '#888' }}>
          Load a test model (right pane) for quality comparison
        </div>
      )}

      {/* Results */}
      {hasResults && !runner.isRunning && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: '#FFACBF' }}
            >
              Results
            </div>
            <button
              onClick={runner.reset}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ backgroundColor: '#555', color: '#FDFDFB' }}
            >
              Clear
            </button>
          </div>

          {/* Results summary */}
          <ResultsSummary
            passed={runner.summary.passed}
            failed={runner.summary.failed}
            qualityFailed={runner.summary.qualityFailed}
            executionErrors={runner.summary.executionErrors}
            total={runner.summary.total}
          />

          {/* Individual results */}
          {runner.tests.map((test) => {
            const state = runner.testStates.get(test.id);
            if (!state || (!state.result && !state.error)) return null;
            return (
              <TestResultCard
                key={test.id}
                state={state}
                testName={test.name}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function TestPanel({ contextA, contextB, onLoadRef, onLoadTest }: TestPanelProps) {
  const [subTab, setSubTab] = useState<SubTab>('current');

  // Default no-op loaders if not provided by parent
  const defaultLoader = async () => null;
  const loadRef = onLoadRef ?? defaultLoader;
  const loadTest = onLoadTest ?? defaultLoader;

  return (
    <div
      className="w-full h-full overflow-y-auto"
      style={{
        backgroundColor: '#3E3E3E',
        color: '#FDFDFB',
        fontFamily: 'Arvo, serif',
      }}
    >
      {/* Inline keyframe for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div className="px-6 py-6">
        {/* Header */}
        <h2 className="text-xl mb-4" style={{ color: '#B39DFF' }}>
          Tests
        </h2>

        {/* Sub-tab navigation */}
        <div
          className="flex mb-5 rounded-lg overflow-hidden"
          style={{ border: '1px solid #555' }}
        >
          <button
            onClick={() => setSubTab('current')}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: subTab === 'current' ? '#B39DFF' : 'transparent',
              color: subTab === 'current' ? '#1F1F1F' : '#888',
            }}
          >
            Single Pair
          </button>
          <button
            onClick={() => setSubTab('batch')}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: subTab === 'batch' ? '#BEFF74' : 'transparent',
              color: subTab === 'batch' ? '#1F1F1F' : '#888',
              borderLeft: '1px solid #555',
            }}
          >
            Batch (Multi-Pair)
          </button>
        </div>

        {/* Sub-tab content */}
        {subTab === 'current' && (
          <CurrentModelsPanel contextA={contextA} contextB={contextB} />
        )}

        {subTab === 'batch' && (
          <BatchTestPanel
            contextA={contextA}
            contextB={contextB}
            onLoadRef={loadRef}
            onLoadTest={loadTest}
          />
        )}
      </div>
    </div>
  );
}
