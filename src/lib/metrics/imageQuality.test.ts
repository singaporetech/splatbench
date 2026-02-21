/**
 * Comprehensive tests for PSNR and SSIM metric computations.
 *
 * These tests verify that the core image quality metrics produce
 * mathematically correct results for known inputs. Critical for
 * research paper validity.
 */

import { describe, it, expect } from 'vitest';
import { calculatePSNR, calculateSSIM } from './imageQuality';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create an ImageData-compatible object for testing (no DOM required). */
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

/** Create an ImageData with per-pixel control. */
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

// ─── PSNR Tests ─────────────────────────────────────────────────────────────

describe('calculatePSNR', () => {
  it('returns Infinity for identical images', () => {
    const img = createImageData(8, 8, [128, 64, 32, 255]);
    expect(calculatePSNR(img, img)).toBe(Infinity);
  });

  it('returns Infinity for two separately created identical images', () => {
    const a = createImageData(4, 4, [100, 150, 200, 255]);
    const b = createImageData(4, 4, [100, 150, 200, 255]);
    expect(calculatePSNR(a, b)).toBe(Infinity);
  });

  it('returns correct PSNR for known MSE', () => {
    // Create two images where every pixel differs by exactly 1 in red channel only
    // MSE = 1^2 / (pixels * 3) per channel contribution = 1/3 for single channel diff of 1
    // Actually MSE = sum(diffR^2 + diffG^2 + diffB^2) / (pixels * 3)
    // With diff only in R channel by 1: MSE = (N * 1) / (N * 3) = 1/3
    // PSNR = 10 * log10(255^2 / (1/3)) = 10 * log10(195075) ~= 52.90 dB
    const a = createImageData(10, 10, [100, 100, 100, 255]);
    const b = createImageData(10, 10, [101, 100, 100, 255]);
    const psnr = calculatePSNR(a, b);
    expect(psnr).toBeCloseTo(10 * Math.log10(255 * 255 / (1 / 3)), 2);
  });

  it('returns lower PSNR for larger differences', () => {
    const ref = createImageData(8, 8, [128, 128, 128, 255]);
    const smallDiff = createImageData(8, 8, [130, 128, 128, 255]);
    const largeDiff = createImageData(8, 8, [200, 128, 128, 255]);

    const psnrSmall = calculatePSNR(ref, smallDiff);
    const psnrLarge = calculatePSNR(ref, largeDiff);

    expect(psnrSmall).toBeGreaterThan(psnrLarge);
  });

  it('PSNR is symmetric', () => {
    const a = createImageData(4, 4, [100, 50, 200, 255]);
    const b = createImageData(4, 4, [110, 60, 190, 255]);

    expect(calculatePSNR(a, b)).toBeCloseTo(calculatePSNR(b, a), 10);
  });

  it('throws on dimension mismatch', () => {
    const a = createImageData(4, 4);
    const b = createImageData(8, 8);
    expect(() => calculatePSNR(a, b)).toThrow('same dimensions');
  });

  it('handles all-black vs all-white images', () => {
    const black = createImageData(4, 4, [0, 0, 0, 255]);
    const white = createImageData(4, 4, [255, 255, 255, 255]);
    const psnr = calculatePSNR(black, white);
    // MSE = 255^2 = 65025, PSNR = 10 * log10(65025/65025) = 0 dB
    expect(psnr).toBeCloseTo(0, 2);
  });

  it('produces expected value for uniform single-channel difference', () => {
    // Every pixel: R differs by 10, G and B identical
    // MSE = (N * 100) / (N * 3) = 100/3
    // PSNR = 10 * log10(65025 / (100/3)) = 10 * log10(1950.75)
    const a = createImageData(16, 16, [100, 100, 100, 255]);
    const b = createImageData(16, 16, [110, 100, 100, 255]);
    const expectedPSNR = 10 * Math.log10(65025 / (100 / 3));
    expect(calculatePSNR(a, b)).toBeCloseTo(expectedPSNR, 4);
  });
});

// ─── SSIM Tests ─────────────────────────────────────────────────────────────

