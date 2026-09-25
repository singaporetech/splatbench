import type { Test, TestScene, TestResult, OnProgress } from './types';
import { registerTest } from './registry';
import type {
  OrbitConfig,
  DollyConfig,
  PanConfig,
} from '../../lib/camera/trajectories';
import {
  DEFAULT_ORBIT_CONFIG,
  DEFAULT_DOLLY_CONFIG,
  DEFAULT_PAN_CONFIG,
  generateTrajectory,
  applyKeyframe,
} from '../../lib/camera/trajectories';
import {
  captureFrame,
  computeInterFrameSSIM,
  computePerFrameMetrics,
  buildTrajectoryMetricsResult,
} from '../../lib/metrics/trajectoryMetrics';
import type { SparkViewerContext } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Wait for two animation frames so the GPU has committed the latest work.
 */
function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Grade temporal consistency based on inter-frame SSIM std dev.
 */
function gradeTemporalConsistency(stdDev: number): {
  label: string;
  passed: boolean;
} {
  if (stdDev < 0.005) return { label: 'Excellent', passed: true };
  if (stdDev < 0.015) return { label: 'Good', passed: true };
  if (stdDev < 0.03) return { label: 'Fair', passed: true };
  return { label: 'Poor', passed: false };
}

/**
 * Core trajectory test runner shared by all three trajectory types.
 */
async function runTrajectoryTest(
  config: OrbitConfig | DollyConfig | PanConfig,
  scene: TestScene,
  onProgress: OnProgress,
  signal: AbortSignal,
): Promise<TestResult> {
  const startTime = performance.now();
  const testId = `trajectory-${config.type}`;

  const context: SparkViewerContext = scene.primary;
  const referenceContext: SparkViewerContext | null = scene.reference;

  const traj = generateTrajectory(config);
  const totalFrames = traj.keyframes.length;

  // inter-frame SSIM is computed on the frames under test, not the reference
  const framesUnderTest: ImageData[] = [];
  const framesReference: ImageData[] = [];

  const origPos = context.camera.position.clone();
  const origTarget = context.controls.target.clone();
  let refOrigPos: import('three').Vector3 | null = null;
  let refOrigTarget: import('three').Vector3 | null = null;
  if (referenceContext) {
    refOrigPos = referenceContext.camera.position.clone();
    refOrigTarget = referenceContext.controls.target.clone();
  }

  try {
    // phase 1: capture frames
    for (let i = 0; i < totalFrames; i++) {
      if (signal.aborted) throw new Error('Test cancelled');

      const kf = traj.keyframes[i];
      applyKeyframe(context.camera, context.controls, kf);
      if (referenceContext) {
        applyKeyframe(referenceContext.camera, referenceContext.controls, kf);
      }

      await waitForFrame();

      framesUnderTest.push(captureFrame(context));
      if (referenceContext) {
        framesReference.push(captureFrame(referenceContext));
      }

      const captureFraction = (i + 1) / totalFrames;
      onProgress({
        fraction: captureFraction,
        message: `Capturing frame ${i + 1} / ${totalFrames}`,
        phase: 'Phase 1: Capturing Frames',
      });
    }

    // give React a frame to paint the completed capture phase
    onProgress({
      fraction: 1,
      message: `All ${totalFrames} frames captured`,
      phase: 'Phase 1: Capturing Frames',
    });
    await new Promise((r) => setTimeout(r, 50));

    // phase 2: compute metrics with phase-local progress
    onProgress({
      fraction: 0,
      message: 'Computing inter-frame SSIM...',
      phase: 'Phase 2: Computing Metrics',
    });

    await new Promise((r) => setTimeout(r, 0));

    const interFrameMetrics = computeInterFrameSSIM(framesUnderTest);

    onProgress({
      fraction: 0.5,
      message: 'Computing per-frame metrics...',
      phase: 'Phase 2: Computing Metrics',
    });

    await new Promise((r) => setTimeout(r, 0));

    const tValues = traj.keyframes.map((kf) => kf.t);
    // computePerFrameMetrics takes (reference, test) in that order
    const perFrameMetrics =
      framesReference.length > 0
        ? computePerFrameMetrics(framesReference, framesUnderTest, tValues)
        : tValues.map((t, idx) => ({
            frameIndex: idx,
            t,
            psnr: null as number | null,
            ssim: null as number | null,
          }));

    const metricsResult = buildTrajectoryMetricsResult(
      perFrameMetrics,
      interFrameMetrics,
      traj.description,
    );

    onProgress({
      fraction: 1,
      message: 'Complete',
      phase: 'Phase 2: Computing Metrics',
    });

    context.camera.position.copy(origPos);
    context.controls.target.copy(origTarget);
    context.controls.update();
    if (referenceContext && refOrigPos && refOrigTarget) {
      referenceContext.camera.position.copy(refOrigPos);
      referenceContext.controls.target.copy(refOrigTarget);
      referenceContext.controls.update();
    }

    const tc = metricsResult.temporalConsistency;
    const grade = gradeTemporalConsistency(tc.interFrameSSIMStdDev);
    const durationMs = performance.now() - startTime;

    const metrics: Record<string, number> = {
      interFrameSSIMMean: tc.interFrameSSIMMean,
      interFrameSSIMStdDev: tc.interFrameSSIMStdDev,
      interFrameSSIMMin: tc.interFrameSSIMMin,
      worstTransitionFrame: tc.worstTransitionFrame,
      totalFrames: metricsResult.totalFrames,
    };

    if (metricsResult.aggregatePerFrame.psnrMean !== null) {
      metrics.psnrMean = metricsResult.aggregatePerFrame.psnrMean;
    }
    if (metricsResult.aggregatePerFrame.ssimMean !== null) {
      metrics.ssimMean = metricsResult.aggregatePerFrame.ssimMean;
    }
    if (metricsResult.aggregatePerFrame.psnrMin !== null) {
      metrics.psnrMin = metricsResult.aggregatePerFrame.psnrMin;
    }
    if (metricsResult.aggregatePerFrame.ssimMin !== null) {
      metrics.ssimMin = metricsResult.aggregatePerFrame.ssimMin;
    }

    return {
      testId,
      metrics,
      metricEntries: [
        {
          label: 'Inter-frame SSIM (mean)',
          value: tc.interFrameSSIMMean,
          higherIsBetter: true,
        },
        {
          label: 'SSIM Std Dev',
          value: tc.interFrameSSIMStdDev,
          higherIsBetter: false,
        },
        {
          label: 'Worst SSIM',
          value: tc.interFrameSSIMMin,
          higherIsBetter: true,
        },
        {
          label: 'Worst Frame',
          value: tc.worstTransitionFrame,
          higherIsBetter: null,
        },
        ...(metricsResult.aggregatePerFrame.psnrMean !== null
          ? [
              {
                label: 'PSNR (mean)',
                value: metricsResult.aggregatePerFrame.psnrMean,
                unit: 'dB',
                higherIsBetter: true as boolean | null,
              },
            ]
          : []),
        ...(metricsResult.aggregatePerFrame.ssimMean !== null
          ? [
              {
                label: 'SSIM vs Ref (mean)',
                value: metricsResult.aggregatePerFrame.ssimMean,
                higherIsBetter: true as boolean | null,
              },
            ]
          : []),
      ],
      summary: `${config.type} trajectory: ${grade.label} (SSIM mean ${tc.interFrameSSIMMean.toFixed(4)}, std dev ${tc.interFrameSSIMStdDev.toFixed(6)})`,
      passed: grade.passed,
      completedAt: new Date().toISOString(),
      durationMs,
    };
  } catch (err) {
    // restore camera even on error
    context.camera.position.copy(origPos);
    context.controls.target.copy(origTarget);
    context.controls.update();
    if (referenceContext && refOrigPos && refOrigTarget) {
      referenceContext.camera.position.copy(refOrigPos);
      referenceContext.controls.target.copy(refOrigTarget);
      referenceContext.controls.update();
    }
    throw err;
  }
}

