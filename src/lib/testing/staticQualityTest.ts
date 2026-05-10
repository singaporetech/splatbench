import type { Test, TestScene, TestResult, OnProgress } from './types';
import { registerTest } from './registry';
import { captureFrame } from '../../lib/metrics/trajectoryMetrics';
import { calculatePSNR, calculateSSIM } from '../../lib/metrics/imageQuality';

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

const staticQualityTest: Test = {
  id: 'static-quality',
  name: 'Static Quality',
  description:
    'Computes PSNR and SSIM at the current camera position. Requires both viewers loaded.',
  category: 'Quality',
  async run(
    scene: TestScene,
    onProgress: OnProgress,
    signal: AbortSignal,
  ): Promise<TestResult> {
    const startTime = performance.now();

    if (!scene.reference) {
      throw new Error('Static Quality test requires both viewers (Splat A and Splat B) to be loaded.');
    }

    if (signal.aborted) throw new Error('Test cancelled');

    onProgress({
      fraction: 0.1,
      message: 'Forcing render...',
      phase: 'Capturing',
    });

    scene.primary.forceRender();
    scene.reference.forceRender();
    await waitForFrame();

    if (signal.aborted) throw new Error('Test cancelled');

    onProgress({
      fraction: 0.3,
      message: 'Capturing frames...',
      phase: 'Capturing',
    });

    const frameA = captureFrame(scene.primary);
    const frameB = captureFrame(scene.reference);

    if (signal.aborted) throw new Error('Test cancelled');

    onProgress({
      fraction: 0.5,
      message: 'Computing PSNR...',
      phase: 'Computing Metrics',
    });

    await new Promise((r) => setTimeout(r, 0));

    const psnr = calculatePSNR(frameA, frameB);

    if (signal.aborted) throw new Error('Test cancelled');

    onProgress({
      fraction: 0.75,
      message: 'Computing SSIM...',
      phase: 'Computing Metrics',
    });

    await new Promise((r) => setTimeout(r, 0));

    const ssim = calculateSSIM(frameA, frameB);

    onProgress({
      fraction: 1,
      message: 'Complete',
      phase: 'Done',
    });

    const durationMs = performance.now() - startTime;

    // 25 dB is a reasonable minimum for compressed formats
    const passed = psnr >= 25;

    return {
      testId: 'static-quality',
      metrics: {
        psnr,
        ssim,
      },
      metricEntries: [
        {
          label: 'PSNR',
          value: psnr,
          unit: 'dB',
          higherIsBetter: true,
        },
        {
          label: 'SSIM',
          value: ssim,
          higherIsBetter: true,
        },
      ],
      summary: `PSNR ${psnr.toFixed(2)} dB, SSIM ${ssim.toFixed(4)}`,
      passed,
      completedAt: new Date().toISOString(),
      durationMs,
    };
  },
};

registerTest(staticQualityTest);
export { staticQualityTest };
