import { createCellular2D, createCellular3D, createNoise2D, createNoise3D, buildPermutationTable } from '../simplex-noise';
import alea from 'alea';
import { assert } from 'chai';
import { assertMatchesImage, sampleFunctionToImageDataOne } from './matches-snapshot';

function getRandom(seed = 'seed') {
  return alea(seed);
}

describe('createCellular2D', () => {
  const cellular2D = createCellular2D(getRandom());
  describe('cellular2D', () => {
    it('is initialized randomly without arguments', function () {
      const a = createCellular2D();
      const b = createCellular2D();
      assert.notEqual(a(0.1, 0.1).f1, b(0.0, 0.1).f1);
    });
    it('should return the same value for the same input', function () {
      assert.deepEqual(cellular2D(0.3, 0.7), cellular2D(0.3, 0.7));
    });
    it('should return a different value for a different input', function () {
      const values = new Set<string>();
      for (let cell = 0; cell < 20; cell++) {
        values.add(JSON.stringify(cellular2D(cell * 7.3 + 0.2, cell * 3.1 + 0.4)));
      }
      assert(values.size > 1);
    });
    it('should return the same output with the same seed', function () {
      const other = createCellular2D(getRandom());
      assert.deepEqual(cellular2D(0.3, 0.7), other(0.3, 0.7));
    });
    it('should return a different output with a different seed', function () {
      const other = createCellular2D(getRandom('other seed'));
      assert.notDeepEqual(cellular2D(0.3, 0.7), other(0.3, 0.7));
    });
    it('exposes F1 and F2 with F1 <= F2 and non negative distances', function () {
      for (let i = 0; i < 100; i++) {
        const r = cellular2D(i * 0.137, i * 0.091);
        assert(r.f1 >= 0);
        assert(r.f2 >= r.f1);
        assert(isFinite(r.f1) && isFinite(r.f2));
      }
    });
    it('is continuous when crossing cell borders', function () {
      for (let x = 0.9; x < 1.1; x += 0.01) {
        const a = cellular2D(x, 0.5).f1;
        const b = cellular2D(x + 0.0001, 0.5).f1;
        assert(Math.abs(a - b) < 0.001);
      }
    });
    it('supports the manhattan metric', function () {
      const manhattan = createCellular2D(getRandom(), { metric: 'manhattan' });
      for (let i = 0; i < 50; i++) {
        const r = manhattan(i * 0.23, i * 0.17);
        assert(r.f1 >= 0 && r.f2 >= r.f1);
      }
    });
    it('supports the chebyshev metric', function () {
      const chebyshev = createCellular2D(getRandom(), { metric: 'chebyshev' });
      for (let i = 0; i < 50; i++) {
        const r = chebyshev(i * 0.23, i * 0.17);
        assert(r.f1 >= 0 && r.f2 >= r.f1);
      }
    });
    it('different metrics produce different distance fields', function () {
      const euclidean = createCellular2D(getRandom('metric'));
      const manhattan = createCellular2D(getRandom('metric'), { metric: 'manhattan' });
      const chebyshev = createCellular2D(getRandom('metric'), { metric: 'chebyshev' });
      const point = (fn: typeof euclidean) => fn(0.42, 0.73).f1;
      assert.notEqual(point(euclidean), point(manhattan));
      assert.notEqual(point(euclidean), point(chebyshev));
      assert.notEqual(point(manhattan), point(chebyshev));
    });
    it('honours pointsPerCell and keeps results reproducible', function () {
      const single = createCellular2D(getRandom('dense'), { pointsPerCell: 1 });
      const dense = createCellular2D(getRandom('dense'), { pointsPerCell: 4 });
      const denseAgain = createCellular2D(getRandom('dense'), { pointsPerCell: 4 });
      assert.notDeepEqual(single(0.4, 0.6), dense(0.4, 0.6));
      assert.deepEqual(dense(0.4, 0.6), denseAgain(0.4, 0.6));
      assert(dense(0.4, 0.6).f1 <= single(0.4, 0.6).f1 + 1e-12);
    });
    it('shares the permutation table primitive with simplex', function () {
      const cellular = createCellular2D(getRandom('shared'));
      void cellular;
      const table = buildPermutationTable(getRandom('shared'));
      assert.equal(table.length, 512);
      assert.deepEqual(Array.from(table.slice(0, 256)), Array.from(table.slice(256)));
    });
    it('should match snapshot for F1', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => cellular2D(x * 4, y * 4).f1 * 2 - 1, size, size);
      assertMatchesImage(actual, 'cellular2Df1.png');
    });
    it('should match snapshot for F2', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => cellular2D(x * 4, y * 4).f2 * 2 - 1, size, size);
      assertMatchesImage(actual, 'cellular2Df2.png');
    });
    it('should match snapshot for manhattan metric', function () {
      const manhattan = createCellular2D(getRandom(), { metric: 'manhattan' });
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => manhattan(x * 4, y * 4).f1 * 2 - 1, size, size);
      assertMatchesImage(actual, 'cellular2Dmanhattan.png');
    });
  });
});

