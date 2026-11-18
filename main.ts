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
// is golden hour over a beach city: a pink-orange gradient sky with a low sun
// and warm haze, pastel towers with varied lit windows, palms along the
// beachfront avenues, colourful beach umbrellas, a big neon billboard and a
// ferris wheel on the sand, saturated car paint, crosswalks and kerb-parked
// cars on busy streets, and a denser HUD — a VSPD response list, a
// mission-giver dialog bar, a radio bar, weapon slots, a stage bar, a
// day/clock line and a district name — all drawn from state the game already
// owns, so nothing about play itself changed.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

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
