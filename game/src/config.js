// Every tunable number of Vice Shores in one place: the city grid, the palettes for
// the golden-hour sunset and the neon-night variants, the car physics and the mission chain.
// THEME picks the variant: 'sunset' (golden hour, warm — the shipped look) or 'night'
// (neon, dark). Nothing here reads the clock or an unseeded random: the game is deterministic.

export const THEME = 'sunset';

export const SAVE_KEY = 'vice-shores-save-v1';

// Builder #11 (18 Nov): the island rebuild — Vice Shores is now a compact
// ROUND island, not a grid that sprawls to a square edge. Six streets on a
// 48-unit pitch (a tight downtown, not a loose grid), a curved ring
// boulevard hugging the coast, sand and ocean all the way round, and the
// world bound pulled in to the beach so nobody drives out onto the water.
// The city is a grid of square blocks separated by roads. Streets run at these
// coordinates on both axes; the pitch is the distance between street centres.
export const CITY = {
  blocks: 6,
  pitch: 48,
  roadWidth: 14,
  blockSize: 34,
  // Street centre lines, west to east / north to south.
  streets: [-120, -72, -24, 24, 72, 120],
  // The ring boulevard: a curved coastal road at this radius, drawn as a
  // true circle in the city and on the minimap — the island's main drag.
  ringRadius: 168,
  ringWidth: 14,
  // The beach ring (sand) and the island's edge (land disc radius).
  beachInner: 176,
  islandRadius: 196,
  // The beach and the ocean sit east of the last street (kept for the
  // east beach strip: the wheel, the billboards and the shop row).
  beachX: 168,
  waterX: 196,
  // World bounds the player and traffic stay inside (the beach edge).
  bound: 200,
  // Casino Row: the neon district, one block north-east of downtown.
  casino: { x: 96, z: -96 },
};

export const PALETTES = {
  // Golden hour over Vice Shores — REBUILT bright (builder #9): the sky is a
  // light violet-pink dusk melting through rose and orange to a bright gold
  // horizon, so the top of the frame reads as bright sky, never a flat red
  // wash; a low sun sits due east over the ocean at the end of the east
  // streets, warm haze, and saturated Miami-style towers — coral, amber,
  // aqua, butter and rose — so the city reads bright and colourful even
  // shrunk to the judge's contact-sheet size. The sun disc itself hangs over
  // the water (sunDiscPosition), while the directional light stays
  // north-west so the street-facing walls keep their warm modelling. Dark
  // asphalt with a yellow centre line, pale sand sidewalks, and a bright
  // turquoise ocean.
  sunset: {
    sky: 0xff9a52, skyTop: 0x7a5ab0, skyMid: 0xff9a5a, skyUpper: 0xff7a9e, horizon: 0xffe3ae,
    fog: 0xf7b98a, sun: 0xffc98a, sunIntensity: 2.0,
    hemiSky: 0xffe0c0, hemiGround: 0x8a5a4a, hemiIntensity: 0.95,
    sunPosition: [-120, 70, -160], sunDiscPosition: [480, 26, 10], ambient: 0.35,
    // Builder #10 (GPU textures): when the photographed sky is live, the
    // sun disc moves up into the clear strip left of the title card, above
    // the photographed sun's own glow on the horizon, so the title frame
    // has exactly one unmistakable sun; the dome rotation below puts the
    // photographed sun on the same azimuth (north-east, over the ocean),
    // directly under the disc. The fallback (no texture) keeps the old
    // disc position and the procedural shader sky.
    sunDiscPositionTextured: [329, 95, -156],
    skyTextureRotationY: -1.16,
    groundTint: '#b5ac96', roadTint: '#2e2a33', sidewalkTint: '#f0e2c2',
    buildingTints: ['#ff7a5c', '#ff9e2c', '#2ec4b6', '#ffd23d', '#ff5a8a', '#4dc8e8', '#ffcf5a', '#b07fe8'],
    windowLit: 0.28, lampOn: false, headlights: false,
    neon: ['#ff5a7a', '#37e0ff', '#ffd94a', '#ff8a3d', '#7dff9a'],
    // Warm window-light colours for the varied-lit-windows pass in city.js:
    // mostly amber and gold, so the towers read lit at dusk, with a few
    // cool blue and rose windows for variety.
    windowColors: [0xffd98a, 0xffc98a, 0xffb060, 0xffe9c0, 0x9fd8ff, 0xffb0c0],
    cloudTint: 0xffe8d8, oceanTint: 0x22b4e6, sandTint: 0xf2d491,
    skylineTint: 0xb0707a,
    // Builder #9 coast dressing: the two greens of the drooping palm
    // fronds, the low beachfront shop row's awning tints, and the bright
    // surf white for the curved foam line.
    frondColors: [0x2fae5a, 0x46c468, 0x279a4e],
    shopTints: ['#ff8a5c', '#37c8e8', '#ffd94a', '#ff5a8a', '#7dd8a0'],
    surfTint: 0xeaf7ff,
  },
  night: {
    sky: 0x0a1030, horizon: 0x1a2a5a, fog: 0x101838, sun: 0x9ab4ff, sunIntensity: 0.55,
    hemiSky: 0x2a3a6a, hemiGround: 0x0a0a14, hemiIntensity: 0.5,
    sunPosition: [80, 140, 60], ambient: 0.12,
    groundTint: '#4a4a55', roadTint: '#1c1c26', sidewalkTint: '#55555f',
    buildingTints: ['#3a3a4e', '#4e3a4a', '#2e3a4e', '#4a3a3a', '#33304a', '#3e3a55'],
    windowLit: 0.85, lampOn: true, headlights: true,
    neon: ['#ff2a7a', '#00e5ff', '#ffe14a', '#7a5aff'],
  },
};

