// The world of Vice Shores: the one object the boot code talks to. It owns
// the renderer, the HUD, the city, the traffic, the police, the missions,
// the combat, the audio and the particles, and it owns Rico himself — on
// foot and in a car. One fixed step (1/60 s) advances everything: input
// becomes driving or walking, crimes raise the wanted level, the police
// hunt, missions pay, and the HUD and the minimap are repainted from the
// same state the game logic just wrote. The save lives in localStorage.
//
// The boot code (main.js) and the screenshot stager (shots.js) only ever
// touch the surface below: createGame, loadSave, startGame, respawn, reset,
// startMission, update, updateIdle, setRenderEnabled, and the plain fields
// state, hud, renderer, player, traffic, police, combat, missions, courier
// and briefcase. Everything else is internal.

import { CITY, CAR, PLAYER, WANTED, MISSIONS, HIDEOUT, DOCKS, START_CASH, SAVE_KEY } from './config.js';
import { ACTION_ENTER, ACTION_PUNCH, ACTION_RELOAD, ACTION_MUTE } from './input.js';
import { createHud } from './hud.js';
import { createRenderer } from './render.js';
import { createParticles } from './particles.js';
import { createAudio } from './audio.js';
import { createCarMesh, createWalkerMesh, syncCarMesh, syncWalkerMesh } from './vehicles.js';
import { buildCity, hitsBuilding, clampToWorld } from './city.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';

const SPAWN = { x: 24, z: -116.6, heading: 0 };

