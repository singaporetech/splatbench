import type { ViewpointPreset } from '../camera/cameraPresets';
import type { ImageQualityMetrics } from '../../types';

export interface BatchTestConfig {
  // identification
  testName: string;
  description?: string;
  
  // test matrix
  scenes: BatchSceneConfig[];
  referenceFormat: string;
  testFormats: string[];
  viewpoints: ViewpointPreset[];
  
  // options
  replicates: number;
  delayBetweenCaptures: number;
  captureQualityMetrics: boolean;
  capturePerformanceMetrics: boolean;
  captureScreenshots: boolean;
}

export interface BatchSceneConfig {
  sceneName: string;
  referenceFile: string;
  testFiles: Record<string, string>;
}

export interface BatchResult {
  // identification
  testId: string;
  timestamp: string;
  
  // configuration
  sceneName: string;
  testFormat: string;
  viewpointName: string;
  replicateNumber: number;
  
  // quality metrics
  qualityMetrics?: ImageQualityMetrics;
  
  // performance metrics
  loadTimeMs?: number;
  fps?: number;
  fps1PercentLow?: number;
  memoryMB?: number;
  frameTimeVariance?: number;
  
  screenshotPath?: string;
  
  // metadata
  browserInfo: {
    name: string;
    version: string;
    gpu: string;
  };
}

export interface BatchProgress {
  totalTests: number;
  completedTests: number;
  currentTest?: {
    scene: string;
    format: string;
    viewpoint: string;
    replicate: number;
  };
  estimatedTimeRemaining: number;
}

export const BATCH_TEMPLATES = {
  /**
   * Fast validation of 1-2 scenes, usually 2-5 minutes
   */
  quickValidation: {
    name: 'Quick Check',
    description: 'Fast 2-scene validation (2 viewpoints, 1 replicate). ~2-5 min.',
    defaultScenes: ['bonsai', 'truck'],
    defaultFormats: ['splat', 'spz'],
    viewpointCount: 2,
    defaultReplicates: 1,
    defaultConfig: {
      testName: 'quick-validation',
      scenes: [],
      referenceFormat: 'ply',
      testFormats: ['splat', 'spz'],
      viewpoints: [],
      replicates: 1,
      delayBetweenCaptures: 200,
      captureQualityMetrics: true,
      capturePerformanceMetrics: true,
      captureScreenshots: false,
    }
  },

  /**
   * Format comparison across selected scenes, usually 10-20 minutes
   */
  formatComparison: {
    name: 'Format Comparison',
    description: 'Compare all formats across scenes (3 viewpoints, 2 replicates). ~10-20 min.',
    defaultScenes: ['bonsai', 'truck', 'garden'],
    defaultFormats: ['splat', 'ksplat', 'spz'],
    viewpointCount: 3,
    defaultReplicates: 2,
    defaultConfig: {
      testName: 'format-comparison',
      scenes: [],
      referenceFormat: 'ply',
      testFormats: ['splat', 'ksplat', 'spz'],
      viewpoints: [],
      replicates: 2,
      delayBetweenCaptures: 500,
      captureQualityMetrics: true,
      capturePerformanceMetrics: true,
      captureScreenshots: true,
    }
  },

  /**
   * Complete 6-scene benchmark, usually 1-2 hours
   */
  paperEvaluation: {
    name: 'Full Benchmark',
    description: 'Complete 6-scene benchmark (5 viewpoints, 3 replicates). ~1-2 hours.',
    defaultScenes: ['bonsai', 'garden', 'playroom', 'truck', 'train', 'flower'],
    defaultFormats: ['splat', 'ksplat', 'spz'],
    viewpointCount: 5,
    defaultReplicates: 3,
    defaultConfig: {
      testName: 'paper-evaluation',
      scenes: [],
      referenceFormat: 'ply',
      testFormats: ['splat', 'ksplat', 'spz'],
      viewpoints: [],
      replicates: 3,
      delayBetweenCaptures: 500,
      captureQualityMetrics: true,
      capturePerformanceMetrics: true,
      captureScreenshots: true,
    }
  },
  
  /**
   * FPS and memory profiling with additional replicates
   */
  performanceProfiling: {
    name: 'Performance Focus',
    description: 'FPS/memory profiling with 5 replicates (2 viewpoints). ~15-30 min.',
    defaultScenes: ['bonsai', 'truck', 'garden'],
    defaultFormats: ['splat', 'ksplat', 'spz'],
    viewpointCount: 2,
    defaultReplicates: 5,
    defaultConfig: {
      testName: 'performance-profile',
      scenes: [],
      referenceFormat: 'ply',
      testFormats: ['splat', 'ksplat', 'spz'],
      viewpoints: [],
      replicates: 5,
      delayBetweenCaptures: 1000,
      captureQualityMetrics: false,
      capturePerformanceMetrics: true,
      captureScreenshots: false,
    }
  },

  /**
   * Single-format evaluation across all scenes
   */
  singleFormat: {
    name: 'Single Format',
    description: 'Deep evaluation of one format across all scenes. ~20-40 min.',
    defaultScenes: ['bonsai', 'garden', 'playroom', 'truck', 'train', 'flower'],
    defaultFormats: ['spz'],
    viewpointCount: 5,
    defaultReplicates: 3,
    defaultConfig: {
      testName: 'single-format',
      scenes: [],
      referenceFormat: 'ply',
      testFormats: [],
      viewpoints: [],
      replicates: 3,
      delayBetweenCaptures: 500,
      captureQualityMetrics: true,
      capturePerformanceMetrics: true,
      captureScreenshots: true,
    }
  },
};

