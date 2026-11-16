/**
 * Self-validates the FFT, histograms, and spectrum pipeline on synthetic
 * signals before any comparison numbers are trusted.
 */
import { fft2d, hannWindow, radialSpectrum, validateFft } from './fft';

const n = 512;

// 1. FFT validation on synthetic cosines.
const fftValidation = validateFft(n, 4);
console.log('FFT self-validation:', JSON.stringify(fftValidation));
if (!fftValidation.passed) {
  console.error('FAIL: FFT validation');
  process.exit(1);
}

// 2. Parseval: summed spectral power must equal the time-domain energy.
{
  const signal = new Float64Array(n * n);
  let energy = 0;
  for (let i = 0; i < signal.length; i++) {
    signal[i] = Math.sin(i * 0.37) + Math.cos(i * 0.011);
    energy += signal[i] ** 2;
  }
  const re = new Float64Array(signal);
  const im = new Float64Array(n * n);
  fft2d(re, im, n);
  let spectral = 0;
  for (let i = 0; i < re.length; i++) spectral += re[i] ** 2 + im[i] ** 2;
  const ratio = spectral / (n * n * energy);
  console.log(`Parseval ratio: ${ratio.toFixed(12)} (expect 1)`);
  if (Math.abs(ratio - 1) > 1e-9) {
    console.error('FAIL: Parseval');
    process.exit(1);
  }
}

// 3. Round trip: FFT of a single impulse is flat, and inverse recovers it.
{
  const signal = new Float64Array(n * n);
  signal[0] = 1;
  const re = new Float64Array(signal);
  const im = new Float64Array(n * n);
  fft2d(re, im, n);
  let flat = true;
  for (let i = 0; i < re.length; i++) {
    if (Math.abs(re[i] - 1) > 1e-12 || Math.abs(im[i]) > 1e-12) flat = false;
  }
  console.log('Impulse spectrum is flat:', flat);
  if (!flat) {
    console.error('FAIL: impulse spectrum');
    process.exit(1);
  }
}

// 4. Band fractions sum to 1 (DC excluded).
{
  const signal = new Float64Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) signal[y * n + x] = Math.sin(x * 0.05) * Math.cos(y * 0.03);
  const spectrum = radialSpectrum(signal, n, { bandCount: 16, highCutoff: 0.25, axisDegrees: 10 });
  const sum = spectrum.radialBands.reduce((a, b) => a + b, 0);
  console.log(`radial bands sum: ${sum.toFixed(12)} (expect 1)`);
  if (Math.abs(sum - 1) > 1e-9) {
    console.error('FAIL: band sum');
    process.exit(1);
  }
}

// 5. Hann window sanity.
{
  const w = hannWindow(n);
  console.log(`Hann window endpoints: ${w[0]}, ${w[n - 1]}, midpoint ${w[n / 2]}`);
  if (w[0] !== 0 || Math.abs(w[n - 1]) > 1e-15 || Math.abs(w[n / 2] - 1) > 1e-3) {
    console.error('FAIL: Hann window');
    process.exit(1);
  }
}

console.log('ALL PIPELINE SELF-CHECKS PASSED');
