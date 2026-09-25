/**
 * Benchmark CSV export.
 *
 * Writes one row per scene, format, viewpoint, replicate, and test with a fixed
 * column order, so batch runs from different sessions and machines can be
 * concatenated and analysed together.
 */

import type { BenchmarkMetrics } from '../../types';
import type { TestResult } from '../testing/types';
import { APP_VERSION, RENDERER_LIB_VERSIONS, EXPORT_SCHEMA_VERSION } from './buildInfo';
import { RECOGNIZED_SCENE_TOKENS } from '../scenes/sceneCatalog';

export { EXPORT_SCHEMA_VERSION } from './buildInfo';

export const BENCHMARK_CSV_HEADERS = [
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
  // schema 2.0, appended after the original 41 columns
  'app_version',
  'renderer_lib_versions',
  'export_schema_version',
  // trajectory rows only
  'interframe_ssim_mean',
  'interframe_ssim_std',
  'interframe_ssim_min',
  'psnr_min_db',
  'ssim_min',
  // front-viewpoint rows only, like load_time_ms
  'load_read_ms_reference',
  'load_init_ms_reference',
  'load_first_frame_ms_reference',
  'load_read_ms_test',
  'load_init_ms_test',
  'load_first_frame_ms_test',
  // schema 2.1: windowed SSIM; ssim and ssim_min above stay whole-image
  'ssim_windowed',
  'ssim_windowed_min',
] as const;

type BenchmarkCsvHeader = (typeof BENCHMARK_CSV_HEADERS)[number];
type BenchmarkCsvRow = Record<BenchmarkCsvHeader, string>;

export interface BenchmarkRuntimeInfo {
  browserName: string;
  browserVersion: string;
  browserEngine: string;
  gpuRenderer: string;
  webglVersion: string;
  osPlatform: string;
  screenResolution: string;
  devicePixelRatio: number;
}

export interface BenchmarkMetricSnapshot {
  reference: BenchmarkMetrics;
  test: BenchmarkMetrics;
  cameraPosition: { x: number; y: number; z: number };
  canvasWidth: number;
  canvasHeight: number;
}

export interface BenchmarkBatchRowInput {
  pairName: string;
  refFile: string;
  testFile: string;
  refSizeBytes?: number;
  testSizeBytes?: number;
  result: TestResult;
  benchmarkMetrics?: BenchmarkMetricSnapshot;
  sceneName?: string;
  referenceFormat?: string;
  testFormat?: string;
  variantOrBasename?: string;
  viewpointName?: string;
  replicate?: string;
}

export interface BenchmarkBatchResultInput {
  pairName: string;
  refFile: string;
  testFile: string;
  refSizeBytes?: number;
  testSizeBytes?: number;
  results: TestResult[];
  benchmarkMetricsByTestId?: Record<string, BenchmarkMetricSnapshot>;
  benchmarkRows?: BenchmarkBatchRowInput[];
}

interface NormalizedBenchmarkRowInput {
  pairName: string;
  refFile: string;
  testFile: string;
  refSizeBytes?: number;
  testSizeBytes?: number;
  result: TestResult;
  benchmarkMetrics?: BenchmarkMetricSnapshot;
  sceneName?: string;
  referenceFormat?: string;
  testFormat?: string;
  variantOrBasename?: string;
  viewpointName?: string;
  replicate?: string;
}

// scene tokens recoverable from a file name when a batch does not use the
// canonical <scene>-<format> pair naming
const CANONICAL_SCENES = RECOGNIZED_SCENE_TOKENS;
const TEST_FORMATS = ['splat', 'ksplat', 'spz', 'sog'] as const;
const VIEWPOINTS = ['front', 'left45', 'right45', 'close', 'wide'] as const;

function formatNumber(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return value.toFixed(digits);
}

function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(Math.round(value));
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/u, '');
}

function extensionWithoutDot(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/u);
  return match?.[1] ?? '';
}

function tokenPattern(token: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, 'iu');
}

function inferSceneName(pairName: string, refFile: string, testFile: string): string {
  const haystack = `${pairName} ${stripExtension(refFile)} ${stripExtension(testFile)}`.toLowerCase();
  return CANONICAL_SCENES.find((scene) => tokenPattern(scene).test(haystack)) ?? '';
}

