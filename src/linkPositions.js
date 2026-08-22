// Link tile positions on the canonical board frame (top-down square,
// normalized 0-1 coordinates, origin at top-left). Keys match LINKS ids in
// boardData.js. A value is one [x, y] point, or several points for links whose
// band is too long for one patch to read: a patch reaches 100px from its point
// and sees less and less of a tile toward that edge, so a tile out on a long
// route reads too weak to answer for without asking, or is not reached at all.
// scripts/reference-tools/add_points.mjs places the extra ones, and only where
// the reading falls below MIN_BAND_TILE_FRAC - a point costs somewhere a tile
// can be read against one more place an empty link can fire.
// Calibrated against two real-game photos (canal and rail era) warped into
// the canonical frame. cannock-stafford, nuneaton-tamworth and
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
  "stokeOnTrent-warrington": [0.34521, 0.09814],
  "leek-stokeOnTrent": [0.45703, 0.08398],
  "belper-leek": [0.64014, 0.1001],
  "belper-derby": [0.76367, 0.16992],
  "derby-nottingham": [0.83594, 0.22217],
  "stokeOnTrent-stone": [0.37793, 0.23193],
  "stone-uttoxeter": [[0.43018, 0.25684], [0.5, 0.24072], [0.38623, 0.24951]],
  "derby-uttoxeter": [[0.63281, 0.24707], [0.69287, 0.26123]],
  "burtonOnTrent-stone": [[0.55908, 0.30322], [0.38086, 0.27979], [0.64307, 0.33838], [0.46973, 0.2915], [0.4834, 0.29248]],
  "burtonOnTrent-derby": [0.72705, 0.33105],
  "stafford-stone": [0.31885, 0.33203],
  "cannock-stafford": [0.47656, 0.38965],
  "burtonOnTrent-tamworth": [0.68994, 0.44824],
  "burtonOnTrent-cannock": [[0.56787, 0.40723], [0.61719, 0.37207], [0.53516, 0.42676]],
  "burtonOnTrent-walsall": [[0.58984, 0.50488], [0.60742, 0.43506]],
  "cannock-farmNorth": [0.375, 0.43701],
  "cannock-wolverhampton": [0.41309, 0.49707],
  "cannock-walsall": [0.49512, 0.51318],
  "nuneaton-tamworth": [0.78076, 0.52734],
  "tamworth-walsall": [0.63477, 0.56299],
  "walsall-wolverhampton": [0.43701, 0.53223],
  "coalbrookdale-wolverhampton": [0.30713, 0.53076],
  "coalbrookdale-shrewsbury": [0.16699, 0.53516],
  "dudley-wolverhampton": [0.37109, 0.62012],
  "coalbrookdale-kidderminster": [[0.25879, 0.67188], [0.29785, 0.72656], [0.24316, 0.64453]],
  "dudley-kidderminster": [0.35205, 0.72217],
  "kidderminster-worcester": [[0.34717, 0.81982], [0.29639, 0.8374]],
  "gloucester-worcester": [0.43701, 0.90283],
  "gloucester-redditch": [0.49707, 0.86719],
  "redditch-oxford": [0.66016, 0.83008],
  "birmingham-oxford": [[0.70313, 0.77002], [0.71729, 0.77295]],
  "birmingham-redditch": [0.61523, 0.75],
  "birmingham-worcester": [[0.50098, 0.75977], [0.42676, 0.86328], [0.54102, 0.71143], [0.48633, 0.79346]],
  "birmingham-dudley": [[0.52979, 0.68701], [0.51025, 0.6709]],
  "birmingham-walsall": [0.55518, 0.61719],
  "birmingham-tamworth": [[0.68994, 0.63818], [0.66406, 0.604]],
  "birmingham-nuneaton": [[0.70996, 0.67676], [0.72314, 0.61914]],
  "birmingham-coventry": [0.71924, 0.73486],
  "coventry-nuneaton": [[0.85498, 0.66504], [0.85596, 0.64697]],
};
