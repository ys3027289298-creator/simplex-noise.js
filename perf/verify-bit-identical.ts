/**
 * Verifies that the value-noise change left every simplex code path
 * bit-identical.
 *
 * The pristine pre-change source is transpiled and evaluated side by side with
 * the current source, both fed identical seeded PRNG streams. Outputs are
 * compared with Object.is, which distinguishes -0 and treats NaN as equal.
 *
 *   node --import tsx perf/verify-bit-identical.ts
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import alea from 'alea';
import * as current from '../simplex-noise';

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'artifacts/baseline/simplex-noise.orig.ts');
const currentPath = path.join(root, 'simplex-noise.ts');

type NoiseModule = typeof current;

function loadBaseline(): NoiseModule {
  const source = fs.readFileSync(baselinePath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 }
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const evaluate = new Function('exports', 'module', 'require', js);
  evaluate(module.exports, module, require);
  return module.exports as NoiseModule;
}

const baseline = loadBaseline();

type Check = { name: string, samples: number, mismatches: number, firstMismatch?: unknown };

/**
 * Compares two same-length arrays of numbers, using Object.is.
 */
function compareArrays(name: string, a: ArrayLike<number>, b: ArrayLike<number>): Check {
  if (a.length !== b.length) throw new Error(`${name}: length mismatch`);
  const check: Check = { name, samples: a.length, mismatches: 0 };
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) {
      check.mismatches++;
      if (check.firstMismatch === undefined) check.firstMismatch = { index: i, baseline: a[i], current: b[i] };
    }
  }
  return check;
}

function sampleBoth(
  impls: [NoiseModule, NoiseModule],
  samples: number,
  sample: (impl: NoiseModule, index: number) => number
): Check {
  const a = new Float64Array(samples);
  const b = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    a[i] = sample(impls[0], i);
    b[i] = sample(impls[1], i);
  }
  return compareArrays('', a, b);
}

const checks: Check[] = [];
const pair: [NoiseModule, NoiseModule] = [baseline, current];

// 1. Permutation table, byte for byte.
{
  const a = baseline.buildPermutationTable(alea('bit-identical'));
  const b = current.buildPermutationTable(alea('bit-identical'));
  checks.push(compareArrays('permutationTableBytes', a, b));
}

// 2. Fully materialized noise outputs over grids of identical coordinates.
//    Each seed produces an identical PRNG stream for both implementations.
{
  const noise = pair.map(m => m.createNoise2D(alea('bit-identical')));
  const size = 1024;
  const check = sampleBoth(pair, size * size, (impl, i) => noise[impl === baseline ? 0 : 1](
    (i % size) * 0.0137 - 7.01,
    Math.floor(i / size) * 0.0137 - 7.01
  ));
  check.name = 'noise2D';
  checks.push(check);
}
{
  const noise = pair.map(m => m.createNoise3D(alea('bit-identical')));
  const size = 64;
  const check = sampleBoth(pair, size * size * size, (impl, i) => noise[impl === baseline ? 0 : 1](
    (i % size) * 0.031 - 1.0,
    (Math.floor(i / size) % size) * 0.031 - 1.0,
    Math.floor(i / (size * size)) * 0.031 - 1.0
  ));
  check.name = 'noise3D';
  checks.push(check);
}
{
  const noise = pair.map(m => m.createNoise4D(alea('bit-identical')));
  const size = 64;
  const check = sampleBoth(pair, size * size * size * 4, (impl, i) => noise[impl === baseline ? 0 : 1](
    (i % size) * 0.031 - 1.0,
    (Math.floor(i / size) % size) * 0.031 - 1.0,
    (Math.floor(i / (size * size)) % size) * 0.031 - 1.0,
    Math.floor(i / (size * size * size)) * 0.5
  ));
  check.name = 'noise4D';
  checks.push(check);
}

// 3. Rendered pixels, the exact path the image-snapshot tests take.
{
  const noise = pair.map(m => m.createNoise2D(alea('Math.random')));
  const size = 256;
  const check = sampleBoth(pair, size * size, (impl, i) => {
    const x = (i % size) / size * 2 - 1;
    const y = Math.floor(i / size) / size * 2 - 1;
    return Math.round(noise[impl === baseline ? 0 : 1](x * 5, y * 5) * 128 + 127);
  });
  check.name = 'renderedPixels256x256';
  checks.push(check);
}

// 4. Lattice and extreme-coordinate edge cases.
{
  const noise = pair.map(m => m.createNoise2D(alea('edge')));
  const coordinates = [
    [0, 0], [1, 1], [-1, -1], [255, 255], [256, 256], [-256, -256], [65536.5, -65536.5],
    [2 ** 31 - 1, -(2 ** 31)], [0.5, 0.5], [-0, -0], [1e-9, -1e-9]
  ];
  const check = sampleBoth(pair, coordinates.length, (impl, i) =>
    noise[impl === baseline ? 0 : 1](coordinates[i][0], coordinates[i][1]));
  check.name = 'noise2DEdgeCoordinates';
  checks.push(check);
}

// 5. Source-level append-only check.
const baselineSource = fs.readFileSync(baselinePath);
const currentSource = fs.readFileSync(currentPath);
const prefix = currentSource.subarray(0, baselineSource.length).equals(baselineSource);

const result = {
  verdict: checks.every(c => c.mismatches === 0) && prefix ? 'BIT-IDENTICAL' : 'DIVERGED',
  baselineBytes: baselineSource.length,
  currentBytes: currentSource.length,
  baselineIsByteIdenticalPrefix: prefix,
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  checks: Object.fromEntries(checks.map(c => [c.name, c]))
};

fs.mkdirSync(path.join(root, 'artifacts/verification'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'artifacts/verification/bit-identical.json'),
  JSON.stringify(result, null, 2) + '\n'
);

const lines = [
  `verdict: ${result.verdict}`,
  `node ${process.version} ${process.platform}/${process.arch}`,
  `baseline source is byte-identical prefix of current source: ${prefix}`,
  ...checks.map(c => `${c.name}: ${c.samples} samples, ${c.mismatches} mismatches` +
    (c.firstMismatch ? ` first=${JSON.stringify(c.firstMismatch)}` : ''))
];
fs.writeFileSync(path.join(root, 'artifacts/verification/report.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));

if (result.verdict !== 'BIT-IDENTICAL') {
  console.error('FAIL: simplex behavior changed');
  process.exit(1);
}
