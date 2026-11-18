// Cars for Vice Shores: every vehicle is built from boxes, cylinders and
// emissive lights — no model files, no textures. A car record is plain data
// ({x, z, heading, speed, kind, color, ...}) and its mesh is a small object
// holding the THREE group plus the parts that move: the four wheels, the
// brake lights and, for police cars, the red/blue light bar. syncCarMesh is
// the only place where a record's numbers become a pose, so the traffic,
// police and screenshot code all share one way of parking a car.
//
// Heading convention (shared by the whole game): heading 0 faces +X, and the
// group is rotated by -heading around Y, because three.js looks down -Z.

import * as THREE from 'three';

export const CAR_KINDS = ['sedan', 'coupe', 'sports', 'taxi', 'van', 'truck', 'police'];

export const CAR_COLORS = [
  0xff2a6a, 0xe83a3a, 0xffd94a, 0x2ad8c8, 0x2a6fd8, 0x7dff5a,
  0xff8a3d, 0xc93ad8, 0xf5f5f5, 0x3ad8ff, 0xff9e2a, 0x9a3ad8,
];

// Lengths by kind: a truck is long, a sports car low and short. Builder #9:
// bodies sit lower and slimmer, so the cars read sleek instead of boxy.
const KIND_SIZE = {
  sedan: { length: 4.4, width: 1.9, height: 0.55, cabin: 0.5 },
  coupe: { length: 4.1, width: 1.85, height: 0.48, cabin: 0.45 },
  sports: { length: 4.3, width: 1.9, height: 0.42, cabin: 0.38 },
  taxi: { length: 4.4, width: 1.9, height: 0.55, cabin: 0.5 },
  van: { length: 5.2, width: 2.1, height: 1.05, cabin: 0.9 },
  truck: { length: 6.4, width: 2.3, height: 1.0, cabin: 0.85 },
  police: { length: 4.5, width: 1.95, height: 0.55, cabin: 0.5 },
};

function box(w, h, d, color, emissive = 0, emissiveIntensity = 0) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.32,
    metalness: 0.65,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  return mesh;
}

function wheelMesh() {
  const geo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16);
  const mat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.9, metalness: 0.1 });
  const wheel = new THREE.Mesh(geo, mat);
  wheel.rotation.x = Math.PI / 2;
  // A silver rim disc with a dark hub, so the wheel reads as a wheel
  // with spokes at a distance instead of a black doughnut.
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.32, 10),
    new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 0.3, metalness: 0.85 }),
  );
  rim.rotation.x = Math.PI / 2;
  wheel.add(rim);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.34, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.5, metalness: 0.6 }),
  );
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  // Two spoke bars across the rim face, for the alloy look.
  for (const a of [0, Math.PI / 2]) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.07, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 0.35, metalness: 0.8 }),
    );
    spoke.position.set(0, 0, 0.17);
    spoke.rotation.z = a;
    wheel.add(spoke);
  }
  return wheel;
}

/** One shared radial-gradient texture for the police light-bar glows. */
let lightGlowTexture = null;
function makeLightGlowTexture() {
  if (lightGlowTexture) return lightGlowTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  lightGlowTexture = new THREE.CanvasTexture(c);
  return lightGlowTexture;
}

/** An additive glow sprite in `color`, parked at (x, y, z) on the car. */
function makeLightGlow(color, x, y, z) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeLightGlowTexture(), color, transparent: true, opacity: 0.08,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  sprite.position.set(x, y, z);
  sprite.scale.set(3.4, 3.4, 1);
  return sprite;
}

