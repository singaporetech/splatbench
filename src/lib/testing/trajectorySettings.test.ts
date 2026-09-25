/**
 * The seed-list parser behind the batch panel's seeded sweep input.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SWEEP_SEED_INPUT,
  MAX_SWEEP_SEEDS,
  parseSeedList,
} from './trajectorySettings';

describe('parseSeedList', () => {
  it('parses the panel default', () => {
    expect(parseSeedList(DEFAULT_SWEEP_SEED_INPUT)).toEqual({
      ok: true,
      seeds: [42, 1337, 2026],
    });
  });

  it('accepts a single seed', () => {
    expect(parseSeedList('7')).toEqual({ ok: true, seeds: [7] });
  });

  it('accepts zero as a seed', () => {
    expect(parseSeedList('0')).toEqual({ ok: true, seeds: [0] });
  });

  it('tolerates surrounding and inner whitespace', () => {
    expect(parseSeedList('  1,2 ,  3  ')).toEqual({ ok: true, seeds: [1, 2, 3] });
  });

  it('preserves the order the seeds were typed in', () => {
    expect(parseSeedList('9,1,5')).toEqual({ ok: true, seeds: [9, 1, 5] });
  });

  it('accepts exactly the maximum number of seeds', () => {
    const input = Array.from({ length: MAX_SWEEP_SEEDS }, (_, i) => i + 1).join(',');
    const parsed = parseSeedList(input);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.seeds).toHaveLength(MAX_SWEEP_SEEDS);
  });

  it('rejects an empty input', () => {
    expect(parseSeedList('')).toEqual({ ok: false, error: 'Enter at least one seed.' });
    expect(parseSeedList('   ')).toEqual({ ok: false, error: 'Enter at least one seed.' });
  });

  it('rejects more than the maximum number of seeds', () => {
    const input = Array.from({ length: MAX_SWEEP_SEEDS + 1 }, (_, i) => i + 1).join(',');
    expect(parseSeedList(input)).toEqual({
      ok: false,
      error: `At most ${MAX_SWEEP_SEEDS} seeds (got ${MAX_SWEEP_SEEDS + 1}).`,
    });
  });

  it('rejects a trailing or doubled comma', () => {
    expect(parseSeedList('42,')).toEqual({
      ok: false,
      error: 'Empty seed entry: remove the extra comma.',
    });
    expect(parseSeedList('42,,7')).toEqual({
      ok: false,
      error: 'Empty seed entry: remove the extra comma.',
    });
  });

  it('rejects non-integers, naming the offending entry', () => {
    expect(parseSeedList('42, abc')).toEqual({
      ok: false,
      error: '"abc" is not a whole number.',
    });
    expect(parseSeedList('1.5')).toEqual({ ok: false, error: '"1.5" is not a whole number.' });
    expect(parseSeedList('1e3')).toEqual({ ok: false, error: '"1e3" is not a whole number.' });
    expect(parseSeedList('0x2a')).toEqual({ ok: false, error: '"0x2a" is not a whole number.' });
  });

  it('rejects negative seeds rather than wrapping them to unsigned', () => {
    expect(parseSeedList('-1')).toEqual({ ok: false, error: '"-1" is not a whole number.' });
  });

  it('rejects seeds above the 32-bit range mulberry32 consumes', () => {
    expect(parseSeedList('4294967295').ok).toBe(true);
    expect(parseSeedList('4294967296')).toEqual({
      ok: false,
      error: 'Seed 4294967296 is above the maximum 4294967295.',
    });
  });

  it('rejects duplicates, which would otherwise export as identical rows', () => {
    expect(parseSeedList('42, 1337, 42')).toEqual({ ok: false, error: 'Duplicate seed 42.' });
  });
});
