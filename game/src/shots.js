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
    placeInOwnCar(game, -70, -24, 0);
    // Clear the chase route: a crossing car that stops for the player
    // (traffic brakes when the player is ahead of it) wedges the chase
    // to a dead stop in the intersection — that is what pinned the
    // speedo at 0. Every traffic car starts the drive at the far end
    // behind its direction of travel, so none of them reaches the
    // chase's route in eight seconds.
    for (const c of game.traffic.cars) {
      c.along = c.direction > 0 ? -175 : 175;
    }
    // Builder #12: clear the PARKED kerb too — a parked truck on the
    // z=-24 kerb right ahead of the chase start filled the whole
    // bottom-left of the cover frame with one flat orange slab. Parked
    // cars in the chase corridor (both kerbs, x -80..195) are rolled to
    // the street's far west end, behind the camera, where they can
    // neither block the wheel nor loom in the foreground. The player's
    // own car is exempt.
    for (const p of game.traffic.parked) {
      if (p.own) continue;
      if (p.x > -80 && p.x < 195 && Math.abs(p.z + 20.6) < 12) {
        p.x = -170;
        p.along = -170;
        syncCarMesh(p.mesh, p, 0);
      }
    }
    // Drive clean first: the heat only lands once the chase frame is staged,
    // so the police have no time to ram Rico to pieces before the photo.
    // Builder #11: eight seconds from further west — the chase must still
    // be moving when the photo is taken (speedo up, not 0), and the
    // camera must be east of the mid-city towers so the low sun reads
    // down the street. The pilot brakes for the car ahead; the street
    // ahead is cleared above, so it never has to.
    // Builder #12: ELEVEN seconds — the 8-second frame wedged the chase
    // behind the (133,-11) tower, which hid the ferris wheel, and the
    // yellow drum at (107,-37) blocked the VICE SHORES board. At eleven
    // seconds (proven in #11's local run 5) the camera is past both
    // blockers, the wheel stands at the end of the street, and both
    // billboards sit whole in the frame. The corridor towers are also
    // capped low in city.js, so the composition no longer hangs on one
    // exact drive length.
    // Builder #12, second look (probe, not a guess): at eleven seconds
    // the car is at x=146 and the wheel hub projects to the very top
    // edge of the frame (ndcY 0.91) with the rim top far outside it,
    // while the FLAMINGO board sits at ndcX 0.87, half out of frame —
    // the chase drove TOO far east.
    // Builder #13 — NINE seconds. The drive is slower than the old
    // comments assumed (the trace: 7 s only reaches x=52 — the car needs
    // ~4 s to wind up to speed, so 8 s lands at x~75, not x~146 as the
    // #12 log's 11-second probe suggested). At nine seconds the camera
    // sits ~90 units from the wheel: the rim top is just inside the
    // frame's top edge (~90% of the wheel shows, big), and the FLAMINGO
    // board sits ~30° off-axis at ~23% of the frame's width — big enough
    // to read. At ten the wheel's top is cut and the board crowds the
    // frame's edge; at eight both landmarks read small.
    step(game, 9, () => lanePilot(game, -20.6, 'x')); // The right-hand lane.
    game.startMission(2); // Three stars: the VSPD is on Rico.
    // One step so the three units actually spawn (they only appear inside
    // police.update), then park them ahead of the player for the chase frame.
    game.update(STEP, ZERO_AXES, 0, false);
    // Builder #13 — THREE units, CLOSE and converging, all inside the
    // frame: 11–20 units ahead of the hero (was 14–30, where they read as
    // specks), staggered across the lanes and facing the player, so the
    // chase reads in the cover — black-and-white cars with their light
    // bars on — not just a VSPD list in the HUD.
    placePoliceAhead(game, [
      { dx: 11, dz: -5 }, { dx: 15, dz: 6 }, { dx: 20, dz: -1 },
    ]);
    // One real step, so the HUD and the minimap paint the staged positions.
    game.update(STEP, ZERO_AXES, 0, false);
    // The staged frame is a chase, not a wreck: full health for the photo.
    game.player.health = 100;
    game.hud.setHealth(100);
    // Builder #13 — pin the light bars ON (flash = 1, red side lit) and
    // re-sync every unit, so the bars read the same in every capture:
    // the flash phase is wall-clock-ish (flashTime % 0.7) and would
    // otherwise flip red/blue between runs.
    for (const u of game.police.units) {
      u.car.flash = 1;
      syncCarMesh(u.mesh, u.car, 0);
    }
    // Builder #13 — the Halcyon cover framing: low, close, off-axis, so
    // the pink hero car fills the bottom of the frame in three-quarter
    // rear view. Frozen shot mode never calls updateCamera again, so this
    // pose holds until the capture.
    game.renderer.setCoverCamera(game.player);
    // Builder #13 — NO pinned DRIFT feedback in the cover: the big
    // centre text sat on the ferris wheel's lower half (the wheel now
    // fills the frame's centre), so the photo carries the chase, the
    // wheel and the board clean. The feedback system itself is untouched
    // — it still pops during real play.
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
