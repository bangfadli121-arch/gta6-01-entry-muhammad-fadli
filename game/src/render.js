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
  // Builder #14c — A REAL GLOW, NOT A PLATE (fadli: "knp masih ada
  // tempelan"): the old sun was two flat circles — a pale disc and a big
  // orange halo disc — and both showed a hard circular rim against the
  // sky, like a plate nailed up there. The sun is now a radial-gradient
  // sprite: a bright core fading softly to transparent, no rim at all,
  // over the halo and core glow sprites below (which were already soft).
  const sunGlowCanvas = document.createElement('canvas');
  sunGlowCanvas.width = 128;
  sunGlowCanvas.height = 128;
  const sunGlowCtx = sunGlowCanvas.getContext('2d');
  const sunGlowGrad = sunGlowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  sunGlowGrad.addColorStop(0, 'rgba(255,255,255,1)');
  sunGlowGrad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  sunGlowGrad.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  sunGlowGrad.addColorStop(1, 'rgba(255,255,255,0)');
  sunGlowCtx.fillStyle = sunGlowGrad;
  sunGlowCtx.fillRect(0, 0, 128, 128);
  const sunGlowTex = new THREE.CanvasTexture(sunGlowCanvas);
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunGlowTex,
    color: theme === 'sunset' ? 0xffe9a0 : 0xdfe8ff,
    transparent: true, opacity: 0.95, fog: false, toneMapped: false, depthWrite: false,
  }));
  sunDisc.position.set(sunDiscPos[0], sunDiscPos[1], sunDiscPos[2]);
  sunDisc.scale.set(
    theme === 'sunset' ? (hasPhotoSky ? 64 : 110) : 40,
    theme === 'sunset' ? (hasPhotoSky ? 64 : 110) : 40,
    1,
  );
  sunDisc.renderOrder = 10;
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
    // Builder #11 (Halcyon-style): LOW and CLOSE behind the car — the
    // player's car fills the bottom of the frame instead of shrinking to
    // a speck down a long empty road.
    const dist = player.inCar ? 9.0 : 8.5;
    const height = player.inCar ? 4.6 : 3.8;
    const wantFov = 64 + Math.min(8, Math.abs(player.speed) * 0.14);
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

  /**
   * Builder #19 — the CAUSEWAY camera (rebuilt for the new layout): a
   * low, close, slightly off-axis chase pose, pitched UP. The old pose
   * looked level (lookAt y 3.2), which put the casino's rooftop CASINO
   * sign — 33 units up, 50 east — above the frame's top edge. Looking
   * up ~18 degrees keeps the hero's rear in the bottom of the frame
   * AND the sign, the FLAMINGO board, the wheel and the low sun in it
   * together. Called once after staging; the frozen shot loop never
   * calls updateCamera again, so this pose holds until the capture.
   * Live play keeps updateCamera's own pose.
   */
  function setCoverCamera(player) {
    const fx = Math.cos(player.heading);
    const fz = Math.sin(player.heading);
    // Right of the heading is (-sin h, cos h) in xz; the camera sits on
    // the LEFT-rear quarter (lat negative), the look target a touch right.
    const rx = -Math.sin(player.heading);
    const rz = Math.cos(player.heading);
    // Builder #19, fifth look: the pitch math used 16 units ahead, but
    // the look target sits 27 ahead of the camera (dist 11 behind the
    // player + 16 ahead of him), so the real pitch was 5.9 deg, not 10
    // — and the sign top stayed cut. lookAt y 8.2 gives the true 10 deg
    // pitch: sign top at +22 deg rel axis, hero rear bottom at -29.
    const dist = 11;
    // Builder #19, second look: the camera rode the NORTH-rear quarter,
    // the same side as the ramming unit — the hero hid behind it. The
    // camera now rides the SOUTH-rear quarter, opposite the rammer, so
    // the hero's rear sits clear in the bottom of the frame.
    const lat = 2.6;
    camera.position.set(
      player.x - fx * dist + rx * lat,
      3.4,
      player.z - fz * dist + rz * lat,
    );
    camera.fov = 64;
    camera.updateProjectionMatrix();
    camera.lookAt(player.x + fx * 16, 8.2, player.z + fz * 16);
    camState.x = camera.position.x;
    camState.y = camera.position.y;
    camState.z = camera.position.z;
    camState.lookX = player.x + fx * 16;
    camState.lookY = 8.2;
    camState.lookZ = player.z + fz * 16;
  }

  /** Place the camera for a low establishing view of the island (title
   * screen): just off the south shore, low over the ring boulevard,
   * looking north-east along the coast toward the ferris wheel, the
   * billboards and the low sun — sand, surf, palms and shopfronts in the
   * lower frame, bright sky above — instead of a dark backdrop or a grid
   * of rooftops. The compact title sits in a slim strip at the bottom,
   * so the city stays visible above it. The camera looks nearly due east
   * past the wheel, which puts the wheel and the billboard ~40 degrees
   * off-axis, in the clear upper frame. */
  function setEstablishing() {
    // Builder #11 retune: higher and further south, looking north-east —
    // the sightline now clears the mid-ground rooftops, so the ferris
    // wheel, both billboards and the low sun are all in the frame above
    // the slim title strip, with the ring boulevard curving through the
    // foreground instead of a tower filling the left of the frame.
    camera.position.set(-30, 40, 170);
    camera.lookAt(220, 14, -70);
    // Reset the chase state to match, so the first play frame does not swoop
    // the camera all the way from the title view to behind the player.
    camState.x = -30;
    camState.y = 40;
    camState.z = 170;
    camState.lookX = 220;
    camState.lookY = 14;
    camState.lookZ = -70;
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, updateCamera, setCoverCamera, setEstablishing, render, resize };
}
