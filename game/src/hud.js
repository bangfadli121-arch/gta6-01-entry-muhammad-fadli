// The HUD: the DOM overlay on top of the 3D view — wanted stars, cash, health,
// the mission objective with its stage bar, speed, ammo, the minimap canvas
// and the message feed. It only writes text and styles; the game logic never
// reads it back. The denser panels are presentation of state the game already
// owns: the VSPD response list (each live police unit's distance and chase
// status), the mission-giver dialog bar (speaker + live objective), the
// clock (play time from the golden-hour start of 18:52), the vehicle line
// (the car Rico is driving) and the district name under the minimap.
import { drawMinimap } from './minimap.js';

const WANTED_LABELS = ['CLEAN', 'HEAT 1', 'HEAT 2', 'HEAT 3', 'HEAT 4', 'HEAT 5 — MAX'];

export function createHud(document) {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const starsEl = el('stars');
  const wantedLabel = el('wantedLabel');
  const cashNum = el('cashNum');
  const clockLine = el('clockLine');
  const healthBar = el('healthBar');
  const objectiveTitle = el('objectiveTitle');
  const objectiveText = el('objectiveText');
  const objectiveSub = el('objectiveSub');
  const stageBar = el('stageBar');
  const stageText = el('stageText');
  const speedNum = el('speedNum');
  const speedUnit = el('speedUnit');
  const vehicleLine = el('vehicleLine');
  const ammoNum = el('ammoNum');
  const slotAmmo = el('slotAmmo');
  const slotPistol = el('slotPistol');
  const messagesEl = el('messages');
  const crosshair = el('crosshair');
  const hintBox = el('hintBox');
  const minimap = el('minimap');
  const minimapLabel = el('minimapLabel');
  const policeList = el('policeList');
  const policeRows = el('policeRows');
  const dialogBar = el('dialogBar');
  const dialogFace = el('dialogFace');
  const dialogName = el('dialogName');
  const dialogText = el('dialogText');
  const status = el('status');

  let lastStars = -1;
  let lastCash = -1;
  let lastHealth = -1;
  let lastAmmo = -1;
  let lastObjective = '';
  let lastSpeed = -1;
  let lastPolice = '';
  let lastDialog = '';
  let lastClock = '';
  let lastVehicle = '';
  let lastLocation = '';
  let lastStage = '';

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

  /** The mission card's stage bar: which step of the mission is live. */
  function setStage(current, total) {
    const key = `${current}/${total}`;
    if (key === lastStage) return;
    lastStage = key;
    if (!total) {
      stageBar.style.width = '0%';
      stageText.textContent = 'FREE ROAM';
      return;
    }
    stageBar.style.width = `${Math.round((current / total) * 100)}%`;
    stageText.textContent = `STAGE ${current}/${total}`;
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
    slotAmmo.textContent = String(ammo);
    slotPistol.classList.toggle('on', ammo > 0);
  }

  /** The VSPD response list: one row per live unit — call sign, distance in
   * metres, and chase status derived from the unit's own state. */
  function setPolice(units) {
    const key = units.map((u) => `${u.name}|${u.dist}|${u.status}`).join(';');
    if (key === lastPolice) return;
    lastPolice = key;
    if (units.length === 0) {
      policeList.classList.add('hidden');
      return;
    }
    policeList.classList.remove('hidden');
    let html = '';
    for (const u of units) {
      html += `<div class="unit"><span>${u.name} &middot; ${u.dist}m</span><span class="st ${u.status}">${u.status}</span></div>`;
    }
    policeRows.innerHTML = html;
  }

  /** The dialog bar: the mission giver's portrait, name and the live
   * objective line. Hidden when no mission is running. The portraits are
   * small original flat-vector faces drawn inline — a grey-hat detective
   * for Orlo, a dark-bob profile for Mara — never a photo or a copy. */
  const PORTRAITS = {
    'DETECTIVE ORLO': '<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">'
      + '<rect width="44" height="44" fill="#274b63"/>'
      + '<path d="M4 44 Q22 30 40 44 Z" fill="#1d2f45"/>'
      + '<ellipse cx="22" cy="25" rx="9" ry="11" fill="#e8b88a"/>'
      + '<path d="M13 13 h18 l-2 -7 h-14 z" fill="#22303e"/>'
      + '<rect x="8" y="12" width="28" height="4" rx="2" fill="#22303e"/>'
      + '<rect x="14" y="23" width="7" height="4" rx="1" fill="#14141a"/>'
      + '<rect x="23" y="23" width="7" height="4" rx="1" fill="#14141a"/>'
      + '<rect x="21" y="24" width="2" height="2" fill="#14141a"/>'
      + '<rect x="18" y="32" width="8" height="3" rx="1" fill="#c8c8c8"/></svg>',
    'MARA KADE': '<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">'
      + '<rect width="44" height="44" fill="#5a2a4a"/>'
      + '<path d="M8 44 V20 Q8 6 22 6 Q36 6 36 20 V44 Z" fill="#241a20"/>'
      + '<ellipse cx="22" cy="25" rx="9" ry="11" fill="#f0c8a0"/>'
      + '<path d="M13 22 Q13 11 22 11 Q31 11 31 22 Q27 15 22 15 Q17 15 13 22 Z" fill="#241a20"/>'
      + '<circle cx="13" cy="31" r="1.4" fill="#ffd94a"/>'
      + '<ellipse cx="22" cy="33" rx="3.5" ry="1.6" fill="#d83a5a"/></svg>',
  };
  function setDialog(name, initials, text) {
    const key = `${name}|${initials}|${text}`;
    if (key === lastDialog) return;
    lastDialog = key;
    if (!name || !text) {
      dialogBar.classList.add('hidden');
      return;
    }
    dialogBar.classList.remove('hidden');
    dialogFace.innerHTML = PORTRAITS[name] ?? '';
    if (!PORTRAITS[name]) dialogFace.textContent = initials;
    dialogName.textContent = name;
    dialogText.textContent = text;
  }

  /** The clock: Day 1 from 18:52, one game minute per two seconds of play. */
  function setClock(text) {
    if (text === lastClock) return;
    lastClock = text;
    clockLine.textContent = text;
  }

  /** The vehicle line under the speed: the car Rico is driving, or on foot. */
  function setVehicle(text) {
    if (text === lastVehicle) return;
    lastVehicle = text;
    vehicleLine.textContent = text;
  }

  /** The district name under the minimap, from the player's position. */
  function setLocation(name) {
    if (name === lastLocation) return;
    lastLocation = name;
    minimapLabel.textContent = name;
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
    setStars, setCash, setHealth, setObjective, setStage, setSpeed, setAmmo,
    setPolice, setDialog, setClock, setVehicle, setLocation,
    message, announce, clearMessages,
    setCrosshair(on) { crosshair.style.display = on ? 'block' : 'none'; },
    setHint(text) { hintBox.textContent = text; },
    drawMinimap(view) { drawMinimap(minimap, view); },
  };
}
