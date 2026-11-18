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
      y: 60 + ((i * 53) % 70),
      z: Math.sin(a) * r,
      s: 16 + ((i * 37) % 22),
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
      h: 20 + ((i * 37) % 35),
      d: 18 + ((i * 23) % 16),
    });
  }
  return spots;
}

export function createRenderer(canvas, theme, textures) {
  const palette = PALETTES[theme];
  // The photographed sky (builder #10): a real golden-hour panorama from
  // the GPU texture set, wrapped on the sky dome. Its own sun sits low on
  // the horizon; the dome rotation puts that photographed sun north-east,
  // over the ocean, under the game's sun disc, so the frame has one sun.
  // Without the texture the procedural gradient sky below is the fallback.
  const hasPhotoSky = !!(textures && textures.sky);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  // Filmic tone mapping: deeper contrast and livelier colour than the flat
  // linear look, so the sunset reads rich instead of washed out. The sun,
  // the billboard and the glow sprites opt out (toneMapped: false) and stay
  // punchy — they are the lights, not the things the light falls on.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.skyTop ?? palette.sky);
  // Golden hour haze reaches much farther than the night fog, so the distant
  // skyline stays visible instead of drowning at 320 units.
  scene.fog = new THREE.Fog(palette.fog, theme === 'sunset' ? 120 : 90, theme === 'sunset' ? 600 : 320);

  const hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, palette.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(palette.sun, palette.sunIntensity);
  sun.position.set(palette.sunPosition[0], palette.sunPosition[1], palette.sunPosition[2]);
  scene.add(sun);
  // A warm fill from the east, from the sun's own direction over the ocean:
  // it throws the low sun's specular streak down the east streets onto the
  // wet-looking asphalt, and rims the east faces the main light misses.
  if (theme === 'sunset') {
    const eastFill = new THREE.DirectionalLight(0xffb060, 0.8);
    eastFill.position.set(200, 40, 10);
    scene.add(eastFill);
  }
  const fill = new THREE.AmbientLight(0xffffff, palette.ambient);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(62, 1280 / 480, 0.1, 1200);
  camera.position.set(0, 8, -14);

  // --- The sky: with the GPU texture, the dome wears the photographed
  // golden-hour panorama (sun low over the ocean, pink-orange clouds, a
  // turquoise sea along the horizon) instead of the procedural gradient
  // bands — the horizon reads as real sea and sky from every camera. The
  // procedural shader dome stays as the fallback when the texture failed
  // to load: a violet-to-orange gradient sky dome in four bands, with a
  // warm glow gathering around the sun's own direction.
  let skyDome;
  if (hasPhotoSky) {
    skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(800, 28, 18),
      new THREE.MeshBasicMaterial({
        map: textures.sky, side: THREE.BackSide, depthWrite: false, fog: false,
      }),
    );
    skyDome.rotation.y = palette.skyTextureRotationY ?? 0;
  } else {
    skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(800, 28, 18),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(palette.skyTop ?? palette.sky) },
          upper: { value: new THREE.Color(palette.skyUpper ?? palette.skyMid ?? palette.sky) },
          mid: { value: new THREE.Color(palette.skyMid ?? palette.sky) },
          bot: { value: new THREE.Color(palette.horizon ?? palette.sky) },
          sunDir: { value: new THREE.Vector3(480, 26, 10).normalize() },
        },
        vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 upper; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir;'
          + 'void main() { float h = normalize(vP).y;'
          + ' vec3 c = h > 0.42 ? mix(upper, top, smoothstep(0.42, 0.85, h))'
          + ' : h > 0.10 ? mix(mid, upper, smoothstep(0.10, 0.30, h))'
          + ' : mix(bot, mid, smoothstep(-0.06, 0.10, h));'
          + ' float g = pow(max(dot(normalize(vP), sunDir), 0.0), 6.0);'
          + ' c = mix(c, vec3(1.0, 0.85, 0.6), g * 0.55);'
          + ' gl_FragColor = vec4(c, 1.0); }',
      }),
    );
  }
  scene.add(skyDome);

  // --- The sun: a big low disc on the horizon with a soft halo behind it,
  // so the sunset reads in every shot — and a smaller, higher moon at night,
  // so it does not swallow the sky. At sunset the disc sits due east over
  // the ocean (palette.sunDiscPosition), at the end of the east streets,
  // while the directional light stays north-west for the wall modelling.
  // With the photographed sky the disc moves up into the clear strip left
  // of the title card (palette.sunDiscPositionTextured), directly above
  // the photographed sun's own glow on the horizon — one unmistakable sun
  // in the title frame, instead of a disc hidden behind the card. It is
  // also smaller and warmer there: the photograph already carries the
  // sunset's glow, so a full-size pale disc would read as a second moon.
  const sunDiscPos = theme === 'sunset' && palette.sunDiscPosition
    ? (hasPhotoSky && palette.sunDiscPositionTextured
      ? palette.sunDiscPositionTextured
      : palette.sunDiscPosition)
    : [palette.sunPosition[0] * 2.4, theme === 'sunset' ? 26 : 90, palette.sunPosition[2] * 2.4];
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(theme === 'sunset' ? (hasPhotoSky ? 55 : 90) : 22, 28),
    new THREE.MeshBasicMaterial({
      color: theme === 'sunset' ? 0xff8a3d : 0x8a9ac8, fog: false,
      transparent: true, opacity: theme === 'sunset' ? 0.55 : 0.2, toneMapped: false,
    }),
  );
  sunGlow.position.set(sunDiscPos[0], sunDiscPos[1], sunDiscPos[2]);
  sunGlow.lookAt(0, 10, 0);
  scene.add(sunGlow);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(theme === 'sunset' ? (hasPhotoSky ? 22 : 34) : 12, 24),
    new THREE.MeshBasicMaterial({ color: theme === 'sunset' ? (hasPhotoSky ? 0xffe9a0 : 0xfff8d0) : 0xdfe8ff, fog: false, toneMapped: false }),
  );
  sunDisc.position.set(sunDiscPos[0], sunDiscPos[1], sunDiscPos[2]);
  sunDisc.lookAt(0, 10, 0);
  scene.add(sunDisc);

  // --- The sun's bloom: two additive radial-gradient sprites over the disc,
  // a wide warm halo and a tight bright core, so the low sun glares instead
  // of sitting flat on the sky. Sprites always face the camera; the texture
  // is painted once at boot, so the glare costs no post-processing pass and
  // stays identical on every run.
  if (theme === 'sunset') {
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const gctx = glowCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.16)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff9a3d, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    halo.position.set(sunDiscPos[0], sunDiscPos[1], sunDiscPos[2]);
    halo.scale.set(hasPhotoSky ? 180 : 300, hasPhotoSky ? 180 : 300, 1);
    scene.add(halo);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff3c0, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    core.position.set(sunDiscPos[0], sunDiscPos[1], sunDiscPos[2]);
    core.scale.set(hasPhotoSky ? 90 : 140, hasPhotoSky ? 90 : 140, 1);
    scene.add(core);
  }

  // --- Clouds: flat pink-lit puffs high over the city, two or three lobes
  // each, so the sky has shape instead of a smooth gradient alone. Only
  // for the procedural sky — the photographed sky already carries its own
  // dramatic clouds, and the painted puffs would double them.
  if (theme === 'sunset' && !hasPhotoSky) {
    const cloudMat = new THREE.MeshBasicMaterial({
      color: palette.cloudTint, fog: false, transparent: true, opacity: 0.9,
    });
    const cloudMat2 = new THREE.MeshBasicMaterial({
      color: 0xffc9a0, fog: false, transparent: true, opacity: 0.75,
    });
    for (const spot of cloudSpots(16)) {
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
    // Sunset streaks: long flat bands low over the ocean, east of the city,
    // in pink and gold — deterministic positions, never Math.random.
    const streaks = [
      { x: 330, y: 34, z: -120, s: 46, c: 0xff9a7a },
      { x: 380, y: 48, z: 40, s: 58, c: 0xffc9a0 },
      { x: 300, y: 62, z: 130, s: 40, c: 0xffb060 },
      { x: 430, y: 60, z: -140, s: 52, c: 0xff8a6a },
      { x: 260, y: 78, z: -190, s: 36, c: 0xffe8d8 },
    ];
    for (const st of streaks) {
      const band = new THREE.Mesh(
        new THREE.SphereGeometry(st.s * 0.5, 12, 8),
        new THREE.MeshBasicMaterial({ color: st.c, fog: false, transparent: true, opacity: 0.75 }),
      );
      band.scale.set(2.6, 0.22, 0.7);
      band.position.set(st.x, st.y, st.z);
      scene.add(band);
    }
  }

  // --- Distant skyline: hazy towers on the horizon in the theme's skyline
  // tint, fogged warm so they read as a far-off downtown, not geometry.
  // The eastern wedge stays open: the ocean horizon must read as water and
  // sky, not as a wall of towers standing in the sea.
  if (theme === 'sunset') {
    const skylineMat = new THREE.MeshStandardMaterial({
      color: palette.skylineTint, roughness: 1, metalness: 0,
    });
    for (const spot of skylineSpots(30)) {
      if (spot.x > 0 && Math.abs(spot.z) < spot.x * 0.75) continue;
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
    const dist = player.inCar ? 12.5 : 8.5;
    const height = player.inCar ? 4.7 : 3.6;
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
   * low in the south-west, looking east-south-east along the coast toward
   * the beach, the ferris wheel and the billboard, so the title sits over
   * a sunset shoreline — sand, surf, palms and shopfronts in the lower
   * frame, bright sky above — instead of a dark backdrop or a grid of
   * rooftops. The camera sits low enough that the beachfront shop row
   * and the palms lead the eye to the wheel and the sun. Take 2 retune:
   * pulled further south and lower, looking further east, so the wheel,
   * the billboard and the sun are all inside the frame above the card.
   * Take 3 retune: that lookAt sat dead on the wheel, so the card hid
   * both landmarks — now the view swings further east, which pushes the
   * wheel and the billboard into the clear strip left of the card while
   * the ocean and bright sky fill the rest of the frame. Take 3 second
   * pass: the first swing (lookAt 245,8,70) still left both landmarks
   * inside the card — the camera's aspect is 1280/480, so the card
   * covers ~38 degrees either side of centre — so the view swings to
   * nearly due east (lookAt 258,8,134), putting the wheel and billboard
   * ~43 degrees off-axis, in the clear strip left of the card. */
  function setEstablishing() {
    camera.position.set(-40, 24, 165);
    camera.lookAt(258, 8, 134);
    // Reset the chase state to match, so the first play frame does not swoop
    // the camera all the way from the title view to behind the player.
    camState.x = -40;
    camState.y = 24;
    camState.z = 165;
    camState.lookX = 258;
    camState.lookY = 8;
    camState.lookZ = 134;
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, updateCamera, setEstablishing, render, resize };
}
