/**
 * Compares value noise against simplex noise on identical inputs:
 * histograms, spectra, and timing (delegated to per-process workers).
 *
 *   node --import tsx perf/compare-value-noise.ts
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import alea from 'alea';
import { createNoise2D, createNoise3D, createValueNoise2D, createValueNoise3D } from '../simplex-noise';
import { hannWindow, radialSpectrum, validateFft } from './fft';

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts/comparison');
fs.mkdirSync(outDir, { recursive: true });

const seed = 'comparison-seed';
const sampleStep = 0.25;
const fftSampleStep = 0.125;
const grid2D = 1024;
const grid3D = 96;
const fftSize = 512;
const bins = 32;
const bandCount = 16;

// --- histogram --------------------------------------------------------------

type Histogram = {
  bins: number;
  edges: number[];
  counts: number[];
  total: number;
  min: number;
  max: number;
  mean: number;
  std: number;
};

function histogram(values: Float64Array): Histogram {
  const counts = new Array(bins).fill(0);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    // [-1, 1] split into `bins` equal bins; +1 lands in the last bin
    const bin = Math.min(bins - 1, Math.max(0, Math.floor((v + 1) / 2 * bins)));
    counts[bin]++;
  }
  const mean = sum / values.length;
  let variance = 0;
  for (let i = 0; i < values.length; i++) variance += (values[i] - mean) ** 2;
  variance /= values.length;
  const edges = new Array(bins + 1).fill(0).map((_, i) => -1 + i * 2 / bins);
  return { bins, edges, counts, total: values.length, min, max, mean, std: Math.sqrt(variance) };
}

function totalVariationDistance(a: Histogram, b: Histogram): number {
  // histograms must cover the same total sample count for a clean TVD
  let tvd = 0;
  for (let i = 0; i < a.counts.length; i++) {
    tvd += Math.abs(a.counts[i] / a.total - b.counts[i] / b.total);
  }
  return tvd / 2;
}

function chiSquaredPerSample(a: Histogram, b: Histogram): number {
  // Pearson chi-square between the two normalized distributions over bins,
  // where the "expected" distribution is the simplex one.
  let chi = 0;
  let n = 0;
  for (let i = 0; i < a.counts.length; i++) {
    const expected = a.counts[i];
    const observed = b.counts[i];
    if (expected > 0) chi += (observed - expected) ** 2 / expected;
    n += expected;
  }
  return chi / n;
}

function sample2D(noise: (x: number, y: number) => number, size: number): Float64Array {
  const values = new Float64Array(size * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      values[o++] = noise(x * sampleStep, y * sampleStep);
    }
  }
  return values;
}

function sample3D(noise: (x: number, y: number, z: number) => number, size: number, step: number): Float64Array {
  const values = new Float64Array(size * size * size);
  let o = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        values[o++] = noise(x * step, y * step, z * step);
      }
    }
  }
  return values;
}

const simplex2D = createNoise2D(alea(seed));
const value2D = createValueNoise2D(alea(seed));
const simplex3D = createNoise3D(alea(seed));
const value3D = createValueNoise3D(alea(seed));

const valuesSimplex2D = sample2D(simplex2D, grid2D);
const valuesValue2D = sample2D(value2D, grid2D);
const valuesSimplex3D = sample3D(simplex3D, grid3D, sampleStep);
const valuesValue3D = sample3D(value3D, grid3D, sampleStep);

const histograms = {
  simplex2D: histogram(valuesSimplex2D),
  value2D: histogram(valuesValue2D),
  simplex3D: histogram(valuesSimplex3D),
  value3D: histogram(valuesValue3D)
};

const histogramComparison = {
  '2D': {
    totalVariationDistance: totalVariationDistance(histograms.simplex2D, histograms.value2D),
    chiSquaredPerSample: chiSquaredPerSample(histograms.simplex2D, histograms.value2D),
    perBinCountDelta: histograms.value2D.counts.map((c, i) => c - histograms.simplex2D.counts[i])
  },
  '3D': {
    totalVariationDistance: totalVariationDistance(histograms.simplex3D, histograms.value3D),
    chiSquaredPerSample: chiSquaredPerSample(histograms.simplex3D, histograms.value3D),
    perBinCountDelta: histograms.value3D.counts.map((c, i) => c - histograms.simplex3D.counts[i])
  }
};

// --- spectrum ---------------------------------------------------------------

const fftValidation = validateFft(fftSize, 4);

function spectrum2D(noise: (x: number, y: number) => number): ReturnType<typeof radialSpectrum> {
  const signal = new Float64Array(fftSize * fftSize);
  const window = hannWindow(fftSize);
  for (let y = 0; y < fftSize; y++) {
    for (let x = 0; x < fftSize; x++) {
      signal[y * fftSize + x] = noise(x * fftSampleStep, y * fftSampleStep) * window[x] * window[y];
    }
  }
  return radialSpectrum(signal, fftSize, { bandCount, highCutoff: 0.25, axisDegrees: 10 });
}

const spectra = {
  simplex2D: spectrum2D(simplex2D),
  value2D: spectrum2D(value2D)
};

// --- timing (each family/dimension in its own process) ----------------------

function runWorker(script: string, family: string, dim: string): Record<string, number> {
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', path.join(__dirname, script), family, dim],
    { cwd: root, encoding: 'utf8' }
  );
  return JSON.parse(output.trim());
}

const trials: Record<string, unknown>[] = [];
for (let trial = 0; trial < 9; trial++) {
  const trialData: Record<string, unknown> = { trial };
  for (const dim of ['2D', '3D']) {
    // alternate order per trial so thermal/scheduler drift does not favor
    // either family systematically
    const order: Array<'simplex' | 'value'> = trial % 2 === 0 ? ['simplex', 'value'] : ['value', 'simplex'];
    for (const family of order) {
      const result = runWorker('timing-worker.ts', family, dim);
      trialData[`${family}${dim}`] = result;
    }
  }
  trials.push(trialData);
  console.log(`timing trial ${trial} done`);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// The host is deliberately noisy (other tenants on shared cores), so the
// minimum per-call time is the primary metric: it is the sample least
// contaminated by preemption. Medians are reported alongside for transparency.
const aggregate: Record<string, unknown> = {};
for (const dim of ['2D', '3D']) {
  const simplexTrials = trials.map(t => t[`simplex${dim}`] as Record<string, number>);
  const valueTrials = trials.map(t => t[`value${dim}`] as Record<string, number>);
  const simplexMins = simplexTrials.map(r => r.minNsPerCall);
  const valueMins = valueTrials.map(r => r.minNsPerCall);
  const simplexMedians = simplexTrials.map(r => r.medianNsPerCall);
  const valueMedians = valueTrials.map(r => r.medianNsPerCall);
  const ratios = valueMins.map((v, i) => v / simplexMins[i]);
  const medianRatios = valueMedians.map((v, i) => v / simplexMedians[i]);
  const bestSimplex = Math.min(...simplexMins);
  const bestValue = Math.min(...valueMins);
  aggregate[dim] = {
    simplexNsPerCallMin: bestSimplex,
    valueNsPerCallMin: bestValue,
    ratio: bestValue / bestSimplex,
    speedup: bestSimplex / bestValue,
    simplexNsPerCallMedianOfTrialMedians: median(simplexMedians),
    valueNsPerCallMedianOfTrialMedians: median(valueMedians),
    medianRatio: median(valueMedians) / median(simplexMedians),
    perTrialMinRatios: ratios,
    ratioMin: Math.min(...ratios),
    ratioMax: Math.max(...ratios),
    perTrialMedianRatios: medianRatios,
    medianRatioMin: Math.min(...medianRatios),
    medianRatioMax: Math.max(...medianRatios),
    trials: trials.length,
    callsPerBatch: simplexTrials[0].callsPerBatch
  };
}

const microbench: Record<string, unknown>[] = [];
for (const dim of ['2D', '3D']) {
  for (const family of ['simplex', 'value']) {
    microbench.push(runWorker('microbench-worker.ts', family, dim));
  }
}
const microbenchSummary: Record<string, unknown> = {};
for (const dim of ['2D', '3D']) {
  const simplex = microbench.find(r => r.dim === dim && r.family === 'simplex') as Record<string, number>;
  const value = microbench.find(r => r.dim === dim && r.family === 'value') as Record<string, number>;
  microbenchSummary[dim] = {
    simplexNsPerCall: simplex.nsPerCall,
    valueNsPerCall: value.nsPerCall,
    ratio: value.nsPerCall / simplex.nsPerCall,
    speedup: simplex.nsPerCall / value.nsPerCall,
    simplexMinBlockNsPerCall: simplex.minBlockNsPerCall,
    valueMinBlockNsPerCall: value.minBlockNsPerCall,
    minBlockRatio: value.minBlockNsPerCall / simplex.minBlockNsPerCall,
    minBlockSpeedup: simplex.minBlockNsPerCall / value.minBlockNsPerCall,
    totalCalls: simplex.totalCalls
  };
}

// --- write results ----------------------------------------------------------

const result = {
  seed,
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  sampleStep,
  fftSampleStep,
  fieldSizes: { grid2D, grid3D, fft: fftSize },
  fftSelfValidation: fftValidation,
  histograms,
  histogramComparison,
  spectra,
  timing: {
    method: '9 independent OS processes per family/dimension, 120 batches of 4096 (2D) / 13824 (3D) calls after 10 warm-up batches; primary metric is the minimum per-batch ns/call over 9 trials (least preemption-contaminated)',
    aggregate,
    microbench: microbenchSummary,
    perTrial: trials
  }
};

fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(result, null, 2) + '\n');

// Paired samples on identical coordinates at a manageable stride (every 64th
// grid point in 2D, every 16th in 3D) so the displayed fields and the
// histogram/spectrum numbers can be independently recomputed.
{
  const lines = ['dim,x,y,z,simplex,value'];
  for (let i = 0; i < valuesSimplex2D.length; i += 64) {
    const x = (i % grid2D) * sampleStep;
    const y = Math.floor(i / grid2D) * sampleStep;
    lines.push(`2D,${x},${y},,${valuesSimplex2D[i]},${valuesValue2D[i]}`);
  }
  for (let i = 0; i < valuesSimplex3D.length; i += 16) {
    const x = (i % grid3D) * sampleStep;
    const y = (Math.floor(i / grid3D) % grid3D) * sampleStep;
    const z = Math.floor(i / (grid3D * grid3D)) * sampleStep;
    lines.push(`3D,${x},${y},${z},${valuesSimplex3D[i]},${valuesValue3D[i]}`);
  }
  fs.writeFileSync(path.join(outDir, 'paired-samples.csv'), lines.join('\n') + '\n');
}

// pretty summary
const lines = [
  `seed=${seed} node=${process.version} ${process.platform}/${process.arch}`,
  'histograms (32 bins over [-1,1]):',
  ...Object.entries(histograms).map(([name, h]) =>
    `  ${name.padEnd(10)} n=${h.total} min=${h.min.toFixed(6)} max=${h.max.toFixed(6)} ` +
    `mean=${h.mean.toFixed(6)} std=${h.std.toFixed(4)}`),
  'histogram distance vs simplex:',
  `  2D TVD=${histogramComparison['2D'].totalVariationDistance.toFixed(4)} chi2/N=${histogramComparison['2D'].chiSquaredPerSample.toFixed(4)}`,
  `  3D TVD=${histogramComparison['3D'].totalVariationDistance.toFixed(4)} chi2/N=${histogramComparison['3D'].chiSquaredPerSample.toFixed(4)}`,
  'spectrum (2D, 16 radial bands, Hann, step 0.125):',
  `  simplex highFreq=${spectra.simplex2D.highFrequencyFraction.toExponential(3)} axis=${spectra.simplex2D.axisBandFraction.toFixed(4)}`,
  `  value   highFreq=${spectra.value2D.highFrequencyFraction.toExponential(3)} axis=${spectra.value2D.axisBandFraction.toFixed(4)}`,
  'timing (min per-call over 9 independent processes):',
  ...Object.entries(aggregate).map(([dim, a]) => {
    const agg = a as Record<string, number>;
    return `  ${dim} simplex=${agg.simplexNsPerCallMin.toFixed(3)} ns value=${agg.valueNsPerCallMin.toFixed(3)} ns ` +
      `ratio=${agg.ratio.toFixed(3)} speedup=${agg.speedup.toFixed(2)}x ` +
      `(min-trial ratio spread ${agg.ratioMin.toFixed(3)}-${agg.ratioMax.toFixed(3)}, ` +
      `median-based ${agg.medianRatio.toFixed(3)})`;
  }),
  'microbench cross-check:',
  ...Object.entries(microbenchSummary).map(([dim, m]) => {
    const mm = m as Record<string, number>;
    return `  ${dim} simplex=${mm.simplexNsPerCall.toFixed(3)} ns value=${mm.valueNsPerCall.toFixed(3)} ns ` +
      `ratio=${mm.ratio.toFixed(3)} speedup=${mm.speedup.toFixed(2)}x; ` +
      `best-block ratio=${mm.minBlockRatio.toFixed(3)} speedup=${mm.minBlockSpeedup.toFixed(2)}x`;
  })
];
fs.writeFileSync(path.join(outDir, 'timing-aggregate.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
