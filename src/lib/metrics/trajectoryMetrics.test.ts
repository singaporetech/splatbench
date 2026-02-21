/**
 * Comprehensive tests for trajectory metric computation and data integrity.
 *
 * Verifies that:
 * - Inter-frame SSIM computation is correct for known frame sequences
 * - Per-frame metrics handle reference/test pairs accurately
 * - buildTrajectoryMetricsResult aggregates correctly
 * - Data integrity: frames captured = frames processed
 * - Edge cases: single frame, max frames, uniform sequences
 * - Determinism: same input produces same output
 */

import { describe, it, expect } from 'vitest';
import {
  computePerFrameMetrics,
  computeInterFrameSSIM,
  buildTrajectoryMetricsResult,
} from './trajectoryMetrics';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createImageData(
  width: number,
  height: number,
  fill: [number, number, number, number] = [0, 0, 0, 255],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { data, width, height, colorSpace: 'srgb' as PredefinedColorSpace };
}

function createImageDataFromPixels(
  width: number,
  height: number,
  pixelFn: (x: number, y: number) => [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = pixelFn(x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  return { data, width, height, colorSpace: 'srgb' as PredefinedColorSpace };
}

/** Generate a sequence of frames with controlled variation. */
function generateFrameSequence(
  count: number,
  width: number,
  height: number,
  baseBrightness: number = 128,
  brightnessStep: number = 0,
): ImageData[] {
  const frames: ImageData[] = [];
  for (let i = 0; i < count; i++) {
    const v = Math.min(255, Math.max(0, Math.round(baseBrightness + i * brightnessStep)));
    frames.push(createImageData(width, height, [v, v, v, 255]));
  }
  return frames;
}

// ─── computeInterFrameSSIM Tests ────────────────────────────────────────────

describe('computeInterFrameSSIM', () => {
  it('returns empty array for single frame', () => {
    const frames = generateFrameSequence(1, 8, 8);
    const result = computeInterFrameSSIM(frames);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for zero frames', () => {
    const result = computeInterFrameSSIM([]);
    expect(result).toHaveLength(0);
  });

  it('returns N-1 pairs for N frames', () => {
    for (const n of [2, 5, 10, 30]) {
      const frames = generateFrameSequence(n, 8, 8);
      const result = computeInterFrameSSIM(frames);
      expect(result).toHaveLength(n - 1);
    }
  });

  it('all pairs have SSIM = 1.0 for identical frames', () => {
    const frames = generateFrameSequence(5, 8, 8, 128, 0);
    const result = computeInterFrameSSIM(frames);
    for (const pair of result) {
      expect(pair.ssim).toBeCloseTo(1.0, 4);
    }
  });

  it('detects low SSIM for abrupt change in sequence', () => {
    // 4 identical frames, then 1 very different frame
    const frames = [
      ...generateFrameSequence(4, 8, 8, 128, 0),
      createImageData(8, 8, [255, 0, 0, 255]), // Red frame
    ];

    const result = computeInterFrameSSIM(frames);
    expect(result).toHaveLength(4);

    // First 3 pairs should have high SSIM (identical frames)
    for (let i = 0; i < 3; i++) {
      expect(result[i].ssim).toBeCloseTo(1.0, 4);
    }

    // Last pair (gray -> red) should have lower SSIM
    // Whole-image SSIM for uniform gray(128)→red(255,0,0) is ~0.879 due to
    // luminance/contrast similarity in the SSIM formula, so use 0.9 threshold
    expect(result[3].ssim).toBeLessThan(0.9);
  });

  it('pair indices are sequential', () => {
    const frames = generateFrameSequence(6, 8, 8, 100, 5);
    const result = computeInterFrameSSIM(frames);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].pairIndex).toBe(i);
    }
  });

  it('SSIM decreases with larger frame-to-frame differences', () => {
    const smallStep = generateFrameSequence(5, 16, 16, 100, 1);
    const largeStep = generateFrameSequence(5, 16, 16, 100, 20);

    const resultSmall = computeInterFrameSSIM(smallStep);
    const resultLarge = computeInterFrameSSIM(largeStep);

    const avgSmall = resultSmall.reduce((s, p) => s + p.ssim, 0) / resultSmall.length;
    const avgLarge = resultLarge.reduce((s, p) => s + p.ssim, 0) / resultLarge.length;

    expect(avgSmall).toBeGreaterThan(avgLarge);
  });
});

