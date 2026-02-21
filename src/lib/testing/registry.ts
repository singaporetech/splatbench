/**
 * Test Registry
 *
 * Central registry for all benchmark tests. Tests register themselves
 * on import, and the UI discovers them via `getTests()`.
 *
 * Usage:
 *   import { registerTest, getTests, getTestsByCategory } from './registry';
 *   registerTest(myTest);
 *   const all = getTests();
 *   const trajectoryTests = getTestsByCategory('trajectory');
 */

import type { Test } from './types';

// ─── Internal Store ─────────────────────────────────────────────────────────

const registry = new Map<string, Test>();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Register a test. Throws if a test with the same ID already exists.
 */
export function registerTest(test: Test): void {
  if (registry.has(test.id)) {
    console.warn(
      `[TestRegistry] Duplicate test ID "${test.id}" -- overwriting.`,
    );
  }
  registry.set(test.id, test);
}

/**
 * Get all registered tests, sorted by category then name.
 */
export function getTests(): Test[] {
  return [...registry.values()].sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    return cat !== 0 ? cat : a.name.localeCompare(b.name);
  });
}

/**
 * Get tests belonging to a specific category.
 */
export function getTestsByCategory(category: string): Test[] {
  return getTests().filter((t) => t.category === category);
}

/**
 * Get a single test by ID.
 */
export function getTest(id: string): Test | undefined {
  return registry.get(id);
}

/**
 * Get unique category names, sorted alphabetically.
 */
export function getCategories(): string[] {
  const cats = new Set<string>();
  for (const t of registry.values()) {
    cats.add(t.category);
  }
  return [...cats].sort();
}

/**
 * Clear all tests (useful for testing).
 */
export function clearRegistry(): void {
  registry.clear();
}
