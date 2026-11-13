import {
  buildPermutationTable,
  createNoise2D,
  createNoise3D,
  createNoise4D,
  smoothstep,
  quintic,
} from '../simplex-noise';
import alea from 'alea';
import { assert } from 'chai';


import { assertMatchesImage, sampleFunctionToImageDataOne } from './matches-snapshot';

function getRandom(seed = 'seed') {
  return alea(seed);
}

const mathRandom = Math.random;

beforeEach(() => {
  Math.random = getRandom('Math.random');
});

afterEach(() => {
  Math.random = mathRandom;
});

describe('buildPermutationTable', function () {
  it('first half contains all indices exactly once', function () {
    const table = buildPermutationTable(getRandom());
    const firstHalf = Array.prototype.slice.call(table, 0, table.length / 2);
    for (let i = 0; i < firstHalf.length / 2; i++) {
      assert.include(firstHalf, i);
    }
  });
  it('is shuffled', function () {
    const tableA = buildPermutationTable(getRandom('A'));
    const tableB = buildPermutationTable(getRandom('B'));
    assert.notDeepEqual(tableA, tableB);
  });
  it('second half mirrors first half', function () {
    const table = buildPermutationTable(getRandom());
    const firstHalf = Array.prototype.slice.call(table, 0, table.length / 2);
    const secondHalf = Array.prototype.slice.call(table, table.length / 2);
    assert.deepEqual(firstHalf, secondHalf);
  });
  it('can contain 0 in the first position', function () {
    function zero() { return 0; }
    const table = buildPermutationTable(zero);
    const aTable = Array.prototype.slice.call(table);
    for (let i = 0; i < aTable.length; i++) {
      assert.equal(aTable[i], i & 255);
    }
  });
  it('matches snapshot', function () {
    const table = buildPermutationTable(getRandom());

    const actual = { width: 16, height: 16, data: new Uint8ClampedArray(table.slice(0, 256)) };
    assertMatchesImage(actual, 'permutationTable.png');

    const actual512 = { width: 16, height: 32, data: new Uint8ClampedArray(table) };
    assertMatchesImage(actual512, 'permutationTable512.png');
  });
});

describe('createNoise2D', () => {
  const noise2D = createNoise2D(getRandom());
  describe('noise2D', () => {
    it('is initialized randomly without arguments', function () {
      const noise2DA = createNoise2D();
      const noise2DB = createNoise2D();
      assert.notEqual(noise2DA(0.1, 0.1), noise2DB(0.0, 0.1));
    });
    it('should return the same value for the same input', function () {
      assert.equal(noise2D(0.1, 0.2), noise2D(0.1, 0.2));
    });
    it('should return a different value for a different input', function () {
      assert.notEqual(noise2D(0.1, 0.2), noise2D(0.101, 0.202));
    });
    it('should return the same output with the same seed', function () {
      const noise2D2 = createNoise2D(getRandom());
      assert.equal(noise2D(0.1, 0.2), noise2D2(0.1, 0.2));
    });
    it('should return a different output with a different seed', function () {
      const noise2D2 = createNoise2D(getRandom('other seed'));
      assert.notEqual(noise2D(0.1, 0.2), noise2D2(0.1, 0.2));
    });
    it('should return values between -1 and 1', function () {
      for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 10; y++) {
          assert(noise2D(x / 5, y / 5) >= -1);
          assert(noise2D(x / 5, y / 5) <= 1);
        }
      }
    });
    it('should return similar values for similar inputs', function () {
      assert(Math.abs(noise2D(0.1, 0.2) - noise2D(0.101, 0.202)) < 0.1);
    });
    it('should match snapshot for small inputs', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => noise2D(x * 2, y * 2), size, size);
      assertMatchesImage(actual, 'noise2Dsmall.png');
    });
    it('should match snapshot for large inputs', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => noise2D(x * 1000, y * 1000), size, size);
      assertMatchesImage(actual, 'noise2Dlarge.png');
    });
    it('should match snapshot for gigantic inputs', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => noise2D(x * 5e9, y * 5e9), size, size);
      assertMatchesImage(actual, 'noise2Dgiga.png');
    });
  });
});

describe('createNoise3D', () => {
  const noise3D = createNoise3D(getRandom());
  describe('noise3D', () => {
    it('is initialized randomly without arguments', function () {
      const noise3DA = createNoise3D();
      const noise3DB = createNoise3D();
      assert.notEqual(noise3DA(0.1, 0.1, 0.1), noise3DB(0.0, 0.1, 0.1));
    });
    it('should return the same value for the same input', function () {
      assert.equal(noise3D(0.1, 0.2, 0.3), noise3D(0.1, 0.2, 0.3));
    });
    it('should return a different value for a different input', function () {
      assert.notEqual(noise3D(0.1, 0.2, 0.3), noise3D(0.101, 0.202, 0.303));
    });
    it('should return the same output with the same seed', function () {
      const noise3D2 = createNoise3D(getRandom());
      assert.equal(noise3D(0.1, 0.2, 0.3), noise3D2(0.1, 0.2, 0.3));
    });
    it('should return a different output with a different seed', function () {
      const noise3D2 = createNoise3D(getRandom('other seed'));
      assert.notEqual(noise3D(0.1, 0.2, 0.3), noise3D2(0.1, 0.2, 0.3));
    });
    it('should return values between -1 and 1', function () {
      for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 10; y++) {
          assert(noise3D(x / 5, y / 5, x + y) >= -1);
          assert(noise3D(x / 5, y / 5, x + y) <= 1);
        }
      }
    });
    it('should return similar values for similar inputs', function () {
      assert(Math.abs(noise3D(0.1, 0.2, 0.3) - noise3D(0.101, 0.202, 0.303)) < 0.1);
    });
    it('should match snapshot for small inputs', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => noise3D(x * 2, y * 2, (x + y)), size, size);
      assertMatchesImage(actual, 'noise3Dsmall.png');
    });
    it('should match snapshot for large inputs', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => noise3D(x * 1000, y * 1000, (x + y) * 500), size, size);
      assertMatchesImage(actual, 'noise3Dlarge.png');
    });
  });
});

