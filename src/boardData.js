// Board data for Brass: Birmingham.
// Cross-checked against the official rulebook (Roxley, 2018) and the
// npow/brass-birmingham implementation: 39 links, 20 cities, 5 merchants,
// 2 farm breweries.

// region matches the color of the city's name banner printed on the board.
export const CITIES = {
  belper: { name: "Belper", region: "derbyshire" },
  derby: { name: "Derby", region: "derbyshire" },
  leek: { name: "Leek", region: "staffordshire" },
  stokeOnTrent: { name: "Stoke-on-Trent", region: "staffordshire" },
  stone: { name: "Stone", region: "staffordshire" },
  uttoxeter: { name: "Uttoxeter", region: "staffordshire" },
  stafford: { name: "Stafford", region: "midlands" },
  burtonOnTrent: { name: "Burton-on-Trent", region: "midlands" },
  cannock: { name: "Cannock", region: "midlands" },
  tamworth: { name: "Tamworth", region: "midlands" },
  walsall: { name: "Walsall", region: "midlands" },
  wolverhampton: { name: "Wolverhampton", region: "blackCountry" },
  coalbrookdale: { name: "Coalbrookdale", region: "blackCountry" },
  dudley: { name: "Dudley", region: "blackCountry" },
  kidderminster: { name: "Kidderminster", region: "blackCountry" },
  worcester: { name: "Worcester", region: "blackCountry" },
  birmingham: { name: "Birmingham", region: "birmingham" },
  coventry: { name: "Coventry", region: "birmingham" },
  nuneaton: { name: "Nuneaton", region: "birmingham" },
  redditch: { name: "Redditch", region: "birmingham" },
};

// Board banner colors per region (approximated from the printed board),
// with a readable text color for each banner.
export const REGION_COLORS = {
  derbyshire: { bg: "#537c80", fg: "#fff" },
  staffordshire: { bg: "#1e5aa0", fg: "#fff" },
  midlands: { bg: "#8c4e51", fg: "#fff" },
  blackCountry: { bg: "#986627", fg: "#fff" },
  birmingham: { bg: "#564a5e", fg: "#fff" },
  merchant: { bg: "#ded8ca", fg: "#26221c" },
  farm: { bg: "#6a705f", fg: "#fff" },
};

// Merchant locations. Each has 2 link icons printed on the board,
// regardless of its number of merchant tile slots.
export const MERCHANTS = {
  shrewsbury: { name: "Shrewsbury", region: "merchant", linkIcons: 2 },
  gloucester: { name: "Gloucester", region: "merchant", linkIcons: 2 },
  oxford: { name: "Oxford", region: "merchant", linkIcons: 2 },
  warrington: { name: "Warrington", region: "merchant", linkIcons: 2 },
  nottingham: { name: "Nottingham", region: "merchant", linkIcons: 2 },
};

export const FARM_BREWERIES = {
  farmNorth: { name: "Farm Brewery (Cannock)", region: "farm" },
  farmSouth: { name: "Farm Brewery (Kidderminster / Worcester)", region: "farm" },
};

// Every location on the board, whatever its kind.
export const LOCATIONS = { ...CITIES, ...MERCHANTS, ...FARM_BREWERIES };

// Regions in the order the eye scans the board, top-left to bottom-right:
// blue, teal, red, brown, purple name banners, then the farm breweries.
// Used to list locations in the order someone counts them on the table.
export const REGION_ORDER = [
  "staffordshire",
  "derbyshire",
  "midlands",
  "blackCountry",
  "birmingham",
  "merchant",
  "farm",
];

