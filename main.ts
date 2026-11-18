// Vice Shores, a gta6-01 entry (Node 22, standard library only): the game is this
// directory's game/ folder — plain static files a desktop browser loads offline
// (game/index.html and its ES modules, three.js vendored as a minified build under
// game/vendor/, no network request) — and the program hands it in. It copies
// game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun
// library. The game itself is an original open-world crime game: a seeded city
// to explore on foot and by car, traffic and pedestrians, cars to steal, a
// wanted level with police who chase, three chained missions, combat, a HUD
// with a minimap, a start screen and a save in localStorage. The shipped look
// is golden hour over a beach city: a four-band violet-pink-orange-gold sky
// with the sun low over the ocean at the end of the east streets, a glare
// sprite over the sun disc, dark wet-looking asphalt with a yellow centre
// line and a sun streak, saturated towers with warm lit windows on all four
// faces, glowing street lamps, drooping palm fronds lining the beachfront
// avenue and the east streets, a bright sand beach with colourful umbrellas
// and towels, a curved shoreline with a sine foam line, a low colourful
// shop row along the beachfront instead of flat towers, a big neon billboard
// that glows pink and spills light, and a ferris wheel on the sand,
// saturated car paint, crosswalks and kerb-parked cars on busy streets, and
// a denser HUD — a VSPD response list, a mission-giver dialog bar with a
// drawn portrait, a radio bar, weapon slots, a stage bar, a day/clock line
// and a district name, rounded colourful panels and a round speedometer
// dial — all drawn from state the game already owns, so nothing about play
// itself changed. The glow is faked with
// additive sprites and one billboard point light, not a post-processing
// pass, so the frame stays fast and deterministic.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The coastal look the entry ships: the palette values game/src/config.js
// must carry, so a stray edit that drops the beach-city look fails here
// instead of handing in a regressed entry. Each entry is a literal the
// config file must contain (a sun disc over the ocean, dark asphalt, bright
// sand and ocean, most windows lit, drooping palm fronds in two greens and
// the low beachfront shop row).
const COASTAL_THEME = [
  ['sun disc over the ocean', 'sunDiscPosition: [480, 26, 10]'],
  ['dark asphalt', "roadTint: '#2e2a33'"],
  ['bright sand', 'sandTint: 0xf2d491'],
  ['bright ocean', 'oceanTint: 0x22b4e6'],
  ['most windows lit', 'windowLit: 0.58'],
  ['drooping palm fronds', 'frondColors: [0x2fae5a, 0x46c468, 0x279a4e]'],
  ['beachfront shop row', "shopTints: ['#ff8a5c', '#37c8e8', '#ffd94a', '#ff5a8a', '#7dd8a0']"],
];
const configText = readFileSync(join(here, 'game', 'src', 'config.js'), 'utf8');
for (const [label, needle] of COASTAL_THEME) {
  if (!configText.includes(needle)) {
    throw new Error(`coastal theme check failed: game/src/config.js is missing ${label} (${needle})`);
  }
}
// The glow pass lives in the game modules: the additive halos in city.js
// (billboard, lamps, ferris wheel) and the filmic tone mapping in render.js.
const cityText = readFileSync(join(here, 'game', 'src', 'city.js'), 'utf8');
if (!cityText.includes('AdditiveBlending')) {
  throw new Error('coastal theme check failed: game/src/city.js is missing the additive glow pass (AdditiveBlending)');
}
const renderText = readFileSync(join(here, 'game', 'src', 'render.js'), 'utf8');
if (!renderText.includes('ACESFilmicToneMapping')) {
  throw new Error('coastal theme check failed: game/src/render.js is missing the filmic tone mapping (ACESFilmicToneMapping)');
}

// The gate refuses an entry with fewer than 3 screenshots, so fail loudly
// here instead of handing in a dossier the scorer would reject.
const shots = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((f) => !f.startsWith('.'))
  : [];
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`expected 3 or 4 screenshots, found ${shots.length}`);
}
for (const shot of shots) {
  const size = statSync(join(here, 'screenshots', shot)).size;
  if (size > 262144) throw new Error(`screenshot ${shot} is ${size} bytes, over the 256 KiB gate cap`);
}
// The gate caps game/index.html at 1 MiB: refuse early rather than shipping a
// dossier the scorer would reject for a file we could have caught here.
const indexSize = statSync(join(here, 'game', 'index.html')).size;
if (indexSize > 1048576) {
  throw new Error(`game/index.html is ${indexSize} bytes, over the 1 MiB gate cap`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
