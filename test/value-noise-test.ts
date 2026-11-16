import { createNoise2D, createNoise3D, createValueNoise2D, createValueNoise3D, buildPermutationTable } from '../simplex-noise';
import alea from 'alea';
import { assert } from 'chai';

import { assertMatchesImage, sampleFunctionToImageData } from './matches-snapshot';

function getRandom(seed = 'seed') {
  return alea(seed);
}

describe('createValueNoise2D', () => {
  it('produces bit-identical output for the same seed', () => {
    const a = createValueNoise2D(getRandom('repro'));
    const b = createValueNoise2D(getRandom('repro'));
    for (let i = 0; i < 1000; i++) {
      const x = (i % 31) * 0.371 - 7.3;
      const y = Math.floor(i / 31) * 0.613 - 3.1;
      assert(Object.is(a(x, y), b(x, y)), `mismatch at ${x},${y}`);
    }
  });

  it('produces different output for a different seed', () => {
    const a = createValueNoise2D(getRandom('A'));
    const b = createValueNoise2D(getRandom('B'));
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      if (!Object.is(a(i * 0.37, i * 0.11), b(i * 0.37, i * 0.11))) differences++;
    }
    assert.isAbove(differences, 90);
  });

  it('returns the same value for the same input', () => {
    const n = createValueNoise2D(getRandom());
    assert.equal(n(0.1, 0.2), n(0.1, 0.2));
  });

  it('returns a different value for a different input', () => {
    const n = createValueNoise2D(getRandom());
    assert.notEqual(n(0.1, 0.2), n(0.101, 0.202));
  });

  it('returns values in [-1, 1]', () => {
    const n = createValueNoise2D(getRandom());
    for (let y = -20; y < 20; y += 0.37) {
      for (let x = -20; x < 20; x += 0.37) {
        const v = n(x, y);
        assert(v >= -1 && v <= 1, `${v} out of range at ${x},${y}`);
      }
    }
  });

  it('is continuous in value and first derivative across lattice boundaries', () => {
    const n = createValueNoise2D(getRandom());
    const h = 1e-7;
    for (let i = -3; i <= 3; i++) {
      const left = n(i - h, 0.37);
      const right = n(i + h, 0.37);
      assert(Math.abs(left - right) < 1e-5, `value jump at x=${i}`);
      const dLeft = (n(i - 1e-4, 0.37) - n(i - 2e-4, 0.37)) / 1e-4;
      const dRight = (n(i + 2e-4, 0.37) - n(i + 1e-4, 0.37)) / 1e-4;
      assert(Math.abs(dLeft - dRight) < 1e-2, `derivative jump at x=${i}: ${dLeft} vs ${dRight}`);
    }
  });

  it('is periodic with period 256', () => {
    const n = createValueNoise2D(getRandom());
    for (let i = 0; i < 20; i++) {
      const x = i * 0.377 - 3.4;
      const y = i * 0.211 + 1.7;
      // exact in the mathematics, equal up to floating point rounding at the
      // larger coordinate magnitude
      assert.closeTo(n(x + 256, y), n(x, y), 1e-12);
      assert.closeTo(n(x, y - 256), n(x, y), 1e-12);
    }
  });

  it('hits exactly -1 and +1 at lattice points', () => {
    const perm = buildPermutationTable(getRandom('lattice'));
    const n = createValueNoise2D(getRandom('lattice'));
    const value = (byte: number) => byte / 127.5 - 1.0;
    // x=0, y=0 hashes to the corner index perm[0], and the value table maps
    // that index's permutation byte onto [-1, 1]
    assert.equal(n(0, 0), value(perm[perm[0]]));
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 256; i++) {
      const v = n(i, 0);
      if (v === -1) sawMin = true;
      if (v === 1) sawMax = true;
    }
    assert(sawMin, 'expected a lattice sample of exactly -1');
    assert(sawMax, 'expected a lattice sample of exactly 1');
  });

  it('defaults to Math.random without throwing', () => {
    const n = createValueNoise2D();
    const v = n(0.1, 0.2);
    assert.isFinite(v);
  });

  it('throws when the random argument is not a function', () => {
    assert.throws(() => createValueNoise2D('nope' as unknown as () => number), TypeError);
    assert.throws(() => createValueNoise2D(null as unknown as () => number), TypeError);
  });

  it('treats NaN and infinity coordinates as non-finite without throwing', () => {
    const n = createValueNoise2D(getRandom());
    assert.isNaN(n(NaN, 0));
    assert.isNaN(n(0, NaN));
    assert.isFalse(Number.isFinite(n(Infinity, 0)));
    assert.isFalse(Number.isFinite(n(-Infinity, 0.5)));
  });

  it('matches snapshot for small inputs', () => {
    const n = createValueNoise2D(getRandom());
    const size = 64;
    const actual = sampleFunctionToImageData((x, y) => n(x * 2, y * 2) * 128 + 127, size, size);
    assertMatchesImage(actual, 'valueNoise2Dsmall.png');
  });

  it('matches snapshot for large inputs', () => {
    const n = createValueNoise2D(getRandom());
    const size = 64;
    const actual = sampleFunctionToImageData((x, y) => n(x * 1000, y * 1000) * 128 + 127, size, size);
    assertMatchesImage(actual, 'valueNoise2Dlarge.png');
  });
});