// Link definitions. Kidderminster-Worcester lists three locations because
// that single link tile is also adjacent to the southern farm brewery
// (rulebook p.9).
export const LINKS = [
  { id: "belper-derby", locations: ["belper", "derby"], canal: true, rail: true },
  { id: "belper-leek", locations: ["belper", "leek"], canal: false, rail: true },
  { id: "birmingham-coventry", locations: ["birmingham", "coventry"], canal: true, rail: true },
  { id: "birmingham-dudley", locations: ["birmingham", "dudley"], canal: true, rail: true },
  { id: "birmingham-nuneaton", locations: ["birmingham", "nuneaton"], canal: false, rail: true },
  { id: "birmingham-oxford", locations: ["birmingham", "oxford"], canal: true, rail: true },
  { id: "birmingham-redditch", locations: ["birmingham", "redditch"], canal: false, rail: true },
  { id: "birmingham-tamworth", locations: ["birmingham", "tamworth"], canal: true, rail: true },
  { id: "birmingham-walsall", locations: ["birmingham", "walsall"], canal: true, rail: true },
  { id: "birmingham-worcester", locations: ["birmingham", "worcester"], canal: true, rail: true },
  { id: "burtonOnTrent-cannock", locations: ["burtonOnTrent", "cannock"], canal: false, rail: true },
  { id: "burtonOnTrent-derby", locations: ["burtonOnTrent", "derby"], canal: true, rail: true },
  { id: "burtonOnTrent-stone", locations: ["burtonOnTrent", "stone"], canal: true, rail: true },
  { id: "burtonOnTrent-tamworth", locations: ["burtonOnTrent", "tamworth"], canal: true, rail: true },
  { id: "burtonOnTrent-walsall", locations: ["burtonOnTrent", "walsall"], canal: true, rail: false },
  { id: "cannock-stafford", locations: ["cannock", "stafford"], canal: true, rail: true },
  { id: "cannock-farmNorth", locations: ["cannock", "farmNorth"], canal: true, rail: true },
  { id: "cannock-walsall", locations: ["cannock", "walsall"], canal: true, rail: true },
  { id: "cannock-wolverhampton", locations: ["cannock", "wolverhampton"], canal: true, rail: true },
  { id: "coalbrookdale-kidderminster", locations: ["coalbrookdale", "kidderminster"], canal: true, rail: true },
  { id: "coalbrookdale-shrewsbury", locations: ["coalbrookdale", "shrewsbury"], canal: true, rail: true },
  { id: "coalbrookdale-wolverhampton", locations: ["coalbrookdale", "wolverhampton"], canal: true, rail: true },
  { id: "coventry-nuneaton", locations: ["coventry", "nuneaton"], canal: false, rail: true },
  { id: "derby-nottingham", locations: ["derby", "nottingham"], canal: true, rail: true },
  { id: "derby-uttoxeter", locations: ["derby", "uttoxeter"], canal: false, rail: true },
  { id: "dudley-kidderminster", locations: ["dudley", "kidderminster"], canal: true, rail: true },
  { id: "dudley-wolverhampton", locations: ["dudley", "wolverhampton"], canal: true, rail: true },
  { id: "gloucester-redditch", locations: ["gloucester", "redditch"], canal: true, rail: true },
  { id: "gloucester-worcester", locations: ["gloucester", "worcester"], canal: true, rail: true },
  { id: "kidderminster-worcester", locations: ["kidderminster", "worcester", "farmSouth"], canal: true, rail: true },
  { id: "leek-stokeOnTrent", locations: ["leek", "stokeOnTrent"], canal: true, rail: true },
  { id: "nuneaton-tamworth", locations: ["nuneaton", "tamworth"], canal: true, rail: true },
  { id: "redditch-oxford", locations: ["redditch", "oxford"], canal: true, rail: true },
  { id: "stafford-stone", locations: ["stafford", "stone"], canal: true, rail: true },
  { id: "stokeOnTrent-stone", locations: ["stokeOnTrent", "stone"], canal: true, rail: true },
  { id: "stokeOnTrent-warrington", locations: ["stokeOnTrent", "warrington"], canal: true, rail: true },
  { id: "stone-uttoxeter", locations: ["stone", "uttoxeter"], canal: false, rail: true },
  { id: "tamworth-walsall", locations: ["tamworth", "walsall"], canal: false, rail: true },
  { id: "walsall-wolverhampton", locations: ["walsall", "wolverhampton"], canal: true, rail: true },
];

export const LINKS_BY_ID = Object.fromEntries(LINKS.map((l) => [l.id, l]));

// Whether a link can be built in the given era. Named rather than spelled out
// at each call site so the rule stays greppable: it decides what the scanner
// reads, what its map screen lets a player tap, and what the score screen
// offers to add, and a place that forgets to ask puts a link on the board that
// cannot exist.
export const linkInEra = (link, era) => !!link[era];
