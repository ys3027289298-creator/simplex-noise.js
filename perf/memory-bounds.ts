/**
 * Measures the exact typed-array allocation and retained footprint of every
 * noise factory, and proves the returned sample functions allocate nothing per
 * call.
 *
 * Allocation is recorded two ways:
 *  - a Proxy around every typed-array constructor catches `new X(...)` calls,
 *  - a wrapper around each prototype's `map` catches the species-constructed
 *    result arrays (which bypass the constructor Proxy).
 *
 * Retained memory is measured for real: every recorded allocation is handed to
 * a WeakRef, then GC runs and the surviving objects are summed. This separates
 * short-lived copies from what the factory closure actually retains.
 *
 *   node --expose-gc --import tsx perf/memory-bounds.ts
 */
import fs from 'fs';
import path from 'path';
import alea from 'alea';
import {
  createNoise2D, createNoise3D, createNoise4D,
  createValueNoise2D, createValueNoise3D
} from '../simplex-noise';

const root = path.resolve(__dirname, '..');

type Allocation = { kind: string, length: number, bytes: number };
type Bound = {
  allocations: Allocation[];
  allocatedBytes: number;
  retainedAllocations: Allocation[];
  retainedBytes: number;
};

const typedArrayNames = [
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
  'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float32Array', 'Float64Array'
] as const;

type AnyTypedArray = { length: number, byteLength: number };
type Ctor = new (arg: unknown) => AnyTypedArray;

const globals = globalThis as unknown as Record<string, unknown>;

let recorded: Array<{ kind: string, array: AnyTypedArray }> = [];
let recording = false;

function record(kind: string, array: AnyTypedArray): void {
  if (recording) recorded.push({ kind, array });
}

// 1. Proxy the constructors.
for (const name of typedArrayNames) {
  const Ctor = globals[name] as Ctor;
  globals[name] = new Proxy(Ctor, {
    construct(target, args) {
      const instance = Reflect.construct(target, args) as AnyTypedArray;
      record(name, instance);
      return instance;
    }
  });
}

// 2. Wrap prototype.map so species-constructed results are counted too.
for (const name of typedArrayNames) {
  const Ctor = globals[name] as Ctor & { prototype: AnyTypedArray & { map: (...args: unknown[]) => AnyTypedArray } };
  const originalMap = Ctor.prototype.map;
  Ctor.prototype.map = function (this: AnyTypedArray, ...args: unknown[]): AnyTypedArray {
    const result = originalMap.apply(this, args);
    record(`${name}.map`, result);
    return result;
  };
}

const gc = (globalThis as { gc?: () => void }).gc;
const gcAvailable = typeof gc === 'function';

// WeakRef is available in Node 14.6+ but is not in this project's ES2019 lib.
declare const WeakRef: new <T extends object>(target: T) => { deref(): T | undefined };

const nextTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0));

async function collect(): Promise<void> {
  if (gc === undefined) return;
  // temp objects must be unreachable before GC can see them; yield to a new
  // turn and collect a few times so WeakRefs are cleared deterministically
  await nextTurn();
  gc();
  gc();
  await nextTurn();
  gc();
}

async function measure<T>(factory: () => T): Promise<{ value: T, bound: Bound }> {
  recorded = [];
  recording = true;
  const value = factory();
  recording = false;

  // Copy the metadata out, then drop every strong reference to the arrays
  // (both the recording buffer and the metadata objects) before collecting,
  // otherwise nothing can be freed and everything would look retained.
  const metadata = recorded.map(e => ({ kind: e.kind, length: e.array.length, bytes: e.array.byteLength }));
  const refs = recorded.map(e => new WeakRef(e.array));
  recorded = [];
  await collect();

  const alive: Allocation[] = [];
  for (let i = 0; i < metadata.length; i++) {
    if (refs[i].deref() !== undefined) alive.push(metadata[i]);
  }
  const sum = (list: Allocation[]) => list.reduce((total, a) => total + a.bytes, 0);
  return {
    value,
    bound: {
      allocations: metadata,
      allocatedBytes: sum(metadata),
      retainedAllocations: alive,
      retainedBytes: sum(alive)
    }
  };
}

