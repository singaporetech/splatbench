/**
 * BatchTestPanel: Batch testing UI for folder-based ref/test file pairs.
 *
 * Allows users to select a folder containing paired files
 * (ref_<name>.<ext> and test_<name>.<ext>), previews detected pairs,
 * and runs all registered tests on each pair sequentially.
 */

import { useRef, useCallback } from 'react';
import type { SparkViewerContext } from '../../types';
import type { TestScene } from '../../lib/testing/types';
import type { GSFile } from '../../types';
import { useBatchFolder } from '../../hooks/useBatchFolder';
import type { FilePair } from '../../hooks/useBatchFolder';
import { useBatchTestRunner } from '../../hooks/useBatchTestRunner';
import type { BatchPairResult } from '../../hooks/useBatchTestRunner';

interface BatchTestPanelProps {
  contextA: SparkViewerContext | null;
  contextB: SparkViewerContext | null;
  /** Callback to load a file into the reference (left) viewer */
  onLoadRef: (file: GSFile) => Promise<SparkViewerContext | null>;
  /** Callback to load a file into the test (right) viewer */
  onLoadTest: (file: GSFile) => Promise<SparkViewerContext | null>;
}

// ─── Pair Preview Card ──────────────────────────────────────────────────────

function PairCard({ pair, index }: { pair: FilePair; index: number }) {
  return (
    <div
      className="flex items-center gap-3 py-2 px-3 rounded-lg"
      style={{ backgroundColor: 'rgba(62, 62, 62, 0.5)', border: '1px solid #44444480' }}
    >
      <span
        className="text-xs font-mono w-5 text-center flex-shrink-0"
        style={{ color: '#888' }}
      >
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: '#FDFDFB' }}>
          {pair.name}
        </div>
        <div className="flex gap-3 mt-0.5">
          <span className="text-xs truncate" style={{ color: '#B39DFF' }}>
            {pair.ref.name}
          </span>
          <span className="text-xs" style={{ color: '#555' }}>vs</span>
          <span className="text-xs truncate" style={{ color: '#FFACBF' }}>
            {pair.test.name}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Batch Result Card ──────────────────────────────────────────────────────

