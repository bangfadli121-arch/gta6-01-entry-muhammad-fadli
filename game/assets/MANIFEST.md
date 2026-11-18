# Vice Shores — texture manifest

Photorealistic textures generated on real GPU compute (Kaggle Tesla T4)
for builder #10 of the gta6-01 "Make GTA 6" bounty. Every image below was
rendered with Stable Diffusion and is shipped in this repo so the game
runs with zero network dependency on GitHub Pages.

- **Model:** Lykon/dreamshaper-7 (Stable Diffusion 1.5 finetune)
- **GPU:** Tesla T4, torch 2.11.0+cu130
- **Settings (all):** 30 steps, guidance 7.5
- **Source kernel:** jakeward1/gta6-textures-sd

| file | size | seed | prompt |
| --- | --- | --- | --- |
| tex_sky_golden.png | 1024x512 | 11 | equirectangular panoramic sky, golden hour sunset over a tropical beach, pink and orange clouds, sun low on the horizon over the ocean, warm light, photorealistic sky panorama, no buildings, no text |
| tex_facade_teal.png | 512x768 | 21 | art deco hotel building facade, straight-on front view, teal and cream painted concrete, curved corners, rows of windows with white frames, neon sign, Miami beach style, photorealistic, daylight, no people, no text |
| tex_facade_pink.png | 512x768 | 22 | art deco hotel building facade, straight-on front view, coral pink and white painted concrete, rounded corners, rows of windows, vertical neon sign, Miami beach style, photorealistic, daylight, no people, no text |
| tex_facade_yellow.png | 512x768 | 23 | art deco apartment building facade, straight-on front view, pastel yellow and mint green painted concrete, stepped roofline, balconies, rows of windows, Miami beach style, photorealistic, daylight, no people, no text |
| tex_billboard_flamingo.png | 768x512 | 31 | retro neon billboard sign, pink flamingo and palm trees, glowing neon tubes, text 'FLAMINGO FM', dark blue night background, miami vice style, photorealistic neon signage, full sign in frame, centered |
| tex_billboard_vice.png | 768x512 | 32 | retro neon billboard sign, sunset over ocean with palm tree silhouettes, glowing orange and pink neon, text 'VICE SHORES', miami vice style, photorealistic neon signage, full sign in frame, centered |
| tex_sand.png | 512x512 | 41 | seamless beach sand texture, top-down view, fine white sand with subtle ripples and a few tiny shells, photorealistic, even daylight, tileable |
| tex_ocean.png | 512x512 | 42 | seamless turquoise ocean water texture, top-down aerial view, gentle waves and foam patterns, caribbean sea, photorealistic, even daylight, tileable |
| tex_road.png | 512x512 | 43 | asphalt road texture, top-down view, dark asphalt with faded white lane markings and a yellow center line, palm tree shadows, photorealistic, even daylight, tileable |
| tex_palm.png | 512x512 | 44 | tropical palm tree canopy seen from below against a bright blue sky, green palm fronds backlit by sun, photorealistic, no buildings, no text |

## How the game uses them (and what it deliberately does not)

- `tex_sky_golden.png` — the sky dome (equirectangular). The dome is
  rotated so the photographed sun sits low over the ocean north-east of
  the city, under the game's own sun disc and halo, so there is exactly
  one sun in the frame.
- `tex_facade_*.png` — tower and shop side faces. Only the top 85% of
  each facade is mapped (the bottom ~15% of the renders carries a
  garbled sign band and street, so it is cropped by texture offset).
- `tex_billboard_*.png` — billboard background art. The generated text
  is garbled ("SUNIG'S", "FOORN..."), so it is covered by a dark panel
  and the game's own sharp CanvasTexture lettering ("VICE SHORES",
  "FLAMINGO FM") is painted over it.
- `tex_sand.png` — the beach strip, tiled.
- `tex_ocean.png` — the ocean plane. Only the right strip of the image
  (pure water and foam, no sand bar) is sampled, tiled along the shore.
- `tex_road.png` — NOT used in 3D: the render is an intersection seen
  from above, not a road strip, so tiling it would repeat intersections
  down every street. Roads keep the flat asphalt with the game's own
  painted dashes, edge lines and crosswalks.
- `tex_palm.png` — NOT used in 3D: it is a canopy photographed against
  an opaque blue sky with no alpha channel, so it cannot be cut out
  onto the game's palm geometry. The palms keep their modelled drooping
  fronds.

## Fallback

Every texture is optional. `src/textures.js` loads them with
`THREE.TextureLoader` and resolves `null` per file on any failure (or
after an 8 s timeout), and `city.js` / `render.js` fall back to the
original flat colours and the procedural gradient sky, so the game can
never go blank because a texture failed to load.
