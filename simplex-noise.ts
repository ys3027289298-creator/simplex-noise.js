/*
 * A fast javascript implementation of simplex noise by Jonas Wagner

Based on a speed-improved simplex noise algorithm for 2D, 3D and 4D in Java.
Which is based on example code by Stefan Gustavson (stegu@itn.liu.se).
With Optimisations by Peter Eastman (peastman@drizzle.stanford.edu).
Better rank ordering method by Stefan Gustavson in 2012.

 Copyright (c) 2024 Jonas Wagner

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */


// these __PURE__ comments help uglifyjs with dead code removal
//
const SQRT3 = /*#__PURE__*/ Math.sqrt(3.0);
const SQRT5 = /*#__PURE__*/ Math.sqrt(5.0);
const F2 = 0.5 * (SQRT3 - 1.0);
const G2 = (3.0 - SQRT3) / 6.0;
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;
const F4 = (SQRT5 - 1.0) / 4.0;
const G4 = (5.0 - SQRT5) / 20.0;

// I'm really not sure why this | 0 (basically a coercion to int)
// is making this faster but I get ~5 million ops/sec more on the
// benchmarks across the board or a ~10% speedup.
const fastFloor = (x: number) => Math.floor(x) | 0;

const grad2 = /*#__PURE__*/ new Float64Array([1, 1,
  -1, 1,
  1, -1,

  -1, -1,
  1, 0,
  -1, 0,

  1, 0,
  -1, 0,
  0, 1,

  0, -1,
  0, 1,
  0, -1]);

// double seems to be faster than single or int's
// probably because most operations are in double precision
const grad3 = /*#__PURE__*/ new Float64Array([1, 1, 0,
  -1, 1, 0,
  1, -1, 0,

  -1, -1, 0,
  1, 0, 1,
  -1, 0, 1,

  1, 0, -1,
  -1, 0, -1,
  0, 1, 1,

  0, -1, 1,
  0, 1, -1,
  0, -1, -1]);

// double is a bit quicker here as well
const grad4 = /*#__PURE__*/ new Float64Array([0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1,
  0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
  1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1,
  -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
  1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1,
  -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
  1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0,
  -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0]);

/**
 * A random() function, must return a number in the interval [0,1), just like Math.random().
 */
export type RandomFn = () => number;

/**
 * Periods of a tileable (periodic) noise field, one value per dimension.
 * Every value must be a positive integer: the noise then repeats exactly
 * every `periods[d]` units along dimension `d`.
 * An integer number of lattice cells is used per period, so the tile
 * boundaries are strictly continuous (the field is C1 everywhere).
 * Note that simplex noise is evaluated on a skewed lattice, so a period of
 * 1 collapses the lattice index along that dimension but the field still
 * varies inside the single cell; use periods of at least ~4 for visible
 * feature repetition.
 */
export type Periods2D = readonly [number, number];

/**
 * Samples the noise field in two dimensions
 *
 * Coordinates should be finite, bigger than -2^31 and smaller than 2^31.
 * @param x
 * @param y
 * @returns a number in the interval [-1, 1]
 */
export type NoiseFunction2D = (x: number, y: number) => number;

/**
 * Validates a per-dimension period specification.
 */
function validatePeriods(periods: readonly number[], dimensions: number): void {
  if (periods.length !== dimensions) {
    throw new Error(`expected ${dimensions} periods, got ${periods.length}`);
  }
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    if (!Number.isInteger(period) || period <= 0) {
      throw new Error(`periods[${i}] must be a positive integer, got ${period}`);
    }
  }
}

/**
 * Euclidean modulo: always returns a value in [0, modulus).
 * Works for negative operands, unlike the % operator.
 */
function mod(value: number, modulus: number): number {
  return value - Math.floor(value / modulus) * modulus;
}

/**
 * Creates a 2D noise function
 * @param random the random function that will be used to build the permutation table
 * @param periods optional per-dimension periods (positive integers)
 *                making the noise tileable. When omitted the output is
 *                identical to the non-periodic implementation.
 * @returns {NoiseFunction2D}
 */