describe('createValueNoise3D', () => {
  it('produces bit-identical output for the same seed', () => {
    const a = createValueNoise3D(getRandom('repro3'));
    const b = createValueNoise3D(getRandom('repro3'));
    for (let i = 0; i < 1000; i++) {
      const x = (i % 31) * 0.371 - 7.3;
      const y = Math.floor(i / 31) * 0.613 - 3.1;
      const z = i * 0.137 - 5.1;
      assert(Object.is(a(x, y, z), b(x, y, z)), `mismatch at ${x},${y},${z}`);
    }
  });

  it('produces different output for a different seed', () => {
    const a = createValueNoise3D(getRandom('A'));
    const b = createValueNoise3D(getRandom('B'));
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      if (!Object.is(a(i * 0.37, i * 0.11, i * 0.53), b(i * 0.37, i * 0.11, i * 0.53))) differences++;
    }
    assert.isAbove(differences, 90);
  });

  it('returns the same value for the same input', () => {
    const n = createValueNoise3D(getRandom());
    assert.equal(n(0.1, 0.2, 0.3), n(0.1, 0.2, 0.3));
  });

  it('returns a different value for a different input', () => {
    const n = createValueNoise3D(getRandom());
    assert.notEqual(n(0.1, 0.2, 0.3), n(0.101, 0.202, 0.303));
  });

  it('returns values in [-1, 1]', () => {
    const n = createValueNoise3D(getRandom());
    for (let z = -10; z < 10; z += 0.91) {
      for (let y = -10; y < 10; y += 0.91) {
        for (let x = -10; x < 10; x += 0.91) {
          const v = n(x, y, z);
          assert(v >= -1 && v <= 1, `${v} out of range at ${x},${y},${z}`);
        }
      }
    }
  });

  it('is continuous in value and first derivative across lattice boundaries', () => {
    const n = createValueNoise3D(getRandom());
    const h = 1e-7;
    for (let i = -3; i <= 3; i++) {
      const left = n(i - h, 0.37, 0.81);
      const right = n(i + h, 0.37, 0.81);
      assert(Math.abs(left - right) < 1e-5, `value jump at x=${i}`);
      const dLeft = (n(i - 1e-4, 0.37, 0.81) - n(i - 2e-4, 0.37, 0.81)) / 1e-4;
      const dRight = (n(i + 2e-4, 0.37, 0.81) - n(i + 1e-4, 0.37, 0.81)) / 1e-4;
      assert(Math.abs(dLeft - dRight) < 1e-2, `derivative jump at x=${i}: ${dLeft} vs ${dRight}`);
    }
  });

  it('is periodic with period 256', () => {
    const n = createValueNoise3D(getRandom());
    for (let i = 0; i < 20; i++) {
      const x = i * 0.377 - 3.4;
      const y = i * 0.211 + 1.7;
      const z = i * 0.923 - 2.2;
      assert.closeTo(n(x + 256, y, z + 256), n(x, y, z), 1e-12);
    }
  });

  it('defaults to Math.random without throwing', () => {
    const n = createValueNoise3D();
    assert.isFinite(n(0.1, 0.2, 0.3));
  });

  it('throws when the random argument is not a function', () => {
    assert.throws(() => createValueNoise3D(42 as unknown as () => number), TypeError);
    assert.throws(() => createValueNoise3D(null as unknown as () => number), TypeError);
  });

  it('treats NaN and infinity coordinates as non-finite without throwing', () => {
    const n = createValueNoise3D(getRandom());
    assert.isNaN(n(NaN, 0, 0));
    assert.isNaN(n(0, 0, NaN));
    assert.isFalse(Number.isFinite(n(0, 0, Infinity)));
    assert.isFalse(Number.isFinite(n(-Infinity, 0, 0)));
  });

  it('matches snapshot for small inputs', () => {
    const n = createValueNoise3D(getRandom());
    const size = 64;
    const actual = sampleFunctionToImageData((x, y) => n(x * 2, y * 2, x + y) * 128 + 127, size, size);
    assertMatchesImage(actual, 'valueNoise3Dsmall.png');
  });

  it('matches snapshot for large inputs', () => {
    const n = createValueNoise3D(getRandom());
    const size = 64;
    const actual = sampleFunctionToImageData((x, y) => n(x * 1000, y * 1000, (x + y) * 500) * 128 + 127, size, size);
    assertMatchesImage(actual, 'valueNoise3Dlarge.png');
  });
});

describe('value noise vs simplex noise', () => {
  it('consumes the same permutation stream as simplex for the same seed', () => {
    // both families build their tables from a single buildPermutationTable call,
    // so the same seed gives the same underlying hash
    const perm = buildPermutationTable(getRandom('shared'));
    const n = createValueNoise2D(getRandom('shared'));
    const value = (byte: number) => byte / 127.5 - 1.0;
    const corner = (3 & 255) + perm[7 & 255];
    assert.equal(n(3, 7), value(perm[corner]));
    assert.equal(n(3, 7), createValueNoise2D(getRandom('shared'))(3, 7));
    // and simplex still works off the same table without interference
    assert.isFinite(createNoise2D(getRandom('shared'))(3, 7));
    assert.isFinite(createNoise3D(getRandom('shared'))(3, 7, 1));
  });

  it('is not bit-identical to simplex noise (distinct field)', () => {
    const v = createValueNoise2D(getRandom('compare'));
    const s = createNoise2D(getRandom('compare'));
    let identical = 0;
    for (let i = 0; i < 100; i++) {
      if (Object.is(v(i * 0.37, i * 0.11), s(i * 0.37, i * 0.11))) identical++;
    }
    assert.isBelow(identical, 5);
    const v3 = createValueNoise3D(getRandom('compare'));
    const s3 = createNoise3D(getRandom('compare'));
    for (let i = 0; i < 100; i++) {
      assert.isFalse(Object.is(v3(i * 0.37, i * 0.11, i * 0.53), s3(i * 0.37, i * 0.11, i * 0.53)));
    }
  });
});
