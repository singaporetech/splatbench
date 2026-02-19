/**
 * React hook for trajectory playback and metrics capture.
 *
 * Manages camera trajectory animation, frame capture at each keyframe,
 * and computation of inter-frame SSIM (temporal consistency) and
 * per-frame PSNR/SSIM (quality vs reference).
 *
 * Usage:
 *   const trajectory = useTrajectory();
 *   // Start a trajectory run on viewer A (with optional reference viewer B):
 *   await trajectory.run(contextA, orbitConfig, contextB);
 *   // Results in trajectory.result
 */

import { useState, useCallback, useRef } from 'react';
import type { SparkViewerContext } from '../types';
import type { OrbitConfig, DollyConfig, PanConfig, TrajectoryResult } from '../lib/camera/trajectories';
import { generateTrajectory, applyKeyframe } from '../lib/camera/trajectories';
import type { TrajectoryMetricsResult } from '../lib/metrics/trajectoryMetrics';
import {
  captureFrame,
  computePerFrameMetrics,
  computeInterFrameSSIM,
  buildTrajectoryMetricsResult,
} from '../lib/metrics/trajectoryMetrics';

export interface UseTrajectoryState {
  /** Whether a trajectory run is currently in progress */
  isRunning: boolean;
  /** Current frame index during a run */
  currentFrame: number;
  /** Total frames in the active trajectory */
  totalFrames: number;
  /** Progress from 0 to 1 */
  progress: number;
  /** Most recent trajectory metrics result (null before first run) */
  result: TrajectoryMetricsResult | null;
  /** Error message if the run failed */
  error: string | null;
  /** The generated trajectory (keyframes etc.) */
  trajectory: TrajectoryResult | null;
}

export interface UseTrajectoryReturn extends UseTrajectoryState {
  /** Run a trajectory on the given viewer(s) and compute metrics */
  run: (
    context: SparkViewerContext,
    config: OrbitConfig | DollyConfig | PanConfig,
    referenceContext?: SparkViewerContext | null,
  ) => Promise<TrajectoryMetricsResult | null>;
  /** Cancel a running trajectory */
  cancel: () => void;
  /** Reset state to initial */
  reset: () => void;
}

/**
 * Wait for the next animation frame. Ensures the browser has
 * committed the latest GPU work before we read back pixels.
 */
function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export function useTrajectory(): UseTrajectoryReturn {
  const [state, setState] = useState<UseTrajectoryState>({
    isRunning: false,
    currentFrame: 0,
    totalFrames: 0,
    progress: 0,
    result: null,
    error: null,
    trajectory: null,
  });

  const cancelledRef = useRef(false);

  const run = useCallback(
    async (
      context: SparkViewerContext,
      config: OrbitConfig | DollyConfig | PanConfig,
      referenceContext?: SparkViewerContext | null,
    ): Promise<TrajectoryMetricsResult | null> => {
      cancelledRef.current = false;

      // Generate trajectory
      const traj = generateTrajectory(config);

      setState({
        isRunning: true,
        currentFrame: 0,
        totalFrames: traj.keyframes.length,
        progress: 0,
        result: null,
        error: null,
        trajectory: traj,
      });

      try {
        const framesA: ImageData[] = [];
        const framesB: ImageData[] = [];

        // Save original camera state so we can restore it
        const origPos = context.camera.position.clone();
        const origTarget = context.controls.target.clone();

        let refOrigPos: import('three').Vector3 | null = null;
        let refOrigTarget: import('three').Vector3 | null = null;
        if (referenceContext) {
          refOrigPos = referenceContext.camera.position.clone();
          refOrigTarget = referenceContext.controls.target.clone();
        }

        // Iterate over keyframes
        for (let i = 0; i < traj.keyframes.length; i++) {
          if (cancelledRef.current) {
            throw new Error('Trajectory cancelled');
          }

          const kf = traj.keyframes[i];

          // Apply keyframe to primary viewer
          applyKeyframe(context.camera, context.controls, kf);

          // Apply same keyframe to reference viewer if present
          if (referenceContext) {
            applyKeyframe(referenceContext.camera, referenceContext.controls, kf);
          }

          // Wait for renders to complete
          await waitForFrame();

          // Capture frames
          framesA.push(captureFrame(context));
          if (referenceContext) {
            framesB.push(captureFrame(referenceContext));
          }

          // Update progress
          setState((prev) => ({
            ...prev,
            currentFrame: i + 1,
            progress: (i + 1) / traj.keyframes.length,
          }));
        }

        // Compute inter-frame SSIM on primary viewer (temporal consistency)
        const interFrameMetrics = computeInterFrameSSIM(framesA);

        // Compute per-frame metrics if we have a reference
        const tValues = traj.keyframes.map((kf) => kf.t);
        const perFrameMetrics =
          framesB.length > 0
            ? computePerFrameMetrics(framesB, framesA, tValues)
            : tValues.map((t, idx) => ({
                frameIndex: idx,
                t,
                psnr: null as number | null,
                ssim: null as number | null,
              }));

        // Build aggregated result
        const metricsResult = buildTrajectoryMetricsResult(
          perFrameMetrics,
          interFrameMetrics,
          traj.description,
        );

        // Restore original camera positions
        context.camera.position.copy(origPos);
        context.controls.target.copy(origTarget);
        context.controls.update();

        if (referenceContext && refOrigPos && refOrigTarget) {
          referenceContext.camera.position.copy(refOrigPos);
          referenceContext.controls.target.copy(refOrigTarget);
          referenceContext.controls.update();
        }

        setState((prev) => ({
          ...prev,
          isRunning: false,
          progress: 1,
          result: metricsResult,
        }));

        console.log('[Trajectory] Run complete:', {
          frames: traj.keyframes.length,
          interFrameSSIMMean: metricsResult.temporalConsistency.interFrameSSIMMean.toFixed(4),
          interFrameSSIMStdDev: metricsResult.temporalConsistency.interFrameSSIMStdDev.toFixed(6),
          worstFrame: metricsResult.temporalConsistency.worstTransitionFrame,
        });

        return metricsResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Trajectory] Run failed:', message);
        setState((prev) => ({
          ...prev,
          isRunning: false,
          error: message,
        }));
        return null;
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setState({
      isRunning: false,
      currentFrame: 0,
      totalFrames: 0,
      progress: 0,
      result: null,
      error: null,
      trajectory: null,
    });
  }, []);

  return {
    ...state,
    run,
    cancel,
    reset,
  };
}