function inferTestFormat(pairName: string, testFile: string): string {
  const extension = extensionWithoutDot(testFile);
  if ((TEST_FORMATS as readonly string[]).includes(extension)) return extension;

  const haystack = `${pairName} ${testFile}`.toLowerCase();
  return TEST_FORMATS.find((format) => tokenPattern(format).test(haystack)) ?? extension;
}

function inferViewpoint(pairName: string, testFile: string): string {
  const haystack = `${pairName} ${stripExtension(testFile)}`.toLowerCase();
  return VIEWPOINTS.find((viewpoint) => tokenPattern(viewpoint).test(haystack)) ?? 'front';
}

function inferReplicate(pairName: string, testFile: string): string {
  const haystack = `${pairName} ${stripExtension(testFile)}`.toLowerCase();
  const match = haystack.match(/(?:^|[^a-z0-9])(?:r|rep|replicate)[_-]?([1-3])(?:[^a-z0-9]|$)/iu);
  return match?.[1] ?? '1';
}

function inferDistanceTier(viewpointName: string): string {
  if (viewpointName === 'close') return 'near';
  if (viewpointName === 'wide') return 'far';
  return 'mid';
}

function fileSizeMB(sizeBytes: number | undefined, metrics: BenchmarkMetrics | undefined): number | null {
  if (metrics && metrics.fileSize > 0) return metrics.fileSize;
  if (sizeBytes && sizeBytes > 0) return sizeBytes / 1024 / 1024;
  return null;
}

// performance.memory is Chrome-only; the collector reports 0 when it is
// unavailable, which exports as blank rather than 0
function memoryCell(metrics: BenchmarkMetrics | undefined): string {
  const value = metrics?.memoryUsage;
  return value !== undefined && value > 0 ? formatNumber(value, 1) : '';
}

// the collector reports 0 for a load phase that was not measured
function loadPhaseCell(value: number | undefined): string {
  return value !== undefined && value > 0 ? formatInteger(value) : '';
}

function cameraDistance(position: { x: number; y: number; z: number } | undefined): number | null {
  if (!position) return null;
  return Math.hypot(position.x, position.y, position.z);
}

function metricValue(result: TestResult, keys: string[]): number | null {
  for (const key of keys) {
    const value = result.metrics[key];
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function csvCell(value: string): string {
  if (!/[",\n\r]/u.test(value)) return value;
  return `"${value.replace(/"/gu, '""')}"`;
}

function normalizeBenchmarkRows(batchResults: BenchmarkBatchResultInput[]): NormalizedBenchmarkRowInput[] {
  return batchResults.flatMap((pair) => {
    if (pair.benchmarkRows && pair.benchmarkRows.length > 0) {
      return pair.benchmarkRows.map((row) => ({
        pairName: row.pairName,
        refFile: row.refFile,
        testFile: row.testFile,
        refSizeBytes: row.refSizeBytes,
        testSizeBytes: row.testSizeBytes,
        result: row.result,
        benchmarkMetrics: row.benchmarkMetrics,
        sceneName: row.sceneName,
        referenceFormat: row.referenceFormat,
        testFormat: row.testFormat,
        variantOrBasename: row.variantOrBasename,
        viewpointName: row.viewpointName,
        replicate: row.replicate,
      }));
    }

    return pair.results.map((result) => ({
      pairName: pair.pairName,
      refFile: pair.refFile,
      testFile: pair.testFile,
      refSizeBytes: pair.refSizeBytes,
      testSizeBytes: pair.testSizeBytes,
      result,
      benchmarkMetrics: pair.benchmarkMetricsByTestId?.[result.testId],
    }));
  });
}

function getBrowserInfoFromUserAgent(
  userAgent: string,
): Pick<BenchmarkRuntimeInfo, 'browserName' | 'browserVersion' | 'browserEngine'> {
  if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
    return {
      browserName: 'Chrome',
      browserVersion: userAgent.match(/Chrome\/(\d+(?:\.\d+)?)/u)?.[1] ?? 'Unknown',
      browserEngine: 'Blink',
    };
  }
  if (userAgent.includes('Firefox/')) {
    return {
      browserName: 'Firefox',
      browserVersion: userAgent.match(/Firefox\/(\d+(?:\.\d+)?)/u)?.[1] ?? 'Unknown',
      browserEngine: 'Gecko',
    };
  }
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    return {
      browserName: 'Safari',
      browserVersion: userAgent.match(/Version\/(\d+(?:\.\d+)?)/u)?.[1] ?? 'Unknown',
      browserEngine: 'WebKit',
    };
  }
  if (userAgent.includes('Edg/')) {
    return {
      browserName: 'Edge',
      browserVersion: userAgent.match(/Edg\/(\d+(?:\.\d+)?)/u)?.[1] ?? 'Unknown',
      browserEngine: 'Blink',
    };
  }
  return {
    browserName: 'Unknown',
    browserVersion: 'Unknown',
    browserEngine: 'Unknown',
  };
}

export function getBenchmarkRuntimeInfo(): BenchmarkRuntimeInfo {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browserInfo = getBrowserInfoFromUserAgent(userAgent);

  let gpuRenderer = 'Unknown';
  let webglVersion = 'Unknown';
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuRenderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown');
      }
      webglVersion = String(gl.getParameter(gl.VERSION) || 'Unknown');
    }
  }

  return {
    ...browserInfo,
    gpuRenderer,
    webglVersion,
    osPlatform: typeof navigator === 'undefined' ? 'Unknown' : navigator.platform,
    screenResolution: typeof screen === 'undefined' ? 'Unknown' : `${screen.width}x${screen.height}`,
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
  };
}