export function createNoise2D(random: RandomFn = Math.random, periods?: Periods2D): NoiseFunction2D {
  const perm = buildPermutationTable(random);
  // precalculating this yields a little ~3% performance improvement.
  const permGrad2x = new Float64Array(perm).map(v => grad2[(v % 12) * 2]);
  const permGrad2y = new Float64Array(perm).map(v => grad2[(v % 12) * 2 + 1]);
  if (periods === undefined) {
    return function noise2D(x: number, y: number): number {
    // if(!isFinite(x) || !isFinite(y)) return 0;
      let n0 = 0; // Noise contributions from the three corners
      let n1 = 0;
      let n2 = 0;
      // Skew the input space to determine which simplex cell we're in
      const s = (x + y) * F2; // Hairy factor for 2D
      const i = fastFloor(x + s);
      const j = fastFloor(y + s);
      const t = (i + j) * G2;
      const X0 = i - t; // Unskew the cell origin back to (x,y) space
      const Y0 = j - t;
      const x0 = x - X0; // The x,y distances from the cell origin
      const y0 = y - Y0;
      // For the 2D case, the simplex shape is an equilateral triangle.
      // Determine which simplex we are in.
      let i1, j1; // Offsets for second (middle) corner of simplex in (i,j) coords
      if (x0 > y0) {
        i1 = 1;
        j1 = 0;
      } // lower triangle, XY order: (0,0)->(1,0)->(1,1)
      else {
        i1 = 0;
        j1 = 1;
      } // upper triangle, YX order: (0,0)->(0,1)->(1,1)
      // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
      // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
      // c = (3-sqrt(3))/6
      const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
      const y1 = y0 - j1 + G2;
      const x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coords
      const y2 = y0 - 1.0 + 2.0 * G2;
      // Work out the hashed gradient indices of the three simplex corners
      const ii = i & 255;
      const jj = j & 255;
      // Calculate the contribution from the three corners
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) {
        const gi0 = ii + perm[jj];
        const g0x = permGrad2x[gi0];
        const g0y = permGrad2y[gi0];
        t0 *= t0;
        // n0 = t0 * t0 * (grad2[gi0] * x0 + grad2[gi0 + 1] * y0); // (x,y) of grad3 used for 2D gradient
        n0 = t0 * t0 * (g0x * x0 + g0y * y0);
      }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) {
        const gi1 = ii + i1 + perm[jj + j1];
        const g1x = permGrad2x[gi1];
        const g1y = permGrad2y[gi1];
        t1 *= t1;
        // n1 = t1 * t1 * (grad2[gi1] * x1 + grad2[gi1 + 1] * y1);
        n1 = t1 * t1 * (g1x * x1 + g1y * y1);
      }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) {
        const gi2 = ii + 1 + perm[jj + 1];
        const g2x = permGrad2x[gi2];
        const g2y = permGrad2y[gi2];
        t2 *= t2;
        // n2 = t2 * t2 * (grad2[gi2] * x2 + grad2[gi2 + 1] * y2);
        n2 = t2 * t2 * (g2x * x2 + g2y * y2);
      }
      // Add contributions from each corner to get the final noise value.
      // The result is scaled to return values in the interval [-1,1].
      return 70.0 * (n0 + n1 + n2);
    };
  }
  validatePeriods(periods, 2);
  const periodX = periods[0];
  const periodY = periods[1];
  // The periodic core is the ordinary simplex field with lattice indices
  // reduced modulo (periodX, periodY). It is periodic along the unskew
  // lattice vectors (1-G2, -G2) and (-G2, 1-G2). Mapping the user's
  // axis-aligned tile through these vectors yields strict axis-aligned
  // periods of periodX/periodY units while reusing the same permutation
  // table and gradients as the non-periodic noise.
  return function noise2DTiled(x: number, y: number): number {
    // Reduce in user space first: this makes the two sides of every tile
    // boundary evaluate the exact same expression (bitwise identical).
    x = mod(x, periodX);
    y = mod(y, periodY);
    const u = x * (1 - G2) - y * G2;
    const v = y * (1 - G2) - x * G2;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    const s = (u + v) * F2;
    const i = fastFloor(u + s);
    const j = fastFloor(v + s);
    const t = (i + j) * G2;
    const x0 = u - (i - t);
    const y0 = v - (j - t);
    let i1, j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    }
    else {
      i1 = 0;
      j1 = 1;
    }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;
    const ii = mod(i, periodX);
    const jj = mod(j, periodY);
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      // The 512 entry permutation table only mirrors 256 logical entries,
      // so periods larger than 256 require reducing the final hash index
      // modulo 256. For in-range indices this is identical to the table's
      // own mirroring, so small periods keep exactly the same gradients.
      const gi0 = (ii + perm[mod(jj, 256)]) % 256;
      const g0x = permGrad2x[gi0];
      const g0y = permGrad2y[gi0];
      t0 *= t0;
      n0 = t0 * t0 * (g0x * x0 + g0y * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = (mod(ii + i1, periodX)
        + perm[mod(mod(jj + j1, periodY), 256)]) % 256;
      const g1x = permGrad2x[gi1];
      const g1y = permGrad2y[gi1];
      t1 *= t1;
      n1 = t1 * t1 * (g1x * x1 + g1y * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = (mod(ii + 1, periodX)
        + perm[mod(mod(jj + 1, periodY), 256)]) % 256;
      const g2x = permGrad2x[gi2];
      const g2y = permGrad2y[gi2];
      t2 *= t2;
      n2 = t2 * t2 * (g2x * x2 + g2y * y2);
    }
    return 70.0 * (n0 + n1 + n2);
  };
}