// ─── computePerFrameMetrics Tests ───────────────────────────────────────────

describe('computePerFrameMetrics', () => {
  it('returns correct number of metrics', () => {
    const n = 5;
    const framesA = generateFrameSequence(n, 8, 8);
    const framesB = generateFrameSequence(n, 8, 8);
    const tValues = Array.from({ length: n }, (_, i) => i / (n - 1));

    const result = computePerFrameMetrics(framesA, framesB, tValues);
    expect(result).toHaveLength(n);
  });

  it('returns PSNR=Infinity and SSIM=1.0 for identical frames', () => {
    const frames = generateFrameSequence(3, 8, 8, 128);
    const tValues = [0, 0.5, 1];

    const result = computePerFrameMetrics(frames, frames, tValues);
    for (const m of result) {
      expect(m.psnr).toBe(Infinity);
      expect(m.ssim).toBeCloseTo(1.0, 4);
    }
  });

  it('preserves t values', () => {
    const frames = generateFrameSequence(4, 8, 8);
    const tValues = [0, 0.333, 0.667, 1.0];

    const result = computePerFrameMetrics(frames, frames, tValues);
    for (let i = 0; i < tValues.length; i++) {
      expect(result[i].t).toBeCloseTo(tValues[i], 4);
    }
  });

  it('frameIndex is sequential', () => {
    const n = 5;
    const frames = generateFrameSequence(n, 8, 8);
    const tValues = Array.from({ length: n }, (_, i) => i / (n - 1));

    const result = computePerFrameMetrics(frames, frames, tValues);
    for (let i = 0; i < n; i++) {
      expect(result[i].frameIndex).toBe(i);
    }
  });

  it('throws on frame count mismatch', () => {
    const a = generateFrameSequence(3, 8, 8);
    const b = generateFrameSequence(5, 8, 8);
    const t = [0, 0.5, 1];

    expect(() => computePerFrameMetrics(a, b, t)).toThrow('Frame count mismatch');
  });

  it('detects quality differences between reference and test', () => {
    const reference = generateFrameSequence(3, 16, 16, 128);
    const similar = generateFrameSequence(3, 16, 16, 130);
    const different = generateFrameSequence(3, 16, 16, 200);
    const t = [0, 0.5, 1];

    const resultSimilar = computePerFrameMetrics(reference, similar, t);
    const resultDifferent = computePerFrameMetrics(reference, different, t);

    // Similar should have higher PSNR/SSIM than different
    for (let i = 0; i < 3; i++) {
      expect(resultSimilar[i].psnr!).toBeGreaterThan(resultDifferent[i].psnr!);
      expect(resultSimilar[i].ssim!).toBeGreaterThan(resultDifferent[i].ssim!);
    }
  });
});

// ─── buildTrajectoryMetricsResult Tests ─────────────────────────────────────

