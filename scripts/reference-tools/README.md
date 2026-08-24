# Reference tools

Node scripts used to build and verify the canonical board references for the
photo-scanning feature. Run `npm install` in this directory first. Input
photos are expected in `../../tmp/` (gitignored; board artwork is Roxley's
copyright and is not committed).

- `gen_canonical.js` — warps `reference_day.jpg` / `reference_night.jpg`
  (photos of the physical board) into the distortion-free square frame of
  `reference_base.jpg` (a flat render), producing `canonical_day.jpg` /
  `canonical_night.jpg` at 2048x2048.
- `warp_to_canonical.js <photo> <reference> <out>` — warps a game photo into
  the canonical frame (ORB 20000/12 levels + MAGSAC).
- `bench.js` — matches every `tmp/pic*.jpg` against the references and prints
  match/inlier counts. Used to confirm both board sides need a reference and
  that side selection by inlier count works.
- `overlay2.js` — draws `coords.json` markers onto warped game photos to
  verify link positions against real tile placements.
- `coords.json` — working copy of the link positions; the authoritative data
  is `src/linkPositions.js`. Moving a point here invalidates that link's
  reference patch, so rerun `export_ref_patches.js` afterwards.
- `export_ref_patches.js` — samples the reference cell grids at every link
  position from `canonical_*.jpg` into `public/scan/ref_patches.json`.
- `export_descriptors.js` — writes the ORB descriptors the browser matches
  against, `public/scan/ref_*.bin`. Neither ships the board artwork itself.

- `fit_protos.mjs` — re-centres the token color prototypes on the ground-truth
  tiles and prints a line to paste into `PROTOS`. Only colors with at least
  eight observations are fitted, so check what it skipped before pasting, and
  read the printed spread: a prototype is meaningful to about that precision.
  It fits on the same photos `evaluate.mjs` scores, so the color part of that
  score is self-consistent rather than held out. Fitting on five photos and
  scoring the sixth, rotating, is what would turn it into a measurement.

## Decision masks

Each link is scored over the printed route its tile sits on, traced as a
polyline with a band width. `src/linkMasks.js` is the authoritative copy.

The round trip is: `make_mask_data.mjs` → trace in `mask_tool.html` → save
`link_masks.json` → `make_link_masks.mjs` → `eval_masks.mjs`.

- `mask_tool.html` — the tracer. Drop `tmp/reference_base.jpg` on it, click
  along each route, save `link_masks.json`. Run `make_mask_data.mjs` first to
  refresh its link list, which also carries over any masks already traced.
- `make_link_masks.mjs` — regenerates `src/linkMasks.js` from
  `link_masks.json`. Run it after every tracing session; nothing else keeps the
  traced data and the shipped data in step.
- `eval_masks.mjs` — scores the masks against the plain disc on the
  ground-truth games and reports whether the change introduced any wrong
  answers. Both runs go through the production `classifyAllLinks`, so the
  numbers are the ones the app would produce. `--width x1.3` scales every band
  for a sweep; a path argument scores a candidate JSON instead of the shipped
  masks.
- `mask_overlay.mjs` — renders one image per mask into `mask_qa/` so a trace
  can be checked by eye against the printed route.
- `fix_samples.mjs <linkId>...` — moves a link's sample point to the centre of
  its traced band and rebuilds that link's reference patches, writing
  `sample_overrides.json` for `eval_masks.mjs` to try before anything ships.

- `band_coverage.mjs` — prints, per link, the weakest frac its sample points
  would give a tile anywhere on its band, and where on the route that is.
  `src/linkMasks.test.js` fails once a band drops below `MIN_BAND_TILE_FRAC`;
  this shows how much room each one has left.
- `frac_efficiency.mjs` — compares every ground-truth tile's measured frac
  against what its position geometrically allowed, which is where
  `MIN_BAND_TILE_FRAC` comes from: real tiles keep 0.81 of their ideal on
  average, 0.63 at the tenth percentile and 0.46 at worst, and the floor sits
  just above `AUTO_MIN_FRAC` over that tenth percentile. Rerun it when
  ground-truth photos are added.
- `add_points.mjs <out.json> [max points per link]` — writes a candidate
  `coords.json` with extra sample points on the links whose band reads below
  that floor. Points go on the band centreline, each one placed where it lifts
  the weakest reading most, and any a later point renders idle is dropped again.
  Score the result with `evaluate.mjs` and `stress_warp.mjs` before shipping it:
  every added point is also one more place an empty link can fire. Run against
  the shipped `coords.json` it should be a no-op.

## Checking for answers on empty board

`evaluate.mjs` scores the ground-truth games, so it only sees links the way a
real game presented them. Neither it nor the games cover the other half of the
question: whether a link reports a tile where there is none.

- `stress_warp.mjs [amplitude px] [wavelength px]` — takes the empty-board
  reference as the input, pushes it through a smooth displacement field that a
  single translation cannot undo (what a folded board leaves behind after the
  homography), and lists every link that registers anything. All of them should
  come back empty. 4 and 8px at 400px are around what real photos leave; 12 is
  past it, so firing there is not by itself a defect. Run it after touching a
  mask, a sample point, or any threshold in the classifier: it is the only
  check that a change has not started inventing tiles, and it needs no photos.

## industry_stats.json

The per-tile numbers transcribed from the rulebook: `vp` is what a flipped tile
scores, `linkVP` the number of link icons on its face. Nothing reads the file.
It is here because the transcription took a while and `src/` has no use for it:
players enter the icon count per location, and reading industry tiles is a
non-goal. The icons are on the flipped face only, so `linkVP` is a flipped-face
count, and the code that used to read this table was wrong to apply it to
unflipped tiles. The column has never been checked against the physical tiles.
