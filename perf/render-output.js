/* eslint-disable @typescript-eslint/no-var-requires */
// Renders cellular texture samples and the feature-point-count timing curve
// into the output/ directory using only repository dependencies (pngjs).
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const Alea = require('alea');
const {
  createNoise2D,
  createCellular2D,
  createCellular3D
} = require('..');

const outputDir = path.join(__dirname, '..', 'output');
fs.mkdirSync(outputDir, { recursive: true });
const SIZE = 384;

function writeGrayPng(filename, sample) {
  const png = new PNG({ width: SIZE, height: SIZE, colorType: 0, inputColorType: 0 });
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let value = Math.round(sample(x, y) * 255);
      if (value < 0) value = 0;
      if (value > 255) value = 255;
      const offset = (y * SIZE + x) * 4;
      png.data[offset] = value;
      png.data[offset + 1] = value;
      png.data[offset + 2] = value;
      png.data[offset + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(outputDir, filename), PNG.sync.write(png.pack(), { colorType: 0 }));
}

const scale = 12;
const seeded = (name) => Alea(name);

writeGrayPng('stone-cellular2D-f1.png', (x, y) => {
  const r = createCellular2D(seeded('stone'))(x / scale, y / scale);
  return Math.min(1, r.f1 * 1.6);
});
writeGrayPng('stone-cellular2D-f2-minus-f1.png', (x, y) => {
  const r = createCellular2D(seeded('stone'))(x / scale, y / scale);
  return Math.min(1, (r.f2 - r.f1) * 2.2);
});
writeGrayPng('stone-cellular2D-manhattan.png', (x, y) => {
  const r = createCellular2D(seeded('stone'), { metric: 'manhattan' })(x / scale, y / scale);
  return Math.min(1, r.f1 * 1.4);
});
writeGrayPng('stone-cellular2D-chebyshev.png', (x, y) => {
  const r = createCellular2D(seeded('stone'), { metric: 'chebyshev' })(x / scale, y / scale);
  return Math.min(1, r.f1 * 1.4);
});
writeGrayPng('stone-cellular2D-four-points.png', (x, y) => {
  const r = createCellular2D(seeded('stone'), { pointsPerCell: 4 })(x / scale, y / scale);
  return Math.min(1, r.f1 * 1.8);
});
writeGrayPng('stone-cellular3D-f1-slice.png', (x, y) => {
  const r = createCellular3D(seeded('stone'))(x / scale, y / scale, 0.5);
  return Math.min(1, r.f1 * 1.6);
});
// side by side: simplex alone cannot make the cell pattern, for comparison
const simplex = createNoise2D(seeded('stone'));
writeGrayPng('comparison-simplex2D.png', (x, y) => simplex(x / scale, y / scale) * 0.5 + 0.5);

function renderCurveChart(filename, benchmark) {
  const width = 900;
  const height = 560;
  const marginLeft = 90;
  const marginBottom = 90;
  const marginTop = 60;
  const marginRight = 40;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;
  const png = new PNG({ width, height });
  const px = (pngX, pngY, r, g, b) => {
    const idx = (pngY * width + pngX) * 4;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = 255;
  };
  const line = (x0, y0, x1, y1, r, g, b) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      px(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), r, g, b);
    }
  };
  const maxPoints = benchmark.cellular2D[benchmark.cellular2D.length - 1].pointsPerCell;
  const maxRatio = Math.max(
    ...benchmark.cellular2D.map((row) => row.ratioToSimplex),
    ...benchmark.cellular3D.map((row) => row.ratioToSimplex)
  );
  const xOf = (points) => marginLeft + ((points - 1) / (maxPoints - 1)) * plotW;
  const yOf = (ratio) => marginTop + plotH - (ratio / maxRatio) * plotH;
  // background
  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) px(xx, yy, 255, 255, 255);
  }
  // axes and gridlines
  for (let i = 0; i <= 5; i++) {
    const gy = marginTop + (plotH / 5) * i;
    line(marginLeft, gy, width - marginRight, gy, 225, 225, 225);
  }
  line(marginLeft, marginTop, marginLeft, marginTop + plotH, 0, 0, 0);
  line(marginLeft, marginTop + plotH, width - marginRight, marginTop + plotH, 0, 0, 0);
  const drawSeries = (rows, r, g, b) => {
    for (let i = 0; i < rows.length - 1; i++) {
      line(xOf(rows[i].pointsPerCell), yOf(rows[i].ratioToSimplex),
        xOf(rows[i + 1].pointsPerCell), yOf(rows[i + 1].ratioToSimplex), r, g, b);
    }
    for (const row of rows) {
      const cx = Math.round(xOf(row.pointsPerCell));
      const cy = Math.round(yOf(row.ratioToSimplex));
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (dx * dx + dy * dy <= 16) px(cx + dx, cy + dy, r, g, b);
        }
      }
    }
  };
  drawSeries(benchmark.cellular2D, 38, 120, 210);
  drawSeries(benchmark.cellular3D, 210, 90, 60);
  fs.writeFileSync(path.join(outputDir, filename), PNG.sync.write(png.pack()));
  return { xOf, yOf, maxRatio, maxPoints, width, height };
}

const benchmarkPath = path.join(__dirname, 'cellular-benchmark.json');
if (fs.existsSync(benchmarkPath)) {
  const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  renderCurveChart('feature-points-timing-curve.png', benchmark);
  fs.writeFileSync(path.join(outputDir, 'benchmark-data.json'), JSON.stringify(benchmark, null, 2));
  const csv = [
    'dimension,pointsPerCell,frameMs,nsPerSample,ratioToSimplex',
    ...benchmark.cellular2D.map((r) => `2D,${r.pointsPerCell},${r.f1.toFixed(4)},${(r.f1 * 1e6 / benchmark.samplesPerFrame).toFixed(2)},${r.ratioToSimplex.toFixed(3)}`),
    ...benchmark.cellular3D.map((r) => `3D,${r.pointsPerCell},${r.f1.toFixed(4)},${(r.f1 * 1e6 / benchmark.samplesPerFrame).toFixed(2)},${r.ratioToSimplex.toFixed(3)}`)
  ].join('\n');
  fs.writeFileSync(path.join(outputDir, 'feature-points-timing.csv'), csv + '\n');
}
console.log('rendered output artifacts to', outputDir);
