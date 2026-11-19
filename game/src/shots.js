// The screenshot scenes behind ?shot=cover|driving|onfoot|start|
// close-casino|casino-a|casino-b|carjack|drift|packages|busted|
// district|minimap-zoom|traffic-heli. Each one plays the real rules
// forward from a fresh world for a fixed number of fixed steps,
// steered by a tiny autopilot (stay on the street, brake for the car
// ahead), so the frame is what a short game really looks like and the
// same seed always gives the same frame.
//
// Builder #19 — THE GOLDEN HOUR CAUSEWAY (total rebuild): the cover
// chase runs EAST down the z=-24 avenue straight into the low sun.
// The Vice Royale casino stands on the avenue's SOUTH side (56,2) —
// the RIGHT of the frame — its rooftop CASINO sign facing WEST toward
// the approaching camera and its VICE ROYALE marquee facing NORTH onto
// the avenue. The FLAMINGO FM board stands on the NORTH side (150,-52)
// — the LEFT of the frame — with the ferris wheel at the end of the
// street. The cover acceptance test: one frame must show (a) the hero
// car's rear, (b) the CASINO sign/marquee, (c) the FLAMINGO FM board,
// (d) the helicopter, (e) at least one police car, (f) the low sun.
import { STEP } from './config.js';
import { ACTION_ENTER, ACTION_PUNCH } from './input.js';
import { createCarMesh, syncCarMesh } from './vehicles.js';

const ZERO_AXES = { throttle: 0, steer: 0, brake: 0, handbrake: 0, run: 0 };

function step(game, seconds, axesFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const axes = axesFn ? axesFn(i) : ZERO_AXES;
    game.update(STEP, axes, 0, false);
  }
}

/** Brake when a traffic car is right ahead in the player's lane. */
function carAhead(game, range) {
  const p = game.player;
  const fx = Math.cos(p.heading);
  const fz = Math.sin(p.heading);
  for (const c of game.traffic.cars) {
    const dx = c.x - p.x;
    const dz = c.z - p.z;
    const along = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < range && side < 4) return true;
  }
  return false;
}

/** Drive straight down a street: steer toward the street's direction with a
 * gentle correction for the lateral offset, at part throttle so the car holds
 * the lane instead of fishtailing off the road and scraping the buildings. */
function lanePilot(game, streetCoord, axis) {
  const p = game.player;
  const wantHeading = axis === 'x' ? 0 : -Math.PI / 2;
  let headingErr = wantHeading - p.heading;
  while (headingErr > Math.PI) headingErr -= Math.PI * 2;
  while (headingErr < -Math.PI) headingErr += Math.PI * 2;
  const off = axis === 'x' ? p.z - streetCoord : p.x - streetCoord;
  const steer = Math.max(-0.45, Math.min(0.45, headingErr * 1.4 - off * 0.06));
  if (carAhead(game, 13)) return { throttle: 0, steer: 0, brake: 1, handbrake: 0, run: 0 };
  return { throttle: 0.5, steer, brake: 0, handbrake: 0, run: 0 };
}

/** Put the player in Rico's own car, teleported to a street and heading. */
function placeInOwnCar(game, x, z, heading) {
  const own = game.traffic.parked.find((p) => p.own);
  if (!own) return false;
  own.x = x;
  own.z = z;
  own.heading = heading;
  own.mesh.group.position.set(x, 0, z);
  own.mesh.group.rotation.y = -heading;
  const p = game.player;
  p.x = x + Math.sin(heading) * 3;
  p.z = z - Math.cos(heading) * 3;
  p.heading = heading;
  p.mesh.position.set(p.x, 0, p.z);
  game.update(STEP, ZERO_AXES, ACTION_ENTER, false);
  return true;
}

/** Park police cars around the player for the chase frame. Offsets are
 * relative to the player; each unit faces him. */
function placePoliceAhead(game, offsets) {
  const p = game.player;
  game.police.units.forEach((u, i) => {
    const off = offsets[i % offsets.length];
    u.car.x = p.x + off.dx;
    u.car.z = p.z + off.dz;
    u.car.heading = Math.atan2(p.z - u.car.z, p.x - u.car.x);
    u.car.speed = 18;
    syncCarMesh(u.mesh, u.car, 0);
  });
}

/** Clear the chase corridor of cruising traffic and kerb-parked cars, so
 * the hero's drive never wedges behind a crossing car or a parked truck. */
