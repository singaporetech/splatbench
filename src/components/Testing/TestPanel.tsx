import { useEffect, useMemo, useRef, useState } from 'react';
import type { BenchmarkMetrics, SparkViewerContext } from '../../types';
import type { GSFile } from '../../types';
import type { Test, TestScene, TestStatus } from '../../lib/testing/types';
import { useTestRunner } from '../../hooks/useTestRunner';
import type { TestRunState } from '../../hooks/useTestRunner';
import { BatchTestPanel } from './BatchTestPanel';
import { InfoTooltip } from '../UI/InfoTooltip';
import {
  CUSTOM_MAX_FRAMES,
  CUSTOM_MIN_FRAMES,
  TrajectoryRecorder,
  parseCustomTrajectoryJSON,
  serializeCustomTrajectory,
} from '../../lib/camera/trajectories';
import { makeCustomTrajectoryTest } from '../../lib/testing/trajectoryTests';
import { getSeed, setSeed } from '../../lib/testing/trajectorySettings';
import { downloadJSON } from '../../lib/export/downloadJSON';

// register built-in tests through module side effects
import '../../lib/testing/trajectoryTests';
import '../../lib/testing/staticQualityTest';

const SEEDED_TEST_ID = 'trajectory-seeded';

interface TestPanelProps {
  contextA: SparkViewerContext | null;
  contextB: SparkViewerContext | null;
  onLoadRef?: (file: GSFile) => Promise<SparkViewerContext | null>;
  onLoadTest?: (file: GSFile) => Promise<SparkViewerContext | null>;
  getReferenceMetrics?: () => BenchmarkMetrics;
  getTestMetrics?: () => BenchmarkMetrics;
  resetReferenceMetrics?: () => void;
  resetTestMetrics?: () => void;
  onBatchRunningChange?: (running: boolean) => void;
}

type SubTab = 'current' | 'batch';

// ─── Status Indicator ────────────────────────────────────────────────────────

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

// ─── Progress Bar ────────────────────────────────────────────────────────────

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
  const rawPercent = Math.max(0, Math.min(fraction * 100, 100));
  const isComplete = rawPercent >= 100;
  const displayPercent = isComplete ? 100 : Math.floor(rawPercent);
  const barWidth = isComplete ? 100 : rawPercent;
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
        <span style={{ color: '#FFACBF' }}>
          {isComplete ? (message || 'Complete') : message}
        </span>
        <span className="font-mono" style={{ color: '#FDFDFB' }}>
          {displayPercent}%
        </span>
      </div>
      <div
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: '#555' }}
      >
        <div
          className={`h-1.5 rounded-full ${isComplete ? '' : 'transition-all duration-150'}`}
          style={{
            width: `${barWidth}%`,
            backgroundColor: barColor,
            animation: isMetricsPhase && !isComplete ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        />
      </div>
    </div>
  );
}

// ─── Test Queue Progress ─────────────────────────────────────────────────────

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
  // show a 1-based running index during execution and final counts afterward
  const currentTest = isRunning ? Math.min(completed + 1, total) : completed;
  const fraction = completed / total;
  const rawPercent = Math.max(0, Math.min(fraction * 100, 100));
  const isComplete = rawPercent >= 100;
  const barWidth = isComplete ? 100 : rawPercent;
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#FFACBF' }}>
          {isComplete && !isRunning
            ? `All ${total} tests complete`
            : isRunning
              ? `Running test ${currentTest} of ${total}`
              : `${completed} of ${total} complete`}
        </span>
        <span className="font-mono" style={{ color: '#FDFDFB' }}>
          {isComplete ? `${total} / ${total}` : `${completed} / ${total}`}
        </span>
      </div>
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: '#555' }}
      >
        <div
          className={`h-2 rounded-full ${isComplete ? '' : 'transition-all duration-300'}`}
          style={{
            width: `${barWidth}%`,
            backgroundColor: '#BEFF74',
          }}
        />
      </div>
    </div>
  );
}

// ─── Test Result Card ────────────────────────────────────────────────────────

function TestResultCard({ state, testName }: { state: TestRunState; testName: string }) {
  const result = state.result;

  // execution error with no result payload
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
      {/* header */}
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

      {/* summary */}
      <div className="text-xs mb-2" style={{ color: '#888' }}>
        {result.summary}
      </div>

      {/* metrics */}
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
            // lower is better, such as standard deviation
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

      {/* duration */}
      <div className="mt-2 text-xs" style={{ color: '#666' }}>
        {(result.durationMs / 1000).toFixed(1)}s
      </div>
    </div>
  );
}

// ─── Results Summary ─────────────────────────────────────────────────────────

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

// ─── Current Models Sub-Panel ────────────────────────────────────────────────