export function calculateTotalTests(config: BatchTestConfig): number {
  return config.scenes.length * 
         config.testFormats.length * 
         config.viewpoints.length * 
         config.replicates;
}

export function generateTestQueue(config: BatchTestConfig): Array<{
  scene: BatchSceneConfig;
  format: string;
  viewpoint: ViewpointPreset;
  replicate: number;
}> {
  const queue = [];
  
  for (const scene of config.scenes) {
    for (const format of config.testFormats) {
      for (const viewpoint of config.viewpoints) {
        for (let r = 1; r <= config.replicates; r++) {
          queue.push({
            scene,
            format,
            viewpoint,
            replicate: r,
          });
        }
      }
    }
  }
  
  return queue;
}

export function exportBatchToCSV(results: BatchResult[]): string {
  if (results.length === 0) return '';
  
  const columns = [
    'timestamp',
    'testId',
    'sceneName',
    'testFormat',
    'viewpointName',
    'replicateNumber',
    'psnr',
    'ssim',
    'loadTimeMs',
    'fps',
    'fps1PercentLow',
    'memoryMB',
    'frameTimeVariance',
    'browserName',
    'browserVersion',
    'gpu',
  ];
  
  let csv = columns.join(',') + '\n';
  
  for (const result of results) {
    const row = [
      result.timestamp,
      result.testId,
      result.sceneName,
      result.testFormat,
      result.viewpointName,
      result.replicateNumber,
      result.qualityMetrics?.psnr ?? '',
      result.qualityMetrics?.ssim ?? '',
      result.loadTimeMs ?? '',
      result.fps ?? '',
      result.fps1PercentLow ?? '',
      result.memoryMB ?? '',
      result.frameTimeVariance ?? '',
      result.browserInfo.name,
      result.browserInfo.version,
      result.browserInfo.gpu,
    ];
    csv += row.join(',') + '\n';
  }
  
  return csv;
}

