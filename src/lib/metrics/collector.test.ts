import { describe, expect, it } from 'vitest';
import { MetricsCollector } from './collector';

describe('MetricsCollector', () => {
  it('resetFrameStats clears rolling performance samples without dropping file metadata', () => {
    const collector = new MetricsCollector();

    collector.endLoad(123);
    collector.setFileInfo(1024 * 1024, 42);
    collector.setResolution(1920, 1080);
    collector.recordFrame(16);
    collector.recordFrame(18);
    collector.recordFrame(20);

    collector.resetFrameStats();

    const metrics = collector.getMetrics();
    expect(metrics.loadTime).toBe(123);
    expect(metrics.fileSize).toBe(1);
    expect(metrics.splatCount).toBe(42);
    expect(metrics.resolution).toEqual([1920, 1080]);
    expect(metrics.fps).toBe(0);
    expect(metrics.frameTime).toBe(0);
    expect(metrics.frameTimeVariance).toBe(0);
    expect(metrics.fps1PercentLow).toBe(0);
    expect(metrics.fps01PercentLow).toBe(0);
    expect(metrics.frameTimeP50).toBe(0);
    expect(metrics.frameTimeP95).toBe(0);
    expect(metrics.frameTimeP99).toBe(0);
  });
});
