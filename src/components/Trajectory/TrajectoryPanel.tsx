/**
 * TrajectoryPanel: UI for configuring and running camera trajectory evaluations.
 *
 * Allows the user to select a trajectory type (orbit, dolly, pan),
 * adjust parameters, run the trajectory capture, and view temporal
 * consistency results (inter-frame SSIM variance).
 */

import { useState, useMemo } from 'react';
import type { SparkViewerContext } from '../../types';
import type { OrbitConfig, DollyConfig, PanConfig } from '../../lib/camera/trajectories';
import {
  DEFAULT_ORBIT_CONFIG,
  DEFAULT_DOLLY_CONFIG,
  DEFAULT_PAN_CONFIG,
} from '../../lib/camera/trajectories';
import { useTrajectory } from '../../hooks/useTrajectory';
import type { TrajectoryMetricsResult } from '../../lib/metrics/trajectoryMetrics';

interface TrajectoryPanelProps {
  contextA: SparkViewerContext | null;
  contextB: SparkViewerContext | null;
}

type TrajectoryTypeOption = 'orbit' | 'dolly' | 'pan';

// ─── Subcomponents ──────────────────────────────────────────────────────────

function ConfigSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
  tooltip,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
  tooltip?: string;
}) {
  return (
    <div className="mb-3" title={tooltip}>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#FFACBF' }}>{label}</span>
        <span className="font-mono" style={{ color: '#FDFDFB' }}>
          {value}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: '#B39DFF', backgroundColor: '#555' }}
      />
    </div>
  );
}

function ProgressBar({ progress, label, phaseLabel }: { progress: number; label: string; phaseLabel?: string }) {
  return (
    <div className="mt-4">
      {phaseLabel && (
        <div className="text-xs mb-2 font-semibold uppercase tracking-wide" style={{ color: '#B39DFF' }}>
          {phaseLabel}
        </div>
      )}
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: '#FFACBF' }}>{label}</span>
        <span className="font-mono" style={{ color: '#FDFDFB' }}>
          {Math.round(progress * 100)}%
        </span>
      </div>
      <div className="w-full h-2 rounded-full" style={{ backgroundColor: '#555' }}>
        <div
          className="h-2 rounded-full transition-all duration-150"
          style={{ width: `${Math.min(progress * 100, 100)}%`, backgroundColor: '#B39DFF' }}
        />
      </div>
    </div>
  );
}