// file name and test name for a recorded path
const RECORDED_PATH_NAME = 'recorded-path';

function CurrentModelsPanel({
  contextA,
  contextB,
}: {
  contextA: SparkViewerContext | null;
  contextB: SparkViewerContext | null;
}) {
  const [customTest, setCustomTest] = useState<Test | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [seedInput, setSeedInput] = useState(() => String(getSeed()));
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState(0);
  const [recordNote, setRecordNote] = useState<string | null>(null);
  const customFileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<TrajectoryRecorder | null>(null);
  const recordFrameRef = useRef<number | null>(null);
  // the loop reads the reference viewer through a ref, so a viewer swapped out
  // mid-recording never leaves it sampling a stale context
  const contextARef = useRef<SparkViewerContext | null>(contextA);

  const extraTests = useMemo(() => (customTest ? [customTest] : []), [customTest]);
  const runner = useTestRunner(extraTests);

  useEffect(() => {
    contextARef.current = contextA;
  }, [contextA]);

  useEffect(
    () => () => {
      if (recordFrameRef.current !== null) cancelAnimationFrame(recordFrameRef.current);
    },
    [],
  );

  const handleSeedChange = (value: string) => {
    setSeedInput(value);
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) setSeed(parsed);
  };

  const handleCustomPathFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const config = parseCustomTrajectoryJSON(await file.text());
      const test = makeCustomTrajectoryTest(config);
      setCustomTest(test);
      runner.selectTest(test.id);
      setCustomError(null);
    } catch (err) {
      setCustomTest(null);
      setCustomError(err instanceof Error ? err.message : 'Could not read path file');
    }
    // allow re-picking the same file after a fix
    if (customFileInputRef.current) customFileInputRef.current.value = '';
  };

  const handleStartRecording = () => {
    if (!contextA || isRecording) return;

    const recorder = new TrajectoryRecorder();
    recorderRef.current = recorder;
    setRecordedFrames(0);
    setRecordNote(null);
    setCustomError(null);
    setIsRecording(true);

    const step = () => {
      const context = contextARef.current;
      // skip frames while no viewer is loaded instead of ending the recording
      if (context) {
        recorder.sample(context.camera.position, context.controls.target);
        setRecordedFrames(recorder.frameCount);
      }
      recordFrameRef.current = requestAnimationFrame(step);
    };
    recordFrameRef.current = requestAnimationFrame(step);
  };

  const handleStopRecording = () => {
    if (recordFrameRef.current !== null) {
      cancelAnimationFrame(recordFrameRef.current);
      recordFrameRef.current = null;
    }
    setIsRecording(false);

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;

    const points = recorder.points;
    if (points.length < CUSTOM_MIN_FRAMES) {
      setRecordNote(null);
      setCustomError(`Recorded path needs at least ${CUSTOM_MIN_FRAMES} frames`);
      return;
    }

    // load the saved text back through the parser, so the test that runs is
    // exactly the file that was saved
    const text = serializeCustomTrajectory(RECORDED_PATH_NAME, points);
    try {
      const config = parseCustomTrajectoryJSON(text);
      const test = makeCustomTrajectoryTest(config);
      setCustomTest(test);
      runner.selectTest(test.id);
      setCustomError(null);
      setRecordNote(
        recorder.full
          ? `Saved ${points.length} frames to ${RECORDED_PATH_NAME}.json, stopped at the ${CUSTOM_MAX_FRAMES}-frame cap`
          : `Saved ${points.length} frames to ${RECORDED_PATH_NAME}.json`,
      );
      downloadJSON(`${RECORDED_PATH_NAME}.json`, text);
    } catch (err) {
      setRecordNote(null);
      setCustomError(err instanceof Error ? err.message : 'Could not build the recorded path');
    }
  };

  // primary is the asset under test (Splat B) and reference the ground truth
  // (Splat A); with one viewer loaded, that viewer is the primary
  const scene: TestScene | null = contextA
    ? contextB
      ? { primary: contextB, reference: contextA }
      : { primary: contextA, reference: null }
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

  const activeState = runner.activeTestId
    ? runner.testStates.get(runner.activeTestId)
    : null;

  return (
    <div>
      {/* sticky progress while tests are running */}
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

      {/* explanation */}
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

      {/* selection controls */}
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

      {/* test list */}
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

      {/* trajectory options */}
      <div
        className="mb-5 px-3 py-2.5 rounded-lg"
        style={{ backgroundColor: 'rgba(179, 157, 255, 0.06)', border: '1px solid #44444480' }}
      >
        <div
          className="text-xs font-semibold uppercase tracking-wide mb-2"
          style={{ color: '#FFACBF' }}
        >
          Trajectory options
        </div>

        {runner.selectedIds.has(SEEDED_TEST_ID) && (
          <label className="flex items-center gap-2 mb-2">
            <span className="text-xs" style={{ color: '#888' }}>
              Seed
            </span>
            <input
              type="number"
              value={seedInput}
              onChange={(e) => handleSeedChange(e.target.value)}
              disabled={runner.isRunning}
              className="text-xs font-mono px-2 py-1 rounded w-24"
              style={{
                backgroundColor: '#555',
                color: '#FDFDFB',
                border: '1px solid #44444480',
                opacity: runner.isRunning ? 0.5 : 1,
              }}
            />
            <InfoTooltip text="Same seed and same app version always produce the same camera path, so a seeded run can be reproduced exactly." />
          </label>
        )}

        <input
          ref={customFileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => handleCustomPathFile(e.target.files?.[0])}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => customFileInputRef.current?.click()}
            disabled={runner.isRunning}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{
              backgroundColor: '#555',
              color: '#FDFDFB',
              cursor: runner.isRunning ? 'not-allowed' : 'pointer',
              opacity: runner.isRunning ? 0.5 : 1,
            }}
          >
            Custom path (JSON)&hellip;
          </button>
          <button
            onClick={isRecording ? handleStopRecording : handleStartRecording}
            // stopping stays available during a run, so a recording can always
            // be closed
            disabled={!isRecording && (!contextA || runner.isRunning)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{
              backgroundColor: isRecording ? '#FF575F' : '#555',
              color: '#FDFDFB',
              cursor: !isRecording && (!contextA || runner.isRunning) ? 'not-allowed' : 'pointer',
              opacity: !isRecording && (!contextA || runner.isRunning) ? 0.5 : 1,
            }}
          >
            {isRecording
              ? `Stop recording (${recordedFrames} frame${recordedFrames === 1 ? '' : 's'})`
              : 'Record path'}
          </button>
          {customTest && (
            <button
              onClick={() => {
                setCustomTest(null);
                setCustomError(null);
                setRecordNote(null);
              }}
              disabled={runner.isRunning}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{
                backgroundColor: '#555',
                color: '#FDFDFB',
                cursor: runner.isRunning ? 'not-allowed' : 'pointer',
                opacity: runner.isRunning ? 0.5 : 1,
              }}
            >
              Remove
            </button>
          )}
          <InfoTooltip text={`A JSON file shaped { "name": "my-path", "frames": [ { "position": [x,y,z], "target": [x,y,z] } ] }. Record path samples the reference camera at roughly 15 Hz into that same format, capped at ${CUSTOM_MAX_FRAMES} frames, then saves the file and loads it as the custom path. Either way it runs alongside the tests above and is never part of a batch run.`} />
        </div>

        {recordNote && (
          <div className="text-xs mt-2" style={{ color: '#888' }}>
            {recordNote}
          </div>
        )}

        {customError && (
          <div
            className="mt-2 p-2 rounded-lg text-xs"
            style={{
              backgroundColor: 'rgba(255, 87, 95, 0.15)',
              border: '1px solid #FF575F',
              color: '#FF575F',
            }}
          >
            {customError}
          </div>
        )}
      </div>

      {/* run and cancel buttons */}
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

          {/* results */}
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

          {/* results summary */}
          <ResultsSummary
            passed={runner.summary.passed}
            failed={runner.summary.failed}
            qualityFailed={runner.summary.qualityFailed}
            executionErrors={runner.summary.executionErrors}
            total={runner.summary.total}
          />

          {/* individual results */}
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function TestPanel({
  contextA,
  contextB,
  onLoadRef,
  onLoadTest,
  getReferenceMetrics,
  getTestMetrics,
  resetReferenceMetrics,
  resetTestMetrics,
  onBatchRunningChange,
}: TestPanelProps) {
  const [subTab, setSubTab] = useState<SubTab>('current');

  // default no-op loaders when parent callbacks are absent
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
      {/* inline keyframe for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div className="px-6 py-6">
        {/* header */}
        <h2 className="text-xl mb-4" style={{ color: '#B39DFF' }}>
          Tests
        </h2>

        {/* sub-tab navigation */}
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

        {/* sub-tab content */}
        {subTab === 'current' && (
          <CurrentModelsPanel contextA={contextA} contextB={contextB} />
        )}

        {subTab === 'batch' && (
          <BatchTestPanel
            contextA={contextA}
            contextB={contextB}
            onLoadRef={loadRef}
            onLoadTest={loadTest}
            getReferenceMetrics={getReferenceMetrics}
            getTestMetrics={getTestMetrics}
            resetReferenceMetrics={resetReferenceMetrics}
            resetTestMetrics={resetTestMetrics}
            onBatchRunningChange={onBatchRunningChange}
          />
        )}
      </div>
    </div>
  );
}
