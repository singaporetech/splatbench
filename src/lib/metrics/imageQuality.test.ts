/**
 * Known-input checks for PSNR and SSIM metric computations.
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePSNR,
  calculateSSIM,
  calculateWindowedSSIM,
  WINDOWED_SSIM_STRIDE,
} from './imageQuality';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** ImageData-compatible object for tests without a DOM. */
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

/** ImageData-compatible object with per-pixel control. */
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

// ─── PSNR Tests ──────────────────────────────────────────────────────────────

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
    // every pixel differs by exactly 1 in red channel only
    // MSE = 1^2 / (pixels * 3) per channel contribution = 1/3 for single channel diff of 1
    // MSE = sum(diffR^2 + diffG^2 + diffB^2) / (pixels * 3)
    // with diff only in R channel by 1: MSE = (N * 1) / (N * 3) = 1/3
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
    // every pixel has R differing by 10, with G and B identical
    // MSE = (N * 100) / (N * 3) = 100/3
    // PSNR = 10 * log10(65025 / (100/3)) = 10 * log10(1950.75)
    const a = createImageData(16, 16, [100, 100, 100, 255]);
    const b = createImageData(16, 16, [110, 100, 100, 255]);
    const expectedPSNR = 10 * Math.log10(65025 / (100 / 3));
    expect(calculatePSNR(a, b)).toBeCloseTo(expectedPSNR, 4);
  });
});

// ─── SSIM Tests ──────────────────────────────────────────────────────────────

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

    // each successive SSIM should be lower or equal
    for (let i = 1; i < ssimValues.length; i++) {
      expect(ssimValues[i]).toBeLessThanOrEqual(ssimValues[i - 1] + 1e-10);
    }
  });

  it('handles gradient images correctly', () => {
    // horizontal gradient
    const gradA = createImageDataFromPixels(32, 32, (x) => {
      const v = Math.round((x / 31) * 255);
      return [v, v, v, 255];
    });
    // same gradient shifted by a small amount
    const gradB = createImageDataFromPixels(32, 32, (x) => {
      const v = Math.min(255, Math.round((x / 31) * 255) + 5);
      return [v, v, v, 255];
    });

    const ssim = calculateSSIM(gradA, gradB);
    // structurally very similar, just slightly brighter
    expect(ssim).toBeGreaterThan(0.9);
  });
});

// ─── Windowed SSIM Tests ─────────────────────────────────────────────────────

/**
 * Reference fixtures for windowed SSIM. The three 64x64 RGB pairs come from a
 * plain 32-bit LCG that Python and JS reproduce exactly, and the expected
 * values are skimage.metrics.structural_similarity(gaussian_weights=True,
 * sigma=1.5, win_size=11, data_range=255, use_sample_covariance=False) on the
 * BT.601 luma of the same pairs. Regenerate them with
 *   uv run --with scikit-image --with numpy python3 scripts/ssim_reference_fixtures.py
 *
 * The RGB byte sums are checked first, so a generator mismatch fails as a
 * fixture error rather than as a metric error.
 */
const FIXTURE_SIZE = 64;

function lcgStep(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

function fixtureBase(): ImageData {
  return createImageDataFromPixels(FIXTURE_SIZE, FIXTURE_SIZE, (x, y) => [
    (x * 4) % 256,
    (y * 3 + x) % 256,
    Math.floor((x * y) / 3) % 256,
    255,
  ]);
}

function fixtureNoisy(): ImageData {
  let state = 20260726;
  return createImageDataFromPixels(FIXTURE_SIZE, FIXTURE_SIZE, (x, y) => {
    const channels: number[] = [
      (x * 4) % 256,
      (y * 3 + x) % 256,
      Math.floor((x * y) / 3) % 256,
    ];
    const noisy = channels.map((value) => {
      state = lcgStep(state);
      const offset = ((state >>> 8) % 49) - 24;
      return Math.min(255, Math.max(0, value + offset));
    });
    return [noisy[0], noisy[1], noisy[2], 255];
  });
}

function fixtureShifted(): ImageData {
  // np.roll(base, 3, axis=1) then np.roll(..., 2, axis=0)
  return createImageDataFromPixels(FIXTURE_SIZE, FIXTURE_SIZE, (x, y) => {
    const sx = (x - 3 + FIXTURE_SIZE) % FIXTURE_SIZE;
    const sy = (y - 2 + FIXTURE_SIZE) % FIXTURE_SIZE;
    return [
      (sx * 4) % 256,
      (sy * 3 + sx) % 256,
      Math.floor((sx * sy) / 3) % 256,
      255,
    ];
  });
}

/** Sum of the R, G, B bytes; alpha excluded, matching the Python checksum. */
function rgbChecksum(image: ImageData): number {
  let total = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    total += image.data[i] + image.data[i + 1] + image.data[i + 2];
  }
  return total;
}