export function generateBatchSummary(results: BatchResult[]) {
  const scenes = [...new Set(results.map(r => r.sceneName))];
  const formats = [...new Set(results.map(r => r.testFormat))];
  
  const summary: Record<string, Record<string, {
    avgPsnr: number;
    stdPsnr: number;
    avgSsim: number;
    stdSsim: number;
    avgFps: number;
    avgLoadTime: number;
    count: number;
  }>> = {};
  
  for (const scene of scenes) {
    summary[scene] = {};
    for (const format of formats) {
      const relevant = results.filter(
        r => r.sceneName === scene && r.testFormat === format
      );
      
      const psnrs = relevant.map(r => r.qualityMetrics?.psnr).filter((p): p is number => p !== undefined && p !== null);
      const ssims = relevant.map(r => r.qualityMetrics?.ssim).filter((s): s is number => s !== undefined && s !== null);
      const fpses = relevant.map(r => r.fps).filter((f): f is number => f !== undefined && f !== null);
      const loadTimes = relevant.map(r => r.loadTimeMs).filter((l): l is number => l !== undefined && l !== null);
      
      summary[scene][format] = {
        avgPsnr: psnrs.length > 0 ? psnrs.reduce((a, b) => a + b, 0) / psnrs.length : 0,
        stdPsnr: calculateStd(psnrs),
        avgSsim: ssims.length > 0 ? ssims.reduce((a, b) => a + b, 0) / ssims.length : 0,
        stdSsim: calculateStd(ssims),
        avgFps: fpses.length > 0 ? fpses.reduce((a, b) => a + b, 0) / fpses.length : 0,
        avgLoadTime: loadTimes.length > 0 ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0,
        count: relevant.length,
      };
    }
  }
  
  return summary;
}

function calculateStd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

export class BatchTestRunner {
  private config: BatchTestConfig;
  private queue: ReturnType<typeof generateTestQueue>;
  private results: BatchResult[] = [];
  private currentIndex = 0;
  private isRunning = false;
  private abortController = new AbortController();
  
  // callbacks
  onProgress?: (progress: BatchProgress) => void;
  onTestComplete?: (result: BatchResult) => void;
  onComplete?: (results: BatchResult[]) => void;
  onError?: (error: Error) => void;
  
  constructor(config: BatchTestConfig) {
    this.config = config;
    this.queue = generateTestQueue(config);
  }
  
  async start(): Promise<BatchResult[]> {
    if (this.isRunning) {
      throw new Error('Batch test already running');
    }
    
    this.isRunning = true;
    this.results = [];
    this.currentIndex = 0;
    this.abortController = new AbortController();
    
    const startTime = Date.now();
    
    for (let i = 0; i < this.queue.length; i++) {
      if (this.abortController.signal.aborted) {
        break;
      }
      
      this.currentIndex = i;
      const test = this.queue[i];
      
      const elapsed = (Date.now() - startTime) / 1000;
      const avgTimePerTest = elapsed / (i + 1);
      const remaining = (this.queue.length - i - 1) * avgTimePerTest;
      
      this.onProgress?.({
        totalTests: this.queue.length,
        completedTests: i,
        currentTest: {
          scene: test.scene.sceneName,
          format: test.format,
          viewpoint: test.viewpoint.name,
          replicate: test.replicate,
        },
        estimatedTimeRemaining: remaining,
      });
      
      try {
        const result = await this.executeTest(test);
        this.results.push(result);
        this.onTestComplete?.(result);
        
        if (i < this.queue.length - 1) {
          await this.delay(this.config.delayBetweenCaptures);
        }
      } catch (error) {
        this.onError?.(error as Error);
      }
    }
    
    this.isRunning = false;
    this.onComplete?.(this.results);
    return this.results;
  }
  
  stop(): void {
    this.abortController.abort();
    this.isRunning = false;
  }
  
  getProgress(): BatchProgress {
    return {
      totalTests: this.queue.length,
      completedTests: this.currentIndex,
      currentTest: this.currentIndex < this.queue.length 
        ? {
            scene: this.queue[this.currentIndex].scene.sceneName,
            format: this.queue[this.currentIndex].format,
            viewpoint: this.queue[this.currentIndex].viewpoint.name,
            replicate: this.queue[this.currentIndex].replicate,
          }
        : undefined,
      estimatedTimeRemaining: 0,
    };
  }
  
  /**
   * Temporary runner stub until viewer integration is wired in
   */
  private async executeTest(test: typeof this.queue[0]): Promise<BatchResult> {
    return {
      testId: `${test.scene.sceneName}_${test.format}_${test.viewpoint.id}_r${test.replicate}`,
      timestamp: new Date().toISOString(),
      sceneName: test.scene.sceneName,
      testFormat: test.format,
      viewpointName: test.viewpoint.name,
      replicateNumber: test.replicate,
      browserInfo: {
        name: navigator.userAgent,
        version: 'unknown',
        gpu: 'unknown',
      },
    };
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
