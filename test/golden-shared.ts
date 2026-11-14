// Shared deterministic sampling logic for the legacy bitwise-consistency check.
// capture-golden.ts runs this against the pre-refactor library and stores the
// exact float64 bit patterns; noise-field-test.ts re-runs it after the refactor
// and requires every bit to be identical.
import { createNoise2D, createNoise3D, createNoise4D } from '../simplex-noise';
import alea from 'alea';

const f64 = new Float64Array(1);
const u8 = new Uint8Array(f64.buffer);

export function bitsOf(value: number): string {
  f64[0] = value;
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += u8[i].toString(16).padStart(2, '0');
  }
  return out;
}

export const GOLDEN_SEEDS = ['seed', 'other seed'];
export const GOLDEN_SAMPLES_PER_SEED = 256;

function inputCoordinates(count: number, dims: number): number[][] {
  const rng = alea('golden-inputs-v1');
  const coords: number[][] = [];
  const specials = [0, -0.1, 0.1, 1, -1, 0.5, -0.5, 1000.25, -1000.75, 5e9, -5e9, 1e-9, 123456.789];
  for (const s of specials) {
    coords.push(Array.from({ length: dims }, (_, i) => s * (i + 1)));
  }
  for (let i = 0; i < count; i++) {
    const scale = [1, 100, 1e6, 5e9][i % 4];
    coords.push(Array.from({ length: dims }, () => (rng() * 2 - 1) * scale));
  }
  return coords;
}

export interface GoldenData {
  description: string;
  seeds: string[];
  samplesPerSeed: number;
  results: Record<string, Record<string, string[]>>;
}

export function computeGolden(): GoldenData {
  const results: Record<string, Record<string, string[]>> = {};
  const factories: Array<[string, (random: () => number) => (...coords: number[]) => number, number]> = [
    ['2D', createNoise2D, 2],
    ['3D', createNoise3D, 3],
    ['4D', createNoise4D, 4],
  ];
  for (const [name, create, dims] of factories) {
    results[name] = {};
    for (const seed of GOLDEN_SEEDS) {
      const noise = create(alea(seed));
      const coords = inputCoordinates(GOLDEN_SAMPLES_PER_SEED, dims);
      results[name][seed] = coords.map((c) => bitsOf(noise(...c)));
    }
  }
  return {
    description: 'float64 bit patterns (little-endian hex) of the legacy createNoise2D/3D/4D outputs',
    seeds: GOLDEN_SEEDS,
    samplesPerSeed: GOLDEN_SAMPLES_PER_SEED,
    results,
  };
}