function createBenchmarkCsvRow(
  input: NormalizedBenchmarkRowInput,
  runtimeInfo: BenchmarkRuntimeInfo,
): BenchmarkCsvRow {
  const sceneName = input.sceneName ?? inferSceneName(input.pairName, input.refFile, input.testFile);
  const referenceFormat = input.referenceFormat ?? extensionWithoutDot(input.refFile);
  const testFormat = input.testFormat ?? inferTestFormat(input.pairName, input.testFile);
  const viewpointName = input.viewpointName ?? inferViewpoint(input.pairName, input.testFile);
  const replicate = input.replicate ?? inferReplicate(input.pairName, input.testFile);
  const metrics = input.benchmarkMetrics;
  const referenceSizeMB = fileSizeMB(input.refSizeBytes, metrics?.reference);
  const testSizeMB = fileSizeMB(input.testSizeBytes, metrics?.test);
  const compressionRatio =
    referenceSizeMB !== null && testSizeMB !== null && testSizeMB > 0
      ? referenceSizeMB / testSizeMB
      : null;
  const position = metrics?.cameraPosition;
  const distance = cameraDistance(position);
  const isStatic = input.result.testId === 'static-quality';
  const isFront = viewpointName === 'front';
  const psnr = metricValue(input.result, ['psnr', 'psnrMean']);
  const ssim = metricValue(input.result, ['ssim', 'ssimMean']);
  const variantOrBasename =
    input.variantOrBasename ?? (sceneName && testFormat ? `${sceneName}.${testFormat}` : '');

  return {
    timestamp: input.result.completedAt,
    test_id: input.result.testId,
    replicate,
    scene_name: sceneName,
    scene: sceneName,
    reference_format: referenceFormat,
    test_format: testFormat,
    variant_or_basename: variantOrBasename,
    file_size_reference_mb: formatNumber(referenceSizeMB, 2),
    file_size_test_mb: formatNumber(testSizeMB, 2),
    compression_ratio: formatNumber(compressionRatio, 2),
    viewpoint_name: viewpointName,
    camera_distance: formatNumber(distance, 2),
    distance_tier: inferDistanceTier(viewpointName),
    camera_position: position ? JSON.stringify(position) : '',
    psnr_db: formatNumber(psnr, 2),
    ssim: formatNumber(ssim, 4),
    fps_reference: isStatic ? '' : formatNumber(metrics?.reference.fps, 1),
    frame_time_ms_reference: isStatic ? '' : formatNumber(metrics?.reference.frameTime, 2),
    memory_mb_reference: memoryCell(metrics?.reference),
    load_time_ms_reference: isFront ? formatInteger(metrics?.reference.loadTime) : '',
    fps_1_percent_low_reference: isStatic ? '' : formatNumber(metrics?.reference.fps1PercentLow, 1),
    frame_time_variance_reference: isStatic ? '' : formatNumber(metrics?.reference.frameTimeVariance, 2),
    fps_test: isStatic ? '' : formatNumber(metrics?.test.fps, 1),
    frame_time_ms_test: isStatic ? '' : formatNumber(metrics?.test.frameTime, 2),
    memory_mb_test: memoryCell(metrics?.test),
    load_time_ms_test: isFront ? formatInteger(metrics?.test.loadTime) : '',
    fps_1_percent_low_test: isStatic ? '' : formatNumber(metrics?.test.fps1PercentLow, 1),
    frame_time_variance_test: isStatic ? '' : formatNumber(metrics?.test.frameTimeVariance, 2),
    browser_name: runtimeInfo.browserName,
    browser_version: runtimeInfo.browserVersion,
    browser_engine: runtimeInfo.browserEngine,
    gpu_renderer: runtimeInfo.gpuRenderer,
    webgl_version: runtimeInfo.webglVersion,
    os_platform: runtimeInfo.osPlatform,
    screen_resolution: runtimeInfo.screenResolution,
    device_pixel_ratio: formatNumber(runtimeInfo.devicePixelRatio, 2),
    splat_count_reference: formatInteger(metrics?.reference.splatCount),
    splat_count_test: formatInteger(metrics?.test.splatCount),
    canvas_width: formatInteger(metrics?.canvasWidth || metrics?.reference.resolution[0]),
    canvas_height: formatInteger(metrics?.canvasHeight || metrics?.reference.resolution[1]),
    app_version: APP_VERSION,
    renderer_lib_versions: RENDERER_LIB_VERSIONS,
    export_schema_version: EXPORT_SCHEMA_VERSION,
    interframe_ssim_mean: formatNumber(metricValue(input.result, ['interFrameSSIMMean']), 4),
    interframe_ssim_std: formatNumber(metricValue(input.result, ['interFrameSSIMStdDev']), 6),
    interframe_ssim_min: formatNumber(metricValue(input.result, ['interFrameSSIMMin']), 4),
    psnr_min_db: formatNumber(metricValue(input.result, ['psnrMin']), 2),
    ssim_min: formatNumber(metricValue(input.result, ['ssimMin']), 4),
    load_read_ms_reference: isFront ? loadPhaseCell(metrics?.reference.loadReadMs) : '',
    load_init_ms_reference: isFront ? loadPhaseCell(metrics?.reference.loadInitMs) : '',
    load_first_frame_ms_reference: isFront ? loadPhaseCell(metrics?.reference.loadFirstFrameMs) : '',
    load_read_ms_test: isFront ? loadPhaseCell(metrics?.test.loadReadMs) : '',
    load_init_ms_test: isFront ? loadPhaseCell(metrics?.test.loadInitMs) : '',
    load_first_frame_ms_test: isFront ? loadPhaseCell(metrics?.test.loadFirstFrameMs) : '',
    ssim_windowed: formatNumber(metricValue(input.result, ['ssimWindowed', 'ssimWindowedMean']), 4),
    ssim_windowed_min: formatNumber(metricValue(input.result, ['ssimWindowedMin']), 4),
  };
}

export function createBenchmarkCsvRows(
  batchResults: BenchmarkBatchResultInput[],
  runtimeInfo: BenchmarkRuntimeInfo = getBenchmarkRuntimeInfo(),
): BenchmarkCsvRow[] {
  return normalizeBenchmarkRows(batchResults).map((row) => createBenchmarkCsvRow(row, runtimeInfo));
}

export function exportBenchmarkBatchResultsToCSV(
  batchResults: BenchmarkBatchResultInput[],
  runtimeInfo?: BenchmarkRuntimeInfo,
): string {
  const rows = createBenchmarkCsvRows(batchResults, runtimeInfo);
  return [
    BENCHMARK_CSV_HEADERS.join(','),
    ...rows.map((row) => BENCHMARK_CSV_HEADERS.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
}

export function downloadBenchmarkCSV(csv: string, filename?: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? `splatbench_benchmark_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
