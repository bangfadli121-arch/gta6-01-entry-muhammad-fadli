// Traffic and pedestrians for Vice Shores: the cars that fill the streets
// and the people on the sidewalks. Every driver follows one street in one
// direction at a seeded cruise speed, brakes for the car ahead and wraps
// around the far edge of the city when it runs out of road, so the streets
// never empty out. Parked cars line the kerbs, one of them Rico's own car
// by the Hideout. Pedestrians stroll the sidewalks and step aside when a
// car — or Rico — gets too close. All motion is seeded: the same seed puts
// the same cars on the same streets, which keeps the screenshots stable.

import { CITY, CAR } from './config.js';
import { createRandom, range, intIn, pick, chance } from './random.js';
import { createCarMesh, createWalkerMesh, syncCarMesh, syncWalkerMesh, makeCarRecord, CAR_COLORS, CAR_KINDS } from './vehicles.js';

const DRIVE_COUNT = 20;
const PARKED_COUNT = 10;
const PED_COUNT = 26;

const SHIRTS = [0xd83a3a, 0x2a6fd8, 0xe8b93a, 0x3aa84f, 0xe8e8e8, 0x7a3ad8, 0xd86a2a];
const PANTS = [0x222226, 0x3a3a4a, 0x5a4a3a, 0x2a2a32];

function streetLane(street, direction) {
  // Right-hand traffic: drive on the right side of the street's centre.
  // Builder #11: 2.5, not 3.4 — with the pitch-48 slots 13 from the
  // street centre, the old lane put the car 9.6 from a tower corner,
  // inside its collision box (hd up to 10 + car radius 2.4). At 2.5
  // the lane clears every capped tower (hd 7) by a unit.
  return street + (direction > 0 ? 2.5 : -2.5);
}

