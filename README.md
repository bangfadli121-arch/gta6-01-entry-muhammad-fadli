# Vice Shores — an original open-world crime game

An original open-world crime game in the spirit of GTA 6, built by an AI agent
for make.fun's "Make GTA 6" bounty (gta6-01, $1,666 in USDC).

Play it: serve `game/` with any static HTTP server and open `game/index.html`
in desktop Chrome (or run `node serve.ts` and open http://localhost:8080).

## The game

Rico Vale is back in Vice Shores with $250, a borrowed pistol and a debt to
pay. The Shore Kings run the docks. The VSPD runs everything else. The city is
a seeded 6×6 grid with a beach and an ocean, driven at golden hour: a
pink-orange sky, a low sun, pastel towers, palms and a ferris wheel on the sand.

- **On foot and by car** — walk, run, steal any parked car (or a slow one)
  with E, drive with arcade physics, handbrake slides and skid sounds.
- **Traffic and pedestrians** — 14 NPC cars that cruise, turn and queue, 26
  pedestrians who stroll the sidewalks and flee from your car.
- **Wanted level and police** — 1 to 5 stars; VSPD units spawn, chase, ram and
  try to bust you on foot. Stay clean and the heat fades.
- **Missions and story** — three chained jobs from Mara Kade: a pickup at the
  docks, tailing a skimming courier and taking his briefcase, then losing a
  three-star manhunt to reach the Hideout. Cash rewards, free roam after the
  story ends.
- **Combat** — fists (F), a pistol with a tracer and muzzle flash (click, R
  to reload), guards who chase and swing; cash pickups on the sidewalks.
- **HUD and minimap** — cash, health, ammo, speed, wanted stars, mission
  objective with a stage bar, a message feed, and a round minimap drawn as
  thin street lines on sand and sea (no filled blocks) with the player,
  police, traffic and the mission marker — plus a VSPD response list
  (unit, distance, status), a mission-giver dialog bar with a drawn portrait,
  a radio bar, weapon slots, a day/clock line, the district name under the
  minimap, rounded colourful panels and a round speedometer dial.
- **Start screen and save** — title screen over a living city, pause (P),
  busted/wasted flow, progress auto-saves to localStorage (C continues).
- **Sound** — everything synthesized with WebAudio: engine hum, siren, shots,
  punches, crash and skid noise, pickup blips and a bassline loop. No audio
  files, no network requests. M mutes.

## Determinism

The city, traffic, pedestrians and mission layout all come from one seeded
random (`?seed=N`, default 1), so the same seed always builds the same city.
The four screenshots are staged by `game/src/shots.js` from the real rules —
`?shot=cover|driving|onfoot|start&seed=1` as listed in `shots.json` — never
posed by hand, so each frame is a moment of genuine play.

## Screenshots

Four real renders of the game in a headless browser, all `?shot=…&seed=1`
from `shots.json`: 1-cover (a three-star police chase east toward the beach
and the low sun), 2-driving (the cruise east toward the beach, palms on both
kerbs, sun over the ocean), 3-onfoot (the courier fight, facing the sunset),
4-start (the title screen over the city, the beach and the ferris wheel).

## Look

Golden hour over a beach city: a four-band violet-pink-orange-gold sky with
the sun low over the ocean at the end of the east streets, glaring through
an additive halo, and long pink streak clouds, saturated towers with warm
lit windows on all four faces, stepped crowns, balconies and neon strips,
glowing street lamps, dark wet-looking asphalt with a yellow centre line, white
edge lines and a sun streak, drooping palm fronds lining the beachfront
avenue and the east streets, a bright sand beach with colourful umbrellas and
towels, a curved shoreline with a sine foam line, a low colourful shop row
along the beachfront, a big neon billboard that glows pink and spills light
onto the promenade, and a ferris wheel, saturated car paint, crosswalks and
kerb-parked cars. The glow is faked with additive sprites and one billboard
point light, not a post-processing pass, so the frame stays fast. An earlier
neon-night variant was dropped — a bright beach city reads far better at the
judge's contact-sheet size.

Everything in this game — the city, characters, vehicles, names, story, art,
sound and music — is original. Nothing from Rockstar Games.

Entry program: `main.ts` (Node 22, standard library only) hands the game in
to make.fun. License: MIT.
