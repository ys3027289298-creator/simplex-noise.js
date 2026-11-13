import { createNoise2D, createNoise3D, createNoise4D, createCellular2D, createCellular3D } from '../simplex-noise';
import Alea from 'alea';

const noise2D = createNoise2D();
const noise3D = createNoise3D();
const noise4D = createNoise4D();
const cellular2D = createCellular2D(Alea('cellular'));
const cellularManhattan2D = createCellular2D(Alea('cellular'), { metric: 'manhattan' });
const cellularChebyshev2D = createCellular2D(Alea('cellular'), { metric: 'chebyshev' });
const cellularDense2D = createCellular2D(Alea('cellular'), { pointsPerCell: 4 });
const cellular3D = createCellular3D(Alea('cellular'));

function visualize(title, fn) {
  const canvas = document.createElement('canvas');
  const s = 512;
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx == null) throw new Error('Canvas 2d not supported');
  const imageData = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < imageData.data.length; i++) {
    const x = (fn(i % 512, ~~(i / 512)) + 1) * 128;
    imageData.data[i * 4] = x;
    imageData.data[i * 4 + 1] = x;
    imageData.data[i * 4 + 2] = x;
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  const h2 = document.createElement('h2');
  h2.innerHTML = title;
  document.body.appendChild(h2);
  document.body.appendChild(canvas);
}

visualize('noise2D x1', function (x, y) {
  return noise2D(x, y);
});
visualize('noise2D x20', function (x, y) {
  return noise2D(x / 20, y / 20);
});

visualize('noise2D x256', function (x, y) {
  return noise2D(x / 256, y / 256);
});

visualize('noise3D z0 x256', function (x, y) {
  return noise3D(x / 256, y / 256, 0);
});

visualize('noise3D z0 x20', function (x, y) {
  return noise3D(x / 20, y / 20, 0);
});

visualize('noise3D z0.01 x20', function (x, y) {
  return noise3D(x / 20, y / 20, 0.01);
});

visualize('noise3D z1 x20', function (x, y) {
  return noise3D(x / 20, y / 20, 1);
});

visualize('noise4D z1 w1 x20', function (x, y) {
  return noise4D(x / 20, y / 20, 1, 1);
});

const seededNoise2D = createNoise2D(Alea('seed'));
visualize('seed noise2D', function (x, y) {
  return seededNoise2D(x / 20, y / 20);
});
const sameNoise2D = createNoise2D(Alea('seed'));
visualize('same seed noise2D', function (x, y) {
  return sameNoise2D(x / 20, y / 20);
});
const differentNoise2D = createNoise2D(Alea('different seed'));
visualize('different seed noise2D', function (x, y) {
  return differentNoise2D(x / 20, y / 20);
});

visualize('cellular2D F1 x20', function (x, y) {
  return cellular2D(x / 20, y / 20).f1 * 2 - 1;
});

visualize('cellular2D F2-F1 x20', function (x, y) {
  const r = cellular2D(x / 20, y / 20);
  return (r.f2 - r.f1) * 4 - 1;
});

visualize('cellular2D manhattan F1 x20', function (x, y) {
  return cellularManhattan2D(x / 20, y / 20).f1 * 2 - 1;
});

visualize('cellular2D chebyshev F1 x20', function (x, y) {
  return cellularChebyshev2D(x / 20, y / 20).f1 * 2 - 1;
});

visualize('cellular2D four points per cell F1 x20', function (x, y) {
  return cellularDense2D(x / 20, y / 20).f1 * 2 - 1;
});

visualize('cellular3D F1 z0 x20', function (x, y) {
  return cellular3D(x / 20, y / 20, 0).f1 * 2 - 1;
});

const seededCellular2D = createCellular2D(Alea('seed'));
visualize('seed cellular2D', function (x, y) {
  return seededCellular2D(x / 20, y / 20).f1 * 2 - 1;
});
const sameSeedCellular2D = createCellular2D(Alea('seed'));
visualize('same seed cellular2D', function (x, y) {
  return sameSeedCellular2D(x / 20, y / 20).f1 * 2 - 1;
});
