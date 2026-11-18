// The minimap: a 2D canvas that draws the city from above — roads, the beach,
// the player as an arrow, police as flashing dots, traffic as specks and the
// mission marker as a pulsing diamond. One clear job, no three.js in here.
//
// Builder #11 redraw (the change fadli asked for by name — "map nya bulet
// padet"): the map IS the island. A round land disc, a curved ring boulevard
// drawn as a true circle, the coast as a circle with the ocean outside it,
// and the landmarks packed tight — the ferris wheel, both billboards, the
// docks, Casino Row and the Hideout as dots on the map, with the district
// names written on it (CORAL STRAND, DOWNTOWN, CASINO ROW, THE DOCKS), the
// way the winning entries draw theirs. The streets are thin lines on sand,
// never filled blocks — only the ring boulevard and the two east-west
// arterials carry any weight.
import { CITY } from './config.js';

const WORLD = 440;

/** A stable 0..1 hash of two coordinates, for colours that never move. */
function hash2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// The main roads: the ring boulevard (a circle) and the two east-west
// arterials that run to the beach. Everything else is a minor street.
const MAIN_Z = [24, -24];

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
  // Ocean first: the whole disc is sea, the island sits in it.
  ctx.fillStyle = '#1e8fd0';
  ctx.fillRect(0, 0, size, size);
  // Land: the round island, pale sand at the rim fading to warm ground.
  ctx.fillStyle = '#f2d491';
  ctx.beginPath();
  ctx.arc(toX(0), toY(0), CITY.islandRadius * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8d5a8';
  ctx.beginPath();
  ctx.arc(toX(0), toY(0), CITY.beachInner * scale, 0, Math.PI * 2);
  ctx.fill();
  // The coast: a bright surf ring where the sand meets the sea.
  ctx.strokeStyle = 'rgba(234,247,255,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(toX(0), toY(0), CITY.islandRadius * scale, 0, Math.PI * 2);
  ctx.stroke();
  // Roads: thin dark lines, so the street grid reads as lines on sand.
  // Minor streets are dashed hairlines — dashes, not solid squares — so
  // the map never reads as a checkerboard; only the ring boulevard and
  // the two east-west arterials that run to the beach carry any weight,
  // with a yellow dashed centre line down each main road like the
  // 3D streets carry. Streets stop at the ring: they never run into the sea.
  const ringR = CITY.ringRadius * scale;
  ctx.strokeStyle = 'rgba(58,51,64,0.45)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  for (const s of CITY.streets) {
    // A street's visible run: chord of the ring circle at that offset.
    const half = Math.sqrt(Math.max(0, CITY.ringRadius * CITY.ringRadius - s * s));
    ctx.beginPath(); ctx.moveTo(toX(-half), toY(s)); ctx.lineTo(toX(half), toY(s)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toX(s), toY(-half)); ctx.lineTo(toX(s), toY(half)); ctx.stroke();
  }
  ctx.setLineDash([]);
  // The ring boulevard: a true circle, the map's main drag.
  ctx.strokeStyle = '#3a3340';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(toX(0), toY(0), ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#ffd23d';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(toX(0), toY(0), ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // The two arterials, full weight.
  ctx.strokeStyle = '#3a3340';
  ctx.lineWidth = 3;
  for (const s of MAIN_Z) {
    const half = Math.sqrt(Math.max(0, CITY.ringRadius * CITY.ringRadius - s * s));
    ctx.beginPath(); ctx.moveTo(toX(-half), toY(s)); ctx.lineTo(toX(half), toY(s)); ctx.stroke();
  }
  ctx.strokeStyle = '#ffd23d';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  for (const s of MAIN_Z) {
    const half = Math.sqrt(Math.max(0, CITY.ringRadius * CITY.ringRadius - s * s));
    ctx.beginPath(); ctx.moveTo(toX(-half), toY(s)); ctx.lineTo(toX(half), toY(s)); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Palm dots along the beach ring, so the sand reads as a palm-lined shore.
  ctx.fillStyle = '#2fae5a';
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    ctx.beginPath();
    ctx.arc(toX(Math.cos(a) * 180), toY(Math.sin(a) * 180), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Landmarks, packed tight the way the island packs them:
  // the ferris wheel (gold ring), both billboards (pink squares),
  // Casino Row (gold star), the docks (crates) and the Hideout (green dot).
  ctx.strokeStyle = '#e8a93a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(toX(178), toY(-9), 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ff5a8a';
  for (const bz of [-58, 40]) {
    ctx.fillRect(toX(184) - 3, toY(bz) - 3, 6, 6);
  }
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.arc(toX(CITY.casino.x), toY(CITY.casino.z), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a5200';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#2a9a6a';
  ctx.fillRect(toX(-108) - 3, toY(134) - 3, 6, 6);
  // District names, written on the map like the winners do.
  ctx.fillStyle = 'rgba(26,16,48,0.75)';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CORAL STRAND', toX(90), toY(72));
  ctx.fillText('DOWNTOWN', toX(0), toY(8));
  ctx.fillText('CASINO ROW', toX(88), toY(-112));
  ctx.fillText('THE DOCKS', toX(-70), toY(122));
  ctx.fillText('OCEAN BLVD', toX(0), toY(150));
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
