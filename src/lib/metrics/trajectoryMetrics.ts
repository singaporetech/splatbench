/**
 * Computes per-frame quality metrics along camera trajectories and
 * derives temporal consistency scores. Implements Phase 1 metrics
 * from the interactive quality metrics research plan.
 *
 * See docs/interactive-quality-metrics-research.md, sections 3.1 and 4.1.
 */

import { calculatePSNR, calculateSSIM, calculateWindowedSSIM } from './imageQuality';
import type { SparkViewerContext } from '../../types';
import { assertCaptureHasContent, assertHardwareWebGL } from './captureGates';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PerFrameMetric {
  frameIndex: number;
  t: number;
  psnr: number | null;
  ssim: number | null;
  // 11x11 Gaussian-windowed SSIM, alongside the whole-image value
  ssimWindowed: number | null;
}

export interface InterFrameMetric {
  pairIndex: number;
  ssim: number;
}

export interface TrajectoryMetricsResult {
  perFrameMetrics: PerFrameMetric[];
  interFrameMetrics: InterFrameMetric[];

  aggregatePerFrame: {
    psnrMean: number | null;
    psnrMin: number | null;
    psnrMax: number | null;
    psnrStdDev: number | null;
    ssimMean: number | null;
    ssimMin: number | null;
    ssimMax: number | null;
    ssimStdDev: number | null;
    ssimWindowedMean: number | null;
    ssimWindowedMin: number | null;
  };

  temporalConsistency: {
    interFrameSSIMMean: number;
    interFrameSSIMStdDev: number;
    interFrameSSIMMin: number;
    worstTransitionFrame: number;
  };

  totalFrames: number;

  capturedAt: string;
  trajectoryDescription: string;
}

// ─── Frame Capture ───────────────────────────────────────────────────────────

/**
 * Capture a single frame from a WebGL canvas.
 * Forces a render before reading pixels to ensure fresh data.
 */
export function captureFrame(context: SparkViewerContext): ImageData {
  context.forceRender();

  const canvas = context.canvas;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) {
    throw new Error('Cannot get WebGL context for frame capture');
  }
  assertHardwareWebGL(gl);

  // WebGL2 renderers may leave PIXEL_PACK_BUFFER bound, which breaks readPixels
  const gl2 = gl as WebGL2RenderingContext;
  if (gl2.PIXEL_PACK_BUFFER) {
    gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, null);
  }

  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // WebGL pixels are bottom-left origin, while ImageData is top-left origin
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

  assertCaptureHasContent(imageData);
  return imageData;
}

// ─── Metric Computation ──────────────────────────────────────────────────────

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
    let ssimWindowed: number | null = null;

    try {
      psnr = calculatePSNR(frameA, frameB);
      ssim = calculateSSIM(frameA, frameB);
    } catch {
      console.warn(`Failed to compute metrics for frame ${i}`);
    }

    // guarded separately so a failure cannot drop the whole-image values
    try {
      ssimWindowed = calculateWindowedSSIM(frameA, frameB);
    } catch {
      console.warn(`Failed to compute windowed SSIM for frame ${i}`);
    }

    return {
      frameIndex: i,
      t: tValues[i] ?? i / Math.max(1, framesA.length - 1),
      psnr,
      ssim,
      ssimWindowed,
    };
  });
}

/**
 * Compute inter-frame SSIM between consecutive frames in a single sequence.
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

// ─── Aggregate Statistics ────────────────────────────────────────────────────

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

export function buildTrajectoryMetricsResult(
  perFrameMetrics: PerFrameMetric[],
  interFrameMetrics: InterFrameMetric[],
  trajectoryDescription: string,
): TrajectoryMetricsResult {
  const psnrValues = perFrameMetrics
    .map((m) => m.psnr)
    .filter((v): v is number => v !== null && isFinite(v));
  const psnrStats = psnrValues.length > 0 ? computeStats(psnrValues) : null;

  const ssimValues = perFrameMetrics
    .map((m) => m.ssim)
    .filter((v): v is number => v !== null);
  const ssimStats = ssimValues.length > 0 ? computeStats(ssimValues) : null;

  const ssimWindowedValues = perFrameMetrics
    .map((m) => m.ssimWindowed)
    .filter((v): v is number => v !== null);
  const ssimWindowedStats =
    ssimWindowedValues.length > 0 ? computeStats(ssimWindowedValues) : null;

  // inter-frame SSIM stays whole-image: it measures stability between
  // consecutive frames, not per-frame fidelity against the reference
  const interSSIMValues = interFrameMetrics.map((m) => m.ssim);
  const interStats = computeStats(interSSIMValues);

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
      ssimWindowedMean: ssimWindowedStats?.mean ?? null,
      ssimWindowedMin: ssimWindowedStats?.min ?? null,
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