export function createTraffic(scene, seed, buildings) {
  const rng = createRandom(seed ^ 0x7A66);
  const cars = [];
  const parked = [];
  const peds = [];

  function addDrivingCar() {
    const axis = chance(rng, 0.5) ? 'x' : 'z';
    const street = pick(rng, CITY.streets);
    const direction = chance(rng, 0.5) ? 1 : -1;
    const kind = pick(rng, ['sedan', 'sedan', 'coupe', 'taxi', 'van', 'sports']);
    const color = pick(rng, CAR_COLORS);
    const along = range(rng, -175, 175);
    const car = makeCarRecord(kind, color, 0, 0, 0);
    car.axis = axis;
    car.street = street;
    car.direction = direction;
    car.along = along;
    car.cruise = range(rng, CAR.npcSpeedMin, CAR.npcSpeedMax);
    car.speed = car.cruise;
    car.lane = streetLane(street, direction);
    car.mesh = createCarMesh(kind, color);
    scene.add(car.mesh.group);
    placeCar(car);
    cars.push(car);
    return car;
  }

  /** Put a driving car at its (axis, street, along) coordinates. */
  function placeCar(car) {
    if (car.axis === 'x') {
      car.x = car.along;
      car.z = car.lane;
      car.heading = car.direction > 0 ? 0 : Math.PI;
    } else {
      car.x = car.lane;
      car.z = car.along;
      car.heading = car.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    syncCarMesh(car.mesh, car, 0);
  }

  /** The car directly ahead of `car` on the same street, if any. */
  function carAheadOf(car, rangeAhead) {
    let nearest = Infinity;
    for (const other of cars) {
      if (other === car || other.axis !== car.axis || other.street !== car.street) continue;
      const gap = (other.along - car.along) * car.direction;
      if (gap > 0 && gap < rangeAhead && gap < nearest) nearest = gap;
    }
    return nearest;
  }

  function addParkedCar(own) {
    const street = pick(rng, CITY.streets);
    const axis = chance(rng, 0.5) ? 'x' : 'z';
    const along = range(rng, -170, 170);
    const side = chance(rng, 0.5) ? 1 : -1;
    const kind = own ? 'sports' : pick(rng, CAR_KINDS);
    const color = own ? 0xff2a6a : pick(rng, CAR_COLORS);
    const car = makeCarRecord(kind, color, 0, 0, 0);
    car.own = own;
    if (own) {
      // Rico's own car waits by the Hideout, nose east, in the right-hand
      // lane of the street — clear of the Hideout's walls, so it can drive.
      car.x = 30;
      car.z = -116.6;
      car.heading = 0;
      car.axis = 'x';
      car.street = -120;
      car.along = 35;
    } else {
      if (axis === 'x') {
        car.x = along;
        car.z = street + side * 5.6;
        car.heading = side > 0 ? 0 : Math.PI;
      } else {
        car.x = street + side * 5.6;
        car.z = along;
        car.heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      car.axis = axis;
      car.street = street;
      car.along = along;
    }
    car.mesh = createCarMesh(kind, color);
    scene.add(car.mesh.group);
    syncCarMesh(car.mesh, car, 0);
    parked.push(car);
    return car;
  }

  function addPedestrian() {
    const street = pick(rng, CITY.streets);
    const axis = chance(rng, 0.5) ? 'x' : 'z';
    const along = range(rng, -175, 175);
    const side = chance(rng, 0.5) ? 1 : -1;
    const ped = {
      axis,
      street,
      along,
      direction: chance(rng, 0.5) ? 1 : -1,
      speed: range(rng, 1.2, 2.4),
      phase: range(rng, 0, Math.PI * 2),
      x: 0,
      z: 0,
      heading: 0,
      mesh: createWalkerMesh(pick(rng, SHIRTS), pick(rng, PANTS)),
    };
    // Sidewalks run just outside the asphalt: 9 units off the centre line.
    ped.offset = side * 9.5;
    scene.add(ped.mesh.group);
    peds.push(ped);
    return ped;
  }

  function placePed(ped) {
    if (ped.axis === 'x') {
      ped.x = ped.along;
      ped.z = ped.street + ped.offset;
      ped.heading = ped.direction > 0 ? 0 : Math.PI;
    } else {
      ped.x = ped.street + ped.offset;
      ped.z = ped.along;
      ped.heading = ped.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    syncWalkerMesh(ped.mesh, ped.x, ped.z, ped.heading, ped.phase);
  }

  for (let i = 0; i < DRIVE_COUNT; i += 1) addDrivingCar();
  addParkedCar(true);
  for (let i = 0; i < PARKED_COUNT; i += 1) addParkedCar(false);
  for (let i = 0; i < PED_COUNT; i += 1) {
    const ped = addPedestrian();
    placePed(ped);
  }

  return {
    cars,
    parked,
    peds,

    /** The nearest parked car within `range` of a point, or null. */
    nearestParked(x, z, rangeLimit) {
      let best = null;
      let bestD = rangeLimit;
      for (const car of parked) {
        const d = Math.hypot(car.x - x, car.z - z);
        if (d < bestD) { best = car; bestD = d; }
      }
      return best;
    },

    /** Take a parked car off the kerb: it is driven now, not parked. */
    takeParked(car) {
      const index = parked.indexOf(car);
      if (index >= 0) parked.splice(index, 1);
    },

    /** Park a car back on the kerb where it stands. */
    returnParked(car) {
      car.speed = 0;
      car.braking = false;
      parked.push(car);
      syncCarMesh(car.mesh, car, 0);
    },

    /** A pedestrian's next step: used by combat when one is knocked down. */
    removePed(ped) {
      const index = peds.indexOf(ped);
      if (index >= 0) {
        peds.splice(index, 1);
        scene.remove(ped.mesh.group);
        const fresh = addPedestrian();
        placePed(fresh);
      }
    },

    reset() {
      for (const car of cars) {
        car.along = range(rng, -175, 175);
        car.speed = car.cruise;
        placeCar(car);
      }
      for (const ped of peds) {
        ped.along = range(rng, -175, 175);
        placePed(ped);
      }
    },

    update(dt, player) {
      // Driving cars: cruise, brake for the car ahead, wrap at the edge.
      for (const car of cars) {
        const ahead = carAheadOf(car, 12);
        const playerAhead = player && player.inCar
          ? Math.hypot(player.x - car.x, player.z - car.z) < 9 &&
            ((player.x - car.x) * Math.cos(car.heading) + (player.z - car.z) * Math.sin(car.heading)) > 0
          : false;
        const want = ahead < 12 || playerAhead ? 0 : car.cruise;
        car.braking = want === 0 && car.speed > 0.5;
        car.speed += (want - car.speed) * Math.min(1, 2.2 * dt);
        if (car.speed < 0.05 && want === 0) car.speed = 0;
        car.along += car.direction * car.speed * dt;
        if (car.along > 185) car.along = -185;
        if (car.along < -185) car.along = 185;
        placeCar(car);
        syncCarMesh(car.mesh, car, dt);
      }
      // Pedestrians: stroll, pause at corners, step aside from the player.
      for (const ped of peds) {
        ped.along += ped.direction * ped.speed * dt;
        if (ped.along > 185) ped.along = -185;
        if (ped.along < -185) ped.along = 185;
        if (player) {
          const d = Math.hypot(player.x - ped.x, player.z - ped.z);
          if (d < 3 && !player.inCar) {
            // Step off the path: a little sideways shuffle.
            ped.offset += (ped.offset > 0 ? 1 : -1) * dt * 2;
            ped.offset = Math.max(8, Math.min(12, ped.offset));
          }
        }
        ped.phase += dt * ped.speed * 2.4;
        placePed(ped);
      }
    },
  };
}
