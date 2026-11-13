import { createCellular2D, createCellular3D } from '../../simplex-noise';
import Alea from 'alea';
console.log(JSON.stringify([
  createCellular2D(Alea('stone-seed'), { pointsPerCell: 3 })(1.23, -4.56),
  createCellular3D(Alea('stone-seed'), { metric: 'manhattan' })(1.23, -4.56, 7.89)
]));
