import { describe, expect, it } from 'vitest';
import { createBenchmarkRunPlans, parseBenchmarkPairName } from './useBatchTestRunner';

describe('useBatchTestRunner benchmark protocol helpers', () => {
  it('parses canonical benchmark pair names', () => {
    expect(parseBenchmarkPairName('bonsai-ksplat')).toEqual({
      sceneName: 'bonsai',
      testFormat: 'ksplat',
    });
    expect(parseBenchmarkPairName('truck-spz')).toEqual({
      sceneName: 'truck',
      testFormat: 'spz',
    });
  });

  it('rejects non-benchmark pair names', () => {
    expect(parseBenchmarkPairName('bonsai')).toBeNull();
    expect(parseBenchmarkPairName('bonsai-ply')).toBeNull();
    expect(parseBenchmarkPairName('custom-scene-splat')).toBeNull();
  });

  it('creates 5 viewpoints x 3 replicates for benchmark pairs', () => {
    const plans = createBenchmarkRunPlans('bonsai-splat');

    expect(plans).not.toBeNull();
    expect(plans).toHaveLength(15);
    expect(plans?.slice(0, 3).map((plan) => `${plan.viewpointId}-r${plan.replicate}`)).toEqual([
      'front-r1',
      'front-r2',
      'front-r3',
    ]);
    expect(plans?.slice(-3).map((plan) => `${plan.viewpointId}-r${plan.replicate}`)).toEqual([
      'right45-r1',
      'right45-r2',
      'right45-r3',
    ]);
  });
});
