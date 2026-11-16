/**
 * Exercises every documented failure and edge path of the value-noise API and
 * asserts the exact observed behavior. Exits non-zero if anything deviates.
 *
 *   node --import tsx perf/failure-paths.ts
 */
import fs from 'fs';
import path from 'path';
import alea from 'alea';
import { createValueNoise2D, createValueNoise3D } from '../simplex-noise';

const root = path.resolve(__dirname, '..');

type Row = {
  case: string;
  invoke: string;
  expected: string;
  observed: string;
  passed: boolean;
};

const rows: Row[] = [];

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `non-Error thrown: ${String(error)}`;
}

/** Asserts that fn throws a TypeError with the given message fragment. */
function expectTypeError(caseName: string, invoke: string, fn: () => unknown, message: string) {
  let observed: string;
  let passed: boolean;
  try {
    fn();
    observed = 'no throw';
    passed = false;
  } catch (error) {
    observed = describeError(error);
    passed = observed === `TypeError: ${message}`;
  }
  rows.push({ case: caseName, invoke, expected: `TypeError: ${message}`, observed, passed });
}

/** Asserts a predicate about the returned value, no throw expected. */
function expectValue(caseName: string, invoke: string, fn: () => unknown, expected: string, predicate: (v: unknown) => boolean) {
  let value: unknown;
  let observed: string;
  let passed: boolean;
  try {
    value = fn();
    observed = `returned ${typeof value === 'number' ? Object.is(value, -0) ? '-0' : String(value) : JSON.stringify(value)}`;
    passed = predicate(value);
  } catch (error) {
    observed = `threw ${describeError(error)}`;
    passed = false;
  }
  rows.push({ case: caseName, invoke, expected, observed, passed });
}

// --- factory argument validation -------------------------------------------

expectTypeError(
  'createValueNoise2D receives a string',
  'createValueNoise2D(\'not-a-function\')',
  () => createValueNoise2D('not-a-function' as unknown as () => number),
  'random is not a function'
);
expectTypeError(
  'createValueNoise3D receives a number',
  'createValueNoise3D(42)',
  () => createValueNoise3D(42 as unknown as () => number),
  'random is not a function'
);
expectTypeError(
  'createValueNoise2D receives null',
  'createValueNoise2D(null)',
  () => createValueNoise2D(null as unknown as () => number),
  'random is not a function'
);
expectTypeError(
  'createValueNoise3D receives an object',
  'createValueNoise3D({})',
  () => createValueNoise3D({} as unknown as () => number),
  'random is not a function'
);

// --- default argument -------------------------------------------------------

expectValue(
  'createValueNoise3D() defaults to Math.random',
  'createValueNoise3D()(0.1, 0.2, 0.3)',
  () => createValueNoise3D()(0.1, 0.2, 0.3),
  'finite number in [-1, 1]',
  v => typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1
);

// --- PRNG errors propagate -------------------------------------------------

{
  const failing = () => { throw new Error('PRNG failure injected'); };
  const expected = 'Error: PRNG failure injected';
  let observed: string;
  let passed: boolean;
  try {
    createValueNoise2D(failing);
    observed = 'no throw';
    passed = false;
  } catch (error) {
    observed = describeError(error);
    passed = observed === expected;
  }
  rows.push({
    case: 'random function throws during table construction',
    invoke: 'createValueNoise2D(failingPrng)',
    expected,
    observed,
    passed
  });
}

// --- non-finite coordinates -------------------------------------------------

expectValue(
  'NaN x coordinate',
  'valueNoise2D(NaN, 1)',
  () => createValueNoise2D(alea('failure'))(NaN, 1),
  'NaN, no throw',
  v => typeof v === 'number' && Number.isNaN(v)
);
expectValue(
  'NaN in time (3D z)',
  'valueNoise3D(1, NaN, 1)',
  () => createValueNoise3D(alea('failure'))(1, NaN, 1),
  'NaN, no throw',
  v => typeof v === 'number' && Number.isNaN(v)
);
expectValue(
  '+Infinity coordinate',
  'valueNoise2D(Infinity, 0.5)',
  () => createValueNoise2D(alea('failure'))(Infinity, 0.5),
  'non-finite, no throw',
  v => typeof v === 'number' && !Number.isFinite(v)
);
expectValue(
  '-Infinity coordinate (3D)',
  'valueNoise3D(1, 1, -Infinity)',
  () => createValueNoise3D(alea('failure'))(1, 1, -Infinity),
  'non-finite, no throw',
  v => typeof v === 'number' && !Number.isFinite(v)
);

// --- caller contract violation: PRNG outside [0, 1) ------------------------

expectValue(
  'PRNG outside the documented [0,1) contract',
  'createValueNoise2D(() => -1)',
  () => createValueNoise2D(() => -1)(0.5, 0.5),
  'no throw, finite but biased table (documented contract violation)',
  v => typeof v === 'number' && Number.isFinite(v)
);

// --- huge / out-of-range coordinates still stay in [-1, 1] -----------------

for (const [x, y] of [[2 ** 31 - 1, 1], [-(2 ** 31), -1], [1e9, -1e9], [5e9, 5e9]]) {
  expectValue(
    `large coordinate (${x}, ${y})`,
    `valueNoise2D(${x}, ${y})`,
    () => createValueNoise2D(alea('failure'))(x, y),
    'finite in [-1, 1] (2^31 coordinate contract boundary)',
    v => typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1
  );
}

// --- report -----------------------------------------------------------------

const failed = rows.filter(r => !r.passed);
const result = {
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  total: rows.length,
  passed: rows.length - failed.length,
  allPassed: failed.length === 0,
  rows
};

fs.mkdirSync(path.join(root, 'artifacts/verification'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'artifacts/verification/failure-paths.json'),
  JSON.stringify(result, null, 2) + '\n'
);

for (const row of rows) {
  console.log(`${row.passed ? 'PASS' : 'FAIL'}  ${row.case}`);
  console.log(`      invoke:   ${row.invoke}`);
  console.log(`      expected: ${row.expected}`);
  console.log(`      observed: ${row.observed}`);
}
console.log(`\n${result.passed}/${result.total} passed`);

if (!result.allPassed) process.exit(1);
