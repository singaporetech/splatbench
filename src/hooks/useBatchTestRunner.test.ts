import { describe, expect, it } from 'vitest';
import { createPaperRunPlans, parsePaperPairName } from './useBatchTestRunner';

describe('useBatchTestRunner paper protocol helpers', () => {
  it('parses canonical paper pair names', () => {
    expect(parsePaperPairName('bonsai-ksplat')).toEqual({
      sceneName: 'bonsai',
      testFormat: 'ksplat',
    });
    expect(parsePaperPairName('truck-spz')).toEqual({
      sceneName: 'truck',
      testFormat: 'spz',
    });
  });

  it('rejects non-paper pair names', () => {
    expect(parsePaperPairName('bonsai')).toBeNull();
    expect(parsePaperPairName('bonsai-ply')).toBeNull();
    expect(parsePaperPairName('custom-scene-splat')).toBeNull();
  });

  it('creates 5 viewpoints x 3 replicates for paper pairs', () => {
    const plans = createPaperRunPlans('bonsai-splat');

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
