/**
 * Tests for camera trajectory generation.
 *
 * Verifies that trajectory generators produce correct keyframe sequences
 * with proper geometry, frame counts, and t-values.
 */

import { describe, it, expect } from 'vitest';
import {
  generateOrbitTrajectory,
  generateDollyTrajectory,
  generatePanTrajectory,
  generateTrajectory,
  DEFAULT_ORBIT_CONFIG,
  DEFAULT_DOLLY_CONFIG,
  DEFAULT_PAN_CONFIG,
} from './trajectories';
import { MetricsCollector } from '../metrics/collector';

// ─── Orbit Trajectory Tests ─────────────────────────────────────────────────

describe('generateOrbitTrajectory', () => {
  it('generates correct number of keyframes', () => {
    const config = { ...DEFAULT_ORBIT_CONFIG, frameCount: 30 };
    const result = generateOrbitTrajectory(config);
    expect(result.keyframes).toHaveLength(30);
  });

  it('t-values span [0, 1]', () => {
    const config = { ...DEFAULT_ORBIT_CONFIG, frameCount: 10 };
    const result = generateOrbitTrajectory(config);

    expect(result.keyframes[0].t).toBeCloseTo(0, 6);
    expect(result.keyframes[result.keyframes.length - 1].t).toBeCloseTo(1, 6);
  });

  it('t-values are monotonically increasing', () => {
    const result = generateOrbitTrajectory(DEFAULT_ORBIT_CONFIG);
    for (let i = 1; i < result.keyframes.length; i++) {
      expect(result.keyframes[i].t).toBeGreaterThan(result.keyframes[i - 1].t);
    }
  });

  it('all frames maintain constant distance from center', () => {
    const config = { ...DEFAULT_ORBIT_CONFIG, startDistance: 5 };
    const result = generateOrbitTrajectory(config);

    for (const kf of result.keyframes) {
      const dist = kf.position.distanceTo(kf.target);
      expect(dist).toBeCloseTo(5, 4);
    }
  });

  it('360-degree orbit returns to start position', () => {
    const config = { ...DEFAULT_ORBIT_CONFIG, arcDegrees: 360, frameCount: 100 };
    const result = generateOrbitTrajectory(config);

    // Note: last frame t=1 means full 360, position should equal frame 0
    const first = result.keyframes[0].position;
    const last = result.keyframes[result.keyframes.length - 1].position;
    expect(first.distanceTo(last)).toBeLessThan(0.001);
  });

  it('90-degree orbit does not return to start', () => {
    const config = { ...DEFAULT_ORBIT_CONFIG, arcDegrees: 90, frameCount: 20 };
    const result = generateOrbitTrajectory(config);

    const first = result.keyframes[0].position;
    const last = result.keyframes[result.keyframes.length - 1].position;
    expect(first.distanceTo(last)).toBeGreaterThan(0.1);
  });

  it('all targets point to center', () => {
    const config = { ...DEFAULT_ORBIT_CONFIG, center: { x: 1, y: 2, z: 3 } };
    const result = generateOrbitTrajectory(config);

    for (const kf of result.keyframes) {
      expect(kf.target.x).toBeCloseTo(1, 6);
      expect(kf.target.y).toBeCloseTo(2, 6);
      expect(kf.target.z).toBeCloseTo(3, 6);
    }
  });

  it('elevation changes Y coordinate', () => {
    const flat = generateOrbitTrajectory({ ...DEFAULT_ORBIT_CONFIG, elevationDegrees: 0 });
    const elevated = generateOrbitTrajectory({ ...DEFAULT_ORBIT_CONFIG, elevationDegrees: 45 });

    const flatY = flat.keyframes[0].position.y;
    const elevY = elevated.keyframes[0].position.y;
    expect(elevY).toBeGreaterThan(flatY);
  });

  it('frame indices are sequential', () => {
    const result = generateOrbitTrajectory(DEFAULT_ORBIT_CONFIG);
    for (let i = 0; i < result.keyframes.length; i++) {
      expect(result.keyframes[i].frameIndex).toBe(i);
    }
  });

  it('handles single frame', () => {
    const config = { ...DEFAULT_ORBIT_CONFIG, frameCount: 1 };
    const result = generateOrbitTrajectory(config);
    expect(result.keyframes).toHaveLength(1);
    expect(result.keyframes[0].t).toBe(0);
  });
});

