// Verification for the configurable noise field and the bitwise
// backwards compatibility of the legacy factories.
// Run with: npx mocha --require ts-node/register test/noise-field-test.ts
import { createNoise2D, createNoise3D, createNoise4D, createNoiseField, MAX_FIELD_OCTAVES } from '../simplex-noise';
import { computeGolden, GoldenData } from './golden-shared';
import alea from 'alea';
import { assert } from 'chai';
import fs from 'fs';
import path from 'path';

const golden: GoldenData = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden-noise.json'), 'utf8'));

// helper to pass intentionally invalid values without tripping the type checker
const bad = (v: unknown) => v as never;

describe('legacy bitwise consistency (golden)', () => {
  const actual = computeGolden();
  for (const dim of ['2D', '3D', '4D']) {
    for (const seed of golden.seeds) {
      it(`${dim} seed=${seed} outputs are bit-identical to the pre-refactor baseline`, () => {
        assert.deepEqual(actual.results[dim][seed], golden.results[dim][seed]);
      });
    }
  }
});

describe('createNoiseField', () => {
  describe('configuration validation (failure paths)', () => {
    it('rejects non-object options', () => {
      assert.throws(() => createNoiseField(bad(null)), TypeError, /options must be an object/);
      assert.throws(() => createNoiseField(bad(42)), TypeError, /options must be an object/);
    });
    it('rejects unsupported dimensions', () => {
      assert.throws(() => createNoiseField({ dimensions: bad(1) }), RangeError, /dimensions must be 2, 3 or 4, got 1/);
      assert.throws(() => createNoiseField({ dimensions: bad(5) }), RangeError, /dimensions must be 2, 3 or 4, got 5/);
      assert.throws(() => createNoiseField({ dimensions: bad(2.5) }), RangeError, /dimensions must be 2, 3 or 4, got 2.5/);
    });
    it('rejects invalid octaves', () => {
      assert.throws(() => createNoiseField({ octaves: 0 }), RangeError, /octaves must be an integer between 1 and/);
      assert.throws(() => createNoiseField({ octaves: -3 }), RangeError, /octaves must be an integer between 1 and/);
      assert.throws(() => createNoiseField({ octaves: 1.5 }), RangeError, /octaves must be an integer between 1 and/);
      assert.throws(() => createNoiseField({ octaves: NaN }), RangeError, /octaves must be an integer between 1 and/);
      assert.throws(() => createNoiseField({ octaves: MAX_FIELD_OCTAVES + 1 }), RangeError, /octaves must be an integer between 1 and/);
      assert.throws(() => createNoiseField({ octaves: bad('4') }), TypeError, /octaves must be a number/);
    });
    it('rejects invalid lacunarity', () => {
      assert.throws(() => createNoiseField({ lacunarity: 0 }), RangeError, /lacunarity must be a positive finite number/);
      assert.throws(() => createNoiseField({ lacunarity: -2 }), RangeError, /lacunarity must be a positive finite number/);
      assert.throws(() => createNoiseField({ lacunarity: NaN }), RangeError, /lacunarity must be a positive finite number/);
      assert.throws(() => createNoiseField({ lacunarity: Infinity }), RangeError, /lacunarity must be a positive finite number/);
      assert.throws(() => createNoiseField({ lacunarity: bad('2') }), TypeError, /lacunarity must be a number/);
    });
    it('rejects invalid gain', () => {
      assert.throws(() => createNoiseField({ gain: NaN }), RangeError, /gain must be a finite number/);
      assert.throws(() => createNoiseField({ gain: Infinity }), RangeError, /gain must be a finite number/);
      assert.throws(() => createNoiseField({ gain: bad('0.5') }), TypeError, /gain must be a number/);
    });
    it('rejects a non-function random', () => {
      assert.throws(() => createNoiseField({ random: bad('seed') }), TypeError, /random must be a function/);
    });
    it('rejects non-finite or missing coordinates at sample time', () => {
      const field2 = createNoiseField({ dimensions: 2, random: alea('coords') });
      const field3 = createNoiseField({ dimensions: 3, random: alea('coords') });
      const field4 = createNoiseField({ dimensions: 4, random: alea('coords') });
      assert.throws(() => field2.sample(NaN, 0), RangeError, /coordinate x must be finite/);
      assert.throws(() => field2.sample(0, Infinity), RangeError, /coordinate y must be finite/);
      assert.throws(() => field3.sample(0, 0, NaN), RangeError, /coordinate z must be finite/);
      assert.throws(() => field4.sample(0, 0, 0, -Infinity), RangeError, /coordinate w must be finite/);
      assert.throws(() => field3.sample(0, 0), TypeError, /coordinate z must be a number/);
      assert.throws(() => field4.sample(0, 0, 0), TypeError, /coordinate w must be a number/);
      assert.throws(() => field2.sample(bad('0.1'), 0), TypeError, /coordinate x must be a number/);
    });
    it('rejects unsupported dimensions in forDimensions', () => {
      const field = createNoiseField({ random: alea('fd') });
      assert.throws(() => field.forDimensions(bad(7)), RangeError, /dimensions must be 2, 3 or 4, got 7/);
    });
  });

  describe('defaults and configuration echo', () => {
    it('defaults to 2 dimensions, 1 octave, lacunarity 2, gain 0.5', () => {
      const field = createNoiseField({ random: alea('defaults') });
      assert.strictEqual(field.dimensions, 2);
      assert.strictEqual(field.octaves, 1);
      assert.strictEqual(field.lacunarity, 2);
      assert.strictEqual(field.gain, 0.5);
    });
    it('echoes the given configuration', () => {
      const field = createNoiseField({ dimensions: 4, octaves: 5, lacunarity: 2.5, gain: 0.4, random: alea('echo') });
      assert.strictEqual(field.dimensions, 4);
      assert.strictEqual(field.octaves, 5);
      assert.strictEqual(field.lacunarity, 2.5);
      assert.strictEqual(field.gain, 0.4);
    });
  });

  describe('sampling', () => {
    it('is deterministic for the same seed', () => {
      const a = createNoiseField({ dimensions: 3, octaves: 4, random: alea('det') });
      const b = createNoiseField({ dimensions: 3, octaves: 4, random: alea('det') });
      assert.strictEqual(a.sample(0.1, 0.2, 0.3), b.sample(0.1, 0.2, 0.3));
    });
    it('differs for different seeds', () => {
      const a = createNoiseField({ dimensions: 3, random: alea('seed-a') });
      const b = createNoiseField({ dimensions: 3, random: alea('seed-b') });
      assert.notStrictEqual(a.sample(0.1, 0.2, 0.3), b.sample(0.1, 0.2, 0.3));
    });
    it('consumes the random function exactly once', () => {
      let calls = 0;
      const random = () => { calls++; return 0.42; };
      createNoiseField({ dimensions: 4, random });
      assert.strictEqual(calls, 1);
    });
    it('stays within [-1, 1] for all dimensions and octave counts', () => {
      for (const dimensions of [2, 3, 4] as const) {
        for (const octaves of [1, 2, 5, MAX_FIELD_OCTAVES]) {
          const field = createNoiseField({ dimensions, octaves, random: alea(`range-${dimensions}-${octaves}`) });
          for (let i = 0; i < 200; i++) {
            const v = field.sample(i * 0.37, i * 0.11 - 3, i * 0.05 + 1, i * 0.02);
            assert(v >= -1 && v <= 1, `dim=${dimensions} octaves=${octaves} i=${i} v=${v}`);
          }
        }
      }
    });
    it('stacks octaves with lacunarity and gain in one sample (bit-exact fBm)', () => {
      const seed = 'octave-stack';
      const base = createNoiseField({ dimensions: 2, random: alea(seed) });
      const stacked = createNoiseField({ dimensions: 2, octaves: 3, lacunarity: 2.5, gain: 0.4, random: alea(seed) });
      for (const [x, y] of [[0.1, 0.2], [-3.7, 8.2], [1000.5, -999.25]]) {
        let amplitude = 1;
        let frequency = 1;
        let sum = 0;
        let normalization = 0;
        for (let o = 0; o < 3; o++) {
          sum += amplitude * base.sample(x * frequency, y * frequency);
          normalization += amplitude;
          amplitude *= 0.4;
          frequency *= 2.5;
        }
        assert.strictEqual(stacked.sample(x, y), sum / normalization);
      }
    });
  });

  describe('cross-dimension seed isolation', () => {
    it('same seed produces different values in every dimension', () => {
      const f2 = createNoiseField({ dimensions: 2, random: alea('iso') });
      const f3 = createNoiseField({ dimensions: 3, random: alea('iso') });
      const f4 = createNoiseField({ dimensions: 4, random: alea('iso') });
      for (let i = 0; i < 100; i++) {
        const x = i * 0.13 - 5;
        const y = i * 0.29 + 2;
        assert.notStrictEqual(f2.sample(x, y), f3.sample(x, y, 0));
        assert.notStrictEqual(f3.sample(x, y, x - y), f4.sample(x, y, x - y, 0));
      }
    });
    it('same seed produces statistically uncorrelated fields across dimensions', () => {
      const pairs: Array<[number[], number[]]> = [];
      const f2 = createNoiseField({ dimensions: 2, random: alea('corr') });
      const f3 = createNoiseField({ dimensions: 3, random: alea('corr') });
      const f4 = createNoiseField({ dimensions: 4, random: alea('corr') });
      const a23: number[] = [];
      const b23: number[] = [];
      const a34: number[] = [];
      const b34: number[] = [];
      const points = alea('corr-points');
      for (let i = 0; i < 2000; i++) {
        const x = (points() * 2 - 1) * 100;
        const y = (points() * 2 - 1) * 100;
        a23.push(f2.sample(x, y));
        b23.push(f3.sample(x, y, 0));
        a34.push(f3.sample(x, y, x * 0.5));
        b34.push(f4.sample(x, y, x * 0.5, 0));
      }
      pairs.push([a23, b23], [a34, b34]);
      for (const [a, b] of pairs) {
        const meanA = a.reduce((s, v) => s + v, 0) / a.length;
        const meanB = b.reduce((s, v) => s + v, 0) / b.length;
        let cov = 0;
        let varA = 0;
        let varB = 0;
        for (let i = 0; i < a.length; i++) {
          cov += (a[i] - meanA) * (b[i] - meanB);
          varA += (a[i] - meanA) ** 2;
          varB += (b[i] - meanB) ** 2;
        }
        const r = cov / Math.sqrt(varA * varB);
        assert(Math.abs(r) < 0.1, `correlation ${r} should be near zero`);
      }
    });
    it('dimension switching is deterministic and order independent', () => {
      const field = createNoiseField({ dimensions: 2, octaves: 3, random: alea('switch') });
      const roundTrip = field.forDimensions(4).forDimensions(2);
      assert.strictEqual(field.sample(1.1, 2.2), roundTrip.sample(1.1, 2.2));
      const direct4 = createNoiseField({ dimensions: 4, octaves: 3, random: alea('switch') });
      assert.strictEqual(field.forDimensions(4).sample(1, 2, 3, 4), direct4.sample(1, 2, 3, 4));
      const via3 = field.forDimensions(3).forDimensions(4);
      assert.strictEqual(via3.sample(1, 2, 3, 4), direct4.sample(1, 2, 3, 4));
    });
    it('forDimensions inherits the octave configuration', () => {
      const field = createNoiseField({ dimensions: 2, octaves: 6, lacunarity: 1.9, gain: 0.7, random: alea('inherit') });
      const derived = field.forDimensions(3);
      assert.strictEqual(derived.dimensions, 3);
      assert.strictEqual(derived.octaves, 6);
      assert.strictEqual(derived.lacunarity, 1.9);
      assert.strictEqual(derived.gain, 0.7);
    });
  });

  describe('legacy factories are untouched', () => {
    it('legacy factories still exist and are callable', () => {
      assert.strictEqual(typeof createNoise2D, 'function');
      assert.strictEqual(typeof createNoise3D, 'function');
      assert.strictEqual(typeof createNoise4D, 'function');
      assert.strictEqual(typeof createNoise2D(alea('arity'))(0.1, 0.2), 'number');
      assert.strictEqual(typeof createNoise3D(alea('arity'))(0.1, 0.2, 0.3), 'number');
      assert.strictEqual(typeof createNoise4D(alea('arity'))(0.1, 0.2, 0.3, 0.4), 'number');
    });
  });
});
