import { describe, expect, it } from 'vitest';
import type { BenchmarkMetrics } from '../../types';
import {
  PAPER_CSV_HEADERS,
  createPaperCsvRows,
  exportPaperBatchResultsToCSV,
  type PaperBatchResultInput,
  type PaperRuntimeInfo,
} from './paperCsvExport';

const runtimeInfo: PaperRuntimeInfo = {
  browserName: 'Chrome',
  browserVersion: '147.0',
  browserEngine: 'Blink',
  gpuRenderer: 'ANGLE Test GPU',
  webglVersion: 'WebGL 2.0',
  osPlatform: 'MacIntel',
  screenResolution: '1280x900',
  devicePixelRatio: 1,
};

function metrics(overrides: Partial<BenchmarkMetrics> = {}): BenchmarkMetrics {
  return {
    fps: 120.25,
    frameTime: 8.32,
    memoryUsage: 0,
    loadTime: 467,
    fileSize: 56.01,
    splatCount: 233992,
    resolution: [480, 811],
    frameTimeVariance: 0,
    fps1PercentLow: 0,
    fps01PercentLow: 0,
    frameTimeP50: 0,
    frameTimeP95: 0,
    frameTimeP99: 0,
    ...overrides,
  };
}

function batchResult(testId: string): PaperBatchResultInput {
  return {
    pairName: 'bonsai-ksplat-front-r2',
    refFile: 'ref_bonsai-ksplat-front-r2.ply',
    testFile: 'test_bonsai-ksplat-front-r2.ksplat',
    refSizeBytes: 58_730_496,
    testSizeBytes: 5_630_853,
    results: [
      {
        testId,
        metrics:
          testId === 'static-quality'
            ? { psnr: 58.37, ssim: 0.99997 }
            : { psnrMean: 57.47, ssimMean: 0.99991 },
        metricEntries: [],
        summary: 'ok',
        passed: true,
        completedAt: '2026-04-12T05:28:00.947Z',
        durationMs: 3900,
      },
    ],
    paperMetricsByTestId: {
      [testId]: {
        reference: metrics(),
        test: metrics({ fps: 98.4, frameTime: 10.16, fileSize: 5.37 }),
        cameraPosition: { x: 0, y: 0, z: 4.2 },
        canvasWidth: 480,
        canvasHeight: 811,
      },
    },
  };
}

describe('paperCsvExport', () => {
  it('uses the validator-required header order', () => {
    const csv = exportPaperBatchResultsToCSV([], runtimeInfo);

    expect(csv).toBe(PAPER_CSV_HEADERS.join(','));
    expect(PAPER_CSV_HEADERS).toHaveLength(41);
  });

  it('maps a trajectory batch result into paper CSV fields', () => {
    const [row] = createPaperCsvRows([batchResult('trajectory-orbit')], runtimeInfo);

    expect(row.test_id).toBe('trajectory-orbit');
    expect(row.replicate).toBe('2');
    expect(row.scene_name).toBe('bonsai');
    expect(row.scene).toBe('bonsai');
    expect(row.reference_format).toBe('ply');
    expect(row.test_format).toBe('ksplat');
    expect(row.variant_or_basename).toBe('bonsai.ksplat');
    expect(row.viewpoint_name).toBe('front');
    expect(row.distance_tier).toBe('mid');
    expect(row.camera_distance).toBe('4.20');
    expect(row.psnr_db).toBe('57.47');
    expect(row.ssim).toBe('0.9999');
    expect(row.fps_reference).toBe('120.3');
    expect(row.frame_time_ms_test).toBe('10.16');
    expect(row.memory_mb_reference).toBe('');
    expect(row.load_time_ms_reference).toBe('467');
    expect(row.splat_count_reference).toBe('233992');
    expect(row.canvas_height).toBe('811');
  });

  it('leaves static quality FPS fields blank and escapes camera JSON', () => {
    const csv = exportPaperBatchResultsToCSV([batchResult('static-quality')], runtimeInfo);
    const [, row] = csv.split('\n');

    expect(row).toContain('static-quality');
    expect(row).toContain('"{""x"":0,""y"":0,""z"":4.2}"');
    expect(row).toContain(',58.37,1.0000,,,,467,');
  });

  it('uses explicit paper rows for repeated test ids across viewpoints and replicates', () => {
    const repeatedResult = {
      testId: 'trajectory-orbit',
      metrics: { psnrMean: 61.23, ssimMean: 0.9988 },
      metricEntries: [],
      summary: 'ok',
      passed: true,
      completedAt: '2026-04-12T05:28:00.947Z',
      durationMs: 3900,
    };

    const rows = createPaperCsvRows(
      [
        {
          pairName: 'bonsai-ksplat',
          refFile: 'ref_bonsai-ksplat.ply',
          testFile: 'test_bonsai-ksplat.ksplat',
          refSizeBytes: 58_730_496,
          testSizeBytes: 5_630_853,
          results: [],
          paperRows: [
            {
              pairName: 'bonsai-ksplat',
              refFile: 'ref_bonsai-ksplat.ply',
              testFile: 'test_bonsai-ksplat.ksplat',
              refSizeBytes: 58_730_496,
              testSizeBytes: 5_630_853,
              result: repeatedResult,
              paperMetrics: {
                reference: metrics(),
                test: metrics({ fps: 98.4, frameTime: 10.16, fileSize: 5.37 }),
                cameraPosition: { x: 0, y: 0, z: 4.2 },
                canvasWidth: 480,
                canvasHeight: 811,
              },
              sceneName: 'bonsai',
              referenceFormat: 'ply',
              testFormat: 'ksplat',
              viewpointName: 'front',
              replicate: '1',
              variantOrBasename: 'bonsai.ksplat',
            },
            {
              pairName: 'bonsai-ksplat',
              refFile: 'ref_bonsai-ksplat.ply',
              testFile: 'test_bonsai-ksplat.ksplat',
              refSizeBytes: 58_730_496,
              testSizeBytes: 5_630_853,
              result: {
                ...repeatedResult,
                completedAt: '2026-04-12T05:28:04.947Z',
              },
              paperMetrics: {
                reference: metrics(),
                test: metrics({ fps: 96.4, frameTime: 10.76, fileSize: 5.37 }),
                cameraPosition: { x: -3, y: 0, z: 3 },
                canvasWidth: 480,
                canvasHeight: 811,
              },
              sceneName: 'bonsai',
              referenceFormat: 'ply',
              testFormat: 'ksplat',
              viewpointName: 'left45',
              replicate: '2',
              variantOrBasename: 'bonsai.ksplat',
            },
          ],
        },
      ],
      runtimeInfo,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].test_id).toBe('trajectory-orbit');
    expect(rows[0].viewpoint_name).toBe('front');
    expect(rows[0].replicate).toBe('1');
    expect(rows[1].viewpoint_name).toBe('left45');
    expect(rows[1].replicate).toBe('2');
    expect(rows[1].camera_distance).toBe('4.24');
  });
});