/**
 * Samples the noise field in three dimensions
 * 
 * Coordinates should be finite, bigger than -2^31 and smaller than 2^31.
 * @param x
 * @param y
 * @param z
 * @returns a number in the interval [-1, 1]
 */
export type NoiseFunction3D = (x: number, y: number, z: number) => number;

/**
 * Periods of a tileable 3D noise field, one value per dimension.
 * Every value must be a positive integer.
 */
export type Periods3D = readonly [number, number, number];

/**
 * Creates a 3D noise function
 * @param random the random function that will be used to build the permutation table
 * @param periods optional per-dimension periods (positive integers)
 *                making the noise tileable. When omitted the output is
 *                identical to the non-periodic implementation.
 * @returns {NoiseFunction3D}
 */
export function createNoise3D(random: RandomFn = Math.random, periods?: Periods3D): NoiseFunction3D {
  const perm = buildPermutationTable(random);
  // precalculating these seems to yield a speedup of over 15%
  const permGrad3x = new Float64Array(perm).map(v => grad3[(v % 12) * 3]);
  const permGrad3y = new Float64Array(perm).map(v => grad3[(v % 12) * 3 + 1]);
  const permGrad3z = new Float64Array(perm).map(v => grad3[(v % 12) * 3 + 2]);
  if (periods === undefined) {
    return function noise3D(x: number, y: number, z: number): number {
      let n0, n1, n2, n3; // Noise contributions from the four corners
      // Skew the input space to determine which simplex cell we're in
      const s = (x + y + z) * F3; // Very nice and simple skew factor for 3D
      const i = fastFloor(x + s);
      const j = fastFloor(y + s);
      const k = fastFloor(z + s);
      const t = (i + j + k) * G3;
      const X0 = i - t; // Unskew the cell origin back to (x,y,z) space
      const Y0 = j - t;
      const Z0 = k - t;
      const x0 = x - X0; // The x,y,z distances from the cell origin
      const y0 = y - Y0;
      const z0 = z - Z0;
      // For the 3D case, the simplex shape is a slightly irregular tetrahedron.
      // Determine which simplex we are in.
      let i1, j1, k1; // Offsets for second corner of simplex in (i,j,k) coords
      let i2, j2, k2; // Offsets for third corner of simplex in (i,j,k) coords
      if (x0 >= y0) {
        if (y0 >= z0) {
          i1 = 1;
          j1 = 0;
          k1 = 0;
          i2 = 1;
          j2 = 1;
          k2 = 0;
        } // X Y Z order
        else if (x0 >= z0) {
          i1 = 1;
          j1 = 0;
          k1 = 0;
          i2 = 1;
          j2 = 0;
          k2 = 1;
        } // X Z Y order
        else {
          i1 = 0;
          j1 = 0;
          k1 = 1;
          i2 = 1;
          j2 = 0;
          k2 = 1;
        } // Z X Y order
      }
      else { // x0<y0
        if (y0 < z0) {
          i1 = 0;
          j1 = 0;
          k1 = 1;
          i2 = 0;
          j2 = 1;
          k2 = 1;
        } // Z Y X order
        else if (x0 < z0) {
          i1 = 0;
          j1 = 1;
          k1 = 0;
          i2 = 0;
          j2 = 1;
          k2 = 1;
        } // Y Z X order
        else {
          i1 = 0;
          j1 = 1;
          k1 = 0;
          i2 = 1;
          j2 = 1;
          k2 = 0;
        } // Y X Z order
      }
      // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
      // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
      // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where
      // c = 1/6.
      const x1 = x0 - i1 + G3; // Offsets for second corner in (x,y,z) coords
      const y1 = y0 - j1 + G3;
      const z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2.0 * G3; // Offsets for third corner in (x,y,z) coords
      const y2 = y0 - j2 + 2.0 * G3;
      const z2 = z0 - k2 + 2.0 * G3;
      const x3 = x0 - 1.0 + 3.0 * G3; // Offsets for last corner in (x,y,z) coords
      const y3 = y0 - 1.0 + 3.0 * G3;
      const z3 = z0 - 1.0 + 3.0 * G3;
      // Work out the hashed gradient indices of the four simplex corners
      const ii = i & 255;
      const jj = j & 255;
      const kk = k & 255;
      // Calculate the contribution from the four corners
      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 < 0) n0 = 0.0;
      else {
        const gi0 = ii + perm[jj + perm[kk]];
        t0 *= t0;
        n0 = t0 * t0 * (permGrad3x[gi0] * x0 + permGrad3y[gi0] * y0 + permGrad3z[gi0] * z0);
      }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 < 0) n1 = 0.0;
      else {
        const gi1 = ii + i1 + perm[jj + j1 + perm[kk + k1]];
        t1 *= t1;
        n1 = t1 * t1 * (permGrad3x[gi1] * x1 + permGrad3y[gi1] * y1 + permGrad3z[gi1] * z1);
      }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 < 0) n2 = 0.0;
      else {
        const gi2 = ii + i2 + perm[jj + j2 + perm[kk + k2]];
        t2 *= t2;
        n2 = t2 * t2 * (permGrad3x[gi2] * x2 + permGrad3y[gi2] * y2 + permGrad3z[gi2] * z2);
      }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 < 0) n3 = 0.0;
      else {
        const gi3 = ii + 1 + perm[jj + 1 + perm[kk + 1]];
        t3 *= t3;
        n3 = t3 * t3 * (permGrad3x[gi3] * x3 + permGrad3y[gi3] * y3 + permGrad3z[gi3] * z3);
      }
      // Add contributions from each corner to get the final noise value.
      // The result is scaled to stay just inside [-1,1]
      return 32.0 * (n0 + n1 + n2 + n3);
    };
  }
  validatePeriods(periods, 3);
  const periodX = periods[0];
  const periodY = periods[1];
  const periodZ = periods[2];
  // 3D lattice unskew: x0 = i - (i+j+k)/6. The inverse-skew basis vectors
  // of an axis-aligned user tile therefore have the components used below;
  // see createNoise2D for the full derivation. Lattice indices are reduced
  // modulo the periods, which makes the field periodic while sharing the
  // single permutation table of the non-periodic implementation.
  return function noise3DTiled(x: number, y: number, z: number): number {
    x = mod(x, periodX);
    y = mod(y, periodY);
    z = mod(z, periodZ);
    const u = x * (1 - 2 * G3) - y * G3 - z * G3;
    const v = y * (1 - 2 * G3) - x * G3 - z * G3;
    const w = z * (1 - 2 * G3) - x * G3 - y * G3;
    let n0, n1, n2, n3;
    const s = (u + v + w) * F3;
    const i = fastFloor(u + s);
    const j = fastFloor(v + s);
    const k = fastFloor(w + s);
    const t = (i + j + k) * G3;
    const x0 = u - (i - t);
    const y0 = v - (j - t);
    const z0 = w - (k - t);
    let i1, j1, k1;
    let i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
      else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      }
      else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    }
    else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      }
      else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      }
      else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;
    const ii = mod(i, periodX);
    const jj = mod(j, periodY);
    const kk = mod(k, periodZ);
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0.0;
    else {
      const gi0 = (ii + perm[mod(jj + perm[mod(kk, 256)], 256)]) % 256;
      t0 *= t0;
      n0 = t0 * t0 * (permGrad3x[gi0] * x0 + permGrad3y[gi0] * y0 + permGrad3z[gi0] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0.0;
    else {
      const gi1 = (mod(ii + i1, periodX)
        + perm[mod(mod(jj + j1, periodY)
          + perm[mod(mod(kk + k1, periodZ), 256)], 256)]) % 256;
      t1 *= t1;
      n1 = t1 * t1 * (permGrad3x[gi1] * x1 + permGrad3y[gi1] * y1 + permGrad3z[gi1] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0.0;
    else {
      const gi2 = (mod(ii + i2, periodX)
        + perm[mod(mod(jj + j2, periodY)
          + perm[mod(mod(kk + k2, periodZ), 256)], 256)]) % 256;
      t2 *= t2;
      n2 = t2 * t2 * (permGrad3x[gi2] * x2 + permGrad3y[gi2] * y2 + permGrad3z[gi2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0.0;
    else {
      const gi3 = (mod(ii + 1, periodX)
        + perm[mod(mod(jj + 1, periodY)
          + perm[mod(mod(kk + 1, periodZ), 256)], 256)]) % 256;
      t3 *= t3;
      n3 = t3 * t3 * (permGrad3x[gi3] * x3 + permGrad3y[gi3] * y3 + permGrad3z[gi3] * z3);
    }
    return 32.0 * (n0 + n1 + n2 + n3);
  };
}

/**
 * Samples the noise field in four dimensions
 * 
 * Coordinates should be finite, bigger than -2^31 and smaller than 2^31.
 * @param x
 * @param y
 * @param z
 * @param w
 * @returns a number in the interval [-1, 1]
 */
export type NoiseFunction4D = (x: number, y: number, z: number, w: number) => number;

/**
 * Periods of a tileable 4D noise field, one value per dimension.
 * Every value must be a positive integer.
 */
export type Periods4D = readonly [number, number, number, number];

/**
 * Creates a 4D noise function
 * @param random the random function that will be used to build the permutation table
 * @param periods optional per-dimension periods (positive integers)
 *                making the noise tileable. When omitted the output is
 *                identical to the non-periodic implementation.
 * @returns {NoiseFunction4D}
 */
export function createNoise4D(random: RandomFn = Math.random, periods?: Periods4D): NoiseFunction4D {
  const perm = buildPermutationTable(random);
  // precalculating these leads to a ~10% speedup
  const permGrad4x = new Float64Array(perm).map(v => grad4[(v % 32) * 4]);
  const permGrad4y = new Float64Array(perm).map(v => grad4[(v % 32) * 4 + 1]);
  const permGrad4z = new Float64Array(perm).map(v => grad4[(v % 32) * 4 + 2]);
  const permGrad4w = new Float64Array(perm).map(v => grad4[(v % 32) * 4 + 3]);
  if (periods === undefined) {
    return function noise4D(x: number, y: number, z: number, w: number): number {
      let n0, n1, n2, n3, n4; // Noise contributions from the five corners
      // Skew the (x,y,z,w) space to determine which cell of 24 simplices we're in
      const s = (x + y + z + w) * F4; // Factor for 4D skewing
      const i = fastFloor(x + s);
      const j = fastFloor(y + s);
      const k = fastFloor(z + s);
      const l = fastFloor(w + s);
      const t = (i + j + k + l) * G4; // Factor for 4D unskewing
      const X0 = i - t; // Unskew the cell origin back to (x,y,z,w) space
      const Y0 = j - t;
      const Z0 = k - t;
      const W0 = l - t;
      const x0 = x - X0; // The x,y,z,w distances from the cell origin
      const y0 = y - Y0;
      const z0 = z - Z0;
      const w0 = w - W0;
      // For the 4D case, the simplex is a 4D shape I won't even try to describe.
      // To find out which of the 24 possible simplices we're in, we need to
      // determine the magnitude ordering of x0, y0, z0 and w0.
      // Six pair-wise comparisons are performed between each possible pair
      // of the four coordinates, and the results are used to rank the numbers.
      let rankx = 0;
      let ranky = 0;
      let rankz = 0;
      let rankw = 0;
      if (x0 > y0) rankx++;
      else ranky++;
      if (x0 > z0) rankx++;
      else rankz++;
      if (x0 > w0) rankx++;
      else rankw++;
      if (y0 > z0) ranky++;
      else rankz++;
      if (y0 > w0) ranky++;
      else rankw++;
      if (z0 > w0) rankz++;
      else rankw++;
      // simplex[c] is a 4-vector with the numbers 0, 1, 2 and 3 in some order.
      // Many values of c will never occur, since e.g. x>y>z>w makes x<z, y<w and x<w
      // impossible. Only the 24 indices which have non-zero entries make any sense.
      // We use a thresholding to set the coordinates in turn from the largest magnitude.
      // Rank 3 denotes the largest coordinate.
      // Rank 2 denotes the second largest coordinate.
      // Rank 1 denotes the second smallest coordinate.

      // The integer offsets for the second simplex corner
      const i1 = rankx >= 3 ? 1 : 0;
      const j1 = ranky >= 3 ? 1 : 0;
      const k1 = rankz >= 3 ? 1 : 0;
      const l1 = rankw >= 3 ? 1 : 0;
      // The integer offsets for the third simplex corner
      const i2 = rankx >= 2 ? 1 : 0;
      const j2 = ranky >= 2 ? 1 : 0;
      const k2 = rankz >= 2 ? 1 : 0;
      const l2 = rankw >= 2 ? 1 : 0;

      // The integer offsets for the fourth simplex corner
      const i3 = rankx >= 1 ? 1 : 0;
      const j3 = ranky >= 1 ? 1 : 0;
      const k3 = rankz >= 1 ? 1 : 0;
      const l3 = rankw >= 1 ? 1 : 0;
      // The fifth corner has all coordinate offsets = 1, so no need to compute that.
      const x1 = x0 - i1 + G4; // Offsets for second corner in (x,y,z,w) coords
      const y1 = y0 - j1 + G4;
      const z1 = z0 - k1 + G4;
      const w1 = w0 - l1 + G4;
      const x2 = x0 - i2 + 2.0 * G4; // Offsets for third corner in (x,y,z,w) coords
      const y2 = y0 - j2 + 2.0 * G4;
      const z2 = z0 - k2 + 2.0 * G4;
      const w2 = w0 - l2 + 2.0 * G4;
      const x3 = x0 - i3 + 3.0 * G4; // Offsets for fourth corner in (x,y,z,w) coords
      const y3 = y0 - j3 + 3.0 * G4;
      const z3 = z0 - k3 + 3.0 * G4;
      const w3 = w0 - l3 + 3.0 * G4;
      const x4 = x0 - 1.0 + 4.0 * G4; // Offsets for last corner in (x,y,z,w) coords
      const y4 = y0 - 1.0 + 4.0 * G4;
      const z4 = z0 - 1.0 + 4.0 * G4;
      const w4 = w0 - 1.0 + 4.0 * G4;
      // Work out the hashed gradient indices of the five simplex corners
      const ii = i & 255;
      const jj = j & 255;
      const kk = k & 255;
      const ll = l & 255;
      // Calculate the contribution from the five corners
      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
      if (t0 < 0) n0 = 0.0;
      else {
        const gi0 = ii + perm[jj + perm[kk + perm[ll]]];
        t0 *= t0;
        n0 = t0 * t0 * (permGrad4x[gi0] * x0 + permGrad4y[gi0] * y0 + permGrad4z[gi0] * z0 + permGrad4w[gi0] * w0);
      }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
      if (t1 < 0) n1 = 0.0;
      else {
        const gi1 = ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]];
        t1 *= t1;
        n1 = t1 * t1 * (permGrad4x[gi1] * x1 + permGrad4y[gi1] * y1 + permGrad4z[gi1] * z1 + permGrad4w[gi1] * w1);
      }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
      if (t2 < 0) n2 = 0.0;
      else {
        const gi2 = ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]];
        t2 *= t2;
        n2 = t2 * t2 * (permGrad4x[gi2] * x2 + permGrad4y[gi2] * y2 + permGrad4z[gi2] * z2 + permGrad4w[gi2] * w2);
      }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
      if (t3 < 0) n3 = 0.0;
      else {
        const gi3 = ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]];
        t3 *= t3;
        n3 = t3 * t3 * (permGrad4x[gi3] * x3 + permGrad4y[gi3] * y3 + permGrad4z[gi3] * z3 + permGrad4w[gi3] * w3);
      }
      let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
      if (t4 < 0) n4 = 0.0;
      else {
        const gi4 = ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]];
        t4 *= t4;
        n4 = t4 * t4 * (permGrad4x[gi4] * x4 + permGrad4y[gi4] * y4 + permGrad4z[gi4] * z4 + permGrad4w[gi4] * w4);
      }
      // Sum up and scale the result to cover the range [-1,1]
      return 27.0 * (n0 + n1 + n2 + n3 + n4);
    };
  }
  validatePeriods(periods, 4);
  const periodX = periods[0];
  const periodY = periods[1];
  const periodZ = periods[2];
  const periodW = periods[3];
  // Same construction as in 2D/3D: map the axis-aligned user tile through
  // the inverse 4D unskew basis and reduce every lattice index modulo its
  // period. The permutation table and gradients stay shared with the
  // non-periodic implementation.
  const diag4 = 1 - 3 * G4;
  return function noise4DTiled(x: number, y: number, z: number, w: number): number {
    x = mod(x, periodX);
    y = mod(y, periodY);
    z = mod(z, periodZ);
    w = mod(w, periodW);
    const u = x * diag4 - (y + z + w) * G4;
    const v = y * diag4 - (x + z + w) * G4;
    const p = z * diag4 - (x + y + w) * G4;
    const q = w * diag4 - (x + y + z) * G4;
    let n0, n1, n2, n3, n4;
    const s = (u + v + p + q) * F4;
    const i = fastFloor(u + s);
    const j = fastFloor(v + s);
    const k = fastFloor(p + s);
    const l = fastFloor(q + s);
    const t = (i + j + k + l) * G4;
    const x0 = u - (i - t);
    const y0 = v - (j - t);
    const z0 = p - (k - t);
    const w0 = q - (l - t);
    let rankx = 0;
    let ranky = 0;
    let rankz = 0;
    let rankw = 0;
    if (x0 > y0) rankx++;
    else ranky++;
    if (x0 > z0) rankx++;
    else rankz++;
    if (x0 > w0) rankx++;
    else rankw++;
    if (y0 > z0) ranky++;
    else rankz++;
    if (y0 > w0) ranky++;
    else rankw++;
    if (z0 > w0) rankz++;
    else rankw++;
    const i1 = rankx >= 3 ? 1 : 0;
    const j1 = ranky >= 3 ? 1 : 0;
    const k1 = rankz >= 3 ? 1 : 0;
    const l1 = rankw >= 3 ? 1 : 0;
    const i2 = rankx >= 2 ? 1 : 0;
    const j2 = ranky >= 2 ? 1 : 0;
    const k2 = rankz >= 2 ? 1 : 0;
    const l2 = rankw >= 2 ? 1 : 0;
    const i3 = rankx >= 1 ? 1 : 0;
    const j3 = ranky >= 1 ? 1 : 0;
    const k3 = rankz >= 1 ? 1 : 0;
    const l3 = rankw >= 1 ? 1 : 0;
    const x1 = x0 - i1 + G4;
    const y1 = y0 - j1 + G4;
    const z1 = z0 - k1 + G4;
    const w1 = w0 - l1 + G4;
    const x2 = x0 - i2 + 2.0 * G4;
    const y2 = y0 - j2 + 2.0 * G4;
    const z2 = z0 - k2 + 2.0 * G4;
    const w2 = w0 - l2 + 2.0 * G4;
    const x3 = x0 - i3 + 3.0 * G4;
    const y3 = y0 - j3 + 3.0 * G4;
    const z3 = z0 - k3 + 3.0 * G4;
    const w3 = w0 - l3 + 3.0 * G4;
    const x4 = x0 - 1.0 + 4.0 * G4;
    const y4 = y0 - 1.0 + 4.0 * G4;
    const z4 = z0 - 1.0 + 4.0 * G4;
    const w4 = w0 - 1.0 + 4.0 * G4;
    const ii = mod(i, periodX);
    const jj = mod(j, periodY);
    const kk = mod(k, periodZ);
    const ll = mod(l, periodW);
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
    if (t0 < 0) n0 = 0.0;
    else {
      const gi0 = (ii + perm[mod(jj
        + perm[mod(kk + perm[mod(ll, 256)], 256)], 256)]) % 256;
      t0 *= t0;
      n0 = t0 * t0 * (permGrad4x[gi0] * x0 + permGrad4y[gi0] * y0 + permGrad4z[gi0] * z0 + permGrad4w[gi0] * w0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
    if (t1 < 0) n1 = 0.0;
    else {
      const gi1 = (mod(ii + i1, periodX)
        + perm[mod(mod(jj + j1, periodY)
          + perm[mod(mod(kk + k1, periodZ)
            + perm[mod(mod(ll + l1, periodW), 256)], 256)], 256)]) % 256;
      t1 *= t1;
      n1 = t1 * t1 * (permGrad4x[gi1] * x1 + permGrad4y[gi1] * y1 + permGrad4z[gi1] * z1 + permGrad4w[gi1] * w1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
    if (t2 < 0) n2 = 0.0;
    else {
      const gi2 = (mod(ii + i2, periodX)
        + perm[mod(mod(jj + j2, periodY)
          + perm[mod(mod(kk + k2, periodZ)
            + perm[mod(mod(ll + l2, periodW), 256)], 256)], 256)]) % 256;
      t2 *= t2;
      n2 = t2 * t2 * (permGrad4x[gi2] * x2 + permGrad4y[gi2] * y2 + permGrad4z[gi2] * z2 + permGrad4w[gi2] * w2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
    if (t3 < 0) n3 = 0.0;
    else {
      const gi3 = (mod(ii + i3, periodX)
        + perm[mod(mod(jj + j3, periodY)
          + perm[mod(mod(kk + k3, periodZ)
            + perm[mod(mod(ll + l3, periodW), 256)], 256)], 256)]) % 256;
      t3 *= t3;
      n3 = t3 * t3 * (permGrad4x[gi3] * x3 + permGrad4y[gi3] * y3 + permGrad4z[gi3] * z3 + permGrad4w[gi3] * w3);
    }
    let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
    if (t4 < 0) n4 = 0.0;
    else {
      const gi4 = (mod(ii + 1, periodX)
        + perm[mod(mod(jj + 1, periodY)
          + perm[mod(mod(kk + 1, periodZ)
            + perm[mod(mod(ll + 1, periodW), 256)], 256)], 256)]) % 256;
      t4 *= t4;
      n4 = t4 * t4 * (permGrad4x[gi4] * x4 + permGrad4y[gi4] * y4 + permGrad4z[gi4] * z4 + permGrad4w[gi4] * w4);
    }
    return 27.0 * (n0 + n1 + n2 + n3 + n4);
  };
}

/**
 * Builds a random permutation table.
 * This is exported only for (internal) testing purposes.
 * Do not rely on this export.
 * @private
 */
export function buildPermutationTable(random: RandomFn): Uint8Array {
  const tableSize = 512;
  const p = new Uint8Array(tableSize);
  for (let i = 0; i < tableSize / 2; i++) {
    p[i] = i;
  }
  for (let i = 0; i < tableSize / 2 - 1; i++) {
    const r = i + ~~(random() * (256 - i));
    const aux = p[i];
    p[i] = p[r];
    p[r] = aux;
  }
  for (let i = 256; i < tableSize; i++) {
    p[i] = p[i - 256];
  }
  return p;
}