describe('buildTrajectoryMetricsResult', () => {
  it('produces correct totalFrames', () => {
    const frames = generateFrameSequence(10, 8, 8);
    const interFrame = computeInterFrameSSIM(frames);
    const tValues = Array.from({ length: 10 }, (_, i) => i / 9);
    const perFrame = tValues.map((t, i) => ({
      frameIndex: i,
      t,
      psnr: null as number | null,
      ssim: null as number | null,
    }));

    const result = buildTrajectoryMetricsResult(perFrame, interFrame, 'test');
    expect(result.totalFrames).toBe(10);
  });

  it('computes correct temporal consistency stats for identical frames', () => {
    const frames = generateFrameSequence(5, 8, 8, 128, 0);
    const interFrame = computeInterFrameSSIM(frames);
    const perFrame = Array.from({ length: 5 }, (_, i) => ({
      frameIndex: i,
      t: i / 4,
      psnr: null as number | null,
      ssim: null as number | null,
    }));

    const result = buildTrajectoryMetricsResult(perFrame, interFrame, 'identical test');

    expect(result.temporalConsistency.interFrameSSIMMean).toBeCloseTo(1.0, 4);
    expect(result.temporalConsistency.interFrameSSIMStdDev).toBeCloseTo(0, 4);
    expect(result.temporalConsistency.interFrameSSIMMin).toBeCloseTo(1.0, 4);
  });

  it('identifies worst transition frame correctly', () => {
    // Create sequence: identical, identical, JUMP, identical
    const frames = [
      createImageData(8, 8, [128, 128, 128, 255]),
      createImageData(8, 8, [128, 128, 128, 255]),
      createImageData(8, 8, [128, 128, 128, 255]),
      createImageData(8, 8, [0, 255, 0, 255]),    // Abrupt change at index 3
      createImageData(8, 8, [0, 255, 0, 255]),
    ];

    const interFrame = computeInterFrameSSIM(frames);
    const perFrame = frames.map((_, i) => ({
      frameIndex: i,
      t: i / 4,
      psnr: null as number | null,
      ssim: null as number | null,
    }));

    const result = buildTrajectoryMetricsResult(perFrame, interFrame, 'jump test');

    // Worst transition should be pair 2 (frame 2->3)
    expect(result.temporalConsistency.worstTransitionFrame).toBe(2);
  });

  it('aggregates per-frame PSNR/SSIM when available', () => {
    const perFrame = [
      { frameIndex: 0, t: 0, psnr: 30, ssim: 0.9 },
      { frameIndex: 1, t: 0.5, psnr: 40, ssim: 0.95 },
      { frameIndex: 2, t: 1.0, psnr: 35, ssim: 0.92 },
    ];
    const interFrame = [
      { pairIndex: 0, ssim: 0.98 },
      { pairIndex: 1, ssim: 0.97 },
    ];

    const result = buildTrajectoryMetricsResult(perFrame, interFrame, 'ref test');

    expect(result.aggregatePerFrame.psnrMean).toBeCloseTo(35, 4);
    expect(result.aggregatePerFrame.psnrMin).toBe(30);
    expect(result.aggregatePerFrame.psnrMax).toBe(40);
    expect(result.aggregatePerFrame.ssimMean).toBeCloseTo(0.9233, 3);
    expect(result.aggregatePerFrame.ssimMin).toBe(0.9);
    expect(result.aggregatePerFrame.ssimMax).toBe(0.95);
  });

  it('handles null per-frame metrics (no reference)', () => {
    const perFrame = [
      { frameIndex: 0, t: 0, psnr: null, ssim: null },
      { frameIndex: 1, t: 0.5, psnr: null, ssim: null },
    ];
    const interFrame = [{ pairIndex: 0, ssim: 0.99 }];

    const result = buildTrajectoryMetricsResult(perFrame, interFrame, 'no-ref');

    expect(result.aggregatePerFrame.psnrMean).toBeNull();
    expect(result.aggregatePerFrame.ssimMean).toBeNull();
    // But temporal consistency should still be computed
    expect(result.temporalConsistency.interFrameSSIMMean).toBeCloseTo(0.99, 4);
  });

  it('includes capturedAt timestamp', () => {
    const perFrame = [{ frameIndex: 0, t: 0, psnr: null, ssim: null }];
    const result = buildTrajectoryMetricsResult(perFrame, [], 'ts test');
    expect(result.capturedAt).toBeTruthy();
    // Should be valid ISO date
    expect(() => new Date(result.capturedAt)).not.toThrow();
  });

  it('preserves trajectory description', () => {
    const desc = 'Orbit: 90 deg arc, 15 deg elevation, 5 units radius, 60 frames';
    const perFrame = [{ frameIndex: 0, t: 0, psnr: null, ssim: null }];
    const result = buildTrajectoryMetricsResult(perFrame, [], desc);
    expect(result.trajectoryDescription).toBe(desc);
  });
});

