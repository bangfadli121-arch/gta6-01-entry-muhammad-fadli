// The camera and the light: a three.js renderer, a chase camera that trails the
// player (farther and higher in a car, close and low on foot) with smooth lag,
// and the theme's sky, sun and fog. Golden hour ships: a violet-to-orange
// gradient sky dome, a big low sun with a warm glow, pink-lit clouds drifting
// over the city and a hazy distant skyline on the horizon, so every frame has
// a sky worth looking at instead of a flat dark backdrop.

import * as THREE from 'three';
import { PALETTES } from './config.js';

// Deterministic cloud puffs: fixed positions from a hash of the index, never
// Math.random, so the sky is identical on every run with the same seed.
function cloudSpots(count) {
  const spots = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i * 2.39996) % (Math.PI * 2);
    const r = 180 + ((i * 97) % 160);
    spots.push({
      x: Math.cos(a) * r,
      y: 95 + ((i * 53) % 55),
      z: Math.sin(a) * r,
      s: 14 + ((i * 37) % 18),
    });
  }
  return spots;
}

// A ring of hazy towers far outside the playable city, so the horizon is a
// skyline in warm haze instead of an empty fog wall.
function skylineSpots(count) {
  const spots = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + 0.13;
    const r = 330 + ((i * 41) % 70);
    spots.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      w: 18 + ((i * 29) % 22),
      h: 26 + ((i * 61) % 55),
      d: 18 + ((i * 23) % 16),
    });
  }
  return spots;
}

