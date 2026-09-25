/**
 * Validation gates for pixel captures. A capture that fails a gate throws, so
 * the measurement it belongs to stops with an error instead of exporting
 * numbers from a software rasterizer or from a frame with nothing drawn in it.
 * The resolution gate lives with the comparisons (useImageQuality and
 * calculatePSNR / calculateSSIM), which refuse images of different sizes.
 */

// renderer strings of software rasterizers: SwiftShader, Mesa llvmpipe and
// softpipe, Microsoft Basic Render Driver and WARP, and anything labelled
// "software"; GPU renderer strings do not contain these
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render driver|\bwarp\b/i;

type GL = WebGLRenderingContext | WebGL2RenderingContext;

/** Unmasked WebGL renderer string, or null when the context reports none. */
export function webglRendererName(gl: GL): string | null {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const unmasked: unknown = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  const renderer: unknown =
    typeof unmasked === 'string' && unmasked.trim() ? unmasked : gl.getParameter(gl.RENDERER);
  return typeof renderer === 'string' && renderer.trim() ? renderer.trim() : null;
}

/** Why a renderer is not hardware-accelerated WebGL, or null when it is. */
export function softwareRendererReason(renderer: string | null): string | null {
  if (!renderer) return 'WebGL reports no renderer information';
  if (SOFTWARE_RENDERER.test(renderer)) return `WebGL is running on a software renderer (${renderer})`;
  return null;
}

// the renderer cannot change for a live context, so it is checked once per context
const rendererChecks = new WeakMap<GL, string | null>();

export function assertHardwareWebGL(gl: GL): void {
  let reason = rendererChecks.get(gl);
  if (reason === undefined) {
    reason = softwareRendererReason(webglRendererName(gl));
    rendererChecks.set(gl, reason);
  }
  if (reason) {
    throw new Error(`Capture refused: ${reason}. SplatBench measures hardware-accelerated WebGL only.`);
  }
}

/**
 * Why a capture holds nothing to measure, or null when it does: every pixel
 * fully transparent, or every pixel the same colour.
 */
export function blankCaptureReason(image: ImageData): string | null {
  const { data } = image;
  if (data.length < 4) return 'the capture is empty';

  const [r, g, b, a] = [data[0], data[1], data[2], data[3]];
  let visible = false;
  let varied = false;

  for (let i = 0; i < data.length; i += 4) {
    if (!visible && data[i + 3] !== 0) visible = true;
    if (!varied && (data[i] !== r || data[i + 1] !== g || data[i + 2] !== b || data[i + 3] !== a)) {
      varied = true;
    }
    if (visible && varied) return null;
  }

  if (!visible) return 'the capture is fully transparent';
  return 'the capture is blank (every pixel has the same colour)';
}

export function assertCaptureHasContent(image: ImageData): void {
  const reason = blankCaptureReason(image);
  if (reason) {
    throw new Error(`Capture refused: ${reason} at ${image.width}x${image.height}.`);
  }
}
