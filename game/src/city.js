// The city of Vice Shores: a compact ROUND island — a tight grid of blocks
// inside a curved ring boulevard, a beach and an ocean all the way round,
// docks to the south-west and the Hideout to the north. Everything is built
// from boxes, drums and planes with the theme's palette — no model files,
// no textures. The builder is seeded, so the same seed always raises the
// same skyline, which is what makes the screenshots repeatable. It hands
// back the building boxes the world uses for collision, plus the small road
// test every driver in the game shares.
//
// Builder #11: "ga terlalu kotak2" / "map nya bulet padet" — the island is
// round and dense: the built-up blob ends in a curve at the ring boulevard,
// the coast is a circle, some towers are rounded drums, the districts are
// packed tight (docks, beach strip, downtown, palm boulevard, Casino Row),
// and the ring boulevard curves with the coast. The beachfront column is
// a low shop row, the tall towers wear the photographed art-deco facades,
// and the palms ring the island on both kerbs of the boulevard.
//
// Golden hour dressing (all visual, all deterministic): pastel towers with
// coloured parapet caps, rooftop AC boxes and shopfront awnings, windows lit
// in varied warm/cool/rose colours instead of one flat yellow, crosswalks at
// every intersection, a bright sand beach with colourful umbrellas and a
// sun-glitter strip on the ocean. Decorative extras are keyed off a hash of
// the building's position, never the seeded stream, so the city layout the
// seeded stream builds never moves.
//
// Builder #9 rebuild: the beachfront column is a low, colourful shop row
// (awnings, neon, shopfront glass) instead of flat towers, so the driving
// frames open onto the beach; tall towers get stepped crowns, balconies and
// vertical neon strips; palms are drooping fronds (instanced, two greens,
// varied height and lean) instead of cones; the shoreline reads as a curve
// — scalloped sand, a sine foam line and umbrellas on an arc — and the
// roads carry white edge lines and a warm sun streak, so the asphalt is
// never a black empty half-frame.

import * as THREE from 'three';
import { CITY, PALETTES } from './config.js';
import { createRandom, range, intIn, pick, chance } from './random.js';

const BLOCK_CENTRES = [];
for (let i = 0; i < 7; i += 1) BLOCK_CENTRES.push(-CITY.pitch * 3 + i * CITY.pitch);

/** A stable 0..1 hash of two coordinates, for decorative choices that must
 * not consume the seeded stream (and so must not move the city layout). */
function hash2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** One shared radial-gradient texture for every glow sprite: a white core
 * fading to transparent, tinted per sprite by its material colour. Painted
 * once at boot, so the bloom-like halos cost no post-processing pass. */
let glowTexture = null;
function makeGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

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

