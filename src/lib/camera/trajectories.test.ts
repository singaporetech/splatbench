/**
 * Known-geometry checks for camera trajectory generation.
 */

import { describe, it, expect } from 'vitest';
import {
  generateOrbitTrajectory,
  generateDollyTrajectory,
  generatePanTrajectory,
  generateSeededTrajectory,
  generateCustomTrajectory,
  parseCustomTrajectoryJSON,
  serializeCustomTrajectory,
  TrajectoryRecorder,
  generateTrajectory,
  mulberry32,
  DEFAULT_ORBIT_CONFIG,
  DEFAULT_DOLLY_CONFIG,
  DEFAULT_PAN_CONFIG,
  DEFAULT_SEEDED_CONFIG,
  type CustomConfig,
  type CustomPoint,
} from './trajectories';
import { MetricsCollector } from '../metrics/collector';

// ─── Orbit Trajectory Tests ──────────────────────────────────────────────────

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

    // last frame t=1 means full 360, so position should equal frame 0
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

// ─── Dolly Trajectory Tests ──────────────────────────────────────────────────

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
      expect(currDist).toBeLessThanOrEqual(prevDist + 0.001);
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

// ─── Pan Trajectory Tests ────────────────────────────────────────────────────

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

    // pan goes from -halfSweep to +halfSweep with cosine smoothing
    // at t=0, smoothT=0 and lateral=-3
    // at t=1, smoothT=1 and lateral=+3
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

// ─── generateTrajectory Dispatcher Tests ─────────────────────────────────────

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

// ─── MetricsCollector Tests ──────────────────────────────────────────────────

