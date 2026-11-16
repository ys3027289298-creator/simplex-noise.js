import {createNoise2D, createValueNoise2D, createValueNoise3D} from 'simplex-noise';
console.log(createNoise2D()(1, 2));
console.log(createValueNoise2D()(1, 2));
console.log(createValueNoise3D()(1, 2, 3));
