// Photorealistic textures for Vice Shores (builder #10): Stable Diffusion
// renders (Lykon/dreamshaper-7, Tesla T4) shipped in game/assets/, loaded
// with THREE.TextureLoader from paths relative to this module, so they work
// on GitHub Pages exactly as they do on a local server. Every texture is
// optional: a file that fails to load (or a load that takes longer than the
// timeout) resolves to null, and the city/render code falls back to the
// original flat colours and procedural sky, so the game can never go blank
// because a texture is missing. Loading happens once, before the game is
// built, so the staged screenshots always paint the finished textures and
// stay byte-identical between runs.
import * as THREE from 'three';

const FILES = {
  sky: 'tex_sky_golden.png',
  facadeTeal: 'tex_facade_teal.png',
  facadePink: 'tex_facade_pink.png',
  facadeYellow: 'tex_facade_yellow.png',
  billboardFlamingo: 'tex_billboard_flamingo.png',
  billboardVice: 'tex_billboard_vice.png',
  sand: 'tex_sand.png',
  ocean: 'tex_ocean.png',
  road: 'tex_road.png',
  palm: 'tex_palm.png',
};

const TIMEOUT_MS = 8000;

export function loadGameTextures(timeoutMs = TIMEOUT_MS) {
  const loader = new THREE.TextureLoader();
  const base = new URL('../assets/', import.meta.url);
  const names = Object.keys(FILES);
  const status = { loaded: [], failed: [] };
  function loadOne(name) {
    return new Promise((resolve) => {
      loader.load(
        new URL(FILES[name], base).href,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          status.loaded.push(name);
          resolve(tex);
        },
        undefined,
        () => {
          status.failed.push(name);
          resolve(null);
        },
      );
    });
  }
  const all = Promise.all(names.map(loadOne)).then((textures) => {
    const map = {};
    names.forEach((name, i) => { map[name] = textures[i]; });
    map.__status = status;
    return map;
  });
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      const map = {};
      names.forEach((name) => { map[name] = null; });
      map.__status = { loaded: [], failed: names.slice(), timedOut: true };
      resolve(map);
    }, timeoutMs);
  });
  return Promise.race([all, timeout]);
}