function BatchResultCard({ result }: { result: BatchPairResult }) {
  if (result.error) {
    return (
      <div
        className="p-3 rounded-lg"
        style={{
          backgroundColor: 'rgba(255, 87, 95, 0.1)',
          border: '1px solid #FF575F40',
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold" style={{ color: '#FDFDFB' }}>
            {result.pairName}
          </span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: '#FF575F20', color: '#FF575F' }}
          >
            ERROR
          </span>
        </div>
        <div className="text-xs" style={{ color: '#FF575F' }}>
          {result.error}
        </div>
      </div>
    );
  }

  const passed = result.results.filter((r) => r.passed).length;
  const total = result.results.length;
  const allPassed = passed === total;
  const borderColor = allPassed ? '#BEFF74' : '#FF575F';

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        backgroundColor: 'rgba(62, 62, 62, 0.5)',
        border: `1px solid ${borderColor}40`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: '#FDFDFB' }}>
          {result.pairName}
        </span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded"
          style={{
            backgroundColor: `${borderColor}20`,
            color: borderColor,
          }}
        >
          {passed}/{total} PASS
        </span>
      </div>
      <div className="flex gap-3 text-xs mb-2">
        <span style={{ color: '#B39DFF' }}>{result.refFile}</span>
        <span style={{ color: '#555' }}>vs</span>
        <span style={{ color: '#FFACBF' }}>{result.testFile}</span>
      </div>
      {/* Per-test results summary */}
      <div className="space-y-1">
        {result.results.map((r) => {
          const color = r.passed ? '#BEFF74' : '#FF575F';
          // Show key metrics inline
          const keyMetrics = r.metricEntries
            .filter((m) => m.label.toLowerCase().includes('mean') || m.label.toLowerCase().includes('psnr') || m.label.toLowerCase().includes('ssim'))
            .slice(0, 3);

          return (
            <div
              key={r.testId}
              className="flex items-center justify-between py-1"
              style={{ borderBottom: '1px solid #33333340' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs" style={{ color: '#FDFDFB' }}>
                  {r.testId}
                </span>
              </div>
              <div className="flex gap-2">
                {keyMetrics.map((m, i) => (
                  <span key={i} className="text-xs font-mono" style={{ color: '#888' }}>
                    {m.value < 0.01 ? m.value.toFixed(6) : m.value.toFixed(3)}
                    {m.unit ? ` ${m.unit}` : ''}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function BatchTestPanel({
  onLoadRef,
  onLoadTest,
}: BatchTestPanelProps) {
  const folder = useBatchFolder();
  const batchRunner = useBatchTestRunner();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectFolder = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        folder.handleFolderSelect(e.target.files);
      }
      // Reset the input so the same folder can be re-selected
      e.target.value = '';
    },
    [folder],
  );

  const handleRunBatch = useCallback(async () => {
    if (folder.pairs.length === 0) return;

    await batchRunner.startBatch(
      folder.pairs,
      async (ref: GSFile, test: GSFile): Promise<TestScene | null> => {
        // Load both files into viewers via parent callbacks
        const ctxA = await onLoadRef(ref);
        const ctxB = await onLoadTest(test);

        if (!ctxA) return null;

        return {
          primary: ctxA,
          reference: ctxB,
        };
      },
    );
  }, [folder.pairs, batchRunner, onLoadRef, onLoadTest]);

  const isRunning = batchRunner.status === 'running';
  const isDone = batchRunner.status === 'done' || batchRunner.status === 'cancelled';
  const canRun = folder.pairs.length > 0 && !isRunning;

  return (
    <div>
      {/* Hidden folder input */}
      <input
        ref={fileInputRef}
        type="file"
        /* @ts-expect-error webkitdirectory is non-standard but widely supported */
        webkitdirectory="true"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Naming convention help */}
      <div
        className="p-3 rounded-lg mb-4"
        style={{ backgroundColor: 'rgba(179, 157, 255, 0.08)', border: '1px solid #44444480' }}
      >
        <div
          className="text-xs font-semibold uppercase tracking-wide mb-1.5"
          style={{ color: '#B39DFF' }}
        >
          Batch File Naming
        </div>
        <div className="text-xs leading-relaxed" style={{ color: '#888' }}>
          Place pairs of files in a folder using this convention:
        </div>
        <div
          className="mt-2 p-2 rounded font-mono text-xs"
          style={{ backgroundColor: '#2A2A2A', color: '#FDFDFB' }}
        >
          <div>
            <span style={{ color: '#B39DFF' }}>ref_</span>
            <span style={{ color: '#888' }}>&lt;name&gt;</span>
            <span style={{ color: '#666' }}>.</span>
            <span style={{ color: '#888' }}>&lt;ext&gt;</span>
          </div>
          <div>
            <span style={{ color: '#FFACBF' }}>test_</span>
            <span style={{ color: '#888' }}>&lt;name&gt;</span>
            <span style={{ color: '#666' }}>.</span>
            <span style={{ color: '#888' }}>&lt;ext&gt;</span>
          </div>
        </div>
        <div className="mt-2 text-xs" style={{ color: '#666' }}>
          Example: <span className="font-mono" style={{ color: '#B39DFF' }}>ref_bonsai.ply</span>{' '}
          + <span className="font-mono" style={{ color: '#FFACBF' }}>test_bonsai.splat</span>
        </div>
      </div>

      {/* Folder selection */}
      <button
        onClick={handleSelectFolder}
        disabled={isRunning}
        className="w-full py-3 text-sm font-semibold rounded-lg transition-colors mb-4"
        style={{
          backgroundColor: isRunning ? '#444' : '#555',
          color: isRunning ? '#666' : '#FDFDFB',
          cursor: isRunning ? 'not-allowed' : 'pointer',
          border: '1px dashed #666',
        }}
      >
        {folder.hasFolder ? 'Change Batch Folder' : 'Select Batch Folder'}
      </button>

      {/* Folder info */}
      {folder.hasFolder && (
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs" style={{ color: '#FDFDFB' }}>
            <span style={{ color: '#888' }}>Folder:</span>{' '}
            <span className="font-semibold">{folder.folderName}</span>
          </div>
          <button
            onClick={() => { folder.clearFolder(); batchRunner.resetBatch(); }}
            disabled={isRunning}
            className="text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: '#555',
              color: '#FDFDFB',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              opacity: isRunning ? 0.5 : 1,
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Error */}
      {folder.error && (
        <div
          className="mb-3 p-3 rounded-lg text-xs"
          style={{
            backgroundColor: 'rgba(255, 87, 95, 0.15)',
            border: '1px solid #FF575F',
            color: '#FF575F',
          }}
        >
          {folder.error}
        </div>
      )}

      {/* Detected pairs */}
      {folder.pairs.length > 0 && (
        <div className="mb-4">
          <div
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: '#FFACBF' }}
          >
            Detected Pairs ({folder.pairs.length})
          </div>
          <div className="space-y-1">
            {folder.pairs.map((pair, i) => (
              <PairCard key={pair.name} pair={pair} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Unmatched files warning */}
      {folder.unmatchedFiles.length > 0 && (
        <div
          className="mb-4 p-2 rounded-lg text-xs"
          style={{ backgroundColor: 'rgba(255, 213, 155, 0.1)', border: '1px solid #FFD59B40' }}
        >
          <span style={{ color: '#FFD59B' }}>
            {folder.unmatchedFiles.length} unmatched file{folder.unmatchedFiles.length > 1 ? 's' : ''}:
          </span>
          <div className="mt-1" style={{ color: '#888' }}>
            {folder.unmatchedFiles.join(', ')}
          </div>
        </div>
      )}

      {/* Run / Cancel buttons */}
      {folder.pairs.length > 0 && (
        <div className="mb-4">
          {isRunning ? (
            <button
              onClick={batchRunner.cancelBatch}
              className="w-full py-3 text-sm font-semibold rounded-lg transition-colors"
              style={{ backgroundColor: '#FF575F', color: '#FDFDFB' }}
            >
              Cancel Batch
            </button>
          ) : (
            <button
              onClick={handleRunBatch}
              disabled={!canRun}
              className="w-full py-3 text-sm font-semibold rounded-lg transition-colors"
              style={{
                backgroundColor: canRun ? '#BEFF74' : '#555',
                color: canRun ? '#1F1F1F' : '#888',
                cursor: canRun ? 'pointer' : 'not-allowed',
              }}
            >
              Run Batch Tests ({folder.pairs.length} pair{folder.pairs.length > 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}

      {/* Batch progress */}
      {isRunning && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: '#FFACBF' }}>
              Processing pair {batchRunner.currentPairIndex + 1}/{batchRunner.totalPairs}
            </span>
            <span className="font-mono" style={{ color: '#FDFDFB' }}>
              {Math.round(((batchRunner.currentPairIndex) / batchRunner.totalPairs) * 100)}%
            </span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden mb-2"
            style={{ backgroundColor: '#555' }}
          >
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min((batchRunner.currentPairIndex / batchRunner.totalPairs) * 100, 100)}%`,
                backgroundColor: '#BEFF74',
              }}
            />
          </div>
          <div className="text-xs" style={{ color: '#888' }}>
            <span style={{ color: '#B39DFF' }}>{batchRunner.currentPairName}</span>
            {' / '}
            <span style={{ color: '#FFACBF' }}>{batchRunner.currentTestName}</span>
          </div>
          {/* Current test progress */}
          <div className="mt-2">
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: '#888' }}>{batchRunner.currentTestMessage}</span>
              <span className="font-mono text-xs" style={{ color: '#FDFDFB' }}>
                {Math.round(batchRunner.currentTestProgress * 100)}%
              </span>
            </div>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: '#444' }}
            >
              <div
                className="h-1.5 rounded-full transition-all duration-150"
                style={{
                  width: `${Math.min(batchRunner.currentTestProgress * 100, 100)}%`,
                  backgroundColor: '#B39DFF',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {isDone && batchRunner.pairResults.length > 0 && (
        <div>
          {/* Overall summary */}
          {(() => {
            const totalTests = batchRunner.pairResults.reduce(
              (sum, pr) => sum + pr.results.length,
              0,
            );
            const passedTests = batchRunner.pairResults.reduce(
              (sum, pr) => sum + pr.results.filter((r) => r.passed).length,
              0,
            );
            const errors = batchRunner.pairResults.filter((pr) => pr.error).length;
            const allGood = passedTests === totalTests && errors === 0;
            const borderColor = allGood ? '#BEFF74' : '#FF575F';

            return (
              <div
                className="p-4 rounded-lg text-center mb-4"
                style={{
                  backgroundColor: 'rgba(62, 62, 62, 0.7)',
                  border: `1px solid ${borderColor}`,
                }}
              >
                <div
                  className="text-xs uppercase tracking-wide mb-1"
                  style={{ color: '#FFACBF' }}
                >
                  Batch Complete
                </div>
                <div
                  className="text-lg font-semibold font-mono"
                  style={{ color: borderColor }}
                >
                  {passedTests}/{totalTests} Tests Passed
                </div>
                <div className="text-xs mt-1" style={{ color: '#888' }}>
                  {batchRunner.pairResults.length} pair{batchRunner.pairResults.length > 1 ? 's' : ''} tested
                  {errors > 0 && (
                    <span style={{ color: '#FF575F' }}> ({errors} with errors)</span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Per-pair results */}
          <div
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: '#FFACBF' }}
          >
            Per-Pair Results
          </div>
          <div className="space-y-2">
            {batchRunner.pairResults.map((pr) => (
              <BatchResultCard key={pr.pairName} result={pr} />
            ))}
          </div>

          {/* Reset button */}
          <button
            onClick={batchRunner.resetBatch}
            className="w-full mt-4 py-2 text-xs rounded-lg transition-colors"
            style={{ backgroundColor: '#555', color: '#FDFDFB' }}
          >
            Clear Results
          </button>
        </div>
      )}

      {/* In-progress results */}
      {isRunning && batchRunner.pairResults.length > 0 && (
        <div className="mt-4">
          <div
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: '#888' }}
          >
            Completed ({batchRunner.pairResults.length})
          </div>
          <div className="space-y-2">
            {batchRunner.pairResults.map((pr) => (
              <BatchResultCard key={pr.pairName} result={pr} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
