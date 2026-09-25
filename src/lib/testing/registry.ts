import type { Test } from './types';

// ─── Internal Store ──────────────────────────────────────────────────────────

const registry = new Map<string, Test>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Registers a test and overwrites duplicate IDs
 */
export function registerTest(test: Test): void {
  if (registry.has(test.id)) {
    console.warn(
      `[TestRegistry] Duplicate test ID "${test.id}" -- overwriting.`,
    );
  }
  registry.set(test.id, test);
}

export function getTests(): Test[] {
  return [...registry.values()].sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    return cat !== 0 ? cat : a.name.localeCompare(b.name);
  });
}

/**
 * Tests kept out of the batch matrix. The seeded trajectory depends on a seed
 * the panel can change between runs, so batch output would stop being
 * comparable across pairs; batch mode reaches it only through the opt-in
 * seeded sweep.
 */
export const SINGLE_SCENE_ONLY_TEST_IDS: readonly string[] = ['trajectory-seeded'];

/** The tests a batch runs for every viewpoint and replicate. */
export function getBatchTests(): Test[] {
  return getTests().filter((t) => !SINGLE_SCENE_ONLY_TEST_IDS.includes(t.id));
}

export function getTestsByCategory(category: string): Test[] {
  return getTests().filter((t) => t.category === category);
}

export function getTest(id: string): Test | undefined {
  return registry.get(id);
}

export function getCategories(): string[] {
  const cats = new Set<string>();
  for (const t of registry.values()) {
    cats.add(t.category);
  }
  return [...cats].sort();
}

export function clearRegistry(): void {
  registry.clear();
}
