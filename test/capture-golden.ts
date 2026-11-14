// Captures the golden baseline of the legacy factories (run before the refactor):
//   npx tsx test/capture-golden.ts
// Re-running it must be a conscious decision (it overwrites the baseline).
import fs from 'fs';
import path from 'path';
import { computeGolden } from './golden-shared';

const outPath = path.join(__dirname, 'golden-noise.json');
fs.writeFileSync(outPath, JSON.stringify(computeGolden()));
console.log(`wrote ${outPath}`);
