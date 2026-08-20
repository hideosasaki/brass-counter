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
  is `src/linkPositions.js`.
