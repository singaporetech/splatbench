import type { BenchmarkMetrics } from '../../types';

export class MetricsCollector {
  private frameTimes: number[] = [];
  private maxFrames = 300;
  private loadTime: number = 0;
  private loadReadMs: number = 0;
  private loadInitMs: number = 0;
  private loadFirstFrameMs: number = 0;
  private fileSize: number = 0;
  private splatCount: number = 0;
  private resolution: [number, number] = [0, 0];

  endLoad(loadTime: number) {
    this.loadTime = loadTime;
  }

  setLoadPhases(fileReadMs: number, meshInitMs: number) {
    this.loadReadMs = fileReadMs;
    this.loadInitMs = meshInitMs;
  }

  setFirstFrameTime(firstFrameMs: number) {
    this.loadFirstFrameMs = firstFrameMs;
  }

  recordFrame(deltaTime: number) {
    this.frameTimes.push(deltaTime);
    if (this.frameTimes.length > this.maxFrames) {
      this.frameTimes.shift();
    }
  }

  setFileInfo(size: number, splatCount: number) {
    this.fileSize = size;
    this.splatCount = splatCount;
  }

  setResolution(width: number, height: number) {
    this.resolution = [width, height];
  }

  getFPS(): number {
    if (this.frameTimes.length === 0) return 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return avg > 0 ? 1000 / avg : 0;
  }

  getFrameTime(): number {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
  }

  getMemory(): number {
    // Chrome-only API
    if ('memory' in performance) {
      const memory = (performance as Performance & { memory: { usedJSHeapSize: number } }).memory;
      return memory.usedJSHeapSize / 1024 / 1024;
    }
    return 0;
  }

  getFrameTimeVariance(): number {
    if (this.frameTimes.length < 2) return 0;
    const mean = this.getFrameTime();
    const squareDiffs = this.frameTimes.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }

  getPercentile(percentile: number): number {
    if (this.frameTimes.length === 0) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // average FPS of the worst 1% of frames
  get1PercentLow(): number {
    if (this.frameTimes.length === 0) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => b - a);
    const count = Math.max(1, Math.ceil(sorted.length * 0.01));
    const worst = sorted.slice(0, count);
    const avgWorst = worst.reduce((a, b) => a + b, 0) / worst.length;
    return avgWorst > 0 ? 1000 / avgWorst : 0;
  }

  // average FPS of the worst 0.1% of frames
  get01PercentLow(): number {
    if (this.frameTimes.length === 0) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => b - a);
    const count = Math.max(1, Math.ceil(sorted.length * 0.001));
    const worst = sorted.slice(0, count);
    const avgWorst = worst.reduce((a, b) => a + b, 0) / worst.length;
    return avgWorst > 0 ? 1000 / avgWorst : 0;
  }

  getMetrics(): BenchmarkMetrics {
    return {
      fps: Math.round(this.getFPS() * 10) / 10,
      frameTime: Math.round(this.getFrameTime() * 100) / 100,
      memoryUsage: Math.round(this.getMemory() * 10) / 10,
      loadTime: Math.round(this.loadTime),
      loadReadMs: Math.round(this.loadReadMs),
      loadInitMs: Math.round(this.loadInitMs),
      loadFirstFrameMs: Math.round(this.loadFirstFrameMs),
      fileSize: Math.round((this.fileSize / 1024 / 1024) * 100) / 100,
      splatCount: this.splatCount,
      resolution: this.resolution,

      // performance stability metrics
      frameTimeVariance: Math.round(this.getFrameTimeVariance() * 100) / 100,
      fps1PercentLow: Math.round(this.get1PercentLow() * 10) / 10,
      fps01PercentLow: Math.round(this.get01PercentLow() * 10) / 10,
      frameTimeP50: Math.round(this.getPercentile(50) * 100) / 100,
      frameTimeP95: Math.round(this.getPercentile(95) * 100) / 100,
      frameTimeP99: Math.round(this.getPercentile(99) * 100) / 100,
    };
  }

  resetFrameStats() {
    this.frameTimes = [];
  }

  reset() {
    this.frameTimes = [];
    this.loadTime = 0;
    this.loadReadMs = 0;
    this.loadInitMs = 0;
    this.loadFirstFrameMs = 0;
    this.fileSize = 0;
    this.splatCount = 0;
    this.resolution = [0, 0];
  }
}
