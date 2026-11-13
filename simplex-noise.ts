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
 * Samples the noise field in two dimensions
 * 
 * Coordinates should be finite, bigger than -2^31 and smaller than 2^31.
 * @param x
 * @param y
 * @returns a number in the interval [-1, 1]
 */
export type NoiseFunction2D = (x: number, y: number) => number;

/**
 * Creates a 2D noise function
 * @param random the random function that will be used to build the permutation table
 * @returns {NoiseFunction2D}
 */
export function createNoise2D(random: RandomFn = Math.random): NoiseFunction2D {
  const perm = buildPermutationTable(random);
  // precalculating this yields a little ~3% performance improvement.
  const permGrad2x = new Float64Array(perm).map(v => grad2[(v % 12) * 2]);
  const permGrad2y = new Float64Array(perm).map(v => grad2[(v % 12) * 2 + 1]);
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
 * Creates a 3D noise function
 * @param random the random function that will be used to build the permutation table
 * @returns {NoiseFunction3D}
 */
export function createNoise3D(random: RandomFn = Math.random): NoiseFunction3D {
  const perm = buildPermutationTable(random);
  // precalculating these seems to yield a speedup of over 15%
  const permGrad3x = new Float64Array(perm).map(v => grad3[(v % 12) * 3]);
  const permGrad3y = new Float64Array(perm).map(v => grad3[(v % 12) * 3 + 1]);
  const permGrad3z = new Float64Array(perm).map(v => grad3[(v % 12) * 3 + 2]);
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
 * Creates a 4D noise function
 * @param random the random function that will be used to build the permutation table
 * @returns {NoiseFunction4D}
 */
export function createNoise4D(random: RandomFn = Math.random): NoiseFunction4D {
  const perm = buildPermutationTable(random);
  // precalculating these leads to a ~10% speedup
  const permGrad4x = new Float64Array(perm).map(v => grad4[(v % 32) * 4]);
  const permGrad4y = new Float64Array(perm).map(v => grad4[(v % 32) * 4 + 1]);
  const permGrad4z = new Float64Array(perm).map(v => grad4[(v % 32) * 4 + 2]);
  const permGrad4w = new Float64Array(perm).map(v => grad4[(v % 32) * 4 + 3]);
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

// ---------------------------------------------------------------------------
// Worley / cellular noise
//
// The cellular implementation does not introduce any new hashing primitive:
// the same `fastFloor` and the same `perm` permutation table used by the
// simplex functions identify the grid cells. The code added below is only
// responsible for searching the feature points of the neighbouring cells and
// combining their distances (F1 / F2).
// ---------------------------------------------------------------------------

/**
 * Distance metrics supported by the cellular noise functions.
 *
 * - `euclidean`: straight line distance (the classic Worley metric)
 * - `manhattan`: taxicab / L1 distance
 * - `chebyshev`: chessboard / L-infinity distance
 */
export type CellularMetric = 'euclidean' | 'manhattan' | 'chebyshev';

export interface CellularOptions {
  /**
   * Distance metric used while searching for feature points.
   * Defaults to `euclidean`.
   */
  metric?: CellularMetric;
  /**
   * Number of feature points placed in every grid cell.
   * Defaults to 1. Must be a positive integer.
   */
  pointsPerCell?: number;
}

/**
 * The two closest feature point distances found for a sample position.
 * Both values use the selected metric directly (already square rooted for
 * the euclidean metric), so they can be combined freely, e.g. `f2 - f1`.
 */
export interface CellularResult {
  /** Distance to the closest feature point. */
  f1: number;
  /** Distance to the second closest feature point. */
  f2: number;
}

/**
 * Samples a cellular noise field in two dimensions.
 * @param x
 * @param y
 * @returns the F1 and F2 feature point distances
 */
export type CellularFunction2D = (x: number, y: number) => CellularResult;

/**
 * Samples a cellular noise field in three dimensions.
 * @param x
 * @param y
 * @param z
 * @returns the F1 and F2 feature point distances
 */
export type CellularFunction3D = (x: number, y: number, z: number) => CellularResult;

// Multiplicative congruential constants used once while deriving the jitter
// table from the shared permutation table. All arithmetic stays in 32 bit
// integers, which keeps the generated points identical on every platform.
const CELL_RANDOM_MULTIPLIER = 1664525;
const CELL_RANDOM_INCREMENT = 1013904223;
const TWO_POW_32 = 4294967296;

/**
 * Builds the per-factory jitter table. Every entry is a deterministic feature
 * point offset in the interval [0, 1) per axis. The table is indexed through
 * the same permutation table hashing used by the simplex implementations, so
 * no second hashing primitive is introduced: a cell hash selects an entry and
 * the cellular code only performs the neighbour search and distance work.
 *
 * @param components number of offset components per entry (2 or 3)
 */
function buildJitterTable(components: number): Float64Array {
  const table = new Float64Array(512 * components);
  for (let entry = 0; entry < 512; entry++) {
    // a non-zero seed keeps the first LCG step well defined
    let state = Math.imul(entry + 1, 0x9e3779b1) >>> 0;
    for (let component = 0; component < components; component++) {
      state = (Math.imul(state, CELL_RANDOM_MULTIPLIER) + CELL_RANDOM_INCREMENT) >>> 0;
      table[entry * components + component] = state / TWO_POW_32;
    }
  }
  return table;
}

/**
 * Selects the jitter table entry for one of the feature points of a cell.
 * The cell hash comes straight from the shared permutation table. The point
 * index is folded in through multiplicative LCG steps rather than a plain
 * offset so that the feature points of a single cell never alias the same
 * table entry while point 0 keeps using the cell hash directly.
 */
function jitterEntry(cellHash: number, point: number): number {
  let entry = cellHash;
  for (let step = 0; step < point; step++) {
    entry = (Math.imul(entry, CELL_RANDOM_MULTIPLIER) + CELL_RANDOM_INCREMENT) >>> 0;
  }
  return entry & 511;
}

/**
 * Creates a 2D Worley/cellular noise function.
 *
 * Grid cells are identified with the same permutation table hashing used by
 * {@link createNoise2D}; only the feature point search and the F1/F2 distance
 * combination are specific to this function.
 * @param random the random function that will be used to build the permutation table
 * @param options metric and feature point density options
 * @returns {CellularFunction2D}
 */
export function createCellular2D(random: RandomFn = Math.random, options: CellularOptions = {}): CellularFunction2D {
  const perm = buildPermutationTable(random);
  const metric: CellularMetric = options.metric === undefined ? 'euclidean' : options.metric;
  const pointsPerCell = Math.max(1, Math.floor(options.pointsPerCell === undefined ? 1 : options.pointsPerCell));
  // two jitter components per entry, all derived from the shared permutation table
  const jitter = buildJitterTable(2);
  const result: CellularResult = { f1: 0, f2: 0 };
  // Fast path for the common single feature point case: no per-point loop and
  // no salt computation, the cell hash indexes the jitter table directly.
  if (pointsPerCell === 1) {
    if (metric === 'manhattan') {
      return function cellular2DManhattan(x: number, y: number): CellularResult {
        const ix = fastFloor(x);
        const iy = fastFloor(y);
        let f1 = Infinity;
        let f2 = Infinity;
        for (let oy = -1; oy <= 1; oy++) {
          const cy = iy + oy;
          const rowHash = perm[cy & 255];
          for (let ox = -1; ox <= 1; ox++) {
            const cx = ix + ox;
            const j = perm[(cx & 255) + rowHash] * 2;
            const distance = Math.abs(cx + jitter[j] - x) + Math.abs(cy + jitter[j + 1] - y);
            if (distance < f1) {
              f2 = f1;
              f1 = distance;
            }
            else if (distance < f2) {
              f2 = distance;
            }
          }
        }
        result.f1 = f1;
        result.f2 = f2;
        return result;
      };
    }
    if (metric === 'chebyshev') {
      return function cellular2DChebyshev(x: number, y: number): CellularResult {
        const ix = fastFloor(x);
        const iy = fastFloor(y);
        let f1 = Infinity;
        let f2 = Infinity;
        for (let oy = -1; oy <= 1; oy++) {
          const cy = iy + oy;
          const rowHash = perm[cy & 255];
          for (let ox = -1; ox <= 1; ox++) {
            const cx = ix + ox;
            const j = perm[(cx & 255) + rowHash] * 2;
            const distance = Math.max(Math.abs(cx + jitter[j] - x), Math.abs(cy + jitter[j + 1] - y));
            if (distance < f1) {
              f2 = f1;
              f1 = distance;
            }
            else if (distance < f2) {
              f2 = distance;
            }
          }
        }
        result.f1 = f1;
        result.f2 = f2;
        return result;
      };
    }
    return function cellular2D(x: number, y: number): CellularResult {
      const ix = fastFloor(x);
      const iy = fastFloor(y);
      let f1 = Infinity;
      let f2 = Infinity;
      for (let oy = -1; oy <= 1; oy++) {
        const cy = iy + oy;
        const rowHash = perm[cy & 255];
        for (let ox = -1; ox <= 1; ox++) {
          const cx = ix + ox;
          const j = perm[(cx & 255) + rowHash] * 2;
          const dx = cx + jitter[j] - x;
          const dy = cy + jitter[j + 1] - y;
          const distance = dx * dx + dy * dy;
          if (distance < f1) {
            f2 = f1;
            f1 = distance;
          }
          else if (distance < f2) {
            f2 = distance;
          }
        }
      }
      result.f1 = Math.sqrt(f1);
      result.f2 = Math.sqrt(f2);
      return result;
    };
  }
  // Resolve the metric once per created function instead of once per sample.
  if (metric === 'manhattan') {
    return function cellular2DManhattan(x: number, y: number): CellularResult {
      const ix = fastFloor(x);
      const iy = fastFloor(y);
      let f1 = Infinity;
      let f2 = Infinity;
      for (let oy = -1; oy <= 1; oy++) {
        const cy = iy + oy;
        const rowHash = perm[cy & 255];
        for (let ox = -1; ox <= 1; ox++) {
          const cx = ix + ox;
          // identical cell hashing scheme as the 2D simplex implementation
          const cellHash = perm[(cx & 255) + rowHash];
          for (let point = 0; point < pointsPerCell; point++) {
            const entry = jitterEntry(cellHash, point);
            const dx = cx + jitter[entry * 2] - x;
            const dy = cy + jitter[entry * 2 + 1] - y;
            const distance = Math.abs(dx) + Math.abs(dy);
            if (distance < f1) {
              f2 = f1;
              f1 = distance;
            }
            else if (distance < f2) {
              f2 = distance;
            }
          }
        }
      }
      result.f1 = f1;
      result.f2 = f2;
      return result;
    };
  }
  if (metric === 'chebyshev') {
    return function cellular2DChebyshev(x: number, y: number): CellularResult {
      const ix = fastFloor(x);
      const iy = fastFloor(y);
      let f1 = Infinity;
      let f2 = Infinity;
      for (let oy = -1; oy <= 1; oy++) {
        const cy = iy + oy;
        const rowHash = perm[cy & 255];
        for (let ox = -1; ox <= 1; ox++) {
          const cx = ix + ox;
          const cellHash = perm[(cx & 255) + rowHash];
          for (let point = 0; point < pointsPerCell; point++) {
            const entry = jitterEntry(cellHash, point);
            const dx = cx + jitter[entry * 2] - x;
            const dy = cy + jitter[entry * 2 + 1] - y;
            const distance = Math.max(Math.abs(dx), Math.abs(dy));
            if (distance < f1) {
              f2 = f1;
              f1 = distance;
            }
            else if (distance < f2) {
              f2 = distance;
            }
          }
        }
      }
      result.f1 = f1;
      result.f2 = f2;
      return result;
    };
  }
  return function cellular2D(x: number, y: number): CellularResult {
    const ix = fastFloor(x);
    const iy = fastFloor(y);
    let f1 = Infinity;
    let f2 = Infinity;
    for (let oy = -1; oy <= 1; oy++) {
      const cy = iy + oy;
      const rowHash = perm[cy & 255];
      for (let ox = -1; ox <= 1; ox++) {
        const cx = ix + ox;
        // identical cell hashing scheme as the 2D simplex implementation
        const cellHash = perm[(cx & 255) + rowHash];
        for (let point = 0; point < pointsPerCell; point++) {
          const entry = jitterEntry(cellHash, point);
          const dx = cx + jitter[entry * 2] - x;
          const dy = cy + jitter[entry * 2 + 1] - y;
          const distance = dx * dx + dy * dy;
          if (distance < f1) {
            f2 = f1;
            f1 = distance;
          }
          else if (distance < f2) {
            f2 = distance;
          }
        }
      }
    }
    result.f1 = Math.sqrt(f1);
    result.f2 = Math.sqrt(f2);
    return result;
  };
}

/**
 * Creates a 3D Worley/cellular noise function.
 *
 * Grid cells are identified with the same permutation table hashing used by
 * {@link createNoise3D}; only the feature point search and the F1/F2 distance
 * combination are specific to this function.
 * @param random the random function that will be used to build the permutation table
 * @param options metric and feature point density options
 * @returns {CellularFunction3D}
 */
export function createCellular3D(random: RandomFn = Math.random, options: CellularOptions = {}): CellularFunction3D {
  const perm = buildPermutationTable(random);
  const metric: CellularMetric = options.metric === undefined ? 'euclidean' : options.metric;
  const pointsPerCell = Math.max(1, Math.floor(options.pointsPerCell === undefined ? 1 : options.pointsPerCell));
  // three jitter components per entry, all derived from the shared permutation table
  const jitter = buildJitterTable(3);
  const result: CellularResult = { f1: 0, f2: 0 };
  // Fast path for the common single feature point case.
  if (pointsPerCell === 1) {
    if (metric === 'manhattan') {
      return function cellular3DManhattan(x: number, y: number, z: number): CellularResult {
        const ix = fastFloor(x);
        const iy = fastFloor(y);
        const iz = fastFloor(z);
        let f1 = Infinity;
        let f2 = Infinity;
        for (let oz = -1; oz <= 1; oz++) {
          const cz = iz + oz;
          const planeHash = perm[cz & 255];
          for (let oy = -1; oy <= 1; oy++) {
            const cy = iy + oy;
            const rowHash = perm[(cy & 255) + planeHash];
            for (let ox = -1; ox <= 1; ox++) {
              const cx = ix + ox;
              const j = perm[(cx & 255) + rowHash] * 3;
              const distance = Math.abs(cx + jitter[j] - x)
                + Math.abs(cy + jitter[j + 1] - y)
                + Math.abs(cz + jitter[j + 2] - z);
              if (distance < f1) {
                f2 = f1;
                f1 = distance;
              }
              else if (distance < f2) {
                f2 = distance;
              }
            }
          }
        }
        result.f1 = f1;
        result.f2 = f2;
        return result;
      };
    }
    if (metric === 'chebyshev') {
      return function cellular3DChebyshev(x: number, y: number, z: number): CellularResult {
        const ix = fastFloor(x);
        const iy = fastFloor(y);
        const iz = fastFloor(z);
        let f1 = Infinity;
        let f2 = Infinity;
        for (let oz = -1; oz <= 1; oz++) {
          const cz = iz + oz;
          const planeHash = perm[cz & 255];
          for (let oy = -1; oy <= 1; oy++) {
            const cy = iy + oy;
            const rowHash = perm[(cy & 255) + planeHash];
            for (let ox = -1; ox <= 1; ox++) {
              const cx = ix + ox;
              const j = perm[(cx & 255) + rowHash] * 3;
              const distance = Math.max(
                Math.max(Math.abs(cx + jitter[j] - x), Math.abs(cy + jitter[j + 1] - y)),
                Math.abs(cz + jitter[j + 2] - z)
              );
              if (distance < f1) {
                f2 = f1;
                f1 = distance;
              }
              else if (distance < f2) {
                f2 = distance;
              }
            }
          }
        }
        result.f1 = f1;
        result.f2 = f2;
        return result;
      };
    }
    return function cellular3D(x: number, y: number, z: number): CellularResult {
      const ix = fastFloor(x);
      const iy = fastFloor(y);
      const iz = fastFloor(z);
      let f1 = Infinity;
      let f2 = Infinity;
      const xMasked = ix & 255;
      for (let oz = -1; oz <= 1; oz++) {
        const cz = iz + oz;
        const planeHash = perm[cz & 255];
        for (let oy = -1; oy <= 1; oy++) {
          const cy = iy + oy;
          const rowHash = perm[(cy & 255) + planeHash];
          // The three x neighbours are fixed per row; resolve their jitter
          // entries up front and evaluate them without a third nested loop.
          const j0 = perm[((xMasked + 255) & 255) + rowHash] * 3;
          const j1 = perm[xMasked + rowHash] * 3;
          const j2 = perm[((xMasked + 1) & 255) + rowHash] * 3;
          const cx0 = ix - 1;
          const cx2 = ix + 1;
          let dx = cx0 + jitter[j0] - x;
          let dy = cy + jitter[j0 + 1] - y;
          let dz = cz + jitter[j0 + 2] - z;
          let distance = dx * dx + dy * dy + dz * dz;
          if (distance < f1) {
            f2 = f1;
            f1 = distance;
          }
          else if (distance < f2) {
            f2 = distance;
          }
          dx = ix + jitter[j1] - x;
          dy = cy + jitter[j1 + 1] - y;
          dz = cz + jitter[j1 + 2] - z;
          distance = dx * dx + dy * dy + dz * dz;
          if (distance < f1) {
            f2 = f1;
            f1 = distance;
          }
          else if (distance < f2) {
            f2 = distance;
          }
          dx = cx2 + jitter[j2] - x;
          dy = cy + jitter[j2 + 1] - y;
          dz = cz + jitter[j2 + 2] - z;
          distance = dx * dx + dy * dy + dz * dz;
          if (distance < f1) {
            f2 = f1;
            f1 = distance;
          }
          else if (distance < f2) {
            f2 = distance;
          }
        }
      }
      result.f1 = Math.sqrt(f1);
      result.f2 = Math.sqrt(f2);
      return result;
    };
  }
  if (metric === 'manhattan') {
    return function cellular3DManhattan(x: number, y: number, z: number): CellularResult {
      const ix = fastFloor(x);
      const iy = fastFloor(y);
      const iz = fastFloor(z);
      let f1 = Infinity;
      let f2 = Infinity;
      for (let oz = -1; oz <= 1; oz++) {
        const cz = iz + oz;
        const planeHash = perm[cz & 255];
        for (let oy = -1; oy <= 1; oy++) {
          const cy = iy + oy;
          const rowHash = perm[(cy & 255) + planeHash];
          for (let ox = -1; ox <= 1; ox++) {
            const cx = ix + ox;
            const cellHash = perm[(cx & 255) + rowHash];
            for (let point = 0; point < pointsPerCell; point++) {
              const entry = jitterEntry(cellHash, point);
              const j = entry * 3;
              const dx = cx + jitter[j] - x;
              const dy = cy + jitter[j + 1] - y;
              const dz = cz + jitter[j + 2] - z;
              const distance = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
              if (distance < f1) {
                f2 = f1;
                f1 = distance;
              }
              else if (distance < f2) {
                f2 = distance;
              }
            }
          }
        }
      }
      result.f1 = f1;
      result.f2 = f2;
      return result;
    };
  }
  if (metric === 'chebyshev') {
    return function cellular3DChebyshev(x: number, y: number, z: number): CellularResult {
      const ix = fastFloor(x);
      const iy = fastFloor(y);
      const iz = fastFloor(z);
      let f1 = Infinity;
      let f2 = Infinity;
      for (let oz = -1; oz <= 1; oz++) {
        const cz = iz + oz;
        const planeHash = perm[cz & 255];
        for (let oy = -1; oy <= 1; oy++) {
          const cy = iy + oy;
          const rowHash = perm[(cy & 255) + planeHash];
          for (let ox = -1; ox <= 1; ox++) {
            const cx = ix + ox;
            const cellHash = perm[(cx & 255) + rowHash];
            for (let point = 0; point < pointsPerCell; point++) {
              const entry = jitterEntry(cellHash, point);
              const j = entry * 3;
              const dx = cx + jitter[j] - x;
              const dy = cy + jitter[j + 1] - y;
              const dz = cz + jitter[j + 2] - z;
              const distance = Math.max(Math.max(Math.abs(dx), Math.abs(dy)), Math.abs(dz));
              if (distance < f1) {
                f2 = f1;
                f1 = distance;
              }
              else if (distance < f2) {
                f2 = distance;
              }
            }
          }
        }
      }
      result.f1 = f1;
      result.f2 = f2;
      return result;
    };
  }
  return function cellular3D(x: number, y: number, z: number): CellularResult {
    const ix = fastFloor(x);
    const iy = fastFloor(y);
    const iz = fastFloor(z);
    let f1 = Infinity;
    let f2 = Infinity;
    for (let oz = -1; oz <= 1; oz++) {
      const cz = iz + oz;
      const planeHash = perm[cz & 255];
      for (let oy = -1; oy <= 1; oy++) {
        const cy = iy + oy;
        const rowHash = perm[(cy & 255) + planeHash];
        for (let ox = -1; ox <= 1; ox++) {
          const cx = ix + ox;
          // identical cell hashing scheme as the 3D simplex implementation
          const cellHash = perm[(cx & 255) + rowHash];
          for (let point = 0; point < pointsPerCell; point++) {
            const entry = jitterEntry(cellHash, point);
            const j = entry * 3;
            const dx = cx + jitter[j] - x;
            const dy = cy + jitter[j + 1] - y;
            const dz = cz + jitter[j + 2] - z;
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance < f1) {
              f2 = f1;
              f1 = distance;
            }
            else if (distance < f2) {
              f2 = distance;
            }
          }
        }
      }
    }
    result.f1 = Math.sqrt(f1);
    result.f2 = Math.sqrt(f2);
    return result;
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
