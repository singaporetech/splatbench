// injected by the define block in vite.config.ts; the typeof guards keep this
// module importable where the defines are absent, such as a plain tsc run
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';

// for example "spark@0.1.10;three@0.182.0"
export const RENDERER_LIB_VERSIONS: string =
  typeof __RENDERER_LIB_VERSIONS__ !== 'undefined' ? __RENDERER_LIB_VERSIONS__ : 'unknown';

/**
 * Benchmark CSV schema version, bumped whenever columns are added. Columns are
 * only ever appended, so each version is the previous one plus trailing columns.
 *
 * 1.0: the original 41 columns (never written to the file)
 * 2.0: provenance, temporal stability, per-frame minima, and load phases
 * 2.1: 11x11 Gaussian-windowed SSIM (ssim_windowed, ssim_windowed_min)
 * 2.2: trajectory provenance (trajectory_source, trajectory_seed)
 */
export const EXPORT_SCHEMA_VERSION = '2.2';