function TemporalConsistencyResult({ result }: { result: TrajectoryMetricsResult }) {
  const tc = result.temporalConsistency;
  const formatNum = (n: number, d: number = 4) => n.toFixed(d);

  // Grade the temporal consistency
  const getGrade = (stdDev: number): { label: string; color: string } => {
    if (stdDev < 0.005) return { label: 'Excellent', color: '#BEFF74' };
    if (stdDev < 0.015) return { label: 'Good', color: '#FFD59B' };
    if (stdDev < 0.03) return { label: 'Fair', color: '#FFACBF' };
    return { label: 'Poor', color: '#FF575F' };
  };

  const grade = getGrade(tc.interFrameSSIMStdDev);

  return (
    <div className="mt-4 space-y-3">
      {/* Grade banner */}
      <div
        className="p-3 rounded-lg text-center"
        style={{ backgroundColor: 'rgba(62, 62, 62, 0.7)', border: `1px solid ${grade.color}` }}
      >
        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: '#FFACBF' }}>
          Temporal Consistency
        </div>
        <div className="text-lg font-semibold font-mono" style={{ color: grade.color }}>
          {grade.label}
        </div>
      </div>

      {/* Key metrics */}
      <div className="space-y-2">
        <MetricRow
          label="Inter-frame SSIM (mean)"
          value={formatNum(tc.interFrameSSIMMean)}
          tooltip="Average SSIM between consecutive frames. Higher means smoother transitions."
          color={tc.interFrameSSIMMean > 0.95 ? '#BEFF74' : tc.interFrameSSIMMean > 0.85 ? '#FFD59B' : '#FF575F'}
        />
        <MetricRow
          label="SSIM Std Dev"
          value={formatNum(tc.interFrameSSIMStdDev, 6)}
          tooltip="Standard deviation of inter-frame SSIM. Lower means more consistent rendering. This is the primary temporal stability metric."
          color={grade.color}
        />
        <MetricRow
          label="Worst SSIM"
          value={formatNum(tc.interFrameSSIMMin)}
          tooltip="Minimum inter-frame SSIM. Low values indicate a specific frame transition with flickering or popping."
          color={tc.interFrameSSIMMin > 0.9 ? '#BEFF74' : tc.interFrameSSIMMin > 0.8 ? '#FFD59B' : '#FF575F'}
        />
        <MetricRow
          label="Worst Frame"
          value={`#${tc.worstTransitionFrame}`}
          tooltip="Frame index where the worst transition occurs."
        />
      </div>

      {/* Per-frame reference metrics (if available) */}
      {result.aggregatePerFrame.psnrMean !== null && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #555' }}>
          <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#FFACBF' }}>
            Quality vs Reference
          </div>
          <div className="space-y-2">
            <MetricRow
              label="PSNR (mean)"
              value={`${formatNum(result.aggregatePerFrame.psnrMean!, 2)} dB`}
              color={result.aggregatePerFrame.psnrMean! > 35 ? '#BEFF74' : result.aggregatePerFrame.psnrMean! > 25 ? '#FFD59B' : '#FF575F'}
            />
            <MetricRow
              label="SSIM (mean)"
              value={formatNum(result.aggregatePerFrame.ssimMean!)}
              color={result.aggregatePerFrame.ssimMean! > 0.95 ? '#BEFF74' : result.aggregatePerFrame.ssimMean! > 0.85 ? '#FFD59B' : '#FF575F'}
            />
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="mt-3 pt-3 text-xs" style={{ borderTop: '1px solid #555', color: '#888' }}>
        <div>{result.trajectoryDescription}</div>
        <div>{result.totalFrames} frames captured</div>
        <div>
          {new Date(result.capturedAt).toLocaleString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  color = '#FDFDFB',
  tooltip,
}: {
  label: string;
  value: string;
  color?: string;
  tooltip?: string;
}) {
  return (
    <div
      className="flex justify-between items-center py-1.5"
      style={{ borderBottom: '1px solid #444', fontFamily: 'Arvo, serif' }}
      title={tooltip}
    >
      <span className="text-xs" style={{ color: '#FFACBF' }}>{label}</span>
      <span className="font-mono text-sm font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function TrajectoryPanel({ contextA, contextB }: TrajectoryPanelProps) {
  const trajectory = useTrajectory();

  // Trajectory type selection
  const [trajectoryType, setTrajectoryType] = useState<TrajectoryTypeOption>('orbit');

  // Config state for each type
  const [orbitConfig, setOrbitConfig] = useState<OrbitConfig>({
    ...DEFAULT_ORBIT_CONFIG,
  });
  const [dollyConfig, setDollyConfig] = useState<DollyConfig>({
    ...DEFAULT_DOLLY_CONFIG,
  });
  const [panConfig, setPanConfig] = useState<PanConfig>({
    ...DEFAULT_PAN_CONFIG,
  });

  // Whether to include reference viewer (B) for per-frame quality comparison
  const [useReference, setUseReference] = useState(false);

  // Get the active config
  const activeConfig = useMemo(() => {
    switch (trajectoryType) {
      case 'orbit': return orbitConfig;
      case 'dolly': return dollyConfig;
      case 'pan': return panConfig;
    }
  }, [trajectoryType, orbitConfig, dollyConfig, panConfig]);

  // Sync center with current camera target
  const syncWithCamera = () => {
    if (!contextA) return;
    const target = contextA.controls.target;
    const distance = contextA.camera.position.distanceTo(target);
    const center = { x: target.x, y: target.y, z: target.z };

    setOrbitConfig((prev) => ({ ...prev, center, startDistance: distance }));
    setDollyConfig((prev) => ({ ...prev, center, startDistance: distance * 1.5, endDistance: distance * 0.5 }));
    setPanConfig((prev) => ({ ...prev, center, startDistance: distance }));
  };

  const handleRun = async () => {
    if (!contextA) return;
    const ref = useReference ? contextB : null;
    await trajectory.run(contextA, activeConfig, ref);
  };

  const canRun = !!contextA && !trajectory.isRunning;

  return (
    <div
      className="w-full h-full overflow-y-auto"
      style={{ backgroundColor: '#3E3E3E', color: '#FDFDFB', fontFamily: 'Arvo, serif' }}
    >
      <div className="px-6 py-6">
        <h2 className="text-xl mb-4" style={{ color: '#B39DFF' }}>
          Trajectory
        </h2>
        <p className="text-xs mb-6" style={{ color: '#888' }}>
          Run a camera trajectory to evaluate temporal consistency.
          The inter-frame SSIM variance measures rendering stability during camera movement.
        </p>

        {/* Trajectory type selector */}
        <div className="mb-6">
          <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: '#FFACBF' }}>
            Type
          </div>
          <div className="flex gap-1">
            {(['orbit', 'dolly', 'pan'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTrajectoryType(type)}
                disabled={trajectory.isRunning}
                className="flex-1 py-2 text-xs font-semibold rounded transition-colors"
                style={{
                  backgroundColor: trajectoryType === type ? '#B39DFF' : '#555',
                  color: trajectoryType === type ? '#1F1F1F' : '#FDFDFB',
                  cursor: trajectory.isRunning ? 'not-allowed' : 'pointer',
                  opacity: trajectory.isRunning ? 0.5 : 1,
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Config sliders */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#FFACBF' }}>
              Parameters
            </div>
            <button
              onClick={syncWithCamera}
              disabled={!contextA || trajectory.isRunning}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{
                backgroundColor: '#555',
                color: '#FDFDFB',
                cursor: !contextA || trajectory.isRunning ? 'not-allowed' : 'pointer',
                opacity: !contextA || trajectory.isRunning ? 0.5 : 1,
              }}
              title="Set trajectory center and distance from current camera position"
            >
              Sync Camera
            </button>
          </div>

          {/* Common: frame count */}
          <ConfigSlider
            label="Frames"
            value={activeConfig.frameCount}
            min={10}
            max={120}
            step={5}
            unit=""
            tooltip="Number of frames to capture along the trajectory"
            onChange={(v) => {
              const fc = v;
              if (trajectoryType === 'orbit') setOrbitConfig((p) => ({ ...p, frameCount: fc }));
              if (trajectoryType === 'dolly') setDollyConfig((p) => ({ ...p, frameCount: fc }));
              if (trajectoryType === 'pan') setPanConfig((p) => ({ ...p, frameCount: fc }));
            }}
          />

          {/* Type-specific sliders */}
          {trajectoryType === 'orbit' && (
            <>
              <ConfigSlider
                label="Arc"
                value={orbitConfig.arcDegrees}
                min={15}
                max={360}
                step={15}
                unit="deg"
                tooltip="Azimuthal arc in degrees"
                onChange={(v) => setOrbitConfig((p) => ({ ...p, arcDegrees: v }))}
              />
              <ConfigSlider
                label="Elevation"
                value={orbitConfig.elevationDegrees}
                min={-45}
                max={60}
                step={5}
                unit="deg"
                tooltip="Elevation above the horizontal plane"
                onChange={(v) => setOrbitConfig((p) => ({ ...p, elevationDegrees: v }))}
              />
              <ConfigSlider
                label="Distance"
                value={orbitConfig.startDistance}
                min={1}
                max={20}
                step={0.5}
                unit="units"
                tooltip="Camera distance from the scene center"
                onChange={(v) => setOrbitConfig((p) => ({ ...p, startDistance: v }))}
              />
            </>
          )}

          {trajectoryType === 'dolly' && (
            <>
              <ConfigSlider
                label="Start Distance"
                value={dollyConfig.startDistance}
                min={1}
                max={20}
                step={0.5}
                unit="units"
                tooltip="Camera starting distance"
                onChange={(v) => setDollyConfig((p) => ({ ...p, startDistance: v }))}
              />
              <ConfigSlider
                label="End Distance"
                value={dollyConfig.endDistance}
                min={0.5}
                max={15}
                step={0.5}
                unit="units"
                tooltip="Camera ending distance"
                onChange={(v) => setDollyConfig((p) => ({ ...p, endDistance: v }))}
              />
            </>
          )}

          {trajectoryType === 'pan' && (
            <>
              <ConfigSlider
                label="Sweep"
                value={panConfig.sweepDistance}
                min={0.5}
                max={10}
                step={0.5}
                unit="units"
                tooltip="Total lateral sweep distance"
                onChange={(v) => setPanConfig((p) => ({ ...p, sweepDistance: v }))}
              />
              <ConfigSlider
                label="Distance"
                value={panConfig.startDistance}
                min={1}
                max={20}
                step={0.5}
                unit="units"
                tooltip="Camera distance from the scene center"
                onChange={(v) => setPanConfig((p) => ({ ...p, startDistance: v }))}
              />
              <ConfigSlider
                label="Height Offset"
                value={panConfig.heightOffset}
                min={-5}
                max={5}
                step={0.5}
                unit="units"
                tooltip="Vertical offset from scene center"
                onChange={(v) => setPanConfig((p) => ({ ...p, heightOffset: v }))}
              />
            </>
          )}
        </div>

        {/* Reference toggle */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={useReference}
              onChange={(e) => setUseReference(e.target.checked)}
              disabled={!contextB || trajectory.isRunning}
              className="rounded"
              style={{ accentColor: '#B39DFF' }}
            />
            <span style={{ color: contextB ? '#FDFDFB' : '#888' }}>
              Compare with Splat B (per-frame PSNR/SSIM)
            </span>
          </label>
          {!contextB && (
            <div className="text-xs mt-1" style={{ color: '#888' }}>
              Load Splat B to enable reference comparison
            </div>
          )}
        </div>

        {/* Run / Cancel button */}
        <div className="mb-4">
          {trajectory.isRunning ? (
            <button
              onClick={trajectory.cancel}
              className="w-full py-3 text-sm font-semibold rounded-lg transition-colors"
              style={{ backgroundColor: '#FF575F', color: '#FDFDFB' }}
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={!canRun}
              className="w-full py-3 text-sm font-semibold rounded-lg transition-colors"
              style={{
                backgroundColor: canRun ? '#B39DFF' : '#555',
                color: canRun ? '#1F1F1F' : '#888',
                cursor: canRun ? 'pointer' : 'not-allowed',
              }}
            >
              Run Trajectory
            </button>
          )}
          {!contextA && (
            <div className="text-xs mt-2 text-center" style={{ color: '#888' }}>
              Load Splat A to run a trajectory
            </div>
          )}
        </div>

        {/* Progress */}
        {trajectory.isRunning && trajectory.phase === 'capturing' && (
          <ProgressBar
            progress={trajectory.progress}
            label={`Frame ${trajectory.currentFrame} / ${trajectory.totalFrames}`}
            phaseLabel="Phase 1: Capturing Frames"
          />
        )}
        {trajectory.isRunning && trajectory.phase === 'computing' && (
          <ProgressBar
            progress={trajectory.progress}
            label="Analyzing inter-frame metrics..."
            phaseLabel="Phase 2: Computing Metrics"
          />
        )}

        {/* Error */}
        {trajectory.error && (
          <div
            className="mt-4 p-3 rounded-lg text-xs"
            style={{
              backgroundColor: 'rgba(255, 87, 95, 0.15)',
              border: '1px solid #FF575F',
              color: '#FF575F',
            }}
          >
            {trajectory.error}
          </div>
        )}

        {/* Results */}
        {trajectory.result && !trajectory.isRunning && (
          <TemporalConsistencyResult result={trajectory.result} />
        )}
      </div>
    </div>
  );
}