describe('calculateWindowedSSIM fixtures', () => {
  it('reproduces the Python fixture generator byte-for-byte', () => {
    expect(rgbChecksum(fixtureBase())).toBe(1470606);
    expect(rgbChecksum(fixtureNoisy())).toBe(1471553);
    expect(rgbChecksum(fixtureShifted())).toBe(1470606);
  });

  it('matches skimage on identical images (expected 1.0)', () => {
    const base = fixtureBase();
    expect(calculateWindowedSSIM(base, fixtureBase(), { stride: 1 })).toBeCloseTo(1.0, 10);
  });

  it('matches skimage on a known noisy pair', () => {
    // skimage use_sample_covariance=False: 0.6322029502409735
    // skimage use_sample_covariance=True:  0.6314240956408389 (also within 1e-3)
    const value = calculateWindowedSSIM(fixtureBase(), fixtureNoisy(), { stride: 1 });
    expect(Math.abs(value - 0.6322029502409735)).toBeLessThan(1e-3);
    expect(Math.abs(value - 0.6314240956408389)).toBeLessThan(1e-3);
    expect(value).toBeCloseTo(0.6322029502409735, 9);
  });

  it('matches skimage on a known shifted pair', () => {
    // skimage use_sample_covariance=False: 0.5996976016750154
    // skimage use_sample_covariance=True:  0.5987088936013114 (also within 1e-3)
    const value = calculateWindowedSSIM(fixtureBase(), fixtureShifted(), { stride: 1 });
    expect(Math.abs(value - 0.5996976016750154)).toBeLessThan(1e-3);
    expect(Math.abs(value - 0.5987088936013114)).toBeLessThan(1e-3);
    expect(value).toBeCloseTo(0.5996976016750154, 9);
  });

  it('reproduces the strided reference when a stride above 1 is requested', () => {
    // stride 4 values of the same window grid, from the Python reference
    expect(calculateWindowedSSIM(fixtureBase(), fixtureBase(), { stride: 4 })).toBeCloseTo(1.0, 10);
    expect(
      calculateWindowedSSIM(fixtureBase(), fixtureNoisy(), { stride: 4 }),
    ).toBeCloseTo(0.6276894309389545, 9);
    expect(
      calculateWindowedSSIM(fixtureBase(), fixtureShifted(), { stride: 4 }),
    ).toBeCloseTo(0.5484088086689632, 9);
  });

  it('defaults to stride 1, which is the exported production stride', () => {
    expect(WINDOWED_SSIM_STRIDE).toBe(1);
    const noisy = fixtureNoisy();
    expect(calculateWindowedSSIM(fixtureBase(), noisy)).toBe(
      calculateWindowedSSIM(fixtureBase(), noisy, { stride: 1 }),
    );
  });
});

