// EMBERLINE — shared tuning: palette, map dimensions, weapons, economy.
// One place for every number the rest of the game reads, so balance tweaks
// never require hunting through the simulation or the renderer.

export const PALETTE = {
  skyTop: 0x2b1d3a, // dusk violet overhead
  skyLow: 0xb34a1f, // ember orange at the horizon
  fog: 0x3a2430,
  ground: 0x2e2118,
  groundLine: 0x4a3423,
};

// Map extents in metres. x runs west(-) to east(+), z runs south(-) to north(+).
// The Reactor site (A) sits east, the Courtyard site (B) sits west, mid joins them.
export const MAP = {
  halfX: 22,
  halfZ: 15,
  wallHeight: 4,
  wallThick: 1,
  roundTime: 100, // seconds per round
  plantTime: 3.5, // seconds holding E at the site to plant
  defuseTime: 4, // seconds a bot channels to defuse
  fuseTime: 35, // seconds from plant to detonation
  buyTime: 15, // seconds of buy phase between rounds
  roundsToWin: 5, // first to 5 takes the match
  maxRounds: 9,
  playerSpawn: [-19, 0, 0],
  playerYaw: -Math.PI / 2, // facing east (+x)
  botSpawn: [
    [19, 0, -5],
    [19, 0, 0],
    [19, 0, 5],
    [16, 0, -2],
  ],
  // Reactor site bounds (plant zone), east end.
  siteA: { minX: 14, maxX: 21, minZ: -6, maxZ: 6, core: [18, 0, 0] },
  // Courtyard site bounds, west end (visual anchor / bot hold).
  siteB: { minX: -21, maxX: -14, minZ: -6, maxZ: 6 },
};

// Crates and structures: axis-aligned boxes { min:[x,y,z], max:[x,y,z] }.
// These are both the visible geometry (built from them) and the collision set.
export const CRATES = [
  // Mid connector block — splits the middle lane into two gaps.
  { min: [-3, 0, -4], max: [3, 2.2, -1] },
  { min: [-3, 0, 1], max: [3, 2.2, 4] },
  // A-long cover, north lane.
  { min: [6, 0, -13], max: [9, 1.4, -10.5] },
  { min: [12, 0, -12.5], max: [14.5, 1.2, -10] },
  // B-long cover, south lane.
  { min: [-12, 0, 10.5], max: [-9, 1.4, 13] },
  { min: [-6, 0, 10], max: [-3.5, 1.2, 12.5] },
  // Reactor site cover.
  { min: [15, 0, -4], max: [17, 1.6, -1.5] },
  { min: [15, 0, 2.5], max: [17, 1.2, 5] },
  // Courtyard cover.
  { min: [-17, 0, -4], max: [-15, 1.6, -1] },
  { min: [-17, 0, 2], max: [-15, 1.2, 4.5] },
  // Mid pillars.
  { min: [-1, 0, -9], max: [1, 3.4, -7] },
  { min: [-1, 0, 7], max: [1, 3.4, 9] },
];

export const WEAPONS = {
  p9: {
    name: 'P9 Sidearm', short: 'P9', price: 0, damage: 26, headMult: 2,
    mag: 12, reserve: 48, rpm: 340, auto: false, reload: 1.1,
    spread: 0.011, moveSpread: 0.02, range: 60, tracer: 0xffd27a,
  },
  vk47: {
    name: 'VK-47 Rifle', short: 'VK-47', price: 2700, damage: 34, headMult: 2,
    mag: 25, reserve: 75, rpm: 600, auto: true, reload: 2.2,
    spread: 0.015, moveSpread: 0.028, range: 90, tracer: 0xffb347,
  },
  raptor9: {
    name: 'Raptor-9 SMG', short: 'RPTR-9', price: 1500, damage: 22, headMult: 2,
    mag: 32, reserve: 96, rpm: 820, auto: true, reload: 1.9,
    spread: 0.019, moveSpread: 0.03, range: 55, tracer: 0x9fd8ff,
  },
  longbow: {
    name: 'Longbow DMR', short: 'LONGBOW', price: 3200, damage: 88, headMult: 2,
    mag: 5, reserve: 15, rpm: 55, auto: false, reload: 2.8,
    spread: 0.002, moveSpread: 0.012, range: 120, tracer: 0xffe9a8,
  },
};

export const SHOP = [
  { id: 'vk47', label: 'VK-47 Rifle', price: 2700, note: 'High damage, full-auto' },
  { id: 'raptor9', label: 'Raptor-9 SMG', price: 1500, note: 'Fast, close quarters' },
  { id: 'longbow', label: 'Longbow DMR', price: 3200, note: 'One-shot headshot, slow' },
  { id: 'flash', label: 'Flash Grenade', price: 200, note: 'Blinds bots that see it' },
  { id: 'kevlar', label: 'Kevlar Vest', price: 650, note: '+50 max health, absorbs half' },
];

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  roundWin: 325,
  roundLoss: 190,
  plantReward: 300,
};

export const BOT_NAMES = ['Rook', 'Vex', 'Mara', 'Kilo'];

// Bot skill bands: reaction seconds, aim error radians at 10 m, burst size.
export const BOT_SKILL = [
  { react: 0.55, aim: 0.03, burst: 4, damage: 13 },
  { react: 0.65, aim: 0.038, burst: 3, damage: 12 },
  { react: 0.5, aim: 0.028, burst: 5, damage: 14 },
  { react: 0.75, aim: 0.045, burst: 3, damage: 11 },
];
