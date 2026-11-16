/**
 * Times one family in one dimension in its own OS process.
 *
 * Usage: node --import tsx perf/timing-worker.ts <simplex|value> <2D|3D>
 * Emits a single JSON object on stdout.
 */
import alea from 'alea';
import { createNoise2D, createNoise3D, createValueNoise2D, createValueNoise3D } from '../simplex-noise';

const family = process.argv[2];
const dim = process.argv[3];

if ((family !== 'simplex' && family !== 'value') || (dim !== '2D' && dim !== '3D')) {
  console.error('usage: timing-worker.ts <simplex|value> <2D|3D>');
  process.exit(2);
}

const tile = dim === '2D' ? 64 : 24;
const callsPerBatch = tile ** (dim === '2D' ? 2 : 3);
const batchCount = 120;
const warmupBatches = 10;

// fresh, identically seeded PRNG for every family so the construction cost and
// the table content are matched
const seed = 'timing-seed';
const noise = dim === '2D'
  ? (family === 'simplex' ? createNoise2D(alea(seed)) : createValueNoise2D(alea(seed)))
  : (family === 'simplex' ? createNoise3D(alea(seed)) : createValueNoise3D(alea(seed)));

// precompute the identical coordinate grid every family walks
const coords = new Float64Array(callsPerBatch * (dim === '2D' ? 2 : 3));
let c = 0;
if (dim === '2D') {
  for (let y = 0; y < tile; y++) {
    for (let x = 0; x < tile; x++) {
      coords[c++] = x * 0.0625 - 2.0;
      coords[c++] = y * 0.0625 - 2.0;
    }
  }
} else {
  for (let z = 0; z < tile; z++) {
    for (let y = 0; y < tile; y++) {
      for (let x = 0; x < tile; x++) {
        coords[c++] = x * 0.0625 - 2.0;
        coords[c++] = y * 0.0625 - 2.0;
        coords[c++] = z * 0.0625 - 2.0;
      }
    }
  }
}

let sink = 0;

function runBatch(): void {
  if (dim === '2D') {
    const f = noise as (x: number, y: number) => number;
    for (let i = 0, p = 0; i < callsPerBatch; i++, p += 2) {
      sink += f(coords[p], coords[p + 1]);
    }
  } else {
    const f = noise as (x: number, y: number, z: number) => number;
    for (let i = 0, p = 0; i < callsPerBatch; i++, p += 3) {
      sink += f(coords[p], coords[p + 1], coords[p + 2]);
    }
  }
}

for (let i = 0; i < warmupBatches; i++) runBatch();

const batchTimesNs: number[] = [];
for (let i = 0; i < batchCount; i++) {
  const start = process.hrtime.bigint();
  runBatch();
  const end = process.hrtime.bigint();
  batchTimesNs.push(Number(end - start));
}

const sorted = [...batchTimesNs].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];

process.stdout.write(JSON.stringify({
  family,
  dim,
  tile,
  callsPerBatch,
  batches: batchCount,
  warmupBatches,
  totalCalls: callsPerBatch * batchCount,
  medianNsPerBatch: median,
  medianNsPerCall: median / callsPerBatch,
  minNsPerCall: sorted[0] / callsPerBatch,
  p10NsPerCall: sorted[Math.floor(sorted.length * 0.1)] / callsPerBatch,
  p90NsPerCall: sorted[Math.floor(sorted.length * 0.9)] / callsPerBatch,
  batchTimesNs,
  sink
}) + '\n');
