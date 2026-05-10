/**
 * Source-structure checks for TestPanel behavior that needs a DOM renderer.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readComponent(relativePath: string): string {
  const fullPath = resolve(TEST_DIR, '../../components/Testing', relativePath);
  return readFileSync(fullPath, 'utf-8');
}

function readUIComponent(relativePath: string): string {
  const fullPath = resolve(TEST_DIR, '../../components/UI', relativePath);
  return readFileSync(fullPath, 'utf-8');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TestPanel UI Structure', () => {
  const testPanelSource = readComponent('TestPanel.tsx');

  // ─── 1. Flat Numbered Test List ────────────────────────────────────────────

  describe('flat numbered test list', () => {
    it('does NOT render category section headers', () => {
      // old category headers should not appear in the flat list
      expect(testPanelSource).not.toContain('Quality Tests');
      expect(testPanelSource).not.toContain('Trajectory Tests');
    });

    it('does NOT group tests by category in the render', () => {
      // component should not group tests by category
      expect(testPanelSource).not.toContain('getTestsByCategory');
      expect(testPanelSource).not.toContain('getCategories');
    });

    it('renders tests with sequential index numbers', () => {
      // flat list uses {index + 1} for numbering each test
      expect(testPanelSource).toContain('index + 1');
    });

    it('iterates tests with a single map (flat iteration)', () => {
      // test list should use runner.tests.map() directly
      expect(testPanelSource).toContain('runner.tests.map');
    });
  });

  // ─── 2. Descriptions in Tooltips (Not Visible Text) ────────────────────────

  describe('descriptions in tooltips', () => {
    it('renders descriptions via InfoTooltip component', () => {
      // each test description should be passed to InfoTooltip
      expect(testPanelSource).toContain('InfoTooltip');
      expect(testPanelSource).toContain('test.description');
    });

    it('does NOT render description as a separate paragraph below the test name', () => {
      // description should only appear inside InfoTooltip text prop
      const lines = testPanelSource.split('\n');
      const descriptionUsages = lines.filter(
        (line) => line.includes('test.description') && !line.includes('InfoTooltip'),
      );
      expect(descriptionUsages).toHaveLength(0);
    });
  });

  // ─── 3. Sticky Progress Bar ────────────────────────────────────────────────

  describe('sticky progress bar', () => {
    it('has a sticky-positioned progress container', () => {
      expect(testPanelSource).toContain("position: 'sticky'");
    });

    it('sticky element is positioned at the top', () => {
      expect(testPanelSource).toContain("top: 0");
    });

    it('has a z-index to stay above other content', () => {
      // sticky progress bar should have a z-index
      expect(testPanelSource).toContain('zIndex');
    });

    it('progress bar appears before the test list', () => {
      // sticky progress container should come before the test list
      const stickyIndex = testPanelSource.indexOf("position: 'sticky'");
      const testListIndex = testPanelSource.indexOf('runner.tests.map');
      expect(stickyIndex).toBeLessThan(testListIndex);
    });
  });

  // ─── 4. Viewport-Aware Tooltip Positioning ─────────────────────────────────

  describe('viewport-aware tooltip positioning', () => {
    // shared InfoTooltip handles viewport-aware positioning
    const infoTooltipSource = readUIComponent('InfoTooltip.tsx');

    it('InfoTooltip uses a ref for position detection', () => {
      expect(infoTooltipSource).toContain('triggerRef');
      expect(infoTooltipSource).toContain('useRef');
    });

    it('computes viewport position using getBoundingClientRect', () => {
      expect(infoTooltipSource).toContain('getBoundingClientRect');
    });

    it('compares element position against viewport width', () => {
      expect(infoTooltipSource).toContain('window.innerWidth');
    });

    it('measures the tooltip box before clamping to the viewport', () => {
      expect(infoTooltipSource).toContain('tooltipRef');
      expect(infoTooltipSource).toContain('offsetWidth');
      expect(infoTooltipSource).toContain('offsetHeight');
    });

    it('clamps tooltip position within the viewport edges', () => {
      expect(infoTooltipSource).toContain('Math.min(Math.max(centeredLeft');
      expect(infoTooltipSource).toContain('position: \'fixed\'');
      expect(infoTooltipSource).toContain('maxWidth: `calc(100vw -');
    });

    it('repositions on resize and scroll while open', () => {
      expect(infoTooltipSource).toContain("window.addEventListener('resize', updatePosition)");
      expect(infoTooltipSource).toContain("window.addEventListener('scroll', updatePosition, true)");
    });

    it('uses pointerType to distinguish mouse from touch', () => {
      expect(infoTooltipSource).toContain('pointerType');
      expect(infoTooltipSource).toContain("'mouse'");
    });

    it('TestPanel imports InfoTooltip from shared component', () => {
      expect(testPanelSource).toContain("from '../UI/InfoTooltip'");
    });
  });
});

// ─── BatchTestPanel structure checks ─────────────────────────────────────────

describe('BatchTestPanel UI Structure', () => {
  const batchPanelSource = readComponent('BatchTestPanel.tsx');

  it('has a sticky progress bar for batch progress', () => {
    expect(batchPanelSource).toContain("position: 'sticky'");
    expect(batchPanelSource).toContain("top: 0");
  });

  it('also uses viewport-aware InfoTooltip', () => {
    expect(batchPanelSource).toContain('InfoTooltip');
    expect(batchPanelSource).toContain("from '../UI/InfoTooltip'");
  });

  it('forces progress bar fill to match displayed 100 percent', () => {
    expect(batchPanelSource).toContain('Math.floor(testRawPercent)');
    expect(batchPanelSource).toContain('testBarWidth = testComplete ? 100 : testRawPercent');
  });
});

describe('Current-model progress display', () => {
  const testPanelSource = readComponent('TestPanel.tsx');

  it('forces active progress bars to fill fully when rounded display reaches 100 percent', () => {
    expect(testPanelSource).toContain('Math.floor(rawPercent)');
    expect(testPanelSource).toContain('barWidth = isComplete ? 100 : rawPercent');
  });
});
