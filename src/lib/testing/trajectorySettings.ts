// Trajectory settings the Single Pair panel can change between runs. The
// registered seeded test reads the seed at run time, so a change applies to
// the next run without re-registering the test.

export const DEFAULT_TRAJECTORY_SEED = 42;

let seed = DEFAULT_TRAJECTORY_SEED;

export function getSeed(): number {
  return seed;
}

/** Stores the seed as the 32-bit unsigned integer mulberry32 consumes. */
export function setSeed(value: number): void {
  seed = Number.isFinite(value) ? Math.trunc(value) >>> 0 : DEFAULT_TRAJECTORY_SEED;
}

export function resetSeed(): void {
  seed = DEFAULT_TRAJECTORY_SEED;
}

/** Default seed list for the batch seeded sweep. */
export const DEFAULT_SWEEP_SEED_INPUT = '42, 1337, 2026';

/** Each seed adds one run per pair, so the list is capped. */
export const MAX_SWEEP_SEEDS = 10;

// mulberry32 consumes a 32-bit unsigned integer
const MAX_SEED_VALUE = 0xffffffff;

export type SeedListParseResult =
  | { ok: true; seeds: number[] }
  | { ok: false; error: string };

/**
 * Parse a comma-separated seed list of 1 to MAX_SWEEP_SEEDS distinct
 * non-negative integers. Anything else is rejected with a message naming the
 * offending entry, never coerced, since each seed is exported in
 * trajectory_seed and has to identify the path that produced the row.
 */
export function parseSeedList(input: string): SeedListParseResult {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter at least one seed.' };
  }

  const tokens = trimmed.split(',').map((token) => token.trim());
  if (tokens.length > MAX_SWEEP_SEEDS) {
    return {
      ok: false,
      error: `At most ${MAX_SWEEP_SEEDS} seeds (got ${tokens.length}).`,
    };
  }

  const seeds: number[] = [];
  for (const token of tokens) {
    if (token === '') {
      return { ok: false, error: 'Empty seed entry: remove the extra comma.' };
    }
    if (!/^\d+$/u.test(token)) {
      return { ok: false, error: `"${token}" is not a whole number.` };
    }

    const value = Number(token);
    if (value > MAX_SEED_VALUE) {
      return { ok: false, error: `Seed ${token} is above the maximum ${MAX_SEED_VALUE}.` };
    }
    if (seeds.includes(value)) {
      return { ok: false, error: `Duplicate seed ${value}.` };
    }

    seeds.push(value);
  }

  return { ok: true, seeds };
}
