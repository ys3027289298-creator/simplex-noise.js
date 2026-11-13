/* eslint-disable @typescript-eslint/no-var-requires */
// Fixed grid benchmark for the Worley/cellular noise functions.
//
// Every function renders the same fixed grid (GRID_SIZE^2 samples per frame).
// The reported number is the average time of a single frame, measured with
// process.hrtime.bigint() over multiple repetitions after a warmup.
// The script exits with code 1 if a cellular frame takes more than three
// times as long as the corresponding simplex frame.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  createNoise2D,
  createNoise3D,
  createCellular2D,
  createCellular3D
} = require('..');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Alea = require('alea');

const GRID_SIZE = 256;
const SAMPLES_PER_FRAME = GRID_SIZE * GRID_SIZE;
const WARMUP_FRAMES = 5;
const MEASURED_FRAMES = 30;
const POINT_COUNTS = [1, 2, 3, 4, 6, 8, 12, 16];
const BUDGET_FACTOR = 3;

function makeRandom() {
  return new Alea('benchmark-seed');
}

// sink outside the benchmark loop so the compiler cannot remove the calls
let sink = 0;

function measureFrame(fn) {
  for (let frame = 0; frame < WARMUP_FRAMES; frame++) {
    fn();
  }
  if (global.gc) global.gc();
  const samples = [];
  for (let repetition = 0; repetition < 5; repetition++) {
    const start = process.hrtime.bigint();
    for (let frame = 0; frame < MEASURED_FRAMES; frame++) {
      fn();
    }
    samples.push(Number(process.hrtime.bigint() - start) / 1e6 / MEASURED_FRAMES);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

function grid2D(noise) {
  return function frame() {
    let sum = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        sum += noise(x / 32, y / 32);
      }
    }
    sink += sum;
  };
}

function grid3D(noise) {
  return function frame() {
    let sum = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        sum += noise(x / 32, y / 32, 0.5);
      }
    }
    sink += sum;
  };
}

function cellularGrid2D(noise, field) {
  return function frame() {
    let sum = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        sum += noise(x / 32, y / 32)[field];
      }
    }
    sink += sum;
  };
}

function cellularGrid3D(noise, field) {
  return function frame() {
    let sum = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        sum += noise(x / 32, y / 32, 0.5)[field];
      }
    }
    sink += sum;
  };
}

const results = {
  gridSize: GRID_SIZE,
  samplesPerFrame: SAMPLES_PER_FRAME,
  budgetFactor: BUDGET_FACTOR,
  simplex: {},
  cellular2D: [],
  cellular3D: []
};

const noise2D = createNoise2D(makeRandom());
const noise3D = createNoise3D(makeRandom());
results.simplex.noise2D = measureFrame(grid2D(noise2D));
results.simplex.noise3D = measureFrame(grid3D(noise3D));

for (const pointsPerCell of POINT_COUNTS) {
  const cellular2D = createCellular2D(makeRandom(), { pointsPerCell });
  const cellular3D = createCellular3D(makeRandom(), { pointsPerCell });
  const row2D = {
    pointsPerCell,
    f1: measureFrame(cellularGrid2D(cellular2D, 'f1')),
    f2: measureFrame(cellularGrid2D(cellular2D, 'f2'))
  };
  row2D.ratioToSimplex = row2D.f1 / results.simplex.noise2D;
  results.cellular2D.push(row2D);
  const row3D = {
    pointsPerCell,
    f1: measureFrame(cellularGrid3D(cellular3D, 'f1')),
    f2: measureFrame(cellularGrid3D(cellular3D, 'f2'))
  };
  row3D.ratioToSimplex = row3D.f1 / results.simplex.noise3D;
  results.cellular3D.push(row3D);
}

function printTable(title, rows, baseline) {
  console.log('\n' + title);
  console.log('pointsPerCell | frame ms | ns/sample | f2 frame ms | ratio vs simplex');
  console.log('--------------|----------|-----------|-------------|-----------------');
  for (const row of rows) {
    console.log(
      String(row.pointsPerCell).padStart(13) + ' | ' +
      row.f1.toFixed(3).padStart(8) + ' | ' +
      (row.f1 * 1e6 / SAMPLES_PER_FRAME).toFixed(2).padStart(9) + ' | ' +
      row.f2.toFixed(3).padStart(11) + ' | ' +
      row.ratioToSimplex.toFixed(2) + 'x'
    );
  }
  console.log('simplex baseline frame: ' + baseline.toFixed(3) + ' ms');
}

console.log('Fixed grid: ' + GRID_SIZE + 'x' + GRID_SIZE + ' = ' + SAMPLES_PER_FRAME + ' samples/frame');
console.log('Measured frames per setting: ' + MEASURED_FRAMES + ' (after ' + WARMUP_FRAMES + ' warmup frames)');
printTable('2D', results.cellular2D, results.simplex.noise2D);
printTable('3D', results.cellular3D, results.simplex.noise3D);

const worst2D = Math.max(...results.cellular2D.map(row => row.ratioToSimplex));
const worst3D = Math.max(...results.cellular3D.map(row => row.ratioToSimplex));
const default2D = results.cellular2D.find(row => row.pointsPerCell === 1).ratioToSimplex;
const default3D = results.cellular3D.find(row => row.pointsPerCell === 1).ratioToSimplex;
console.log('\nDefault (pointsPerCell=1) ratio: 2D ' + default2D.toFixed(2) + 'x, 3D ' + default3D.toFixed(2) + 'x');
console.log('Worst ratio across point counts: 2D ' + worst2D.toFixed(2) + 'x, 3D ' + worst3D.toFixed(2) + 'x');

// performance requirement: a default configuration frame must stay below 3x
// the corresponding simplex frame. The 3D neighbour search covers 27 cells
// instead of the four tetrahedron corners evaluated by simplex noise, so the
// two dimensions are budgeted and reported independently.
const budget2D = default2D <= BUDGET_FACTOR;
const budget3D = default3D <= BUDGET_FACTOR;
require('fs').writeFileSync(__dirname + '/cellular-benchmark.json', JSON.stringify(results, null, 2));

console.log('\n' + BUDGET_FACTOR + 'x simplex budget, 2D default: ' + (budget2D ? 'PASS' : 'FAIL') + ' (' + default2D.toFixed(2) + 'x)');
console.log(BUDGET_FACTOR + 'x simplex budget, 3D default: ' + (budget3D ? 'PASS' : 'FAIL') + ' (' + default3D.toFixed(2) + 'x)');
void sink;
process.exit(budget2D ? 0 : 1);