// ─── Dolly Trajectory Tests ─────────────────────────────────────────────────

describe('generateDollyTrajectory', () => {
  it('generates correct number of keyframes', () => {
    const config = { ...DEFAULT_DOLLY_CONFIG, frameCount: 20 };
    const result = generateDollyTrajectory(config);
    expect(result.keyframes).toHaveLength(20);
  });

  it('camera starts at startDistance and ends near endDistance', () => {
    const config = { ...DEFAULT_DOLLY_CONFIG, startDistance: 10, endDistance: 2, frameCount: 50 };
    const result = generateDollyTrajectory(config);

    const firstDist = result.keyframes[0].position.distanceTo(result.keyframes[0].target);
    const lastDist = result.keyframes[result.keyframes.length - 1].position.distanceTo(
      result.keyframes[result.keyframes.length - 1].target,
    );

    expect(firstDist).toBeCloseTo(10, 1);
    expect(lastDist).toBeCloseTo(2, 1);
  });

  it('distance monotonically changes', () => {
    const config = { ...DEFAULT_DOLLY_CONFIG, startDistance: 8, endDistance: 2 };
    const result = generateDollyTrajectory(config);

    for (let i = 1; i < result.keyframes.length; i++) {
      const prevDist = result.keyframes[i - 1].position.distanceTo(result.keyframes[i - 1].target);
      const currDist = result.keyframes[i].position.distanceTo(result.keyframes[i].target);
      expect(currDist).toBeLessThanOrEqual(prevDist + 0.001); // Approaching
    }
  });

  it('all targets point to center', () => {
    const config = { ...DEFAULT_DOLLY_CONFIG, center: { x: 2, y: 3, z: 4 } };
    const result = generateDollyTrajectory(config);

    for (const kf of result.keyframes) {
      expect(kf.target.x).toBeCloseTo(2, 6);
      expect(kf.target.y).toBeCloseTo(3, 6);
      expect(kf.target.z).toBeCloseTo(4, 6);
    }
  });

  it('handles single frame', () => {
    const config = { ...DEFAULT_DOLLY_CONFIG, frameCount: 1 };
    const result = generateDollyTrajectory(config);
    expect(result.keyframes).toHaveLength(1);
  });
});

// ─── Pan Trajectory Tests ───────────────────────────────────────────────────

describe('generatePanTrajectory', () => {
  it('generates correct number of keyframes', () => {
    const config = { ...DEFAULT_PAN_CONFIG, frameCount: 25 };
    const result = generatePanTrajectory(config);
    expect(result.keyframes).toHaveLength(25);
  });

  it('starts at left edge and ends at right edge', () => {
    const config = { ...DEFAULT_PAN_CONFIG, sweepDistance: 6, frameCount: 40 };
    const result = generatePanTrajectory(config);

    const firstX = result.keyframes[0].position.x;
    const lastX = result.keyframes[result.keyframes.length - 1].position.x;

    // Pan goes from -halfSweep to +halfSweep with cosine smoothing
    // At t=0: smoothT=0, lateral = -3 (left edge)
    // At t=1: smoothT=1, lateral = +3 (right edge)
    expect(firstX).toBeCloseTo(-3 + config.center.x, 1);
    expect(lastX).toBeCloseTo(3 + config.center.x, 1);
  });

  it('maintains constant depth', () => {
    const config = { ...DEFAULT_PAN_CONFIG, startDistance: 7 };
    const result = generatePanTrajectory(config);

    for (const kf of result.keyframes) {
      expect(kf.position.z).toBeCloseTo(config.center.z + 7, 4);
    }
  });

  it('respects height offset', () => {
    const config = { ...DEFAULT_PAN_CONFIG, heightOffset: 3 };
    const result = generatePanTrajectory(config);

    for (const kf of result.keyframes) {
      expect(kf.position.y).toBeCloseTo(config.center.y + 3, 4);
    }
  });

  it('handles single frame', () => {
    const config = { ...DEFAULT_PAN_CONFIG, frameCount: 1 };
    const result = generatePanTrajectory(config);
    expect(result.keyframes).toHaveLength(1);
  });
});

// ─── generateTrajectory Dispatcher Tests ────────────────────────────────────

