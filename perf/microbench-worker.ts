/**
 * An independent microbenchmark with a different loop shape and a different
 * seed, used as a cross-check on the batch-timing numbers. Each family and
 * dimension runs in its own OS process.
 *
 * Usage: node --import tsx perf/microbench-worker.ts <simplex|value> <2D|3D>
 */
import alea from 'alea';
import { createNoise2D, createNoise3D, createValueNoise2D, createValueNoise3D } from '../simplex-noise';

const family = process.argv[2];
const dim = process.argv[3];

if ((family !== 'simplex' && family !== 'value') || (dim !== '2D' && dim !== '3D')) {
  console.error('usage: microbench-worker.ts <simplex|value> <2D|3D>');
  process.exit(2);
}

const blocks = 400;
const iterationsPerBlock = 20000;
const seed = 'microbench-seed';

const noise2 = family === 'simplex'
  ? createNoise2D(alea(seed))
  : createValueNoise2D(alea(seed));
const noise3 = family === 'simplex'
  ? createNoise3D(alea(seed))
  : createValueNoise3D(alea(seed));

const f = dim === '2D'
  ? (x: number, y: number): number => noise2(x, y)
  : (x: number, y: number, z: number): number => noise3(x, y, z);

let sink = 0;
// a sequential walk with a per-iteration fractional step, dissimilar to the
// batch timing loop which walks a fixed precomputed grid
function runBlock(block: number): void {
  let x = block * 0.001;
  let y = -block * 0.002;
  let z = block * 0.003;
  for (let i = 0; i < iterationsPerBlock; i++) {
    sink += dim === '2D' ? f(x, y, 0) : f(x, y, z);
    x += 0.0001;
    y += 0.0002;
    z += 0.0003;
  }
}

for (let i = 0; i < 5; i++) runBlock(i);

const timings: number[] = [];
for (let i = 0; i < blocks; i++) {
  const start = process.hrtime.bigint();
  runBlock(i);
  timings.push(Number(process.hrtime.bigint() - start));
}
const sorted = [...timings].sort((a, b) => a - b);
const elapsed = timings.reduce((a, b) => a + b, 0);

process.stdout.write(JSON.stringify({
  family,
  dim,
  blocks,
  iterationsPerBlock,
  totalCalls: blocks * iterationsPerBlock,
  nsPerCall: elapsed / (blocks * iterationsPerBlock),
  minBlockNsPerCall: sorted[0] / iterationsPerBlock,
  p10BlockNsPerCall: sorted[Math.floor(sorted.length * 0.1)] / iterationsPerBlock,
  medianBlockNsPerCall: sorted[Math.floor(sorted.length / 2)] / iterationsPerBlock,
  sink
}) + '\n');
