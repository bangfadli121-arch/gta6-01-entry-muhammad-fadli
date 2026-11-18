// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between four screens: title, play, paused
// and busted/wasted. ?seed=N fixes the city. ?shot=cover|driving|onfoot|start
// (with &seed=N) stages that scene instead of running the loop, paints it and
// sets window.__shotReady for a screenshot.
import { STEP, THEME } from './config.js';
import { createGame } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { stageShot } from './shots.js';
import { loadGameTextures } from './textures.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

// Surface load-time errors for headless play-testing (read via CDP).
window.__errors = [];
window.__shotReady = false;
window.addEventListener('error', (event) => {
  window.__errors.push(String(event.message || event.error));
});

const canvas = document.getElementById('view');
const startScreen = document.getElementById('startScreen');
const pauseScreen = document.getElementById('pauseScreen');
const endScreen = document.getElementById('endScreen');
const endTitle = document.getElementById('endTitle');
const endText = document.getElementById('endText');
const saveLine = document.getElementById('saveLine');
const saveInfo = document.getElementById('saveInfo');
const status = document.getElementById('status');

// The GPU textures load (or fail over to nulls) BEFORE the game is built,
// so the city is never painted half-textured and the staged screenshots
// are deterministic. The status is exposed for headless play-testing.
const textures = await loadGameTextures();
window.__textures = textures.__status || { loaded: [], failed: [] };

const game = createGame(canvas, THEME, seed, textures);
window.__game = game;

function showOnly(element) {
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  if (element) element.classList.remove('hidden');
}

function runShot(name) {
  // Stage with the renderer off: hundreds of SwiftShader frames would take a
  // minute and the scene state does not depend on painting. Then paint on
  // animation frames, so the compositor picks up a fresh WebGL frame — a render
  // issued while the module is still evaluating never reaches the screenshot.
  game.setRenderEnabled(false);
  const scene = stageShot(name, game);
  game.setRenderEnabled(true);
  if (scene.screen === 'title') {
    showOnly(startScreen);
    game.hud.hide();
  } else {
    showOnly(null);
    game.hud.show();
  }
  // Paint on every animation frame until the browser takes the screenshot:
  // a fixed number of frames can be wiped by a late window resize (which
  // clears the drawing buffer), while a running loop always repaints after it.
  // The title screen proves this path reaches the screenshot.
  let painted = 0;
  function paint() {
    game.renderer.render();
    painted += 1;
    if (painted === 3) window.__shotReady = true;
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let save = game.loadSave();
  let endReason = '';

  function announce(message) {
    status.textContent = message;
  }

  function showTitle() {
    screen = 'title';
    game.state.screen = 'title';
    game.hud.hide();
    showOnly(startScreen);
    save = game.loadSave();
    if (save) {
      saveInfo.textContent = `$${Math.floor(save.cash)} cash, mission ${save.storyDone ? 'story done' : save.mission + 1}`;
      saveLine.classList.remove('hidden');
    } else {
      saveLine.classList.add('hidden');
    }
    announce('Vice Shores. Press Enter to start, or C to continue your save.');
  }

  function startGame(fromSave) {
    game.startGame(fromSave || null);
    input.clearShooting();
    screen = 'play';
    showOnly(null);
    announce('Playing. Mission 1: The Pickup.');
  }

  function showEnd(title, text) {
    screen = 'over';
    game.state.screen = 'over';
    endTitle.textContent = title;
    endText.textContent = text;
    showOnly(endScreen);
    announce(`${title}. ${text}`);
  }

  // Continue a save with C on the title screen.
  window.addEventListener('keydown', (event) => {
    if (screen === 'title' && event.code === 'KeyC' && save) startGame(save);
  });

  function handleActions(actions) {
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) startGame(null);
    } else if (screen === 'play') {
      if (actions & ACTION_PAUSE) {
        screen = 'paused';
        game.state.screen = 'paused';
        showOnly(pauseScreen);
        announce('Paused.');
      }
    } else if (screen === 'paused') {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        game.state.screen = 'play';
        showOnly(null);
        announce('Playing.');
      }
    } else if (screen === 'over') {
      if (actions & ACTION_CONFIRM) {
        game.respawn(endReason === 'busted' ? 200 : 100, endReason === 'busted' ? 'Busted' : 'Wasted');
        screen = 'play';
        game.state.screen = 'play';
        showOnly(null);
        announce('Back on the streets.');
      }
    }
  }

  let accumulator = 0;
  let last = performance.now();
  // World-bound action bits (enter / punch / reload / mute) are only read by
  // game.update, which runs on fixed steps: when a frame takes the actions
  // but no step is due, those bits must wait for the next frame's first step
  // instead of being dropped, or a keypress can vanish on a fast display.
  let pendingActions = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // One take per frame: the screen handler reads the menu keys, the world
    // reads the play keys from the same bits on its first step.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === 'title') {
      game.updateIdle(STEP);
    } else if (screen === 'play') {
      let stepActions = actions | pendingActions;
      pendingActions = 0;
      while (accumulator >= STEP && screen === 'play') {
        const event = game.update(STEP, input.axes(), stepActions, input.shooting);
        stepActions = 0;
        accumulator -= STEP;
        if (event === 'wasted' || event === 'busted') {
          endReason = event;
          showEnd(
            event === 'wasted' ? 'WASTED' : 'BUSTED',
            event === 'wasted'
              ? 'Rico is down. The hospital patches him up — for a fee.'
              : 'The VSPD takes Rico in. He posts bail and walks — $200 lighter.',
          );
          accumulator = 0;
          break;
        }
      }
      if (stepActions !== 0) pendingActions = stepActions;
    }
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      game.state.screen = 'paused';
      showOnly(pauseScreen);
      announce('Paused.');
    }
  });

  showTitle();
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
