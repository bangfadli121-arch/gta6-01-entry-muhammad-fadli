// The story of Vice Shores: three chained jobs from Mara Kade of the Shore
// Kings, then a detective's trap. Each mission is a short list of steps —
// drive somewhere, tail a courier, fight his guards, lose the heat — and
// the module is a small state machine over those steps: it knows which step
// is live, where its marker sits, when the step is done and what it pays.
// The courier and the briefcase live here because only the missions move
// them; the world reads them for the minimap and the screenshots stage
// them directly (stop the courier, drop the briefcase, bring the guards).
//
// Step types, from config.js: goto (reach a point), tail (stay near the
// courier's car), combat (take the briefcase from his guards) and escape
// (reach the Hideout while the heat is on). Completing the last step of a
// mission pays its reward and opens the next one.

import * as THREE from 'three';
import { CITY, MISSIONS, HIDEOUT, PACKAGE_SPOTS } from './config.js';
import { createCarMesh, syncCarMesh, makeCarRecord } from './vehicles.js';

const TAIL_RANGE = 26;
const TAIL_NEED = 6;
const GOTO_RADIUS = 7;
const BRIEFCASE_RADIUS = 3;
const PACKAGE_RADIUS = 2.5;

export function createMissions(scene, seed) {
  let missionIndex = -1;
  let stepIndex = 0;
  let tailTime = 0;
  let guardsSpawned = false;
  let finished = false;

  // The courier's car: a dark sedan that cruises the streets until a
  // mission stops it. It is a plain car record with a street driver.
  const courierCar = makeCarRecord('sedan', 0x22222c, -40, 24, 0);
  courierCar.axis = 'x';
  courierCar.street = 24;
  courierCar.along = -40;
  courierCar.direction = 1;
  courierCar.cruise = 12;
  courierCar.speed = 12;
  courierCar.mesh = createCarMesh('sedan', 0x22222c);
  courierCar.mesh.group.visible = false;
  scene.add(courierCar.mesh.group);
  const courier = {
    car: courierCar,
    mesh: courierCar.mesh,
    active: false,
    stopped: false,
    runTimer: 0,
  };

  // The briefcase: a small gold box, hidden until the courier is stopped.
  const briefcaseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.25, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xd8a03a, emissive: 0x8a6a1a, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.7 }),
  );
  briefcaseMesh.position.set(0, 0.6, -1000);
  briefcaseMesh.visible = false;
  scene.add(briefcaseMesh);
  const briefcase = { active: false, x: 0, z: -1000, mesh: briefcaseMesh };

  // The pink packages: ten small glowing pink boxes on the streets, hidden
  // until the collection job starts. Each one spins slowly so it reads as
  // a pickup, not street litter.
  const packageMeshes = PACKAGE_SPOTS.map((spot) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xff5a9a, emissive: 0xd81e6a, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.1 }),
    );
    mesh.position.set(spot.x, 0.45, spot.z);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  let packagesTaken = PACKAGE_SPOTS.map(() => false);
  let packagesActive = false;
  let packagesCollected = 0;
  let lastPx = 0;
  let lastPz = 0;

  function hidePackages() {
    packagesActive = false;
    for (const mesh of packageMeshes) mesh.visible = false;
  }

  function showPackages() {
    packagesActive = true;
    packagesTaken = PACKAGE_SPOTS.map(() => false);
    packagesCollected = 0;
    for (const mesh of packageMeshes) mesh.visible = true;
  }

  /** The nearest package Rico has not taken yet, or null. */
  function nearestPackage(px, pz) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < PACKAGE_SPOTS.length; i += 1) {
      if (packagesTaken[i]) continue;
      const d = Math.hypot(PACKAGE_SPOTS[i].x - px, PACKAGE_SPOTS[i].z - pz);
      if (d < bestD) { bestD = d; best = PACKAGE_SPOTS[i]; }
    }
    return best;
  }

  function current() {
    return missionIndex >= 0 && missionIndex < MISSIONS.length ? MISSIONS[missionIndex] : null;
  }

  function currentStep() {
    const mission = current();
    if (!mission || stepIndex >= mission.steps.length) return null;
    return mission.steps[stepIndex];
  }

  function stepLabel(step) {
    if (!step) return { title: 'VICE SHORES', text: 'Free roam — steal a car, explore the city', sub: 'No active mission' };
    const mission = current();
    return {
      title: `MISSION ${mission.id} · ${mission.title}`,
      text: step.label,
      sub: step.sub || '',
    };
  }

  function dropBriefcase(x, z) {
    briefcase.active = true;
    briefcase.x = x;
    briefcase.z = z;
    briefcaseMesh.position.set(x, 0.6, z);
    briefcaseMesh.visible = true;
  }

  return {
    courier,
    briefcase,
    get packages() { return packageMeshes; },
    get collected() { return packagesCollected; },
    get packagesActive() { return packagesActive; },
    get missionIndex() { return missionIndex; },
    get stepIndex() { return stepIndex; },
    get storyDone() { return finished; },
    get active() { return missionIndex >= 0 && !finished; },

    currentObjective() {
      if (finished) return { title: 'STORY COMPLETE', text: 'Rico owns Vice Shores', sub: 'Free roam — the city is yours' };
      const step = currentStep();
      // The collection job counts live: the objective line and the sub-line
      // both carry the PACKAGES n/10 counter, Hilman-style.
      if (step && step.type === 'collect') {
        const mission = current();
        const total = step.total || PACKAGE_SPOTS.length;
        return {
          title: `MISSION ${mission.id} · ${mission.title}`,
          text: `Collect the pink packages — ${packagesCollected}/${total}`,
          sub: `PACKAGES ${packagesCollected}/${total}`,
        };
      }
      return stepLabel(step);
    },

    /** Where the yellow marker points, or null when there is none. */
    marker() {
      const step = currentStep();
      if (!step) return null;
      if (step.type === 'goto' || step.type === 'escape') return { x: step.x, z: step.z };
      if (step.type === 'tail') return { x: courier.car.x, z: courier.car.z };
      if (step.type === 'combat') {
        return briefcase.active ? { x: briefcase.x, z: briefcase.z } : { x: courier.car.x, z: courier.car.z };
      }
      if (step.type === 'collect') return nearestPackage(lastPx, lastPz) ?? null;
      return null;
    },

    /** Start mission `index` (0-based into config MISSIONS). Returns its intro. */
    start(index) {
      if (index < 0 || index >= MISSIONS.length) return '';
      missionIndex = index;
      stepIndex = 0;
      tailTime = 0;
      guardsSpawned = false;
      const mission = MISSIONS[index];
      // The courier only exists for his own mission; the heat only for the last.
      courier.active = mission.id === 2;
      courier.stopped = false;
      courier.runTimer = 0;
      courier.car.mesh.group.visible = courier.active;
      if (courier.active) {
        courier.car.axis = 'x';
        courier.car.street = 24;
        courier.car.along = -120;
        courier.car.direction = 1;
        courier.car.cruise = 12;
        courier.car.speed = 12;
      }
      briefcase.active = false;
      briefcaseMesh.visible = false;
      // The pink packages only exist for their own job.
      if (mission.id === 4) showPackages();
      else hidePackages();
      return mission.intro;
    },

    /** The wanted level a fresh mission starts with (the last one is hot). */
    startingWanted() {
      const mission = current();
      return mission && mission.id === 3 ? 3 : 0;
    },

    reset() {
      missionIndex = -1;
      stepIndex = 0;
      tailTime = 0;
      guardsSpawned = false;
      finished = false;
      courier.active = false;
      courier.stopped = false;
      courier.car.mesh.group.visible = false;
      briefcase.active = false;
      briefcaseMesh.visible = false;
      hidePackages();
    },

    /**
     * Advance the live step. `ctx` carries the player, the combat module
     * and the world's message/cash hooks. Returns an event object:
     * { done, reward, message, failed, advance } — the world acts on it.
     */
    update(dt, ctx) {
      const mission = current();
      const step = currentStep();
      const event = { done: false, reward: 0, message: '', failed: false, advance: false };
      if (!mission || !step) return event;

      // The courier cruises his street until a step stops him.
      if (courier.active && !courier.stopped) {
        courier.car.along += courier.car.direction * courier.car.speed * dt;
        if (courier.car.along > 185) { courier.car.along = -185; }
        if (courier.car.along < -185) { courier.car.along = 185; }
        if (courier.car.axis === 'x') {
          courier.car.x = courier.car.along;
          courier.car.z = courier.car.street + 3.4;
          courier.car.heading = courier.car.direction > 0 ? 0 : Math.PI;
        } else {
          courier.car.x = courier.car.street + 3.4;
          courier.car.z = courier.car.along;
          courier.car.heading = courier.car.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        syncCarMesh(courier.car.mesh, courier.car, dt);
      }

      const px = ctx.player.x;
      const pz = ctx.player.z;
      lastPx = px;
      lastPz = pz;

      // The pink packages spin while they wait to be picked up.
      if (packagesActive) {
        for (let i = 0; i < packageMeshes.length; i += 1) {
          if (!packagesTaken[i]) packageMeshes[i].rotation.y += dt * 1.5;
        }
      }

      if (step.type === 'goto' || step.type === 'escape') {
        const d = Math.hypot(px - step.x, pz - step.z);
        if (d < GOTO_RADIUS) {
          event.advance = true;
          stepIndex += 1;
        }
      } else if (step.type === 'tail') {
        const d = Math.hypot(px - courier.car.x, pz - courier.car.z);
        if (d < TAIL_RANGE) {
          tailTime += dt;
          if (tailTime >= TAIL_NEED) {
            // Caught up: the courier panics, stops, and his guards come out.
            courier.stopped = true;
            courier.car.cruise = 0;
            courier.car.speed = 0;
            courier.runTimer = 99;
            event.advance = true;
            event.message = 'The courier stopped — take the briefcase.';
            stepIndex += 1;
          }
        } else {
          tailTime = Math.max(0, tailTime - dt * 0.5);
          if (d > 90) {
            event.failed = true;
            event.message = 'You lost the courier. The job is blown.';
          }
        }
      } else if (step.type === 'combat') {
        if (!guardsSpawned) {
          guardsSpawned = true;
          ctx.combat.spawnSquad(courier.car.x + 4, courier.car.z + 2, 2);
          dropBriefcase(courier.car.x - 4, courier.car.z - 2);
          event.message = 'His guards are on you — take the briefcase.';
        }
        if (briefcase.active && Math.hypot(px - briefcase.x, pz - briefcase.z) < BRIEFCASE_RADIUS) {
          briefcase.active = false;
          briefcaseMesh.visible = false;
          event.advance = true;
          stepIndex += 1;
        }
      } else if (step.type === 'collect') {
        // Walk or drive into a pink package to take it; the counter in the
        // objective card counts up, and the marker jumps to the next one.
        const total = step.total || PACKAGE_SPOTS.length;
        if (packagesActive) {
          for (let i = 0; i < PACKAGE_SPOTS.length; i += 1) {
            if (packagesTaken[i]) continue;
            if (Math.hypot(px - PACKAGE_SPOTS[i].x, pz - PACKAGE_SPOTS[i].z) < PACKAGE_RADIUS) {
              packagesTaken[i] = true;
              packagesCollected += 1;
              packageMeshes[i].visible = false;
              event.message = `Package ${packagesCollected}/${total} — ${total - packagesCollected} to go.`;
            }
          }
        }
        if (packagesCollected >= total) {
          event.advance = true;
          stepIndex += 1;
        }
      }

      // The last step of a mission pays out and opens the next one.
      if (stepIndex >= mission.steps.length) {
        event.done = true;
        event.reward = mission.reward;
        event.message = `Mission complete — $${mission.reward}. ${mission.id < MISSIONS.length ? 'Next job from Mara.' : 'The story is done.'}`;
        if (mission.id >= MISSIONS.length) {
          finished = true;
          missionIndex = -1;
        } else {
          this.start(mission.id);
        }
      }
      return event;
    },
  };
}
