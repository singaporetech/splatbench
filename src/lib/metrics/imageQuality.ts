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

/**
 * Find all Gaussian Splat viewer canvases in the document
 */
export function findViewerCanvases(): HTMLCanvasElement[] {
  const canvases = document.querySelectorAll('canvas[data-engine="three.js r182"]');
  return Array.from(canvases) as HTMLCanvasElement[];
}
