/**
 * Image Quality Metrics for comparing rendered Gaussian Splat views
 * Implements PSNR (Peak Signal-to-Noise Ratio) and SSIM (Structural Similarity Index)
 */

import type { SparkViewerContext } from '../../types';

/**
 * Captures a WebGL canvas to ImageData by reading pixels directly from WebGL context
 * This works even with preserveDrawingBuffer: false by forcing a render immediately before capture
 */
export function captureCanvas(canvas: HTMLCanvasElement, context?: SparkViewerContext | null): Promise<ImageData> {
  return new Promise<ImageData>((resolve, reject) => {
    requestAnimationFrame(() => {
      try {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) {
          reject(new Error('Failed to get WebGL context'));
          return;
        }

        // force a render immediately before readPixels when a viewer context is available
        if (context) {
          console.log('Forcing render before capture...');
          context.forceRender();
        }

        // WebGL2 renderers may leave PIXEL_PACK_BUFFER bound, which breaks readPixels
        const gl2 = gl as WebGL2RenderingContext;
        if (gl2.PIXEL_PACK_BUFFER) {
          gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, null);
        }

        const width = canvas.width;
        const height = canvas.height;

        console.log(`Reading pixels from ${width}x${height} canvas...`);

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

        let hasColor = false;
        for (let i = 3; i < imageData.data.length; i += 4) {
          if (imageData.data[i] > 0) {
            hasColor = true;
            break;
          }
        }
        
        if (!hasColor) {
          console.warn('Captured canvas appears to be empty/transparent - all pixels have alpha=0');
          console.log('First 10 RGBA values:', Array.from(pixels.slice(0, 40)));
        } else {
          console.log('Successfully captured canvas with color data');
        }
        
        resolve(imageData);
      } catch (error) {
        reject(error as Error);
      }
    });
  });
}

/**
 * Calculate PSNR (Peak Signal-to-Noise Ratio) between two images
 * Returns Infinity for identical images
 */
export function calculatePSNR(imageA: ImageData, imageB: ImageData): number {
  if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
    throw new Error('Images must have the same dimensions for PSNR calculation');
  }

  const pixels = imageA.width * imageA.height;
  let mse = 0;

  for (let i = 0; i < imageA.data.length; i += 4) {
    const diffR = imageA.data[i] - imageB.data[i];
    const diffG = imageA.data[i + 1] - imageB.data[i + 1];
    const diffB = imageA.data[i + 2] - imageB.data[i + 2];

    mse += diffR * diffR + diffG * diffG + diffB * diffB;
  }

  mse /= pixels * 3;

  if (mse === 0) {
    return Infinity;
  }

  // PSNR formula: 10 * log10(MAX^2 / MSE), with MAX = 255 for 8-bit RGB
  const maxPixelValue = 255;
  return 10 * Math.log10((maxPixelValue * maxPixelValue) / mse);
}

/**
 * Convert ImageData to grayscale array using luminance formula
 */
function toGrayscale(imageData: ImageData): number[] {
  const gray = new Array(imageData.width * imageData.height);

  for (let i = 0, j = 0; i < imageData.data.length; i += 4, j++) {
    // ITU-R BT.601 luma coefficients
    gray[j] =
      0.299 * imageData.data[i] +
      0.587 * imageData.data[i + 1] +
      0.114 * imageData.data[i + 2];
  }

  return gray;
}

