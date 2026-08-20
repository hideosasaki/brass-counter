// Board data for Brass: Birmingham.
// Cross-checked against the official rulebook (Roxley, 2018) and the
// npow/brass-birmingham implementation: 39 links, 20 cities, 5 merchants,
// 2 farm breweries.

// Industry tile stats. vp: victory points when flipped; linkVP: number of
// link icons in the tile's top-right corner (same on both faces, used for
// link scoring).
export const INDUSTRY_STATS = {
  brewery: {
    1: { vp: 4, linkVP: 2 },
    2: { vp: 5, linkVP: 2 },
    3: { vp: 7, linkVP: 2 },
    4: { vp: 10, linkVP: 2 },
  },
  coalMine: {
    1: { vp: 1, linkVP: 2 },
    2: { vp: 2, linkVP: 1 },
    3: { vp: 3, linkVP: 1 },
    4: { vp: 4, linkVP: 1 },
  },
  cottonMill: {
    1: { vp: 5, linkVP: 1 },
    2: { vp: 5, linkVP: 2 },
    3: { vp: 9, linkVP: 1 },
    4: { vp: 12, linkVP: 1 },
  },
  ironWorks: {
    1: { vp: 3, linkVP: 1 },
    2: { vp: 5, linkVP: 1 },
    3: { vp: 7, linkVP: 1 },
    4: { vp: 9, linkVP: 1 },
  },
  manufacturer: {
    1: { vp: 3, linkVP: 2 },
    2: { vp: 5, linkVP: 1 },
    3: { vp: 4, linkVP: 0 },
    4: { vp: 3, linkVP: 1 },
    5: { vp: 8, linkVP: 2 },
    6: { vp: 7, linkVP: 1 },
    7: { vp: 9, linkVP: 0 },
    8: { vp: 11, linkVP: 1 },
  },
  pottery: {
    1: { vp: 10, linkVP: 1 },
    2: { vp: 1, linkVP: 1 },
    3: { vp: 11, linkVP: 1 },
    4: { vp: 1, linkVP: 1 },
    5: { vp: 20, linkVP: 1 },
  },
};

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

// Board banner colors per region (approximated from the printed board).
export const REGION_COLORS = {
  derbyshire: "#537c80",
  staffordshire: "#1e5aa0",
  midlands: "#8c4e51",
  blackCountry: "#986627",
  birmingham: "#564a5e",
  merchant: "#ded8ca",
  farm: "#6a705f",
};

// Merchant locations. Each has 2 link icons printed on the board,
// regardless of its number of merchant tile slots.
export const MERCHANTS = {
  shrewsbury: { name: "Shrewsbury", linkIcons: 2 },
  gloucester: { name: "Gloucester", linkIcons: 2 },
  oxford: { name: "Oxford", linkIcons: 2 },
  warrington: { name: "Warrington", linkIcons: 2 },
  nottingham: { name: "Nottingham", linkIcons: 2 },
};

export const FARM_BREWERIES = {
  farmNorth: { name: "Farm Brewery (Cannock)" },
  farmSouth: { name: "Farm Brewery (Kidderminster/Worcester)" },
};

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
