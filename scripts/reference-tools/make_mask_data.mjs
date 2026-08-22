// Generate mask_tool_data.js for mask_tool.html. The tool is a plain file://
// page, so its data arrives as a sibling <script> rather than a fetch.
//   node make_mask_data.mjs
import { readFileSync, writeFileSync, existsSync } from "fs";
import { LINKS } from "./boardData.mjs";
import { LINK_POSITIONS } from "./linkPositions.mjs";

// Links the classifier currently sends to review, plus every link the
// close-pair rule flags as crowded. Traced first; the rest are optional.
const PRIORITY = [
  "birmingham-nuneaton", "birmingham-tamworth", "birmingham-coventry", "birmingham-oxford",
  "nuneaton-tamworth", "tamworth-walsall", "belper-derby", "derby-nottingham",
  "derby-uttoxeter", "stafford-stone", "cannock-stafford", "cannock-farmNorth",
  "cannock-wolverhampton", "walsall-wolverhampton",
];

const links = LINKS.map((l) => ({
  id: l.id,
  locations: l.locations,
  canal: l.canal,
  rail: l.rail,
  era: l.canal && l.rail ? "both" : l.canal ? "canal only" : "rail only",
  pts: (Array.isArray(LINK_POSITIONS[l.id][0]) ? LINK_POSITIONS[l.id] : [LINK_POSITIONS[l.id]]),
  priority: PRIORITY.includes(l.id),
}));
// Carry over any masks already traced so regenerating never loses work.
let existing = {};
if (existsSync("./link_masks.json")) {
  existing = JSON.parse(readFileSync("./link_masks.json", "utf8"));
  console.log(`carried over ${Object.keys(existing).length} existing masks`);
}

// Untraced links first so the list reads as a work queue; priority, then name.
const done = (id) => (existing[id] && existing[id].pts.length >= 2 ? 1 : 0);
links.sort((a, b) =>
  done(a.id) - done(b.id) || (b.priority - a.priority) || a.id.localeCompare(b.id));

writeFileSync("./mask_tool_data.js",
  `window.MASK_DATA = ${JSON.stringify({ links, existing })};\n`);
console.log(`written mask_tool_data.js (${links.length} links, ${PRIORITY.length} priority)`);
