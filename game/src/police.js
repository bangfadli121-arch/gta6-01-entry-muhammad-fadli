// The VSPD: the police who answer the wanted level. One unit per star, up
// to five, each a black-and-white interceptor with a flashing light bar and
// a two-tone siren the audio module wails while any unit is hunting. A unit
// spawns on a street a little way from the player, steers toward him, and
// rams his car or — if he is on foot and stays too close for too long —
// busts him. Lose the heat by breaking away: with no crime and no unit
// nearby, the stars fade one at a time and the units peel off and vanish.
//
// A unit is a car record (x, z, heading, speed) plus a chase state: how
// long it has been close enough to bust, and how long since it last rammed.
// The world reads `units` for the minimap and the HUD, and applies the
// damage for a ram itself, so this module never touches player health.

import { CITY, CAR, WANTED } from './config.js';
import { createRandom, range } from './random.js';
import { createCarMesh, syncCarMesh, makeCarRecord } from './vehicles.js';

const SPAWN_DISTANCE = 65;
const DESPAWN_DISTANCE = 150;
const RAM_DISTANCE = 3.4;
const RAM_COOLDOWN = 1.1;

export function createPolice(scene, seed) {
  const rng = createRandom(seed ^ 0x901C);
  const units = [];
  let flashTime = 0;

  function spawnUnit(player) {
    const car = makeCarRecord('police', 0x1a1a22, 0, 0, 0);
    // Spawn on the nearest street, off to one side, facing the player.
    const angle = range(rng, 0, Math.PI * 2);
    car.x = player.x + Math.cos(angle) * SPAWN_DISTANCE;
    car.z = player.z + Math.sin(angle) * SPAWN_DISTANCE;
    car.x = Math.max(-CITY.bound + 6, Math.min(CITY.bound - 6, car.x));
    car.z = Math.max(-CITY.bound + 6, Math.min(CITY.bound - 6, car.z));
    car.heading = Math.atan2(player.z - car.z, player.x - car.x);
    car.speed = 16;
    car.mesh = createCarMesh('police', 0x1a1a22);
    scene.add(car.mesh.group);
    syncCarMesh(car.mesh, car, 0);
    const unit = {
      car,
      mesh: car.mesh,
      bustTimer: 0,
      ramTimer: 0,
      stuckTimer: 0,
      lastX: car.x,
      lastZ: car.z,
    };
    units.push(unit);
    return unit;
  }

  function removeUnit(unit) {
    const index = units.indexOf(unit);
    if (index >= 0) units.splice(index, 1);
    scene.remove(unit.car.mesh.group);
  }

  /** Steer `heading` toward `target` by at most `maxTurn` radians. */
  function steerToward(heading, target, maxTurn) {
    let diff = target - heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > maxTurn) return heading + maxTurn;
    if (diff < -maxTurn) return heading - maxTurn;
    return target;
  }

  return {
    units,

    /** How many units are hunting right now. */
    get count() { return units.length; },

    reset() {
      while (units.length > 0) removeUnit(units[0]);
      flashTime = 0;
    },

    /**
     * Advance the hunt one step. `player` is {x, z, inCar, heading, speed}.
     * Returns { busted, rammed } — the world applies the consequences.
     */
    update(dt, player, wanted) {
      flashTime += dt;
      const want = WANTED.policePerStar[Math.max(0, Math.min(5, wanted))] || 0;
      // Grow the hunt to the wanted level, shrink it when the heat fades.
      while (units.length < want) spawnUnit(player);
      while (units.length > want) removeUnit(units[units.length - 1]);

      let busted = false;
      let rammed = false;
      const flash = (flashTime % 0.7) < 0.35 ? 1 : 0;
      for (const unit of units.slice()) {
        const car = unit.car;
        const dx = player.x - car.x;
        const dz = player.z - car.z;
        const dist = Math.hypot(dx, dz);
        unit.ramTimer -= dt;

        // A unit that lost the player far away gives up and despawns.
        if (dist > DESPAWN_DISTANCE) {
          removeUnit(unit);
          continue;
        }

        car.flash = flash;
        // Chase: aim at where the player will be, not where he is.
        const lead = Math.min(1.2, dist / 40);
        const aimX = player.x + Math.cos(player.heading || 0) * (player.speed || 0) * lead;
        const aimZ = player.z + Math.sin(player.heading || 0) * (player.speed || 0) * lead;
        const targetHeading = Math.atan2(aimZ - car.z, aimX - car.x);
        const maxTurn = 2.4 * dt * Math.min(1, 0.4 + car.speed / 30);
        car.heading = steerToward(car.heading, targetHeading, maxTurn);
        car.steer = Math.max(-1, Math.min(1, (targetHeading - car.heading) * 2));
        // Faster than any civilian car, slower when turning hard.
        const turnPenalty = Math.abs(car.steer) * 6;
        const topSpeed = CAR.policeMaxSpeed - turnPenalty;
        car.speed += ((dist > 8 ? topSpeed : topSpeed * 0.55) - car.speed) * Math.min(1, 1.4 * dt);
        car.speed = Math.max(0, car.speed);
        car.x += Math.cos(car.heading) * car.speed * dt;
        car.z += Math.sin(car.heading) * car.speed * dt;
        // Stay inside the world: bounce off the edge back toward the centre.
        if (Math.abs(car.x) > CITY.bound - 4 || Math.abs(car.z) > CITY.bound - 4) {
          car.heading = Math.atan2(-car.z, -car.x);
        }
        // Stuck against a building or a kerb: reverse out, then rejoin.
        const moved = Math.hypot(car.x - unit.lastX, car.z - unit.lastZ);
        if (moved < car.speed * dt * 0.25 && car.speed > 4) {
          unit.stuckTimer += dt;
        } else {
          unit.stuckTimer = 0;
        }
        unit.lastX = car.x;
        unit.lastZ = car.z;
        if (unit.stuckTimer > 1.2) {
          car.heading += Math.PI * 0.6;
          car.speed = 8;
          unit.stuckTimer = 0;
        }

        // Ram: a hard touch at speed shoves the player's car and hurts.
        if (dist < RAM_DISTANCE && car.speed > 6 && unit.ramTimer <= 0) {
          rammed = true;
          unit.ramTimer = RAM_COOLDOWN;
        }

        // Bust: on foot, close, and held there — the cuffs come out.
        if (!player.inCar && dist < WANTED.bustDistance) {
          unit.bustTimer += dt;
          if (unit.bustTimer >= WANTED.bustSeconds) busted = true;
        } else {
          unit.bustTimer = Math.max(0, unit.bustTimer - dt * 2);
        }

        syncCarMesh(car.mesh, car, dt);
      }
      return { busted, rammed };
    },
  };
}