describe('createNoise4D', () => {
  const noise4D = createNoise4D(getRandom());
  describe('noise4D', () => {
    it('is initialized randomly without arguments', function () {
      const noise4DA = createNoise4D();
      const noise4DB = createNoise4D();
      assert.notEqual(noise4DA(0.1, 0.1, 0.1, 0.1), noise4DB(0.0, 0.1, 0.1, 0.1));
    });
    it('should return the same value for the same input', function () {
      assert.equal(noise4D(0.1, 0.2, 0.3, 0.4), noise4D(0.1, 0.2, 0.3, 0.4));
    });
    it('should return a different value for a different input', function () {
      assert.notEqual(noise4D(0.1, 0.2, 0.3, 0.4), noise4D(0.101, 0.202, 0.303, 0.404));
    });
    it('should return the same output with the same seed', function () {
      const noise4D2 = createNoise4D(getRandom());
      assert.equal(noise4D(0.1, 0.2, 0.3, 0.4), noise4D2(0.1, 0.2, 0.3, 0.4));
    });
    it('should return a different output with a different seed', function () {
      const noise4D2 = createNoise4D(getRandom('other seed'));
      assert.notEqual(noise4D(0.1, 0.2, 0.3, 0.4), noise4D2(0.1, 0.2, 0.3, 0.4));
    });
    it('should return values between -1 and 1', function () {
      for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 10; y++) {
          assert(noise4D(x / 5, y / 5, x + y, x - y) >= -1);
          assert(noise4D(x / 5, y / 5, x + y, x - y) <= 1);
        }
      }
    });
    it('should return similar values for similar inputs', function () {
      assert(Math.abs(noise4D(0.1, 0.2, 0.3, 0.4) - noise4D(0.101, 0.202, 0.303, 0.404)) < 0.1);
    });
    it('should match snapshot for small inputs', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => noise4D(x * 2, y * 2, x + y, x - y), size, size);
      assertMatchesImage(actual, 'noise4Dsmall.png');
    });
    it('should match snapshot for large inputs', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => noise4D(x * 1000, y * 1000, (x + y) * 500, (x - y) * 500), size, size);
      assertMatchesImage(actual, 'noise4Dlarge.png');
    });
  });
});

describe('interpolation curves', () => {
  const points = [0, 0.25, 0.5, 0.75, 1];
  const curves = [
    {
      name: 'smoothstep',
      fn: smoothstep,
      values: [0, 5 / 32, 0.5, 27 / 32, 1],
      // f'(t) = 6t(1 - t)
      derivativeAt: (t: number) => 6 * t * (1 - t),
    },
    {
      name: 'quintic',
      fn: quintic,
      values: [0, 0.103515625, 0.5, 0.896484375, 1],
      // f'(t) = 30 t^2 (1 - t)^2
      derivativeAt: (t: number) => 30 * t * t * (1 - t) * (1 - t),
    },
  ];

  for (const curve of curves) {
    describe(curve.name, () => {
      it('matches the analytic value table', function () {
        points.forEach((t, i) => {
          assert.strictEqual(curve.fn(t), curve.values[i]);
        });
      });
      it('has a continuous first derivative matching the analytic formula', function () {
        const h = 1e-6;
        points.forEach(t => {
          let numericalDerivative;
          if (t === 0) {
            numericalDerivative = curve.fn(h) / h;
          }
          else if (t === 1) {
            numericalDerivative = (1 - curve.fn(1 - h)) / h;
          }
          else {
            numericalDerivative = (curve.fn(t + h) - curve.fn(t - h)) / (2 * h);
          }
          assert(Math.abs(numericalDerivative - curve.derivativeAt(t)) < 1e-4);
        });
      });
      it('has zero first derivative at both boundaries', function () {
        assert.strictEqual(curve.derivativeAt(0), 0);
        assert.strictEqual(curve.derivativeAt(1), 0);
      });
      it('is symmetric and maps into [0, 1]', function () {
        for (let i = 0; i <= 100; i++) {
          const t = i / 100;
          const value = curve.fn(t);
          assert(Math.abs(value + curve.fn(1 - t) - 1) < 1e-14);
          assert(value >= 0 && value <= 1);
        }
      });
      it('throws a RangeError instead of clamping out-of-domain parameters', function () {
        const invalid = [-1, -0.0001, 1.0001, 2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
        for (const t of invalid) {
          assert.throws(() => curve.fn(t), RangeError);
        }
      });
      it('accepts the boundary values 0 and 1 without throwing', function () {
        assert.doesNotThrow(() => curve.fn(0));
        assert.doesNotThrow(() => curve.fn(1));
      });
    });
  }

  it('quintic leaves the midpoint region flatter than smoothstep', function () {
    // Both equal 0.5 at the midpoint, but quintic deviates less from the
    // endpoints near the boundaries, demonstrating the smoother transition.
    assert(quintic(0.1) < smoothstep(0.1));
    assert(quintic(0.9) > smoothstep(0.9));
    assert.strictEqual(quintic(0.5), smoothstep(0.5));
  });
});
