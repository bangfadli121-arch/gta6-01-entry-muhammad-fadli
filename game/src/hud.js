// The HUD: the DOM overlay on top of the 3D view — wanted stars, cash, health,
// the mission objective, speed, ammo, the minimap canvas and the message feed.
// It only writes text and styles; the game logic never reads it back.
import { drawMinimap } from './minimap.js';

const WANTED_LABELS = ['CLEAN', 'HEAT 1', 'HEAT 2', 'HEAT 3', 'HEAT 4', 'HEAT 5 — MAX'];

export function createHud(document) {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const starsEl = el('stars');
  const wantedLabel = el('wantedLabel');
  const cashNum = el('cashNum');
  const healthBar = el('healthBar');
  const objectiveTitle = el('objectiveTitle');
  const objectiveText = el('objectiveText');
  const objectiveSub = el('objectiveSub');
  const speedNum = el('speedNum');
  const speedUnit = el('speedUnit');
  const ammoNum = el('ammoNum');
  const messagesEl = el('messages');
  const crosshair = el('crosshair');
  const hintBox = el('hintBox');
  const minimap = el('minimap');
  const status = el('status');

  let lastStars = -1;
  let lastCash = -1;
  let lastHealth = -1;
  let lastAmmo = -1;
  let lastObjective = '';
  let lastSpeed = -1;

  function setStars(stars) {
    if (stars === lastStars) return;
    lastStars = stars;
    let html = '';
    for (let i = 0; i < 5; i += 1) html += i < stars ? '&#9733;' : '<span class="off">&#9733;</span>';
    starsEl.innerHTML = html;
    wantedLabel.textContent = WANTED_LABELS[stars];
  }

  function setCash(cash) {
    if (cash === lastCash) return;
    lastCash = cash;
    cashNum.textContent = String(Math.floor(cash));
  }

  function setHealth(health) {
    const value = Math.max(0, Math.round(health));
    if (value === lastHealth) return;
    lastHealth = value;
    healthBar.style.width = `${value}%`;
  }

  function setObjective(objective) {
    const key = `${objective.title}|${objective.text}|${objective.sub}`;
    if (key === lastObjective) return;
    lastObjective = key;
    objectiveTitle.textContent = objective.title;
    objectiveText.textContent = objective.text;
    objectiveSub.textContent = objective.sub;
  }

  function setSpeed(kmh, inCar) {
    const value = Math.round(kmh);
    if (value === lastSpeed && speedUnit.textContent.includes(inCar ? 'DRIVING' : 'ON FOOT')) return;
    lastSpeed = value;
    speedNum.textContent = String(value);
    speedUnit.textContent = inCar ? 'KM/H · DRIVING' : 'KM/H · ON FOOT';
  }

  function setAmmo(ammo) {
    if (ammo === lastAmmo) return;
    lastAmmo = ammo;
    ammoNum.textContent = String(ammo);
  }

  function clearMessages() {
    while (messagesEl.firstChild) messagesEl.removeChild(messagesEl.firstChild);
  }

  function message(text) {
    // The same message twice in a row is one message, not a stack of clones.
    const last = messagesEl.lastChild;
    if (last && last.textContent === text) return;
    const div = document.createElement('div');
    div.textContent = text;
    messagesEl.appendChild(div);
    while (messagesEl.children.length > 3) messagesEl.removeChild(messagesEl.firstChild);
    window.setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5200);
  }

  function announce(text) {
    status.textContent = text;
  }

  return {
    // Showing the HUD after a respawn or a mission restart starts the feed
    // fresh: stale "Busted" lines from the last life must not linger.
    show() { hud.classList.remove('hidden'); clearMessages(); },
    hide() { hud.classList.add('hidden'); },
    setStars, setCash, setHealth, setObjective, setSpeed, setAmmo, message, announce, clearMessages,
    setCrosshair(on) { crosshair.style.display = on ? 'block' : 'none'; },
    setHint(text) { hintBox.textContent = text; },
    drawMinimap(view) { drawMinimap(minimap, view); },
  };
}