describe('calculateSSIM', () => {
  it('returns 1.0 for identical images', () => {
    const img = createImageData(16, 16, [128, 128, 128, 255]);
    const ssim = calculateSSIM(img, img);
    expect(ssim).toBeCloseTo(1.0, 4);
  });

  it('returns 1.0 for separately created identical images', () => {
    const a = createImageData(16, 16, [80, 120, 200, 255]);
    const b = createImageData(16, 16, [80, 120, 200, 255]);
    expect(calculateSSIM(a, b)).toBeCloseTo(1.0, 4);
  });

  it('returns high SSIM for similar images', () => {
    const a = createImageData(16, 16, [128, 128, 128, 255]);
    const b = createImageData(16, 16, [130, 130, 130, 255]);
    const ssim = calculateSSIM(a, b);
    expect(ssim).toBeGreaterThan(0.99);
  });

  it('returns low SSIM for very different images', () => {
    const a = createImageData(16, 16, [0, 0, 0, 255]);
    const b = createImageData(16, 16, [255, 255, 255, 255]);
    const ssim = calculateSSIM(a, b);
    expect(ssim).toBeLessThan(0.1);
  });

  it('SSIM is symmetric', () => {
    const a = createImageData(8, 8, [100, 50, 200, 255]);
    const b = createImageData(8, 8, [150, 80, 170, 255]);
    expect(calculateSSIM(a, b)).toBeCloseTo(calculateSSIM(b, a), 10);
  });

  it('returns value between 0 and 1', () => {
    const a = createImageData(8, 8, [50, 100, 150, 255]);
    const b = createImageData(8, 8, [200, 50, 100, 255]);
    const ssim = calculateSSIM(a, b);
    expect(ssim).toBeGreaterThanOrEqual(0);
    expect(ssim).toBeLessThanOrEqual(1);
  });

  it('throws on dimension mismatch', () => {
    const a = createImageData(4, 4);
    const b = createImageData(8, 4);
    expect(() => calculateSSIM(a, b)).toThrow('same dimensions');
  });

  it('SSIM decreases monotonically with increasing noise', () => {
    const ref = createImageData(16, 16, [128, 128, 128, 255]);
    const ssimValues: number[] = [];

    for (const diff of [1, 5, 10, 25, 50, 100]) {
      const noisy = createImageData(16, 16, [128 + diff, 128, 128, 255] as [number, number, number, number]);
      ssimValues.push(calculateSSIM(ref, noisy));
    }

    // Each successive SSIM should be lower (or equal)
    for (let i = 1; i < ssimValues.length; i++) {
      expect(ssimValues[i]).toBeLessThanOrEqual(ssimValues[i - 1] + 1e-10);
    }
  });

  it('handles gradient images correctly', () => {
    // Horizontal gradient
    const gradA = createImageDataFromPixels(32, 32, (x) => {
      const v = Math.round((x / 31) * 255);
      return [v, v, v, 255];
    });
    // Same gradient shifted by small amount
    const gradB = createImageDataFromPixels(32, 32, (x) => {
      const v = Math.min(255, Math.round((x / 31) * 255) + 5);
      return [v, v, v, 255];
    });

    const ssim = calculateSSIM(gradA, gradB);
    // Structurally very similar, just slightly brighter
    expect(ssim).toBeGreaterThan(0.9);
  });
});

// ─── Cross-metric Consistency Tests ─────────────────────────────────────────

describe('PSNR-SSIM consistency', () => {
  it('both metrics agree on identical images', () => {
    const img = createImageData(8, 8, [100, 150, 200, 255]);
    expect(calculatePSNR(img, img)).toBe(Infinity);
    expect(calculateSSIM(img, img)).toBeCloseTo(1.0, 4);
  });

  it('both metrics agree on ordering of quality', () => {
    const ref = createImageData(16, 16, [128, 128, 128, 255]);
    const good = createImageData(16, 16, [130, 130, 130, 255]);
    const bad = createImageData(16, 16, [200, 200, 200, 255]);

    // Better quality should have higher PSNR and higher SSIM
    expect(calculatePSNR(ref, good)).toBeGreaterThan(calculatePSNR(ref, bad));
    expect(calculateSSIM(ref, good)).toBeGreaterThan(calculateSSIM(ref, bad));
  });
});