// ─── Determinism Tests ──────────────────────────────────────────────────────

describe('determinism', () => {
  it('same frames produce identical inter-frame SSIM results', () => {
    const frames = generateFrameSequence(5, 16, 16, 100, 3);

    const result1 = computeInterFrameSSIM(frames);
    const result2 = computeInterFrameSSIM(frames);

    expect(result1).toHaveLength(result2.length);
    for (let i = 0; i < result1.length; i++) {
      expect(result1[i].ssim).toBe(result2[i].ssim);
      expect(result1[i].pairIndex).toBe(result2[i].pairIndex);
    }
  });

  it('same frames produce identical per-frame metrics', () => {
    const a = generateFrameSequence(3, 16, 16, 100);
    const b = generateFrameSequence(3, 16, 16, 120);
    const t = [0, 0.5, 1];

    const result1 = computePerFrameMetrics(a, b, t);
    const result2 = computePerFrameMetrics(a, b, t);

    for (let i = 0; i < result1.length; i++) {
      expect(result1[i].psnr).toBe(result2[i].psnr);
      expect(result1[i].ssim).toBe(result2[i].ssim);
    }
  });

  it('full pipeline is deterministic (same input -> same aggregates)', () => {
    const frames = generateFrameSequence(8, 16, 16, 100, 2);
    const interFrame = computeInterFrameSSIM(frames);
    const perFrame = frames.map((_, i) => ({
      frameIndex: i,
      t: i / 7,
      psnr: null as number | null,
      ssim: null as number | null,
    }));

    const r1 = buildTrajectoryMetricsResult(perFrame, interFrame, 'det-test');
    const r2 = buildTrajectoryMetricsResult(perFrame, interFrame, 'det-test');

    expect(r1.temporalConsistency.interFrameSSIMMean).toBe(r2.temporalConsistency.interFrameSSIMMean);
    expect(r1.temporalConsistency.interFrameSSIMStdDev).toBe(r2.temporalConsistency.interFrameSSIMStdDev);
    expect(r1.temporalConsistency.interFrameSSIMMin).toBe(r2.temporalConsistency.interFrameSSIMMin);
    expect(r1.temporalConsistency.worstTransitionFrame).toBe(r2.temporalConsistency.worstTransitionFrame);
    expect(r1.totalFrames).toBe(r2.totalFrames);
  });
});

// ─── Data Integrity Tests ───────────────────────────────────────────────────

