// Link tile positions on the canonical board frame (top-down square,
// normalized 0-1 coordinates, origin at top-left). Keys match LINKS ids in
// boardData.js. A value is one [x, y] point, or several sample points for
// links whose physical tile placement varies widely between games.
// Calibrated against two real-game photos (canal and rail era) warped into
// the canonical frame; classification patches cover a radius of ~0.03 (60px
// at 2048) around each point. cannock-stafford, nuneaton-tamworth and
// belper-derby are instead anchored to the centre of their printed route:
// their observed placements sat 69-100px off it, so their patches never saw
// the link at all. A patch centred off the route is worse than useless: it
// fills up with the neighbouring link instead, and belper-derby's took in
// derby-nottingham's tile, whose brightness dragged the patch's exposure
// median and lit up the printed rail line as a false detection. Moving a point
// here means rebuilding its reference patch with
// scripts/reference-tools/export_ref_patches.js, and its coords.json copy
// alongside; linkPositions.test.js pins the two together.
export const LINK_POSITIONS = {
  "stokeOnTrent-warrington": [0.345, 0.098],
  "leek-stokeOnTrent": [0.457, 0.084],
  "belper-leek": [0.64, 0.1],
  "belper-derby": [0.76373, 0.16972],
  "derby-nottingham": [0.836, 0.222],
  "stokeOnTrent-stone": [0.378, 0.232],
  "stone-uttoxeter": [0.43, 0.257],
  "derby-uttoxeter": [0.633, 0.247],
  "burtonOnTrent-stone": [0.559, 0.303],
  "burtonOnTrent-derby": [0.727, 0.331],
  "stafford-stone": [0.319, 0.332],
  "cannock-stafford": [0.47639, 0.38966],
  "burtonOnTrent-tamworth": [0.69, 0.448],
  "burtonOnTrent-cannock": [0.568, 0.407],
  "burtonOnTrent-walsall": [0.59, 0.505],
  "cannock-farmNorth": [0.375, 0.437],
  "cannock-wolverhampton": [0.413, 0.497],
  "cannock-walsall": [0.495, 0.513],
  "nuneaton-tamworth": [0.78054, 0.52735],
  "tamworth-walsall": [0.635, 0.563],
  "walsall-wolverhampton": [0.437, 0.532],
  "coalbrookdale-wolverhampton": [0.307, 0.531],
  "coalbrookdale-shrewsbury": [0.167, 0.535],
  "dudley-wolverhampton": [0.371, 0.62],
  "coalbrookdale-kidderminster": [0.259, 0.672],
  "dudley-kidderminster": [0.352, 0.722],
  "kidderminster-worcester": [0.347, 0.82],
  "gloucester-worcester": [0.437, 0.903],
  "gloucester-redditch": [0.497, 0.867],
  "redditch-oxford": [0.66, 0.83],
  "birmingham-oxford": [0.703, 0.77],
  "birmingham-redditch": [0.615, 0.75],
  "birmingham-worcester": [0.501, 0.76],
  "birmingham-dudley": [0.53, 0.687],
  "birmingham-walsall": [0.555, 0.617],
  "birmingham-tamworth": [[0.69, 0.638], [0.664, 0.604]],
  "birmingham-nuneaton": [0.71, 0.677],
  "birmingham-coventry": [0.719, 0.735],
  "coventry-nuneaton": [0.855, 0.665],
};
