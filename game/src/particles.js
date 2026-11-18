// Particles: one THREE.Points pool for dust, smoke, sparks and skid puffs.
// Spawning writes into preallocated buffers; nothing allocates per frame.
import * as THREE from 'three';

const MAX = 240;

export function createParticles(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const pool = [];
  for (let i = 0; i < MAX; i += 1) pool.push({ life: 0, maxLife: 1, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });
  let cursor = 0;

  function spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.maxLife = life;
    p.r = r; p.g = g; p.b = b;
  }

  function burst(x, y, z, count, color, speed, life) {
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + 0.7;
      const s = speed * (0.4 + ((i * 37) % 10) / 14);
      spawn(x, y, z, Math.cos(a) * s, speed * 0.5 + ((i * 13) % 10) / 10, Math.sin(a) * s, life * (0.6 + ((i * 29) % 10) / 20), r, g, b);
    }
  }

  function dust(x, z) { spawn(x, 0.25, z, 0, 0.6, 0, 0.7, 0.72, 0.66, 0.55); }
  function smoke(x, y, z) { spawn(x, y, z, 0, 0.9, 0, 1.1, 0.25, 0.25, 0.28); }

  function update(dt) {
    for (let i = 0; i < MAX; i += 1) {
      const p = pool[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 1.2 * dt;
        if (p.life <= 0) p.y = -100;
      }
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      // Fade the colour out with the remaining life, so sparks die instead of popping off.
      const fade = p.maxLife > 0 ? Math.max(0, p.life / p.maxLife) : 0;
      colors[i * 3] = p.r * fade;
      colors[i * 3 + 1] = p.g * fade;
      colors[i * 3 + 2] = p.b * fade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return { burst, dust, smoke, update };
}
