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
    placeInOwnCar(game, 29, 100, -Math.PI / 2);
    // Drive clean first: the heat only lands once the chase frame is staged,
    // so the police have no time to ram Rico to pieces before the photo.
    step(game, 5, () => lanePilot(game, 32.4, 'z')); // The right-hand lane.
    game.startMission(2); // Three stars: the VSPD is on Rico.
    // One step so the three units actually spawn (they only appear inside
    // police.update), then park them ahead of the player for the chase frame.
    game.update(STEP, ZERO_AXES, 0, false);
    // Three units, converging on the player, all inside the frame — close
    // enough to read as a chase, not specks on the horizon.
    placePoliceAhead(game, [
      { dx: -6, dz: -14 }, { dx: 8, dz: -20 }, { dx: 0, dz: -30 },
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
    placeInOwnCar(game, -100, 29, 0);
    step(game, 5, () => lanePilot(game, 32.4, 'x')); // The right-hand lane.
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
    courier.car.along = -40;
    courier.car.street = 29;
    courier.car.axis = 'x';
    courier.car.cruise = 0;
    courier.stopped = true;
    courier.runTimer = 99;
    const cx = -40;
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
    p.x = cx + 10;
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
