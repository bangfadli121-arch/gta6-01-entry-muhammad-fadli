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

// Lengths by kind: a truck is long, a sports car low and short.
const KIND_SIZE = {
  sedan: { length: 4.4, width: 2.0, height: 0.62, cabin: 0.55 },
  coupe: { length: 4.1, width: 1.9, height: 0.55, cabin: 0.5 },
  sports: { length: 4.3, width: 2.0, height: 0.48, cabin: 0.42 },
  taxi: { length: 4.4, width: 2.0, height: 0.62, cabin: 0.55 },
  van: { length: 5.2, width: 2.1, height: 1.05, cabin: 0.9 },
  truck: { length: 6.4, width: 2.3, height: 1.0, cabin: 0.85 },
  police: { length: 4.5, width: 2.0, height: 0.62, cabin: 0.55 },
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
  const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14);
  const mat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.9, metalness: 0.1 });
  const wheel = new THREE.Mesh(geo, mat);
  wheel.rotation.x = Math.PI / 2;
  // A hub cap so the wheel reads at a distance.
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.3, 10),
    new THREE.MeshStandardMaterial({ color: 0x9a9aa8, roughness: 0.35, metalness: 0.8 }),
  );
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  return wheel;
}

/**
 * Build a car's mesh. `kind` picks the proportions, `color` the paint.
 * Returns { group, wheels, brakeMat, headMat, barRed, barBlue, kind }.
 * The group sits at y=0 with its nose toward +X.
 */
export function createCarMesh(kind, color) {
  const size = KIND_SIZE[kind] || KIND_SIZE.sedan;
  const group = new THREE.Group();
  const paint = kind === 'police' ? 0x1a1a22 : color;
  const body = box(size.length, size.height, size.width, paint);
  body.position.y = 0.55;
  group.add(body);

  // Cabin: set back a little, narrower, with dark glass.
  const cabin = box(size.length * 0.48, size.cabin, size.width * 0.86, 0x101018);
  cabin.material = new THREE.MeshStandardMaterial({
    color: 0x101018, roughness: 0.15, metalness: 0.7,
  });
  cabin.position.set(-size.length * 0.06, 0.55 + size.height / 2 + size.cabin / 2 - 0.05, 0);
  group.add(cabin);

  // A taxi sign, a truck bed, or a police light bar on the roof.
  let barRed = null;
  let barBlue = null;
  if (kind === 'taxi') {
    const sign = box(0.7, 0.18, 0.5, 0xffd94a, 0xffd94a, 0.7);
    sign.position.set(0, 0.55 + size.height / 2 + size.cabin + 0.08, 0);
    group.add(sign);
  } else if (kind === 'truck') {
    const bed = box(size.length * 0.42, 0.5, size.width * 0.92, 0x3a3a44);
    bed.position.set(-size.length * 0.24, 0.55 + size.height / 2 + 0.25, 0);
    group.add(bed);
  } else if (kind === 'police') {
    const barBase = box(0.9, 0.12, 0.5, 0x111116);
    barBase.position.set(0, 0.55 + size.height / 2 + size.cabin + 0.05, 0);
    group.add(barBase);
    barRed = box(0.36, 0.16, 0.4, 0x881111, 0xff2020, 1.6);
    barRed.position.set(0, 0.55 + size.height / 2 + size.cabin + 0.14, -0.22);
    group.add(barRed);
    barBlue = box(0.36, 0.16, 0.4, 0x111188, 0x2040ff, 1.6);
    barBlue.position.set(0, 0.55 + size.height / 2 + size.cabin + 0.14, 0.22);
    group.add(barBlue);
    // White doors: a thin bright stripe down each side.
    const stripe = box(size.length * 0.9, 0.22, size.width + 0.02, 0xe8e8e8);
    stripe.position.y = 0.55;
    group.add(stripe);
  }

  // Headlights (warm white, emissive) and tail lights (red, emissive).
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.9,
  });
  const headGeo = new THREE.BoxGeometry(0.08, 0.18, 0.34);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(headGeo, headMat);
    lamp.position.set(size.length / 2, 0.55, side * (size.width / 2 - 0.3));
    group.add(lamp);
  }
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0x881111, emissive: 0xff2020, emissiveIntensity: 0.25,
  });
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

  return { group, wheels, brakeMat, headMat, barRed, barBlue, kind };
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