export function createGame(canvas, theme, seed, textures) {
  const renderer = createRenderer(canvas, theme, textures);
  const scene = renderer.scene;
  const hud = createHud(document);
  const particles = createParticles(scene);
  const audio = createAudio();
  const city = buildCity(scene, theme, seed, textures);
  const traffic = createTraffic(scene, seed, city.buildings);
  const police = createPolice(scene, seed);
  const missions = createMissions(scene, seed);
  const combat = createCombat(scene, seed, particles, audio);

  const state = { screen: 'title', time: 0 };
  let renderEnabled = true;
  let renderedThisTask = false;
  // The boot loop calls update() once per fixed step, several times per
  // animation frame on a slow display — but the scene must be painted once
  // per frame, not once per step, or a slow frame queues a dozen full
  // renders and the renderer never catches up. The flag below is set by
  // the first step of a frame's batch and cleared by a microtask, which
  // runs after the whole frame callback — so exactly one step paints.
  function paintOnce() {
    if (!renderEnabled || renderedThisTask) return;
    renderedThisTask = true;
    queueMicrotask(() => { renderedThisTask = false; });
    renderer.render();
  }
  let wanted = 0;
  let wantedTimer = 0;
  let crashTimer = 0;
  let carCondition = 100;
  let driftTime = 0;
  let lastDriftShow = -10;
  let nearMissTimer = 0;
  let saveTimer = 0;
  let muted = false;

  // Rico: a walker in a yellow jacket. In a car the figure hides — he is
  // driving, not standing on the roof.
  const playerMesh = createWalkerMesh(0xffd94a, 0x222226);
  scene.add(playerMesh.group);
  const player = {
    x: SPAWN.x, z: SPAWN.z, heading: SPAWN.heading,
    speed: 0, health: PLAYER.health, ammo: PLAYER.pistolAmmo,
    cash: START_CASH, inCar: false, car: null,
    mesh: playerMesh.group, walkPhase: 0,
  };
  syncWalkerMesh(playerMesh, player.x, player.z, player.heading, 0);

  function setWanted(level, reason) {
    const next = Math.max(0, Math.min(5, level));
    if (next > wanted && reason) hud.message(reason);
    wanted = next;
    wantedTimer = 0;
    audio.setSiren(wanted > 0 && police.count > 0);
  }

  function addCash(amount) {
    player.cash += amount;
    audio.cash();
  }

  function saveGame() {
    try {
      const data = {
        cash: Math.floor(player.cash),
        mission: missions.missionIndex < 0 ? 0 : missions.missionIndex,
        storyDone: missions.storyDone,
        x: player.x, z: player.z,
        health: player.health, ammo: player.ammo,
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) { /* A blocked storage is not a lost game. */ }
  }

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.cash !== 'number' || typeof data.mission !== 'number') return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  function placeAtSpawn() {
    player.x = SPAWN.x;
    player.z = SPAWN.z;
    player.heading = SPAWN.heading;
    player.speed = 0;
    syncWalkerMesh(playerMesh, player.x, player.z, player.heading, 0);
  }

  function reset(full) {
    placeAtSpawn();
    player.health = PLAYER.health;
    player.ammo = PLAYER.pistolAmmo;
    player.inCar = false;
    player.car = null;
    playerMesh.group.visible = true;
    if (full) player.cash = START_CASH;
    setWanted(0);
    wantedTimer = 0;
    crashTimer = 0;
    carCondition = 100;
    driftTime = 0;
    nearMissTimer = 0;
    state.time = 0;
    missions.reset();
    police.reset();
    combat.reset();
    traffic.reset();
    particles.update(0);
  }

  function startGame(fromSave) {
    reset(true);
    if (fromSave) {
      player.cash = fromSave.cash || START_CASH;
      player.health = fromSave.health || PLAYER.health;
      player.ammo = fromSave.ammo || PLAYER.pistolAmmo;
      if (fromSave.x !== undefined && fromSave.z !== undefined) {
        player.x = fromSave.x;
        player.z = fromSave.z;
      }
      if (!fromSave.storyDone) {
        missions.start(Math.max(0, Math.min(MISSIONS.length - 1, fromSave.mission || 0)));
        setWanted(missions.startingWanted());
        hud.message(`Welcome back, Rico. ${missions.currentObjective().text}`);
      } else {
        hud.message('Welcome back, Rico. The city is yours.');
      }
    } else {
      missions.start(0);
      hud.message('Mission 1: The Pickup. Steal a car with E — yours is by the Hideout.');
    }
    state.screen = 'play';
    hud.show();
    audio.resume();
    syncHud(true);
  }

  function startMission(index) {
    const intro = missions.start(index);
    setWanted(missions.startingWanted());
    if (intro) hud.message(intro);
    audio.sting();
    syncHud(true);
  }

  function respawn(fee, reason) {
    if (player.inCar && player.car) {
      traffic.returnParked(player.car);
      player.car = null;
      player.inCar = false;
      playerMesh.group.visible = true;
    }
    player.cash = Math.max(0, player.cash - fee);
    player.health = PLAYER.health;
    player.ammo = PLAYER.pistolAmmo;
    placeAtSpawn();
    setWanted(0);
    police.reset();
    combat.reset();
    hud.message(`${reason} — $${fee} gone. Rico is back on the streets.`);
    saveGame();
    syncHud(true);
  }

  // ---- driving -----------------------------------------------------------
  function drive(dt, axes, car) {
    const forward = axes.throttle;
    const steerInput = axes.steer;
    car.steer = steerInput * (car.speed >= 0 ? 1 : -1);
    if (forward > 0) car.speed += CAR.accel * forward * dt;
    if (forward < 0) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    if (axes.brake) car.speed -= CAR.brake * 0.8 * dt * Math.sign(car.speed || 1);
    const drag = axes.handbrake ? CAR.handbrakeDrag : CAR.drag;
    car.speed -= car.speed * drag * dt;
    if (Math.abs(car.speed) < 0.05 && forward === 0) car.speed = 0;
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    // Steering bites less at speed, more in reverse — like a real car.
    const steerAuthority = CAR.steerRate * Math.min(1, 0.35 + Math.abs(car.speed) / 22);
    car.heading += car.steer * steerAuthority * dt * (car.speed >= 0 ? 1 : -1)
      * Math.min(1, Math.abs(car.speed) / 6 + 0.25);
    car.braking = forward < 0 || axes.brake > 0;

    const nx = car.x + Math.cos(car.heading) * car.speed * dt;
    const nz = car.z + Math.sin(car.heading) * car.speed * dt;
    const hit = hitsBuilding(city.buildings, nx, nz, CAR.radius);
    if (hit) {
      if (Math.abs(car.speed) > 18 && crashTimer <= 0) {
        const hurt = Math.round((Math.abs(car.speed) - 18) * 0.7);
        carCondition = Math.max(0, carCondition - hurt);
        damagePlayer(hurt, 'crash');
        audio.crash(Math.min(1, Math.abs(car.speed) / CAR.maxSpeed));
        particles.burst(car.x, 0.8, car.z, 14, 0xffa03a, 4, 0.6);
        crashTimer = PLAYER.crashCooldown;
      }
      car.speed *= -0.25;
    } else {
      car.x = nx;
      car.z = nz;
    }
    const clamped = clampToWorld(car.x, car.z);
    car.x = clamped.x;
    car.z = clamped.z;

    // Shunt the traffic: a sideswipe slows both cars and can hurt. A fast
    // pass that only just misses is a near miss, not a crash.
    for (const other of traffic.cars) {
      const d = Math.hypot(other.x - car.x, other.z - car.z);
      if (d >= 4.2 && d < 6.5 && Math.abs(car.speed) > 12 && nearMissTimer <= 0) {
        nearMissTimer = 3;
        hud.showFeedback('NEAR MISS', '+$250');
      }
      if (d < 4.2 && d > 0.01) {
        const push = (4.2 - d) / 2;
        const px = (car.x - other.x) / d;
        const pz = (car.z - other.z) / d;
        car.x += px * push;
        car.z += pz * push;
        if (Math.abs(car.speed) > 12 && crashTimer <= 0) {
          damagePlayer(5, 'crash');
          audio.crash(0.5);
          particles.burst(car.x, 0.8, car.z, 10, 0xffa03a, 4, 0.5);
          crashTimer = PLAYER.crashCooldown;
        }
        car.speed *= 0.82;
        other.speed *= 0.7;
      }
    }
    // Hit-and-run: a pedestrian under the wheels is a crime, not a bump.
    for (const ped of traffic.peds.slice()) {
      if (Math.hypot(ped.x - car.x, ped.z - car.z) < 1.8 && Math.abs(car.speed) > 3) {
        traffic.removePed(ped);
        setWanted(wanted + 1, 'Hit and run! The VSPD is coming.');
        particles.burst(ped.x, 1, ped.z, 10, 0xd83a3a, 3, 0.5);
      }
    }
    if (axes.handbrake && Math.abs(car.speed) > 8) {
      particles.dust(car.x, car.z);
      if (Math.floor(state.time * 8) % 2 === 0) audio.skid();
      // Drifting: hold the handbrake at speed and the feedback counts up.
      driftTime += dt;
      if (driftTime > 0.6 && state.time - lastDriftShow > 0.5) {
        lastDriftShow = state.time;
        hud.showFeedback(`DRIFT x${1 + Math.floor(driftTime)}`, '');
      }
    } else {
      driftTime = 0;
    }
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    player.speed = car.speed;
    syncCarMesh(car.mesh, car, dt);
  }

  // ---- walking -----------------------------------------------------------
  function walk(dt, axes) {
    const run = axes.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const fx = Math.cos(player.heading);
    const fz = Math.sin(player.heading);
    // WASD moves Rico relative to where he faces; A/D turn him.
    if (axes.steer !== 0) player.heading += axes.steer * 2.6 * dt;
    const move = axes.throttle * run;
    const nx = player.x + fx * move * dt;
    const nz = player.z + fz * move * dt;
    if (!hitsBuilding(city.buildings, nx, player.z, PLAYER.radius)) player.x = nx;
    if (!hitsBuilding(city.buildings, player.x, nz, PLAYER.radius)) player.z = nz;
    const clamped = clampToWorld(player.x, player.z);
    player.x = clamped.x;
    player.z = clamped.z;
    player.speed = move;
    if (move !== 0) player.walkPhase += dt * Math.abs(move) * 1.4;
    syncWalkerMesh(playerMesh, player.x, player.z, player.heading, player.walkPhase);
  }

  function enterOrExitCar() {
    if (player.inCar) {
      const car = player.car;
      traffic.returnParked(car);
      player.car = null;
      player.inCar = false;
      player.speed = 0;
      // Step out to the car's left, facing the way it faces.
      player.x = car.x + Math.sin(car.heading) * 3;
      player.z = car.z - Math.cos(car.heading) * 3;
      player.heading = car.heading;
      playerMesh.group.visible = true;
      syncWalkerMesh(playerMesh, player.x, player.z, player.heading, 0);
      hud.message('Out of the car.');
      return;
    }
    const car = traffic.nearestParked(player.x, player.z, PLAYER.stealRange);
    if (!car) {
      hud.message('No car close enough — walk up to one and press E.');
      return;
    }
    traffic.takeParked(car);
    player.car = car;
    player.inCar = true;
    playerMesh.group.visible = false;
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    player.speed = car.speed;
    audio.resume();
    audio.honk();
    if (car.own) {
      hud.message("Rico's own car. The city is open — follow the yellow marker.");
    } else {
      setWanted(wanted + 1, 'Car stolen! Someone called the VSPD.');
      hud.message(`Stole a ${car.kind}. Lose the heat.`);
    }
    syncCarMesh(car.mesh, car, 0);
  }

  function damagePlayer(amount, kind) {
    if (amount <= 0) return;
    player.health -= amount;
    if (kind === 'crash') audio.crash(0.4);
  }

  // The district name under the minimap, from the player's position.
  // Builder #11: radius-based, so the island's districts read round —
  // the beach ring, the docks, Casino Row, the Hideout, Coral Strand.
  function districtName(x, z) {
    const r = Math.hypot(x, z);
    if (r >= CITY.beachInner) return 'PALM BEACH';
    if (Math.hypot(x - DOCKS.x, z - DOCKS.z) < 28) return 'THE DOCKS';
    if (Math.hypot(x - CITY.casino.x, z - CITY.casino.z) < 30) return 'CASINO ROW';
    if (Math.hypot(x - HIDEOUT.x, z - HIDEOUT.z) < 25) return 'HIDEOUT';
    if (x >= 120) return 'CORAL STRAND';
    if (r < 60) return 'DOWNTOWN';
    if (z >= 110) return 'SOUTHSHORE';
    if (x <= -120) return 'WESTSIDE';
    return 'VICE SHORES';
  }

  function syncHud(force) {
    hud.setStars(wanted);
    hud.setCash(player.cash);
    hud.setHealth(player.health);
    hud.setObjective(missions.currentObjective());
    const mission = missions.missionIndex >= 0 ? MISSIONS[missions.missionIndex] : null;
    hud.setStage(mission ? missions.stepIndex + 1 : 0, mission ? mission.steps.length : 0);
    hud.setAmmo(player.ammo);
    const gear = player.inCar ? 1 + Math.min(4, Math.floor(Math.abs(player.speed) / 9)) : 1;
    hud.setSpeed(Math.abs(player.speed) * 3.6, player.inCar, player.inCar ? carCondition : 100, gear);
    hud.setRespect(4, 456 + Math.max(0, missions.missionIndex) * 200 + missions.stepIndex * 50);
    hud.setCrosshair(!player.inCar);
    // The VSPD response list: each live unit's call sign, distance and
    // chase status, all read off the police module's own unit state.
    hud.setPolice(police.units.map((u, i) => {
      const dist = Math.round(Math.hypot(u.car.x - player.x, u.car.z - player.z));
      let status = 'ENROUTE';
      if (u.stuckTimer > 0) status = 'STUCK';
      else if (u.bustTimer > 0) status = 'BUST';
      else if (dist < 8) status = 'RAMMING';
      else if (dist < 40) status = 'PURSUIT';
      return { name: `VSPD-${i + 1}`, dist, status };
    }));
    // The dialog bar: the mission giver and the live objective line.
    if (mission) {
      const initials = mission.giver.split(' ').map((w) => w[0]).join('');
      hud.setDialog(mission.giver, initials, missions.currentObjective().text);
    } else {
      hud.setDialog('', '', '');
    }
    // The clock: Day 1 from 18:52, one game minute per two seconds of play.
    const minutes = 18 * 60 + 52 + Math.floor(state.time / 2);
    const day = 1 + Math.floor(minutes / (24 * 60));
    const hh = String(Math.floor((minutes % (24 * 60)) / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    hud.setClock(`DAY ${day} · ${hh}:${mm}`);
    hud.setVehicle(player.inCar && player.car ? player.car.kind.toUpperCase() : 'ON FOOT');
    hud.setLocation(districtName(player.x, player.z));
    hud.setHint(player.inCar
      ? 'WASD drive · Space handbrake · E get out · P pause · M mute'
      : 'WASD walk · E steal a car · F punch · Click to shoot · P pause · M mute');
    hud.drawMinimap({
      trafficCars: traffic.cars,
      hideout: HIDEOUT,
      marker: missions.marker(),
      police: police.units.map((u) => ({ x: u.car.x, z: u.car.z })),
      player: { x: player.x, z: player.z, heading: player.heading },
      time: state.time,
    });
  }

  // The VSPD helicopter circles over the player, rotor spinning, so the
  // chase always has a chopper in the sky. Its path is a pure function
  // of the clock, so the staged shots always catch it in the same place.
  function updateHelicopter() {
    const heli = city.helicopter;
    if (!heli) return;
    heli.visible = true;
    const a = state.time * 0.22 + 1.2;
    heli.position.set(player.x + Math.cos(a) * 42, 36, player.z + Math.sin(a) * 42);
    heli.rotation.y = -(a + Math.PI / 2);
    city.heliRotor.rotation.y = state.time * 28;
    city.heliTailRotor.rotation.x = state.time * 40;
  }

  // ---- the step ----------------------------------------------------------
  function update(dt, axes, actions, shooting) {
    state.time += dt;
    crashTimer = Math.max(0, crashTimer - dt);
    nearMissTimer = Math.max(0, nearMissTimer - dt);
    if (actions) audio.resume();
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      hud.message(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_ENTER) enterOrExitCar();
    if (!player.inCar) {
      if (actions & ACTION_PUNCH) combat.punch(player);
      if (actions & ACTION_RELOAD) combat.reload(player);
      if (shooting) combat.shoot(player);
    }

    if (player.inCar && player.car) drive(dt, axes, player.car);
    else walk(dt, axes);

    traffic.update(dt, player);
    const hunt = police.update(dt, player, wanted);
    if (hunt.rammed && crashTimer <= 0) {
      damagePlayer(8, 'ram');
      audio.crash(0.7);
      particles.burst(player.x, 1, player.z, 12, 0x8ab4ff, 4, 0.5);
      crashTimer = PLAYER.crashCooldown;
    }
    audio.setSiren(wanted > 0 && police.count > 0);

    const missionEvent = missions.update(dt, {
      player, combat,
      message: (text) => hud.message(text),
    });
    if (missionEvent.message) hud.message(missionEvent.message);
    if (missionEvent.failed) {
      audio.fail();
      const index = missions.missionIndex;
      if (index >= 0) missions.start(index);
      hud.message('Mission restarted.');
    }
    if (missionEvent.done) {
      addCash(missionEvent.reward);
      audio.sting();
      saveGame();
    }

    const combatEvent = combat.update(dt, player);
    if (combatEvent.damage > 0) {
      damagePlayer(combatEvent.damage, 'fight');
      audio.crash(0.3);
    }

    // Wanted decay: no crime, no unit close, and the heat fades a star.
    if (wanted > 0) {
      const nearPolice = police.units.some(
        (u) => Math.hypot(u.car.x - player.x, u.car.z - player.z) < 40,
      );
      if (!nearPolice) {
        wantedTimer += dt;
        if (wantedTimer >= WANTED.decaySeconds) {
          wantedTimer = 0;
          setWanted(wanted - 1);
          hud.message('The heat is cooling off.');
        }
      } else {
        wantedTimer = 0;
      }
    }

    particles.update(dt);
    audio.update(dt, player.inCar ? Math.abs(player.speed) / CAR.maxSpeed : 0, player.inCar);
    renderer.updateCamera(
      { x: player.x, z: player.z, heading: player.heading, inCar: player.inCar, speed: player.speed },
      dt,
    );
    updateHelicopter();
    syncHud(false);

    saveTimer += dt;
    if (saveTimer > 15) {
      saveTimer = 0;
      saveGame();
    }

    if (player.health <= 0) return 'wasted';
    if (hunt.busted) return 'busted';
    paintOnce();
    return undefined;
  }

  function updateIdle(dt) {
    state.time += dt;
    traffic.update(dt, null);
    particles.update(dt);
    updateHelicopter();
    renderer.setEstablishing();
    if (renderEnabled) renderer.render();
  }

  // A fresh world for the title screen: the city idles behind the menu.
  reset(false);
  missions.start(0);
  renderer.setEstablishing();

  return {
    state,
    hud,
    renderer,
    player,
    traffic,
    police,
    combat,
    missions,
    courier: missions.courier,
    briefcase: missions.briefcase,
    city,
    audio,
    get wanted() { return wanted; },
    get cash() { return player.cash; },
    loadSave,
    startGame,
    startMission,
    respawn,
    reset,
    update,
    updateIdle,
    setRenderEnabled(value) { renderEnabled = !!value; },
  };
}