function mean(arr: number[]): number {
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function variance(arr: number[], meanVal: number): number {
  const sumSquaredDiff = arr.reduce((sum, val) => {
    const diff = val - meanVal;
    return sum + diff * diff;
  }, 0);
  return sumSquaredDiff / arr.length;
}

function covariance(arrA: number[], arrB: number[], meanA: number, meanB: number): number {
  if (arrA.length !== arrB.length) {
    throw new Error('Arrays must have same length for covariance');
  }

  let sum = 0;
  for (let i = 0; i < arrA.length; i++) {
    sum += (arrA[i] - meanA) * (arrB[i] - meanB);
  }

  return sum / arrA.length;
}

/**
 * Calculate SSIM (Structural Similarity Index) between two images
 * Uses simplified whole-image SSIM (not windowed)
 */
export function calculateSSIM(imageA: ImageData, imageB: ImageData): number {
  if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
    throw new Error('Images must have the same dimensions for SSIM calculation');
  }

  // SSIM constants for 8-bit images
  const L = 255;
  const K1 = 0.01;
  const K2 = 0.03;
  const C1 = (K1 * L) ** 2;
  const C2 = (K2 * L) ** 2;

  const grayA = toGrayscale(imageA);
  const grayB = toGrayscale(imageB);

  const meanA = mean(grayA);
  const meanB = mean(grayB);
  const varA = variance(grayA, meanA);
  const varB = variance(grayB, meanB);
  const covAB = covariance(grayA, grayB, meanA, meanB);

  const sigmaA = Math.sqrt(varA);
  const sigmaB = Math.sqrt(varB);

  console.log('SSIM calculation details:', {
    meanA: meanA.toFixed(2),
    meanB: meanB.toFixed(2),
    varA: varA.toFixed(2),
    varB: varB.toFixed(2),
    covAB: covAB.toFixed(2),
    sigmaA: sigmaA.toFixed(2),
    sigmaB: sigmaB.toFixed(2),
  });

  const numerator = (2 * meanA * meanB + C1) * (2 * covAB + C2);
  const denominator = (meanA * meanA + meanB * meanB + C1) * (varA + varB + C2);

  const ssim = numerator / denominator;
  
  console.log('SSIM components:', {
    C1: C1.toFixed(2),
    C2: C2.toFixed(2),
    numerator: numerator.toFixed(2),
    denominator: denominator.toFixed(2),
    ssim: ssim.toFixed(6)
  });

  return ssim;
}

const SSIM_WINDOW_SIZE = 11;
const SSIM_WINDOW_SIGMA = 1.5;

/**
 * Stride used by the static-quality and trajectory metrics. Stride 1 evaluates
 * every valid window position, as the reference implementations do, so the
 * exported values compare directly with scikit-image.
 */
export const WINDOWED_SSIM_STRIDE = 1;

/** Normalized 1-D Gaussian; the 2-D window is its outer product with itself. */
function gaussianKernel1D(size: number, sigma: number): Float64Array {
  const kernel = new Float64Array(size);
  const radius = (size - 1) / 2;
  let total = 0;

  for (let i = 0; i < size; i++) {
    const x = i - radius;
    const weight = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel[i] = weight;
    total += weight;
  }

  for (let i = 0; i < size; i++) {
    kernel[i] /= total;
  }

  return kernel;
}

const SSIM_GAUSSIAN_KERNEL = gaussianKernel1D(SSIM_WINDOW_SIZE, SSIM_WINDOW_SIGMA);

