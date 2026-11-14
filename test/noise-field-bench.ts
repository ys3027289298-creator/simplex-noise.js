// Benchmark: legacy factories vs the new configurable field object.
// Run with: npx tsx test/noise-field-bench.ts
// Works both before the refactor (legacy rows only) and after (all rows).
import * as lib from '../simplex-noise';
import alea from 'alea';

const ITERATIONS = 1_000_000;
const REPEATS = 5;

function bench(label: string, fn: (i: number) => number): number {
  // warmup
  let sink = 0;
  for (let i = 0; i < 50_000; i++) sink += fn(i);
  let best = Infinity;
  for (let r = 0; r < REPEATS; r++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < ITERATIONS; i++) {
      sink += fn(i);
    }
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    best = Math.min(best, elapsed);
  }
  if (sink === 42) console.log('impossible', sink); // keep the loop alive
  const nsPerOp = (best * 1e6) / ITERATIONS;
  console.log(`${label.padEnd(34)} ${nsPerOp.toFixed(1).padStart(9)} ns/op  ${(1e9 / nsPerOp / 1e6).toFixed(2).padStart(8)} M ops/s`);
  return nsPerOp;
}

const random = () => alea('bench');

console.log(`iterations=${ITERATIONS} repeats=${REPEATS} (best of)`);
const legacy2 = lib.createNoise2D(random());
const legacy3 = lib.createNoise3D(random());
const legacy4 = lib.createNoise4D(random());
const l2 = bench('legacy createNoise2D', (i) => legacy2(i * 0.01, i * 0.02));
const l3 = bench('legacy createNoise3D', (i) => legacy3(i * 0.01, i * 0.02, i * 0.03));
const l4 = bench('legacy createNoise4D', (i) => legacy4(i * 0.01, i * 0.02, i * 0.03, i * 0.04));
console.log(`legacy 4D/2D ratio: ${(l4 / l2).toFixed(2)}x  3D/2D: ${(l3 / l2).toFixed(2)}x`);

const createNoiseField = (lib as Record<string, unknown>).createNoiseField as
  | ((o: { dimensions: 2 | 3 | 4; octaves?: number; random?: () => number }) => { sample: (...c: number[]) => number })
  | undefined;

if (createNoiseField) {
  const f2 = createNoiseField({ dimensions: 2, random: random() });
  const f3 = createNoiseField({ dimensions: 3, random: random() });
  const f4 = createNoiseField({ dimensions: 4, random: random() });
  const f4o4 = createNoiseField({ dimensions: 4, octaves: 4, random: random() });
  const n2 = bench('field 2D octaves=1', (i) => f2.sample(i * 0.01, i * 0.02));
  const n3 = bench('field 3D octaves=1', (i) => f3.sample(i * 0.01, i * 0.02, i * 0.03));
  const n4 = bench('field 4D octaves=1', (i) => f4.sample(i * 0.01, i * 0.02, i * 0.03, i * 0.04));
  bench('field 4D octaves=4', (i) => f4o4.sample(i * 0.01, i * 0.02, i * 0.03, i * 0.04));
  console.log(`field  4D/2D ratio: ${(n4 / n2).toFixed(2)}x  3D/2D: ${(n3 / n2).toFixed(2)}x  (requirement: <= 6x)`);
  console.log(`new-vs-legacy overhead 2D: ${(n2 / l2).toFixed(2)}x  3D: ${(n3 / l3).toFixed(2)}x  4D: ${(n4 / l4).toFixed(2)}x`);
} else {
  console.log('createNoiseField not present yet (pre-refactor baseline)');
}