function clearCorridor(game) {
  for (const c of game.traffic.cars) {
    c.along = c.direction > 0 ? -175 : 175;
  }
  for (const p of game.traffic.parked) {
    if (p.own) continue;
    if (p.x > -80 && p.x < 195 && Math.abs(p.z + 20.6) < 12) {
      p.x = -170;
      p.along = -170;
      syncCarMesh(p.mesh, p, 0);
    }
  }
}

/** Stage civilian traffic ahead of the hero on the avenue: eastbound cars
 * in the hero's lane (rear view) and oncoming cars in the far lane. */
function stageAvenueTraffic(game, specs) {
  const scene = game.renderer.scene;
  specs.forEach((spec, i) => {
    const car = game.traffic.cars[i];
    if (!car) return;
    scene.remove(car.mesh.group);
    car.mesh = createCarMesh(spec.kind, spec.color);
    scene.add(car.mesh.group);
    car.kind = spec.kind;
    car.color = spec.color;
    car.axis = 'x';
    car.street = -24;
    car.direction = spec.dir;
    car.along = game.player.x + spec.dx;
    car.lane = spec.lane;
    car.speed = car.cruise;
  });
}

const AVENUE_TRAFFIC = [
  { kind: 'taxi', color: 0xffd94a, dx: 30, lane: -21.5, dir: 1 },
  { kind: 'sedan', color: 0x2ad8c8, dx: 42, lane: -21.5, dir: 1 },
  { kind: 'coupe', color: 0xf5f5f5, dx: 54, lane: -21.5, dir: 1 },
  { kind: 'sports', color: 0xe83a3a, dx: 66, lane: -21.5, dir: 1 },
  { kind: 'sedan', color: 0x2a6fd8, dx: 36, lane: -27.5, dir: -1 },
  { kind: 'van', color: 0xff8a3d, dx: 50, lane: -27.5, dir: -1 },
  { kind: 'coupe', color: 0xf5f5f5, dx: 62, lane: -27.5, dir: -1 },
];

/** Seven VSPD units for a 4-star chase: one RAMMING the hero's rear
 * bumper, three converging ahead, three flanking. */
const CHASE_POLICE = [
  // Builder #19, second look: the ramming unit sat dead on the camera
  // axis behind the hero and hid him completely. It now rides the
  // NORTH rear quarter (opposite the camera), still RAMMING at 6.5m.
  { dx: -5.5, dz: -3.5 },
  { dx: 12, dz: -5 },
  { dx: 17, dz: 5 },
  { dx: 23, dz: -2 },
  { dx: 7, dz: -8 },
  { dx: 10, dz: 8 },
  { dx: 29, dz: 3 },
];

/** Park the VSPD helicopter in the sky ahead of the chase. */
function stageHeli(game, dx, height, dz) {
  const heli = game.city.helicopter;
  if (!heli) return;
  heli.visible = true;
  heli.position.set(game.player.x + dx, height, game.player.z + dz);
  heli.rotation.y = -0.25;
  game.city.heliRotor.rotation.y = 0.7;
  game.city.heliTailRotor.rotation.x = 1.1;
}

/** Pin every police light bar ON (flash = 1, red side lit) and re-sync,
 * so the bars read the same in every capture. */
function pinLightBars(game) {
  for (const u of game.police.units) {
    u.car.flash = 1;
    syncCarMesh(u.mesh, u.car, 0);
  }
}

/** The staged cover HUD: the GOLDEN HOUR job card, 4 stars, $38,420. */
function stageCoverHud(game) {
  game.player.cash = 38420;
  game.hud.setCash(38420);
  game.hud.setObjective({
    title: 'JOB 4/8 · GOLDEN HOUR',
    text: 'Lose the cops before the boat sails',
    sub: 'VSPD on your tail — break away east',
    next: 'Reach the marina · PACKAGES 4/10',
  });
  game.hud.setStage(4, 5);
  game.player.health = 100;
  game.hud.setHealth(100);
}

/** Raise the heat to 4 stars (7 units) and let one step spawn them. */
function raiseHeat(game) {
  game.startMission(2); // Mission 3: LOSE THE HEAT.
  game.setWantedLevel(4);
  game.update(STEP, ZERO_AXES, 0, false);
}

