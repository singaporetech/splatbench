#!/usr/bin/env node

/**
 * Headless mode: drives the SplatBench app through Playwright's Chromium, runs
 * the batch benchmark on a folder of ref_<name>.<ext> / test_<name>.<ext>
 * pairs, and saves the benchmark CSV.
 *
 * The app must already be served, for example with `npm run dev` or with
 * `npm run build && npm run preview -- --port 5173`.
 *
 * Usage:
 *   npm run collect:headless -- --assets <dir> [--out <csv>] [--url <app url>]
 *     [--sweep-seeds 42,1337,2026] [--timeout <ms>] [--headless]
 *
 * Defaults:
 *   --assets   .test-assets
 *   --out      results/splatbench_benchmark.csv
 *   --url      http://localhost:5173
 *   --timeout  3600000 (whole batch)
 *
 * Chromium runs headed by default, which is how the published runs were
 * collected: a desktop Chromium window reliably gets GPU-backed WebGL.
 * --headless switches to Chromium's headless mode, which only works where
 * that mode still has GPU access.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// the viewport and device pixel ratio fix the canvas size of both viewers,
// 480x711 each at a device pixel ratio of 1
const VIEWPORT = { width: 1280, height: 800 };
const DEVICE_SCALE_FACTOR = 1;

const USAGE = `Usage: npm run collect:headless -- --assets <dir> [options]

  --assets <dir>        folder of ref_<name>.<ext> / test_<name>.<ext> pairs (default .test-assets)
  --out <csv>           output CSV (default results/splatbench_benchmark.csv)
  --url <url>           where the app is served (default http://localhost:5173)
  --sweep-seeds <list>  comma-separated seeds for the opt-in seeded trajectory sweep
  --timeout <ms>        limit for the whole batch (default 3600000)
  --headless            use Chromium's headless mode instead of a window`;

// mirrors the software-renderer gate in src/lib/metrics/captureGates.ts
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render driver|\bwarp\b/i;

function parseArgs(argv) {
  const opts = {
    assets: path.resolve('.test-assets'),
    out: path.resolve('results', 'splatbench_benchmark.csv'),
    url: 'http://localhost:5173',
    timeout: 3_600_000,
    headless: false,
    sweepSeeds: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--assets' && next) opts.assets = path.resolve(argv[++i]);
    else if (arg === '--out' && next) opts.out = path.resolve(argv[++i]);
    else if (arg === '--url' && next) opts.url = argv[++i];
    else if (arg === '--timeout' && next) opts.timeout = Number(argv[++i]);
    // comma-separated seeds; enables the opt-in seeded trajectory sweep
    else if (arg === '--sweep-seeds' && next) opts.sweepSeeds = argv[++i];
    else if (arg === '--headless') opts.headless = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) {
    throw new Error('--timeout must be a positive number of milliseconds');
  }
  return opts;
}

function discoverAssets(assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Assets directory not found: ${assetsDir}`);
  }

  const files = fs.readdirSync(assetsDir)
    .filter((name) => /\.(ply|splat|ksplat|spz|sog)$/i.test(name))
    .map((name) => path.join(assetsDir, name));

  const refs = files.filter((file) => path.basename(file).startsWith('ref_'));
  const tests = files.filter((file) => path.basename(file).startsWith('test_'));
  if (refs.length === 0 || tests.length === 0) {
    throw new Error(
      `Need at least one ref_* and one test_* splat file in ${assetsDir} ` +
        `(found ${refs.length} ref, ${tests.length} test)`,
    );
  }

  console.log(`Found ${refs.length} ref and ${tests.length} test files in ${assetsDir}`);
  for (const file of files) {
    const sizeMB = (fs.statSync(file).size / (1024 * 1024)).toFixed(1);
    console.log(`  ${path.basename(file)} (${sizeMB} MB)`);
  }
  return files;
}

// splits one CSV line, honouring quoted cells such as camera_position
function splitCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

async function webglRenderer(page) {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof renderer === 'string' && renderer.trim() ? renderer.trim() : null;
  });
}

async function collect(opts) {
  const assetFiles = discoverAssets(opts.assets);

  console.log(`\nLaunching Chromium (${opts.headless ? 'headless' : 'headed'})...`);
  const browser = await chromium.launch({
    headless: opts.headless,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    acceptDownloads: true,
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [browser error] ${msg.text()}`);
  });

  try {
    console.log(`Opening ${opts.url}...`);
    await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 30_000 });

    const renderer = await webglRenderer(page);
    if (!renderer || SOFTWARE_RENDERER.test(renderer)) {
      throw new Error(
        `Chromium has no hardware WebGL (renderer: ${renderer ?? 'unavailable'}). ` +
          'Headless mode needs GPU-backed Chromium; try without --headless on a machine with a GPU.',
      );
    }
    console.log(`WebGL renderer: ${renderer}`);

    await page.getByRole('button', { name: 'Tests', exact: true }).click();
    await page.getByRole('button', { name: 'Batch (Multi-Pair)', exact: true }).click();

    console.log(`Loading assets from ${opts.assets}...`);
    const folderInput = page.locator('input[type="file"][webkitdirectory]');
    if (await folderInput.count() > 0) {
      // directory inputs take the folder path itself
      await folderInput.setInputFiles(opts.assets);
    } else {
      await page.locator('input[type="file"][multiple]').last().setInputFiles(assetFiles);
    }

    const pairsLabel = page.locator('text=/Detected Pairs \\(\\d+\\)/i');
    await pairsLabel.waitFor({ timeout: 10_000 });
    console.log(await pairsLabel.textContent());

    if (opts.sweepSeeds) {
      console.log(`Enabling the seeded sweep with seeds ${opts.sweepSeeds}`);
      await page.locator('[data-testid="seeded-sweep-toggle"]').check();
      await page.locator('[data-testid="seeded-sweep-seeds"]').fill(opts.sweepSeeds);
    }

    // the label reads "Run Benchmark Matrix (...)" when every pair is a benchmark pair
    const runButton = page.locator('button', { hasText: /Run (Batch Tests|Benchmark Matrix)/i });
    if (await runButton.isDisabled()) {
      throw new Error('The run button is disabled; check the seed list and the detected pairs');
    }
    console.log(`Running: ${(await runButton.textContent())?.trim()}`);
    await runButton.click();

    console.log(`Waiting for the batch to finish (timeout ${opts.timeout / 1000} s)...`);
    await page.waitForSelector('text=Batch Complete', { timeout: opts.timeout });

    const canvases = await page.evaluate(() => ({
      sizes: [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`),
      dpr: window.devicePixelRatio,
    }));
    console.log(`Viewer canvases: ${canvases.sizes.join(', ')} at device pixel ratio ${canvases.dpr}`);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.locator('button', { hasText: /Download Benchmark CSV/i }).click(),
    ]);
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    await download.saveAs(opts.out);

    const lines = fs.readFileSync(opts.out, 'utf-8').split('\n').filter((line) => line.trim());
    const header = lines[0] ? splitCsvLine(lines[0]) : [];
    const schemaIndex = header.indexOf('export_schema_version');
    const schema = lines[1] && schemaIndex >= 0 ? splitCsvLine(lines[1])[schemaIndex] : 'unknown';
    console.log(`\nSaved ${opts.out}`);
    console.log(`  ${header.length} columns, ${lines.length - 1} rows, schema ${schema}`);

    if (lines.length <= 1) {
      console.error('The CSV has no data rows.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`\nCollection failed: ${err.message}`);
    const shot = path.join(path.dirname(opts.out), 'collect-headless-error.png');
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.error(`Screenshot: ${shot}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

console.log('SplatBench headless collection');
console.log(`  assets  ${opts.assets}`);
console.log(`  out     ${opts.out}`);
console.log(`  url     ${opts.url}`);
if (opts.sweepSeeds) console.log(`  seeds   ${opts.sweepSeeds}`);

collect(opts).catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
