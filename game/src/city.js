// The city of Vice Shores: a grid of blocks between six streets on each axis,
// a beach and an ocean to the east, docks to the south-west and the Hideout
// to the north-east. Everything is built from boxes and planes with the
// theme's palette — no model files, no textures. The builder is seeded, so
// the same seed always raises the same skyline, which is what makes the
// screenshots repeatable. It hands back the building boxes the world uses
// for collision, plus the small road test every driver in the game shares.

import * as THREE from 'three';
import { CITY, PALETTES } from './config.js';
import { createRandom, range, intIn, pick, chance } from './random.js';

const BLOCK_CENTRES = [];
for (let i = 0; i < 7; i += 1) BLOCK_CENTRES.push(-CITY.pitch * 3 + i * CITY.pitch);

/** True when a point is on a road (within the asphalt, either axis). */
export function isOnRoad(x, z) {
  const half = CITY.roadWidth / 2 + 0.5;
  for (const s of CITY.streets) {
    if (Math.abs(x - s) < half || Math.abs(z - s) < half) return true;
  }
  return false;
}

/** The nearest street coordinate on one axis, for lane keeping. */
export function nearestStreet(v) {
  let best = CITY.streets[0];
  for (const s of CITY.streets) {
    if (Math.abs(v - s) < Math.abs(v - best)) best = s;
  }
  return best;
}

/** True when a circle at (x, z) with radius r overlaps a building box. */
export function hitsBuilding(buildings, x, z, r) {
  for (const b of buildings) {
    if (Math.abs(x - b.x) < b.hw + r && Math.abs(z - b.z) < b.hd + r) return b;
  }
  return null;
}

/** Clamp a point inside the world bounds, with a margin. */
export function clampToWorld(x, z, margin = 2) {
  const b = CITY.bound - margin;
  return {
    x: Math.max(-b, Math.min(b, x)),
    z: Math.max(-b, Math.min(b, z)),
  };
}

