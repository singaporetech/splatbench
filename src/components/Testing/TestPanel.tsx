/**
 * TestPanel: Modular test runner UI.
 *
 * Displays all registered tests grouped by category with checkboxes,
 * Run Selected / Run All buttons, per-test status indicators, a
 * progress bar, individual test results, and a batch summary.
 *
 * Replaces the old TrajectoryPanel with a generic, extensible design.
 */

import { useMemo } from 'react';
import type { SparkViewerContext } from '../../types';
import type { TestScene, TestStatus } from '../../lib/testing/types';
import { getCategories } from '../../lib/testing/registry';
import { useTestRunner } from '../../hooks/useTestRunner';
import type { TestRunState } from '../../hooks/useTestRunner';

// Ensure built-in tests are registered
import '../../lib/testing/trajectoryTests';
import '../../lib/testing/staticQualityTest';

interface TestPanelProps {
  contextA: SparkViewerContext | null;
  contextB: SparkViewerContext | null;
}

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

// ─── Batch Progress ─────────────────────────────────────────────────────────

function BatchProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  if (total === 0) return null;
  const fraction = completed / total;
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#FFACBF' }}>Batch Progress</span>
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
  if (!result) return null;

  const gradeColor = result.passed ? '#BEFF74' : '#FF575F';
  const gradeLabel = result.passed ? 'PASS' : 'FAIL';

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

// ─── Batch Summary ──────────────────────────────────────────────────────────

function BatchSummary({
  passed,
  failed,
  total,
}: {
  passed: number;
  failed: number;
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
        Batch Summary
      </div>
      <div
        className="text-lg font-semibold font-mono"
        style={{ color: borderColor }}
      >
        {passed} / {total} Passed
      </div>
      {failed > 0 && (
        <div className="text-xs mt-1" style={{ color: '#FF575F' }}>
          {failed} test{failed > 1 ? 's' : ''} failed
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function TestPanel({ contextA, contextB }: TestPanelProps) {
  const runner = useTestRunner();
  const categories = useMemo(() => getCategories(), []);

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

  // Group tests by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof runner.tests>();
    for (const t of runner.tests) {
      const list = map.get(t.category) || [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [runner.tests]);

  const hasResults = runner.results.length > 0;
  const showBatchProgress =
    runner.isRunning && runner.totalInBatch > 1;

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
        <h2 className="text-xl mb-1" style={{ color: '#B39DFF' }}>
          Tests
        </h2>
        <p className="text-xs mb-3" style={{ color: '#888' }}>
          Each test evaluates the <span style={{ color: '#FFACBF' }}>test model</span> (right pane)
          against the <span style={{ color: '#B39DFF' }}>reference model</span> (left pane) by
          capturing frames along a trajectory and computing quality metrics.
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

        {/* Test list grouped by category */}
        <div className="mb-5 space-y-4">
          {categories.map((cat) => {
            const testsInCat = grouped.get(cat) || [];
            return (
              <div key={cat}>
                <div
                  className="text-xs font-semibold uppercase tracking-wide mb-2"
                  style={{ color: '#FFACBF' }}
                >
                  {cat}
                </div>
                <div className="space-y-1">
                  {testsInCat.map((test) => {
                    const state = runner.testStates.get(test.id);
                    const status: TestStatus = state?.status ?? 'idle';
                    const isSelected = runner.selectedIds.has(test.id);

                    return (
                      <label
                        key={test.id}
                        className="flex items-start gap-2 py-2 px-2 rounded cursor-pointer transition-colors"
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
                          className="mt-0.5 rounded flex-shrink-0"
                          style={{ accentColor: '#B39DFF' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <StatusDot status={status} />
                            <span
                              className="text-sm font-semibold"
                              style={{ color: '#FDFDFB' }}
                            >
                              {test.name}
                            </span>
                          </div>
                          <div
                            className="text-xs mt-0.5 leading-snug"
                            style={{ color: '#888' }}
                          >
                            {test.description}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
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
                Run Selected
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
                Run All
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

        {/* Batch progress */}
        {showBatchProgress && (
          <BatchProgress
            completed={runner.completedCount}
            total={runner.totalInBatch}
          />
        )}

        {/* Active test progress */}
        {runner.activeTestId &&
          (() => {
            const state = runner.testStates.get(runner.activeTestId);
            if (!state?.progress) return null;
            return (
              <ProgressBar
                fraction={state.progress.fraction}
                message={state.progress.message}
                phase={state.progress.phase}
              />
            );
          })()}

        {/* Error for active test */}
        {runner.activeTestId &&
          (() => {
            const state = runner.testStates.get(runner.activeTestId);
            if (!state?.error) return null;
            return (
              <div
                className="mt-3 p-3 rounded-lg text-xs"
                style={{
                  backgroundColor: 'rgba(255, 87, 95, 0.15)',
                  border: '1px solid #FF575F',
                  color: '#FF575F',
                }}
              >
                {state.error}
              </div>
            );
          })()}

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

            {/* Batch summary */}
            <BatchSummary
              passed={runner.summary.passed}
              failed={runner.summary.failed}
              total={runner.summary.total}
            />

            {/* Individual results */}
            {runner.tests.map((test) => {
              const state = runner.testStates.get(test.id);
              if (!state || !state.result) return null;
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
    </div>
  );
}
