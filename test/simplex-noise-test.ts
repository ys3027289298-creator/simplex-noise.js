import { createNoise2D, createNoise3D, createNoise4D } from '../simplex-noise';
import { buildPermutationTable } from '../simplex-noise';
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

describe('periodic noise', () => {
  it('rejects zero periods', function () {
    assert.throws(() => createNoise2D(getRandom(), [0, 4]), /positive integer/);
    assert.throws(() => createNoise3D(getRandom(), [4, 0, 2]), /positive integer/);
    assert.throws(() => createNoise4D(getRandom(), [4, 4, 4, 0]), /positive integer/);
  });
  it('rejects non-integer periods', function () {
    assert.throws(() => createNoise2D(getRandom(), [1.5, 4]), /positive integer/);
    assert.throws(() => createNoise3D(getRandom(), [4, -2.5, 2]), /positive integer/);
    assert.throws(() => createNoise4D(getRandom(), [4, NaN, 4, 4]), /positive integer/);
  });
  it('accepts periods larger than 256 and still tiles exactly', function () {
    const noise2 = createNoise2D(getRandom('big'), [1000, 512]);
    assert.closeTo(noise2(123.456, 7.89), noise2(123.456 + 1000, 7.89), 1e-12);
    // the seam itself stays bitwise exact regardless of the period size
    assert.equal(noise2(1000, 7.89), noise2(0, 7.89));
    const noise3 = createNoise3D(getRandom('big'), [2048, 333, 777]);
    assert.closeTo(noise3(1, 2, 3), noise3(1, 2 + 333, 3), 1e-12);
    assert.equal(noise3(1, 333, 3), noise3(1, 0, 3));
  });
  it('rejects a period count that does not match the dimension', function () {
    assert.throws(() => createNoise2D(getRandom(), [4] as unknown as [number, number]), /expected 2 periods/);
    assert.throws(() => createNoise3D(getRandom(), [4, 4] as unknown as [number, number, number]), /expected 3 periods/);
  });
  it('throws at construction time, before any evaluation', function () {
    assert.throws(() => createNoise2D(getRandom(), [0, 1]));
  });
  it('2D is exactly periodic on both axes, including negative coordinates', function () {
    const noise = createNoise2D(getRandom('tile'), [8, 8]);
    for (let i = 0; i < 128; i++) {
      const x = getRandom('x' + i)() * 8;
      const y = getRandom('y' + i)() * 8;
      // interior repeats run through different FP arithmetic, so they match
      // to floating point precision (a few ULP); seam points match bitwise
      assert.closeTo(noise(x, y), noise(x + 8, y), 1e-14);
      assert.closeTo(noise(x, y), noise(x, y + 8), 1e-14);
      assert.closeTo(noise(x, y), noise(x - 24, y + 16), 1e-14);
    }
  });
  it('2D has a bitwise identical and first-difference continuous seam', function () {
    const noise = createNoise2D(getRandom('tile'), [8, 8]);
    for (const eps of [1e-2, 1e-4, 1e-9]) {
      for (let i = 0; i < 64; i++) {
        const y = i / 64 * 8;
        assert.equal(noise(8, y), noise(0, y));
        assert.equal(noise(8 - eps, y), noise(-eps, y));
      }
    }
  });
  it('3D is exactly periodic on every axis', function () {
    const noise = createNoise3D(getRandom('tile3'), [6, 6, 4]);
    for (let i = 0; i < 128; i++) {
      const x = getRandom('x3' + i)() * 6;
      const y = getRandom('y3' + i)() * 6;
      const z = getRandom('z3' + i)() * 4;
      assert.closeTo(noise(x, y, z), noise(x + 6, y, z), 1e-14);
      assert.closeTo(noise(x, y, z), noise(x, y + 6, z), 1e-14);
      assert.closeTo(noise(x, y, z), noise(x, y, z + 4), 1e-14);
      assert.closeTo(noise(x, y, z), noise(x - 12, y + 12, z - 8), 1e-14);
    }
  });
  it('3D has a first-difference continuous seam on every axis', function () {
    const noise = createNoise3D(getRandom('tile3'), [6, 6, 4]);
    for (const eps of [1e-2, 1e-4, 1e-9]) {
      for (let i = 0; i < 64; i++) {
        const t = i / 64 * 4;
        assert.equal(noise(6 - eps, t, 1), noise(-eps, t, 1));
        assert.equal(noise(1, 6 - eps, t), noise(1, -eps, t));
        assert.equal(noise(t, 1, 4 - eps), noise(t, 1, -eps));
      }
    }
  });
  it('4D is exactly periodic on every axis', function () {
    const noise = createNoise4D(getRandom('tile4'), [6, 6, 4, 4]);
    const x = 1.23, y = 2.34, z = 0.56, w = 3.21;
    assert.closeTo(noise(x, y, z, w), noise(x + 6, y, z, w), 1e-14);
    assert.closeTo(noise(x, y, z, w), noise(x, y + 6, z, w), 1e-14);
    assert.closeTo(noise(x, y, z, w), noise(x, y, z + 4, w), 1e-14);
    assert.closeTo(noise(x, y, z, w), noise(x, y, z, w + 4), 1e-14);
  });
  it('supports independent per-dimension periods', function () {
    const noise = createNoise2D(getRandom('rect'), [16, 4]);
    assert.closeTo(noise(3.3, 1.2), noise(3.3 + 16, 1.2), 1e-14);
    assert.closeTo(noise(3.3, 1.2), noise(3.3, 1.2 + 4), 1e-14);
    assert.notEqual(noise(3.3, 1.2), noise(3.3 + 4, 1.2));
  });
  it('is deterministic for the same seed and periods', function () {
    const a = createNoise2D(getRandom('det'), [8, 8]);
    const b = createNoise2D(getRandom('det'), [8, 8]);
    assert.equal(a(1.23, 4.56), b(1.23, 4.56));
  });
  it('stays within [-1, 1] across tile repetitions', function () {
    const noise3 = createNoise3D(getRandom('range'), [8, 8, 8]);
    for (let i = 0; i < 200; i++) {
      const v = noise3(getRandom('r' + i)() * 40 - 20, getRandom('s' + i)() * 40 - 20, i % 8);
      assert(v >= -1 && v <= 1);
    }
  });
});
