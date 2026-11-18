// Keyboard and mouse input, read as a plain state object the world steps with.
// Keys are tracked by code, so WASD and the arrows both work; actions (enter a
// car, punch, pause, reload, mute, confirm) are edge-triggered and consumed once.

export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_RELOAD = 16;
export const ACTION_MUTE = 32;

const KEY_ACTIONS = {
  KeyE: ACTION_ENTER, KeyF: ACTION_PUNCH, KeyP: ACTION_PAUSE, KeyR: ACTION_RELOAD, KeyM: ACTION_MUTE,
  Enter: ACTION_CONFIRM, Space: ACTION_CONFIRM,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let shooting = false;
  let mouseDown = false;

  function keyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) actions |= action;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  }
  function keyUp(event) {
    keys.delete(event.code);
  }
  // Alt-tabbing away mid-drive used to leave W held forever: dropping focus
  // clears every key, so the car never drives itself when the player returns.
  function onBlur() {
    keys.clear();
    shooting = false;
    mouseDown = false;
  }
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { mouseDown = true; shooting = true; }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) { mouseDown = false; shooting = false; }
  });
  canvas.addEventListener('click', () => {
    actions |= ACTION_CONFIRM;
  });
  // A click that starts the game (title screen) must not also fire the pistol
  // on the first frame of play: the menu consumes the click, the gun does not.
  function clearShooting() {
    shooting = false;
    mouseDown = false;
  }

  function down(...codes) {
    return codes.some((c) => keys.has(c));
  }

  return {
    /** Driving/walking axes: -1..1 each, from keys. */
    axes() {
      const forward = down('KeyW', 'ArrowUp') ? 1 : 0;
      const back = down('KeyS', 'ArrowDown') ? 1 : 0;
      const left = down('KeyA', 'ArrowLeft') ? 1 : 0;
      const right = down('KeyD', 'ArrowRight') ? 1 : 0;
      return {
        throttle: forward - back,
        steer: (left ? -1 : 0) + (right ? 1 : 0),
        brake: down('Space') ? 1 : 0,
        handbrake: down('ShiftLeft', 'ShiftRight') ? 1 : 0,
        run: down('ShiftLeft', 'ShiftRight') ? 1 : 0,
      };
    },
    get shooting() { return shooting; },
    get mouseDown() { return mouseDown; },
    clearShooting,
    /** Actions pressed since the last call; consuming them. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    dispose() {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
