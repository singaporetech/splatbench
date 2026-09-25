import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertCaptureHasContent,
  assertHardwareWebGL,
  blankCaptureReason,
  softwareRendererReason,
  webglRendererName,
} from './captureGates';
import { captureFrame } from './trajectoryMetrics';
import { captureCanvas } from './imageQuality';
import type { SparkViewerContext } from '../../types';

const UNMASKED_RENDERER_WEBGL = 0x9246;
const RENDERER = 0x1f01;

function fakeGL(options: {
  unmasked?: string | null;
  masked?: string;
  fill?: (pixels: Uint8Array) => void;
}) {
  const getParameter = vi.fn((param: number) => {
    if (param === UNMASKED_RENDERER_WEBGL) return options.unmasked ?? null;
    if (param === RENDERER) return options.masked ?? '';
    return null;
  });
  return {
    RENDERER,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    PIXEL_PACK_BUFFER: 0x88eb,
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info' && options.unmasked !== undefined
        ? { UNMASKED_RENDERER_WEBGL }
        : null,
    getParameter,
    bindBuffer: () => {},
    readPixels: (
      _x: number,
      _y: number,
      _w: number,
      _h: number,
      _format: number,
      _type: number,
      pixels: Uint8Array,
    ) => options.fill?.(pixels),
  } as unknown as WebGL2RenderingContext & { getParameter: typeof getParameter };
}

function image(width: number, height: number, pixel: (i: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(pixel(i), i * 4);
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

// a dark background with a small lit patch, like a splat render
function renderedPixels(pixels: Uint8Array) {
  for (let i = 0; i < pixels.length; i += 4) {
    const lit = i / 4 >= 100 && i / 4 < 120;
    pixels[i] = lit ? 180 : 0;
    pixels[i + 1] = lit ? 140 : 0;
    pixels[i + 2] = lit ? 90 : 0;
    pixels[i + 3] = 255;
  }
}

function opaqueBlack(pixels: Uint8Array) {
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
}

// GPU renderer strings, including the one in the released CSVs, and the
// masked name some browsers report instead
const GPU_RENDERERS = [
  'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)',
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 (0x00002206) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E9B) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, AMD Radeon Pro 5500M OpenGL Engine, OpenGL 4.1)',
  'Apple GPU',
  'Mali-G78',
  'Adreno (TM) 740',
  'WebKit WebGL',
];

const SOFTWARE_RENDERERS = [
  'Google SwiftShader',
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
  'llvmpipe (LLVM 15.0.7, 256 bits)',
  'Mesa softpipe',
  'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'Software Rasterizer',
  'WARP',
];

describe('software renderer gate', () => {
  it.each(GPU_RENDERERS)('accepts %s', (renderer) => {
    expect(softwareRendererReason(renderer)).toBeNull();
  });

  it.each(SOFTWARE_RENDERERS)('refuses %s', (renderer) => {
    expect(softwareRendererReason(renderer)).toMatch(/software renderer/);
  });

  it('refuses a context that reports no renderer', () => {
    expect(softwareRendererReason(null)).toBe('WebGL reports no renderer information');
    expect(webglRendererName(fakeGL({ unmasked: '  ', masked: '' }))).toBeNull();
  });

  it('prefers the unmasked renderer and falls back to RENDERER', () => {
    expect(webglRendererName(fakeGL({ unmasked: 'Apple GPU', masked: 'WebKit WebGL' }))).toBe('Apple GPU');
    expect(webglRendererName(fakeGL({ masked: 'Mali-G78' }))).toBe('Mali-G78');
  });

  it('throws for a software context and checks each context once', () => {
    const software = fakeGL({ unmasked: 'Google SwiftShader' });
    expect(() => assertHardwareWebGL(software)).toThrow(/Capture refused: WebGL is running on a software renderer/);
    expect(() => assertHardwareWebGL(software)).toThrow();
    expect(software.getParameter).toHaveBeenCalledTimes(1);

    const gpu = fakeGL({ unmasked: GPU_RENDERERS[0] });
    expect(() => assertHardwareWebGL(gpu)).not.toThrow();
  });
});

describe('blank capture gate', () => {
  it('refuses a fully transparent capture', () => {
    const transparent = image(8, 8, (i) => [i % 256, 0, 0, 0]);
    expect(blankCaptureReason(transparent)).toBe('the capture is fully transparent');
  });

  it('refuses a capture where every pixel has the same colour', () => {
    expect(blankCaptureReason(image(8, 8, () => [0, 0, 0, 255]))).toMatch(/blank/);
    expect(blankCaptureReason(image(8, 8, () => [30, 60, 90, 255]))).toMatch(/blank/);
  });

  it('accepts a dark frame with any rendered content', () => {
    expect(blankCaptureReason(image(8, 8, (i) => (i === 63 ? [1, 0, 0, 255] : [0, 0, 0, 255])))).toBeNull();
  });

  it('names the reason and the capture size when it throws', () => {
    expect(() => assertCaptureHasContent(image(4, 3, () => [0, 0, 0, 0]))).toThrow(
      'Capture refused: the capture is fully transparent at 4x3.',
    );
  });
});

describe('capture paths apply the gates', () => {
  class FakeImageData {
    data: Uint8ClampedArray;
    colorSpace = 'srgb';
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }

  beforeEach(() => {
    vi.stubGlobal('ImageData', FakeImageData);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function contextFor(gl: WebGL2RenderingContext): SparkViewerContext {
    const canvas = { width: 16, height: 16, getContext: () => gl };
    return { canvas, forceRender: () => {} } as unknown as SparkViewerContext;
  }

  it('captureFrame returns a rendered frame from a GPU context', () => {
    const frame = captureFrame(contextFor(fakeGL({ unmasked: GPU_RENDERERS[0], fill: renderedPixels })));
    expect(frame.width).toBe(16);
  });

  it('captureFrame refuses a software renderer', () => {
    const context = contextFor(fakeGL({ unmasked: 'Google SwiftShader', fill: renderedPixels }));
    expect(() => captureFrame(context)).toThrow(/software renderer/);
  });

  it('captureFrame refuses a blank frame', () => {
    const context = contextFor(fakeGL({ unmasked: GPU_RENDERERS[0], fill: opaqueBlack }));
    expect(() => captureFrame(context)).toThrow(/blank/);
  });

  it('captureCanvas refuses a transparent frame and a software renderer', async () => {
    const transparent = contextFor(fakeGL({ unmasked: GPU_RENDERERS[0] }));
    await expect(captureCanvas(transparent.canvas, transparent)).rejects.toThrow(/fully transparent/);

    const software = contextFor(fakeGL({ unmasked: 'llvmpipe (LLVM 15.0.7, 256 bits)', fill: renderedPixels }));
    await expect(captureCanvas(software.canvas, software)).rejects.toThrow(/software renderer/);

    const gpu = contextFor(fakeGL({ unmasked: GPU_RENDERERS[1], fill: renderedPixels }));
    await expect(captureCanvas(gpu.canvas, gpu)).resolves.toMatchObject({ width: 16, height: 16 });
  });
});
