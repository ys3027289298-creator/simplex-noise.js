#!/bin/sh
# Regenerates every artifact in artifacts/ from scratch.
#
#   sh perf/run-all.sh
#
# Requires: node_modules installed (npm ci) and the pristine pre-change source
# at artifacts/baseline/simplex-noise.orig.ts.
set -e
cd "$(dirname "$0")/.."

echo '== 1/7 bit-identical check (simplex outputs unchanged) =='
node --import tsx perf/verify-bit-identical.ts

echo '== 2/7 failure paths =='
node --import tsx perf/failure-paths.ts

echo '== 3/7 memory bounds (requires --expose-gc) =='
node --expose-gc --import tsx perf/memory-bounds.ts

echo '== 4/7 FFT pipeline self-check =='
node --import tsx perf/fft-self-check.ts

echo '== 5/7 histogram / spectrum / timing comparison =='
node --import tsx perf/compare-value-noise.ts

echo '== 6/7 side-by-side render =='
node --import tsx perf/render-comparison.ts

echo '== 7/7 report assembly =='
node --import tsx perf/write-report.ts

echo 'all artifacts regenerated'