describe('generateTrajectory', () => {
  it('dispatches orbit config correctly', () => {
    const result = generateTrajectory(DEFAULT_ORBIT_CONFIG);
    expect(result.config.type).toBe('orbit');
    expect(result.description).toContain('Orbit');
  });

  it('dispatches dolly config correctly', () => {
    const result = generateTrajectory(DEFAULT_DOLLY_CONFIG);
    expect(result.config.type).toBe('dolly');
    expect(result.description).toContain('Dolly');
  });

  it('dispatches pan config correctly', () => {
    const result = generateTrajectory(DEFAULT_PAN_CONFIG);
    expect(result.config.type).toBe('pan');
    expect(result.description).toContain('Pan');
  });

  it('produces deterministic results', () => {
    const r1 = generateTrajectory(DEFAULT_ORBIT_CONFIG);
    const r2 = generateTrajectory(DEFAULT_ORBIT_CONFIG);

    expect(r1.keyframes.length).toBe(r2.keyframes.length);
    for (let i = 0; i < r1.keyframes.length; i++) {
      expect(r1.keyframes[i].position.x).toBe(r2.keyframes[i].position.x);
      expect(r1.keyframes[i].position.y).toBe(r2.keyframes[i].position.y);
      expect(r1.keyframes[i].position.z).toBe(r2.keyframes[i].position.z);
      expect(r1.keyframes[i].t).toBe(r2.keyframes[i].t);
    }
  });
});

// ─── MetricsCollector Tests ─────────────────────────────────────────────────

describe('MetricsCollector', () => {
  it('tracks FPS correctly', () => {
    const collector = new MetricsCollector();
    // Simulate 60fps (16.67ms per frame)
    for (let i = 0; i < 60; i++) {
      collector.recordFrame(16.67);
    }
    const fps = collector.getFPS();
    expect(fps).toBeCloseTo(60, 0);
  });

  it('computes frame time average', () => {
    const collector = new MetricsCollector();
    collector.recordFrame(10);
    collector.recordFrame(20);
    collector.recordFrame(30);
    expect(collector.getFrameTime()).toBeCloseTo(20, 4);
  });

  it('respects maxFrames sliding window', () => {
    const collector = new MetricsCollector();
    // Record 400 frames (maxFrames is 300)
    for (let i = 0; i < 400; i++) {
      collector.recordFrame(16.67);
    }
    const metrics = collector.getMetrics();
    expect(metrics.fps).toBeGreaterThan(0);
  });

  it('resets all state', () => {
    const collector = new MetricsCollector();
    collector.recordFrame(16.67);
    collector.setFileInfo(1024 * 1024, 10000);
    collector.setResolution(1920, 1080);
    collector.endLoad(500);

    collector.reset();

    const metrics = collector.getMetrics();
    expect(metrics.fps).toBe(0);
    expect(metrics.fileSize).toBe(0);
    expect(metrics.splatCount).toBe(0);
    expect(metrics.loadTime).toBe(0);
  });

  it('computes frame time variance', () => {
    const collector = new MetricsCollector();
    collector.recordFrame(10);
    collector.recordFrame(20);
    collector.recordFrame(30);
    // Mean=20, variance = ((10-20)^2 + (20-20)^2 + (30-20)^2) / 3 = 200/3
    // StdDev = sqrt(200/3) ~= 8.165
    expect(collector.getFrameTimeVariance()).toBeCloseTo(8.165, 1);
  });

  it('computes percentiles correctly', () => {
    const collector = new MetricsCollector();
    for (let i = 1; i <= 100; i++) {
      collector.recordFrame(i);
    }
    // P50 should be around 50
    expect(collector.getPercentile(50)).toBeCloseTo(50, 0);
    // P99 should be around 99
    expect(collector.getPercentile(99)).toBeCloseTo(99, 0);
  });

  it('handles empty state gracefully', () => {
    const collector = new MetricsCollector();
    expect(collector.getFPS()).toBe(0);
    expect(collector.getFrameTime()).toBe(0);
    expect(collector.getFrameTimeVariance()).toBe(0);
    expect(collector.getPercentile(50)).toBe(0);
    expect(collector.get1PercentLow()).toBe(0);
    expect(collector.get01PercentLow()).toBe(0);
  });
});