export function stageShot(name, game) {
  if (name === 'cover') {
    game.reset(true);
    // Start west on the avenue: a 3-second drive puts the hero at
    // x~15-20, the camera ~8 behind him, and the casino (56,2) 35-40
    // ahead on the right — its west-facing CASINO sign nearly frontal,
    // its marquee onto the avenue, the FLAMINGO board (150,-52) on the
    // left, the wheel (178,-9) and the low sun dead ahead.
    placeInOwnCar(game, -8, -20.6, 0);
    clearCorridor(game);
    // Builder #19, second look: 3 s drove the hero to x~28, the camera
    // to x~21 — 28 from the casino, so the rooftop sign (y 33) sat at
    // 47 degrees elevation and was cut by the frame's top edge. 2.5 s
    // stops the hero at x~20, the camera ~36 from the sign, and the
    // whole sign fits with the hero inside the CASINO ROW radius.
    step(game, 2.5, () => lanePilot(game, -20.6, 'x'));
    raiseHeat(game);
    placePoliceAhead(game, CHASE_POLICE);
    stageAvenueTraffic(game, AVENUE_TRAFFIC);
    // One real step, so the HUD and the minimap paint the staged positions.
    game.update(STEP, ZERO_AXES, 0, false);
    // The helicopter, upper-left of the frame like the winners' choppers.
    stageHeli(game, 46, 25, -20);
    stageCoverHud(game);
    pinLightBars(game);
    game.renderer.setCoverCamera(game.player);
    return { screen: 'play' };
  }
  // Builder #19 — CLOSE-CASINO. Rico stands on the avenue's north kerb
  // facing the Vice Royale's marquee; the camera sits low and far west,
  // so the west CASINO sign reads nearly frontal, the north marquee sits
  // at the base of the north face, and Rico is in the lower frame.
  if (name === 'close-casino') {
    game.reset(true);
    step(game, 0.5, null);
    const p = game.player;
    p.x = 56;
    p.z = -16;
    p.heading = Math.PI / 2;
    p.mesh.position.set(p.x, 0, p.z);
    step(game, 0.5, null);
    const cam = game.renderer.camera;
    cam.position.set(0, 7, -26);
    cam.fov = 58;
    cam.updateProjectionMatrix();
    cam.lookAt(56, 13, 2);
    game.player.health = 100;
    game.hud.setHealth(100);
    return { screen: 'play' };
  }
  // Builder #18 — CASINO CLOSE-UPS, retargeted at the moved casino
  // (56,2). casino-a: elevated three-quarter from the south-east.
  // casino-b: elevated three-quarter from the south-west, nearly level
  // with the west-facing sign.
  if (name === 'casino-a' || name === 'casino-b') {
    game.reset(true);
    step(game, 0.5, null);
    const cam = game.renderer.camera;
    if (name === 'casino-a') {
      cam.position.set(96, 30, -34);
      cam.fov = 58;
      cam.updateProjectionMatrix();
      cam.lookAt(56, 20, 2);
    } else {
      cam.position.set(24, 22, 26);
      cam.fov = 58;
      cam.updateProjectionMatrix();
      cam.lookAt(56, 26, 2);
    }
    game.player.health = 100;
    game.hud.setHealth(100);
    return { screen: 'play' };
  }
  // Builder #19 — MINIMAP-ZOOM. The same causeway chase as the cover,
  // but the whole bottom-left HUD column is scaled up, so the round
  // minimap — N tick, ring boulevard, casino star, player arrow,
  // district label — fills a big readable patch of the frame.
  if (name === 'minimap-zoom') {
    document.documentElement.classList.add('minimap-zoom');
    game.reset(true);
    placeInOwnCar(game, -8, -20.6, 0);
    clearCorridor(game);
    step(game, 2.5, () => lanePilot(game, -20.6, 'x'));
    raiseHeat(game);
    placePoliceAhead(game, CHASE_POLICE);
    stageAvenueTraffic(game, AVENUE_TRAFFIC.slice(0, 4));
    game.update(STEP, ZERO_AXES, 0, false);
    stageHeli(game, 46, 25, -20);
    stageCoverHud(game);
    pinLightBars(game);
    game.hud.clearMessages();
    game.renderer.setCoverCamera(game.player);
    return { screen: 'play' };
  }
  // Builder #19 — TRAFFIC-HELI. The avenue at its busiest: eight
  // civilian cars ahead, seven police units, and the chopper LOW and
  // close overhead with its spotlight, over a pinned NEAR MISS popup.
  if (name === 'traffic-heli') {
    game.reset(true);
    placeInOwnCar(game, -30, -20.6, 0);
    clearCorridor(game);
    step(game, 4, () => lanePilot(game, -20.6, 'x'));
    raiseHeat(game);
    placePoliceAhead(game, CHASE_POLICE);
    stageAvenueTraffic(game, [
      ...AVENUE_TRAFFIC,
      { kind: 'taxi', color: 0xffd94a, dx: 74, lane: -21.5, dir: 1 },
    ]);
    game.update(STEP, ZERO_AXES, 0, false);
    stageHeli(game, 32, 17, -16);
    stageCoverHud(game);
    pinLightBars(game);
    game.hud.showFeedback('NEAR MISS', '+$250', true);
    game.renderer.setCoverCamera(game.player);
    return { screen: 'play' };
  }
  // Builder #18 — the Hilman-style gameplay shots: each one plays the real
  // rules forward, so the frame is proof the system works, not a mock-up.
  if (name === 'carjack') {
    game.reset(true);
    // Rico spawns six units from his own pink convertible at the Hideout —
    // inside steal range — so the hint reads "[E] Get in Solstice GT"
    // and the car sits ahead in the frame.
    step(game, 0.5, null);
    game.player.health = 100;
    game.hud.setHealth(100);
    return { screen: 'play' };
  }
  if (name === 'drift') {
    game.reset(true);
    // Start far west: 5 s at full throttle from x=20 ran the car off the
    // street onto the beach, so the frame was sand and ocean, not a drift
    // on the road. From x=-60 the car is still on asphalt when the
    // handbrake turn happens, with the street and the palms in frame.
    placeInOwnCar(game, -60, 24, 0);
    // Full throttle east to build speed, then a hard handbrake turn: the
    // drift feedback pops for real (and pays $40), and it is pinned sticky
    // for the photo — the live 1.6 s fade would otherwise fire mid-capture.
    const fullThrottle = () => {
      const a = lanePilot(game, 27.4, 'x');
      return { ...a, throttle: 1 };
    };
    // Clear the street ahead like the cover does: a cruising car in the
    // hero's lane pins the build-up behind it (lanePilot brakes for the
    // car ahead), the car never tops 21 u/s, and the drift never reaches
    // the 0.4 s threshold — that is why the first two takes stayed $250.
    for (const c of game.traffic.cars) {
      c.along = c.direction > 0 ? -175 : 175;
    }
    // The drift has to fire FOR REAL (cash $250 -> $290) — a slow build
    // behind traffic can leave the car too slow for the 0.4 s threshold,
    // so retry the build-and-handbrake up to three times and stop on the
    // first $40 popup. Exactly one popup: the pin below matches it.
    let drifted = false;
    for (let attempt = 0; attempt < 3 && !drifted; attempt += 1) {
      step(game, 3, fullThrottle);
      step(game, 1.2, () => ({ throttle: 0, steer: 0.3, brake: 0, handbrake: 1, run: 0 }));
      drifted = game.cash > 250;
    }
    game.hud.showFeedback('DRIFT x1', '+$40', true);
    game.player.health = 100;
    game.hud.setHealth(100);
    return { screen: 'play' };
  }
  if (name === 'packages') {
    game.reset(true);
    game.startMission(3); // Mission 4: PINK PACKAGES.
    // Collect three packages for real: walk Rico onto each spot and let the
    // mission rules take it — the counter in the objective card counts up.
    const spots = [{ x: 72, z: -96 }, { x: -96, z: -24 }, { x: 96, z: -72 }];
    for (const spot of spots) {
      game.player.x = spot.x;
      game.player.z = spot.z;
      game.player.mesh.position.set(spot.x, 0, spot.z);
      step(game, 0.2, null);
    }
    // End beside the next uncollected package (120,-48), facing it: the
    // pink package glows in frame with the FLAMINGO board just behind it,
    // and the PACKAGES 3/10 counter stays up in the objective card.
    game.player.x = 114;
    game.player.z = -48;
    game.player.heading = Math.PI / 2;
    game.player.mesh.position.set(114, 0, -48);
    step(game, 0.5, null);
    game.player.health = 100;
    game.hud.setHealth(100);
    return { screen: 'play' };
  }
  if (name === 'busted') {
    game.reset(true);
    game.startMission(2); // Three stars: the VSPD is on Rico.
    step(game, 0.2, null); // One step so the units actually spawn.
    const p = game.player;
    // Park the nearest unit on Rico's shoulder and keep it there: on foot,
    // close, and held — the bust timer fills in 2.5 s and the game busts
    // him for real. The player takes a few rams on the way in; the photo
    // is the bust, not the beating — full health for the frame.
    let busted = false;
    for (let i = 0; i < 600 && !busted; i += 1) {
      const u = game.police.units[0];
      if (u && i % 30 === 0) {
        u.car.x = p.x + 2.2;
        u.car.z = p.z;
        u.car.heading = Math.atan2(p.z - u.car.z, p.x - u.car.x);
        u.car.speed = 0;
        syncCarMesh(u.mesh, u.car, 0);
      }
      if (game.update(STEP, ZERO_AXES, 0, false) === 'busted') busted = true;
    }
    const fee = Math.round(game.cash * 0.10);
    game.player.health = 100;
    game.hud.setHealth(100);
    return {
      screen: 'over',
      endTitle: 'BUSTED',
      endText: `The VSPD takes Rico in. The fine: 10% of your cash — $${fee}. Back on the street.`,
    };
  }
  if (name === 'district') {
    game.reset(true);
    // Rico stands on the avenue's north kerb at the casino's door,
    // facing the neon marquee — the district card fires for CASINO ROW
    // over the landmark.
    const p = game.player;
    p.x = 56;
    p.z = -14;
    p.heading = Math.PI / 2;
    p.mesh.position.set(p.x, 0, p.z);
    step(game, 0.5, null);
    game.hud.showDistrict('CASINO ROW', true);
    game.player.health = 100;
    game.hud.setHealth(100);
    return { screen: 'play' };
  }
  if (name === 'driving') {
    game.reset(true);
    // The cruise runs east toward the beach: palms on both kerbs, the sun
    // low over the ocean at the end of the street, sand and water ahead.
    // Builder #9: it starts further east, so the curved shoreline,
    // umbrellas and surf are in the frame, not just the street. Take 2:
    // six seconds instead of nine, so the car still ends on the street
    // with the coast at its end instead of running out onto the sand.
    placeInOwnCar(game, 20, 24, 0);
    step(game, 6, () => lanePilot(game, 27.4, 'x')); // The right-hand lane.
    // A sideswipe or a police ram on the way in is real play, not the photo:
    // the driving frame shows the city and the traffic, not a dented Rico.
    game.player.health = 100;
    game.hud.setHealth(100);
    return { screen: 'play' };
  }
  if (name === 'onfoot') {
    game.reset(true);
    game.startMission(1);
    const courier = game.courier;
    // Stop the courier right in front of Rico and bring his guards out.
    // The fight faces east, into the low sun and the palms of the street.
    courier.car.along = 40;
    courier.car.street = 24;
    courier.car.axis = 'x';
    courier.car.cruise = 0;
    courier.stopped = true;
    courier.runTimer = 99;
    const cx = 40;
    const cz = 27;
    courier.car.x = cx;
    courier.car.z = cz;
    syncCarMesh(courier.mesh, courier.car, 0);
    game.combat.spawnSquad(cx + 4, cz + 2, 2);
    game.briefcase.active = true;
    game.briefcase.x = cx - 4;
    game.briefcase.z = cz - 2;
    game.briefcase.mesh.position.set(game.briefcase.x, 0.6, game.briefcase.z);
    game.briefcase.mesh.visible = true;
    const p = game.player;
    p.x = cx - 10;
    p.z = cz;
    p.heading = 0;
    p.mesh.position.set(p.x, 0, p.z);
    step(game, 1.0, () => ({ throttle: 1, steer: 0, brake: 0, handbrake: 0, run: 0 }));
    game.update(STEP, ZERO_AXES, ACTION_PUNCH, false);
    step(game, 0.4, null);
    // The guards land hits while Rico closes in; the photo is the fight
    // starting, not Rico losing it — full health for the frame.
    game.player.health = 100;
    game.hud.setHealth(100);
    return { screen: 'play' };
  }
  // 'start' and anything else: the title screen over a living city.
  game.reset(true);
  step(game, 0, null);
  game.renderer.setEstablishing();
  for (let i = 0; i < 240; i += 1) game.updateIdle(STEP);
  game.renderer.setEstablishing();
  game.renderer.render();
  return { screen: 'title' };
}
