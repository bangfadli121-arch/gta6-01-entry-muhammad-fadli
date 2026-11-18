// The camera and the light: a three.js renderer, a chase camera that trails the
// player (farther and higher in a car, close and low on foot) with smooth lag,
// and the theme's sky, sun and fog — golden hour for sunset, deep blue with a
// cold moon for night.
import * as THREE from 'three';
import { PALETTES } from './config.js';

export function createRenderer(canvas, theme) {
  const palette = PALETTES[theme];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.fog, 90, 320);

  const hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, palette.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(palette.sun, palette.sunIntensity);
  sun.position.set(palette.sunPosition[0], palette.sunPosition[1], palette.sunPosition[2]);
  scene.add(sun);
  const fill = new THREE.AmbientLight(0xffffff, palette.ambient);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(62, 1280 / 480, 0.1, 900);
  camera.position.set(0, 8, -14);

  // A big low sun disc on the horizon, so the sunset reads in every shot —
  // and a smaller, higher moon at night, so it does not swallow the sky.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(theme === 'sunset' ? 26 : 12, 24),
    new THREE.MeshBasicMaterial({ color: theme === 'sunset' ? 0xffd9a0 : 0xdfe8ff, fog: false }),
  );
  sunDisc.position.set(palette.sunPosition[0] * 2.4, theme === 'sunset' ? 26 : 90, palette.sunPosition[2] * 2.4);
  sunDisc.lookAt(0, 10, 0);
  scene.add(sunDisc);

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

  /** Place the camera for a wide establishing view of the city (title screen). */
  function setEstablishing() {
    camera.position.set(-40, 55, 150);
    camera.lookAt(20, 4, -20);
    // Reset the chase state to match, so the first play frame does not swoop
    // the camera all the way from the title view to behind the player.
    camState.x = -40;
    camState.y = 55;
    camState.z = 150;
    camState.lookX = 20;
    camState.lookY = 4;
    camState.lookZ = -20;
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, updateCamera, setEstablishing, render, resize };
}
