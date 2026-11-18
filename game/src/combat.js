// Combat for Vice Shores: fists, a pistol and the guards who carry them.
// Enemies are walkers in dark red who chase Rico and swing when they get
// close; Rico punches with F and shoots with the mouse, and the pistol
// fires along his facing with a short cooldown and a magazine of 24. A hit
// throws sparks, a kill drops the guard where he stands and leaves him
// there a few seconds before the street swallows him. Pedestrians are never
// targets: a shot only ever finds a guard, so a wild click on a crowded
// sidewalk costs a bullet and nothing else.
//
// The player object the world passes in carries x, z, heading, ammo,
// health and inCar; combat reads it and writes back ammo, and reports the
// damage its enemies deal through the update return value.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { createRandom, range, pick } from './random.js';
import { createWalkerMesh, syncWalkerMesh } from './vehicles.js';

const ENEMY_HEALTH = 2;
const ENEMY_SPEED = 3.4;
const ENEMY_RANGE = 1.9;
const ENEMY_HIT_COOLDOWN = 0.9;
const AIM_CONE = 0.45;
const DEAD_LINGER = 4;

export function createCombat(scene, seed, particles, audio) {
  const rng = createRandom(seed ^ 0xC0BA);
  const enemies = [];
  let shootCooldown = 0;
  let punchCooldown = 0;

  function makeEnemy(x, z) {
    const mesh = createWalkerMesh(0x8a1a1a, 0x1a1a22);
    // A guard's pistol: a small dark box in his hand.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.4, metalness: 0.8 }),
    );
    gun.position.set(0.3, 1.05, 0.2);
    mesh.group.add(gun);
    scene.add(mesh.group);
    const enemy = {
      x, z, heading: range(rng, 0, Math.PI * 2),
      health: ENEMY_HEALTH, mesh, phase: range(rng, 0, Math.PI * 2),
      hitTimer: 0, dead: false, deadTimer: 0, speed: ENEMY_SPEED * range(rng, 0.9, 1.15),
    };
    syncWalkerMesh(mesh, x, z, enemy.heading, 0);
    enemies.push(enemy);
    return enemy;
  }

  /** The nearest living enemy inside `range` of a point, or null. */
  function nearestEnemy(x, z, rangeLimit) {
    let best = null;
    let bestD = rangeLimit;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  /** The nearest living enemy inside the pistol's aim cone. */
  function enemyInAim(player) {
    const fx = Math.cos(player.heading);
    const fz = Math.sin(player.heading);
    let best = null;
    let bestD = PLAYER.pistolRange;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > PLAYER.pistolRange || d < 0.5) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < Math.cos(AIM_CONE)) continue;
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  function hurtEnemy(enemy, damage, kx, kz) {
    enemy.health -= damage;
    enemy.x += kx;
    enemy.z += kz;
    particles.burst(enemy.x, 1.2, enemy.z, 10, 0xffd94a, 3, 0.5);
    if (enemy.health <= 0) {
      enemy.dead = true;
      enemy.deadTimer = DEAD_LINGER;
      enemy.mesh.group.rotation.z = Math.PI / 2;
      particles.burst(enemy.x, 1.0, enemy.z, 16, 0xd83a3a, 4, 0.8);
      if (audio) audio.crash(0.3);
    }
  }

  return {
    enemies,

    /** Bring `count` guards out around a point, facing the player. */
    spawnSquad(x, z, count) {
      for (let i = 0; i < count; i += 1) {
        const angle = (i / Math.max(1, count)) * Math.PI * 2;
        makeEnemy(x + Math.cos(angle) * 3, z + Math.sin(angle) * 3);
      }
    },

    /** A punch: the nearest guard in reach takes a hit and a shove. */
    punch(player) {
      if (punchCooldown > 0) return false;
      punchCooldown = PLAYER.punchCooldown;
      const target = nearestEnemy(player.x, player.z, PLAYER.punchRange);
      if (!target) return false;
      const kx = Math.cos(player.heading) * 1.2;
      const kz = Math.sin(player.heading) * 1.2;
      hurtEnemy(target, PLAYER.punchDamage, kx, kz);
      if (audio) audio.punch();
      return true;
    },

    /** Fire one pistol round along the player's facing, if ammo allows. */
    shoot(player) {
      if (shootCooldown > 0 || player.ammo <= 0) return false;
      shootCooldown = PLAYER.pistolCooldown;
      player.ammo -= 1;
      if (audio) audio.shot();
      const mx = player.x + Math.cos(player.heading) * 1.2;
      const mz = player.z + Math.sin(player.heading) * 1.2;
      particles.burst(mx, 1.3, mz, 6, 0xffe9a0, 5, 0.25);
      const target = enemyInAim(player);
      if (target) {
        hurtEnemy(target, PLAYER.pistolDamage, Math.cos(player.heading) * 0.6, Math.sin(player.heading) * 0.6);
        return true;
      }
      // A miss still kicks dust up where the round lands.
      const endX = player.x + Math.cos(player.heading) * 24;
      const endZ = player.z + Math.sin(player.heading) * 24;
      particles.burst(endX, 0.3, endZ, 4, 0x9a9a8a, 2, 0.4);
      return false;
    },

    /** Reload: a fresh magazine, with a click. */
    reload(player) {
      if (player.ammo >= PLAYER.pistolAmmo) return false;
      player.ammo = PLAYER.pistolAmmo;
      if (audio) audio.reload();
      return true;
    },

    reset() {
      for (const e of enemies) scene.remove(e.mesh.group);
      enemies.length = 0;
      shootCooldown = 0;
      punchCooldown = 0;
    },

    /**
     * Advance the guards one step. Returns { damage } — the damage the
     * guards dealt this step, which the world subtracts from the player.
     */
    update(dt, player) {
      shootCooldown = Math.max(0, shootCooldown - dt);
      punchCooldown = Math.max(0, punchCooldown - dt);
      let damage = 0;
      for (const e of enemies.slice()) {
        e.hitTimer -= dt;
        if (e.dead) {
          e.deadTimer -= dt;
          if (e.deadTimer <= 0) {
            scene.remove(e.mesh.group);
            enemies.splice(enemies.indexOf(e), 1);
          }
          continue;
        }
        const dx = player.x - e.x;
        const dz = player.z - e.z;
        const d = Math.hypot(dx, dz);
        e.heading = Math.atan2(dz, dx);
        if (d > ENEMY_RANGE) {
          e.x += (dx / d) * e.speed * dt;
          e.z += (dz / d) * e.speed * dt;
          e.phase += dt * e.speed * 2.2;
        } else if (e.hitTimer <= 0) {
          // In reach: swing, and the player feels it after a short wind-up.
          e.hitTimer = ENEMY_HIT_COOLDOWN;
          damage += 6;
          particles.burst(player.x, 1.2, player.z, 8, 0xff5a5a, 3, 0.4);
          if (audio) audio.punch();
        }
        syncWalkerMesh(e.mesh, e.x, e.z, e.heading, e.phase);
      }
      return { damage };
    },
  };
}
