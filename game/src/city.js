// The city of Vice Shores: a grid of blocks between six streets on each axis,
// a beach and an ocean to the east, docks to the south-west and the Hideout
// to the north-east. Everything is built from boxes and planes with the
// theme's palette — no model files, no textures. The builder is seeded, so
// the same seed always raises the same skyline, which is what makes the
// screenshots repeatable. It hands back the building boxes the world uses
// for collision, plus the small road test every driver in the game shares.
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

  // Roads: one dark strip per street, both axes, plus pale sidewalk edging
  // in a sandy tone so the streets read against the blocks at golden hour.
  // The asphalt is a little wet-looking — low roughness, so the low sun
  // throws a specular streak down the east streets instead of a flat matte.
  const roadMat = new THREE.MeshStandardMaterial({ color: palette.roadTint, roughness: 0.4, metalness: 0.1 });
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

  // Centre dashes down every street, so the roads read as roads — a bright
  // yellow centre line on dark asphalt, like the beach-city boulevards.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffc93a });
  const dashGeo = new THREE.PlaneGeometry(5, 0.7);
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
  const edgeGeo = new THREE.PlaneGeometry(440, 0.35);
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
  for (const sz of [29, -29]) {
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
      if ((s === 29 || s === -29) && along > 20 && along < 80) continue;
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
  const windowPositions = [];
  let neonCount = 0;
  for (const cx of BLOCK_CENTRES) {
    for (const cz of BLOCK_CENTRES) {
      if (cx > 150) continue;
      const distCentre = Math.hypot(cx, cz) / 220;
      const isShopRow = cx >= 116;
      const count = isShopRow ? 2 : (chance(rng, 0.55) ? 2 : 1);
      const slots = count === 2
        ? [[-11, -11], [11, 11]]
        : [[0, 0]];
      for (const [ox, oz] of slots) {
        const w = isShopRow ? range(rng, 12, 16) : range(rng, 14, 20);
        const d = isShopRow ? range(rng, 12, 16) : range(rng, 14, 20);
        const h = isShopRow
          ? range(rng, 5, 11)
          : range(rng, 7, 26) * (1.35 - distCentre * 0.7);
        const bx = cx + ox;
        const bz = cz + oz;
        const mat = isShopRow
          ? shopRoofMats[Math.floor(hash2(bx, bz) * shopRoofMats.length) % shopRoofMats.length]
          : pick(rng, tintMats);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(bx, h / 2, bz);
        group.add(tower);
        const roof = new THREE.Mesh(
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
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.7, d + 0.7), accent);
        cap.position.set(bx, h + 0.7, bz);
        group.add(cap);
        // A stepped crown on tall towers: a smaller box set back on the
        // roof, in a contrasting tint, so the skyline steps instead of
        // ending in a flat slab.
        if (!isShopRow && h > 17) {
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
              new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.9 }),
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
        const floors = isShopRow ? 1 : Math.max(1, Math.floor(h / 3.2));
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
  const winGeo = new THREE.PlaneGeometry(1.5, 1.2);
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

  // The beach: a bright sand strip, then the ocean, both east of the last street.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.waterX - CITY.beachX + 40, 440),
    new THREE.MeshStandardMaterial({ color: palette.sandTint ?? 0xc9b078, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((CITY.beachX + CITY.waterX) / 2 + 8, 0.03, 0);
  group.add(sand);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: palette.oceanTint ?? 0x1a5a8a, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94,
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
  // Beachgoers: a few static figures on the sand (visual only, never in
  // traffic, never colliding), so the beach reads lived-in from the road.
  const beachShirts = [0xff5a7a, 0x37e0ff, 0xffd94a, 0x7dff9a, 0xff8a3d];
  for (let i = 0; i < 8; i += 1) {
    const bz2 = -170 + i * 46 + hash2(i * 11, 2) * 10;
    const bx2 = CITY.beachX + 10 + Math.sin(bz2 * 0.03) * 6 + hash2(i * 4, 9) * 8;
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
  for (let i = 0; i < 14; i += 1) {
    const pz = -190 + i * 29 + range(rng, -4, 4);
    const px = CITY.beachX + 6 + range(rng, 0, 8);
    spotPalm(px, pz, 0.12);
  }
  for (let i = 0; i < 13; i += 1) {
    spotPalm(158, -174 + i * 29, i % 2 === 0 ? 0.1 : -0.1);
  }
  for (let i = 0; i < 7; i += 1) {
    spotPalm(-168 + i * 52, 156, 0.08);
  }
  const streetPalms = [];
  for (let z = -160; z <= 160; z += 32) {
    if (CITY.streets.some((s) => Math.abs(z - s) < 7)) continue;
    streetPalms.push([136.4, z], [153.6, z]);
  }
  for (const street of [29, -29]) {
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

  // Beach umbrellas: bright cones on poles, spaced down the sand in two
  // rows on a gentle arc that follows the curved shoreline — none planted
  // under the ferris wheel, which owns its own patch.
  const umbrellaCols = [0xff5a7a, 0x37e0ff, 0xffd94a, 0x7dff9a, 0xff8a3d];
  for (let i = 0; i < 14; i += 1) {
    const uz = -168 + i * 24;
    if (Math.abs(uz - -95) < 26 || Math.abs(uz + 12 - -95) < 26) continue;
    const ux = CITY.beachX + 14 + ((i * 7) % 10) + Math.sin(uz * 0.03) * 6;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 }),
    );
    pole.position.set(ux, 1.3, uz);
    group.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1.1, 10),
      new THREE.MeshStandardMaterial({ color: umbrellaCols[i % umbrellaCols.length], roughness: 0.8 }),
    );
    top.position.set(ux, 3.0, uz);
    group.add(top);
    if (i % 2 === 0) {
      const pole2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 }),
      );
      pole2.position.set(CITY.beachX + 22, 1.3, uz + 12);
      group.add(pole2);
      const top2 = new THREE.Mesh(
        new THREE.ConeGeometry(2.2, 1.1, 10),
        new THREE.MeshStandardMaterial({ color: umbrellaCols[(i + 2) % umbrellaCols.length], roughness: 0.8 }),
      );
      top2.position.set(CITY.beachX + 22, 3.0, uz + 12);
      group.add(top2);
    }
  }
  // Beach towels: small bright rectangles on the sand between the umbrellas.
  const towelCols = [0xff5a7a, 0x37e0ff, 0xffd94a, 0x7dff9a];
  for (let i = 0; i < 6; i += 1) {
    const towel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.4),
      new THREE.MeshBasicMaterial({ color: towelCols[i % towelCols.length] }),
    );
    towel.rotation.x = -Math.PI / 2;
    towel.rotation.z = hash2(i * 13, 7) * 1.2;
    towel.position.set(CITY.beachX + 8 + (i % 3) * 5, 0.05, -140 + i * 52);
    group.add(towel);
  }

  // The big neon billboard on the beachfront, facing the city: a canvas
  // texture painted at boot (gradient sky, pink neon letters, tagline), on
  // two poles over the promenade. Original art, drawn by the game itself.
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 512;
  boardCanvas.height = 224;
  const bctx = boardCanvas.getContext('2d');
  const bgrad = bctx.createLinearGradient(0, 0, 0, 224);
  bgrad.addColorStop(0, '#1a0533');
  bgrad.addColorStop(0.5, '#ff2a6a');
  bgrad.addColorStop(1, '#ffb347');
  bctx.fillStyle = bgrad;
  bctx.fillRect(0, 0, 512, 224);
  bctx.strokeStyle = '#ffd94a';
  bctx.lineWidth = 12;
  bctx.strokeRect(8, 8, 496, 208);
  bctx.shadowColor = '#ff2a6a';
  bctx.shadowBlur = 18;
  bctx.fillStyle = '#ffffff';
  bctx.font = '900 68px Arial, sans-serif';
  bctx.textAlign = 'center';
  bctx.fillText('VICE SHORES', 256, 104);
  bctx.fillStyle = '#ffe9a0';
  bctx.font = '700 34px Arial, sans-serif';
  bctx.fillText('RIDE THE SUNSET', 256, 164);
  bctx.fillStyle = '#ffd94a';
  bctx.font = '700 22px Arial, sans-serif';
  bctx.fillText('PALMS · NEON · NO SPEED LIMIT', 256, 200);
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const boardPoleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.7, metalness: 0.5 });
  for (const dz of [-10, 10]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 12.5, 8), boardPoleMat);
    pole.position.set(164, 6.25, -58 + dz);
    group.add(pole);
  }
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 12, 28),
    new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }),
  );
  board.position.set(164, 17, -58);
  group.add(board);
  // The billboard glows: a pink additive halo sprite floating just in
  // front of the board, and one real pink point light spilling neon onto
  // the promenade palms and sand, so the board reads as a light source,
  // not a painted panel. (Physical light units: intensity 80 at decay 1.6
  // throws a visible wash out to ~30 units.)
  const boardGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xff5a7a, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  boardGlow.position.set(162.5, 17, -58);
  boardGlow.scale.set(80, 60, 1);
  group.add(boardGlow);
  const boardLight = new THREE.PointLight(0xff5a7a, 80, 80, 1.6);
  boardLight.position.set(160, 16, -58);
  group.add(boardLight);

  // The ferris wheel on the beach: a glowing rim, four spokes and eight
  // coloured gondolas, a landmark on the horizon. It stands north of the
  // billboard now, clear of it in the driving frames, close enough to the
  // beachfront streets to read instead of being lost at the far north end
  // of the sand.
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
  wheel.position.set(186, 22, -95);
  group.add(wheel);
  // A soft gold halo over the wheel's hub, so the landmark shimmers at
  // dusk instead of sitting flat against the sky.
  const wheelGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xffd94a, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  wheelGlow.position.set(186, 22, -95);
  wheelGlow.scale.set(70, 70, 1);
  group.add(wheelGlow);
  for (const dz of [-9, 9]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 23, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.7, metalness: 0.5 }),
    );
    leg.position.set(186, 11.5, -95 + dz);
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
    new THREE.MeshStandardMaterial({ color: 0x4a8a6a, roughness: 0.85 }),
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
