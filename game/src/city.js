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
  // Builder #14c — STUCCO, NOT A POSTER (fadli: "rumah nya kyk tempelan
  // gambar, ganti yg lebih realistic"). The tall-tower photo renders are
  // portraits; mapped onto a 13-wide, 5-high shop they squash into a
  // wide flat picture of a building — printed arches and balconies with
  // fake perspective that fights the real camera. Shops wear a painted
  // stucco instead: plaster grain + soft mottling, no printed windows,
  // tinted per shop by its own shopTint, so the wall itself has material
  // and the real geometry (windows, balconies, pilasters) does the
  // talking. One shared grayscale texture, tinted by material colour.
  // The grain uses its own fixed-seed stream, so the city rng is
  // untouched and every other building stays identical.
  const stuccoTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#efe9df';
    x.fillRect(0, 0, 256, 256);
    let s = 0x14b;
    const rnd = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Builder #17 — grain bumped ~1.7x (was barely visible past 30
    // units, so distant towers read as flat pastel slabs in the title
    // view; the plaster now reads at mid-distance too).
    for (let i = 0; i < 36; i += 1) {
      const bx2 = rnd() * 256;
      const by2 = rnd() * 256;
      const br = 18 + rnd() * 42;
      const g2 = x.createRadialGradient(bx2, by2, 0, bx2, by2, br);
      g2.addColorStop(0, rnd() < 0.5 ? 'rgba(120,100,80,0.10)' : 'rgba(255,255,255,0.11)');
      g2.addColorStop(1, 'rgba(120,100,80,0)');
      x.fillStyle = g2;
      x.fillRect(bx2 - br, by2 - br, br * 2, br * 2);
    }
    for (let i = 0; i < 5200; i += 1) {
      const px = rnd() * 256;
      const py = rnd() * 256;
      const pr = 0.6 + rnd() * 1.8;
      x.fillStyle = rnd() < 0.55 ? `rgba(70,60,50,${0.09 + rnd() * 0.13})` : `rgba(255,255,255,${0.10 + rnd() * 0.13})`;
      x.fillRect(px, py, pr, pr);
    }
    for (let i = 0; i < 14; i += 1) {
      const sx = rnd() * 256;
      x.fillStyle = `rgba(90,75,60,${0.02 + rnd() * 0.02})`;
      x.fillRect(sx, 0, 2 + rnd() * 4, 256);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  })();

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

  // Builder #17 — THE DIAGONAL AVENUE (fadli: "map sama aja", layout
  // jalan harus BERUBAH beneran). A second main drag cuts the city on
  // the line x+z=-60, from the ring boulevard at (-145,85) to the ring
  // at (85,-145), straight through downtown — the first road in Vice
  // Shores that is neither a grid street nor the ring. It crosses the
  // z=-24 chase street at x=-36 (behind the cover camera) and the z=24
  // street at x=-84, so the chase and the driving shot both roll over
  // a real intersection with it. Its own plane sits 0.015 above the
  // grid streets, so the crossings never z-fight. Buildings on its path
  // are cleared in the tower loop below (one slot per block, Casino Row
  // exempt), the minimap draws it as a diagonal, and palms + lamps line
  // it — the city reads different from the title camera and on the map.
  const DIAG_C = -60; // the avenue is the line x + z = DIAG_C
  const DIAG_CX = -30; // centre of the avenue segment (on the line)
  const DIAG_CZ = -30;
  const DIAG_HALF = 163; // half-length, ring crossing to ring crossing
  const diagDist = (x, z) => Math.abs(x + z - DIAG_C) / Math.SQRT2;
  const diagGroup = new THREE.Group();
  diagGroup.position.set(DIAG_CX, 0, DIAG_CZ);
  diagGroup.rotation.y = Math.PI / 4; // local +X runs (1,-1)/sqrt2
  group.add(diagGroup);
  const diagWalk = new THREE.Mesh(
    new THREE.PlaneGeometry(DIAG_HALF * 2, 26),
    new THREE.MeshStandardMaterial({ color: palette.sidewalkTint, roughness: 0.9 }),
  );
  diagWalk.rotation.x = -Math.PI / 2;
  diagWalk.position.y = 0.015;
  diagGroup.add(diagWalk);
  const diagRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(DIAG_HALF * 2, 14),
    ringMat,
  );
  diagRoad.rotation.x = -Math.PI / 2;
  diagRoad.position.y = 0.035;
  diagGroup.add(diagRoad);
  const diagEdgeMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(DIAG_HALF * 2, 0.35), diagEdgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(0, 0.05, side * 6.5);
    diagGroup.add(edge);
  }
  const diagDashMat = new THREE.MeshBasicMaterial({ color: 0xffc93a });
  for (let lx = -150; lx <= 150; lx += 19) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.7), diagDashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(lx, 0.05, 0);
    diagGroup.add(dash);
  }

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
  // Builder #17 — one stucco material per tint, cached across all
  // towers (see the facade note in the tower loop).
  const stuccoCache = new Map();
  const stuccoFor = (m) => {
    const key = m.color.getHex();
    if (!stuccoCache.has(key)) {
      stuccoCache.set(key, new THREE.MeshStandardMaterial({
        map: stuccoTex, color: m.color, roughness: 0.95, metalness: 0.0,
      }));
    }
    return stuccoCache.get(key);
  };
  // Builder #12 — instanced 3D relief, collected during the tower loop
  // and drawn as a handful of instanced meshes afterwards: balcony slabs
  // + rails (every other floor, all four faces), corner pilasters on box
  // towers. One draw call each, so the facades gain real depth without
  // hundreds of extra meshes.
  const balcSlabs = [];
  const balcRails = [];
  const balcPosts = [];
  const balcFascia = [];
  const pilasters = [];
  // Builder #14c — one balcony = slab + OPEN railing (a thin top bar on
  // four posts), not a solid panel: the old solid 0.9-tall rail read as a
  // brown sign board pasted on the wall and hid the lit window behind
  // it. The open railing lets the window show between slab and top bar.
  const pushBalcony = (x, y, z, rotY, ox, oz) => {
    balcSlabs.push([x, y, z, rotY]);
    balcRails.push([x + ox * 1.2, y + 0.6, z + oz * 1.2, rotY]);
    // Builder #17 — a MID RAIL halfway up the railing, and a FASCIA
    // lip hanging below the slab's front edge: the slab reads as a
    // thick slab with a real edge, not a flat cream plate pasted on.
    balcRails.push([x + ox * 1.2, y + 0.32, z + oz * 1.2, rotY]);
    balcFascia.push([x + ox * 0.62, y - 0.12, z + oz * 0.62, rotY]);
    for (const k of [-1.4, -0.5, 0.5, 1.4]) {
      const alongX = rotY === 0 || rotY === Math.PI;
      balcPosts.push([
        x + ox * 1.2 + (alongX ? k : 0),
        y + 0.6,
        z + oz * 1.2 + (alongX ? 0 : k),
        rotY,
      ]);
    }
  };
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
        const h0 = isCasino
          ? range(rng, 30, 40)
          : isShopRow
            ? range(rng, 5, 11)
            : range(rng, 7, 26) * (1.35 - distCentre * 0.7);
        const bx = cx + ox;
        let bz = cz + oz;
        // Builder #12 — COVER SIGHTLINE (fadli: wheel + billboard wajib
        // kelihatan di cover). The chase camera drives east down the z=-24
        // street toward the wheel at (178,-9) and the boards at x=184.
        // A tall tower in the slot just south of that street (bz -16..-4,
        // bx 40..175) stands between the camera and the wheel — the
        // (133,-11) tower is what hid the wheel at the 8-second drive —
        // so it is capped low and can never block the landmark again.
        // Drums on the street's north side (bz -40..-28) are forced to
        // boxes and capped, so no blank drum wall fills the left of the
        // cover frame the way the big yellow drum did in #11. Collision
        // footprints are untouched: only heights change.
        const inCoverCorridor = bx >= 40 && bx <= 175 && bz >= -16 && bz <= -4;
        const byCoverStreetNorth = bx >= 40 && bx <= 175 && bz >= -40 && bz <= -28;
        // Builder #13 — the FLAMINGO board's sightline: the (155,11)
        // shop's roof (10.3) cut the board's lower half from the 9-second
        // camera, the same cut the #12 board suffered from a tower roof.
        // Shops south of the chase street in the board's sightline
        // (bx 140–175, bz 4–20) are capped at 7, so the board shows whole
        // over a low parapet instead of behind a roof.
        const inBoardSightline = bx >= 140 && bx <= 175 && bz >= 4 && bz <= 20;
        // Builder #12, third look: the corridor tower nearest the 8-second
        // camera — (85,-11), only 20 units ahead — is short (8) but so
        // close it spans 8–48° of the frame and hides the whole FLAMINGO
        // board behind it. Slots right beside the camera (bx 70–115) are
        // capped at 5, so they read as a low corner shop and the board
        // shows over its roof; the rest of the corridor stays at 8.
        // Builder #13: the cap-5 zone runs to bx 140 — at the 7-second
        // drive the (133,-13) shop's roof (at 8) cut the FLAMINGO board's
        // lower half and the wheel's bottom rim; at 5 it is a low parapet
        // the sightlines clear.
        const nearCoverCamera = bx >= 70 && bx <= 140 && bz >= -16 && bz <= -4;
        // Builder #17 — the VICE SHORES board's sightline: the diagonal
        // skip reshuffled the rng stream, and a tower north of the chase
        // street grew tall enough to hide the board's right half in the
        // cover (the #17 first cover). Every tower in the board's
        // sightline (bx 80..180, bz -64..-28) is capped at 8, so the
        // board — centre y 17, bottom edge y 11 — shows whole over a
        // low roof from the low chase camera.
        const inViceSightline = bx >= 80 && bx <= 180 && bz >= -64 && bz <= -28;
        // Builder #19 — the FLAMINGO board's sightline (probe): the
        // (59,-37) tower, 18 tall at 52 units, stood dead on the line
        // from the cover camera to the board at (120,-52) and hid all
        // but a sliver of it. The whole north-side row in the board's
        // sightline (bx 30..130, bz -44..-30) is capped at 5, so the
        // board shows whole over low shops.
        const inFlamSightline = bx >= 30 && bx <= 130 && bz >= -44 && bz <= -30;
        const h = inCoverCorridor
          ? Math.min(h0, nearCoverCamera ? 5 : 8)
          : inFlamSightline ? Math.min(h0, 5)
            : inBoardSightline ? Math.min(h0, 7)
            : inViceSightline ? Math.min(h0, 8)
            : byCoverStreetNorth ? Math.min(h0, 18) : h0;
        // Builder #14c — MOVE THE HOUSE OFF THE ROAD (fadli: "knp ada rmh
        // tengah jalan"). The probe puts the (133,-11) shop's centre at
        // screen (0.508, 0.511) in the cover frame — the vanishing point —
        // so the chase drove straight into its photo-facade west face and
        // the street read as ending at a house. It moves one slot south,
        // to (133,11), beside its (155,11) neighbour: a general rule for
        // the beachfront column's north half of the cover-street block, so
        // any seed's shop there moves, not just this one. The remap runs
        // AFTER the height caps above, so the moved shop keeps the
        // corridor cap of 5 — a taller shop here would cut the FLAMINGO
        // board — and before any mesh is built, so collision, the minimap
        // and the palms all see the new spot. The rng stream is untouched,
        // so every other building is identical, and the street now runs
        // clear past the ring boulevard to the beach, the wheel and the
        // ocean.
        if (isShopRow && cz === 0 && bz < 0 && bz >= -16) bz += 22;
        // Builder #17 — CLEAR THE DIAGONAL AVENUE: any slot whose
        // centre falls on the avenue's corridor is never built, so the
        // diagonal reads as a real street with buildings along one side,
        // not a road painted over towers. Casino Row is exempt (the
        // landmark district keeps its towers; the avenue ends at its
        // edge). NOTE: skipping a slot also skips its later rng draws,
        // so buildings after a cleared slot reshuffle heights/tints —
        // accepted, the layout is supposed to change; everything the
        // shots depend on is positional (corridor caps, remap, palms).
        if (!isCasino && Math.abs(bx + bz - DIAG_C) < 26) continue;
        // Builder #19 — the Vice Royale casino moved to the causeway
        // (56,2): the (59,11) tower slot of the (48,0) block would grow
        // through its south-east corner, so no tower is built there.
        if (Math.abs(bx - 56) < 13 && Math.abs(bz - 2) < 13) continue;
        const mat = isCasino
          ? tintMats[Math.floor(hash2(bx + 91, bz + 7) * tintMats.length) % tintMats.length]
          : isShopRow
            ? shopRoofMats[Math.floor(hash2(bx, bz) * shopRoofMats.length) % shopRoofMats.length]
            : pick(rng, tintMats);
        // Builder #11: "ga terlalu kotak2" — some tall towers are ROUNDED,
        // faceted drums instead of boxes, so the skyline has curves in it.
        // A drum keeps the same collision box as the box it replaces.
        // Builder #12: never a drum beside the cover street — drums there
        // read as blank walls from the chase camera (the #11 yellow drum).
        const isDrum = !isShopRow && !isCasino && h > 15 && hash2(bx + 77, bz + 31) > 0.6
          && !byCoverStreetNorth;
        // Builder #17 — STUCCO EVERYWHERE, NO PHOTO FACADES (fadli:
        // "tembok tempelan"). The tall towers used to wear the
        // photographed art-deco renders as a texture — a portrait
        // squashed over a wide box, printed arches and balconies with
        // fake perspective that fights the real camera. That is exactly
        // what read as a pasted picture. Every box tower now wears the
        // same painted stucco as the shops (one cached material per
        // tint, plaster grain + mottling), and the real geometry —
        // windows with frames + sills, balconies, pilasters, cornices,
        // set-back tiers — does the talking. The photo textures stay
        // loaded but unused for towers.
        const facade = isDrum ? null : stuccoFor(mat);
        // Builder #12 — REAL 3D, NOT PASTED-ON (fadli: "gedung cuma
        // tempelan"). A tall box tower is TWO tiers, not one slab: a full
        // base up to 62% of the height, then a smaller upper tier set back
        // 1.3 on every side with a cornice slab between them, so the
        // silhouette steps in real geometry and the facade reads as a
        // building from the street, not a poster on a box.
        const isTallBox = !isDrum && !isShopRow && h > 14;
        const h1 = isTallBox ? h * 0.62 : h;
        const w2 = isTallBox ? w - 2.6 : w;
        const d2 = isTallBox ? d - 2.6 : d;
        const tower = isDrum
          ? new THREE.Mesh(new THREE.CylinderGeometry(w * 0.48, w * 0.54, h, 16), mat)
          : new THREE.Mesh(
            new THREE.BoxGeometry(w, h1, d),
            facade || mat,
          );
        tower.position.set(bx, h1 / 2, bz);
        group.add(tower);
        if (isTallBox) {
          const upper = new THREE.Mesh(new THREE.BoxGeometry(w2, h - h1, d2), mat);
          upper.position.set(bx, h1 + (h - h1) / 2, bz);
          group.add(upper);
          const cornice = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5),
            accentMats[Math.floor(hash2(bx + 29, bz + 3) * accentMats.length) % accentMats.length],
          );
          cornice.position.set(bx, h1 + 0.25, bz);
          group.add(cornice);
        }
        // Builder #12: on a set-back tower the roof slab and parapet cap
        // follow the UPPER tier's smaller footprint, not the base — a
        // full-width slab would hang in the air past the upper walls.
        const roofW = isTallBox ? w2 : w;
        const roofD = isTallBox ? d2 : d;
        const roof = isDrum
          ? new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.54 + 0.3, w * 0.54 + 0.3, 0.5, 16),
            isShopRow
              ? shopRoofMats[Math.floor(hash2(bx + 9, bz + 4) * shopRoofMats.length) % shopRoofMats.length]
              : roofMat,
          )
          : new THREE.Mesh(
            new THREE.BoxGeometry(roofW + 0.6, 0.5, roofD + 0.6),
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
          ? new THREE.Mesh(new THREE.CylinderGeometry(w * 0.54 + 0.35, w * 0.54 + 0.35, 0.7, 16), accent)
          : new THREE.Mesh(new THREE.BoxGeometry(roofW + 0.7, 0.7, roofD + 0.7), accent);
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
        // Builder #12 — BALCONIES ON EVERY FLOOR, EVERY FACE (instanced):
        // a slab + rail on each face every 6 units up, so the facade has
        // real depth from any street, not one flat poster wall. Floors
        // above the setback line use the upper tier's smaller footprint,
        // so no balcony floats in the air. Corner pilasters run up the
        // base tier in the same pass, for the art-deco vertical rhythm
        // Halcyon's towers carry.
        if (!isDrum && !isShopRow && h > 12) {
          for (let by = 5.5; by < h - 2.5; by += 6) {
            const fw = by < h1 ? w : w2;
            const fd = by < h1 ? d : d2;
            const faceDefs = [
              { len: fw, rot: 0, px: 0, pz: fd / 2 + 0.65, ox: 0, oz: 1 },
              { len: fw, rot: Math.PI, px: 0, pz: -fd / 2 - 0.65, ox: 0, oz: -1 },
              { len: fd, rot: Math.PI / 2, px: fw / 2 + 0.65, pz: 0, ox: 1, oz: 0 },
              { len: fd, rot: -Math.PI / 2, px: -fw / 2 - 0.65, pz: 0, ox: -1, oz: 0 },
            ];
            for (const fd2 of faceDefs) {
              const nBal = fd2.len >= 11 ? 2 : 1;
              const offs = nBal === 2 ? [-fd2.len / 4, fd2.len / 4] : [0];
              for (const off of offs) {
                if (hash2(bx + off * 3, bz + by * 2) < 0.12) continue;
                const cx2 = bx + fd2.px + (fd2.rot === 0 || fd2.rot === Math.PI ? off : 0);
                const cz2 = bz + fd2.pz + (fd2.rot === 0 || fd2.rot === Math.PI ? 0 : off);
                pushBalcony(cx2, by, cz2, fd2.rot, fd2.ox, fd2.oz);
              }
            }
          }
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              pilasters.push([bx + sx * (w / 2 - 0.15), bz + sz * (d / 2 - 0.15), h1]);
            }
          }
        }
        // Builder #14c — SHOPS GET REAL RELIEF TOO (fadli: "tempelan"):
        // a shop was a bare photo box — no balconies, no pilasters, no
        // setback — so the whole mid-frame row in the cover read as
        // pictures pasted on boxes. Every shop now wears one balcony row
        // just under its parapet (every face except the awning face, so
        // no slab ever cuts through the awning stripes), corner pilasters
        // down to the pavement, and a stone plinth at its base, so the
        // wall carries real shadow lines from any street.
        if (isShopRow) {
          const shopBalY = h - 1.6;
          const shopFaces = [
            { len: w, rot: Math.PI, px: 0, pz: -d / 2 - 0.65, ox: 0, oz: -1 },
            { len: d, rot: Math.PI / 2, px: w / 2 + 0.65, pz: 0, ox: 1, oz: 0 },
            { len: d, rot: -Math.PI / 2, px: -w / 2 - 0.65, pz: 0, ox: -1, oz: 0 },
          ];
          for (const sf of shopFaces) {
            const nBal = sf.len >= 11 ? 2 : 1;
            const offs = nBal === 2 ? [-sf.len / 4, sf.len / 4] : [0];
            for (const off of offs) {
              if (hash2(bx + off * 3, bz + shopBalY * 2) < 0.12) continue;
              const cx2 = bx + sf.px + (sf.rot === Math.PI || sf.rot === 0 ? off : 0);
              const cz2 = bz + sf.pz + (sf.rot === Math.PI || sf.rot === 0 ? 0 : off);
              pushBalcony(cx2, shopBalY, cz2, sf.rot, sf.ox, sf.oz);
            }
          }
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              pilasters.push([bx + sx * (w / 2 - 0.15), bz + sz * (d / 2 - 0.15), h]);
            }
          }
          const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.4, 1.0, d + 0.4),
            new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 }),
          );
          plinth.position.set(bx, 0.5, bz);
          group.add(plinth);
        }
        // Builder #17 — a stone plinth at the base of every box tower
        // too (shops already had one): a shadow line at street level so
        // the wall never meets the pavement as one flat slab.
        if (!isShopRow && !isDrum) {
          const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.4, 1.2, d + 0.4),
            new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 }),
          );
          plinth.position.set(bx, 0.6, bz);
          group.add(plinth);
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
        // Builder #12 — ROOFTOP LIFE: a water tank on half the tall
        // towers and a thin antenna mast with a red tip on others, so the
        // roofline is cluttered and real instead of a flat slab. The tank
        // sits inside the upper tier's footprint (or the drum's top
        // radius), never floating past the roof edge.
        if (!isShopRow && h > 14) {
          const roofHalf = isDrum ? w * 0.3 : Math.min(w2, d2) / 2 - 1.8;
          if (hash2(bx + 5, bz + 9) > 0.45) {
            const tank = new THREE.Mesh(
              new THREE.CylinderGeometry(1.5, 1.5, 2.2, 10),
              new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.9 }),
            );
            tank.position.set(bx + roofHalf * 0.5, h + 1.1, bz - roofHalf * 0.5);
            group.add(tank);
            const tankCap = new THREE.Mesh(
              new THREE.ConeGeometry(1.6, 1.0, 10),
              new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.9 }),
            );
            tankCap.position.set(bx + roofHalf * 0.5, h + 2.7, bz - roofHalf * 0.5);
            group.add(tankCap);
          }
          if (hash2(bx + 13, bz + 21) > 0.5) {
            const mast = new THREE.Mesh(
              new THREE.CylinderGeometry(0.12, 0.16, 5, 6),
              new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.6, metalness: 0.6 }),
            );
            mast.position.set(bx - roofHalf * 0.5, h + 2.5, bz + roofHalf * 0.5);
            group.add(mast);
            const tip = new THREE.Mesh(
              new THREE.SphereGeometry(0.3, 8, 6),
              new THREE.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false }),
            );
            tip.position.set(bx - roofHalf * 0.5, h + 5.1, bz + roofHalf * 0.5);
            group.add(tip);
          }
        }
        // Builder #12 — DRUM PODIUM + RING BALCONIES: a drum rises out of
        // a wider podium base, and two flat ring balconies (annulus + rail
        // torus) wrap it part-way up, so the round towers have horizontal
        // rhythm and depth instead of one smooth tube.
        if (isDrum) {
          // Builder #12: the podium wears the tower's own tint, not a
          // random one — a purple base under an orange drum read as a
          // clash, not a building.
          const podium = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.58, w * 0.62, 3.2, 16),
            mat,
          );
          podium.position.set(bx, 1.6, bz);
          group.add(podium);
          const ringMat = new THREE.MeshStandardMaterial({ color: 0xf0e2c2, roughness: 0.9 });
          const railMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8 });
          for (const frac of [0.38, 0.72]) {
            const ry = h * frac;
            const rr = w * 0.54 - w * 0.06 * frac;
            // Builder #12: a SOLID plate, not a flat ring — the ring
            // geometry is single-sided and invisible from below, so from
            // the street the balcony read as a thin wire around the drum.
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(rr + 1.1, rr + 1.1, 0.35, 16), ringMat);
            ring.position.set(bx, ry, bz);
            group.add(ring);
            const rail = new THREE.Mesh(new THREE.TorusGeometry(rr + 1.05, 0.12, 6, 16), railMat);
            rail.rotation.x = Math.PI / 2;
            rail.position.set(bx, ry + 0.85, bz);
            group.add(rail);
          }
        }
        // Builder #12 — SIGN BAND over the ground floor of low buildings:
        // a lit horizontal band above the shopfront, so the street level
        // carries signage, not a blank wall. Builder #14c: low shops
        // (h<=6) get it always — their upper wall is short, so the band
        // never meets a window row; taller shops skip it, because their
        // uncapped window rows now run up to the balcony line and the
        // band would cut across a lit window.
        if ((isShopRow && h <= 6) || (!isShopRow && h > 6 && h < 16 && hash2(bx + 23, bz + 31) > 0.4)) {
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.7, 1.0, 0.25),
            accentMats[Math.floor(hash2(bx + 37, bz + 11) * accentMats.length) % accentMats.length],
          );
          band.position.set(bx, 4.6, bz + d / 2 + 0.12);
          group.add(band);
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
          // Shopfront glass: a thin glazed box with two mullions, not a
          // flat plane — Builder #14c: the old plane read as a bright
          // sticker on the wall; the box has real depth and the mullions
          // break it into three lights.
          if (isShopRow) {
            const glass = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.62, 2.2, 0.16),
              new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.15, metalness: 0.4 }),
            );
            glass.position.set(bx, 1.9, bz + d / 2 + 0.08);
            group.add(glass);
            const mullMat = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.7, metalness: 0.3 });
            for (const mx of [-w * 0.155, w * 0.155]) {
              const mull = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.2), mullMat);
              mull.position.set(bx + mx, 1.9, bz + d / 2 + 0.1);
              group.add(mull);
            }
          }
        }
        // Lit windows on all four faces, so the towers read busy from any
        // street the camera drives down, not just from the south and west.
        // Builder #12: windows follow the TWO tiers — the base tier wears
        // the full grid, the set-back upper tier wears its own smaller
        // grid, so the lit windows sit on real walls at both levels.
        // Drum towers wear their windows WRAPPED around the curved wall
        // (radius follows the drum's taper), so the drum reads lit and
        // alive instead of a blank coloured tube.
        const addBoxWindows = (fw, fd, yBase, yTop, maxFloors, litProb = palette.windowLit) => {
          const fl = maxFloors !== undefined ? maxFloors
            : Math.max(1, Math.floor((yTop - yBase) / 3.2));
          const cc = Math.max(1, Math.floor(fw / 4));
          const ccZ = Math.max(1, Math.floor(fd / 4));
          const faceDefs = [
            { axis: 'x', at: bz + fd / 2 + 0.06, rot: 0 },
            { axis: 'z', at: bx - fw / 2 - 0.06, rot: -Math.PI / 2 },
            { axis: 'x', at: bz - fd / 2 - 0.06, rot: Math.PI },
            { axis: 'z', at: bx + fw / 2 + 0.06, rot: Math.PI / 2 },
          ];
          for (const face of faceDefs) {
            const run = face.axis === 'x' ? cc : ccZ;
            for (let f = 0; f < fl; f += 1) {
              for (let c = 0; c < run; c += 1) {
                if (rng() > litProb) continue;
                const wy = yBase + 2.2 + f * 3.2;
                if (wy > yTop - 1) continue;
                if (face.axis === 'x') {
                  const wx = bx - fw / 2 + 2.2 + c * 4;
                  windowPositions.push([wx, wy, face.at, face.rot]);
                } else {
                  const wz = bz - fd / 2 + 2.2 + c * 4;
                  windowPositions.push([face.at, wy, wz, face.rot]);
                }
              }
            }
          }
        };
        if (isDrum) {
          const drumFloors = Math.max(1, Math.floor(h / 3.2));
          for (let f = 0; f < drumFloors; f += 1) {
            const wy = 2.2 + f * 3.2;
            if (wy > h - 1.5) continue;
            // The drum tapers: radius at this height, window just proud.
            // Builder #12: drum windows are BIG (1.8x) and dense — the
            // #11 drums read as blank tubes from the street because their
            // windows were the same small stamp as the box towers'.
            const rr = w * 0.54 - w * 0.06 * (wy / h) + 0.08;
            for (let aIdx = 0; aIdx < 10; aIdx += 1) {
              if (hash2(bx + aIdx * 13, bz + f * 7) > palette.windowLit * 2.1) continue;
              const a = (aIdx / 10) * Math.PI * 2;
              windowPositions.push([bx + Math.sin(a) * rr, wy, bz + Math.cos(a) * rr, a, 1.8]);
            }
          }
        } else if (isShopRow) {
          // Builder #14c: shop windows run every floor up to the balcony
          // line, not just one floor — a 7–11 high shop with a single
          // window row left a blank stucco band under its balcony.
          // Builder #14c, second look: the sunset palette lights only
          // 28% of windows, so a shop face wore one lonely square — shops
          // light 75%, so the facades read busy at golden hour. The gate
          // still draws one rng() per slot, so the stream is untouched.
          addBoxWindows(w, d, 0, h, undefined, 0.75);
        } else if (isTallBox) {
          addBoxWindows(w, d, 0, h1);
          addBoxWindows(w2, d2, h1, h);
        } else {
          addBoxWindows(w, d, 0, h);
        }
        // A neon sign on some towers, facing the street — and a thin
        // vertical neon strip down one corner of taller towers, so the
        // facades carry light, not just paint.
        if (neonCount < 20 && chance(rng, isShopRow ? 0.55 : 0.35)) {
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, range(rng, 2, 5), range(rng, 4, 9)),
            neonMats[neonCount % neonMats.length],
          );
          sign.position.set(bx + w / 2 + 0.35, h * 0.7, bz);
          group.add(sign);
          neonCount += 1;
        }
        // Casino Row: the district's towers carry an extra vertical
        // neon strip, so the casino towers carry more light than any
        // other block. (Builder #18: the old flat canvas CASINO sign
        // that hung here is DELETED — a flat picture of the word is
        // exactly the "tempelan" fadli kept rejecting, and the new Vice
        // Royale casino next door now carries the name in real 3D block
        // letters. Deleting the sign consumes no rng, so no other
        // building moves.)
        if (isCasino) {
          const strip2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, h * 0.85, 0.35),
            neonMats[Math.floor(hash2(bx + 13, bz + 29) * neonMats.length) % neonMats.length],
          );
          strip2.position.set(bx - w / 2 - 0.1, h * 0.5, bz - d / 2 - 0.1);
          group.add(strip2);
        }
        if (!isShopRow && h > 15 && hash2(bx + 31, bz + 13) > 0.42) {
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

  // Builder #18 — THE VICE ROYALE CASINO (fadli: gedung kasino besar
  // 3D di Casino Row, bukan papan tempel). A real landmark on the
  // district's free north-west slot (85,-85) — the two seeded casino
  // towers keep their rng-drawn heights and tints (nothing in the tower
  // loop moves: this section uses hash2 only, never rng, and runs after
  // the loop), so the cover composition and every other building are
  // untouched. The footprint is 14x14 like the towers, so its faces sit
  // 6 units off the street centrelines and clear the driving lanes by
  // the same unit the towers do; the entrance fronts the z=-72 street
  // and the title camera sees its south + west faces. Three stepped
  // stucco tiers (violet, gold cornices), a rooftop pylon carrying the
  // name painted on canvas on its west face (Fix #19: the 3D block
  // letters read sheared from the cover camera, a flat canvas word
  // reads clean), a cantilevered gold
  // marquee with a painted VICE ROYALE fascia, lit glass entrances,
  // neon corner strips and a ring of coloured bulbs. Windows and
  // balconies join the same instanced draws as every other tower, and
  // the building is registered in buildings[] BEFORE the palm and prop
  // passes, so no palm or planter ever grows through it. NOTE: from the
  // title camera this stands in front of the old flat CASINO sign on
  // the (85,-107) tower — that sign is occluded now, replaced by the
  // bigger 3D letters above it.
  // Builder #19 — MOVED to the causeway (56,2), south of the z=-24
  // avenue: the RIGHT side of the chase frame when driving east into
  // the sun. Its sign now faces WEST (toward the approaching camera,
  // nearly frontal in the cover) and its entrance + marquee face
  // NORTH, onto the avenue itself.
  const CAS = { x: 56, z: 2 };
  const casStucco = new THREE.MeshStandardMaterial({ map: stuccoTex, color: 0x7a2a9a, roughness: 0.95, metalness: 0 });
  const casStuccoMid = new THREE.MeshStandardMaterial({ map: stuccoTex, color: 0x9a3ab0, roughness: 0.95, metalness: 0 });
  const casGold = new THREE.MeshStandardMaterial({ color: 0xffd94a, roughness: 0.35, metalness: 0.75 });
  const casDark = new THREE.MeshStandardMaterial({ color: 0x1a0533, roughness: 0.7, metalness: 0.2 });
  // Three stepped tiers: base 14x14 h18, mid 11x11 h8, crown 8x8 h4.
  const casBase = new THREE.Mesh(new THREE.BoxGeometry(14, 18, 14), casStucco);
  casBase.position.set(CAS.x, 9, CAS.z);
  group.add(casBase);
  const casMid = new THREE.Mesh(new THREE.BoxGeometry(11, 8, 11), casStuccoMid);
  casMid.position.set(CAS.x, 22, CAS.z);
  group.add(casMid);
  const casCrown = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), casStucco);
  casCrown.position.set(CAS.x, 28, CAS.z);
  group.add(casCrown);
  // Gold cornices between the tiers + a gold parapet cap on the crown.
  for (const [cy, w] of [[18, 14.7], [26, 11.7]]) {
    const cor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, w), casGold);
    cor.position.set(CAS.x, cy + 0.3, CAS.z);
    group.add(cor);
  }
  const casCap = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.7, 8.7), casGold);
  casCap.position.set(CAS.x, 30.35, CAS.z);
  group.add(casCap);
  // Stone plinth at street level, like every other tower.
  const casPlinth = new THREE.Mesh(
    new THREE.BoxGeometry(14.4, 1.2, 14.4),
    new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 }),
  );
  casPlinth.position.set(CAS.x, 0.6, CAS.z);
  group.add(casPlinth);
  // Corner pilasters up the base tier (join the instanced draw).
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pilasters.push([CAS.x + sx * (14 / 2 - 0.15), CAS.z + sz * (14 / 2 - 0.15), 18]);
    }
  }
  // Lit windows on all four faces (the same instanced 3D units as the
  // towers — pane + frame + sill), skipping the ground-floor bays the
  // entrance glass occupies. hash2-gated, never rng.
  const casWin = (fw, fd, yBase, yTop, skip) => {
    const fl = Math.max(1, Math.floor((yTop - yBase) / 3.2));
    const cc = Math.max(1, Math.floor(fw / 4));
    const ccZ = Math.max(1, Math.floor(fd / 4));
    const defs = [
      { axis: 'x', at: CAS.z + fd / 2 + 0.06, rot: 0 },
      { axis: 'z', at: CAS.x - fw / 2 - 0.06, rot: -Math.PI / 2 },
      { axis: 'x', at: CAS.z - fd / 2 - 0.06, rot: Math.PI },
      { axis: 'z', at: CAS.x + fw / 2 + 0.06, rot: Math.PI / 2 },
    ];
    for (const face of defs) {
      const run = face.axis === 'x' ? cc : ccZ;
      for (let f = 0; f < fl; f += 1) {
        const wy = yBase + 2.2 + f * 3.2;
        if (wy > yTop - 1) continue;
        for (let c = 0; c < run; c += 1) {
          if (skip && skip(face.rot, f, c)) continue;
          if (hash2(CAS.x + c * 13 + f * 7, CAS.z + face.rot * 10 + wy) > 0.45) continue;
          if (face.axis === 'x') windowPositions.push([CAS.x - fw / 2 + 2.2 + c * 4, wy, face.at, face.rot]);
          else windowPositions.push([face.at, wy, CAS.z - fd / 2 + 2.2 + c * 4, face.rot]);
        }
      }
    }
  };
  // South ground floors = entrance, west ground floor = side door.
  // Fix #19: also skip the west window directly above the side door
  // (f=1, c=1) — the new west canopy goes there instead.
  casWin(14, 14, 0, 18, (rot, f, c) => (rot === Math.PI && f < 2) || (rot === -Math.PI / 2 && f === 0) || (rot === -Math.PI / 2 && f === 1 && c === 1));
  casWin(11, 11, 18, 26);
  // Fix #19 — the west face read as one flat purple slab in the cover:
  // the hash gate skipped the whole y8.6 row and the whole y15 row.
  // Force lit windows into the empty rows (same instanced 3D units as
  // every other window), plus two more on the mid tier's west face.
  for (const [wy, wz] of [[8.6, -2.8], [8.6, 1.2], [8.6, 5.2], [15.0, -2.8], [15.0, 5.2]]) {
    windowPositions.push([CAS.x - 7 - 0.06, wy, wz, -Math.PI / 2]);
  }
  for (const [wy, wz] of [[20.2, 2.7], [23.4, -1.3]]) {
    windowPositions.push([CAS.x - 5.5 - 0.06, wy, wz, -Math.PI / 2]);
  }
  // Balconies on the east, west and north faces of the base tier and
  // the north face of the mid tier (the south face wears the marquee).
  pushBalcony(CAS.x + 7 + 0.65, 12, CAS.z - 3.5, Math.PI / 2, 1, 0);
  pushBalcony(CAS.x + 7 + 0.65, 12, CAS.z + 3.5, Math.PI / 2, 1, 0);
  pushBalcony(CAS.x - 7 - 0.65, 12, CAS.z - 3.5, -Math.PI / 2, -1, 0);
  pushBalcony(CAS.x - 7 - 0.65, 12, CAS.z + 3.5, -Math.PI / 2, -1, 0);
  pushBalcony(CAS.x - 3.5, 12, CAS.z - 7 - 0.65, Math.PI, 0, -1);
  pushBalcony(CAS.x + 3.5, 12, CAS.z - 7 - 0.65, Math.PI, 0, -1);
  pushBalcony(CAS.x - 3.5, 22, CAS.z - 5.5 - 0.65, Math.PI, 0, -1);
  pushBalcony(CAS.x + 3.5, 22, CAS.z - 5.5 - 0.65, Math.PI, 0, -1);
  // Entrance: lit glass + gold-framed double doors on the south face,
  // a narrower glass door on the west face.
  const casGlassMat = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.15, metalness: 0.4 });
  const casGlass = new THREE.Mesh(new THREE.BoxGeometry(6, 4.4, 0.5), casGlassMat);
  casGlass.position.set(CAS.x, 2.6, CAS.z - 7 - 0.1);
  group.add(casGlass);
  for (const dx of [-3.1, 3.1]) {
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.8, 0.6), casGold);
    stile.position.set(CAS.x + dx, 2.4, CAS.z - 7 - 0.15);
    group.add(stile);
  }
  const casHeader = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 0.6), casGold);
  casHeader.position.set(CAS.x, 4.9, CAS.z - 7 - 0.15);
  group.add(casHeader);
  const casMull = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 0.55), casDark);
  casMull.position.set(CAS.x, 2.6, CAS.z - 7 - 0.12);
  group.add(casMull);
  const casGlassW = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.0, 3.2), casGlassMat);
  casGlassW.position.set(CAS.x - 7 - 0.1, 2.4, CAS.z);
  group.add(casGlassW);
  // Marquee: a gold-trimmed slab cantilevered over the entrance — NO
  // outer columns, because the kerb lane runs underneath and nothing
  // may stand in it — with a painted VICE ROYALE fascia on its front
  // edge and two diagonal struts tying it back to the wall, the way the
  // billboard cabinets are braced.
  const marqSlab = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 3.6), casDark);
  marqSlab.position.set(CAS.x, 6.2, CAS.z - 7 - 1.8);
  group.add(marqSlab);
  const marqCanvas = document.createElement('canvas');
  marqCanvas.width = 512;
  marqCanvas.height = 128;
  const mctx = marqCanvas.getContext('2d');
  mctx.fillStyle = '#1a0533';
  mctx.fillRect(0, 0, 512, 128);
  mctx.strokeStyle = '#ffd94a';
  mctx.lineWidth = 6;
  mctx.strokeRect(3, 3, 506, 122);
  mctx.textAlign = 'center';
  mctx.shadowColor = '#ff2a6a';
  mctx.shadowBlur = 12;
  mctx.fillStyle = '#ffffff';
  mctx.font = '900 54px Arial, sans-serif';
  mctx.fillText('VICE ROYALE', 256, 62);
  mctx.shadowBlur = 0;
  mctx.fillStyle = '#ffe9a0';
  mctx.font = '700 26px Arial, sans-serif';
  mctx.fillText('★ SLOTS · TABLES · 24 HOURS ★', 256, 104);
  const marqTex = new THREE.CanvasTexture(marqCanvas);
  marqTex.colorSpace = THREE.SRGBColorSpace;
  const marqFace = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.2, 0.25),
    [
      new THREE.MeshStandardMaterial({ color: 0x1a0533, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x1a0533, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x1a0533, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x1a0533, roughness: 0.6 }),
      // North face (-z, onto the avenue) carries the painted fascia;
      // the rest stay dark.
      new THREE.MeshStandardMaterial({ color: 0x1a0533, roughness: 0.6 }),
      new THREE.MeshBasicMaterial({ map: marqTex, toneMapped: false }),
    ],
  );
  marqFace.position.set(CAS.x, 5.35, CAS.z - 7 - 3.5);
  group.add(marqFace);
  for (const dx of [-4, 4]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.8, 0.3), casGold);
    strut.position.set(CAS.x + dx, 5.1, CAS.z - 7 - 1.55);
    strut.rotation.x = -1.04;
    group.add(strut);
  }
  // Vertical neon strips on the south face's two corners.
  const casNeonPink = new THREE.MeshBasicMaterial({ color: 0xff2a7a, toneMapped: false });
  const casNeonCyan = new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false });
  for (const [sx, mat] of [[-1, casNeonPink], [1, casNeonCyan]]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 17, 0.35), mat);
    strip.position.set(CAS.x + sx * (7 + 0.2), 9, CAS.z - 7 - 0.2);
    group.add(strip);
  }
  // Fix #19 — the same vertical neon strips framing the WEST face's two
  // corners (the cover's big flat wall), pink north / cyan south, proud
  // of the wall like the south pair.
  for (const [wz, mat] of [[CAS.z - 7 - 0.2, casNeonPink], [CAS.z + 7 + 0.2, casNeonCyan]]) {
    const stripW = new THREE.Mesh(new THREE.BoxGeometry(0.35, 17, 0.35), mat);
    stripW.position.set(CAS.x - 7 - 0.2, 9, wz);
    group.add(stripW);
  }
  // Fix #19 — canopy over the west side door (ground floor, west face),
  // echoing the north marquee: a dark slab cantilevered over the door,
  // a gold front lip, two diagonal struts back to the wall and three
  // bulbs under the lip. It sits where the skipped y5.4 window was, so
  // it never cuts through a window.
  const casCanopy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 5.2), casDark);
  casCanopy.position.set(CAS.x - 7 - 1.3, 5.15, CAS.z);
  group.add(casCanopy);
  const casCanopyLip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 5.2), casGold);
  casCanopyLip.position.set(CAS.x - 7 - 2.6, 5.0, CAS.z);
  group.add(casCanopyLip);
  for (const dz of [-2, 2]) {
    const cstrut = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), casGold);
    cstrut.position.set(CAS.x - 7 - 0.9, 4.5, CAS.z + dz);
    cstrut.rotation.z = 1.0;
    group.add(cstrut);
    const cbulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshBasicMaterial({ color: dz < 0 ? 0xff2a7a : 0x00e5ff, toneMapped: false }),
    );
    cbulb.position.set(CAS.x - 7 - 2.5, 4.85, CAS.z + dz);
    group.add(cbulb);
  }
  const cbulbMid = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false }),
  );
  cbulbMid.position.set(CAS.x - 7 - 2.5, 4.85, CAS.z);
  group.add(cbulbMid);
  // Coloured bulbs: a ring on the base cornice + a row under the
  // marquee lip, one instanced draw with per-bulb colours.
  const bulbSpots = [];
  for (const e of [-7, 7]) {
    for (let o = -6.3; o <= 6.3; o += 1.8) {
      bulbSpots.push([CAS.x + o, 18.9, CAS.z + e]);
      bulbSpots.push([CAS.x + e, 18.9, CAS.z + o]);
    }
  }
  for (let bx2 = -4; bx2 <= 4; bx2 += 1) bulbSpots.push([CAS.x + bx2, 4.72, CAS.z - 7 - 3.62]);
  const bulbCols = [0xff2a7a, 0x00e5ff, 0xffe14a, 0x7dff9a];
  const casTmpColor = new THREE.Color();
  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    Math.max(1, bulbSpots.length),
  );
  bulbSpots.forEach(([bx3, by3, bz3], i) => {
    dummy.position.set(bx3, by3, bz3);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    casTmpColor.setHex(bulbCols[i % bulbCols.length]);
    bulbs.setColorAt(i, casTmpColor);
  });
  bulbs.count = bulbSpots.length;
  if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  group.add(bulbs);
  // Rooftop pylon: ONE central gold mast behind the sign (a 4-post
  // pylon was tried first and its south posts stood 2.5 units in front
  // of the south panel, hiding a whole column of the A and the N — the
  // sign read "CA[I]O" with a fake mirrored N. The mast sits at the
  // panels' crossing corner, 0.15 behind both panel backs, so no letter
  // is ever crossed), a top frame, a gold beacon sphere with a red tip,
  // and the name painted on canvas on the west face (Fix #19: the 3D
  // block letters read sheared from the cover camera, a flat canvas
  // word reads clean — same technique as the marquee fascia).
  const casMast = new THREE.Mesh(new THREE.BoxGeometry(1.0, 7.5, 1.0), casGold);
  casMast.position.set(CAS.x + 0.3, 30.7 + 3.75, CAS.z - 0.3);
  group.add(casMast);
  const pylonTop = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.5, 6.2), casGold);
  pylonTop.position.set(CAS.x, 38.0, CAS.z);
  group.add(pylonTop);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd94a, toneMapped: false }),
  );
  beacon.position.set(CAS.x, 39.0, CAS.z);
  group.add(beacon);
  const beaconTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a3a, toneMapped: false }),
  );
  beaconTip.position.set(CAS.x, 39.9, CAS.z);
  group.add(beaconTip);
  // West panel + frame only. (Builder #18, second look: a matching
  // west panel was tried and DELETED — both panels are 12.8 long on
  // perpendicular faces, so the west panel's south end stuck 6 units
  // past the south panel and read as a dark bar crossing the sign
  // between the S and the I. Builder #19 flips it: the sign IS the
  // west panel now, facing the chase camera down the causeway; the
  // north face keeps the marquee and the entrance instead.)
  // Fix #19 — the cover camera sits NORTH-west of the casino (not due
  // west), so the flat west-facing sign read sheared ("CHETYN") at the
  // top-right frame corner. Yawing the sign -24 deg was tried first
  // and REVERTED: the yaw put the sign's south end ~5 units nearer the
  // camera, and with the camera pitched up the word's baseline tilted
  // ~15 deg in the frame (verified by projecting the letter cubes) —
  // differently broken, not fixed. The panel stays facing due west
  // (level baseline, ~0.5% foreshortening), and the 3x5 block-letter
  // cubes are replaced by a painted canvas face instead: the cubes'
  // bottom faces, seen from 30 deg below, muddled the pixel font's
  // diagonals (S read as E, N as H), while a flat canvas word reads
  // clean at the same angle — the FLAMINGO FM board proves it in this
  // very frame. The group stays (rotation 0) so the panel/frame/legs
  // keep their exact original world positions.
  const casSignGroup = new THREE.Group();
  casSignGroup.position.set(CAS.x + 0.3, 33.4, CAS.z - 0.3);
  casSignGroup.rotation.y = 0;
  group.add(casSignGroup);
  // Local coords below are world coords minus the pivot (56.3, 33.4, 1.7).
  const casPanelS = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.3, 12.8), casDark);
  casPanelS.position.set(-0.6, 0, 0.3);
  casSignGroup.add(casPanelS);
  // The gold frame rides PROUD of the panel front (0.3 out), so the
  // border reads as a border — flush at the panel's centre plane it
  // was embedded inside the 0.5-thick panel and invisible.
  for (const [fy, fh] of [[1.8, 0.35], [-1.8, 0.35]]) {
    const railS = new THREE.Mesh(new THREE.BoxGeometry(0.35, fh, 13.4), casGold);
    railS.position.set(-0.9, fy, 0.3);
    casSignGroup.add(railS);
  }
  for (const fx of [-6.25, 6.85]) {
    const stileS = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 0.35), casGold);
    stileS.position.set(-0.9, 0, fx);
    casSignGroup.add(stileS);
  }
  // Short legs tying the sign's bottom rail down to the crown cap, so
  // the sign never floats above the roof.
  for (const lx3 of [-3.2, 3.8]) {
    const legS = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), casGold);
    legS.position.set(-0.9, -2.25, lx3);
    casSignGroup.add(legS);
  }
  // Fix #19 — the word itself, painted on canvas like the VICE ROYALE
  // marquee fascia and the FLAMINGO FM board (both read clean at this
  // angle): big bold pink CASINO on the panel's own dark colour, so
  // the face reads as one lit sign instead of 58 separate cubes. The
  // plane sits 0.1 proud of the panel's west face, inside the gold
  // frame (the rails/stiles never cross it), facing due west.
  const casSignCanvas = document.createElement('canvas');
  casSignCanvas.width = 1024;
  casSignCanvas.height = 256;
  const sctx = casSignCanvas.getContext('2d');
  sctx.fillStyle = '#1a0533';
  sctx.fillRect(0, 0, 1024, 256);
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.shadowColor = '#ff2a7a';
  sctx.shadowBlur = 22;
  sctx.fillStyle = '#ff2a7a';
  sctx.font = '900 185px Arial, sans-serif';
  sctx.fillText('CASINO', 512, 134);
  sctx.shadowBlur = 0;
  sctx.fillStyle = '#ff7ab0';
  sctx.font = '900 185px Arial, sans-serif';
  sctx.fillText('CASINO', 512, 134);
  const casSignTex = new THREE.CanvasTexture(casSignCanvas);
  casSignTex.colorSpace = THREE.SRGBColorSpace;
  const casSignFace = new THREE.Mesh(
    new THREE.PlaneGeometry(11.6, 2.9),
    new THREE.MeshBasicMaterial({ map: casSignTex, toneMapped: false }),
  );
  casSignFace.position.set(-0.95, 0, 0.3);
  casSignFace.rotation.y = -Math.PI / 2;
  casSignGroup.add(casSignFace);
  // A pink halo over the sign + one real point light spilling neon onto
  // the entrance forecourt, the way the billboards light theirs.
  const casGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xff2a7a, transparent: true, opacity: 0.25,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  casGlow.position.set(CAS.x - 2, 33.4, CAS.z);
  casGlow.scale.set(20, 10, 1);
  group.add(casGlow);
  const casLight = new THREE.PointLight(0xff5a9a, 80, 80, 1.6);
  casLight.position.set(CAS.x, 6, CAS.z - 10);
  group.add(casLight);
  // Register the collision box so the player, palms and props all treat
  // the casino as a real building.
  buildings.push({ x: CAS.x, z: CAS.z, hw: 7, hd: 7, h: 30 });

  // Builder #12 — the collected balcony slabs + rails and corner
  // pilasters, each as one instanced draw. Slabs are cream, rails a
  // darker bronze, pilasters the same cream as the slabs, so the
  // relief reads in the golden-hour light.
  const balcSlabGeo = new THREE.BoxGeometry(3.2, 0.5, 1.3);
  const balcSlabMat = new THREE.MeshStandardMaterial({ color: 0xf0e2c2, roughness: 0.9 });
  const balcSlabsMesh = new THREE.InstancedMesh(balcSlabGeo, balcSlabMat, Math.max(1, balcSlabs.length));
  balcSlabs.forEach(([x, y, z, rotY], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    balcSlabsMesh.setMatrixAt(i, dummy.matrix);
  });
  balcSlabsMesh.count = balcSlabs.length;
  group.add(balcSlabsMesh);
  const balcRailGeo = new THREE.BoxGeometry(3.2, 0.15, 0.12);
  const balcRailMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8 });
  const balcRailsMesh = new THREE.InstancedMesh(balcRailGeo, balcRailMat, Math.max(1, balcRails.length));
  balcRails.forEach(([x, y, z, rotY], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    balcRailsMesh.setMatrixAt(i, dummy.matrix);
  });
  balcRailsMesh.count = balcRails.length;
  group.add(balcRailsMesh);
  // Builder #17 — the balcony fascia lips, one instanced draw.
  const balcFasciaGeo = new THREE.BoxGeometry(3.2, 0.55, 0.14);
  const balcFasciaMesh = new THREE.InstancedMesh(balcFasciaGeo, balcRailMat, Math.max(1, balcFascia.length));
  balcFascia.forEach(([x, y, z, rotY], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    balcFasciaMesh.setMatrixAt(i, dummy.matrix);
  });
  balcFasciaMesh.count = balcFascia.length;
  group.add(balcFasciaMesh);
  // Builder #14c — the railing posts: thin bronze uprights from the slab
  // to the top bar, so the balcony reads open instead of boarded up.
  const balcPostGeo = new THREE.BoxGeometry(0.09, 0.9, 0.09);
  const balcPostsMesh = new THREE.InstancedMesh(balcPostGeo, balcRailMat, Math.max(1, balcPosts.length));
  balcPosts.forEach(([x, y, z, rotY], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    balcPostsMesh.setMatrixAt(i, dummy.matrix);
  });
  balcPostsMesh.count = balcPosts.length;
  group.add(balcPostsMesh);
  const pilGeo = new THREE.BoxGeometry(0.55, 1, 0.55);
  const pilMat = new THREE.MeshStandardMaterial({ color: 0xf0e2c2, roughness: 0.9 });
  const pilMesh = new THREE.InstancedMesh(pilGeo, pilMat, Math.max(1, pilasters.length));
  pilasters.forEach(([x, z, ph], i) => {
    dummy.position.set(x, ph / 2, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, ph, 1);
    dummy.updateMatrix();
    pilMesh.setMatrixAt(i, dummy.matrix);
  });
  pilMesh.count = pilasters.length;
  group.add(pilMesh);

  // All lit windows in one instanced draw — but each window gets its own
  // colour from the palette's window colours (warm amber, cool blue, rose,
  // pale gold), keyed off its position, so the facades sparkle in varied
  // light instead of one flat yellow grid.
  // Builder #14c — REAL 3D WINDOWS (fadli: "knp masih ada tempelan"): the
  // old lit window was one flat plane 0.06 proud of the wall, so from the
  // chase camera it read as a white sticker pasted on the facade. A window
  // is now a five-piece unit with real depth: a lit pane set 0.14 back
  // inside a thin dark-bronze frame of top/bottom rails and side stiles,
  // the whole unit standing 0.26 proud of the wall, so every window has a
  // shadow gap, a border and side faces that catch the light from any
  // angle. The pane fills 82% of the unit — a thick black frame would
  // read as a dark hole with a sticker inside, so the frame stays thin
  // (0.12) and warm dark, never black. Three instanced draws (panes,
  // horizontal rails, vertical stiles) keep the cost flat no matter how
  // many windows the city wears.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.9 });
  // Builder #17 — BIGGER windows with DEEPER frames + a protruding
  // SILL under each one: the old 1.24-wide units with 0.4-deep frames
  // read as small stickers from the street. The pane is 1.5x1.3 now,
  // the frame stands 0.55 proud, and the sill catches a shadow line
  // under every window, so the wall carries depth at every storey.
  const paneGeo = new THREE.BoxGeometry(1.5, 1.3, 0.18);
  const paneMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const railHGeo = new THREE.BoxGeometry(1.64, 0.14, 0.55);
  const railVGeo = new THREE.BoxGeometry(0.14, 1.3, 0.55);
  const sillGeo = new THREE.BoxGeometry(1.7, 0.16, 0.6);
  const panes = new THREE.InstancedMesh(paneGeo, paneMat, Math.max(1, windowPositions.length));
  const railsH = new THREE.InstancedMesh(railHGeo, frameMat, Math.max(1, windowPositions.length * 2));
  const railsV = new THREE.InstancedMesh(railVGeo, frameMat, Math.max(1, windowPositions.length * 2));
  const sills = new THREE.InstancedMesh(sillGeo, frameMat, Math.max(1, windowPositions.length));
  const winColors = palette.windowColors || [0xffd98a];
  const tmpColor = new THREE.Color();
  windowPositions.forEach(([x, y, z, rotY, sc], i) => {
    // Builder #12: varied window sizes — a few double-width, a few
    // taller — so the lit grid is not one repeated stamp. Drum windows
    // carry their own 1.8x scale (5th entry) on top of that.
    const sv = hash2(x * 1.7, y + z * 2.3);
    const mult = sc || 1;
    const sx = (sv < 0.18 ? 1.6 : 1) * mult;
    const sy = (sv > 0.9 ? 1.5 : 1) * mult;
    // One base transform per window; each piece is offset in the window's
    // own local frame (offsets scaled by sx/sy by hand: translateOnAxis
    // ignores scale, so an unscaled offset would land the rails on the
    // pane of a double-size window).
    const place = (mesh, idx, ox, oy, oz) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(sx, sy, 1);
      dummy.translateX(ox * sx);
      dummy.translateY(oy * sy);
      dummy.translateZ(oz);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    };
    place(panes, i, 0, 0, -0.02);
    place(railsH, i * 2, 0, 0.65, 0);
    place(railsH, i * 2 + 1, 0, -0.65, 0);
    place(railsV, i * 2, -0.75, 0, 0);
    place(railsV, i * 2 + 1, 0.75, 0, 0);
    place(sills, i, 0, -0.78, 0.06);
    tmpColor.setHex(winColors[Math.floor(hash2(x, y + z) * winColors.length) % winColors.length]);
    panes.setColorAt(i, tmpColor);
  });
  panes.count = windowPositions.length;
  railsH.count = windowPositions.length * 2;
  railsV.count = windowPositions.length * 2;
  sills.count = windowPositions.length;
  if (panes.instanceColor) panes.instanceColor.needsUpdate = true;
  group.add(panes);
  group.add(railsH);
  group.add(railsV);
  group.add(sills);

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

  // Builder #16 — ORGANIC GREEN BLOCKS (fadli: kota jangan kotak-kotak).
  // The drivable street network stays as it is — traffic, police,
  // missions and the shots all drive on those streets, so re-laying them
  // would break play — but the blocks stop reading as bare tan squares:
  // every block has two diagonal slots with no building in them, and
  // where one of those slots is clear a round lawn (a flattened,
  // rotated ellipse, varied green) sits in it, so the city reads as
  // green organic shapes between the towers from the title view. Pure
  // decoration at ground level: no collision, no rng stream, fixed hash
  // shapes. The rows beside the cover and driving streets are left
  // alone, so the tuned shot compositions never change.
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x4f9a58, roughness: 1 });
  const lawnMat2 = new THREE.MeshStandardMaterial({ color: 0x5da864, roughness: 1 });
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      if (Math.hypot(cx, cz) > 130) continue;
      if (cx >= 116) continue; // beachfront shop row stays sand + shops
      if (cz === 0 || cz === -48 || cz === 48) continue; // shot-street rows
      if (cx === 96 && cz === -96) continue; // Casino Row keeps its plaza
      if (Math.hypot(cx + 108, cz - 134) < 40) continue; // the docks
      for (const [ox, oz] of [[-11, -11], [11, 11], [-11, 11], [11, -11]]) {
        const lx = cx + ox;
        const lz = cz + oz;
        if (hash2(lx + 5, lz + 11) < 0.45) continue; // not every slot: variety
        if (hitsBuilding(buildings, lx, lz, 4.5)) continue;
        const lr = 4.5 + hash2(lx, lz) * 1.5;
        const lawn = new THREE.Mesh(
          new THREE.CircleGeometry(lr, 26),
          hash2(lx + 2, lz + 3) > 0.5 ? lawnMat : lawnMat2,
        );
        lawn.rotation.x = -Math.PI / 2;
        lawn.rotation.z = hash2(lx + 7, lz + 1) * Math.PI;
        lawn.scale.set(1, 0.7 + hash2(lx + 9, lz + 4) * 0.3, 1);
        lawn.position.set(lx, 0.04, lz);
        group.add(lawn);
      }
    }
  }

  // Palms — builder #9 rebuild, geometry redone by #16: NO flat fans.
  // Each palm is a gently bowed trunk with a round three-tier crown of
  // bent fronds (thin stems rising out-up, wide flat blades folding
  // down), two greens, varied height (5.5–9) and lean, on both kerbs of
  // the beachfront avenue and the east-west streets, so the chase camera
  // always has palms at the frame's edges. Fronds, stems, trunks and
  // coconuts are four instanced draws, so sixty palms cost no more than
  // four meshes. A palm is only planted
  // where the finished buildings leave room (checked against the built
  // boxes), so no trunk ever grows through a tower, and never on a
  // crosswalk corner or in the on-foot fight's staging patch, so no trunk
  // ever stands in the camera's face. The checks are seeded by position,
  // never by the stream, so the layout never moves.
  const palmSpots = [];
  // Builder #12: the 5th entry is a frond-length scale. Palms beside
  // the two east-west streets the shots drive down (z=±24) wear SHORT
  // fronds (0.6x) — a full-length frond from a kerb palm 5 units off the
  // lane used to rake diagonally across a third of the driving frame
  // (the #11 nit that survived into #12's first driving shot).
  function spotPalm(px, pz, lean, frondScale = 1) {
    palmSpots.push([px, pz, lean, 5.5 + hash2(px + 3, pz + 8) * 3.5, frondScale]);
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
      // Builder #15 — keep the FLAMINGO board's sightline clear: the
      // ring palms at a ~10.6 degrees (x 157-177, z 29-33) stand between
      // the cover camera and the board (188, 44), and their crowns cross
      // the board's subtitle band in the cover. Only that angle is cut.
      if (a > 0.1 && a < 0.25) continue;
      let dd = Math.abs(a - docksAngle);
      if (dd > Math.PI) dd = Math.PI * 2 - dd;
      if (dd < 0.3) continue;
      // Builder #17 — keep ring palms off the diagonal avenue.
      if (diagDist(px, pz) < 14) continue;
      if (isOnRoad(px, pz)) continue;
      if (hitsBuilding(buildings, px, pz, 2.6)) continue;
      spotPalm(px, pz, hash2(px, pz) > 0.5 ? 0.12 : -0.12);
    }
  }
  const streetPalms = [];
  for (let z = -160; z <= 160; z += 32) {
    if (CITY.streets.some((s) => Math.abs(z - s) < 7)) continue;
    // Builder #14c — the avenue palms at z=±32 stand 8 units off the two
    // shot streets (±24), so the (111.4,32) palm is 6 units from the
    // driving camera and its fronds rake across a third of the driving
    // frame. Palms that close to a shot street move 12 units further down
    // the avenue (to ±44), clear of both chase cameras, instead of being
    // cut — the avenue keeps its palms, the shots keep their frames.
    let pz = z;
    if (Math.abs(Math.abs(z) - 24) <= 10) pz = Math.sign(z) * (Math.abs(z) + 12);
    // Builder #15 — the (128.6, 0) avenue palm stands in the FLAMINGO
    // board's sightline (probe: crown px 1324, upright fronds py 370-437
    // straight across the "NEON NIGHTS" subtitle) — cut just that one.
    // (111.4, 0) stays: its fronds only graze the board's top-right
    // bezel, and it is the frame's biggest right-side palm.
    streetPalms.push([111.4, pz]);
    if (pz !== 0) streetPalms.push([128.6, pz]);
  }
  for (const street of [24, -24]) {
    for (let x = -123; x <= 150; x += 34) {
      if (CITY.streets.some((s) => Math.abs(x - s) < 7)) continue;
      // Builder #15 — the (149, 15.4) and (149, 32.6) palms on the z=24
      // street stand in the FLAMINGO board's sightline (probe: crowns at
      // px 1346/1553, fronds across the subtitle) — cut just that pair.
      if (street === 24 && x === 149) continue;
      // Builder #19 — the (13,-15.4) palm stands 5 units from the cover
      // camera (x~8.5, z=-18): its trunk filled the frame's whole right
      // side and its crown draped across the top. Cut just that one;
      // the (47,-15.4) palm still frames the casino's west face.
      if (street === -24 && x === 13) {
        streetPalms.push([x, street - 8.6, 0.6]);
      } else {
        streetPalms.push([x, street - 8.6, 0.6], [x, street + 8.6, 0.6]);
      }
    }
  }
  // Builder #15 — DENSE AVENUE PALMS FOR THE COVER (fadli: palem rapat
  // di kedua sisi jalan, kayak Halcyon/Costa Solis — #14c cuma 4-5 palem
  // kelihatan di frame). The chase camera sits ~x 93 looking east, so
  // the visible stretch is x 95..180: four more on the south kerb
  // (z=-15.4) and two on the north kerb (z=-32.6), short fronds (0.6x)
  // like the other shot-street palms. The hitsBuilding check below drops
  // any that lands on a tower (e.g. (130,-32.6) sits on the (133,-37)
  // tower) — the survivors join the existing (115,149) pairs, so the
  // frame carries ~10 palms instead of 4-5. All fixed positions, no rng.
  for (const x of [95, 130, 165, 180]) streetPalms.push([x, -24 + 8.6, 0.6]);
  for (const x of [95, 165]) streetPalms.push([x, -24 - 8.6, 0.6]);
  for (const [px, pz, fs] of streetPalms) {
    if (hitsBuilding(buildings, px, pz, 2.6)) continue;
    spotPalm(px, pz, hash2(px, pz) > 0.5 ? 0.1 : -0.1, fs || 1);
  }
  // Builder #17 — PALMS ALONG THE DIAGONAL AVENUE, both kerbs (local
  // X along the avenue, local Z across it; rotation.y = PI/4 maps local
  // (lx, lz) to world (-30 + (lx+lz)*0.7071, -30 + (-lx+lz)*0.7071)).
  // The isOnRoad + hitsBuilding checks drop any palm that would stand
  // on a crossing street or inside a tower.
  for (let lx = -150; lx <= 150; lx += 26) {
    for (const lz of [-10.5, 10.5]) {
      const px = DIAG_CX + (lx + lz) * 0.7071;
      const pz = DIAG_CZ + (-lx + lz) * 0.7071;
      if (Math.hypot(px, pz) > 190) continue;
      if (isOnRoad(px, pz)) continue;
      if (hitsBuilding(buildings, px, pz, 2.6)) continue;
      spotPalm(px, pz, hash2(px, pz) > 0.5 ? 0.1 : -0.1, 0.8);
    }
  }
  // One instanced draw for all trunks (two bowed segments each), one for
  // the frond stems, one for the folding blades, one for the coconut
  // clusters. A frond is a thin stem rising out-up with a wide flat blade
  // that folds down from its tip, so the crown arches instead of
  // stabbing straight out; the two greens alternate by position hash.
  // Builder #14c — REAL 3D CROWNS (fadli: "knp masih ada tempelan"): the
  // old frond was a 5-sided cone squashed flat (0.45), so each crown read
  // as one flat green fan. Fronds are now rounder (6 sides, 0.8 squash,
  // wider radius) with varied lengths, plus three short upright fronds in
  // the middle of each crown, so the crown reads as a 3D pom-pom from any
  // street, not a paper fan. The outer nine keep their 100–125° droop:
  // the first pass fanned them near-horizontal (85°) and a kerb palm
  // beside the driving camera raked giant blades across a third of the
  // driving frame — drooping fronds stay beside their trunk instead.
  // Builder #16 — ROUND, BENT, LAYERED CROWNS (fadli on #15: palem
  // masih segitiga datar kayak tempelan kertas). The old crown was 12
  // straight cones fanned in one flat ring — a regular star whose
  // silhouette is a triangle from the street. Every frond is now TWO
  // segments that BEND: a thin stem rising out-up, then a wide flat blade
  // that folds down, so the frond arches like a real palm frond instead
  // of stabbing straight out; and the crown has THREE tiers (10 long
  // outer + 7 mid + 4 upright spears) with azimuth jitter, so no regular
  // star forms and the silhouette is a full round pom-pom from any
  // angle. Trunks bend too: two segments with a growing lean, a gentle
  // curve instead of one straight pole. All palm POSITIONS are untouched
  // (sightlines tuned in #14c/#15) — only the geometry changes.
  // Per palm: 2 trunk segments, 21 stems (10 outer + 7 mid + 4 upright),
  // 17 blades (10 outer + 7 mid), 3 coconuts.
  // Builder #17 — THE TRUNK SIGN FIX (fadli: "batang palem patah").
  // ROOT CAUSE: the two segments were rotated with rotation.z = +lean
  // while their positions were computed as if the top landed at
  // +sin(lean) — but Rz(+lean) maps +Y to (-sin, cos), so segment 1's
  // real top sat at px, a full 2*sin(lean)*h1 sideways from where
  // segment 2 started. The trunk was built split in two from day one.
  // Now rotation.z = -lean/-lean2, so each segment's top lands exactly
  // on the computed joint, and segment 2 starts 0.4 BELOW the joint
  // (overlapping) and tapers to 0.78x, so no seam can ever open.
  // Fronds are THREE segments now (stem + blade + drooping tip), so
  // each frond arches in joints instead of stabbing out as one flat
  // triangle; blades are narrower (0.6) and less squashed.
  const palmCount = palmSpots.length;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, palmCount * 2));
  // A frond segment: a cone with its wide base at the joint and its tip
  // pointing out. The stem is thin; the blade is wide and flattened, so
  // it reads as a leaf, not a round spike.
  const stemGeo = new THREE.ConeGeometry(0.26, 1, 6);
  stemGeo.translate(0, 0.5, 0);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, Math.max(1, palmCount * 21));
  const bladeGeo = new THREE.ConeGeometry(0.6, 1, 7);
  bladeGeo.scale(1, 1, 0.5);
  bladeGeo.translate(0, 0.5, 0);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, Math.max(1, palmCount * 34));
  const nutGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const nutMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
  const nuts = new THREE.InstancedMesh(nutGeo, nutMat, Math.max(1, palmCount * 3));
  const frondCols = (palette.frondColors || [0x2fae5a, 0x46c468]).map((c) => new THREE.Color(c));
  const frondQuat = new THREE.Quaternion();
  const frondEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  // Unit direction of a segment tilted `tilt` from straight up, at
  // azimuth `az`: local +Y after the YXZ Euler (tilt, az).
  const segDir = (tilt, az) => [
    Math.sin(tilt) * Math.sin(az),
    Math.cos(tilt),
    Math.sin(tilt) * Math.cos(az),
  ];
  const pickCol = (a, b) => frondCols[Math.floor(hash2(a, b) * frondCols.length) % frondCols.length];
  let trunkIndex = 0;
  let stemIndex = 0;
  let bladeIndex = 0;
  let nutIndex = 0;
  palmSpots.forEach(([px, pz, lean, trunkH, frondScale]) => {
    // Curved trunk: the lower segment leans `lean`, the upper segment
    // leans 1.7x as far the same way, so the pole bows gently. The crown
    // sits at the true top of the upper segment.
    const h1 = trunkH * 0.62;
    const h2 = trunkH * 0.48;
    const lean2 = lean * 1.7;
    const top1x = px + Math.sin(lean) * h1;
    const top1y = Math.cos(lean) * h1;
    const crownX = top1x + Math.sin(lean2) * h2;
    const crownY = top1y + Math.cos(lean2) * h2 + 0.1;
    dummy.position.set(px + Math.sin(lean) * (h1 / 2), top1y / 2, pz);
    dummy.rotation.set(0, 0, -lean);
    dummy.scale.set(1, h1, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(trunkIndex, dummy.matrix);
    trunkIndex += 1;
    // Segment 2 starts 0.4 below the joint (overlap, never a gap) and
    // tapers to 0.78x, so the joint reads as one continuous bowed pole.
    const dir2x = Math.sin(lean2);
    const dir2y = Math.cos(lean2);
    dummy.position.set(top1x + dir2x * (h2 / 2 - 0.2), top1y + dir2y * (h2 / 2 - 0.2), pz);
    dummy.rotation.set(0, 0, -lean2);
    dummy.scale.set(0.78, h2 + 0.4, 0.78);
    dummy.updateMatrix();
    trunks.setMatrixAt(trunkIndex, dummy.matrix);
    trunkIndex += 1;
    const phase = hash2(px, pz) * Math.PI * 2;
    // One bent frond: stem out-up, blade folding down from the stem's tip.
    const bentFrond = (f, tier, baseLen, t1lo, t1hi, t2lo, t2hi) => {
      const az = phase + (f / tier) * Math.PI * 2 + (hash2(px + f * 17, pz + tier) - 0.5) * 0.5;
      const len = baseLen * (frondScale || 1);
      const t1 = (t1lo + hash2(px + f * 3, pz + f) * (t1hi - t1lo)) * (Math.PI / 180);
      const t2 = (t2lo + hash2(px + f * 7, pz + f * 11) * (t2hi - t2lo)) * (Math.PI / 180);
      const len1 = len * 0.5;
      const len2 = len * 0.62;
      const bx = crownX + Math.sin(az) * 0.3;
      const bz = pz + Math.cos(az) * 0.3;
      frondEuler.set(t1, az, 0);
      frondQuat.setFromEuler(frondEuler);
      dummy.position.set(bx, crownY, bz);
      dummy.quaternion.copy(frondQuat);
      dummy.scale.set(1, len1, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(stemIndex, dummy.matrix);
      stems.setColorAt(stemIndex, pickCol(px + f * 7, pz));
      stemIndex += 1;
      const d1 = segDir(t1, az);
      const jx = bx + d1[0] * len1;
      const jy = crownY + d1[1] * len1;
      const jz = bz + d1[2] * len1;
      const az2 = az + (hash2(px + f * 23, pz + f * 5) - 0.5) * 0.24;
      frondEuler.set(t2, az2, 0);
      frondQuat.setFromEuler(frondEuler);
      dummy.position.set(jx, jy, jz);
      dummy.quaternion.copy(frondQuat);
      dummy.scale.set(1, len2, 1);
      dummy.updateMatrix();
      blades.setMatrixAt(bladeIndex, dummy.matrix);
      blades.setColorAt(bladeIndex, pickCol(px + f * 13, pz + 5));
      bladeIndex += 1;
      // Builder #17 — THIRD segment: a drooping tip jointed off the
      // blade's end, 26-46 degrees further down, half as long and
      // narrower, so the frond arches in three joints like a real palm
      // frond instead of ending in one flat triangle point.
      const d2 = segDir(t2, az2);
      const t3 = t2 + (0.45 + hash2(px + f * 31, pz + f * 3) * 0.35);
      const az3 = az2 + (hash2(px + f * 29, pz + f * 13) - 0.5) * 0.2;
      const len3 = len2 * 0.55;
      frondEuler.set(t3, az3, 0);
      frondQuat.setFromEuler(frondEuler);
      dummy.position.set(jx + d2[0] * len2, jy + d2[1] * len2, jz + d2[2] * len2);
      dummy.quaternion.copy(frondQuat);
      dummy.scale.set(0.62, len3, 0.62);
      dummy.updateMatrix();
      blades.setMatrixAt(bladeIndex, dummy.matrix);
      blades.setColorAt(bladeIndex, pickCol(px + f * 13, pz + 5));
      bladeIndex += 1;
    };
    // Outer tier: 10 long fronds, stems up-out, blades folding well down.
    for (let f = 0; f < 10; f += 1) {
      bentFrond(f, 10, 3.4 + hash2(px + f, pz + f * 5) * 1.8, 55, 80, 118, 145);
    }
    // Mid tier: 7 shorter fronds, higher stems, blades folding to level.
    for (let f = 0; f < 7; f += 1) {
      bentFrond(f, 7, (3.4 + hash2(px + f * 3, pz + f * 7) * 1.8) * 0.72, 35, 55, 95, 120);
    }
    // Top tier: 4 upright spears, single thin segments, no blade.
    for (let f = 0; f < 4; f += 1) {
      const az = phase + f * 1.7 + 0.8;
      const tilt = (12 + hash2(px + f * 11, pz + f * 3) * 20) * (Math.PI / 180);
      const len = (2.2 + hash2(px + f * 5, pz + f * 9) * 0.8) * (frondScale || 1);
      frondEuler.set(tilt, az, 0);
      frondQuat.setFromEuler(frondEuler);
      dummy.position.set(crownX + Math.sin(az) * 0.2, crownY, pz + Math.cos(az) * 0.2);
      dummy.quaternion.copy(frondQuat);
      dummy.scale.set(1.8, len, 1.8);
      dummy.updateMatrix();
      stems.setMatrixAt(stemIndex, dummy.matrix);
      stems.setColorAt(stemIndex, pickCol(px + f * 19, pz + 3));
      stemIndex += 1;
    }
    for (let n = 0; n < 3; n += 1) {
      const na = phase + n * 2.1;
      dummy.position.set(crownX + Math.sin(na) * 0.5, crownY - 0.35, pz + Math.cos(na) * 0.5);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      nuts.setMatrixAt(nutIndex, dummy.matrix);
      nutIndex += 1;
    }
  });
  trunks.count = trunkIndex;
  stems.count = stemIndex;
  blades.count = bladeIndex;
  nuts.count = nutIndex;
  if (stems.instanceColor) stems.instanceColor.needsUpdate = true;
  if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
  group.add(trunks);
  group.add(stems);
  group.add(blades);
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

  // Builder #15 — BEACH BOULEVARD BESIDE THE COVER STREET (fadli: tiru
  // Costa Solis — pantai di samping jalan, bukan cuma di ujung jalan).
  // The strip x 120..175, z -14..-6 sits on the south sidewalk of the
  // z=-24 chase street: the #14c shop-remap leaves that ground free of
  // buildings east of x=116, the parked-car clearing in shots.js keeps
  // the kerb empty, and the strip never touches the road's edge line
  // (z=-17.5) or the intersection crosswalks (east side ends z=-19.2).
  // Sand, four umbrellas, two towels and two beachgoers, all fixed
  // positions (no rng() — the seeded stream never moves). From the cover
  // camera it reads as sand + umbrellas on the road's right side, the
  // way Costa Solis's beach flanks its causeway.
  const stripSand = new THREE.Mesh(
    new THREE.PlaneGeometry(55, 8),
    new THREE.MeshStandardMaterial({ color: palette.sandTint ?? 0xf2d491, roughness: 1 }),
  );
  stripSand.rotation.x = -Math.PI / 2;
  stripSand.position.set(147.5, 0.06, -10);
  group.add(stripSand);
  addUmbrella(126, -10, 0xff5a7a);
  addUmbrella(142, -10.5, 0x37e0ff);
  addUmbrella(158, -9.5, 0xffd94a);
  addUmbrella(170, -10.5, 0x7dff9a);
  for (let i = 0; i < 2; i += 1) {
    const towel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.4),
      new THREE.MeshBasicMaterial({ color: towelCols[(i + 1) % towelCols.length] }),
    );
    towel.rotation.x = -Math.PI / 2;
    towel.rotation.z = 0.4 + i * 0.5;
    towel.position.set(134 + i * 22, 0.08, -7.5 - i * 1.5);
    group.add(towel);
  }
  for (let i = 0; i < 2; i += 1) {
    const figure = new THREE.Group();
    const fBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.3, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: beachShirts[(i + 2) % beachShirts.length], roughness: 0.85 }),
    );
    fBody.position.y = 0.95;
    figure.add(fBody);
    const fHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.7 }),
    );
    fHead.position.y = 1.6;
    figure.add(fHead);
    figure.position.set(150 + i * 15, 0, -8 - i * 2);
    figure.rotation.y = 0.6 + i * 1.8;
    group.add(figure);
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
  // Builder #13 — a billboard is a GROUP with a yaw (rotY), so its face
  // can turn toward the chase camera instead of standing square to the
  // street: square-on, the FLAMINGO board sat ~50 degrees off-axis from
  // the cover camera and read foreshortened and half out of frame. The
  // group's local -X face is the painted face; rotY turns its normal
  // toward the camera (FLAMINGO -PI/4 faces south-west down the street,
  // VICE +0.4 faces north-west). Poles, glow and light ride in the group.
  // Builder #14c — A REAL CABINET, NOT A POSTER (fadli: "knp masih ada
  // tempelan"): the old board was one 0.6-thick box, so from the chase it
  // read as a poster nailed to the sky. The face now sits 0.2 recessed
  // inside a dark bezel (top/bottom rails + side stiles, proud of the
  // face), backed by a 1.6-deep cabinet box, so the board has a rim and a
  // real side profile; it stands on two thick poles with a crossbeam
  // under the board, diagonal struts up to the cabinet, and concrete
  // footings at the bases — a structure, not a picture.
  const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x1c1c26, roughness: 0.6, metalness: 0.4 });
  const footingMat = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 1 });
  function addBillboard(x, z, rotY, w, h, cy, art, spec, glowColor) {
    const boardGroup = new THREE.Group();
    boardGroup.position.set(x, 0, z);
    boardGroup.rotation.y = rotY;
    group.add(boardGroup);
    const poleH = cy + h / 2 + 0.5;
    for (const dz of [-(w / 2 - 1), w / 2 - 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, poleH, 10), boardPoleMat);
      pole.position.set(0.8, poleH / 2, dz);
      boardGroup.add(pole);
      const footing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.8), footingMat);
      footing.position.set(0.8, 0.45, dz);
      boardGroup.add(footing);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.9, 0.35), boardPoleMat);
      strut.position.set(1.15, cy - h / 2 - 1.6, dz);
      strut.rotation.z = -0.245;
      boardGroup.add(strut);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, w), boardPoleMat);
    beam.position.set(0.8, cy - h / 2 - 0.4, 0);
    boardGroup.add(beam);
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.6, h + 0.4, w + 0.4), cabinetMat);
    cabinet.position.set(0.8, cy, 0);
    boardGroup.add(cabinet);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, h, w),
      new THREE.MeshBasicMaterial({ map: paintBoard(art, spec), toneMapped: false }),
    );
    board.position.set(0, cy, 0);
    boardGroup.add(board);
    const railH = new THREE.BoxGeometry(0.7, 0.9, w + 1.0);
    for (const dy of [h / 2 + 0.45, -h / 2 - 0.45]) {
      const rail = new THREE.Mesh(railH, cabinetMat);
      rail.position.set(-0.15, cy + dy, 0);
      boardGroup.add(rail);
    }
    const railV = new THREE.BoxGeometry(0.7, h, 1.0);
    for (const dz of [w / 2 + 0.5, -w / 2 - 0.5]) {
      const stile = new THREE.Mesh(railV, cabinetMat);
      stile.position.set(-0.15, cy, dz);
      boardGroup.add(stile);
    }
    // The billboard glows: a compact additive halo sprite floating just
    // in front of the board, and one real point light spilling neon onto
    // the promenade palms and sand, so the board reads as a light source,
    // not a painted panel. The halo stays tight to the board: the old
    // 80-wide sprite washed out the ferris wheel standing behind it in
    // the cover frame. (Physical light units: intensity 80 at decay 1.6
    // throws a visible wash out to ~30 units.)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: glowColor, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.position.set(-1.5, cy, 0);
    glow.scale.set(w * 1.5, h * 2.6, 1);
    boardGroup.add(glow);
    const light = new THREE.PointLight(glowColor, 80, 80, 1.6);
    light.position.set(-4, cy - 1, 0);
    boardGroup.add(light);
  }
  addBillboard(184, -58, 0.4, 28, 12, 17, textures && textures.billboardVice ? textures.billboardVice.image : null, {
    panel: [26, 26, 460, 158], title: 'VICE SHORES', titleSize: 62, titleY: 100,
    sub: 'RIDE THE SUNSET', subY: 148, tag: 'PALMS · NEON · NO SPEED LIMIT', tagY: 210,
  }, 0xff5a7a);
  // Builder #13 — FLAMINGO FM, BIG and turned toward the chase: 40 wide
  // (was 28) and 16 tall at (180, 26), yawed -PI/4 so its face is nearly
  // frontal from the cover camera instead of 50 degrees off-axis, and
  // moved south of the wheel's sightline (z 13..39) so it never hides the
  // wheel — it stands beside the wheel's lower rim, not over it. The
  // whole board, lettering included, now sits inside the cover frame.
  // Builder #15 — MOVED SOUTH + EAST, (188, 44): at (180, 26) the
  // board's north-east end (the "F" of FLAMINGO) sat on the wheel rim's
  // southernmost sightline, so the rim crossed the F and the L in the
  // cover (probe: F at px ~1035, rim arc px 1020-1064 at the same height).
  // At (188, 44) the whole board clears the rim: the F sits at azimuth
  // ~28 degrees off the chase axis while the rim's southernmost point
  // only reaches z=15, so no rim arc can cross the lettering again. The
  // board stays in frame (its far end ~px 1470) and still reads whole.
  addBillboard(120, -52, 0.27, 40, 16, 18, textures && textures.billboardFlamingo ? textures.billboardFlamingo.image : null, {
    panel: [16, 4, 480, 112], title: 'FLAMINGO FM', titleSize: 56, titleY: 76,
    sub: 'NEON NIGHTS · OCEAN DRIVE', subY: 106, tag: 'PINK HORIZON · LIVE', tagY: 210, tagAlign: 'left',
  }, 0xff5ad8);

  // The ferris wheel on the beach: a glowing rim, four spokes and eight
  // coloured gondolas, a landmark on the horizon. Builder #11: it stands
  // at the end of the beachfront street, dead ahead in the cover and
  // driving frames and clear of the downtown skyline from the title
  // camera — the north beach hid it behind the towers.
  const wheel = new THREE.Group();
  // Builder #12: BIGGER and PINK — the 18-radius gold rim vanished
  // against the photographed sunset's own gold glow at the end of the
  // street, so the landmark never read in the cover. A 24-radius rim in
  // hot pink with bigger gondolas stands off the orange sky instead of
  // melting into it. Hub at y=28 (rim bottom still kisses the sand at
  // y=4); legs lengthened to match.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(24, 1.1, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xff2a6a }),
  );
  wheel.add(rim);
  // Builder #17 — an inner rim ring and EIGHT spokes (was four), so
  // the wheel reads as a wheel, not a bare circle with a cross in it.
  const innerRim = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.5, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xff5a8a }),
  );
  wheel.add(innerRim);
  const spokeMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  for (let i = 0; i < 8; i += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(48, 0.5, 0.5), spokeMat);
    spoke.rotation.z = (i * Math.PI) / 8;
    wheel.add(spoke);
  }
  // Builder #17 — REAL GONDOLA CABINS (fadli: gondola diganti total,
  // berwarna-warni + ADA KABIN 3D). Each cabin HANGS below its rim
  // point on a short arm (gravity, not glued to the rim): a round
  // coloured body, a dark glass band all the way round so the cabin
  // reads as a room with windows from any side, a white domed roof, a
  // dark skid underneath, and a door panel on each face. Eight cabins,
  // eight colours.
  const gondolaCols = [0xff5a7a, 0x37e0ff, 0xffd94a, 0x7dff9a, 0xff8a3d, 0xc93ad8, 0x2ad8c8, 0xf5f5f5];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const ax = Math.cos(a) * 24;
    const ay = Math.sin(a) * 24;
    const col = gondolaCols[i % gondolaCols.length];
    const cabin = new THREE.Group();
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 1.8, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.7, metalness: 0.5 }),
    );
    arm.position.set(ax, ay - 0.9, 0);
    cabin.add(arm);
    const cabBody = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 2.0, 12),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 }),
    );
    cabBody.position.set(ax, ay - 2.6, 0);
    cabin.add(cabBody);
    const cabGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(1.76, 1.76, 0.9, 12),
      new THREE.MeshStandardMaterial({ color: 0x18202e, roughness: 0.12, metalness: 0.75 }),
    );
    cabGlass.position.set(ax, ay - 2.4, 0);
    cabin.add(cabGlass);
    // Window mullions: four thin verticals splitting the glass band.
    for (let m = 0; m < 4; m += 1) {
      const ma = (m / 4) * Math.PI * 2 + Math.PI / 4;
      const mull = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.95, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 }),
      );
      mull.position.set(ax + Math.sin(ma) * 1.78, ay - 2.4, Math.cos(ma) * 1.78);
      cabin.add(mull);
    }
    const cabRoof = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.6 }),
    );
    cabRoof.scale.y = 0.55;
    cabRoof.position.set(ax, ay - 1.6, 0);
    cabin.add(cabRoof);
    const cabSkid = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.4, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.8 }),
    );
    cabSkid.position.set(ax, ay - 3.7, 0);
    cabin.add(cabSkid);
    for (const dz of [-1.72, 1.72]) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 1.5, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.7 }),
      );
      door.position.set(ax, ay - 2.7, dz);
      cabin.add(door);
    }
    wheel.add(cabin);
  }
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xff5a7a }),
  );
  wheel.add(hub);
  const hubRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.0, 0.35, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd94a }),
  );
  wheel.add(hubRing);
  // Builder #13 — the wheel FACES THE STREET (rotation.y = PI/2): its
  // rim used to lie in the XY plane, normal along Z, so from the chase
  // camera driving east down the beachfront street it read edge-on — a
  // thin pink arc with floating gondolas, never a wheel. Turned to face
  // west, the full circle stands at the end of the street in the cover
  // and driving frames. From the title camera (south, looking NE) it
  // still reads as a wheel (an ellipse ~40 degrees off face-on).
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(178, 28, -9);
  group.add(wheel);
  // A soft gold halo over the wheel's hub, so the landmark shimmers at
  // dusk instead of sitting flat against the sky. Builder #12: kept
  // TIGHT (54, not 70) — the old 70-wide halo washed the thin rim out
  // against the sunset whenever the wheel stood near the sun.
  const wheelGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xffd94a, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  wheelGlow.position.set(178, 28, -9);
  wheelGlow.scale.set(58, 58, 1);
  group.add(wheelGlow);
  // Builder #13: the legs splay along X now — the wheel plane turned to
  // face the street, so the A-frame must stand in the wheel's plane (east
  // / west of the hub), not across it. A leg at x=178+dx leans back toward
  // the hub by rotation.z = dx * 0.35 / 9.
  for (const dx of [-9, 9]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 31, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.7, metalness: 0.5 }),
    );
    leg.position.set(178 + dx, 15.5, -9);
    leg.rotation.z = (dx * 0.35) / 9;
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
  // Builder #17 — lamps along the diagonal avenue's north-east kerb.
  for (const lx of [-120, -72, -24, 24, 72, 120]) {
    lampPositions.push([
      DIAG_CX + (lx + 9) * 0.7071,
      DIAG_CZ + (-lx + 9) * 0.7071,
    ]);
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

  // Builder #17 — SIDEWALK PROPS (fadli: trotoar beige kosong diisi).
  // Terracotta planters with shrubs and wooden benches line the two
  // shot streets' sidewalks and the diagonal avenue. Every spot is
  // filtered: never inside a building, never on asphalt, never on a
  // crosswalk corner, never within 3.5 of a palm trunk, never on the
  // beach strip — so the furniture dresses the sidewalk instead of
  // blocking a lane, a sightline or a palm.
  const planterMat = new THREE.MeshStandardMaterial({ color: 0xb0703a, roughness: 0.9 });
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x3a8a4a, roughness: 1 });
  const shrubMat2 = new THREE.MeshStandardMaterial({ color: 0x46a854, roughness: 1 });
  const benchWood = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.85 });
  const benchIron = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.7, metalness: 0.4 });
  function propBlocked(x, z) {
    if (isOnRoad(x, z)) return true;
    if (hitsBuilding(buildings, x, z, 1.8)) return true;
    for (const [px, pz] of palmSpots) {
      if (Math.hypot(x - px, z - pz) < 3.5) return true;
    }
    return false;
  }
  function addPlanter(x, z) {
    if (propBlocked(x, z)) return;
    if (x > 118 && x < 176 && z > -14 && z < -6) return; // beach strip
    const pot = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 1.7), planterMat);
    pot.position.set(x, 0.38, z);
    group.add(pot);
    const rim2 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 1.9), planterMat);
    rim2.position.set(x, 0.8, z);
    group.add(rim2);
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), shrubMat);
    shrub.position.set(x, 1.15, z);
    group.add(shrub);
    const shrubTop = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), shrubMat2);
    shrubTop.position.set(x + 0.25, 1.6, z - 0.15);
    group.add(shrubTop);
  }
  function addBench(x, z, dir) {
    // dir +1 faces +Z (south), -1 faces -Z (north); back on the far side.
    if (propBlocked(x, z)) return;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.75), benchWood);
    seat.position.set(x, 0.55, z);
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.12), benchWood);
    back.position.set(x, 1.0, z - dir * 0.35);
    group.add(back);
    for (const dx of [-1.0, 1.0]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.6), benchIron);
      leg.position.set(x + dx, 0.28, z);
      group.add(leg);
    }
  }
  for (const x of [-106, -4, 64, 122, 140]) addPlanter(x, -15.4);
  for (const x of [-106, -4, 64, 98, 132, 166]) addPlanter(x, 32.6);
  for (const x of [-106, -4, 64, 122, 140]) addBench(x, -32.6, 1);
  for (const x of [-106, -38, -4, 64, 98, 132, 166]) addBench(x, 15.4, -1);
  for (const lx of [-110, -58, -6, 46, 98]) {
    addPlanter(DIAG_CX + (lx - 10.5) * 0.7071, DIAG_CZ + (-lx - 10.5) * 0.7071);
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
