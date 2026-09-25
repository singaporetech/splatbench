# SplatBench

> **Open-source release.** This repository contains the full SplatBench
> source (see [Citation](#citation) to cite it). No splat assets are
> included; see [Benchmark Models](#benchmark-models) for download links to
> the standard benchmark datasets. Quick start: `npm install &&
> npm test && npm run dev` (see [Quick Start](#quick-start) and [Testing](#testing)).

SplatBench evaluates 3D Gaussian Splatting (3DGS) web deployment formats — `.ply`, `.splat`, `.ksplat`, `.spz`, `.sog` — under reproducible browser conditions. It pairs side-by-side reference and test viewers with synchronized cameras, image-quality metrics (PSNR, whole-image and windowed SSIM), and runtime measurements (initialization time, frame rate, frame-time variance) so the same protocol can be used for interactive inspection and unattended batch runs.

Accompanies the paper *SplatBench: Benchmarking Interaction with Gaussian Splatting on the Web*, accepted to **SIGGRAPH Asia 2026 Technical Communications**.

---

## Features

### Dual viewers
- **Reference and test panels** — left/right viewers that share a single synchronized camera so both renders sit at exactly the same pose.
- **A/B comparison slider** — a draggable divider overlays the reference and test renders in one frame, so format artefacts (lost foliage texture, softened text, motion-conditioned shimmer) can be inspected side-by-side at the same camera pose.
- Three.js + Spark renderer.

### Metrics
- **Image quality:** PSNR, whole-image SSIM, and 11×11 Gaussian-windowed SSIM, computed on demand when both viewers have a model loaded.
- **Runtime:** frame rate, frame time, initialization time (from before the file bytes are read until the renderer reports the mesh initialized, with the file read, mesh initialization, and time to first frame also recorded separately), and JS-heap memory (Chrome only).
- **File:** byte size, splat count, and detected format.

### Interaction
- Orbit / pan / zoom controls (mouse or trackpad).
- Camera-distance readout with the close / medium / far protocol presets used for evaluation.
- Drag-and-drop file loading.
- Custom viewpoints: save the current camera pose, then export and re-import the list as JSON.
- Camera paths: record one by hand, load one from JSON, or generate a seeded random one (see [Camera Paths and Viewpoints](#camera-paths-and-viewpoints)).

### Supported formats
- `.ply` — uncompressed baseline
- `.splat` — standard splat
- `.ksplat` — K-splat compressed
- `.spz` — Niantic SPZ compressed
- `.sog` — PlayCanvas SOG bundle (quantized attributes stored as WebP images)

Measured file sizes, quality, and runtime cost are scene- and
configuration-dependent, so measure them on your own content.

---

## Usage Modes

SplatBench supports two complementary usage modes that map onto common
research workflows. Both modes record the same reproducibility context —
screenshots, browser version, GPU, timestamps, and camera settings — so
results from interactive exploration and batch runs are directly
comparable.

### Interactive Mode (Web UI)

Drag-and-drop a reference model and a test model, share a single
synchronized camera between the two viewers, and use the A/B comparison
slider to inspect a viewpoint under a draggable divider. PSNR/SSIM are
computed on demand and screenshots can be captured at any pose. This is
the mode used to localize where a format degrades a specific scene —
i.e., when aggregate metrics agree numerically but disagree
perceptually, or when one scene is driving a headline result.

### Batch Mode (Automated)

Point the Batch Test Panel at a folder of paired files (`ref_<name>.<ext>` / `test_<name>.<ext>`). When pair names follow the `<scene>-<format>` naming pattern (for example `bonsai-sog` or `drjohnson-spz`), the runner expands each pair into the full benchmark matrix of five standardized viewpoints × three replicates × all batch tests (orbit, dolly, and pan trajectories plus static quality) and runs them unattended; results stream into a benchmark CSV export. The same protocol can therefore be re-run, audited, or extended to new scenes and formats without modifying the evaluation contract.

Any lowercase scene name works. Six scenes have a pinned camera radius (bonsai, flower or flowers, garden, playroom, train, truck), so their camera distances never change. For any other scene the radius is measured once per pair from the reference asset, before the first viewpoint is applied, so a lossy test format cannot move the camera and every format of a scene is judged from the same poses. An opt-in [seeded sweep](#seeded-sweep-in-batch-mode) adds seeded trajectory runs on top of the matrix.

### Headless Mode

`scripts/collect-headless.mjs` drives the same app through Playwright's Chromium to run a batch without anyone at the keyboard. It loads a folder of `ref_`/`test_` pairs into the Batch panel, runs the benchmark matrix, and saves the benchmark CSV.

```bash
npx playwright install chromium   # once, to fetch the browser
npm run build
npm run preview -- --port 5173    # keep this running in one terminal
npm run collect:headless -- --assets path/to/pairs --out results/benchmark.csv
```

Options: `--assets <dir>` (default `.test-assets`), `--out <csv>` (default `results/splatbench_benchmark.csv`), `--url <url>` (default `http://localhost:5173`), `--sweep-seeds 42,1337,2026` to add the opt-in seeded sweep, `--timeout <ms>` for the whole batch (default one hour), and `--headless` to use Chromium's headless mode instead of a window. The driver fixes a 1280×800 viewport at a device pixel ratio of 1, which gives each viewer a 480×711 canvas, and prints the canvas sizes, row count, and schema version when it finishes.

It needs GPU-backed Chromium. Chromium starts with WebGL enabled and the GPU blocklist ignored, and the driver stops before running anything if the WebGL renderer is a software rasterizer such as SwiftShader or llvmpipe. Chromium opens a window by default, since a desktop window reliably gets the GPU; `--headless` only works where Chromium's headless mode still has GPU access.

---

## Benchmark Models

SplatBench evaluates 3DGS web deployment formats using established benchmark scenes from the research community. The following datasets are used in the original [3D Gaussian Splatting paper](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) (Kerbl et al., SIGGRAPH 2023; [doi:10.1145/3592433](https://doi.org/10.1145/3592433)) and are standard benchmarks across the field.

### Pre-trained 3DGS Models (Recommended)

The fastest way to get started is to download the **official pre-trained models** from the 3DGS authors. These contain trained `.ply` files ready to load into SplatBench.

| Source | Link | Size | Contents |
|--------|------|------|----------|
| **Pre-trained Models** | [models.zip (14 GB)](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/datasets/pretrained/models.zip) | 14 GB | All 13 scenes as `.ply` files (point_cloud/iteration_30000/point_cloud.ply) |

Each scene folder contains `point_cloud/iteration_7000/` and `point_cloud/iteration_30000/` subdirectories. Use the `iteration_30000` PLY files for best quality.

All thirteen scenes can be benchmarked: `bicycle`, `bonsai`, `counter`, `flowers`, `garden`, `kitchen`, `room`, `stump`, and `treehill` (Mip-NeRF 360), `train` and `truck` (Tanks and Temples), and `drjohnson` and `playroom` (Deep Blending). Name batch pairs after the scene folder, for example `ref_stump-sog.ply` and `test_stump-sog.sog`.

> **Note:** Splat assets (including `bonsai.ply`) are not bundled with this
> repository due to file size.

### Source Datasets (Training Data)

If you want to train your own 3DGS models or need the source images for evaluation:

#### 1. Mip-NeRF 360 (Barron et al., CVPR 2022; [doi:10.1109/CVPR52688.2022.00539](https://doi.org/10.1109/CVPR52688.2022.00539))

The primary benchmark dataset for 3DGS evaluation. Contains 9 scenes (5 outdoor, 4 indoor) with 360-degree captures: `bicycle`, `garden`, `stump`, `flowers`, `treehill` (outdoor) and `bonsai`, `counter`, `kitchen`, `room` (indoor).

- **Download:** [jonbarron.info/mipnerf360](https://jonbarron.info/mipnerf360/) or directly via `wget http://storage.googleapis.com/gresearch/refraw360/360_v2.zip`
- **Format:** Source images + COLMAP sparse reconstruction
- **Note:** The `treehill` and `flowers` scenes require requesting access from the authors

#### 2. Tanks and Temples (Knapitsch et al., SIGGRAPH 2017; [doi:10.1145/3072959.3073599](https://doi.org/10.1145/3072959.3073599))

Large-scale indoor/outdoor scenes commonly used for 3DGS benchmarking. The 3DGS authors provide pre-processed COLMAP reconstructions for the `truck` and `train` scenes.

- **Download (COLMAP data):** [tandt_db.zip (650 MB)](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/datasets/input/tandt_db.zip) from the 3DGS authors (includes both T&T and Deep Blending scenes)
- **Original dataset:** [tanksandtemples.org/download](https://tanksandtemples.org/download/)
- **Format:** Source images + COLMAP sparse reconstruction

#### 3. Deep Blending (Hedman et al., SIGGRAPH Asia 2018; [doi:10.1145/3272127.3275084](https://doi.org/10.1145/3272127.3275084))

Indoor scenes with complex lighting and reflections. The 3DGS authors' archive provides COLMAP reconstructions for the `drjohnson` and `playroom` scenes.

- **Download (COLMAP data):** Included in [tandt_db.zip (650 MB)](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/datasets/input/tandt_db.zip) above
- **Original dataset:** [Deep Blending datasets page](https://www-sop.inria.fr/reves/publis/2018/HPPFDB18/datasets.html)
- **Format:** Source images + COLMAP reconstruction

### Getting .splat, .ksplat, .spz, and .sog Files

The pre-trained models provide `.ply` files. To benchmark other formats in SplatBench, you need to convert them:

#### Online Conversion

- **[SuperSplat Editor](https://superspl.at/editor)** (PlayCanvas): Load a `.ply` file, edit/crop, and export as compressed PLY or other formats. Browser-based, no install required.
- **[antimatter15/splat viewer](https://antimatter15.com/splat/)**: Drag and drop a `.ply` file to automatically convert to `.splat` format.

#### CLI Conversion

- **[splat-transform](https://github.com/playcanvas/splat-transform)** (PlayCanvas CLI tool): Converts between PLY, SPLAT, KSPLAT, SOG, SPZ, and CSV formats.
  ```bash
  npm install -g @playcanvas/splat-transform
  splat-transform input.ply output.splat
  splat-transform input.ply output.ksplat
  splat-transform input.ply output.sog
  ```

- **[Niantic SPZ tools](https://github.com/nianticlabs/spz)**: Official encoder/decoder for the SPZ compressed format.
  ```bash
  # Build from source, then:
  ./spz_encode input.ply output.spz
  ```

#### Format Trade-offs After Conversion

`.ply` is the uncompressed baseline; `.splat`, `.ksplat`, `.spz`, and `.sog` are
compressed alternatives that trade off file size, fidelity, and runtime
cost in different ways. The trade-offs depend on the scene, the trained
Gaussian count, and the converter settings, so we do not quote canonical
numbers here. Measure on your own content for any deployment decision.

### Pre-converted .splat Files

Some sources provide pre-converted `.splat` files that you can load directly:

- **[antimatter15/splat demos](https://antimatter15.com/splat/)**: Hosts several pre-converted `.splat` files (e.g., plush, truck scenes) that can be referenced via URL
- **[Polycam gallery](https://poly.cam/explore)**: Community-uploaded Gaussian splat captures in various formats

---

## Quick Start

### Development

```bash
npm install
npm test       # run the unit-test suite once
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the app.

### Build

```bash
npm run build
npm run preview  # Preview production build
```

---

## Evaluation Protocol

The protocol used by both interactive and batch runs is fixed so that
results are directly comparable across sessions, machines, and users.

1. **Camera distances** (radius-relative, with a colour-coded readout in
   the UI):
   - Close — 1.5× radius (≈ 2.7 units in the bonsai scene); primary
     fidelity metric.
   - Medium — 3.5× radius (≈ 6.3 units); typical web viewing distance.
   - Far — 6.0× radius (≈ 10.8 units); perceptual-equivalence regime.

2. **Measurement:** camera-synchronised viewers; PSNR and SSIM computed
   per frame against the reference; frame-rate and frame-time statistics
   accumulated over rolling windows.
   - PSNR is `10·log10(255² / MSE)` over 8-bit RGB. SSIM uses BT.601 luma: `ssim` is whole-image SSIM (one window spanning the frame), and `ssim_windowed` uses an 11×11 Gaussian window (σ = 1.5, stride 1, population covariance), checked against scikit-image by `scripts/ssim_reference_fixtures.py`. Both compare the test asset with the reference PLY rendered through the same viewer, so they measure conversion loss, not reconstruction accuracy.
   - Trajectories sample 60 keyframes at `t = i / 59`. Orbit sweeps a 90° arc at 15° elevation linearly; dolly and pan ease with `(1 − cos(πt)) / 2`. Per-frame PSNR and SSIM are averaged over the path, and the per-frame minima are exported alongside the means. Inter-frame SSIM compares consecutive frames of the asset under test.
   - Initialization time starts before the file bytes are read and stops when the renderer reports the mesh initialized. It excludes scene insertion, shader compilation, the first sort and render, and network transfer, and it is recorded on the `front` viewpoint rows because each pair is loaded once.

3. **Validation gates:** a capture stops its measurement with an error, rather than exporting numbers, when WebGL runs on a software renderer (SwiftShader, llvmpipe, Microsoft Basic Render Driver and similar) or reports no renderer, when the captured frame is fully transparent or a single flat colour, or when the reference and test resolutions differ.

4. **Export:** every measurement is timestamped and tagged with the
   browser, GPU, scene, format, viewpoint, and replicate index, and is
   written to a benchmark CSV with a fixed column order, so runs from
   different sessions and machines can be combined and analysed together.
   See [Export Schema](#export-schema) for the columns.

---

## Export Schema

**Download Benchmark CSV** in the Batch panel writes one row per scene, format, viewpoint, replicate, and test. The schema is versioned and every row records its `export_schema_version`. Columns are only ever appended, so each version is the previous one plus trailing columns, and older files keep matching the leading columns of newer ones.

| Version | Columns | Adds |
|---------|---------|------|
| 1.0 | 41 | Timestamp, test and replicate, scene and formats, file sizes and compression ratio, viewpoint, camera distance, tier and position, PSNR and whole-image SSIM, per-viewer FPS, frame time, memory, load time, 1%-low FPS and frame-time variance, browser, GPU, WebGL, OS, screen, device pixel ratio, splat counts, canvas size |
| 2.0 | 55 | `app_version`, `renderer_lib_versions` (installed Spark and Three.js), `export_schema_version`; `interframe_ssim_mean`, `interframe_ssim_std`, `interframe_ssim_min`, `psnr_min_db`, `ssim_min` on trajectory rows; `load_read_ms`, `load_init_ms`, `load_first_frame_ms` for reference and test on `front` rows |
| 2.1 | 57 | `ssim_windowed`, `ssim_windowed_min` |
| 2.2 | 59 | `trajectory_source` (`preset`, `seeded`, or `custom`, blank on static rows) and `trajectory_seed` (seeded rows only) |

Each row carries its own provenance: timestamp, browser name, version and engine, GPU renderer, WebGL version, OS platform, screen resolution, device pixel ratio, canvas size, camera position, scene and asset variant, reference and test file sizes, and the app and renderer library versions, so files from different sessions and machines can be concatenated and still be told apart.

---

## Camera Paths and Viewpoints

Beyond the orbit, dolly, and pan presets, the runner accepts any camera path given as a list of keyframes. Seeded, JSON, and recorded paths run from the **Single Pair** tab under **Trajectory options**, alongside the registered tests; seeded paths can also run in batch mode through the opt-in sweep.

### Seeded random paths

The **Seeded Random Trajectory** test draws six waypoints from a `mulberry32` PRNG and passes a centripetal Catmull-Rom curve through them: 60 keyframes, each looking at the scene center, with the radius held between 0.6× and 1.4× of the start distance. Each waypoint consumes three draws in a fixed order (azimuth, elevation between −15° and 45°, distance factor), so the same seed and app version always give the same path on any machine. The **Seed** input appears while the test is selected (default 42), and sweep rows record their seed in `trajectory_seed`.

### Custom paths from JSON

**Custom path (JSON)…** loads a file of camera positions and look-at targets and replays it verbatim, one keyframe per frame:

```json
{
  "name": "my-path",
  "frames": [
    { "position": [0, 1, 5], "target": [0, 0, 0] },
    { "position": [3, 1, 4], "target": [0, 0, 0] },
    { "position": [5, 1, 0] }
  ]
}
```

`name` must be a non-empty string, `frames` holds 2 to 600 entries, `position` is three finite numbers, and `target` defaults to `[0, 0, 0]`. Errors name the first offending frame, for example `Frame 1: "position" must have exactly 3 numbers, got 2`. The loaded path runs as `Custom Trajectory: <name>`.

### Recorded paths

**Record path** samples the reference viewer's camera position and target at about 15 Hz (every fourth frame) while you move the camera by hand, drops repeated poses, and stops at 600 frames. **Stop recording** saves `recorded-path.json` in the same format and loads that saved file back as the custom path, so the path that runs is exactly the file on disk.

### Custom viewpoints

The **Custom** section of each viewer's viewpoint panel saves the current camera pose as `Custom 1`, `Custom 2`, and so on. Saved viewpoints apply like the five standard ones and can be removed individually. **Export** writes `<scene>-viewpoints.json`, and **Import…** appends the viewpoints from a file:

```json
{
  "name": "garden",
  "viewpoints": [
    { "name": "Custom 1", "position": [1.5, 0, 3], "target": [0, 0, 0], "fov": 50 },
    { "name": "Custom 2", "position": [-4, 0, 0] }
  ]
}
```

A file holds 1 to 50 viewpoints; `target` defaults to the origin and `fov`, if given, must be between 0 and 180 degrees. Saved viewpoints last for the session unless exported.

### Seeded sweep in batch mode

Neither the seeded nor the custom test is part of the benchmark matrix. To measure path variation in a batch, tick **Seeded trajectory sweep** in the Batch panel and enter 1 to 10 distinct seeds (default `42, 1337, 2026`). After a pair's matrix finishes, the seeded test runs once per seed at the pair's `front` viewpoint, labelled replicate 1, and each run adds one CSV row with `trajectory_source=seeded` and its seed. With the box unticked, which is the default, a batch runs exactly the matrix.

---

## Modular Test Architecture

SplatBench uses a modular test system that makes it easy to add new benchmarks. Every evaluation (trajectory tests, quality comparisons, stress tests) is a **Test** registered in a central registry and automatically discovered by the UI. The same registry is also what [Batch Mode](#batch-mode-automated) iterates over, so any new test added here is picked up by both interactive and unattended runs without protocol changes.

### Core Concepts

| Concept | File | Description |
|---------|------|-------------|
| `Test` interface | `src/lib/testing/types.ts` | Contract every benchmark implements: `id`, `name`, `description`, `category`, and a `run()` method |
| `TestResult` | `src/lib/testing/types.ts` | Standardized output: metrics map, structured metric entries, pass/fail, summary, duration |
| `TestScene` | `src/lib/testing/types.ts` | Runtime context passed to tests: primary viewer + optional reference viewer |
| Registry | `src/lib/testing/registry.ts` | `registerTest()` / `getTests()` / `getTestsByCategory()` -- tests self-register on import |
| Test Runner | `src/hooks/useTestRunner.ts` | React hook managing selection, sequential execution, progress, results, cancellation |
| Test Panel | `src/components/Testing/TestPanel.tsx` | UI: checkbox list grouped by category, Run Selected/All, progress, results, batch summary |

### Data Flow

```
Registry (discovers tests) --> useTestRunner (manages execution) --> TestPanel (renders UI)
                                      |
                                      v
                              Test.run(scene, onProgress, signal)
                                      |
                                      v
                              TestResult { metrics, passed, summary }
```

### Built-in Tests

| Test ID | Category | What it measures |
|---------|----------|-----------------|
| `trajectory-orbit` | Trajectory | Temporal consistency during orbital camera sweep |
| `trajectory-dolly` | Trajectory | Temporal consistency during zoom in/out |
| `trajectory-pan` | Trajectory | Temporal consistency during lateral camera pan |
| `static-quality` | Quality | PSNR/SSIM at current camera position (requires reference viewer) |
| `trajectory-seeded` | Trajectory | Temporal consistency along a seeded random path (Single Pair panel, or the opt-in batch sweep) |
| `trajectory-custom` | Trajectory | Temporal consistency along a recorded or JSON-loaded path (Single Pair panel only, not registered) |

All trajectory tests compute inter-frame SSIM (mean, std dev, min) on the asset under test and, with a reference viewer, per-frame PSNR, whole-image SSIM, and windowed SSIM (mean and minimum). Batch runs iterate `getBatchTests()`, which excludes the seeded test, so the benchmark matrix runs only the orbit, dolly, pan, and static-quality tests.

### Adding a New Test

1. **Create the test file** in `src/lib/testing/`:

```typescript
// src/lib/testing/myNewTest.ts
import type { Test, TestScene, OnProgress } from './types';
import { registerTest } from './registry';

const myTest: Test = {
  id: 'my-category-test-name',
  name: 'My Test Name',
  description: 'What this test measures in one sentence.',
  category: 'My Category',
  async run(scene: TestScene, onProgress: OnProgress, signal: AbortSignal) {
    // 1. Use scene.primary (and optionally scene.reference) to access
    //    camera, controls, canvas, renderer, forceRender()
    // 2. Call onProgress({ fraction, message, phase }) to update the UI
    // 3. Check signal.aborted to support cancellation
    // 4. Return a TestResult with metrics, metricEntries, summary, passed

    onProgress({ fraction: 0.5, message: 'Working...', phase: 'Computing' });

    return {
      testId: 'my-category-test-name',
      metrics: { someMetric: 0.95 },
      metricEntries: [
        { label: 'Some Metric', value: 0.95, higherIsBetter: true },
      ],
      summary: 'Test completed with score 0.95',
      passed: true,
      completedAt: new Date().toISOString(),
      durationMs: 1234,
    };
  },
};

registerTest(myTest);
export { myTest };
```

2. **Import your test** in `src/lib/testing/index.ts` so it auto-registers:

```typescript
export { myTest } from './myNewTest';
```

3. The test appears in the Tests tab on next reload, grouped under its declared category.

### Running Tests in the UI

1. Load a reference model (left pane). Load a test model (right pane) for comparison.
2. Press **T** or click the **Tests** tab in the right panel.
3. Check/uncheck individual tests. Use **All** / **None** buttons for bulk selection.
4. Click **Run Selected** to run checked tests, or **Run All** to run everything.
5. Watch per-test progress bars and status indicators (idle / running / done / failed).
6. After completion, see individual result cards with metrics and a batch summary.

---

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7.3
- **3D Rendering**: Three.js 0.182 + **[@sparkjsdev/spark](https://github.com/sparkjsdev/spark)**
- **Styling**: Tailwind CSS v4
- **Quality Metrics**: Custom PSNR and SSIM (whole-image and 11×11 Gaussian-windowed) implementation
- **Deployment**: GitHub Pages (optional)

---

## Testing

### Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode (re-run on file changes)
npm run test:coverage # Run tests with coverage report
```

Tests use [Vitest](https://vitest.dev/) and run entirely in Node (no browser required).

### Test Categories

| Category | File | What it covers |
|----------|------|----------------|
| **Image Quality** | `src/lib/metrics/imageQuality.test.ts` | PSNR accuracy, SSIM correctness, edge cases (identical, black/white, gradient images), metric symmetry, monotonic degradation |
| **Trajectory Metrics** | `src/lib/metrics/trajectoryMetrics.test.ts` | Inter-frame SSIM computation, per-frame metric aggregation, `buildTrajectoryMetricsResult` pipeline, data integrity (frames captured = frames processed), determinism |
| **Camera Trajectories** | `src/lib/camera/trajectories.test.ts` | Orbit/dolly/pan keyframe generation, geometric correctness (constant distance, 360-degree return), t-value monotonicity, dispatcher routing, MetricsCollector FPS/frame-time/percentile accuracy, seeded path determinism, custom path parsing, path recording |
| **Windowed SSIM** | `src/lib/metrics/imageQuality.test.ts` | Agreement with scikit-image on fixed fixtures (regenerate with `uv run --with scikit-image --with numpy python3 scripts/ssim_reference_fixtures.py`), symmetry, stride handling |
| **Benchmark Export** | `src/lib/export/benchmarkCsvExport.test.ts` | Column order and schema version, provenance, stability, load-phase, windowed-SSIM, and trajectory columns, scene and format inference |
| **Batch Runner** | `src/hooks/useBatchTestRunner.test.ts` | Pair-name parsing for all formats and scenes, viewpoint matrix, scene radius measurement, seeded sweep |
| **Camera Presets** | `src/lib/camera/cameraPresets.test.ts` | Pinned camera distances, radius estimation, viewpoint file export and import |

### Adding New Tests

1. Create a `.test.ts` file next to the module you want to test (co-located pattern).
2. Import from `vitest`: `import { describe, it, expect } from 'vitest'`.
3. Use the helper functions in existing test files (e.g., `createImageData`, `generateFrameSequence`) for constructing synthetic test data.
4. Run `npm test` to verify.

**Guidelines:**
- Tests must be deterministic (no random data without fixed seeds).
- Prefer exact numeric assertions (`toBeCloseTo`, `toBe`) over loose checks.
- For metric tests, validate against known mathematical results, not empirical "looks right" values.

### Manual Testing Checklist

1. **File Loading**
   - [ ] Load .ply file into reference model (left pane)
   - [ ] Load .splat file into test model (right pane)
   - [ ] Verify splat counts match between the two formats for the same scene
   - [ ] Test .ksplat, .spz, and .sog formats

2. **Rendering**
   - [ ] Confirm both viewers render without stutter or visible artefacts
   - [ ] Verify the scene renders correctly (e.g., bonsai tree shape)
   - [ ] Check camera controls (rotate, pan, zoom)

3. **Quality Metrics**
   - [ ] Auto-compare triggers after both load
   - [ ] Sanity check: comparing a model against itself yields very high PSNR and SSIM near 1.0 (self-comparison only — not a benchmark result)

4. **Performance**
   - [ ] No console errors
   - [ ] Memory usage displayed
   - [ ] Camera distance updates smoothly

### Test Files

This repository does **not** ship with splat assets. To run the manual checklist
above, place the bonsai variants under `public/` (or load them via the
in-app drag-and-drop). See [Benchmark Models](#benchmark-models) for download
and conversion instructions:
- `bonsai.ply` — Original PLY format (download from the 3DGS authors)
- `bonsai.splat` — Standard splat (convert with `splat-transform`)
- `bonsai.ksplat` — K-splat compressed (convert with `splat-transform`)
- `bonsai.spz` — Niantic SPZ (convert with the SPZ encoder)
- `bonsai.sog` — PlayCanvas SOG (convert with `splat-transform`)

---

## Contributing

This is part of an academic research project. Contributions are welcome, especially:

- Additional 3DGS format support
- More quality metrics (MS-SSIM, VMAF, etc.)
- Performance optimizations
- Browser compatibility improvements
- Test scene contributions

---

## How This Was Built

This work was created with AI agents but intimately shepherded by humans.

---

## Citation

SplatBench was accepted to SIGGRAPH Asia 2026 Technical Communications. If you
use it in your research, please cite:

```bibtex
@inproceedings{singhania2026splatbench,
  author    = {Adi Singhania and Leon Foo and Chen Kan and Chek Tien Tan},
  title     = {SplatBench: Benchmarking Interaction with Gaussian Splatting on the Web},
  booktitle = {SIGGRAPH Asia 2026 Technical Communications},
  year      = {2026},
  publisher = {ACM},
  address   = {Kuala Lumpur, Malaysia},
  doi       = {10.1145/3829339.3847854}
}
```

---

## License

MIT License - See [LICENSE](./LICENSE) for details.

---

## Related Work

- [3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) - Kerbl et al., SIGGRAPH 2023 ([doi:10.1145/3592433](https://doi.org/10.1145/3592433))
- [Spark](https://github.com/sparkjsdev/spark) - Three.js-based 3DGS renderer used by SplatBench
- [antimatter15/splat](https://github.com/antimatter15/splat) - Original `.splat` format reference implementation
- [PlayCanvas engine](https://github.com/playcanvas/engine) - Open-source engine with `.ply`/splat compression tooling
- [Niantic SPZ](https://github.com/nianticlabs/spz) - `.spz` compressed format

### Cited Datasets

- Kerbl, B., Kopanas, G., Leimkühler, T., & Drettakis, G. (2023). 3D Gaussian
  Splatting for Real-Time Radiance Field Rendering. *ACM Transactions on
  Graphics*, 42(4), 1–14. [doi:10.1145/3592433](https://doi.org/10.1145/3592433).
- Barron, J. T., Mildenhall, B., Verbin, D., Srinivasan, P. P., & Hedman, P.
  (2022). Mip-NeRF 360: Unbounded Anti-Aliased Neural Radiance Fields. In
  *IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)*,
  5460–5469. [doi:10.1109/CVPR52688.2022.00539](https://doi.org/10.1109/CVPR52688.2022.00539).
- Knapitsch, A., Park, J., Zhou, Q.-Y., & Koltun, V. (2017). Tanks and
  Temples: Benchmarking Large-Scale Scene Reconstruction. *ACM Transactions
  on Graphics*, 36(4), 1–13. [doi:10.1145/3072959.3073599](https://doi.org/10.1145/3072959.3073599).
- Hedman, P., Philip, J., Price, T., Frahm, J.-M., Drettakis, G., & Brostow,
  G. (2018). Deep Blending for Free-Viewpoint Image-Based Rendering. *ACM
  Transactions on Graphics*, 37(6), 1–15.
  [doi:10.1145/3272127.3275084](https://doi.org/10.1145/3272127.3275084).

---

## Support

For methodology details, see the paper (see [Citation](#citation)). For bugs,
questions, or feature requests, please open a
[GitHub issue](https://github.com/singaporetech/splatbench/issues). For
academic collaboration, contact the authors at the Singapore Institute of
Technology.

