/**
 * Inter-frame SSIM must describe the frames of the asset under test
 * (`scene.primary`), not the ground-truth reference.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import type { SparkViewerContext } from '../../types';

// frames are keyed by each stub context's canvas, so the mocked capture can
// return a distinct synthetic sequence per viewer
const frameSequences = new Map<object, ImageData[]>();
const captureCursors = new Map<object, number>();

vi.mock('../metrics/trajectoryMetrics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../metrics/trajectoryMetrics')>();
  return {
    ...actual,
    captureFrame: (context: SparkViewerContext): ImageData => {
      const frames = frameSequences.get(context.canvas);
      if (!frames) throw new Error('no synthetic frame sequence registered');
      const cursor = captureCursors.get(context.canvas) ?? 0;
      captureCursors.set(context.canvas, cursor + 1);
      return frames[cursor % frames.length];
    },
  };
});

const { orbitTest } = await import('./trajectoryTests');

function createImageData(width: number, height: number, value: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return { data, width, height, colorSpace: 'srgb' as PredefinedColorSpace };
}

/** Alternating dark/bright frames: unstable, so inter-frame SSIM is far below 1. */
function flickeringSequence(): ImageData[] {
  return [createImageData(8, 8, 40), createImageData(8, 8, 215)];
}

/** Constant frames: perfectly stable, so inter-frame SSIM is exactly 1. */
function stableSequence(): ImageData[] {
  return [createImageData(8, 8, 128)];
}

function stubContext(frames: ImageData[]): SparkViewerContext {
  const canvas = { width: 8, height: 8 } as unknown as HTMLCanvasElement;
  frameSequences.set(canvas, frames);
  captureCursors.set(canvas, 0);

  return {
    scene: null,
    camera: { position: new THREE.Vector3(0, 0, 3) },
    renderer: null,
    controls: { target: new THREE.Vector3(0, 0, 0), update: () => {} },
    splatMesh: null,
    canvas,
    forceRender: () => {},
  } as unknown as SparkViewerContext;
}

const noopProgress = () => {};

describe('trajectory tests measure temporal stability on the asset under test', () => {
  beforeEach(() => {
    frameSequences.clear();
    captureCursors.clear();
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      return setTimeout(() => callback(0), 0) as unknown as number;
    }) as typeof globalThis.requestAnimationFrame;
  });

  afterEach(() => {
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  });

  it('reports the primary (test) sequence, not the reference sequence', async () => {
    const underTest = stubContext(flickeringSequence());
    const reference = stubContext(stableSequence());

    const result = await orbitTest.run(
      { primary: underTest, reference },
      noopProgress,
      new AbortController().signal,
    );

    // the flickering sequence must dominate the temporal-stability columns
    expect(result.metrics.interFrameSSIMMean).toBeLessThan(0.9);
    expect(result.metrics.interFrameSSIMStdDev).toBeGreaterThanOrEqual(0);
    expect(result.metrics.interFrameSSIMMin).toBeLessThan(0.9);

    // the stable reference would have produced 1.0; assert we did not read it
    expect(result.metrics.interFrameSSIMMean).not.toBeCloseTo(1, 3);
  });

  it('reports 1.0 when the stable sequence is the primary', async () => {
    const underTest = stubContext(stableSequence());
    const reference = stubContext(flickeringSequence());

    const result = await orbitTest.run(
      { primary: underTest, reference },
      noopProgress,
      new AbortController().signal,
    );

    expect(result.metrics.interFrameSSIMMean).toBeCloseTo(1, 6);
    expect(result.metrics.interFrameSSIMMin).toBeCloseTo(1, 6);
    expect(result.metrics.interFrameSSIMStdDev).toBeCloseTo(0, 6);
  });

  it('still computes PSNR and SSIM against the reference viewer', async () => {
    const underTest = stubContext(stableSequence());
    const reference = stubContext([createImageData(8, 8, 120)]);

    const result = await orbitTest.run(
      { primary: underTest, reference },
      noopProgress,
      new AbortController().signal,
    );

    expect(result.metrics.psnrMean).toBeGreaterThan(0);
    expect(result.metrics.psnrMean).toBeLessThan(Infinity);
    expect(result.metrics.ssimMean).toBeGreaterThan(0);
  });

  it('falls back to single-viewer temporal stability with no reference', async () => {
    const underTest = stubContext(flickeringSequence());

    const result = await orbitTest.run(
      { primary: underTest, reference: null },
      noopProgress,
      new AbortController().signal,
    );

    expect(result.metrics.interFrameSSIMMean).toBeLessThan(0.9);
    expect(result.metrics.psnrMean).toBeUndefined();
    expect(result.metrics.ssimMean).toBeUndefined();
  });
});