export function buildCity(scene, theme, seed, textures) {
  const palette = PALETTES[theme];
  const rng = createRandom(seed ^ 0xC177);
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // GPU facade textures (builder #10): the three art-deco renders, each
  // cloned with only its top 85% mapped — the bottom ~15% of every render
  // carries a garbled sign band and street, so it is cropped by texture
  // offset. Without textures every tower falls back to its flat tint.
  const facadeTexs = [];
  if (textures) {
    for (const key of ['facadeTeal', 'facadePink', 'facadeYellow']) {
      const src = textures[key];
      if (!src) { facadeTexs.push(null); continue; }
      const tex = src.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, 0.85);
      tex.offset.set(0, 0.15);
      tex.anisotropy = 4;
      facadeTexs.push(tex);
    }
  }
  const facadeMats = facadeTexs.map((tex) => (tex
    ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 })
    : null));

  const buildings = [];
  // Builder #11: the island — a round land disc, a sand beach ring and an
  // ocean ring around it, instead of a square ground plane. The land disc
  // ends at the beach; beyond it the ocean ring runs to the fog, so the
  // island reads round from every angle, on foot and from the title view.
  const groundMat = new THREE.MeshStandardMaterial({ color: palette.groundTint, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(CITY.islandRadius, 56), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  group.add(ground);
  // The beach ring: bright sand hugging the land disc's edge all the way
  // round the island, so the coast is a curve, never a straight strip.
  let beachTex = null;
  if (textures && textures.sand) {
    beachTex = textures.sand.clone();
    beachTex.needsUpdate = true;
    beachTex.wrapS = THREE.RepeatWrapping;
    beachTex.wrapT = THREE.RepeatWrapping;
    beachTex.repeat.set(24, 1);
    beachTex.anisotropy = 4;
  }
  const beachRing = new THREE.Mesh(
    new THREE.RingGeometry(CITY.beachInner, CITY.islandRadius + 2, 56),
    new THREE.MeshStandardMaterial({ color: beachTex ? 0xffffff : (palette.sandTint ?? 0xc9b078), map: beachTex, roughness: 1 }),
  );
  beachRing.rotation.x = -Math.PI / 2;
  beachRing.position.set(0, 0.03, 0);
  group.add(beachRing);
  // The ocean ring: vivid water from the beach out to the horizon.
  let oceanRingTex = null;
  if (textures && textures.ocean) {
    oceanRingTex = textures.ocean.clone();
    oceanRingTex.needsUpdate = true;
    oceanRingTex.wrapS = THREE.RepeatWrapping;
    oceanRingTex.wrapT = THREE.RepeatWrapping;
    oceanRingTex.repeat.set(24, 2);
    oceanRingTex.anisotropy = 4;
  }
  const oceanMat = new THREE.MeshStandardMaterial({ color: oceanRingTex ? 0xffffff : (palette.oceanTint ?? 0x1a5a8a), map: oceanRingTex, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94 });
  const oceanRing = new THREE.Mesh(
    new THREE.RingGeometry(CITY.islandRadius, 560, 56),
    oceanMat,
  );
  oceanRing.rotation.x = -Math.PI / 2;
  oceanRing.position.set(0, 0.02, 0);
  group.add(oceanRing);
  // A foam ring where the waves break on the sand, so the shoreline reads
  // as a bright curve from the driving view and from the title screen.
  const foamRing = new THREE.Mesh(
    new THREE.RingGeometry(CITY.islandRadius - 2, CITY.islandRadius + 1, 56),
    new THREE.MeshBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.55 }),
  );
  foamRing.rotation.x = -Math.PI / 2;
  foamRing.position.set(0, 0.05, 0);
  group.add(foamRing);

  // The ring boulevard: the island's curved coastal road — a true circle
  // of asphalt at ringRadius, with white edge lines and a yellow dashed
  // centre line, so the main drag curves with the coast instead of running
  // straight. It meets every street where they cross it (the streets run
  // out to +-175, the ring's outer edge is ringRadius + ringWidth/2).
  const ringMat = new THREE.MeshStandardMaterial({ color: palette.roadTint, roughness: 0.4, metalness: 0.1 });
  const ringRoad = new THREE.Mesh(new THREE.RingGeometry(CITY.ringRadius - CITY.ringWidth / 2, CITY.ringRadius + CITY.ringWidth / 2, 72), ringMat);
  ringRoad.rotation.x = -Math.PI / 2;
  ringRoad.position.set(0, 0.02, 0);
  group.add(ringRoad);
  const ringEdgeMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  for (const rr of [CITY.ringRadius - CITY.ringWidth / 2 + 0.4, CITY.ringRadius + CITY.ringWidth / 2 - 0.4]) {
    const edge = new THREE.Mesh(new THREE.RingGeometry(rr - 0.2, rr + 0.2, 72), ringEdgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(0, 0.045, 0);
    group.add(edge);
  }
  const dummy = new THREE.Object3D();
  const ringDashMat = new THREE.MeshBasicMaterial({ color: 0xffc93a });
  const ringDashGeo = new THREE.PlaneGeometry(4.5, 0.6);
  const ringDashes = new THREE.InstancedMesh(ringDashGeo, ringDashMat, 56);
  for (let i = 0; i < 56; i += 1) {
    const a = (i / 56) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * CITY.ringRadius, 0.04, Math.sin(a) * CITY.ringRadius);
    dummy.rotation.set(-Math.PI / 2, 0, -a + Math.PI / 2);
    dummy.updateMatrix();
    ringDashes.setMatrixAt(i, dummy.matrix);
  }
  ringDashes.count = 56;
  group.add(ringDashes);

  // Roads: one dark strip per street, both axes, plus pale sidewalk edging
  // in a sandy tone so the streets read against the blocks at golden hour.
  // The asphalt is a little wet-looking — low roughness, so the low sun
  // throws a specular streak down the east streets instead of a flat matte.
  // Builder #11: the strips run +-175, out to the ring boulevard.
  const roadMat = new THREE.MeshStandardMaterial({ color: palette.roadTint, roughness: 0.4, metalness: 0.1 });
  const walkMat = new THREE.MeshStandardMaterial({ color: palette.sidewalkTint, roughness: 0.9 });
  const roadGeoX = new THREE.PlaneGeometry(350, CITY.roadWidth);
  const roadGeoZ = new THREE.PlaneGeometry(CITY.roadWidth, 350);
  const walkGeoX = new THREE.PlaneGeometry(350, CITY.roadWidth + 6);
  const walkGeoZ = new THREE.PlaneGeometry(CITY.roadWidth + 6, 350);
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

  // Centre dashes down every street, so the roads read as roads — a bright
  // yellow centre line on dark asphalt, like the beach-city boulevards.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffc93a });
  const dashGeo = new THREE.PlaneGeometry(5, 0.7);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, CITY.streets.length * 2 * 18);
  let dashIndex = 0;
  for (const s of CITY.streets) {
    for (let i = 0; i < 18; i += 1) {
      const along = -160 + i * 19;
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

  // Crosswalks at every intersection: five white stripes across each street,
  // so the crossings read from the chase camera and the streets feel finished.
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  const crossGeo = new THREE.PlaneGeometry(0.9, 5.4);
  const crossCount = CITY.streets.length * CITY.streets.length * 2 * 5;
  const crosses = new THREE.InstancedMesh(crossGeo, crossMat, crossCount);
  let crossIndex = 0;
  for (const sx of CITY.streets) {
    for (const sz of CITY.streets) {
      for (let k = 0; k < 5; k += 1) {
        const off = -4.8 + k * 2.4;
        dummy.position.set(sx + off, 0.05, sz - 8.6);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        crosses.setMatrixAt(crossIndex, dummy.matrix);
        crossIndex += 1;
        dummy.position.set(sx + 8.6, 0.05, sz + off);
        dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        dummy.updateMatrix();
        crosses.setMatrixAt(crossIndex, dummy.matrix);
        crossIndex += 1;
      }
    }
  }
  crosses.count = crossIndex;
  group.add(crosses);

  // White edge lines down both sides of every street, so the asphalt has
  // a finished frame instead of bleeding into the sidewalk, and a warm
  // sun streak down the two east-west arterials toward the low sun — the
  // wet-look reflection that keeps the road from reading as a black void.
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  const edgeGeo = new THREE.PlaneGeometry(350, 0.35);
  const edges = new THREE.InstancedMesh(edgeGeo, edgeMat, CITY.streets.length * 2 * 2);
  let edgeIndex = 0;
  for (const s of CITY.streets) {
    for (const side of [-1, 1]) {
      const off = side * (CITY.roadWidth / 2 - 0.5);
      dummy.position.set(0, 0.045, s + off);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      edges.setMatrixAt(edgeIndex, dummy.matrix);
      edgeIndex += 1;
      dummy.position.set(s + off, 0.045, 0);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.updateMatrix();
      edges.setMatrixAt(edgeIndex, dummy.matrix);
      edgeIndex += 1;
    }
  }
  edges.count = edgeIndex;
  group.add(edges);
  const streakMat = new THREE.MeshBasicMaterial({
    color: 0xffb060, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (const sz of [24, -24]) {
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(230, 4.5), streakMat);
    streak.rotation.x = -Math.PI / 2;
    streak.position.set(45, 0.05, sz);
    group.add(streak);
  }

  // Parked cars along the kerbs, so the streets look busy even between the
  // moving traffic: slim low bodies with a sloped nose, a glass cabin, a
  // chrome bumper strip and — on the sporty ones — a rear spoiler, in
  // saturated paint, parked just off the driving lane. They are scenery
  // only — not in the traffic list, not stealable, and the game never
  // collides with them — so they change nothing about play. None is parked
  // in the on-foot fight's staging patch (x 20..80 on the z=29 street), so
  // no parked car ever fills the fight frame's foreground.
  const parkedCols = [0xff2a6a, 0xe83a3a, 0xffd94a, 0x2ad8c8, 0x2a6fd8, 0xff8a3d, 0xf5f5f5, 0xc93ad8];
  function addParkedCar(x, z, heading, color) {
    const car = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 1.9), paint);
    body.position.y = 0.5;
    car.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 1.7), paint);
    nose.position.set(2.3, 0.42, 0);
    nose.rotation.z = -0.22;
    car.add(nose);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.5, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x18202e, roughness: 0.12, metalness: 0.75 }),
    );
    cabin.position.set(-0.3, 0.98, 0);
    car.add(cabin);
    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.16, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.25, metalness: 0.9 }),
    );
    bumper.position.set(2.72, 0.38, 0);
    car.add(bumper);
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(4.0, 0.34, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.9 }),
    );
    under.position.y = 0.26;
    car.add(under);
    if (hash2(x, z) > 0.55) {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.7), paint);
      spoiler.position.set(-2.25, 1.0, 0);
      car.add(spoiler);
      for (const dz of [-0.6, 0.6]) {
        const strut = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.3, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.8 }),
        );
        strut.position.set(-2.25, 0.82, dz);
        car.add(strut);
      }
    }
    car.position.set(x, 0, z);
    car.rotation.y = -heading;
    group.add(car);
  }
  for (const s of CITY.streets) {
    for (const [along, side] of [[-110, 1], [100, -1]]) {
      if ((s === 24 || s === -24) && along > 20 && along < 80) continue;
      addParkedCar(along, s + side * 5.8, side > 0 ? 0 : Math.PI, parkedCols[(Math.abs(s) + Math.abs(along)) % parkedCols.length]);
      addParkedCar(s + side * 5.8, along, side > 0 ? -Math.PI / 2 : Math.PI / 2, parkedCols[(Math.abs(s) * 2 + Math.abs(along)) % parkedCols.length]);
    }
  }

  // Buildings: one to three per block, heights that vary by district — taller
  // toward the middle, low near the beach. The east column past the beach
  // stays empty: that is sand and water, not towers. Builder #9: the
  // beachfront column (cx 116) is a low, colourful shop row — one or two
  // storeys, flat roofs in varied colours, a striped awning and shopfront
  // glass on every shop, neon on most — so the driving frames open onto
  // the beach instead of ending at a flat tower wall. Tall towers get a
  // stepped crown (a smaller box on the roof), balconies on the upper
  // floors, and a vertical neon strip on some faces, so no facade is one
  // flat coloured slab with square windows.
  const tintMats = palette.buildingTints.map(
    (t) => new THREE.MeshStandardMaterial({ color: t, roughness: 0.85, metalness: 0.05 }),
  );
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a2a30, roughness: 1 });
  const shopRoofMats = (palette.shopTints || palette.buildingTints).map(
    (t) => new THREE.MeshStandardMaterial({ color: t, roughness: 0.8, metalness: 0.05 }),
  );
  const neonMats = palette.neon.map(
    (n) => new THREE.MeshBasicMaterial({ color: n }),
  );
  const accentMats = palette.neon.map(
    (n) => new THREE.MeshStandardMaterial({ color: n, roughness: 0.7 }),
  );
  // Builder #11: the built-up area is a ROUNDED blob, not a square grid —
  // blocks whose centre falls outside radius 152 are never built, so the
  // skyline ends in a curve at the ring boulevard instead of a square edge.
  // Edge blocks build smaller, so no tower corner ever pokes onto the ring.
  const windowPositions = [];
  let neonCount = 0;
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      if (Math.hypot(cx, cz) > 152) continue;
      const distCentre = Math.hypot(cx, cz) / 220;
      const isShopRow = cx >= 116;
      // Casino Row: the (96,-96) block is the neon district — tall, bright,
      // and signed, so the map has a landmark district of its own.
      const isCasino = cx === 96 && cz === -96;
      const count = isShopRow ? 2 : (chance(rng, 0.55) ? 2 : 1);
      const slots = count === 2
        ? [[-11, -11], [11, 11]]
        : [[0, 0]];
      for (const [ox, oz] of slots) {
        const edgeBlock = Math.hypot(cx, cz) > 138;
        // Builder #11 fix: the pitch-48 rebuild puts the slots 13 from the
        // street centre, so a 20-deep tower's corner blocked BOTH lanes of
        // the street (the cover chase wedged at x=-21.9 against the
        // (-11,-11) tower, speedo 0). Footprints are capped at 14 so the
        // lane clears every tower corner by a unit.
        const w = Math.min(isShopRow ? range(rng, 12, 16) : range(rng, 14, edgeBlock ? 16 : 20), 14);
        const d = Math.min(isShopRow ? range(rng, 12, 16) : range(rng, 14, edgeBlock ? 16 : 20), 14);
        const h = isCasino
          ? range(rng, 30, 40)
          : isShopRow
            ? range(rng, 5, 11)
            : range(rng, 7, 26) * (1.35 - distCentre * 0.7);
        const bx = cx + ox;
        const bz = cz + oz;
        const mat = isCasino
          ? tintMats[Math.floor(hash2(bx + 91, bz + 7) * tintMats.length) % tintMats.length]
          : isShopRow
            ? shopRoofMats[Math.floor(hash2(bx, bz) * shopRoofMats.length) % shopRoofMats.length]
            : pick(rng, tintMats);
        // Builder #11: "ga terlalu kotak2" — some tall towers are ROUNDED,
        // faceted drums instead of boxes, so the skyline has curves in it.
        // A drum keeps the same collision box as the box it replaces.
        const isDrum = !isShopRow && !isCasino && h > 15 && hash2(bx + 77, bz + 31) > 0.6;
        const facade = facadeMats.length && !isDrum
          ? facadeMats[Math.floor(hash2(bx + 51, bz + 23) * facadeMats.length) % facadeMats.length]
          : null;
        const tower = isDrum
          ? new THREE.Mesh(new THREE.CylinderGeometry(w * 0.48, w * 0.54, h, 12), mat)
          : new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            facade ? [facade, facade, mat, mat, facade, facade] : mat,
          );
        tower.position.set(bx, h / 2, bz);
        group.add(tower);
        const roof = isDrum
          ? new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.54 + 0.3, w * 0.54 + 0.3, 0.5, 12),
            isShopRow
              ? shopRoofMats[Math.floor(hash2(bx + 9, bz + 4) * shopRoofMats.length) % shopRoofMats.length]
              : roofMat,
          )
          : new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
            isShopRow
              ? shopRoofMats[Math.floor(hash2(bx + 9, bz + 4) * shopRoofMats.length) % shopRoofMats.length]
              : roofMat,
          );
        roof.position.set(bx, h + 0.25, bz);
        group.add(roof);
        buildings.push({ x: bx, z: bz, hw: w / 2, hd: d / 2, h });
        // A coloured parapet cap on the roof edge, so towers are not bare
        // boxes: the accent colour is keyed off the tower's position.
        const accent = accentMats[Math.floor(hash2(bx, bz) * accentMats.length) % accentMats.length];
        const cap = isDrum
          ? new THREE.Mesh(new THREE.CylinderGeometry(w * 0.54 + 0.35, w * 0.54 + 0.35, 0.7, 12), accent)
          : new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.7, d + 0.7), accent);
        cap.position.set(bx, h + 0.7, bz);
        group.add(cap);
        // A stepped crown on tall towers: a smaller box set back on the
        // roof, in a contrasting tint, so the skyline steps instead of
        // ending in a flat slab. Builder #10: half the tall towers get a
        // rounded pavilion instead — a faceted drum that echoes the
        // art-deco curved corners of the photographed facades — so the
        // roofline varies in shape, not just in height.
        if (!isShopRow && h > 17) {
          if (isDrum || hash2(bx + 61, bz + 17) > 0.5) {
            const drum = new THREE.Mesh(
              new THREE.CylinderGeometry(w * 0.28, w * 0.33, 2.6, 10),
              tintMats[Math.floor(hash2(bx + 21, bz + 3) * tintMats.length) % tintMats.length],
            );
            drum.position.set(bx, h + 1.3, bz);
            group.add(drum);
            const drumCap = new THREE.Mesh(
              new THREE.CylinderGeometry(w * 0.28 + 0.2, w * 0.28 + 0.2, 0.5, 10),
              accent,
            );
            drumCap.position.set(bx, h + 2.85, bz);
            group.add(drumCap);
          } else {
            const crown = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.55, 2 + hash2(bx + 41, bz + 3) * 2, d * 0.55),
              tintMats[Math.floor(hash2(bx + 21, bz + 3) * tintMats.length) % tintMats.length],
            );
            crown.position.set(bx, h + 1.4, bz);
            group.add(crown);
            const crownCap = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.55 + 0.4, 0.5, d * 0.55 + 0.4),
              accent,
            );
            crownCap.position.set(bx, h + 3.1, bz);
            group.add(crownCap);
          }
        }
        // Balconies on the street-facing side of tall towers: thin slabs
        // with a rail edge, so the upper floors have depth.
        if (!isShopRow && h > 14) {
          const balcMat = new THREE.MeshStandardMaterial({ color: 0xf0e2c2, roughness: 0.9 });
          for (let fl = 0; fl < 2; fl += 1) {
            const by = 6 + fl * 6 + hash2(bx, bz + fl) * 2;
            if (by > h - 3) continue;
            const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.35, 1.4), balcMat);
            slab.position.set(bx, by, bz + d / 2 + 0.7);
            group.add(slab);
          }
        }
        // A rooftop AC box on most towers, tucked in one corner.
        if (hash2(bx + 3, bz + 7) > 0.3) {
          const ac = new THREE.Mesh(
            new THREE.BoxGeometry(3, 1.4, 2.4),
            new THREE.MeshStandardMaterial({ color: 0x8a8a96, roughness: 0.8, metalness: 0.3 }),
          );
          ac.position.set(bx - w / 4, h + 1.7, bz - d / 4);
          group.add(ac);
        }
        // A coloured shopfront awning on the street-facing side of low
        // buildings, so the ground floor has something to look at. Shops
        // always get one, striped in two colours; towers get one often.
        if (isShopRow || (h < 16 && hash2(bx + 11, bz + 5) > 0.45)) {
          const awnMat = accentMats[Math.floor(hash2(bx + 5, bz + 11) * accentMats.length) % accentMats.length];
          const awnMat2 = accentMats[Math.floor(hash2(bx + 17, bz + 2) * accentMats.length) % accentMats.length];
          for (let sIdx = 0; sIdx < 4; sIdx += 1) {
            const stripe = new THREE.Mesh(
              new THREE.BoxGeometry((w * 0.7) / 4, 0.4, 1.6),
              sIdx % 2 === 0 ? awnMat : awnMat2,
            );
            stripe.position.set(bx - (w * 0.7) / 2 + ((w * 0.7) / 8) * (2 * sIdx + 1), 3.4, bz + d / 2 + 0.8);
            group.add(stripe);
          }
          // Shopfront glass: one wide bright pane under the awning.
          if (isShopRow) {
            const glass = new THREE.Mesh(
              new THREE.PlaneGeometry(w * 0.62, 2.2),
              new THREE.MeshBasicMaterial({ color: 0x8fc8e0, transparent: true, opacity: 0.65 }),
            );
            glass.position.set(bx, 1.9, bz + d / 2 + 0.06);
            group.add(glass);
          }
        }
        // Lit windows on all four faces, so the towers read busy from any
        // street the camera drives down, not just from the south and west.
        // The rotation each face needs is stored with the window. Windows
        // are smaller now (1.5 x 1.2) and shops skip the upper-floor grid
        // for their glass front, so facades read as varied lights, not a
        // grid of big squares.
        // Builder #11: drum towers wear no window grid — their curved wall
        // is not where the box-face window positions land, so the grid
        // would float in the air beside them. Drums read through their
        // tint, neon strip and drum crown instead.
        const floors = isDrum ? 0 : (isShopRow ? 1 : Math.max(1, Math.floor(h / 3.2)));
        const cols = Math.max(1, Math.floor(w / 4));
        const colsZ = Math.max(1, Math.floor(d / 4));
        const faces = [
          { axis: 'x', at: bz + d / 2 + 0.06, rot: 0 },
          { axis: 'z', at: bx - w / 2 - 0.06, rot: -Math.PI / 2 },
          { axis: 'x', at: bz - d / 2 - 0.06, rot: Math.PI },
          { axis: 'z', at: bx + w / 2 + 0.06, rot: Math.PI / 2 },
        ];
        for (const face of faces) {
          const run = face.axis === 'x' ? cols : colsZ;
          for (let f = 0; f < floors; f += 1) {
            for (let c = 0; c < run; c += 1) {
              if (rng() > palette.windowLit) continue;
              const wy = 2.2 + f * 3.2;
              if (face.axis === 'x') {
                const wx = bx - w / 2 + 2.2 + c * 4;
                windowPositions.push([wx, wy, face.at, face.rot]);
              } else {
                const wz = bz - d / 2 + 2.2 + c * 4;
                windowPositions.push([face.at, wy, wz, face.rot]);
              }
            }
          }
        }
        // A neon sign on some towers, facing the street — and a thin
        // vertical neon strip down one corner of taller towers, so the
        // facades carry light, not just paint.
        if (neonCount < 12 && chance(rng, isShopRow ? 0.55 : 0.35)) {
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, range(rng, 2, 5), range(rng, 4, 9)),
            neonMats[neonCount % neonMats.length],
          );
          sign.position.set(bx + w / 2 + 0.35, h * 0.7, bz);
          group.add(sign);
          neonCount += 1;
        }
        // Casino Row: a big lit sign on the district's tallest tower, so
        // the neon district reads from the street — and a second vertical
        // strip, so the casino towers carry more light than any other block.
        if (isCasino) {
          const signCanvas = document.createElement('canvas');
          signCanvas.width = 256;
          signCanvas.height = 96;
          const sctx = signCanvas.getContext('2d');
          sctx.fillStyle = '#1a0533';
          sctx.fillRect(0, 0, 256, 96);
          sctx.strokeStyle = '#ffd94a';
          sctx.lineWidth = 5;
          sctx.strokeRect(4, 4, 248, 88);
          sctx.textAlign = 'center';
          sctx.shadowColor = '#ff2a6a';
          sctx.shadowBlur = 14;
          sctx.fillStyle = '#ffffff';
          sctx.font = '900 44px Arial, sans-serif';
          sctx.fillText('CASINO', 128, 50);
          sctx.shadowBlur = 0;
          sctx.fillStyle = '#ffd94a';
          sctx.font = '700 20px Arial, sans-serif';
          sctx.fillText('VICE ROYALE', 128, 80);
          const signTex = new THREE.CanvasTexture(signCanvas);
          signTex.colorSpace = THREE.SRGBColorSpace;
          const casinoSign = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 6),
            new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }),
          );
          casinoSign.position.set(bx, h * 0.82, bz + d / 2 + 0.15);
          group.add(casinoSign);
          const strip2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, h * 0.85, 0.35),
            neonMats[Math.floor(hash2(bx + 13, bz + 29) * neonMats.length) % neonMats.length],
          );
          strip2.position.set(bx - w / 2 - 0.1, h * 0.5, bz - d / 2 - 0.1);
          group.add(strip2);
        }
        if (!isShopRow && h > 15 && hash2(bx + 31, bz + 13) > 0.55) {
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, h * 0.7, 0.3),
            neonMats[Math.floor(hash2(bx + 7, bz + 19) * neonMats.length) % neonMats.length],
          );
          strip.position.set(bx + w / 2 + 0.1, h * 0.45, bz + d / 2 + 0.1);
          group.add(strip);
        }
      }
    }
  }

  // All lit windows in one instanced draw — but each window gets its own
  // colour from the palette's window colours (warm amber, cool blue, rose,
  // pale gold), keyed off its position, so the facades sparkle in varied
  // light instead of one flat yellow grid.
  const winGeo = new THREE.PlaneGeometry(1.2, 1.0);
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const windows = new THREE.InstancedMesh(winGeo, winMat, Math.max(1, windowPositions.length));
  const winColors = palette.windowColors || [0xffd98a];
  const tmpColor = new THREE.Color();
  windowPositions.forEach(([x, y, z, rotY], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    windows.setMatrixAt(i, dummy.matrix);
    tmpColor.setHex(winColors[Math.floor(hash2(x, y + z) * winColors.length) % winColors.length]);
    windows.setColorAt(i, tmpColor);
  });
  windows.count = windowPositions.length;
  if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
  group.add(windows);

  // Builder #11: the sand and the ocean are the rings built at the top of
  // this function now (beachRing + oceanRing + foamRing, all the way round
  // the island). What stays here is the dressing: the sun glitter on the
  // water east toward the low sun, foam lines off the east shore, and the
  // scalloped sand + foam puffs that curve the east shoreline.
  // Sun glitter: a warm gold path on the water running east toward the low
  // sun, so the ocean points at the sunset instead of lying flat.
  const glitter = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 26),
    new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.4 }),
  );
  glitter.rotation.x = -Math.PI / 2;
  glitter.position.set(260, 0.07, -29);
  group.add(glitter);
  // Foam lines where the waves break, parallel to the shore.
  for (const [fx, fo] of [[202, 0.5], [214, 0.35]]) {
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 440),
      new THREE.MeshBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: fo }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(fx, 0.06, 0);
    group.add(foam);
  }
  // The curved coast: the straight sand/water edge is dressed with a sine
  // of scalloped sand discs and foam puffs, so the shoreline reads as a
  // curve from the driving view instead of a ruler-straight strip. All
  // positions are pure functions of z, so the curve is identical every run.
  const scallopMat = new THREE.MeshStandardMaterial({ color: palette.sandTint ?? 0xf2d491, roughness: 1 });
  const foamPuffMat = new THREE.MeshBasicMaterial({ color: palette.surfTint ?? 0xeaf7ff, transparent: true, opacity: 0.5 });
  const scallopGeo = new THREE.CircleGeometry(1, 12);
  for (let i = 0; i < 22; i += 1) {
    const sz = -210 + i * 20;
    const curve = Math.sin(sz * 0.025) * 6;
    const scallop = new THREE.Mesh(scallopGeo, scallopMat);
    scallop.rotation.x = -Math.PI / 2;
    scallop.scale.set(5 + hash2(i * 3, 11) * 3, 3.5 + hash2(i * 7, 5) * 2.5, 1);
    scallop.position.set(CITY.waterX - 4 + curve, 0.045, sz);
    group.add(scallop);
    const puff = new THREE.Mesh(scallopGeo, foamPuffMat);
    puff.rotation.x = -Math.PI / 2;
    puff.scale.set(3 + hash2(i * 5, 3) * 2, 2 + hash2(i * 9, 8) * 1.6, 1);
    puff.position.set(CITY.waterX + 1 + curve, 0.065, sz + 9);
    group.add(puff);
  }
  // Beachgoers: a few static figures on the sand ring (visual only, never
  // in traffic, never colliding), so the beach reads lived-in from the road.
  // They ring the island by angle, clear of the ferris wheel's patch.
  const beachShirts = [0xff5a7a, 0x37e0ff, 0xffd94a, 0x7dff9a, 0xff8a3d];
  const wheelAngle = Math.atan2(-9, 178);
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + 0.35;
    let da = Math.abs(a - wheelAngle);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (da < 0.35) continue;
    const bx2 = Math.cos(a) * 186;
    const bz2 = Math.sin(a) * 186;
    const figure = new THREE.Group();
    const fBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: beachShirts[i % beachShirts.length], roughness: 0.85 }),
    );
    fBody.position.y = 0.95;
    figure.add(fBody);
    const fHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.7 }),
    );
    fHead.position.y = 1.6;
    figure.add(fHead);
    figure.position.set(bx2, 0, bz2);
    figure.rotation.y = hash2(i * 6, 13) * Math.PI * 2;
    group.add(figure);
  }

  // Palms — builder #9 rebuild: NO cones. Each palm is a leaning trunk
  // with a crown of nine long drooping fronds, two greens, varied height
  // (5.5–9) and lean, on both kerbs of the beachfront avenue and the
  // east-west streets, so the chase camera always has palms at the frame's
  // edges. All fronds, trunks and coconuts are three instanced draws, so
  // sixty palms cost no more than three meshes. A palm is only planted
  // where the finished buildings leave room (checked against the built
  // boxes), so no trunk ever grows through a tower, and never on a
  // crosswalk corner or in the on-foot fight's staging patch, so no trunk
  // ever stands in the camera's face. The checks are seeded by position,
  // never by the stream, so the layout never moves.
  const palmSpots = [];
  function spotPalm(px, pz, lean) {
    palmSpots.push([px, pz, lean, 5.5 + hash2(px + 3, pz + 8) * 3.5]);
  }
  // Builder #11: palms ring the island on both kerbs of the ring boulevard
  // (inner kerb on land, outer kerb on the sand), so the coastal road is
  // palm-framed all the way round. A palm is skipped when it would stand
  // on a street, inside a building, on the wheel's patch or in the docks.
  const docksAngle = Math.atan2(134, -108);
  for (let i = 0; i < 34; i += 1) {
    const a = (i / 34) * Math.PI * 2;
    for (const rr of [160, 180]) {
      const px = Math.cos(a) * rr;
      const pz = Math.sin(a) * rr;
      let da = Math.abs(a - wheelAngle);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.22) continue;
      let dd = Math.abs(a - docksAngle);
      if (dd > Math.PI) dd = Math.PI * 2 - dd;
      if (dd < 0.3) continue;
      if (isOnRoad(px, pz)) continue;
      if (hitsBuilding(buildings, px, pz, 2.6)) continue;
      spotPalm(px, pz, hash2(px, pz) > 0.5 ? 0.12 : -0.12);
    }
  }
  const streetPalms = [];
  for (let z = -160; z <= 160; z += 32) {
    if (CITY.streets.some((s) => Math.abs(z - s) < 7)) continue;
    streetPalms.push([111.4, z], [128.6, z]);
  }
  for (const street of [24, -24]) {
    for (let x = -123; x <= 150; x += 34) {
      if (CITY.streets.some((s) => Math.abs(x - s) < 7)) continue;
      streetPalms.push([x, street - 8.6], [x, street + 8.6]);
    }
  }
  for (const [px, pz] of streetPalms) {
    if (hitsBuilding(buildings, px, pz, 2.6)) continue;
    spotPalm(px, pz, hash2(px, pz) > 0.5 ? 0.1 : -0.1);
  }
  // One instanced draw for all trunks, one for all fronds, one for the
  // coconut clusters. A frond is a long tapered cone whose base sits at
  // the crown and whose tip droops 10–35° below horizontal, fanned around
  // the trunk; the two greens alternate by position hash.
  const FRONDS_PER_PALM = 9;
  const palmCount = palmSpots.length;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, palmCount));
  const frondGeo = new THREE.ConeGeometry(0.42, 1, 5);
  frondGeo.scale(1, 1, 0.45);
  frondGeo.translate(0, 0.5, 0);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, Math.max(1, palmCount * FRONDS_PER_PALM));
  const nutGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const nutMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
  const nuts = new THREE.InstancedMesh(nutGeo, nutMat, Math.max(1, palmCount * 3));
  const frondCols = (palette.frondColors || [0x2fae5a, 0x46c468]).map((c) => new THREE.Color(c));
  const frondQuat = new THREE.Quaternion();
  const frondEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  let frondIndex = 0;
  let nutIndex = 0;
  palmSpots.forEach(([px, pz, lean, trunkH], pi) => {
    dummy.position.set(px, trunkH / 2, pz);
    dummy.rotation.set(0, 0, lean);
    dummy.scale.set(1, trunkH, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(pi, dummy.matrix);
    const crownY = trunkH + 0.1;
    const phase = hash2(px, pz) * Math.PI * 2;
    for (let f = 0; f < FRONDS_PER_PALM; f += 1) {
      const az = phase + (f / FRONDS_PER_PALM) * Math.PI * 2;
      const tilt = (100 + hash2(px + f * 3, pz + f) * 25) * (Math.PI / 180);
      const len = 3.4 + hash2(px + f, pz + f * 5) * 1.8;
      frondEuler.set(tilt, az, 0);
      frondQuat.setFromEuler(frondEuler);
      dummy.position.set(px + Math.sin(az) * 0.35, crownY, pz + Math.cos(az) * 0.35);
      dummy.quaternion.copy(frondQuat);
      dummy.scale.set(1, len, 1);
      dummy.updateMatrix();
      fronds.setMatrixAt(frondIndex, dummy.matrix);
      fronds.setColorAt(frondIndex, frondCols[Math.floor(hash2(px + f * 7, pz) * frondCols.length) % frondCols.length]);
      frondIndex += 1;
    }
    for (let n = 0; n < 3; n += 1) {
      const na = phase + n * 2.1;
      dummy.position.set(px + Math.sin(na) * 0.5, crownY - 0.35, pz + Math.cos(na) * 0.5);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      nuts.setMatrixAt(nutIndex, dummy.matrix);
      nutIndex += 1;
    }
  });
  trunks.count = palmCount;
  fronds.count = frondIndex;
  nuts.count = nutIndex;
  if (fronds.instanceColor) fronds.instanceColor.needsUpdate = true;
  group.add(trunks);
  group.add(fronds);
  group.add(nuts);

  // Beach umbrellas: bright cones on poles, ringing the sand in two rows
  // that follow the curved shoreline — none planted under the ferris wheel,
  // which owns its own patch.
  const umbrellaCols = [0xff5a7a, 0x37e0ff, 0xffd94a, 0x7dff9a, 0xff8a3d];
  function addUmbrella(ux, uz, color) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 }),
    );
    pole.position.set(ux, 1.3, uz);
    group.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1.1, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    );
    top.position.set(ux, 3.0, uz);
    group.add(top);
  }
  for (let i = 0; i < 22; i += 1) {
    const a = (i / 22) * Math.PI * 2 + 0.14;
    let da = Math.abs(a - wheelAngle);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (da < 0.3) continue;
    addUmbrella(Math.cos(a) * 186, Math.sin(a) * 186, umbrellaCols[i % umbrellaCols.length]);
    if (i % 2 === 0) {
      addUmbrella(Math.cos(a + 0.14) * 192, Math.sin(a + 0.14) * 192, umbrellaCols[(i + 2) % umbrellaCols.length]);
    }
  }
  // Beach towels: small bright rectangles on the sand between the umbrellas.
  const towelCols = [0xff5a7a, 0x37e0ff, 0xffd94a, 0x7dff9a];
  for (let i = 0; i < 6; i += 1) {
    const a = -0.7 + i * 0.28;
    const towel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.4),
      new THREE.MeshBasicMaterial({ color: towelCols[i % towelCols.length] }),
    );
    towel.rotation.x = -Math.PI / 2;
    towel.rotation.z = hash2(i * 13, 7) * 1.2;
    towel.position.set(Math.cos(a) * 183, 0.05, Math.sin(a) * 183);
    group.add(towel);
  }

  // The big neon billboards on the beachfront, facing the city: the
  // photographed neon art as the background, with the game's own sharp
  // lettering painted over a dark panel in the middle — the generated
  // text in the renders is garbled ("SUNIG'S", "FOORN..."), so it stays
  // hidden behind the panel while the neon palms and sunsets show around
  // it. Without the art the boards fall back to the painted gradient they
  // always had. Two boards now: VICE SHORES north of the promenade and
  // FLAMINGO FM south of it, so the cover frame carries a billboard on
  // each side of the chase instead of one cut off at the frame's edge.
  function paintBoard(art, spec) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 224;
    const ctx = c.getContext('2d');
    if (art) {
      // Cover-fit the 768x512 render into the 512x224 board.
      ctx.drawImage(art, 0, 88, 768, 336, 0, 0, 512, 224);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, 224);
      grad.addColorStop(0, '#1a0533');
      grad.addColorStop(0.5, '#ff2a6a');
      grad.addColorStop(1, '#ffb347');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 224);
    }
    const [px, py, pw, ph] = spec.panel;
    ctx.fillStyle = 'rgba(12,4,32,0.88)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#ffd94a';
    ctx.lineWidth = 6;
    ctx.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff2a6a';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${spec.titleSize}px Arial, sans-serif`;
    ctx.fillText(spec.title, 256, spec.titleY);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe9a0';
    ctx.font = '700 30px Arial, sans-serif';
    ctx.fillText(spec.sub, 256, spec.subY);
    if (spec.tag) {
      ctx.fillStyle = '#ffd94a';
      ctx.font = '700 20px Arial, sans-serif';
      if (spec.tagAlign === 'left') {
        ctx.textAlign = 'left';
        ctx.fillText(spec.tag, 30, spec.tagY);
      } else {
        ctx.fillText(spec.tag, 256, spec.tagY);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const boardPoleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.7, metalness: 0.5 });
  function addBillboard(z, art, spec, glowColor) {
    for (const dz of [-10, 10]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 12.5, 8), boardPoleMat);
      pole.position.set(184, 6.25, z + dz);
      group.add(pole);
    }
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 12, 28),
      new THREE.MeshBasicMaterial({ map: paintBoard(art, spec), toneMapped: false }),
    );
    board.position.set(184, 17, z);
    group.add(board);
    // The billboard glows: a compact additive halo sprite floating just
    // in front of the board, and one real point light spilling neon onto
    // the promenade palms and sand, so the board reads as a light source,
    // not a painted panel. The halo stays tight to the board: the old
    // 80-wide sprite washed out the ferris wheel standing behind it in
    // the cover frame. (Physical light units: intensity 80 at decay 1.6
    // throws a visible wash out to ~30 units.)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: glowColor, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.position.set(182.5, 17, z);
    glow.scale.set(52, 40, 1);
    group.add(glow);
    const light = new THREE.PointLight(glowColor, 80, 80, 1.6);
    light.position.set(180, 16, z);
    group.add(light);
  }
  addBillboard(-58, textures && textures.billboardVice ? textures.billboardVice.image : null, {
    panel: [26, 26, 460, 158], title: 'VICE SHORES', titleSize: 62, titleY: 100,
    sub: 'RIDE THE SUNSET', subY: 148, tag: 'PALMS · NEON · NO SPEED LIMIT', tagY: 210,
  }, 0xff5a7a);
  addBillboard(40, textures && textures.billboardFlamingo ? textures.billboardFlamingo.image : null, {
    panel: [16, 4, 480, 112], title: 'FLAMINGO FM', titleSize: 56, titleY: 76,
    sub: 'NEON NIGHTS · OCEAN DRIVE', subY: 106, tag: 'PINK HORIZON · LIVE', tagY: 210, tagAlign: 'left',
  }, 0xff5ad8);

  // The ferris wheel on the beach: a glowing rim, four spokes and eight
  // coloured gondolas, a landmark on the horizon. Builder #11: it stands
  // at the end of the beachfront street, dead ahead in the cover and
  // driving frames and clear of the downtown skyline from the title
  // camera — the north beach hid it behind the towers.
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(18, 0.6, 8, 44),
    new THREE.MeshBasicMaterial({ color: 0xffd94a }),
  );
  wheel.add(rim);
  const spokeMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  for (let i = 0; i < 4; i += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(36, 0.45, 0.45), spokeMat);
    spoke.rotation.z = (i * Math.PI) / 4;
    wheel.add(spoke);
  }
  const gondolaCols = [0xff5a7a, 0x37e0ff, 0xffd94a, 0x7dff9a];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const gondola = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2, 2),
      new THREE.MeshStandardMaterial({ color: gondolaCols[i % gondolaCols.length], roughness: 0.6 }),
    );
    gondola.position.set(Math.cos(a) * 18, Math.sin(a) * 18, 0);
    wheel.add(gondola);
  }
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5a7a }),
  );
  wheel.add(hub);
  wheel.position.set(178, 22, -9);
  group.add(wheel);
  // A soft gold halo over the wheel's hub, so the landmark shimmers at
  // dusk instead of sitting flat against the sky.
  const wheelGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xffd94a, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  wheelGlow.position.set(178, 22, -9);
  wheelGlow.scale.set(70, 70, 1);
  group.add(wheelGlow);
  for (const dz of [-9, 9]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 23, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.7, metalness: 0.5 }),
    );
    leg.position.set(178, 11.5, -9 + dz);
    leg.rotation.x = dz > 0 ? -0.35 : 0.35;
    group.add(leg);
  }

  // Street lamps at the corners: pole, arm and a glowing bulb. At sunset
  // the bulbs burn warm (no real point lights — the city keeps its frame
  // budget) and every bulb carries one additive halo sphere, so the lamps
  // read as lit instead of grey dots. One instanced draw for all halos.
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.7, metalness: 0.6 });
  const lampBulbMat = new THREE.MeshBasicMaterial({
    color: theme === 'sunset' ? 0xffd9a0 : (palette.lampOn ? 0xffe9a0 : 0x8a7a68),
    toneMapped: false,
  });
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
  if (theme === 'sunset') {
    const haloGeo = new THREE.SphereGeometry(1.1, 8, 6);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffc98a, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const halos = new THREE.InstancedMesh(haloGeo, haloMat, lampPositions.length);
    lampPositions.forEach(([lx, lz], i) => {
      dummy.position.set(lx, 6.6, lz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      halos.setMatrixAt(i, dummy.matrix);
    });
    halos.count = lampPositions.length;
    group.add(halos);
  }

  // The Docks, south-west: stacked containers and crates by the water.
  const containerCols = [0x2a9a6a, 0xd84a2a, 0x2a6ad8, 0xe8b93a, 0xd83a7a];
  for (let i = 0; i < 10; i += 1) {
    const cx = -108 + (i % 5) * 9;
    const cz = 130 + Math.floor(i / 5) * 8;
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
    new THREE.MeshStandardMaterial({ color: 0x4a8a6a, roughness: 0.85 }),
  );
  hideout.position.set(24, 4, -148);
  group.add(hideout);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.5, 5),
    new THREE.MeshStandardMaterial({ color: 0x2aff66, roughness: 0.7 }),
  );
  awning.position.set(24, 4.6, -139.5);
  group.add(awning);
  buildings.push({ x: 24, z: -148, hw: 9, hd: 7, h: 8 });

  // The VSPD helicopter: a black-and-white chopper with a spinning main
  // rotor, a tail rotor and a searchlight cone, circling over the player
  // (the world moves it every step from the clock, so it is always above
  // the chase). It is built here, animated by world.js.
  const helicopter = new THREE.Group();
  const heliBodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4, metalness: 0.6 });
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.6, 2.0), heliBodyMat);
  heliBody.position.y = 0;
  helicopter.add(heliBody);
  const heliNose = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.1, 1.7),
    new THREE.MeshStandardMaterial({ color: 0x18202e, roughness: 0.15, metalness: 0.7 }),
  );
  heliNose.position.set(2.6, -0.1, 0);
  helicopter.add(heliNose);
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 0.5), heliBodyMat);
  heliTail.position.set(-4.0, 0.3, 0);
  helicopter.add(heliTail);
  const heliFin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.3), heliBodyMat);
  heliFin.position.set(-6.1, 0.8, 0);
  helicopter.add(heliFin);
  const heliSkidMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.7, metalness: 0.5 });
  for (const dz of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.12), heliSkidMat);
    skid.position.set(0, -1.1, dz);
    helicopter.add(skid);
  }
  const heliRotor = new THREE.Group();
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x22222c, roughness: 0.6, metalness: 0.4 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 11), rotorMat);
    blade.rotation.y = a;
    heliRotor.add(blade);
  }
  heliRotor.position.y = 1.1;
  helicopter.add(heliRotor);
  const heliTailRotor = new THREE.Group();
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), rotorMat);
    blade.rotation.z = a;
    heliTailRotor.add(blade);
  }
  heliTailRotor.position.set(-6.1, 0.8, 0.35);
  helicopter.add(heliTailRotor);
  const heliLightBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.25, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xff4040, toneMapped: false }),
  );
  heliLightBar.position.set(0.6, 0.95, 0);
  helicopter.add(heliLightBar);
  const heliSpot = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  heliSpot.position.set(1.5, -14, 0);
  helicopter.add(heliSpot);
  helicopter.visible = false;
  group.add(helicopter);

  return { group, buildings, lampBulbMat, oceanMat, helicopter, heliRotor, heliTailRotor };
}
