/**
 * Paper CSV export for the respack validator schema.
 *
 * This keeps the column order aligned with scripts/validate_paper_readiness.py
 * so app-side batch output can be staged directly for paper-readiness checks.
 */

import type { BenchmarkMetrics } from '../../types';
import type { TestResult } from '../testing/types';

export const PAPER_CSV_HEADERS = [
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
] as const;

type PaperCsvHeader = (typeof PAPER_CSV_HEADERS)[number];
type PaperCsvRow = Record<PaperCsvHeader, string>;

export interface PaperRuntimeInfo {
  browserName: string;
  browserVersion: string;
  browserEngine: string;
  gpuRenderer: string;
  webglVersion: string;
  osPlatform: string;
  screenResolution: string;
  devicePixelRatio: number;
}

export interface PaperMetricSnapshot {
  reference: BenchmarkMetrics;
  test: BenchmarkMetrics;
  cameraPosition: { x: number; y: number; z: number };
  canvasWidth: number;
  canvasHeight: number;
}

export interface PaperBatchRowInput {
  pairName: string;
  refFile: string;
  testFile: string;
  refSizeBytes?: number;
  testSizeBytes?: number;
  result: TestResult;
  paperMetrics?: PaperMetricSnapshot;
  sceneName?: string;
  referenceFormat?: string;
  testFormat?: string;
  variantOrBasename?: string;
  viewpointName?: string;
  replicate?: string;
}

export interface PaperBatchResultInput {
  pairName: string;
  refFile: string;
  testFile: string;
  refSizeBytes?: number;
  testSizeBytes?: number;
  results: TestResult[];
  paperMetricsByTestId?: Record<string, PaperMetricSnapshot>;
  paperRows?: PaperBatchRowInput[];
}

interface NormalizedPaperRowInput {
  pairName: string;
  refFile: string;
  testFile: string;
  refSizeBytes?: number;
  testSizeBytes?: number;
  result: TestResult;
  paperMetrics?: PaperMetricSnapshot;
  sceneName?: string;
  referenceFormat?: string;
  testFormat?: string;
  variantOrBasename?: string;
  viewpointName?: string;
  replicate?: string;
}

const CANONICAL_SCENES = ['bonsai', 'flower', 'garden', 'playroom', 'train', 'truck'] as const;
const TEST_FORMATS = ['splat', 'ksplat', 'spz'] as const;
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

function normalizePaperRows(batchResults: PaperBatchResultInput[]): NormalizedPaperRowInput[] {
  return batchResults.flatMap((pair) => {
    if (pair.paperRows && pair.paperRows.length > 0) {
      return pair.paperRows.map((row) => ({
        pairName: row.pairName,
        refFile: row.refFile,
        testFile: row.testFile,
        refSizeBytes: row.refSizeBytes,
        testSizeBytes: row.testSizeBytes,
        result: row.result,
        paperMetrics: row.paperMetrics,
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
      paperMetrics: pair.paperMetricsByTestId?.[result.testId],
    }));
  });
}

function getBrowserInfoFromUserAgent(
  userAgent: string,
): Pick<PaperRuntimeInfo, 'browserName' | 'browserVersion' | 'browserEngine'> {
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

export function getPaperRuntimeInfo(): PaperRuntimeInfo {
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

function createPaperCsvRow(
  input: NormalizedPaperRowInput,
  runtimeInfo: PaperRuntimeInfo,
): PaperCsvRow {
  const sceneName = input.sceneName ?? inferSceneName(input.pairName, input.refFile, input.testFile);
  const referenceFormat = input.referenceFormat ?? extensionWithoutDot(input.refFile);
  const testFormat = input.testFormat ?? inferTestFormat(input.pairName, input.testFile);
  const viewpointName = input.viewpointName ?? inferViewpoint(input.pairName, input.testFile);
  const replicate = input.replicate ?? inferReplicate(input.pairName, input.testFile);
  const metrics = input.paperMetrics;
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
    memory_mb_reference: '',
    load_time_ms_reference: isFront ? formatInteger(metrics?.reference.loadTime) : '',
    fps_1_percent_low_reference: '',
    frame_time_variance_reference: '',
    fps_test: isStatic ? '' : formatNumber(metrics?.test.fps, 1),
    frame_time_ms_test: isStatic ? '' : formatNumber(metrics?.test.frameTime, 2),
    memory_mb_test: '',
    load_time_ms_test: isFront ? formatInteger(metrics?.test.loadTime) : '',
    fps_1_percent_low_test: '',
    frame_time_variance_test: '',
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
  };
}

export function createPaperCsvRows(
  batchResults: PaperBatchResultInput[],
  runtimeInfo: PaperRuntimeInfo = getPaperRuntimeInfo(),
): PaperCsvRow[] {
  return normalizePaperRows(batchResults).map((row) => createPaperCsvRow(row, runtimeInfo));
}

export function exportPaperBatchResultsToCSV(
  batchResults: PaperBatchResultInput[],
  runtimeInfo?: PaperRuntimeInfo,
): string {
  const rows = createPaperCsvRows(batchResults, runtimeInfo);
  return [
    PAPER_CSV_HEADERS.join(','),
    ...rows.map((row) => PAPER_CSV_HEADERS.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
}

export function downloadPaperCSV(csv: string, filename?: string): void {
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