const factories: Array<{ name: string, create: () => (...args: number[]) => number, arity: number }> = [
  { name: 'createNoise2D', create: () => createNoise2D(alea('memory')), arity: 2 },
  { name: 'createValueNoise2D', create: () => createValueNoise2D(alea('memory')), arity: 2 },
  { name: 'createNoise3D', create: () => createNoise3D(alea('memory')), arity: 3 },
  { name: 'createValueNoise3D', create: () => createValueNoise3D(alea('memory')), arity: 3 },
  { name: 'createNoise4D', create: () => createNoise4D(alea('memory')), arity: 4 }
];

const exactBounds: Record<string, Bound> = {};
const perCallRows: Array<Record<string, unknown>> = [];
const samples = 1_000_000;
const rounds = 5;

async function main() {
  for (const { name, create, arity } of factories) {
    const { value, bound } = await measure(create);
    exactBounds[name] = bound;

    // Count allocations while sampling; sample values are accumulated so the
    // calls cannot be optimized away.
    const allocationCounts: number[] = [];
    const heapDeltas: number[] = [];
    let sink = 0;
    for (let round = 0; round < rounds; round++) {
      await collect();
      const before = process.memoryUsage().heapUsed;
      recorded = [];
      recording = true;
      for (let i = 0; i < samples; i++) {
        const x = (i % 1000) * 0.0137 - 3.0;
        const y = (Math.floor(i / 1000) % 1000) * 0.0179 - 4.0;
        const z = (Math.floor(i / 1_000_000) % 1000) * 0.0211 - 5.0;
        const w = i * 0.0001;
        sink += arity === 2 ? value(x, y) : arity === 3 ? value(x, y, z) : value(x, y, z, w);
      }
      recording = false;
      const allocationCount = recorded.length;
      await collect();
      const after = process.memoryUsage().heapUsed;
      allocationCounts.push(allocationCount);
      heapDeltas.push(after - before);
    }
    perCallRows.push({
      factory: name,
      samplesPerRound: samples,
      rounds,
      typedArrayAllocationsPerRound: allocationCounts,
      maxTypedArrayAllocationsPerRound: Math.max(...allocationCounts),
      heapUsedDeltaBytesPerRound: heapDeltas,
      sink
    });
  }

  const result = {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    gcExposed: gcAvailable,
    method: 'typed-array constructors and TypedArray.prototype.map are instrumented; retained = allocations still reachable (WeakRef) after forced GC, which is what the factory closure keeps',
    exactBounds,
    allocationFreeSampling: {
      samplesPerRound: samples,
      rounds,
      rows: perCallRows,
      allRoundsZero: perCallRows.every(r => (r.maxTypedArrayAllocationsPerRound as number) === 0)
    }
  };

  fs.mkdirSync(path.join(root, 'artifacts/verification'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'artifacts/verification/memory-bounds.json'),
    JSON.stringify(result, null, 2) + '\n'
  );

  const lines = [
    `node ${process.version} ${process.platform}/${process.arch} (gc exposed: ${gcAvailable})`,
    '',
    'per-instance typed-array footprint (retained after forced GC):'
  ];
  for (const [name, bound] of Object.entries(exactBounds)) {
    const transient = bound.allocatedBytes - bound.retainedBytes;
    lines.push(`  ${name.padEnd(20)} retained ${String(bound.retainedBytes).padStart(6)} B  ` +
      `= ${bound.retainedAllocations.map(a => `${a.kind}(${a.length})`).join(' + ')}` +
      (transient > 0 ? `   [${transient} B transient, collected]` : ''));
  }
  lines.push('', `per-call typed-array allocations over ${samples} samples x ${rounds} rounds:`);
  for (const row of perCallRows) {
    lines.push(`  ${String(row.factory).padEnd(20)} ${JSON.stringify(row.typedArrayAllocationsPerRound)}`);
  }
  lines.push('', `all sampling rounds allocation free: ${result.allocationFreeSampling.allRoundsZero}`);
  fs.writeFileSync(path.join(root, 'artifacts/verification/memory-bounds.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));

  // sanity: the retained set must be exactly what the source implies
  const expected: Record<string, number> = {
    createNoise2D: 512 + 2 * 4096,
    createValueNoise2D: 512 + 4096,
    createNoise3D: 512 + 3 * 4096,
    createValueNoise3D: 512 + 4096,
    createNoise4D: 512 + 4 * 4096
  };
  let failed = !result.allocationFreeSampling.allRoundsZero;
  for (const [name, bytes] of Object.entries(expected)) {
    const actual = exactBounds[name].retainedBytes;
    if (actual !== bytes) {
      console.error(`FAIL: ${name} retained ${actual} B, expected ${bytes} B`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