describe('data integrity', () => {
  it('frame count is preserved through the pipeline', () => {
    for (const n of [2, 5, 10, 30, 60]) {
      const frames = generateFrameSequence(n, 8, 8, 128, 1);
      const interFrame = computeInterFrameSSIM(frames);
      const tValues = Array.from({ length: n }, (_, i) => i / Math.max(1, n - 1));
      const perFrame = tValues.map((t, i) => ({
        frameIndex: i,
        t,
        psnr: null as number | null,
        ssim: null as number | null,
      }));

      const result = buildTrajectoryMetricsResult(perFrame, interFrame, `${n}-frame test`);

      expect(result.totalFrames).toBe(n);
      expect(result.perFrameMetrics).toHaveLength(n);
      expect(result.interFrameMetrics).toHaveLength(n - 1);
    }
  });

  it('no frame data is dropped in inter-frame computation', () => {
    const n = 20;
    const frames = generateFrameSequence(n, 8, 8, 50, 5);
    const interFrame = computeInterFrameSSIM(frames);

    // Should have exactly n-1 pairs
    expect(interFrame).toHaveLength(n - 1);

    // Every pair index should be present
    const indices = interFrame.map((p) => p.pairIndex);
    for (let i = 0; i < n - 1; i++) {
      expect(indices).toContain(i);
    }

    // Every SSIM value should be a valid number
    for (const pair of interFrame) {
      expect(typeof pair.ssim).toBe('number');
      expect(isNaN(pair.ssim)).toBe(false);
      expect(pair.ssim).toBeGreaterThanOrEqual(0);
      expect(pair.ssim).toBeLessThanOrEqual(1);
    }
  });

  it('per-frame metrics produce valid numbers for all frames', () => {
    const n = 10;
    const a = generateFrameSequence(n, 16, 16, 100);
    const b = generateFrameSequence(n, 16, 16, 110);
    const t = Array.from({ length: n }, (_, i) => i / (n - 1));

    const result = computePerFrameMetrics(a, b, t);

    for (const m of result) {
      expect(typeof m.psnr).toBe('number');
      expect(typeof m.ssim).toBe('number');
      expect(isNaN(m.psnr!)).toBe(false);
      expect(isNaN(m.ssim!)).toBe(false);
      expect(m.psnr!).toBeGreaterThan(0);
      expect(m.ssim!).toBeGreaterThan(0);
      expect(m.ssim!).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles 2 frames (minimum for inter-frame)', () => {
    const frames = [
      createImageData(8, 8, [100, 100, 100, 255]),
      createImageData(8, 8, [110, 110, 110, 255]),
    ];

    const interFrame = computeInterFrameSSIM(frames);
    expect(interFrame).toHaveLength(1);
    expect(interFrame[0].ssim).toBeGreaterThan(0);
    expect(interFrame[0].ssim).toBeLessThanOrEqual(1);
  });

  it('handles large frame count (120 frames)', () => {
    const frames = generateFrameSequence(120, 8, 8, 100, 0.5);
    const interFrame = computeInterFrameSSIM(frames);
    expect(interFrame).toHaveLength(119);

    // All values should be valid
    for (const pair of interFrame) {
      expect(typeof pair.ssim).toBe('number');
      expect(pair.ssim).toBeGreaterThan(0);
    }
  });

  it('handles zero-motion trajectory (all identical frames)', () => {
    const frames = generateFrameSequence(30, 16, 16, 128, 0);
    const interFrame = computeInterFrameSSIM(frames);

    // All SSIM should be exactly 1.0 (no change between frames)
    for (const pair of interFrame) {
      expect(pair.ssim).toBeCloseTo(1.0, 4);
    }

    const perFrame = frames.map((_, i) => ({
      frameIndex: i,
      t: i / 29,
      psnr: null as number | null,
      ssim: null as number | null,
    }));

    const result = buildTrajectoryMetricsResult(perFrame, interFrame, 'zero-motion');
    expect(result.temporalConsistency.interFrameSSIMMean).toBeCloseTo(1.0, 4);
    expect(result.temporalConsistency.interFrameSSIMStdDev).toBeCloseTo(0, 8);
  });

  it('handles single-pixel images', () => {
    const a = createImageData(1, 1, [128, 128, 128, 255]);
    const b = createImageData(1, 1, [128, 128, 128, 255]);

    const interFrame = computeInterFrameSSIM([a, b]);
    expect(interFrame).toHaveLength(1);
    expect(interFrame[0].ssim).toBeCloseTo(1.0, 4);
  });

  it('handles all-black frame sequence', () => {
    const frames = generateFrameSequence(5, 8, 8, 0, 0);
    const interFrame = computeInterFrameSSIM(frames);

    for (const pair of interFrame) {
      // Identical black frames should have SSIM ~1.0
      expect(pair.ssim).toBeCloseTo(1.0, 4);
    }
  });

  it('handles all-white frame sequence', () => {
    const frames = generateFrameSequence(5, 8, 8, 255, 0);
    const interFrame = computeInterFrameSSIM(frames);

    for (const pair of interFrame) {
      expect(pair.ssim).toBeCloseTo(1.0, 4);
    }
  });
});