describe('calculateWindowedSSIM properties', () => {
  it('returns 1.0 for a uniform image compared with itself', () => {
    const img = createImageData(16, 16, [128, 64, 32, 255]);
    expect(calculateWindowedSSIM(img, img)).toBeCloseTo(1.0, 10);
  });

  it('is symmetric', () => {
    const a = fixtureBase();
    const b = fixtureNoisy();
    expect(calculateWindowedSSIM(a, b)).toBeCloseTo(calculateWindowedSSIM(b, a), 12);
  });

  it('decreases as noise increases', () => {
    const ref = createImageDataFromPixels(32, 32, (x, y) => [
      (x * 8) % 256,
      (y * 8) % 256,
      128,
      255,
    ]);
    const mild = createImageDataFromPixels(32, 32, (x, y) => [
      ((x * 8) % 256) + (x % 2 ? 3 : -3),
      (y * 8) % 256,
      128,
      255,
    ]);
    const heavy = createImageDataFromPixels(32, 32, (x, y) => [
      ((x * 8) % 256) + (x % 2 ? 60 : -60),
      (y * 8) % 256,
      128,
      255,
    ]);

    expect(calculateWindowedSSIM(ref, mild)).toBeGreaterThan(
      calculateWindowedSSIM(ref, heavy),
    );
  });

  it('is lower than whole-image SSIM on a locally corrupted textured image', () => {
    // a local defect barely moves the global statistics whole-image SSIM sees,
    // but the sliding window registers it
    const ref = fixtureBase();
    const defect = createImageDataFromPixels(FIXTURE_SIZE, FIXTURE_SIZE, (x, y) => {
      if (x >= 20 && x < 36 && y >= 20 && y < 36) return [30, 30, 30, 255];
      return [
        (x * 4) % 256,
        (y * 3 + x) % 256,
        Math.floor((x * y) / 3) % 256,
        255,
      ];
    });

    const whole = calculateSSIM(ref, defect);
    const windowed = calculateWindowedSSIM(ref, defect);

    expect(whole).toBeGreaterThan(0.9);
    expect(windowed).toBeLessThan(whole);
  });

  it('throws on dimension mismatch', () => {
    const a = createImageData(16, 16);
    const b = createImageData(16, 12);
    expect(() => calculateWindowedSSIM(a, b)).toThrow('same dimensions');
  });

  it('throws when an image is smaller than the 11x11 window', () => {
    const a = createImageData(8, 8);
    expect(() => calculateWindowedSSIM(a, a)).toThrow('at least 11x11');
  });

  it('rejects a non-positive or fractional stride', () => {
    const a = createImageData(16, 16);
    expect(() => calculateWindowedSSIM(a, a, { stride: 0 })).toThrow('positive integer');
    expect(() => calculateWindowedSSIM(a, a, { stride: 1.5 })).toThrow('positive integer');
  });

  it('stays cheap enough for a 1280x800 frame at the production stride', () => {
    // windowed SSIM runs after capture but has to stay affordable across 60
    // keyframes; the bound is loose so slower CI hardware does not flake
    let state = 12345;
    const noise = () => {
      state = lcgStep(state);
      return (state >>> 8) % 256;
    };
    const frameA = createImageDataFromPixels(1280, 800, (x, y) => [
      (x * 3 + y) % 256,
      (y * 7) % 256,
      noise(),
      255,
    ]);
    const frameB = createImageDataFromPixels(1280, 800, (x, y) => [
      (x * 3 + y + 2) % 256,
      (y * 7) % 256,
      noise(),
      255,
    ]);

    calculateWindowedSSIM(frameA, frameB);
    const start = performance.now();
    calculateWindowedSSIM(frameA, frameB);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(1000);
  });

  it('leaves whole-image SSIM untouched', () => {
    // computing the windowed metric must not change whole-image SSIM
    const a = fixtureBase();
    const b = fixtureNoisy();
    const before = calculateSSIM(a, b);
    calculateWindowedSSIM(a, b);
    expect(calculateSSIM(a, b)).toBe(before);
  });
});

// ─── Cross-metric Consistency Tests ──────────────────────────────────────────

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

    // better quality should have higher PSNR and higher SSIM
    expect(calculatePSNR(ref, good)).toBeGreaterThan(calculatePSNR(ref, bad));
    expect(calculateSSIM(ref, good)).toBeGreaterThan(calculateSSIM(ref, bad));
  });
});
