/**
 * Trajectory-Based Quality Metrics for SplatBench
 *
 * Computes per-frame quality metrics along camera trajectories and
 * derives temporal consistency scores. Implements Phase 1 metrics
 * from the interactive quality metrics research plan.
 *
 * First dynamic quality metric: Inter-frame SSIM variance.
 *
 * Rationale for choosing Inter-frame SSIM variance as the first metric:
 * 1. Priority 1 in the research plan (immediate, low effort).
 * 2. Reference-free: does not require ground-truth reference renderings.
 * 3. Directly detects temporal flickering and popping artifacts, which are
 *    the most commonly reported artifacts in 3DGS rendering during camera
 *    movement (per Liang et al. 2024 and Zhang et al. 2025).
 * 4. Trivial to implement using the existing SSIM computation code.
 * 5. Produces a single scalar score that is easy to interpret: lower
 *    variance means more temporally consistent rendering.
 *
 * See: docs/interactive-quality-metrics-research.md, Section 3.1 and 4.1
 */

import { calculatePSNR, calculateSSIM } from './imageQuality';
import type { SparkViewerContext } from '../../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PerFrameMetric {
  frameIndex: number;
  t: number; // normalized [0,1] position along trajectory
  psnr: number | null; // null if no reference available
  ssim: number | null; // null if no reference available
}

export interface InterFrameMetric {
  /** Pair index: consecutive frames (i, i+1) */
  pairIndex: number;
  /** SSIM between frame i and frame i+1 (same viewer) */
  ssim: number;
}

export interface TrajectoryMetricsResult {
  /** Per-frame metrics (PSNR/SSIM vs reference if available) */
  perFrameMetrics: PerFrameMetric[];
  /** Inter-frame SSIM between consecutive frames (temporal consistency) */
  interFrameMetrics: InterFrameMetric[];

  /** Aggregate statistics for per-frame metrics */
  aggregatePerFrame: {
    psnrMean: number | null;
    psnrMin: number | null;
    psnrMax: number | null;
    psnrStdDev: number | null;
    ssimMean: number | null;
    ssimMin: number | null;
    ssimMax: number | null;
    ssimStdDev: number | null;
  };

  /** Temporal consistency score: inter-frame SSIM variance */
  temporalConsistency: {
    /** Mean inter-frame SSIM (higher = more consistent between frames) */
    interFrameSSIMMean: number;
    /** Standard deviation of inter-frame SSIM (lower = more stable) */
    interFrameSSIMStdDev: number;
    /** Minimum inter-frame SSIM (identifies worst transition) */
    interFrameSSIMMin: number;
    /** Frame index of worst transition */
    worstTransitionFrame: number;
  };

  /** Total frames captured */
  totalFrames: number;

  /** Capture metadata */
  capturedAt: string;
  trajectoryDescription: string;
}

// ─── Frame Capture ──────────────────────────────────────────────────────────

/**
 * Capture a single frame from a WebGL canvas.
 * Forces a render before reading pixels to ensure fresh data.
 */
export function captureFrame(context: SparkViewerContext): ImageData {
  // Force render to get latest frame
  context.forceRender();

  const canvas = context.canvas;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    throw new Error('Cannot get WebGL context for frame capture');
  }

  // Unbind any PIXEL_PACK_BUFFER left by the renderer (WebGL2 PBO)
  // to avoid "a buffer is bound to PIXEL_PACK_BUFFER" errors on readPixels
  const gl2 = gl as WebGL2RenderingContext;
  if (gl2.PIXEL_PACK_BUFFER) {
    gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, null);
  }

  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Flip vertically (WebGL origin is bottom-left)
  const imageData = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = ((height - 1 - y) * width + x) * 4;
      const dstIdx = (y * width + x) * 4;
      imageData.data[dstIdx] = pixels[srcIdx];
      imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
      imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
      imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  return imageData;
}

// ─── Metric Computation ─────────────────────────────────────────────────────

/**
 * Compute per-frame PSNR and SSIM between two frame sequences (A vs B).
 * frameSequenceA is the reference, frameSequenceB is the test.
 * Both arrays must have the same length and matching frame dimensions.
 */