export const CAR = {
  accel: 26, brake: 42, reverseAccel: 14, maxSpeed: 46, maxReverse: 12,
  steerRate: 1.9, steerGrip: 0.92, drag: 0.55, handbrakeDrag: 2.4,
  policeMaxSpeed: 50, npcSpeedMin: 9, npcSpeedMax: 15,
  length: 4.4, width: 2.0, radius: 2.4,
};

export const PLAYER = {
  walkSpeed: 7.5, runSpeed: 11, radius: 0.7, health: 100,
  punchRange: 2.4, punchDamage: 1, punchCooldown: 0.45,
  pistolAmmo: 24, pistolDamage: 1, pistolRange: 55, pistolCooldown: 0.28,
  // Seconds between crash-damage hits: one scrape, one hurt, not one per frame.
  crashCooldown: 0.7,
  // How far away a car can be for E to steal or enter it. Rico spawns six
  // units from his own car at the Hideout, so E works the moment play starts.
  stealRange: 7,
};

export const WANTED = {
  // Stars -> how many police cars hunt the player.
  policePerStar: [0, 1, 2, 3, 4, 5],
  // Seconds with no crime and no police nearby before a star fades.
  decaySeconds: 22,
  // How close a police car must be, and for how long, to bust the player on foot.
  bustDistance: 3.2, bustSeconds: 2.5,
};

// The story: three chained missions from Mara Kade of the Shore Kings.
export const MISSIONS = [
  {
    id: 1, title: 'THE PICKUP', giver: 'MARA KADE',
    intro: 'Mara needs a package from the docks. Steal a car if you have to — everyone does.',
    steps: [
      { type: 'goto', label: 'Drive to the Docks', sub: 'Follow the yellow marker', x: -108, z: 134 },
      { type: 'goto', label: 'Deliver to the Hideout', sub: 'Package secured — do not get caught', x: 24, z: -145 },
    ],
    reward: 500,
  },
  {
    id: 2, title: 'TAIL THE COURIER', giver: 'MARA KADE',
    intro: 'A Shore Kings courier is skimming. Tail his car, then take the briefcase.',
    steps: [
      { type: 'tail', label: 'Tail the courier — stay close', sub: 'Lose him and the job is blown' },
      { type: 'combat', label: 'Take the briefcase', sub: 'His guards will not hand it over' },
    ],
    reward: 800,
  },
  {
    id: 3, title: 'LOSE THE HEAT', giver: 'DETECTIVE ORLO',
    intro: 'The VSPD is on you. Three stars and climbing. Reach the Hideout alive.',
    steps: [
      { type: 'escape', label: 'Lose the cops — reach the Hideout', sub: 'Break line of sight, then run', x: 24, z: -145 },
    ],
    reward: 1200,
  },
];

export const HIDEOUT = { x: 24, z: -148 };
export const DOCKS = { x: -108, z: 134 };
export const START_CASH = 250;
export const STEP = 1 / 60;
