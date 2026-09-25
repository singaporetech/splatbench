import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SplatMesh } from '@sparkjsdev/spark';

export interface BenchmarkMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  loadTime: number;
  fileSize: number;
  splatCount: number;
  resolution: [number, number];

  // performance stability metrics
  frameTimeVariance: number;
  fps1PercentLow: number;
  fps01PercentLow: number;
  frameTimeP50: number;
  frameTimeP95: number;
  frameTimeP99: number;

  // load phases in ms, 0 when not measured: file read, mesh construction
  // until mesh.initialized, and load start to the first rendered frame
  loadReadMs?: number;
  loadInitMs?: number;
  loadFirstFrameMs?: number;
}

export interface LoadPhaseTimings {
  fileReadMs: number;
  meshInitMs: number;
  // performance.now() at load start, before the file bytes are read
  loadStart: number;
}

export interface GSFile {
  file: File;
  name: string;
  size: number;
  format: '.ply' | '.splat' | '.ksplat' | '.spz';
}

export interface ImageQualityMetrics {
  psnr: number | null;
  ssim: number | null;
  capturedAt: string | null;
  error: string | null;
}

export interface SparkViewerOptions {
  preserveDrawingBuffer?: boolean;
  controlsType?: 'orbit' | 'spark';
  initialCameraDistance?: number;
}

/**
 * Viewer context returned by SparkViewer
 */
export interface SparkViewerContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  splatMesh: SplatMesh | null;
  canvas: HTMLCanvasElement;
  forceRender: () => void;
}
