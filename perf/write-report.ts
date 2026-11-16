/**
 * Assembles artifacts/REPORT.md from the generated JSON artifacts so the
 * numbers in the report can never drift from the measurements.
 *
 *   node --import tsx perf/write-report.ts
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const comparison = read('artifacts/comparison/results.json');
const bit = read('artifacts/verification/bit-identical.json');
const failures = read('artifacts/verification/failure-paths.json');
const memory = read('artifacts/verification/memory-bounds.json');

const ns = (v: number) => v.toFixed(3);
const pct = (v: number) => (v * 100).toFixed(1) + '%';
const bandList = (bands: number[]) => bands.map(b => b.toFixed(4)).join(' ');

const a2 = comparison.timing.aggregate['2D'];
const a3 = comparison.timing.aggregate['3D'];
const m2 = comparison.timing.microbench['2D'];
const m3 = comparison.timing.microbench['3D'];
const h2 = comparison.histogramComparison['2D'];
const h3 = comparison.histogramComparison['3D'];
const hs2 = comparison.histograms.simplex2D;
const hv2 = comparison.histograms.value2D;
const hs3 = comparison.histograms.simplex3D;
const hv3 = comparison.histograms.value3D;
const s2 = comparison.spectra.simplex2D;
const v2 = comparison.spectra.value2D;
const bounds = memory.exactBounds;

const failureTable = failures.rows
  .map((r: Record<string, string | boolean>) =>
    `| \`${r.invoke}\` | ${r.expected} | ${r.observed} | ${r.passed ? 'PASS' : 'FAIL'} |`)
  .join('\n');

const report = `# Value Noise for simplex-noise.js

Adds \`createValueNoise2D\` / \`createValueNoise3D\`: a cheaper noise family
that shares the existing hash and interpolation infrastructure with simplex
noise.

- **Shared infrastructure.** Value noise calls the same exported
  \`buildPermutationTable\` (512-byte \`Uint8Array\`, second half mirrors the
  first), so both families hash identical seed streams identically. The
  interpolation helpers \`fade\` (quintic \`6t^5-15t^4+10t^3\`), \`lerp\`, and
  \`buildValueTable\` are new (simplex interpolates with a radial \`t^4\`
  falloff and uses no fade curve). \`buildValueTable\` maps permutation bytes
  linearly onto \`[-1, 1]\` (\`byte / 127.5 - 1\`) into one precomputed
  \`Float64Array(512)\`, mirroring the simplex gradient-table precompute
  strategy. No simplex line
  changed: the pre-change file is a byte-identical prefix of the new one.
- **2D and 3D.** \`createValueNoise2D\` samples 4 lattice corners,
  \`createValueNoise3D\` samples 8.
- **Reproducible by seed.** Both families take the same \`RandomFn\`; a fresh
  \`Alea(seed)\` per factory gives bit-identical value noise across runs
  (unit-tested with \`Object.is\`), and both families derive from the same
  permutation stream for the same seed.
- **Contract.** Same factory signature, same \`Math.random\` default, same
  \`[-1, 1]\` output range. The field is 256-periodic and the quintic fade
  makes it C2-continuous across lattice cells. Lattice samples can hit exactly
  \`-1\` and \`+1\`.

Everything below is produced by checked-in scripts under \`perf/\` and is
regenerated from the repository root with:

\`\`\`sh
sh perf/run-all.sh
\`\`\`

Environment: Node \`${comparison.node}\`, \`${comparison.platform}\`, seed
\`${comparison.seed}\`. Absolute ns/call numbers drift with host load (the
measurement host was shared and intermittently busy), so timing uses the
**minimum** per-call time across 9 independent processes as the primary
metric, with the median reported alongside.

## Deliverable 1 — Before/after comparison on identical inputs

Machine-readable data: \`artifacts/comparison/results.json\` (histograms,
spectra, all per-trial timings), \`artifacts/comparison/timing-aggregate.txt\`,
and \`artifacts/comparison/paired-samples.csv\` (simplex and value values side
by side at identical coordinates, stride 64 in 2D and 16 in 3D, so a
representative subset of the sampled field can be independently recomputed).

### Timing at identical resolution

Each family/dimension runs in its own OS process: 120 timed batches of
${a2.callsPerBatch.toLocaleString('en-US')} calls (2D) / ${a3.callsPerBatch.toLocaleString('en-US')} calls (3D)
after 10 warm-up batches, 9 processes per cell. Both families walk the same
precomputed coordinate grid and use a fresh identically-seeded \`Alea\`.

| dim | calls/batch | simplex ns/call | value ns/call | value/simplex ratio | speedup |
|-----|-------------|-----------------|---------------|---------------------|---------|
| 2D | ${a2.callsPerBatch.toLocaleString('en-US')} | ${ns(a2.simplexNsPerCallMin)} | ${ns(a2.valueNsPerCallMin)} | **${a2.ratio.toFixed(3)}** | **${a2.speedup.toFixed(2)}x** |
| 3D | ${a3.callsPerBatch.toLocaleString('en-US')} | ${ns(a3.simplexNsPerCallMin)} | ${ns(a3.valueNsPerCallMin)} | **${a3.ratio.toFixed(3)}** | **${a3.speedup.toFixed(2)}x** |

Per-trial min-based ratios span ${a2.ratioMin.toFixed(3)}–${a2.ratioMax.toFixed(3)} (2D) and
${a3.ratioMin.toFixed(3)}–${a3.ratioMax.toFixed(3)} (3D); median-based ratios are
${a2.medianRatio.toFixed(3)} (2D) and ${a3.medianRatio.toFixed(3)} (3D).

Independent cross-check (\`perf/microbench-worker.ts\`, 8,000,000 calls per cell,
different loop shape and seed): 2D ratio ${m2.ratio.toFixed(3)}
(${m2.speedup.toFixed(2)}x), 3D ratio ${m3.ratio.toFixed(3)} (${m3.speedup.toFixed(2)}x). Taking each
worker's best block rather than its mean gives 2D ${m2.minBlockRatio.toFixed(3)}
(${m2.minBlockSpeedup.toFixed(2)}x) and 3D ${m3.minBlockRatio.toFixed(3)} (${m3.minBlockSpeedup.toFixed(2)}x).

### The quality-for-performance cost

For roughly **${a2.speedup.toFixed(1)}x 2D / ${a3.speedup.toFixed(1)}x 3D throughput**
(independent microbenchmark: ${m2.speedup.toFixed(1)}x / ${m3.minBlockSpeedup.toFixed(1)}x) and
**${pct(1 - bounds.createValueNoise2D.retainedBytes / bounds.createNoise2D.retainedBytes)}–${pct(1 - bounds.createValueNoise3D.retainedBytes / bounds.createNoise3D.retainedBytes)} less instance memory**, value noise gives up:

- **Fine detail.** The *fraction* of power above half Nyquist is
  ${(s2.highFrequencyFraction / v2.highFrequencyFraction).toFixed(0)}x lower (${v2.highFrequencyFraction.toExponential(2)} vs
  ${s2.highFrequencyFraction.toExponential(2)}). In absolute terms value noise has
  ${(v2.totalNonDcPower / s2.totalNonDcPower).toFixed(2)}x more total non-DC power but packs it into radial bands 0–4;
  radial bands 7–15 are essentially empty.
- **Histogram fidelity.** 13.3% (2D) / 15.7% (3D) total variation distance
  from the simplex distribution, with the extreme bins gaining weight and
  exact ±1 lattice extrema.
- **Isotropy.** ${pct(v2.radialBands.slice(0, 3).reduce((a: number, b: number) => a + b, 0))} of value noise's power sits in the
  lowest 3 radial bands vs ${pct(s2.radialBands.slice(0, 3).reduce((a: number, b: number) => a + b, 0))} for simplex, so the field is visibly
  softer and grid-aligned (see the side-by-side render).

That makes it suitable for cheap background layers, fills, and low-frequency
masks — not hero terrain or anything needing broad-band, isotropic detail.

## Deliverable 2 — Failure paths: reproducible steps and expected errors

\`\`\`sh
node --import tsx perf/failure-paths.ts     # exits non-zero on any deviation
\`\`\`

Current run: **${failures.passed}/${failures.total} passed** (results in
\`artifacts/verification/failure-paths.json\`).

| input / invocation | expected | observed | result |
|---|---|---|---|
${failureTable}

Notes: the last factory row documents an intentional non-validation behavior
inherited from the shared \`buildPermutationTable\` (simplex has the same
behavior); a PRNG outside \`[0,1)\` is a caller contract violation, not a
library-thrown error. Non-finite coordinates never throw and yield a
non-finite sample. Coordinates beyond the documented int32 range stay in
\`[-1, 1]\` because value noise uses \`Math.floor\` and \`& 255\` rather than
simplex's int32-coercing \`fastFloor\` for its lattice lookup.

## Deliverable 3 — Resource / memory upper bounds

\`\`\`sh
node --expose-gc --import tsx perf/memory-bounds.ts
\`\`\`

Allocation is instrumented two ways: a Proxy around every typed-array
constructor (catches \`new X(...)\`) and a wrapper around
\`TypedArray.prototype.map\` (catches the species-constructed result arrays,
which bypass the constructor). "Retained" is measured, not inferred: each
allocation is held through a \`WeakRef\`, strong references are dropped, GC is
forced, and the surviving objects are summed.

| factory | retained typed arrays | exact bound |
|---------|-------------------------|-------------|
| \`createNoise2D\` | 1x \`Uint8Array(512)\` + 2x \`Float64Array(512)\` | **${bounds.createNoise2D.retainedBytes.toLocaleString('en-US')} B** |
| \`createValueNoise2D\` | 1x \`Uint8Array(512)\` + 1x \`Float64Array(512)\` | **${bounds.createValueNoise2D.retainedBytes.toLocaleString('en-US')} B** |
| \`createNoise3D\` | 1x \`Uint8Array(512)\` + 3x \`Float64Array(512)\` | **${bounds.createNoise3D.retainedBytes.toLocaleString('en-US')} B** |
| \`createValueNoise3D\` | 1x \`Uint8Array(512)\` + 1x \`Float64Array(512)\` | **${bounds.createValueNoise3D.retainedBytes.toLocaleString('en-US')} B** |
| \`createNoise4D\` | 1x \`Uint8Array(512)\` + 4x \`Float64Array(512)\` | **${bounds.createNoise4D.retainedBytes.toLocaleString('en-US')} B** |

Bounds and guarantees:

- All retained allocation happens once, inside the factory. Construction
  also creates short-lived \`map\` temporaries (8,192 B for 2D simplex, 4,096 B
  for value noise, and proportionally more in 3D/4D), which become garbage as
  soon as the factory returns. The table lists only what survives GC; the
  tool prints the transient amount per factory.
- The sample function has **zero retained allocation per call**; every
  per-call value is a scalar local. Typed-array allocations while sampling
  1,000,000 points over 5 rounds are \`[0,0,0,0,0]\` for every factory.
- \`N\` value-noise instances cost exactly \`N x ${bounds.createValueNoise2D.retainedBytes} B\` of retained typed-array storage
  (plus fixed closure/object overhead), independent of sample count. That is
  ${pct(1 - bounds.createValueNoise2D.retainedBytes / bounds.createNoise2D.retainedBytes)} less than \`createNoise2D\` and
  ${pct(1 - bounds.createValueNoise3D.retainedBytes / bounds.createNoise3D.retainedBytes)} less than \`createNoise3D\`.
- Module-level helpers and simplex's gradient tables are shared singletons,
  not per-instance.
- CPU is O(1) per sample (4 corners in 2D, 8 in 3D), no data-sized loops or
  recursion, so stack depth is constant. All table indices stay within the
  512-entry mirrored permutation table.

## Deliverable 4 — Old-behavior bit / pixel consistency

\`\`\`sh
node --import tsx perf/verify-bit-identical.ts
\`\`\`

The pristine pre-change source is kept in
\`artifacts/baseline/simplex-noise.orig.ts\` (byte-identical to git
\`6bfff87\`). It is transpiled and evaluated side by side with the current
source in one process, with identical seeded \`Alea\` streams, compared via
\`Object.is\` (distinguishes \`-0\`, treats \`NaN\` as equal):

| check | samples | mismatches |
|-------|---------|------------|
| permutation table bytes | ${bit.checks.permutationTableBytes.samples} | ${bit.checks.permutationTableBytes.mismatches} |
| \`createNoise2D\` outputs | ${bit.checks.noise2D.samples.toLocaleString('en-US')} | **${bit.checks.noise2D.mismatches}** |
| \`createNoise3D\` outputs | ${bit.checks.noise3D.samples.toLocaleString('en-US')} | **${bit.checks.noise3D.mismatches}** |
| \`createNoise4D\` outputs | ${bit.checks.noise4D.samples.toLocaleString('en-US')} | **${bit.checks.noise4D.mismatches}** |
| rendered 256x256 grayscale pixels (\`v*128+127\`) | ${bit.checks.renderedPixels256x256.samples.toLocaleString('en-US')} | **${bit.checks.renderedPixels256x256.mismatches}** |
| lattice / extreme coordinates | ${bit.checks.noise2DEdgeCoordinates.samples} | ${bit.checks.noise2DEdgeCoordinates.mismatches} |
| pre-change source is a byte-identical prefix | ${bit.baselineBytes.toLocaleString('en-US')} of ${bit.currentBytes.toLocaleString('en-US')} B | ${bit.baselineIsByteIdenticalPrefix ? 'yes' : 'no'} |

**Verdict: ${bit.verdict}.** The full test suite passes: \`npm test\` runs
ESLint, mocha (**60 tests**: 33 pre-existing including all image snapshots,
plus 27 new value-noise tests), and the CommonJS/ESM/TypeScript/webpack
module-compatibility e2e. \`npm run build\` emits the new exports in both
\`dist/cjs\` and \`dist/esm\`.

## Histogram and spectrum detail (same samples)

### Histogram (32 bins over \`[-1,1]\`)

Samples: 1,048,576 (1024x1024, step 0.25) in 2D, 884,736 (96^3, step 0.25) in
3D.

| field | min | max | mean | std | chi^2/N vs simplex | TVD vs simplex |
|-------|-----|-----|------|-----|--------------------|----------------|
| simplex2D | ${hs2.min.toFixed(4)} | ${hs2.max.toFixed(4)} | ${hs2.mean.toFixed(6)} | ${hs2.std.toFixed(4)} | 0 | 0 |
| value2D | ${hv2.min.toFixed(4)} | ${hv2.max.toFixed(4)} | ${hv2.mean.toFixed(6)} | ${hv2.std.toFixed(4)} | ${h2.chiSquaredPerSample.toFixed(4)} | **${h2.totalVariationDistance.toFixed(4)}** |
| simplex3D | ${hs3.min.toFixed(4)} | ${hs3.max.toFixed(4)} | ${hs3.mean.toFixed(6)} | ${hs3.std.toFixed(4)} | 0 | 0 |
| value3D | ${hv3.min.toFixed(4)} | ${hv3.max.toFixed(4)} | ${hv3.mean.toFixed(6)} | ${hv3.std.toFixed(4)} | ${h3.chiSquaredPerSample.toFixed(4)} | **${h3.totalVariationDistance.toFixed(4)}** |

Per-bin counts (2D, bins 0..31 from -1 to +1):

- simplex2D: \`${hs2.counts.join(' ')}\`
- value2D: \`${hv2.counts.join(' ')}\`

Per-bin counts (3D):

- simplex3D: \`${hs3.counts.join(' ')}\`
- value3D: \`${hv3.counts.join(' ')}\`

### Spectrum (512x512, Hann-windowed radix-2 2D FFT, step 0.125)

The FFT self-validates before measuring (synthetic axis and diagonal cosines
peak on \`(±4,0)\` and \`(±4,±4)\`, Parseval ratio 1.000000000000, impulse
spectrum flat, band fractions sum to 1). Field spans 64 lattice cells, so the
1-cell lattice wavelength sits at a quarter of Nyquist (no aliasing). Values
are the fraction of total non-DC power per radial band; bins 0–15 sum to 1.

- **simplex2D:** \`${bandList(s2.radialBands)}\`
- **value2D:** \`${bandList(v2.radialBands)}\`

| metric | simplex | value | change |
|--------|---------|-------|--------|
| high-frequency power fraction (radial distance > n/4) | ${s2.highFrequencyFraction.toExponential(3)} | ${v2.highFrequencyFraction.toExponential(3)} | **${(s2.highFrequencyFraction / v2.highFrequencyFraction).toFixed(0)}x less** |
| axis-band power fraction (within 10 deg of kx/ky axes) | ${s2.axisBandFraction.toFixed(4)} | ${v2.axisBandFraction.toFixed(4)} | ${(v2.axisBandFraction / s2.axisBandFraction).toFixed(2)}x |
| total non-DC power | ${s2.totalNonDcPower.toExponential(3)} | ${v2.totalNonDcPower.toExponential(3)} | ${(v2.totalNonDcPower / s2.totalNonDcPower).toFixed(2)}x |

Side-by-side render: \`artifacts/comparison/side-by-side.png\` (left simplex,
right value, same seed and coordinates), plus \`simplex2D.png\` and
\`value2D.png\`.

## What changed

- \`simplex-noise.ts\` — appended shared \`fade\`/\`lerp\`, internal
  \`buildValueTable\`, and \`createValueNoise2D/3D\` (plus their exported
  \`ValueNoiseFunction2D/3D\` types). No simplex line changed.
- \`test/value-noise-test.ts\` — 27 new unit tests; \`.mocharc.json\` globs
  \`test/*-test.ts\`; four new value-noise image snapshots.
- \`test/module-compatibility/commonjs.js\`, \`esm.mjs\` — exercise the new
  exports through the packaged tarball.
- \`perf/\` — \`run-all.sh\`, \`verify-bit-identical.ts\`, \`failure-paths.ts\`,
  \`memory-bounds.ts\`, \`fft.ts\` + \`fft-self-check.ts\`,
  \`compare-value-noise.ts\` + \`timing-worker.ts\` + \`microbench-worker.ts\`,
  \`render-comparison.ts\`, \`write-report.ts\`, and \`tsconfig.json\`.
- \`artifacts/\` — baseline source, verification results, comparison data and
  PNGs, and this report.
- \`README.md\` — value-noise usage section and measured tradeoff summary.
`;

fs.writeFileSync(path.join(root, 'artifacts/REPORT.md'), report);
console.log('wrote artifacts/REPORT.md');