describe('MetricsCollector', () => {
  it('tracks FPS correctly', () => {
    const collector = new MetricsCollector();
    // simulate 60fps at 16.67ms per frame
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
    // record 400 frames with maxFrames capped at 300
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
    // mean=20, variance=((10-20)^2 + (20-20)^2 + (30-20)^2) / 3 = 200/3
    // stdDev=sqrt(200/3) ~= 8.165
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

// ─── Seeded PRNG ─────────────────────────────────────────────────────────────

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(43);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays within [0, 1)', () => {
    const random = mulberry32(1337);
    for (let i = 0; i < 500; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

// ─── Seeded Trajectory Tests ─────────────────────────────────────────────────

describe('generateSeededTrajectory', () => {
  function plainKeyframes(config = DEFAULT_SEEDED_CONFIG) {
    return generateSeededTrajectory(config).keyframes.map((kf) => ({
      frameIndex: kf.frameIndex,
      t: kf.t,
      position: kf.position.toArray(),
      target: kf.target.toArray(),
    }));
  }

  it('is deterministic: the same seed yields deeply equal keyframes', () => {
    expect(plainKeyframes()).toEqual(plainKeyframes());
  });

  it('different seeds produce different paths', () => {
    const a = plainKeyframes({ ...DEFAULT_SEEDED_CONFIG, seed: 42 });
    const b = plainKeyframes({ ...DEFAULT_SEEDED_CONFIG, seed: 43 });
    expect(a).not.toEqual(b);
  });

  it('generates exactly frameCount keyframes', () => {
    const result = generateSeededTrajectory({ ...DEFAULT_SEEDED_CONFIG, frameCount: 37 });
    expect(result.keyframes).toHaveLength(37);
  });

  it('t-values span [0, 1] and increase monotonically', () => {
    const result = generateSeededTrajectory(DEFAULT_SEEDED_CONFIG);
    expect(result.keyframes[0].t).toBeCloseTo(0, 6);
    expect(result.keyframes[result.keyframes.length - 1].t).toBeCloseTo(1, 6);
    for (let i = 1; i < result.keyframes.length; i++) {
      expect(result.keyframes[i].t).toBeGreaterThan(result.keyframes[i - 1].t);
    }
  });

  it('every keyframe sits inside the configured distance band', () => {
    const config = DEFAULT_SEEDED_CONFIG;
    const lower = config.startDistance * config.minDistanceFactor * 0.99;
    const upper = config.startDistance * config.maxDistanceFactor * 1.01;

    for (const seed of [42, 1, 7, 1337, 90210]) {
      const result = generateSeededTrajectory({ ...config, seed });
      for (const kf of result.keyframes) {
        const distance = kf.position.distanceTo(kf.target);
        expect(distance).toBeGreaterThanOrEqual(lower);
        expect(distance).toBeLessThanOrEqual(upper);
      }
    }
  });

  it('clamps radii that the smoothing curve pushes outside the band', () => {
    // centripetal Catmull-Rom dips well inside the nearest waypoint between
    // knots (seed 1337 reaches about 0.39 unclamped against a 3.0 floor)
    const config = { ...DEFAULT_SEEDED_CONFIG, seed: 1337 };
    const result = generateSeededTrajectory(config);
    const minRadius = config.startDistance * config.minDistanceFactor;

    const distances = result.keyframes.map((kf) => kf.position.distanceTo(kf.target));
    expect(Math.min(...distances)).toBeCloseTo(minRadius, 6);
  });

  it('targets the scene center on every keyframe', () => {
    const center = { x: 1, y: 2, z: -3 };
    const result = generateSeededTrajectory({ ...DEFAULT_SEEDED_CONFIG, center });
    for (const kf of result.keyframes) {
      expect(kf.target.toArray()).toEqual([1, 2, -3]);
    }
  });

  it('describes itself with the seed', () => {
    const result = generateSeededTrajectory(DEFAULT_SEEDED_CONFIG);
    expect(result.description).toBe('Seeded random: seed 42, 6 waypoints, 60 frames');
  });

  it('rejects fewer than 2 waypoints', () => {
    expect(() =>
      generateSeededTrajectory({ ...DEFAULT_SEEDED_CONFIG, waypointCount: 1 }),
    ).toThrow(/at least 2 waypoints/u);
  });

  it('is reachable through generateTrajectory', () => {
    const result = generateTrajectory(DEFAULT_SEEDED_CONFIG);
    expect(result.keyframes).toHaveLength(DEFAULT_SEEDED_CONFIG.frameCount);
    expect(result.description).toContain('seed 42');
  });
});

// ─── Custom Trajectory Tests ─────────────────────────────────────────────────

function customConfig(points: CustomConfig['points']): CustomConfig {
  return {
    type: 'custom',
    name: 'fixture',
    points,
    frameCount: points.length,
    durationSeconds: 2,
    center: { x: 0, y: 0, z: 0 },
    startDistance: 1,
  };
}

describe('generateCustomTrajectory', () => {
  const points = [
    { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
    { position: { x: 4, y: 5, z: 6 }, target: { x: 1, y: 1, z: 1 } },
    { position: { x: 7, y: 8, z: 9 }, target: { x: 2, y: 2, z: 2 } },
  ];

  it('maps points verbatim into keyframes', () => {
    const result = generateCustomTrajectory(customConfig(points));

    expect(result.keyframes).toHaveLength(3);
    expect(result.keyframes[0].position.toArray()).toEqual([1, 2, 3]);
    expect(result.keyframes[0].target.toArray()).toEqual([0, 0, 0]);
    expect(result.keyframes[2].position.toArray()).toEqual([7, 8, 9]);
    expect(result.keyframes[2].target.toArray()).toEqual([2, 2, 2]);
  });

  it('spreads t linearly across the points', () => {
    const result = generateCustomTrajectory(customConfig(points));
    expect(result.keyframes.map((kf) => kf.t)).toEqual([0, 0.5, 1]);
  });

  it('numbers frames sequentially from zero', () => {
    const result = generateCustomTrajectory(customConfig(points));
    expect(result.keyframes.map((kf) => kf.frameIndex)).toEqual([0, 1, 2]);
  });

  it('rejects fewer than 2 points', () => {
    expect(() => generateCustomTrajectory(customConfig(points.slice(0, 1)))).toThrow(
      /at least 2 points/u,
    );
  });

  it('is reachable through generateTrajectory', () => {
    const result = generateTrajectory(customConfig(points));
    expect(result.keyframes).toHaveLength(3);
    expect(result.description).toContain('fixture');
  });
});

// ─── Custom Path Parsing Tests ───────────────────────────────────────────────

describe('parseCustomTrajectoryJSON', () => {
  const valid = JSON.stringify({
    name: 'my-path',
    frames: [
      { position: [1, 2, 3], target: [0, 0, 0] },
      { position: [4, 5, 6], target: [0, 1, 0] },
    ],
  });

  it('accepts a valid file', () => {
    const config = parseCustomTrajectoryJSON(valid);

    expect(config.type).toBe('custom');
    expect(config.name).toBe('my-path');
    expect(config.frameCount).toBe(2);
    expect(config.points[0].position).toEqual({ x: 1, y: 2, z: 3 });
    expect(config.points[1].target).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('defaults an omitted per-frame target to the origin', () => {
    const config = parseCustomTrajectoryJSON(
      JSON.stringify({
        name: 'no-targets',
        frames: [{ position: [1, 0, 0] }, { position: [0, 1, 0] }],
      }),
    );

    expect(config.points[0].target).toEqual({ x: 0, y: 0, z: 0 });
    expect(config.points[1].target).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('round-trips into a generated trajectory', () => {
    const result = generateCustomTrajectory(parseCustomTrajectoryJSON(valid));
    expect(result.keyframes.map((kf) => kf.position.toArray())).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('rejects non-JSON input', () => {
    expect(() => parseCustomTrajectoryJSON('not json at all')).toThrow('Not valid JSON');
  });

  it('rejects a top-level array', () => {
    expect(() => parseCustomTrajectoryJSON('[]')).toThrow(/must be a JSON object/u);
  });

  it('rejects a missing name', () => {
    expect(() =>
      parseCustomTrajectoryJSON(JSON.stringify({ frames: [{ position: [0, 0, 0] }] })),
    ).toThrow(/non-empty "name" string/u);
  });

  it('rejects an empty name', () => {
    expect(() =>
      parseCustomTrajectoryJSON(JSON.stringify({ name: '   ', frames: [] })),
    ).toThrow(/non-empty "name" string/u);
  });

  it('rejects a missing frames array', () => {
    expect(() => parseCustomTrajectoryJSON(JSON.stringify({ name: 'x' }))).toThrow(
      /needs a "frames" array/u,
    );
  });

  it('rejects a single frame', () => {
    expect(() =>
      parseCustomTrajectoryJSON(
        JSON.stringify({ name: 'x', frames: [{ position: [0, 0, 0] }] }),
      ),
    ).toThrow(/between 2 and 600 frames, got 1/u);
  });

  it('rejects 601 frames', () => {
    const frames = Array.from({ length: 601 }, () => ({ position: [0, 0, 1] }));
    expect(() => parseCustomTrajectoryJSON(JSON.stringify({ name: 'x', frames }))).toThrow(
      /between 2 and 600 frames, got 601/u,
    );
  });

  it('accepts exactly 600 frames', () => {
    const frames = Array.from({ length: 600 }, () => ({ position: [0, 0, 1] }));
    const config = parseCustomTrajectoryJSON(JSON.stringify({ name: 'x', frames }));
    expect(config.points).toHaveLength(600);
  });

  it('names the offending frame index for a non-finite number', () => {
    expect(() =>
      parseCustomTrajectoryJSON(
        JSON.stringify({
          name: 'x',
          frames: [{ position: [0, 0, 0] }, { position: [0, 0, null] }],
        }),
      ),
    ).toThrow('Frame 1: "position" contains a non-finite number');
  });

  it('names the offending frame index for a malformed position', () => {
    expect(() =>
      parseCustomTrajectoryJSON(
        JSON.stringify({
          name: 'x',
          frames: [{ position: [0, 0, 0] }, { position: [1, 2] }],
        }),
      ),
    ).toThrow('Frame 1: "position" must have exactly 3 numbers, got 2');
  });

  it('names the offending frame index for a non-array position', () => {
    expect(() =>
      parseCustomTrajectoryJSON(
        JSON.stringify({
          name: 'x',
          frames: [{ position: [0, 0, 0] }, { position: 'nope' }],
        }),
      ),
    ).toThrow('Frame 1: "position" must be an array of 3 numbers');
  });

  it('names the offending frame index for a missing position', () => {
    expect(() =>
      parseCustomTrajectoryJSON(
        JSON.stringify({ name: 'x', frames: [{ position: [0, 0, 0] }, { target: [0, 0, 0] }] }),
      ),
    ).toThrow('Frame 1: missing "position"');
  });

  it('names the offending frame index for a malformed target', () => {
    expect(() =>
      parseCustomTrajectoryJSON(
        JSON.stringify({
          name: 'x',
          frames: [{ position: [0, 0, 0] }, { position: [1, 1, 1], target: [0, 0] }],
        }),
      ),
    ).toThrow('Frame 1: "target" must have exactly 3 numbers, got 2');
  });
});

// ─── Path Recording Tests ────────────────────────────────────────────────────

describe('serializeCustomTrajectory', () => {
  const points: CustomPoint[] = [
    { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
    { position: { x: 4, y: 5, z: 6 }, target: { x: 0, y: 1, z: 0 } },
  ];

  it('emits a file the parser accepts, point for point', () => {
    const config = parseCustomTrajectoryJSON(serializeCustomTrajectory('saved', points));

    expect(config.name).toBe('saved');
    expect(config.points).toEqual(points);
  });

  it('keeps 6 decimals of precision', () => {
    const config = parseCustomTrajectoryJSON(
      serializeCustomTrajectory('rounded', [
        { position: { x: 1 / 3, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
        { position: { x: 2 / 3, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      ]),
    );

    expect(config.points[0].position.x).toBeCloseTo(1 / 3, 6);
    expect(config.points[1].position.x).toBeCloseTo(2 / 3, 6);
  });

  it('writes vectors as arrays, with an explicit target on every frame', () => {
    const written = JSON.parse(serializeCustomTrajectory('saved', points));
    expect(written.frames[0]).toEqual({ position: [1, 2, 3], target: [0, 0, 0] });
  });
});

describe('TrajectoryRecorder', () => {
  const origin = { x: 0, y: 0, z: 0 };

  it('records the first call and then every sampleEvery-th one', () => {
    const recorder = new TrajectoryRecorder({ sampleEvery: 4 });
    for (let i = 0; i < 12; i++) {
      recorder.sample({ x: i, y: 0, z: 0 }, origin);
    }

    expect(recorder.frameCount).toBe(3);
    expect(recorder.points.map((point) => point.position.x)).toEqual([0, 4, 8]);
  });

  it('records every call at sampleEvery 1', () => {
    const recorder = new TrajectoryRecorder({ sampleEvery: 1 });
    for (let i = 0; i < 5; i++) {
      recorder.sample({ x: i, y: 0, z: 0 }, origin);
    }

    expect(recorder.frameCount).toBe(5);
  });

  it('drops a sample identical to the last recorded one', () => {
    const recorder = new TrajectoryRecorder({ sampleEvery: 1 });
    recorder.sample({ x: 1, y: 1, z: 1 }, origin);
    recorder.sample({ x: 1, y: 1, z: 1 }, origin);
    recorder.sample({ x: 1, y: 1, z: 1 }, origin);

    expect(recorder.frameCount).toBe(1);
  });

  it('treats a moved target as a new pose', () => {
    const recorder = new TrajectoryRecorder({ sampleEvery: 1 });
    recorder.sample({ x: 1, y: 1, z: 1 }, origin);
    recorder.sample({ x: 1, y: 1, z: 1 }, { x: 0, y: 2, z: 0 });

    expect(recorder.frameCount).toBe(2);
  });

  it('stops accepting at maxFrames and reports itself full', () => {
    const recorder = new TrajectoryRecorder({ sampleEvery: 1, maxFrames: 3 });
    for (let i = 0; i < 20; i++) {
      recorder.sample({ x: i, y: 0, z: 0 }, origin);
    }

    expect(recorder.full).toBe(true);
    expect(recorder.frameCount).toBe(3);
    expect(recorder.points.map((point) => point.position.x)).toEqual([0, 1, 2]);
  });

  it('is not full before the cap is reached', () => {
    const recorder = new TrajectoryRecorder({ sampleEvery: 1, maxFrames: 3 });
    recorder.sample({ x: 0, y: 0, z: 0 }, origin);

    expect(recorder.full).toBe(false);
  });

  it('caps at 600 frames by default', () => {
    const recorder = new TrajectoryRecorder({ sampleEvery: 1 });
    for (let i = 0; i < 700; i++) {
      recorder.sample({ x: i, y: 0, z: 0 }, origin);
    }

    expect(recorder.frameCount).toBe(600);
  });

  it('hands out copies, not live references', () => {
    const recorder = new TrajectoryRecorder({ sampleEvery: 1 });
    recorder.sample({ x: 1, y: 2, z: 3 }, origin);

    const first = recorder.points;
    first[0].position.x = 99;

    expect(recorder.points[0].position.x).toBe(1);
  });

  it('round-trips a recorded path through the parser', () => {
    const recorder = new TrajectoryRecorder({ sampleEvery: 4 });
    // a camera arcing around the origin, sampled the way a render loop would
    for (let frame = 0; frame < 120; frame++) {
      const angle = (frame / 120) * Math.PI;
      recorder.sample({ x: 5 * Math.sin(angle), y: 1, z: 5 * Math.cos(angle) }, origin);
    }

    const recorded = recorder.points;
    const config = parseCustomTrajectoryJSON(
      serializeCustomTrajectory('recorded-path', recorded),
    );

    expect(config.name).toBe('recorded-path');
    expect(config.points).toHaveLength(recorded.length);
    config.points.forEach((point, i) => {
      expect(point.position.x).toBeCloseTo(recorded[i].position.x, 6);
      expect(point.position.y).toBeCloseTo(recorded[i].position.y, 6);
      expect(point.position.z).toBeCloseTo(recorded[i].position.z, 6);
      expect(point.target).toEqual(recorded[i].target);
    });

    expect(generateCustomTrajectory(config).keyframes).toHaveLength(recorded.length);
  });
});