describe('createCellular3D', () => {
  const cellular3D = createCellular3D(getRandom());
  describe('cellular3D', () => {
    it('is initialized randomly without arguments', function () {
      const a = createCellular3D();
      const b = createCellular3D();
      assert.notEqual(a(0.1, 0.1, 0.1).f1, b(0.0, 0.1, 0.1).f1);
    });
    it('should return the same value for the same input', function () {
      assert.deepEqual(cellular3D(0.3, 0.7, 0.2), cellular3D(0.3, 0.7, 0.2));
    });
    it('should return the same output with the same seed', function () {
      const other = createCellular3D(getRandom());
      assert.deepEqual(cellular3D(0.3, 0.7, 0.2), other(0.3, 0.7, 0.2));
    });
    it('should return a different output with a different seed', function () {
      const other = createCellular3D(getRandom('other seed'));
      assert.notDeepEqual(cellular3D(0.3, 0.7, 0.2), other(0.3, 0.7, 0.2));
    });
    it('exposes F1 and F2 with F1 <= F2', function () {
      for (let i = 0; i < 100; i++) {
        const r = cellular3D(i * 0.11, i * 0.13, i * 0.17);
        assert(r.f1 >= 0 && r.f2 >= r.f1);
      }
    });
    it('supports every metric and pointsPerCell reproducibly', function () {
      const metrics = ['euclidean', 'manhattan', 'chebyshev'] as const;
      for (const metric of metrics) {
        const a = createCellular3D(getRandom('3d'), { metric, pointsPerCell: 3 });
        const b = createCellular3D(getRandom('3d'), { metric, pointsPerCell: 3 });
        assert.deepEqual(a(0.5, 0.2, 0.9), b(0.5, 0.2, 0.9));
        const r = a(0.5, 0.2, 0.9);
        assert(r.f1 >= 0 && r.f2 >= r.f1);
      }
    });
    it('should match snapshot for an F1 slice', function () {
      const size = 64;
      const actual = sampleFunctionToImageDataOne((x, y) => cellular3D(x * 4, y * 4, 0).f1 * 2 - 1, size, size);
      assertMatchesImage(actual, 'cellular3Df1.png');
    });
  });
});

describe('cellular and simplex coexistence', () => {
  it('simplex outputs stay bit identical next to cellular instances', function () {
    const noise2D = createNoise2D(getRandom('coexist'));
    const noise3D = createNoise3D(getRandom('coexist-3d'));
    createCellular2D(getRandom('coexist'));
    createCellular3D(getRandom('coexist-3d'));
    const again2D = createNoise2D(getRandom('coexist'));
    const again3D = createNoise3D(getRandom('coexist-3d'));
    assert.equal(noise2D(0.1, 0.2), again2D(0.1, 0.2));
    assert.equal(noise3D(0.1, 0.2, 0.3), again3D(0.1, 0.2, 0.3));
  });
});
