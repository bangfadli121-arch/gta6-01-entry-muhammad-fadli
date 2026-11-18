// The screenshot scenes behind ?shot=cover|driving|onfoot|start. Each one plays
// the real rules forward from a fresh world for a fixed number of fixed steps,
// steered by a tiny autopilot (stay on the street, brake for the car ahead),
// so the frame is what a short game really looks like and the same seed always
// gives the same frame. The cover stages a police chase with three stars, the
// mission objective and the minimap all in one frame.
import { STEP } from './config.js';
import { ACTION_ENTER, ACTION_PUNCH } from './input.js';
import { syncCarMesh } from './vehicles.js';

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

/** Park police cars ahead of the player, facing him, for the chase frame. */
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

export function stageShot(name, game) {
  if (name === 'cover') {
    game.reset(true);
    // The chase runs east down the beachfront street toward the ocean and
    // the low sun, palms on both kerbs, the billboard and the ferris wheel
    // ahead on the left, the beach at the end of the street. Builder #9:
    // seven seconds in, so the low shop row, the billboard and the wheel
    // are all inside the frame instead of the chase ending at a tower wall
    // — eight seconds drove too far east and pushed the wheel out of frame.
    // Builder #10: five seconds from further west, so the wheel is a full
    // landmark in the frame instead of a sliver at the edge, the VICE
    // SHORES board sits whole on the left, and the FLAMINGO FM board
    // reads whole on the right — seven seconds drove the car so far east
    // that the wheel hid behind the first board's glow and the board
    // itself was cut off at the frame's left edge. Take 2: six seconds —
    // five left the camera too far west and the beachfront tower row hid
    // the wheel entirely, so the chase needs one more second east before
    // the wheel clears the towers and the boards sit whole on both sides.
    // Take 3: seven seconds after all — at six the wheel still sits
    // behind the tower at (116,-58): the sightline only threads the x=145
    // street gap once the camera is past x~90. The first board's glow
    // sprite is shrunk so it no longer washes the wheel out, and the
    // FLAMINGO board at z=40 still holds whole on the frame's right side
    // at seven seconds (its far edge stays inside the frame).
    placeInOwnCar(game, -30, -29, 0);
    // Drive clean first: the heat only lands once the chase frame is staged,
    // so the police have no time to ram Rico to pieces before the photo.
    step(game, 7, () => lanePilot(game, -25.6, 'x')); // The right-hand lane.
    game.startMission(2); // Three stars: the VSPD is on Rico.
    // One step so the three units actually spawn (they only appear inside
    // police.update), then park them ahead of the player for the chase frame.
    game.update(STEP, ZERO_AXES, 0, false);
    // Three units, converging on the player, all inside the frame — close
    // enough to read as a chase, not specks on the horizon. Ahead is east.
    placePoliceAhead(game, [
      { dx: 14, dz: -6 }, { dx: 20, dz: 8 }, { dx: 30, dz: 0 },
    ]);
    // One real step, so the HUD and the minimap paint the staged positions.
    game.update(STEP, ZERO_AXES, 0, false);
    // The staged frame is a chase, not a wreck: full health for the photo.
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
    placeInOwnCar(game, 20, 29, 0);
    step(game, 6, () => lanePilot(game, 32.4, 'x')); // The right-hand lane.
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
    courier.car.street = 29;
    courier.car.axis = 'x';
    courier.car.cruise = 0;
    courier.stopped = true;
    courier.runTimer = 99;
    const cx = 40;
    const cz = 32;
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
    p.z = cz + 6;
    p.heading = Math.atan2(cz - p.z, cx - p.x);
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
