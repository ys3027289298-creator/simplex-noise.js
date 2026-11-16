/**
 * Computes a small, self-validating 2D FFT (radix-2, in-place) for the
 * spectrum comparison. Also computes radial-band power fractions.
 */

export type Spectrum = {
  /** fractional non-DC power per radial band, bins 0..bandCount-1 */
  radialBands: number[];
  /** power fraction within `axisDegrees` of the kx or ky axis (non-DC) */
  axisBandFraction: number;
  /** power fraction above `highCutoff * n` radial distance (non-DC) */
  highFrequencyFraction: number;
  totalNonDcPower: number;
};

export function fft2d(re: Float64Array, im: Float64Array, n: number): void {
  const bits = Math.log2(n);
  if (!Number.isInteger(bits)) throw new Error('FFT size must be a power of two');
  const rowRe = new Float64Array(n);
  const rowIm = new Float64Array(n);
  // rows: gather stride-1 segments
  const gatherRe = new Float64Array(n);
  const gatherIm = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      gatherRe[x] = re[y * n + x];
      gatherIm[x] = im[y * n + x];
    }
    fft1d(gatherRe, gatherIm, rowRe, rowIm, n, bits);
    for (let x = 0; x < n; x++) {
      re[y * n + x] = gatherRe[x];
      im[y * n + x] = gatherIm[x];
    }
  }
  // columns: gather stride-n segments
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      gatherRe[y] = re[y * n + x];
      gatherIm[y] = im[y * n + x];
    }
    fft1d(gatherRe, gatherIm, rowRe, rowIm, n, bits);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = gatherRe[y];
      im[y * n + x] = gatherIm[y];
    }
  }
}

function reverseBits(value: number, bits: number): number {
  let result = 0;
  for (let i = 0; i < bits; i++) {
    result = (result << 1) | (value & 1);
    value >>= 1;
  }
  return result;
}

function fft1d(
  re: Float64Array, im: Float64Array,
  scratchRe: Float64Array, scratchIm: Float64Array,
  n: number, bits: number
): void {
  // bit reversal permutation in place
  for (let i = 0; i < n; i++) {
    const j = reverseBits(i, bits);
    if (j > i) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  void scratchRe;
  void scratchIm;
}

/**
 * Hann window, which reduces spectral leakage between adjacent bands.
 */
export function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}

/**
 * Measures the radial power distribution of a 2D signal.
 * `bandCount` radial bands span radius [0, n/2].
 */
export function radialSpectrum(
  signal: Float64Array, n: number,
  options: { bandCount: number, highCutoff: number, axisDegrees: number }
): Spectrum {
  const re = new Float64Array(signal);
  const im = new Float64Array(n * n);
  fft2d(re, im, n);

  const bandPower = new Float64Array(options.bandCount);
  let totalNonDcPower = 0;
  let axisPower = 0;
  let highPower = 0;
  const sinAxis = Math.sin(options.axisDegrees * Math.PI / 180);
  const maxRadius = n / 2;

  for (let y = 0; y < n; y++) {
    const ky = y <= n / 2 ? y : y - n;
    for (let x = 0; x < n; x++) {
      if (x === 0 && y === 0) continue; // DC
      const kx = x <= n / 2 ? x : x - n;
      const power = re[y * n + x] ** 2 + im[y * n + x] ** 2;
      const radius = Math.hypot(kx, ky);
      const band = Math.min(options.bandCount - 1, Math.floor(radius / maxRadius * options.bandCount));
      bandPower[band] += power;
      totalNonDcPower += power;
      if (radius >= options.highCutoff * n) highPower += power;
      // within axisDegrees of the kx axis means |ky|/r <= sin(axisDegrees),
      // and symmetrically for the ky axis. A single bin can only satisfy one
      // of these for axisDegrees < 45.
      if (Math.abs(ky) / radius <= sinAxis || Math.abs(kx) / radius <= sinAxis) axisPower += power;
    }
  }

  return {
    radialBands: Array.from(bandPower, p => totalNonDcPower === 0 ? 0 : p / totalNonDcPower),
    axisBandFraction: totalNonDcPower === 0 ? 0 : axisPower / totalNonDcPower,
    highFrequencyFraction: totalNonDcPower === 0 ? 0 : highPower / totalNonDcPower,
    totalNonDcPower
  };
}

/**
 * Validates the FFT by transforming an axis-aligned and a diagonal cosine and
 * checking that the peak lands on the expected frequency bin. Also probes that
 * the axis metric separates an axis-aligned cosine from a diagonal one.
 */
export function validateFft(n: number, frequency: number): {
  axisCosinePeak: { fx: number, fy: number },
  diagonalCosinePeak: { fx: number, fy: number },
  axisCosineAxisFraction: number,
  diagonalCosineAxisFraction: number,
  passed: boolean
} {
  function peakOf(signal: Float64Array): { fx: number, fy: number } {
    const re = new Float64Array(signal);
    const im = new Float64Array(n * n);
    fft2d(re, im, n);
    let best = -1;
    let bx = 0;
    let by = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (x === 0 && y === 0) continue;
        const p = re[y * n + x] ** 2 + im[y * n + x] ** 2;
        if (p > best) {
          best = p;
          bx = x <= n / 2 ? x : x - n;
          by = y <= n / 2 ? y : y - n;
        }
      }
    }
    return { fx: bx, fy: by };
  }

  const axis = new Float64Array(n * n);
  const diagonal = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      axis[y * n + x] = Math.cos(2 * Math.PI * frequency * x / n);
      diagonal[y * n + x] = Math.cos(2 * Math.PI * frequency * (x + y) / n);
    }
  }

  const axisPeak = peakOf(axis);
  const diagonalPeak = peakOf(diagonal);
  const axisSpectrum = radialSpectrum(axis, n, { bandCount: 16, highCutoff: 0.25, axisDegrees: 10 });
  const diagonalSpectrum = radialSpectrum(diagonal, n, { bandCount: 16, highCutoff: 0.25, axisDegrees: 10 });

  const passed = axisPeak.fx === frequency && axisPeak.fy === 0 &&
    diagonalPeak.fx === frequency && diagonalPeak.fy === frequency &&
    axisSpectrum.axisBandFraction > 0.99 && diagonalSpectrum.axisBandFraction < 0.05;

  return {
    axisCosinePeak: axisPeak,
    diagonalCosinePeak: diagonalPeak,
    axisCosineAxisFraction: axisSpectrum.axisBandFraction,
    diagonalCosineAxisFraction: diagonalSpectrum.axisBandFraction,
    passed
  };
}
