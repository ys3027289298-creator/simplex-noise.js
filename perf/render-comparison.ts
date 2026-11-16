/**
 * Renders simplex and value noise from identical coordinates to PNG for a
 * visual side-by-side comparison.
 *
 *   node --import tsx perf/render-comparison.ts
 */
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import alea from 'alea';
import { createNoise2D, createValueNoise2D } from '../simplex-noise';

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts/comparison');
fs.mkdirSync(outDir, { recursive: true });

const size = 512;
const scale = 0.015625; // 8 lattice cells across the image, same for both families
const seed = 'comparison-seed';

const simplex = createNoise2D(alea(seed));
const value = createValueNoise2D(alea(seed));

function render(noise: (x: number, y: number) => number): Buffer {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise(x * scale, y * scale);
      const v = Math.max(0, Math.min(255, Math.round(n * 127.5 + 127.5)));
      const i = (y * size + x) * 4;
      png.data[i] = v;
      png.data[i + 1] = v;
      png.data[i + 2] = v;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const simplexPng = render(simplex);
const valuePng = render(value);
fs.writeFileSync(path.join(outDir, 'simplex2D.png'), simplexPng);
fs.writeFileSync(path.join(outDir, 'value2D.png'), valuePng);

// side by side with a 4px divider
{
  const a = PNG.sync.read(simplexPng);
  const b = PNG.sync.read(valuePng);
  const divider = 4;
  const combined = new PNG({ width: size * 2 + divider, height: size, colorType: 6 });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < combined.width; x++) {
      const i = (y * combined.width + x) * 4;
      if (x < size) {
        const src = (y * size + x) * 4;
        combined.data[i] = a.data[src];
        combined.data[i + 1] = a.data[src + 1];
        combined.data[i + 2] = a.data[src + 2];
      } else if (x < size + divider) {
        combined.data[i] = 229;
        combined.data[i + 1] = 57;
        combined.data[i + 2] = 53;
      } else {
        const src = (y * size + (x - size - divider)) * 4;
        combined.data[i] = b.data[src];
        combined.data[i + 1] = b.data[src + 1];
        combined.data[i + 2] = b.data[src + 2];
      }
      combined.data[i + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(outDir, 'side-by-side.png'), PNG.sync.write(combined));
}
console.log(`wrote ${outDir}/simplex2D.png, value2D.png, side-by-side.png (${size}x${size}, left simplex, right value)`);