// ─── Test Definitions ────────────────────────────────────────────────────────

const orbitTest: Test = {
  id: 'trajectory-orbit',
  name: 'Orbit Trajectory',
  description:
    'Camera sweeps azimuthally around the scene center. Measures temporal consistency during rotation.',
  category: 'Trajectory',
  run: (scene, onProgress, signal) =>
    runTrajectoryTest(DEFAULT_ORBIT_CONFIG, scene, onProgress, signal),
};

const dollyTest: Test = {
  id: 'trajectory-dolly',
  name: 'Dolly Trajectory',
  description:
    'Camera moves along the view axis toward the scene. Measures consistency during zoom-in.',
  category: 'Trajectory',
  run: (scene, onProgress, signal) =>
    runTrajectoryTest(DEFAULT_DOLLY_CONFIG, scene, onProgress, signal),
};

const panTest: Test = {
  id: 'trajectory-pan',
  name: 'Pan Trajectory',
  description:
    'Camera sweeps laterally at fixed distance. Measures consistency during lateral movement.',
  category: 'Trajectory',
  run: (scene, onProgress, signal) =>
    runTrajectoryTest(DEFAULT_PAN_CONFIG, scene, onProgress, signal),
};

// ─── Auto-Registration ───────────────────────────────────────────────────────

registerTest(orbitTest);
registerTest(dollyTest);
registerTest(panTest);

export { orbitTest, dollyTest, panTest };