/**
 * Build a car's mesh. `kind` picks the proportions, `color` the paint.
 * Returns { group, wheels, brakeMat, headMat, barRed, barBlue, kind }.
 * The group sits at y=0 with its nose toward +X.
 *
 * Builder #17 — TOTAL REBUILD (fadli: ganti mobil total, bikin lebih
 * keren dan detail, bukan kotak polos). A car is now a real shape, not
 * one body box + one cabin box: a low chassis with dark side skirts, a
 * sloped hood and a sloped trunk deck, a separate sloped windshield and
 * rear glass, a side-glass band with chrome window trim, a dark grille
 * with chrome slats, bumpers with fog lamps, side mirrors on stalks,
 * door seams + handles, twin exhaust tips and a full-width tail bar.
 * The hero 'sports' is a CONVERTIBLE (Costa Solis): no roof, an open
 * cockpit with two seats + headrests and a roll bar, a windshield frame
 * and a big rear spoiler — the pink hero reads as a convertible from
 * the chase camera's three-quarter rear view. Police keep the
 * black-and-white two-tone + light bar, and gain a front push bar, a
 * black roof panel and white doors. The van gets a side-window row and
 * the truck a cab + flatbed with cargo crates.
 */
export function createCarMesh(kind, color) {
  const size = KIND_SIZE[kind] || KIND_SIZE.sedan;
  const group = new THREE.Group();
  const paint = kind === 'police' ? 0xf0f0f0 : color;
  const L = size.length;
  const W = size.width;
  const H = size.height;
  const paintMat = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.28, metalness: 0.65 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18202e, roughness: 0.12, metalness: 0.75 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.9 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.25, metalness: 0.9 });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); group.add(mesh); return mesh; };

  // Low chassis: the main body slab, plus a dark under-skirt so the car
  // sits low and sleek instead of floating on a tall box.
  const body = box(L, H, W, paint);
  body.material = paintMat;
  add(body, 0, 0.55, 0);
  const skirt = box(L * 0.82, 0.14, W + 0.06, 0x14141a);
  skirt.material = darkMat;
  add(skirt, 0, 0.28, 0);
  // Sloped hood (front) and sloped trunk deck (rear): the nose and tail
  // taper instead of ending in flat walls.
  const hood = box(1.05, H * 0.5, W * 0.94, paint);
  hood.material = paintMat;
  hood.position.set(L / 2 - 0.15, 0.55 + H * 0.12, 0);
  hood.rotation.z = -0.18;
  group.add(hood);
  const deck = box(0.95, H * 0.5, W * 0.94, paint);
  deck.material = paintMat;
  deck.position.set(-L / 2 + 0.15, 0.55 + H * 0.12, 0);
  deck.rotation.z = 0.16;
  group.add(deck);

  if (kind === 'sports') {
    // CONVERTIBLE hero: no roof. An open cockpit tub in BODY COLOUR
    // with two black seats + headrests inside it, a roll bar behind
    // them, a windshield frame on stalks, and a rear deck with a big
    // spoiler — the car reads open-top from every angle, and the pink
    // paint + spoiler read from behind. (Builder #17 fix: the first
    // pass built the tub BLACK, so tub + seats + windshield merged
    // into one black slab from the chase camera — the tub is body
    // colour now, the seats stand proud of it, and the windshield is
    // lighter blue glass in a chrome frame.)
    const tub = box(L * 0.42, 0.26, W * 0.8, paint);
    tub.material = paintMat;
    add(tub, -0.1, 0.55 + H / 2 + 0.08, 0);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x22222e, roughness: 0.85 });
    for (const dz of [-0.42, 0.42]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.62), seatMat);
      add(seat, -0.35, 0.55 + H / 2 + 0.36, dz);
      const rest = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.5), seatMat);
      add(rest, -0.62, 0.55 + H / 2 + 0.66, dz);
    }
    // Roll bar: a chrome hoop behind the seats.
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 16, Math.PI), chromeMat);
    hoop.position.set(-0.75, 0.55 + H / 2 + 0.3, 0);
    hoop.rotation.y = Math.PI / 2;
    group.add(hoop);
    // Windshield: a raked pane of LIGHTER blue glass in a frame, on
    // two stalks — a windshield, not a black wall.
    const sportGlass = new THREE.MeshStandardMaterial({ color: 0x35586e, roughness: 0.08, metalness: 0.6 });
    const shield = box(0.1, 0.62, W * 0.84, 0x35586e);
    shield.material = sportGlass;
    shield.position.set(0.95, 0.55 + H / 2 + 0.42, 0);
    shield.rotation.z = -0.38;
    group.add(shield);
    const frameTop = box(0.12, 0.08, W * 0.86, 0x14141a);
    frameTop.material = darkMat;
    frameTop.position.set(1.08, 0.55 + H / 2 + 0.72, 0);
    frameTop.rotation.z = -0.38;
    group.add(frameTop);
    for (const side of [-1, 1]) {
      const post = box(0.08, 0.66, 0.08, 0x14141a);
      post.material = darkMat;
      post.position.set(0.98, 0.55 + H / 2 + 0.42, side * (W * 0.42));
      post.rotation.z = -0.38;
      group.add(post);
    }
    // Hood scoop, low and wide.
    const scoop = box(0.7, 0.12, 0.9, paint);
    scoop.material = paintMat;
    add(scoop, 1.35, 0.55 + H / 2 + 0.28, 0);
    // Black tonneau over the rear deck behind the seats, so the pink
    // does not run as one flat table from the cockpit to the tail.
    const tonneau = box(0.9, 0.06, W * 0.72, 0x1a1a22);
    tonneau.material = darkMat;
    add(tonneau, -L * 0.34, 0.55 + H / 2 + 0.03, 0);
  } else if (kind === 'van' || kind === 'truck') {
    // Tall cabin: a raked windshield + a side-glass band, or a truck cab
    // + flatbed with crates.
    const shield = box(0.1, size.cabin * 0.9, W * 0.84, 0x18202e);
    shield.material = glassMat;
    shield.position.set(L / 2 - 0.55, 0.55 + H / 2 + size.cabin * 0.32, 0);
    shield.rotation.z = -0.3;
    group.add(shield);
    if (kind === 'van') {
      const sideGlass = box(L * 0.52, size.cabin * 0.5, W * 0.88, 0x18202e);
      sideGlass.material = glassMat;
      add(sideGlass, -0.3, 0.55 + H / 2 + size.cabin * 0.55, 0);
      // Window dividers: two chrome pillars splitting the side glass.
      for (const dx of [-0.85, 0.25]) {
        const pillar = box(0.09, size.cabin * 0.52, W * 0.9, 0xd8d8e0);
        pillar.material = chromeMat;
        add(pillar, dx, 0.55 + H / 2 + size.cabin * 0.55, 0);
      }
    } else {
      // Truck bed: low walls + two cargo crates, open-topped.
      const bedWall = box(L * 0.4, 0.42, W * 0.9, 0x3a3a44);
      bedWall.material = darkMat;
      add(bedWall, -L * 0.24, 0.55 + H / 2 + 0.2, 0);
      const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 });
      for (const [cx, cz] of [[-1.5, -0.4], [-0.7, 0.45]]) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.8), crateMat);
        add(crate, cx, 0.55 + H / 2 + 0.55, cz);
      }
    }
  } else {
    // Closed cars: a raked windshield, a raked rear glass, and a side
    // glass band with a chrome waistline trim — the roofline slopes
    // instead of standing square.
    const shield = box(0.1, size.cabin * 0.95, W * 0.82, 0x18202e);
    shield.material = glassMat;
    shield.position.set(L * 0.22, 0.55 + H / 2 + size.cabin * 0.3, 0);
    shield.rotation.z = -0.42;
    group.add(shield);
    const rearGlass = box(0.1, size.cabin * 0.9, W * 0.82, 0x18202e);
    rearGlass.material = glassMat;
    rearGlass.position.set(-L * 0.26, 0.55 + H / 2 + size.cabin * 0.3, 0);
    rearGlass.rotation.z = 0.4;
    group.add(rearGlass);
    const sideGlass = box(L * 0.4, size.cabin * 0.72, W * 0.86, 0x18202e);
    sideGlass.material = glassMat;
    add(sideGlass, -0.05, 0.55 + H / 2 + size.cabin * 0.52, 0);
    // Roof panel over the glass band, narrower than the body.
    const roof = box(L * 0.44, 0.1, W * 0.8, paint);
    roof.material = paintMat;
    add(roof, -0.05, 0.55 + H / 2 + size.cabin + 0.02, 0);
    // Chrome waistline trim along both flanks.
    for (const side of [-1, 1]) {
      const trim = box(L * 0.86, 0.05, 0.05, 0xd8d8e0);
      trim.material = chromeMat;
      add(trim, 0, 0.55 + H / 2 + 0.06, side * (W / 2 + 0.01));
    }
  }

  // Grille: a dark recessed panel with two chrome slats, so the car has
  // a face; bumpers front and rear with fog lamps up front.
  const grille = box(0.1, 0.3, W * 0.62, 0x14141a);
  grille.material = darkMat;
  add(grille, L / 2 + 0.42, 0.52, 0);
  for (const dy of [-0.07, 0.07]) {
    const slat = box(0.06, 0.05, W * 0.56, 0xd8d8e0);
    slat.material = chromeMat;
    add(slat, L / 2 + 0.48, 0.52 + dy, 0);
  }
  const bumperF = box(0.14, 0.2, W * 0.96, 0xd8d8e0);
  bumperF.material = chromeMat;
  add(bumperF, L / 2 + 0.5, 0.38, 0);
  const bumperR = box(0.14, 0.2, W * 0.96, 0xd8d8e0);
  bumperR.material = chromeMat;
  add(bumperR, -L / 2 - 0.5, 0.38, 0);
  // Side mirrors on short stalks, both flanks.
  for (const side of [-1, 1]) {
    const stalk = box(0.08, 0.06, 0.22, 0x14141a);
    stalk.material = darkMat;
    add(stalk, L * 0.22, 0.55 + H / 2 + 0.28, side * (W / 2 + 0.1));
    const mirror = box(0.16, 0.18, 0.1, paint);
    mirror.material = paintMat;
    add(mirror, L * 0.22, 0.55 + H / 2 + 0.3, side * (W / 2 + 0.22));
  }
  // Door seams + handles: thin dark verticals and small chrome pulls.
  if (kind !== 'van' && kind !== 'truck') {
    for (const side of [-1, 1]) {
      for (const dx of [-0.55, 0.75]) {
        const seam = box(0.04, H * 0.8, 0.04, 0x14141a);
        seam.material = darkMat;
        add(seam, dx, 0.55, side * (W / 2 + 0.01));
      }
      const handle = box(0.3, 0.05, 0.05, 0xd8d8e0);
      handle.material = chromeMat;
      add(handle, 0.1, 0.55 + H / 2 - 0.05, side * (W / 2 + 0.02));
    }
  }
  // Twin exhaust tips at the rear, low.
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.22, 8),
      chromeMat,
    );
    tip.rotation.z = Math.PI / 2;
    add(tip, -L / 2 - 0.55, 0.32, side * 0.45);
  }

  // A rear spoiler on the sporty kinds, on two small struts — sized
  // as a wing (0.38 deep), not a table: the first #17 pass built it
  // 0.5 deep and full-width, and from the chase camera it read as a
  // pink slab floating over the rear deck.
  if (kind === 'sports' || kind === 'coupe') {
    const spoiler = box(0.38, 0.06, W * 0.8, paint);
    spoiler.material = paintMat;
    spoiler.position.set(-L / 2 - 0.12, 0.55 + H / 2 + 0.38, 0);
    group.add(spoiler);
    for (const dz of [-W * 0.28, W * 0.28]) {
      const strut = box(0.07, 0.32, 0.07, 0x14141a);
      strut.material = darkMat;
      strut.position.set(-L / 2 - 0.12, 0.55 + H / 2 + 0.2, dz);
      group.add(strut);
    }
  }

  // A taxi sign or a police light bar on the roof (the truck's bed and
  // crates are built in the cabin branch above).
  let barRed = null;
  let barBlue = null;
  let glowRed = null;
  let glowBlue = null;
  if (kind === 'taxi') {
    const sign = box(0.7, 0.18, 0.5, 0xffd94a, 0xffd94a, 0.7);
    sign.position.set(0, 0.55 + size.height / 2 + size.cabin + 0.08, 0);
    group.add(sign);
  } else if (kind === 'police') {
    const barBase = box(0.9, 0.12, 0.5, 0x111116);
    barBase.position.set(0, 0.55 + size.height / 2 + size.cabin + 0.05, 0);
    group.add(barBase);
    // Builder #13 — a BIGGER bar (0.44 wide, was 0.36): from twenty units
    // the old bar was a couple of pixels and the chase read as plain
    // black cars. Each half also carries an additive glow sprite, so the
    // flashing bar throws light you can see at chase distance, in play
    // and in the cover frame.
    barRed = box(0.44, 0.2, 0.4, 0x881111, 0xff2020, 1.6);
    barRed.position.set(0, 0.55 + size.height / 2 + size.cabin + 0.14, -0.22);
    group.add(barRed);
    barBlue = box(0.44, 0.2, 0.4, 0x111188, 0x2040ff, 1.6);
    barBlue.position.set(0, 0.55 + size.height / 2 + size.cabin + 0.14, 0.22);
    group.add(barBlue);
    const barY = 0.55 + size.height / 2 + size.cabin + 0.3;
    glowRed = makeLightGlow(0xff2020, 0, barY + 0.15, -0.22);
    glowBlue = makeLightGlow(0x2040ff, 0, barY + 0.15, 0.22);
    group.add(glowRed);
    group.add(glowBlue);
    // Black doors and a black hood on the white body: the two-tone
    // black-and-white that reads as a police car at chase distance,
    // instead of a black slab lost against dark asphalt.
    const stripe = box(size.length * 0.9, 0.3, size.width + 0.02, 0x1a1a22);
    stripe.position.y = 0.55;
    group.add(stripe);
    const hood = box(1.1, 0.06, size.width * 0.8, 0x1a1a22);
    hood.position.set(size.length / 2 - 0.5, 0.55 + size.height / 2 + 0.02, 0);
    group.add(hood);
    // Builder #17 — a black roof panel and a front PUSH BAR (two
    // uprights + a crossbar ahead of the bumper), so the unit reads as
    // an interceptor from the front, not a white sedan with a bar.
    const roofPanel = box(size.length * 0.4, 0.06, size.width * 0.78, 0x1a1a22);
    roofPanel.position.set(-0.05, 0.55 + size.height / 2 + size.cabin + 0.08, 0);
    group.add(roofPanel);
    const pushMat = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.5, metalness: 0.7 });
    for (const dz of [-0.6, 0.6]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), pushMat);
      upright.position.set(size.length / 2 + 0.62, 0.5, dz);
      group.add(upright);
    }
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.4), pushMat);
    crossbar.position.set(size.length / 2 + 0.62, 0.68, 0);
    group.add(crossbar);
  }

  // Headlights (warm white, emissive, bigger than before) with small fog
  // lamps below, and a FULL-WIDTH tail bar (brakeMat) plus corner lamps.
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.9,
  });
  const headGeo = new THREE.BoxGeometry(0.08, 0.22, 0.4);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(headGeo, headMat);
    lamp.position.set(size.length / 2 + 0.42, 0.58, side * (size.width / 2 - 0.32));
    group.add(lamp);
    const fog = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.26), headMat);
    fog.position.set(size.length / 2 + 0.5, 0.34, side * (size.width / 2 - 0.55));
    group.add(fog);
  }
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0x881111, emissive: 0xff2020, emissiveIntensity: 0.25,
  });
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, size.width * 0.88), brakeMat);
  tailBar.position.set(-size.length / 2 - 0.44, 0.58, 0);
  group.add(tailBar);
  const tailGeo = new THREE.BoxGeometry(0.08, 0.18, 0.34);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(tailGeo, brakeMat);
    lamp.position.set(-size.length / 2, 0.55, side * (size.width / 2 - 0.3));
    group.add(lamp);
  }

  // Wheels: front pair steers visually, all four spin with speed.
  const wheels = [];
  const wx = size.length / 2 - 0.85;
  const wz = size.width / 2 - 0.05;
  for (const [x, z] of [[wx, wz], [wx, -wz], [-wx, wz], [-wx, -wz]]) {
    const wheel = wheelMesh();
    wheel.position.set(x, 0.36, z);
    group.add(wheel);
    wheels.push(wheel);
  }

  return { group, wheels, brakeMat, headMat, barRed, barBlue, glowRed, glowBlue, kind };
}