export function createRenderer(canvas, theme) {
  const palette = PALETTES[theme];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.skyTop ?? palette.sky);
  // Golden hour haze reaches much farther than the night fog, so the distant
  // skyline stays visible instead of drowning at 320 units.
  scene.fog = new THREE.Fog(palette.fog, theme === 'sunset' ? 120 : 90, theme === 'sunset' ? 520 : 320);

  const hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, palette.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(palette.sun, palette.sunIntensity);
  sun.position.set(palette.sunPosition[0], palette.sunPosition[1], palette.sunPosition[2]);
  scene.add(sun);
  const fill = new THREE.AmbientLight(0xffffff, palette.ambient);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(62, 1280 / 480, 0.1, 1200);
  camera.position.set(0, 8, -14);

  // --- The sky: a gradient dome, violet dusk at the top melting through
  // orange to a pale-gold horizon. It sits behind everything (BackSide,
  // depthWrite off, fog off) and never moves with the camera's chase.
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(800, 28, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(palette.skyTop ?? palette.sky) },
        mid: { value: new THREE.Color(palette.skyMid ?? palette.sky) },
        bot: { value: new THREE.Color(palette.horizon ?? palette.sky) },
      },
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;'
        + 'void main() { float h = normalize(vP).y;'
        + ' vec3 c = h > 0.22 ? mix(mid, top, smoothstep(0.22, 0.8, h)) : mix(bot, mid, smoothstep(-0.06, 0.22, h));'
        + ' gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  scene.add(skyDome);

  // --- The sun: a big low disc on the horizon with a soft halo behind it,
  // so the sunset reads in every shot — and a smaller, higher moon at night,
  // so it does not swallow the sky.
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(theme === 'sunset' ? 62 : 22, 28),
    new THREE.MeshBasicMaterial({
      color: theme === 'sunset' ? 0xffb060 : 0x8a9ac8, fog: false,
      transparent: true, opacity: theme === 'sunset' ? 0.35 : 0.2,
    }),
  );
  sunGlow.position.set(palette.sunPosition[0] * 2.4, theme === 'sunset' ? 26 : 90, palette.sunPosition[2] * 2.4);
  sunGlow.lookAt(0, 10, 0);
  scene.add(sunGlow);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(theme === 'sunset' ? 26 : 12, 24),
    new THREE.MeshBasicMaterial({ color: theme === 'sunset' ? 0xffe9b0 : 0xdfe8ff, fog: false }),
  );
  sunDisc.position.set(palette.sunPosition[0] * 2.4, theme === 'sunset' ? 26 : 90, palette.sunPosition[2] * 2.4);
  sunDisc.lookAt(0, 10, 0);
  scene.add(sunDisc);

  // --- Clouds: flat pink-lit puffs high over the city, two or three lobes
  // each, so the sky has shape instead of a smooth gradient alone.
  if (theme === 'sunset') {
    const cloudMat = new THREE.MeshBasicMaterial({
      color: palette.cloudTint, fog: false, transparent: true, opacity: 0.9,
    });
    const cloudMat2 = new THREE.MeshBasicMaterial({
      color: 0xffc9a0, fog: false, transparent: true, opacity: 0.75,
    });
    for (const spot of cloudSpots(12)) {
      const puff = new THREE.Group();
      const lobes = 2 + (Math.floor(spot.x) % 2);
      for (let i = 0; i < lobes; i += 1) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(spot.s * 0.55, 10, 8), i === 0 ? cloudMat : cloudMat2);
        lobe.scale.y = 0.32;
        lobe.position.set((i - 1) * spot.s * 0.55, i === 0 ? 0 : spot.s * 0.08, (i % 2) * spot.s * 0.3);
        puff.add(lobe);
      }
      puff.position.set(spot.x, spot.y, spot.z);
      scene.add(puff);
    }
  }

  // --- Distant skyline: hazy towers on the horizon in the theme's skyline
  // tint, fogged warm so they read as a far-off downtown, not geometry.
  if (theme === 'sunset') {
    const skylineMat = new THREE.MeshStandardMaterial({
      color: palette.skylineTint, roughness: 1, metalness: 0,
    });
    for (const spot of skylineSpots(30)) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(spot.w, spot.h, spot.d), skylineMat);
      tower.position.set(spot.x, spot.h / 2 - 2, spot.z);
      scene.add(tower);
    }
  }

  const camState = { x: 0, y: 10, z: -16, lookX: 0, lookY: 2, lookZ: 0 };

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /**
   * Chase the player: behind and above, eased toward the target each frame so
   * the camera never snaps. `player` is {x, z, heading, inCar, speed}. The
   * field of view widens a little with speed, so fast driving feels fast.
   */
  function updateCamera(player, dt) {
    const dist = player.inCar ? 13.5 : 8.5;
    const height = player.inCar ? 5.2 : 3.6;
    const wantFov = 62 + Math.min(8, Math.abs(player.speed) * 0.14);
    if (Math.abs(camera.fov - wantFov) > 0.1) {
      camera.fov = wantFov;
      camera.updateProjectionMatrix();
    }
    const backX = player.x - Math.cos(player.heading) * dist;
    const backZ = player.z - Math.sin(player.heading) * dist;
    const k = 1 - Math.exp(-6 * dt);
    camState.x += (backX - camState.x) * k;
    camState.y += (height - camState.y) * k;
    camState.z += (backZ - camState.z) * k;
    const lookX = player.x + Math.cos(player.heading) * 6;
    const lookZ = player.z + Math.sin(player.heading) * 6;
    camState.lookX += (lookX - camState.lookX) * k;
    camState.lookY += (2 - camState.lookY) * k;
    camState.lookZ += (lookZ - camState.lookZ) * k;
    camera.position.set(camState.x, camState.y, camState.z);
    camera.lookAt(camState.lookX, camState.lookY, camState.lookZ);
  }

  /** Place the camera for a wide establishing view of the city (title screen):
   * low in the south-east, looking north-west into the low sun, so the title
   * sits over a sunset skyline instead of a dark backdrop. */
  function setEstablishing() {
    camera.position.set(95, 46, 135);
    camera.lookAt(-70, 6, -70);
    // Reset the chase state to match, so the first play frame does not swoop
    // the camera all the way from the title view to behind the player.
    camState.x = 95;
    camState.y = 46;
    camState.z = 135;
    camState.lookX = -70;
    camState.lookY = 6;
    camState.lookZ = -70;
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, updateCamera, setEstablishing, render, resize };
}
