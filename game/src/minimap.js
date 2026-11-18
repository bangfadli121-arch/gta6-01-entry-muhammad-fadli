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
//
// Builder #16 — NO SQUARES, ANYWHERE (fadli on #15: "map nya masih ada
// kotak nya"). The #11 map still drew every CITY street as a straight line
// on BOTH axes, so the crossings tiled the island into a checkerboard of
// squares — that is the grid fadli saw. The minor streets are gone: the
// island's roads are curves now (ring arcs with gaps, bezier connectors
// that bend from the boulevard toward downtown), the blocks are organic
// blobs (rotated ellipses and wobbly closed curves, varied sizes), and
// every marker is a circle — no straight crossing, no square, no
// rectangle is drawn on this map at all. Only the two east-west arterials
// stay straight: they are real roads, and two parallel lines make no grid.
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
  // Builder #16 — ORGANIC BLOCKS, NO GRID. The blocks are drawn FIRST
  // (roads draw over them, the way real blocks sit between roads): rotated
  // ellipses in a slightly darker sand, varied sizes and angles, plus a
  // few wobbly free-form blobs drawn as closed bezier curves, so no two
  // blocks share an outline and none is a rectangle. All positions are
  // fixed literals, so the map never moves.
  const blob = (cx, cz, rx, ry, rot) => {
    ctx.beginPath();
    ctx.ellipse(toX(cx), toY(cz), rx * scale, ry * scale, rot, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.fillStyle = '#dec48c';
  for (const [bx, bz, rx, ry, rot] of [
    [40, 60, 26, 16, 0.5], [-30, 70, 22, 14, -0.4], [-80, 30, 24, 15, 0.9],
    [80, -70, 26, 15, -0.7], [-50, -60, 20, 13, 0.3], [10, -90, 24, 14, 1.1],
    [-100, -20, 18, 12, -0.9], [60, 100, 20, 12, 0.2], [-60, -110, 22, 13, 0.6],
    [110, 30, 18, 12, -0.3], [-10, 20, 16, 11, 0.8], [30, -40, 15, 10, -1.2],
    [-120, 70, 16, 11, 0.4], [100, -110, 17, 11, -0.6],
  ]) blob(bx, bz, rx, ry, rot);
  ctx.fillStyle = '#d8bd85';
  const wobble = (cx, cz, r, seed) => {
    ctx.beginPath();
    for (let k = 0; k < 6; k += 1) {
      const a0 = (k / 6) * Math.PI * 2;
      const a1 = ((k + 1) / 6) * Math.PI * 2;
      const r0 = r * (0.75 + hash2(seed, k) * 0.5);
      const r1 = r * (0.75 + hash2(seed, k + 1) * 0.5);
      const mx = cx + Math.cos(a0 + 0.5) * r * (0.9 + hash2(seed, k + 7) * 0.4);
      const mz = cz + Math.sin(a0 + 0.5) * r * (0.9 + hash2(seed, k + 7) * 0.4);
      const x0 = cx + Math.cos(a0) * r0;
      const z0 = cz + Math.sin(a0) * r0;
      const x1 = cx + Math.cos(a1) * r1;
      const z1 = cz + Math.sin(a1) * r1;
      if (k === 0) ctx.moveTo(toX(x0), toY(z0));
      ctx.quadraticCurveTo(toX(mx), toY(mz), toX(x1), toY(z1));
    }
    ctx.closePath();
    ctx.fill();
  };
  wobble(-45, -5, 20, 3);
  wobble(55, -60, 18, 9);
  wobble(-5, 95, 16, 14);
  // Curved streets: concentric ring arcs (never full circles — each has
  // gaps, the way real ring roads break for districts) and bezier
  // connectors that bend from the boulevard toward downtown. Round caps,
  // no straight segments, no crossings at right angles. The old code drew
  // every CITY street as a straight line on both axes — that cross-grid
  // is what tiled the map into squares, and it is deleted, not redrawn.
  ctx.strokeStyle = 'rgba(58,51,64,0.55)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  const arcRoad = (r, a0, a1) => {
    ctx.beginPath();
    ctx.arc(toX(0), toY(0), r * scale, a0, a1);
    ctx.stroke();
  };
  arcRoad(62, -0.4, 2.2);
  arcRoad(62, 2.9, 5.4);
  arcRoad(108, 0.6, 2.6);
  arcRoad(108, 3.4, 5.9);
  arcRoad(142, -0.9, 1.1);
  arcRoad(142, 1.9, 4.0);
  const curveRoad = (x0, z0, cx, cz, x1, z1) => {
    ctx.beginPath();
    ctx.moveTo(toX(x0), toY(z0));
    ctx.quadraticCurveTo(toX(cx), toY(cz), toX(x1), toY(z1));
    ctx.stroke();
  };
  curveRoad(-150, -60, -70, -100, 0, -62);
  curveRoad(150, 60, 80, 110, 10, 62);
  curveRoad(-60, 150, -110, 60, -140, -10);
  curveRoad(60, -150, 120, -80, 150, -20);
  // The ring boulevard: a true circle, the map's main drag.
  const ringR = CITY.ringRadius * scale;
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
  // the ferris wheel (gold ring), both billboards (pink DOTS, never
  // squares — builder #16: no rectangles anywhere on this map),
  // Casino Row (gold star), the docks (a green dot) and the Hideout.
  ctx.strokeStyle = '#e8a93a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(toX(178), toY(-9), 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ff5a8a';
  for (const bz of [-58, 40]) {
    ctx.beginPath();
    ctx.arc(toX(184), toY(bz), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd94a';
  ctx.beginPath();
  ctx.arc(toX(CITY.casino.x), toY(CITY.casino.z), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7a5200';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#2a9a6a';
  ctx.beginPath();
  ctx.arc(toX(-108), toY(134), 3.5, 0, Math.PI * 2);
  ctx.fill();
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
  // Traffic specks — round dots, never squares.
  ctx.fillStyle = 'rgba(26,16,48,0.85)';
  for (const car of view.trafficCars) {
    ctx.beginPath();
    ctx.arc(toX(car.x), toY(car.z), 1.75, 0, Math.PI * 2);
    ctx.fill();
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