/**
 * Pose a car mesh from its record. `car` carries x, z, heading, speed and
 * the optional flags braking (tail lights flare), flash (0..1, police bar)
 * and steer (front-wheel angle). dt is the frame step; a dt of 0 still
 * parks the car exactly, which is what the screenshot staging relies on.
 */
export function syncCarMesh(mesh, car, dt) {
  if (!mesh || !mesh.group) return;
  mesh.group.position.set(car.x, 0, car.z);
  mesh.group.rotation.y = -car.heading;
  // Lean into corners and squat under braking, a little, for feel.
  const steer = car.steer || 0;
  const targetRoll = -steer * Math.min(0.1, Math.abs(car.speed || 0) * 0.004);
  mesh.group.rotation.z += (targetRoll - mesh.group.rotation.z) * Math.min(1, 8 * (dt || 0.016));
  // Wheels spin with road speed; the fronts also turn with the steering.
  const spin = (car.speed || 0) * (dt || 0.016) / 0.36;
  mesh.wheels.forEach((wheel, i) => {
    wheel.rotation.z += spin;
    if (i < 2) wheel.rotation.y = -steer * 0.45;
  });
  if (mesh.brakeMat) {
    mesh.brakeMat.emissiveIntensity = car.braking ? 2.2 : 0.25;
  }
  if (mesh.barRed && mesh.barBlue) {
    const on = (car.flash || 0) > 0.5;
    mesh.barRed.material.emissiveIntensity = on ? 3.2 : 0.25;
    mesh.barBlue.material.emissiveIntensity = on ? 0.25 : 3.2;
  }
  // Builder #13: the glow sprites alternate with the bar — the lit side
  // throws a red or blue halo, the dark side nearly vanishes.
  if (mesh.glowRed && mesh.glowBlue) {
    const on = (car.flash || 0) > 0.5;
    mesh.glowRed.material.opacity = on ? 0.95 : 0.06;
    mesh.glowBlue.material.opacity = on ? 0.06 : 0.95;
  }
}

