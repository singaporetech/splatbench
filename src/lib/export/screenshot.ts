import type { SparkViewerContext } from '../../types';

export interface ScreenshotOptions {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
  quality?: number;
  transparent?: boolean;
}

export interface ScreenshotMetadata {
  sceneName: string;
  format: string;
  viewpoint: string;
  side: 'A' | 'B';
  timestamp: string;
  resolution: string;
  cameraDistance: number;
}

const DEFAULT_OPTIONS: ScreenshotOptions = {
  width: 1920,
  height: 1080,
  format: 'png',
  quality: 0.95,
  transparent: false,
};

const CANVAS_EXPORT_TIMEOUT_MS = 5000;

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64Data] = dataUrl.split(',');
  const mimeType = header.match(/^data:([^;]+)/)?.[1] || 'image/png';
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

async function exportCanvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  let timedOut = false;

  const blob = await new Promise<Blob | null>((resolve) => {
    const timeout = window.setTimeout(() => {
      timedOut = true;
      resolve(null);
    }, CANVAS_EXPORT_TIMEOUT_MS);

    canvas.toBlob(
      (result) => {
        if (timedOut) return;
        window.clearTimeout(timeout);
        resolve(result);
      },
      mimeType,
      quality,
    );
  });

  if (blob) {
    return blob;
  }

  console.warn('[Screenshot] canvas.toBlob timed out; falling back to toDataURL');
  return dataUrlToBlob(canvas.toDataURL(mimeType, quality));
}

export async function captureScreenshot(
  context: SparkViewerContext,
  options: ScreenshotOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { renderer, scene, camera } = context;
  const canvas = renderer.domElement;

  const originalWidth = canvas.width;
  const originalHeight = canvas.height;
  const originalPixelRatio = renderer.getPixelRatio();

  try {
    renderer.setPixelRatio(1);
    renderer.setSize(opts.width!, opts.height!, false);
    camera.aspect = opts.width! / opts.height!;
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);

    const ctx = canvas.getContext('2d');
    if (opts.transparent && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderer.render(scene, camera);
    }

    const gl = renderer.getContext();
    gl.flush();
    gl.finish();

    const mimeType = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await exportCanvasBlob(canvas, mimeType, opts.quality);

    return blob;
  } finally {
    renderer.setPixelRatio(originalPixelRatio);
    renderer.setSize(originalWidth, originalHeight, false);
    camera.aspect = originalWidth / originalHeight;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
}

/**
 * Format: {scene}_{format}_{viewpoint}_{side}_{timestamp}.png
 */
export function generateScreenshotFilename(
  metadata: ScreenshotMetadata
): string {
  const date = metadata.timestamp.split('T')[0];
  return [
    metadata.sceneName,
    metadata.format,
    metadata.viewpoint.toLowerCase().replace(/\s+/g, '-'),
    metadata.side,
    date,
  ].join('_') + '.png';
}

/**
 * Format: {scene}_comparison_{viewpoint}_{timestamp}.png
 */
export function generateComparisonFilename(
  sceneName: string,
  viewpoint: string,
  timestamp: string
): string {
  const date = timestamp.split('T')[0];
  return [
    sceneName,
    'comparison',
    viewpoint.toLowerCase().replace(/\s+/g, '-'),
    date,
  ].join('_') + '.png';
}

export async function captureComparisonScreenshot(
  contextA: SparkViewerContext,
  contextB: SparkViewerContext,
  options: ScreenshotOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const width = opts.width!;
  const height = opts.height!;

  const [blobA, blobB] = await Promise.all([
    captureScreenshot(contextA, { ...opts, width: width / 2, height }),
    captureScreenshot(contextB, { ...opts, width: width / 2, height }),
  ]);

  const composite = document.createElement('canvas');
  composite.width = width;
  composite.height = height;
  const ctx = composite.getContext('2d')!;

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, width, height);

  const imgA = await createImageBitmap(blobA);
  const imgB = await createImageBitmap(blobB);

  ctx.drawImage(imgA, 0, 0, width / 2, height);
  ctx.drawImage(imgB, width / 2, 0, width / 2, height);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fillText('Reference', 20, 40);
  ctx.fillText('Compressed', width / 2 + 20, 40);

  return exportCanvasBlob(composite, 'image/png');
}

export function downloadScreenshot(
  blob: Blob,
  filename: string
): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Returns both the image blob and metadata for CSV logging
 */
export async function captureScreenshotWithMetadata(
  context: SparkViewerContext,
  metadata: Omit<ScreenshotMetadata, 'timestamp' | 'resolution' | 'cameraDistance'>,
  options: ScreenshotOptions = {}
): Promise<{ blob: Blob; metadata: ScreenshotMetadata }> {
  const cameraDistance = context.camera.position.length();

  const fullMetadata: ScreenshotMetadata = {
    ...metadata,
    timestamp: new Date().toISOString(),
    resolution: `${options.width || 1920}x${options.height || 1080}`,
    cameraDistance,
  };

  const blob = await captureScreenshot(context, options);

  return { blob, metadata: fullMetadata };
}

export function createScreenshotHandler(
  contextA: SparkViewerContext | null,
  contextB: SparkViewerContext | null,
  sceneName: string,
  formatA: string,
  formatB: string,
  viewpoint: string
) {
  return async (side: 'A' | 'B' | 'comparison') => {
    if (side === 'comparison') {
      if (!contextA || !contextB) return;
      const blob = await captureComparisonScreenshot(contextA, contextB);
      const filename = generateComparisonFilename(sceneName, viewpoint, new Date().toISOString());
      downloadScreenshot(blob, filename);
    } else {
      const context = side === 'A' ? contextA : contextB;
      const format = side === 'A' ? formatA : formatB;
      if (!context) return;

      const { blob, metadata } = await captureScreenshotWithMetadata(
        context,
        {
          sceneName,
          format,
          viewpoint,
          side,
        }
      );

      const filename = generateScreenshotFilename(metadata);
      downloadScreenshot(blob, filename);
    }
  };
}

/**
 * Captures all supplied viewpoints in order
 */
export async function captureViewpointSeries(
  context: SparkViewerContext,
  sceneName: string,
  format: string,
  side: 'A' | 'B',
  viewpoints: Array<{ name: string; apply: () => void }>,
  onCapture?: (name: string) => void
): Promise<Array<{ name: string; blob: Blob; metadata: ScreenshotMetadata }>> {
  const results = [];

  for (const viewpoint of viewpoints) {
    viewpoint.apply();

    await new Promise(resolve => setTimeout(resolve, 100));

    const { blob, metadata } = await captureScreenshotWithMetadata(
      context,
      {
        sceneName,
        format,
        viewpoint: viewpoint.name,
        side,
      }
    );

    results.push({
      name: viewpoint.name,
      blob,
      metadata,
    });

    onCapture?.(viewpoint.name);
  }

  return results;
}
