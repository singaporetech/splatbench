import { describe, expect, it } from 'vitest';
import type { BenchmarkMetrics } from '../../types';
import {
  BENCHMARK_CSV_HEADERS,
  createBenchmarkCsvRows,
  exportBenchmarkBatchResultsToCSV,
  type BenchmarkBatchResultInput,
  type BenchmarkRuntimeInfo,
} from './benchmarkCsvExport';

const runtimeInfo: BenchmarkRuntimeInfo = {
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

function batchResult(testId: string): BenchmarkBatchResultInput {
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
    benchmarkMetricsByTestId: {
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

describe('benchmarkCsvExport', () => {
  it('uses the validator-required header order', () => {
    const csv = exportBenchmarkBatchResultsToCSV([], runtimeInfo);

    expect(csv).toBe(BENCHMARK_CSV_HEADERS.join(','));
    expect(BENCHMARK_CSV_HEADERS).toHaveLength(57);
  });

  it('keeps the original 41 columns as a stable prefix', () => {
    expect(BENCHMARK_CSV_HEADERS.slice(0, 41)).toEqual([
      'timestamp',
      'test_id',
      'replicate',
      'scene_name',
      'scene',
      'reference_format',
      'test_format',
      'variant_or_basename',
      'file_size_reference_mb',
      'file_size_test_mb',
      'compression_ratio',
      'viewpoint_name',
      'camera_distance',
      'distance_tier',
      'camera_position',
      'psnr_db',
      'ssim',
      'fps_reference',
      'frame_time_ms_reference',
      'memory_mb_reference',
      'load_time_ms_reference',
      'fps_1_percent_low_reference',
      'frame_time_variance_reference',
      'fps_test',
      'frame_time_ms_test',
      'memory_mb_test',
      'load_time_ms_test',
      'fps_1_percent_low_test',
      'frame_time_variance_test',
      'browser_name',
      'browser_version',
      'browser_engine',
      'gpu_renderer',
      'webgl_version',
      'os_platform',
      'screen_resolution',
      'device_pixel_ratio',
      'splat_count_reference',
      'splat_count_test',
      'canvas_width',
      'canvas_height',
    ]);
  });

  it('appends schema 2.0 columns after the original 41 and populates provenance', () => {
    expect(BENCHMARK_CSV_HEADERS.slice(41, 55)).toEqual([
      'app_version',
      'renderer_lib_versions',
      'export_schema_version',
      'interframe_ssim_mean',
      'interframe_ssim_std',
      'interframe_ssim_min',
      'psnr_min_db',
      'ssim_min',
      'load_read_ms_reference',
      'load_init_ms_reference',
      'load_first_frame_ms_reference',
      'load_read_ms_test',
      'load_init_ms_test',
      'load_first_frame_ms_test',
    ]);

    const [row] = createBenchmarkCsvRows([batchResult('trajectory-orbit')], runtimeInfo);
    expect(row.app_version.length).toBeGreaterThan(0);
    expect(row.renderer_lib_versions).toMatch(/^spark@\d+\.\d+\.\d+;three@\d+\.\d+\.\d+$/u);
    expect(row.export_schema_version).toBe('2.1');
  });

  it('appends the schema 2.1 windowed-SSIM columns after the 55 schema 2.0 ones', () => {
    expect(BENCHMARK_CSV_HEADERS).toHaveLength(57);
    expect(BENCHMARK_CSV_HEADERS.slice(55)).toEqual(['ssim_windowed', 'ssim_windowed_min']);
  });

  it('maps a trajectory batch result into benchmark CSV fields', () => {
    const [row] = createBenchmarkCsvRows([batchResult('trajectory-orbit')], runtimeInfo);

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

  it('maps every format in the four-format matrix, including sog', () => {
    for (const format of ['splat', 'ksplat', 'spz', 'sog']) {
      const input = batchResult('trajectory-orbit');
      input.pairName = `bonsai-${format}-front-r2`;
      input.refFile = `ref_bonsai-${format}-front-r2.ply`;
      input.testFile = `test_bonsai-${format}-front-r2.${format}`;

      const [row] = createBenchmarkCsvRows([input], runtimeInfo);
      expect(row.test_format).toBe(format);
      expect(row.variant_or_basename).toBe(`bonsai.${format}`);
      expect(row.reference_format).toBe('ply');
    }
  });

  it('infers scenes outside the six pinned scenes from the file names', () => {
    for (const scene of [
      'bicycle',
      'counter',
      'drjohnson',
      'kitchen',
      'room',
      'stump',
      'treehill',
    ]) {
      const input = batchResult('trajectory-orbit');
      input.pairName = `${scene}-spz-front-r2`;
      input.refFile = `ref_${scene}-spz-front-r2.ply`;
      input.testFile = `test_${scene}-spz-front-r2.spz`;

      const [row] = createBenchmarkCsvRows([input], runtimeInfo);
      expect(row.scene_name).toBe(scene);
      expect(row.variant_or_basename).toBe(`${scene}.spz`);
    }
  });

  it('infers "flowers" without it collapsing to "flower" or to "playroom"', () => {
    const flowers = batchResult('trajectory-orbit');
    flowers.pairName = 'flowers-sog-front-r2';
    flowers.refFile = 'ref_flowers-sog-front-r2.ply';
    flowers.testFile = 'test_flowers-sog-front-r2.sog';
    expect(createBenchmarkCsvRows([flowers], runtimeInfo)[0].scene_name).toBe('flowers');

    // `room` must not claim a name it is only a substring of
    const playroom = batchResult('trajectory-orbit');
    playroom.pairName = 'playroom-spz-front-r2';
    playroom.refFile = 'ref_playroom-spz-front-r2.ply';
    playroom.testFile = 'test_playroom-spz-front-r2.spz';
    expect(createBenchmarkCsvRows([playroom], runtimeInfo)[0].scene_name).toBe('playroom');
  });

  it('exports temporal-stability metrics for trajectory rows and blanks for static rows', () => {
    const input = batchResult('trajectory-orbit');
    input.results[0].metrics = {
      psnrMean: 57.47,
      ssimMean: 0.99991,
      psnrMin: 51.02,
      ssimMin: 0.99871,
      interFrameSSIMMean: 0.99321,
      interFrameSSIMStdDev: 0.004512,
      interFrameSSIMMin: 0.97654,
      worstTransitionFrame: 17,
      totalFrames: 60,
    };

    const [row] = createBenchmarkCsvRows([input], runtimeInfo);
    expect(row.interframe_ssim_mean).toBe('0.9932');
    expect(row.interframe_ssim_std).toBe('0.004512');
    expect(row.interframe_ssim_min).toBe('0.9765');
    expect(row.psnr_min_db).toBe('51.02');
    expect(row.ssim_min).toBe('0.9987');

    const [staticRow] = createBenchmarkCsvRows([batchResult('static-quality')], runtimeInfo);
    expect(staticRow.interframe_ssim_mean).toBe('');
    expect(staticRow.interframe_ssim_std).toBe('');
    expect(staticRow.interframe_ssim_min).toBe('');
    expect(staticRow.psnr_min_db).toBe('');
    expect(staticRow.ssim_min).toBe('');
  });

  it('exports windowed SSIM for both static and trajectory rows', () => {
    const trajectory = batchResult('trajectory-orbit');
    trajectory.results[0].metrics = {
      psnrMean: 57.47,
      ssimMean: 0.99991,
      psnrMin: 51.02,
      ssimMin: 0.99871,
      ssimWindowedMean: 0.93412,
      ssimWindowedMin: 0.88109,
      interFrameSSIMMean: 0.99321,
      interFrameSSIMStdDev: 0.004512,
      interFrameSSIMMin: 0.97654,
      worstTransitionFrame: 17,
      totalFrames: 60,
    };

    const [trajectoryRow] = createBenchmarkCsvRows([trajectory], runtimeInfo);
    expect(trajectoryRow.ssim_windowed).toBe('0.9341');
    expect(trajectoryRow.ssim_windowed_min).toBe('0.8811');
    // the whole-image columns keep their own, unrelated values
    expect(trajectoryRow.ssim).toBe('0.9999');
    expect(trajectoryRow.ssim_min).toBe('0.9987');

    const staticInput = batchResult('static-quality');
    staticInput.results[0].metrics = { psnr: 58.37, ssim: 0.99997, ssimWindowed: 0.91234 };
    const [staticRow] = createBenchmarkCsvRows([staticInput], runtimeInfo);
    expect(staticRow.ssim_windowed).toBe('0.9123');
    // no per-frame minimum exists for a single static capture
    expect(staticRow.ssim_windowed_min).toBe('');
    expect(staticRow.ssim).toBe('1.0000');
  });

  it('blanks the windowed columns when a run predates the metric', () => {
    const legacy = batchResult('trajectory-orbit');
    legacy.results[0].metrics = { psnrMean: 57.47, ssimMean: 0.99991 };
    const [row] = createBenchmarkCsvRows([legacy], runtimeInfo);
    expect(row.ssim_windowed).toBe('');
    expect(row.ssim_windowed_min).toBe('');
  });

  it('exports load phase breakdown on front rows and blanks elsewhere', () => {
    const phaseMetrics = {
      reference: metrics({ loadReadMs: 112, loadInitMs: 355, loadFirstFrameMs: 501 }),
      test: metrics({ loadReadMs: 34, loadInitMs: 148, loadFirstFrameMs: 220 }),
      cameraPosition: { x: 0, y: 0, z: 4.2 },
      canvasWidth: 480,
      canvasHeight: 811,
    };

    const front = batchResult('trajectory-orbit');
    front.benchmarkMetricsByTestId!['trajectory-orbit'] = phaseMetrics;
    const [frontRow] = createBenchmarkCsvRows([front], runtimeInfo);
    expect(frontRow.load_read_ms_reference).toBe('112');
    expect(frontRow.load_init_ms_reference).toBe('355');
    expect(frontRow.load_first_frame_ms_reference).toBe('501');
    expect(frontRow.load_read_ms_test).toBe('34');
    expect(frontRow.load_init_ms_test).toBe('148');
    expect(frontRow.load_first_frame_ms_test).toBe('220');

    const wide = batchResult('trajectory-orbit');
    wide.pairName = 'bonsai-ksplat-wide-r2';
    wide.testFile = 'test_bonsai-ksplat-wide-r2.ksplat';
    wide.benchmarkMetricsByTestId!['trajectory-orbit'] = phaseMetrics;
    const [wideRow] = createBenchmarkCsvRows([wide], runtimeInfo);
    expect(wideRow.viewpoint_name).toBe('wide');
    expect(wideRow.load_read_ms_reference).toBe('');
    expect(wideRow.load_init_ms_reference).toBe('');
    expect(wideRow.load_first_frame_ms_reference).toBe('');
    expect(wideRow.load_read_ms_test).toBe('');
    expect(wideRow.load_init_ms_test).toBe('');
    expect(wideRow.load_first_frame_ms_test).toBe('');
  });

  it('exports load phases as blank when not measured (collector reports 0)', () => {
    const [row] = createBenchmarkCsvRows([batchResult('trajectory-orbit')], runtimeInfo);
    expect(row.load_read_ms_reference).toBe('');
    expect(row.load_first_frame_ms_test).toBe('');
  });

  it('populates stability and memory columns from the metrics snapshot', () => {
    const input = batchResult('trajectory-orbit');
    input.benchmarkMetricsByTestId!['trajectory-orbit'] = {
      reference: metrics({ fps1PercentLow: 84.2, frameTimeVariance: 1.87, memoryUsage: 412.3 }),
      test: metrics({ fps1PercentLow: 61.8, frameTimeVariance: 3.42, memoryUsage: 388.9 }),
      cameraPosition: { x: 0, y: 0, z: 4.2 },
      canvasWidth: 480,
      canvasHeight: 811,
    };

    const [row] = createBenchmarkCsvRows([input], runtimeInfo);
    expect(row.fps_1_percent_low_reference).toBe('84.2');
    expect(row.frame_time_variance_reference).toBe('1.87');
    expect(row.memory_mb_reference).toBe('412.3');
    expect(row.fps_1_percent_low_test).toBe('61.8');
    expect(row.frame_time_variance_test).toBe('3.42');
    expect(row.memory_mb_test).toBe('388.9');
  });

  it('exports memory as blank when the collector reports 0 (API unavailable)', () => {
    const [row] = createBenchmarkCsvRows([batchResult('trajectory-orbit')], runtimeInfo);
    expect(row.memory_mb_reference).toBe('');
    expect(row.memory_mb_test).toBe('');
  });

  it('leaves stability columns blank for static-quality rows', () => {
    const input = batchResult('static-quality');
    input.benchmarkMetricsByTestId!['static-quality'] = {
      reference: metrics({ fps1PercentLow: 84.2, frameTimeVariance: 1.87 }),
      test: metrics({ fps1PercentLow: 61.8, frameTimeVariance: 3.42 }),
      cameraPosition: { x: 0, y: 0, z: 4.2 },
      canvasWidth: 480,
      canvasHeight: 811,
    };

    const [row] = createBenchmarkCsvRows([input], runtimeInfo);
    expect(row.fps_1_percent_low_reference).toBe('');
    expect(row.frame_time_variance_reference).toBe('');
    expect(row.fps_1_percent_low_test).toBe('');
    expect(row.frame_time_variance_test).toBe('');
  });

  it('leaves static quality FPS fields blank and escapes camera JSON', () => {
    const csv = exportBenchmarkBatchResultsToCSV([batchResult('static-quality')], runtimeInfo);
    const [, row] = csv.split('\n');

    expect(row).toContain('static-quality');
    expect(row).toContain('"{""x"":0,""y"":0,""z"":4.2}"');
    expect(row).toContain(',58.37,1.0000,,,,467,');
  });

  it('uses explicit benchmark rows for repeated test ids across viewpoints and replicates', () => {
    const repeatedResult = {
      testId: 'trajectory-orbit',
      metrics: { psnrMean: 61.23, ssimMean: 0.9988 },
      metricEntries: [],
      summary: 'ok',
      passed: true,
      completedAt: '2026-04-12T05:28:00.947Z',
      durationMs: 3900,
    };

    const rows = createBenchmarkCsvRows(
      [
        {
          pairName: 'bonsai-ksplat',
          refFile: 'ref_bonsai-ksplat.ply',
          testFile: 'test_bonsai-ksplat.ksplat',
          refSizeBytes: 58_730_496,
          testSizeBytes: 5_630_853,
          results: [],
          benchmarkRows: [
            {
              pairName: 'bonsai-ksplat',
              refFile: 'ref_bonsai-ksplat.ply',
              testFile: 'test_bonsai-ksplat.ksplat',
              refSizeBytes: 58_730_496,
              testSizeBytes: 5_630_853,
              result: repeatedResult,
              benchmarkMetrics: {
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
              benchmarkMetrics: {
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