export function computePerFrameMetrics(
  framesA: ImageData[],
  framesB: ImageData[],
  tValues: number[],
): PerFrameMetric[] {
  if (framesA.length !== framesB.length) {
    throw new Error(
      `Frame count mismatch: reference has ${framesA.length} frames, test has ${framesB.length}`
    );
  }

  return framesA.map((frameA, i) => {
    const frameB = framesB[i];
    let psnr: number | null = null;
    let ssim: number | null = null;

    try {
      psnr = calculatePSNR(frameA, frameB);
      ssim = calculateSSIM(frameA, frameB);
    } catch {
      console.warn(`Failed to compute metrics for frame ${i}`);
    }

    return {
      frameIndex: i,
      t: tValues[i] ?? i / Math.max(1, framesA.length - 1),
      psnr,
      ssim,
    };
  });
}

/**
 * Compute inter-frame SSIM between consecutive frames in a single sequence.
 * This is the core temporal consistency metric.
 *
 * High SSIM between consecutive frames = smooth, consistent rendering.
 * Sudden SSIM drops = flickering, popping, or view-dependent artifacts.
 */
export function computeInterFrameSSIM(frames: ImageData[]): InterFrameMetric[] {
  if (frames.length < 2) return [];

  const results: InterFrameMetric[] = [];

  for (let i = 0; i < frames.length - 1; i++) {
    try {
      const ssim = calculateSSIM(frames[i], frames[i + 1]);
      results.push({ pairIndex: i, ssim });
    } catch {
      console.warn(`Failed to compute inter-frame SSIM for pair ${i}-${i + 1}`);
    }
  }

  return results;
}

// ─── Aggregate Statistics ───────────────────────────────────────────────────

function computeStats(values: number[]): {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
} {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, stdDev: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, min, max, stdDev };
}

/**
 * Build the complete trajectory metrics result from raw frame data.
 */
export function buildTrajectoryMetricsResult(
  perFrameMetrics: PerFrameMetric[],
  interFrameMetrics: InterFrameMetric[],
  trajectoryDescription: string,
): TrajectoryMetricsResult {
  // Aggregate per-frame PSNR
  const psnrValues = perFrameMetrics
    .map((m) => m.psnr)
    .filter((v): v is number => v !== null && isFinite(v));
  const psnrStats = psnrValues.length > 0 ? computeStats(psnrValues) : null;

  // Aggregate per-frame SSIM
  const ssimValues = perFrameMetrics
    .map((m) => m.ssim)
    .filter((v): v is number => v !== null);
  const ssimStats = ssimValues.length > 0 ? computeStats(ssimValues) : null;

  // Inter-frame temporal consistency
  const interSSIMValues = interFrameMetrics.map((m) => m.ssim);
  const interStats = computeStats(interSSIMValues);

  // Find worst transition
  let worstTransitionFrame = 0;
  let worstSSIM = 1;
  for (const m of interFrameMetrics) {
    if (m.ssim < worstSSIM) {
      worstSSIM = m.ssim;
      worstTransitionFrame = m.pairIndex;
    }
  }

  return {
    perFrameMetrics,
    interFrameMetrics,
    aggregatePerFrame: {
      psnrMean: psnrStats?.mean ?? null,
      psnrMin: psnrStats?.min ?? null,
      psnrMax: psnrStats?.max ?? null,
      psnrStdDev: psnrStats?.stdDev ?? null,
      ssimMean: ssimStats?.mean ?? null,
      ssimMin: ssimStats?.min ?? null,
      ssimMax: ssimStats?.max ?? null,
      ssimStdDev: ssimStats?.stdDev ?? null,
    },
    temporalConsistency: {
      interFrameSSIMMean: interStats.mean,
      interFrameSSIMStdDev: interStats.stdDev,
      interFrameSSIMMin: interStats.min,
      worstTransitionFrame,
    },
    totalFrames: perFrameMetrics.length || interFrameMetrics.length + 1,
    capturedAt: new Date().toISOString(),
    trajectoryDescription,
  };
}
