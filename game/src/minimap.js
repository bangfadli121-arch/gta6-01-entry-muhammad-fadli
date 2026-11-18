// The minimap: a 2D canvas that draws the city from above — roads, the beach,
// the player as an arrow, police as flashing dots, traffic as specks and the
// mission marker as a pulsing diamond. One clear job, no three.js in here.
// Golden-hour colours: a warm sand base, pastel blocks and pale roads, so the
// map reads like the sunny city it shows instead of a night map.
import { CITY } from './config.js';

const WORLD = 440;

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
  ctx.fillStyle = '#f7d9a0';
  ctx.fillRect(0, 0, size, size);
  // Blocks.
  ctx.fillStyle = '#e8a87c';
  const half = CITY.blockSize / 2;
  for (let ix = 0; ix < 7; ix += 1) {
    for (let iz = 0; iz < 7; iz += 1) {
      const cx = -CITY.pitch * 3 + ix * CITY.pitch;
      const cz = -CITY.pitch * 3 + iz * CITY.pitch;
      if (cx > 150) continue;
      ctx.fillRect(toX(cx - half), toY(cz - half), CITY.blockSize * scale, CITY.blockSize * scale);
    }
  }
  // Roads.
  ctx.strokeStyle = '#fff6e0';
  ctx.lineWidth = CITY.roadWidth * scale;
  for (const s of CITY.streets) {
    ctx.beginPath(); ctx.moveTo(toX(s), 0); ctx.lineTo(toX(s), size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(s)); ctx.lineTo(size, toY(s)); ctx.stroke();
  }
  // Beach and ocean.
  ctx.fillStyle = '#ecc98a';
  ctx.fillRect(toX(CITY.beachX), 0, size - toX(CITY.beachX), size);
  ctx.fillStyle = '#2f7fa8';
  ctx.fillRect(toX(CITY.waterX), 0, size - toX(CITY.waterX), size);
  // Traffic specks.
  ctx.fillStyle = 'rgba(40,20,40,0.8)';
  for (const car of view.trafficCars) {
    ctx.fillRect(toX(car.x) - 1.5, toY(car.z) - 1.5, 3, 3);
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
  // The player: a white arrow that turns with the heading.
  ctx.save();
  ctx.translate(toX(view.player.x), toY(view.player.z));
  ctx.rotate(Math.atan2(Math.sin(view.player.heading), Math.cos(view.player.heading)) + Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5.5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // North tick, so the player can tell which way the map is turned.
  ctx.fillStyle = '#7a4a00';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', size / 2, 13);
}
