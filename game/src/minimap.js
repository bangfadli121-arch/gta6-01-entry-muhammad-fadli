// The minimap: a 2D canvas that draws the city from above — roads, the beach,
// the player as an arrow, police as flashing dots, traffic as specks and the
// mission marker as a pulsing diamond. One clear job, no three.js in here.
//
// Builder #9 redraw (the change fadli asked for by name): the map is LINES
// on sand and sea, never filled blocks. The land is pale sand, the streets
// are thin dark lines with a yellow dash down the main roads, the blocks
// are only faint pale outlines, and the coast is a gentle curve with a surf
// line — the way the winning entries draw it. The player arrow is big with
// a dark halo; north gets a dark pill.
import { CITY } from './config.js';

const WORLD = 440;

/** A stable 0..1 hash of two coordinates, for colours that never move. */
function hash2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// The main roads: the beachfront boulevard and the two east-west arterials
// that run to the beach. Everything else is a minor street.
const MAIN_X = [145];
const MAIN_Z = [29, -29];

export function drawMinimap(canvas, view) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const scale = size / WORLD;
  const toX = (x) => (x + WORLD / 2) * scale;
  const toY = (z) => (z + WORLD / 2) * scale;

  ctx.clearRect(0, 0, size, size);
  // Clip to the round minimap.
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  // Land: pale sand everywhere, so the map reads as a beach city at a glance.
  ctx.fillStyle = '#f2d491';
  ctx.fillRect(0, 0, size, size);
  // Blocks: faint pale outlines only — no filled colour, no squares. A
  // whisper of a street grid, not a checkerboard.
  const half = CITY.blockSize / 2;
  ctx.strokeStyle = 'rgba(217,185,138,0.55)';
  ctx.lineWidth = 1;
  for (let ix = 0; ix < 7; ix += 1) {
    for (let iz = 0; iz < 7; iz += 1) {
      const cx = -CITY.pitch * 3 + ix * CITY.pitch;
      const cz = -CITY.pitch * 3 + iz * CITY.pitch;
      if (cx > 150) continue;
      ctx.strokeRect(toX(cx - half), toY(cz - half), CITY.blockSize * scale, CITY.blockSize * scale);
    }
  }
  // Roads: thin dark lines, so the street grid reads as lines on sand.
  // Minor streets first, then the main roads a touch wider on top, with a
  // yellow dashed centre line down each main road like the 3D streets carry.
  ctx.strokeStyle = '#3a3340';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  for (const s of CITY.streets) {
    ctx.beginPath(); ctx.moveTo(toX(s), 0); ctx.lineTo(toX(s), size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(s)); ctx.lineTo(size, toY(s)); ctx.stroke();
  }
  ctx.lineWidth = 3.5;
  for (const s of MAIN_X) {
    ctx.beginPath(); ctx.moveTo(toX(s), 0); ctx.lineTo(toX(s), size); ctx.stroke();
  }
  for (const s of MAIN_Z) {
    ctx.beginPath(); ctx.moveTo(0, toY(s)); ctx.lineTo(size, toY(s)); ctx.stroke();
  }
  ctx.strokeStyle = '#ffd23d';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  for (const s of MAIN_X) {
    ctx.beginPath(); ctx.moveTo(toX(s), 0); ctx.lineTo(toX(s), size); ctx.stroke();
  }
  for (const s of MAIN_Z) {
    ctx.beginPath(); ctx.moveTo(0, toY(s)); ctx.lineTo(size, toY(s)); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Beach and ocean: bright sand, then a vivid blue sea, the coast drawn
  // as a gentle curve (bulging east mid-map) with a pale surf line — the
  // shoreline reads as a curve, not a ruler edge. The beach covers the
  // roads' east ends, so no street runs into the water.
  ctx.fillStyle = '#f7e3ac';
  ctx.beginPath();
  ctx.moveTo(toX(CITY.beachX), 0);
  ctx.bezierCurveTo(
    toX(CITY.beachX) + 10, size * 0.33,
    toX(CITY.beachX) - 4, size * 0.66,
    toX(CITY.beachX), size,
  );
  ctx.lineTo(size, size);
  ctx.lineTo(size, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#22b4e6';
  ctx.beginPath();
  ctx.moveTo(toX(CITY.waterX), 0);
  ctx.bezierCurveTo(
    toX(CITY.waterX) + 10, size * 0.33,
    toX(CITY.waterX) - 4, size * 0.66,
    toX(CITY.waterX), size,
  );
  ctx.lineTo(size, size);
  ctx.lineTo(size, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(234,247,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(toX(CITY.waterX), 0);
  ctx.bezierCurveTo(
    toX(CITY.waterX) + 10, size * 0.33,
    toX(CITY.waterX) - 4, size * 0.66,
    toX(CITY.waterX), size,
  );
  ctx.stroke();
  // Palm dots along the beach arc, so the sand reads as a palm-lined shore.
  ctx.fillStyle = '#2fae5a';
  for (let i = 0; i < 9; i += 1) {
    const pz = -160 + i * 40;
    const px = CITY.beachX + 8 + Math.sin(pz * 0.03) * 6;
    ctx.beginPath();
    ctx.arc(toX(px), toY(pz), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // The ferris wheel: a small gold ring on the sand, the map's landmark.
  ctx.strokeStyle = '#e8a93a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(toX(186), toY(-95), 4.5, 0, Math.PI * 2);
  ctx.stroke();
  // Traffic specks.
  ctx.fillStyle = 'rgba(26,16,48,0.85)';
  for (const car of view.trafficCars) {
    ctx.fillRect(toX(car.x) - 1.75, toY(car.z) - 1.75, 3.5, 3.5);
  }
  // The Hideout: a green dot, home base on the map.
  if (view.hideout) {
    ctx.fillStyle = '#2aff66';
    ctx.beginPath();
    ctx.arc(toX(view.hideout.x), toY(view.hideout.z), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#062';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Mission marker: a pulsing yellow diamond.
  if (view.marker) {
    const pulse = 5 + Math.sin(view.time * 4) * 1.5;
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.moveTo(toX(view.marker.x), toY(view.marker.z) - pulse);
    ctx.lineTo(toX(view.marker.x) + pulse, toY(view.marker.z));
    ctx.lineTo(toX(view.marker.x), toY(view.marker.z) + pulse);
    ctx.lineTo(toX(view.marker.x) - pulse, toY(view.marker.z));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7a5200';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Police: flashing blue/red dots.
  for (const p of view.police) {
    ctx.fillStyle = view.time % 1 < 0.5 ? '#ff4040' : '#4060ff';
    ctx.beginPath();
    ctx.arc(toX(p.x), toY(p.z), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // The player: a big white arrow that turns with the heading, on a dark
  // halo so it reads over roads, blocks and sand alike.
  ctx.save();
  ctx.translate(toX(view.player.x), toY(view.player.z));
  ctx.fillStyle = 'rgba(10,5,25,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(Math.atan2(Math.sin(view.player.heading), Math.cos(view.player.heading)) + Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // North tick, so the player can tell which way the map is turned: a
  // white N on a dark pill, readable over any part of the map.
  ctx.fillStyle = 'rgba(10,5,25,0.6)';
  ctx.beginPath();
  ctx.arc(size / 2, 11, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', size / 2, 11.5);
}