/** A plain data record for a car: position, heading, speed and identity. */
export function makeCarRecord(kind, color, x, z, heading) {
  return {
    kind, color, x, z, heading, speed: 0, steer: 0,
    braking: false, flash: 0, own: false, driver: null,
    mesh: null, length: (KIND_SIZE[kind] || KIND_SIZE.sedan).length,
  };
}

/**
 * A walker mesh: a capsule-ish person from a cylinder body, a sphere head
 * and two swinging leg boxes. Traffic owns the walk cycle; this just builds
 * the figure and hands back the parts that move.
 */
export function createWalkerMesh(shirt, pants) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.85, 10), bodyMat);
  body.position.y = 0.95;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.7 }),
  );
  head.position.y = 1.6;
  group.add(head);
  const legMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), legMat);
    leg.position.set(0, 0.3, side * 0.13);
    leg.geometry.translate(0, -0.2, 0);
    leg.position.y = 0.55;
    group.add(leg);
    legs.push(leg);
  }
  return { group, legs, head };
}

/** Pose a walker: position, facing and a leg swing from the walk phase. */
export function syncWalkerMesh(mesh, x, z, heading, phase) {
  if (!mesh || !mesh.group) return;
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = -heading;
  const swing = Math.sin(phase) * 0.5;
  if (mesh.legs && mesh.legs.length === 2) {
    mesh.legs[0].rotation.x = swing;
    mesh.legs[1].rotation.x = -swing;
  }
}
