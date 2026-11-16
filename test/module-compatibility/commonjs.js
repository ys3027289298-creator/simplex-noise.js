/* eslint-disable @typescript-eslint/no-var-requires */
const {createNoise2D, createValueNoise2D, createValueNoise3D} = require('simplex-noise');
console.log(require('simplex-noise'));
console.log(createNoise2D()(1, 2));
console.log(createValueNoise2D()(1, 2));
console.log(createValueNoise3D()(1, 2, 3));