/** Write one row of BT.601 luma into `out`, matching toGrayscale(). */
function writeLumaRow(imageData: ImageData, y: number, out: Float64Array): void {
  const { data, width } = imageData;
  let idx = y * width * 4;

  for (let x = 0; x < width; x++) {
    out[x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    idx += 4;
  }
}

export interface WindowedSSIMOptions {
  /**
   * Spacing between evaluated window positions in pixels, default
   * WINDOWED_SSIM_STRIDE. Strides above 1 are cheaper but can alias against
   * high-frequency content, so report the stride with any values it produced.
   */
  stride?: number;
}

/**
 * Windowed SSIM (Wang et al. 2004): an 11x11 Gaussian window with sigma 1.5
 * slides over the BT.601 luma of both images, and the result is the mean SSIM
 * over the (W-10) x (H-10) window positions that fit inside the image.
 * C1 = (0.01 * 255)^2, C2 = (0.03 * 255)^2, and per-window variances and
 * covariance use the population estimator, which matches
 * skimage.metrics.structural_similarity with gaussian_weights=True, sigma=1.5,
 * win_size=11, data_range=255 and use_sample_covariance=False.
 *
 * calculateSSIM (whole-image SSIM) is unchanged and still fills the ssim
 * columns; this value goes in ssim_windowed.
 */
export function calculateWindowedSSIM(
  imageA: ImageData,
  imageB: ImageData,
  options: WindowedSSIMOptions = {},
): number {
  if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
    throw new Error('Images must have the same dimensions for SSIM calculation');
  }

  const stride = options.stride ?? WINDOWED_SSIM_STRIDE;
  if (!Number.isInteger(stride) || stride < 1) {
    throw new Error(`Windowed SSIM stride must be a positive integer, got ${stride}`);
  }

  const width = imageA.width;
  const height = imageA.height;

  if (width < SSIM_WINDOW_SIZE || height < SSIM_WINDOW_SIZE) {
    throw new Error(
      `Images must be at least ${SSIM_WINDOW_SIZE}x${SSIM_WINDOW_SIZE} for windowed SSIM, ` +
        `got ${width}x${height}`,
    );
  }

  const L = 255;
  const C1 = (0.01 * L) ** 2;
  const C2 = (0.03 * L) ** 2;

  const kernel = SSIM_GAUSSIAN_KERNEL;
  const validWidth = width - SSIM_WINDOW_SIZE + 1;
  const validHeight = height - SSIM_WINDOW_SIZE + 1;
  const columns = Math.floor((validWidth - 1) / stride) + 1;

  // separable pass 1: per image row, Gaussian-weighted horizontal sums for each
  // window position (two means, two second moments, and the cross moment)
  const hSumA = new Float64Array(columns * height);
  const hSumB = new Float64Array(columns * height);
  const hSumAA = new Float64Array(columns * height);
  const hSumBB = new Float64Array(columns * height);
  const hSumAB = new Float64Array(columns * height);

  const lumaA = new Float64Array(width);
  const lumaB = new Float64Array(width);

  for (let y = 0; y < height; y++) {
    writeLumaRow(imageA, y, lumaA);
    writeLumaRow(imageB, y, lumaB);
    const rowOffset = y * columns;

    for (let c = 0; c < columns; c++) {
      const x0 = c * stride;
      let sumA = 0;
      let sumB = 0;
      let sumAA = 0;
      let sumBB = 0;
      let sumAB = 0;

      for (let k = 0; k < SSIM_WINDOW_SIZE; k++) {
        const weight = kernel[k];
        const valueA = lumaA[x0 + k];
        const valueB = lumaB[x0 + k];
        sumA += weight * valueA;
        sumB += weight * valueB;
        sumAA += weight * valueA * valueA;
        sumBB += weight * valueB * valueB;
        sumAB += weight * valueA * valueB;
      }

      const idx = rowOffset + c;
      hSumA[idx] = sumA;
      hSumB[idx] = sumB;
      hSumAA[idx] = sumAA;
      hSumBB[idx] = sumBB;
      hSumAB[idx] = sumAB;
    }
  }

  // separable pass 2: weight the row sums vertically, turn the moments into
  // per-window SSIM, and average over window positions
  let ssimTotal = 0;
  let windowCount = 0;

  for (let y0 = 0; y0 < validHeight; y0 += stride) {
    for (let c = 0; c < columns; c++) {
      let meanA = 0;
      let meanB = 0;
      let momentAA = 0;
      let momentBB = 0;
      let momentAB = 0;

      for (let k = 0; k < SSIM_WINDOW_SIZE; k++) {
        const weight = kernel[k];
        const idx = (y0 + k) * columns + c;
        meanA += weight * hSumA[idx];
        meanB += weight * hSumB[idx];
        momentAA += weight * hSumAA[idx];
        momentBB += weight * hSumBB[idx];
        momentAB += weight * hSumAB[idx];
      }

      const varA = momentAA - meanA * meanA;
      const varB = momentBB - meanB * meanB;
      const covAB = momentAB - meanA * meanB;

      const numerator = (2 * meanA * meanB + C1) * (2 * covAB + C2);
      const denominator = (meanA * meanA + meanB * meanB + C1) * (varA + varB + C2);

      ssimTotal += numerator / denominator;
      windowCount++;
    }
  }

  return ssimTotal / windowCount;
}

/**
 * Find all Gaussian Splat viewer canvases in the document
 */
export function findViewerCanvases(): HTMLCanvasElement[] {
  const canvases = document.querySelectorAll('canvas[data-engine="three.js r182"]');
  return Array.from(canvases) as HTMLCanvasElement[];
}