export function buildCity(scene, theme, seed) {
  const palette = PALETTES[theme];
  const rng = createRandom(seed ^ 0xC177);
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const buildings = [];
  const groundMat = new THREE.MeshStandardMaterial({ color: palette.groundTint, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  group.add(ground);

  // Roads: one dark strip per street, both axes, plus pale sidewalk edging.
  const roadMat = new THREE.MeshStandardMaterial({ color: palette.roadTint, roughness: 0.95 });
  const walkMat = new THREE.MeshStandardMaterial({ color: palette.sidewalkTint, roughness: 0.9 });
  const roadGeoX = new THREE.PlaneGeometry(440, CITY.roadWidth);
  const roadGeoZ = new THREE.PlaneGeometry(CITY.roadWidth, 440);
  const walkGeoX = new THREE.PlaneGeometry(440, CITY.roadWidth + 6);
  const walkGeoZ = new THREE.PlaneGeometry(CITY.roadWidth + 6, 440);
  for (const s of CITY.streets) {
    const walkX = new THREE.Mesh(walkGeoX, walkMat);
    walkX.rotation.x = -Math.PI / 2;
    walkX.position.set(0, 0.0, s);
    group.add(walkX);
    const walkZ = new THREE.Mesh(walkGeoZ, walkMat);
    walkZ.rotation.x = -Math.PI / 2;
    walkZ.position.set(s, 0.0, 0);
    group.add(walkZ);
    const roadX = new THREE.Mesh(roadGeoX, roadMat);
    roadX.rotation.x = -Math.PI / 2;
    roadX.position.set(0, 0.02, s);
    group.add(roadX);
    const roadZ = new THREE.Mesh(roadGeoZ, roadMat);
    roadZ.rotation.x = -Math.PI / 2;
    roadZ.position.set(s, 0.02, 0);
    group.add(roadZ);
  }

  // Centre dashes down every street, so the roads read as roads.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8a8 });
  const dashGeo = new THREE.PlaneGeometry(4, 0.5);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, CITY.streets.length * 2 * 22);
  const dummy = new THREE.Object3D();
  let dashIndex = 0;
  for (const s of CITY.streets) {
    for (let i = 0; i < 22; i += 1) {
      const along = -200 + i * 19;
      dummy.position.set(along, 0.04, s);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(dashIndex, dummy.matrix);
      dashIndex += 1;
      dummy.position.set(s, 0.04, along);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.updateMatrix();
      dashes.setMatrixAt(dashIndex, dummy.matrix);
      dashIndex += 1;
    }
  }
  dashes.count = dashIndex;
  group.add(dashes);

  // Buildings: one to three per block, heights that vary by district — taller
  // toward the middle, low near the beach. The east column past the beach
  // stays empty: that is sand and water, not towers.
  const tintMats = palette.buildingTints.map(
    (t) => new THREE.MeshStandardMaterial({ color: t, roughness: 0.85, metalness: 0.05 }),
  );
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x22222c, roughness: 1 });
  const neonMats = palette.neon.map(
    (n) => new THREE.MeshBasicMaterial({ color: n }),
  );
  const windowPositions = [];
  let neonCount = 0;
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      if (cx > 150) continue;
      const distCentre = Math.hypot(cx, cz) / 220;
      const count = chance(rng, 0.55) ? 2 : 1;
      const slots = count === 2
        ? [[-11, -11], [11, 11]]
        : [[0, 0]];
      for (const [ox, oz] of slots) {
        const w = range(rng, 14, 20);
        const d = range(rng, 14, 20);
        const h = range(rng, 7, 26) * (1.35 - distCentre * 0.7);
        const bx = cx + ox;
        const bz = cz + oz;
        const mat = pick(rng, tintMats);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(bx, h / 2, bz);
        group.add(tower);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
        roof.position.set(bx, h + 0.25, bz);
        group.add(roof);
        buildings.push({ x: bx, z: bz, hw: w / 2, hd: d / 2, h });
        // Lit windows on the south and west faces, denser at night.
        const floors = Math.max(1, Math.floor(h / 3.2));
        const cols = Math.max(1, Math.floor(w / 4));
        for (let f = 0; f < floors; f += 1) {
          for (let c = 0; c < cols; c += 1) {
            if (rng() > palette.windowLit) continue;
            const wy = 2.2 + f * 3.2;
            const wx = bx - w / 2 + 2.2 + c * 4;
            windowPositions.push([wx, wy, bz + d / 2 + 0.06, 0]);
            if (rng() > palette.windowLit + 0.2) continue;
            windowPositions.push([bx - w / 2 - 0.06, wy, bz - d / 2 + 2.2 + c * 4, 1]);
          }
        }
        // A neon sign on some towers, facing the street.
        if (neonCount < 12 && chance(rng, 0.35)) {
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, range(rng, 2, 5), range(rng, 4, 9)),
            neonMats[neonCount % neonMats.length],
          );
          sign.position.set(bx + w / 2 + 0.35, h * 0.7, bz);
          group.add(sign);
          neonCount += 1;
        }
      }
    }
  }

  // All lit windows in one instanced draw.
  const winGeo = new THREE.PlaneGeometry(1.7, 1.4);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  const windows = new THREE.InstancedMesh(winGeo, winMat, Math.max(1, windowPositions.length));
  windowPositions.forEach(([x, y, z, face], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, face === 0 ? 0 : -Math.PI / 2, 0);
    dummy.updateMatrix();
    windows.setMatrixAt(i, dummy.matrix);
  });
  windows.count = windowPositions.length;
  group.add(windows);

  // The beach: a sand strip, then the ocean, both east of the last street.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.waterX - CITY.beachX + 40, 440),
    new THREE.MeshStandardMaterial({ color: 0xc9b078, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((CITY.beachX + CITY.waterX) / 2 + 8, 0.03, 0);
  group.add(sand);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x1a5a8a, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(180, 440), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(CITY.waterX + 90, 0.04, 0);
  group.add(ocean);
  const surf = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 440),
    new THREE.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.55 }),
  );
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(CITY.waterX - 2, 0.06, 0);
  group.add(surf);

  // Palms along the beach, leaning a little toward the sea.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 0.9 });
  for (let i = 0; i < 14; i += 1) {
    const pz = -190 + i * 29 + range(rng, -4, 4);
    const px = CITY.beachX + 6 + range(rng, 0, 8);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 6, 7), trunkMat);
    trunk.position.set(px, 3, pz);
    trunk.rotation.z = 0.12;
    group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 8), leafMat);
    leaves.position.set(px + 0.7, 6.6, pz);
    group.add(leaves);
  }

  // Street lamps at the corners, lit at night: pole, arm and a glowing bulb.
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.7, metalness: 0.6 });
  const lampBulbMat = new THREE.MeshBasicMaterial({ color: palette.lampOn ? 0xffe9a0 : 0x555560 });
  const lampPositions = [];
  for (const s of CITY.streets) {
    for (const t of [-116, -58, 0, 58, 116]) {
      lampPositions.push([s + 8, t]);
    }
  }
  for (const [lx, lz] of lampPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6), lampPoleMat);
    pole.position.set(lx, 3.25, lz);
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampBulbMat);
    bulb.position.set(lx, 6.6, lz);
    group.add(bulb);
    if (palette.lampOn) {
      const glow = new THREE.PointLight(0xffd9a0, 6, 22, 1.8);
      glow.position.set(lx, 6.4, lz);
      // Only every fourth lamp carries a real light: forty point lights
      // would sink the frame, four dozen would sink it twice over.
      if ((lx * 7 + lz * 13) % 4 === 0) group.add(glow);
    }
  }

  // The Docks, south-west: stacked containers and crates by the water.
  const containerCols = [0x2a7a5a, 0xb83a2a, 0x2a5ab8, 0xd8a03a];
  for (let i = 0; i < 10; i += 1) {
    const cx = -160 + (i % 5) * 9;
    const cz = 128 + Math.floor(i / 5) * 9;
    const cont = new THREE.Mesh(
      new THREE.BoxGeometry(8, 3.4, 3.6),
      new THREE.MeshStandardMaterial({ color: containerCols[i % containerCols.length], roughness: 0.8 }),
    );
    cont.position.set(cx, 1.7 + (i % 3 === 0 ? 3.4 : 0), cz);
    group.add(cont);
    buildings.push({ x: cx, z: cz, hw: 4, hd: 1.8, h: 3.4 });
  }

  // The Hideout, north-east: a low building with a green awning, home base.
  // It sits a full block north of the street, never on the asphalt: the
  // street itself must stay clear for Rico's car and the traffic.
  const hideout = new THREE.Mesh(
    new THREE.BoxGeometry(18, 8, 14),
    new THREE.MeshStandardMaterial({ color: 0x3a5a4a, roughness: 0.85 }),
  );
  hideout.position.set(29, 4, -163);
  group.add(hideout);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.5, 5),
    new THREE.MeshStandardMaterial({ color: 0x2aff66, roughness: 0.7 }),
  );
  awning.position.set(29, 4.6, -154.5);
  group.add(awning);
  buildings.push({ x: 29, z: -163, hw: 9, hd: 7, h: 8 });

  return { group, buildings, lampBulbMat, oceanMat };
}
