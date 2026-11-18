// The minimap: a 2D canvas that draws the city from above — roads, the beach,
// the player as an arrow, police as flashing dots, traffic as specks and the
// mission marker as a pulsing diamond. One clear job, no three.js in here.
// Beach-city colours, matching the 3D look: dark asphalt roads (the beach
// boulevard and the two east-west arterials wider, with a yellow centre
// line), saturated pastel blocks, bright sand and a vivid blue ocean, so
// every part of the map reads at a glance instead of washing into one warm
// blur. The player arrow is big with a dark halo; north gets a dark pill.
import { CITY } from './config.js';

const WORLD = 440;

/** A stable 0..1 hash of two coordinates, for block colours that never move. */
function hash2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const BLOCK_COLORS = ['#ff9e7d', '#7fc8bc', '#f7d774', '#e78fb3', '#a8d8ea', '#ffb347', '#c9a0dc'];
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
  ctx.fillStyle = '#e6d3ac';
  ctx.fillRect(0, 0, size, size);
  // Blocks: saturated pastels, one colour per block, keyed off its position.
  const half = CITY.blockSize / 2;
  for (let ix = 0; ix < 7; ix += 1) {
    for (let iz = 0; iz < 7; iz += 1) {
      const cx = -CITY.pitch * 3 + ix * CITY.pitch;
      const cz = -CITY.pitch * 3 + iz * CITY.pitch;
      if (cx > 150) continue;
      ctx.fillStyle = BLOCK_COLORS[Math.floor(hash2(cx, cz) * BLOCK_COLORS.length) % BLOCK_COLORS.length];
      ctx.fillRect(toX(cx - half), toY(cz - half), CITY.blockSize * scale, CITY.blockSize * scale);
    }
  }
  // Roads: dark asphalt, so the street grid cuts through the pastel blocks.
  // Minor streets first, then the main roads wider on top, with a yellow
  // centre line down each main road like the 3D streets carry.
  ctx.strokeStyle = '#2e2a33';
  ctx.lineCap = 'round';
  ctx.lineWidth = CITY.roadWidth * scale;
  for (const s of CITY.streets) {
    ctx.beginPath(); ctx.moveTo(toX(s), 0); ctx.lineTo(toX(s), size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(s)); ctx.lineTo(size, toY(s)); ctx.stroke();
  }
  ctx.lineWidth = CITY.roadWidth * scale + 2;
  for (const s of MAIN_X) {
    ctx.beginPath(); ctx.moveTo(toX(s), 0); ctx.lineTo(toX(s), size); ctx.stroke();
  }
  for (const s of MAIN_Z) {
    ctx.beginPath(); ctx.moveTo(0, toY(s)); ctx.lineTo(size, toY(s)); ctx.stroke();
  }
  ctx.strokeStyle = '#ffd23d';
  ctx.lineWidth = 1.2;
  for (const s of MAIN_X) {
    ctx.beginPath(); ctx.moveTo(toX(s), 0); ctx.lineTo(toX(s), size); ctx.stroke();
  }
  for (const s of MAIN_Z) {
    ctx.beginPath(); ctx.moveTo(0, toY(s)); ctx.lineTo(size, toY(s)); ctx.stroke();
  }
  // Beach and ocean: bright sand, then a vivid blue sea with a pale surf
  // line where the waves break. The beach covers the roads' east ends, so
  // no street runs into the water.
  ctx.fillStyle = '#f2d491';
  ctx.fillRect(toX(CITY.beachX), 0, size - toX(CITY.beachX), size);
  ctx.fillStyle = '#1a8fc8';
  ctx.fillRect(toX(CITY.waterX), 0, size - toX(CITY.waterX), size);
  ctx.fillStyle = 'rgba(216,240,255,0.85)';
  ctx.fillRect(toX(CITY.waterX) - 1, 0, 2, size);
  // Traffic specks.
  ctx.fillStyle = 'rgba(26,16,48,0.85)';
  for (const car of view.trafficCars) {
    ctx.fillRect(toX(car.x) - 1.75, toY(car.z) - 1.75, 3.5, 3.5);
  }
  // The Hideout: a green square, home base on the map.
  if (view.hideout) {
    ctx.fillStyle = '#2aff66';
    ctx.fillRect(toX(view.hideout.x) - 3, toY(view.hideout.z) - 3, 6, 6);
    ctx.strokeStyle = '#062';
    ctx.lineWidth = 1;
    ctx.strokeRect(toX(view.hideout.x) - 3, toY(view.hideout.z) - 3, 6, 6);
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
