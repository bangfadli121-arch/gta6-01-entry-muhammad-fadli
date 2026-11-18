// Sound for Vice Shores: every effect is synthesised live with the Web Audio
// API — oscillators and filtered noise, no audio files at all. Nothing here
// loads over the network, and nothing starts until the player presses a key
// or clicks, so the browser's autoplay rules are never fought. The engine is
// a pair of detuned oscillators whose pitch follows the car's speed, the
// siren is a slow two-tone wail, and the one-shots (gunshot, punch, crash,
// pickup chime, mission sting) are short envelopes over noise or a tone.
//
// The world owns one audio object and calls the small verbs below; the audio
// object never reads game state back, so muting is a single flag.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenOn = false;
  let sirenPhase = 0;

  /** Build the context lazily, on the first real gesture. */
  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // One second of white noise, reused by every noise-based effect.
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      // The engine hum: two saws a few hertz apart, through a low-pass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 58;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // The police siren: a sine that the update loop wails up and down.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch (err) {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** A short tone with an exponential decay envelope. */
  function tone(type, from, to, seconds, volume, when = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  /** A burst of filtered noise with a decay envelope. */
  function noise(seconds, volume, filterFreq, filterType = 'lowpass', when = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + seconds + 0.02);
  }

  return {
    /** Call from any key or click handler so the context unlocks. */
    resume,
    setMuted(value) {
      muted = !!value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },

    /** A UI blip for menus and the start screen. */
    click() { tone('square', 660, 660, 0.07, 0.12); },

    /** The pistol: a sharp crack plus a low thump. */
    shot() {
      noise(0.14, 0.5, 2800, 'highpass');
      tone('square', 190, 60, 0.12, 0.22);
    },

    /** A fist landing: a dull low thud. */
    punch() {
      noise(0.1, 0.35, 300);
      tone('sine', 120, 55, 0.1, 0.3);
    },

    /** A crash: noise burst scaled by how hard the hit was (0..1). */
    crash(hard) {
      const h = Math.max(0.15, Math.min(1, hard || 0.5));
      noise(0.28, 0.35 * h + 0.1, 900);
      tone('sine', 90, 38, 0.22, 0.3 * h);
    },

    /** A skid puff while the handbrake is down at speed. */
    skid() { noise(0.16, 0.1, 1400, 'bandpass'); },

    /** The reload click-clack: two short ticks. */
    reload() {
      tone('square', 900, 900, 0.04, 0.1);
      tone('square', 620, 620, 0.04, 0.1, 0.12);
    },

    /** A pickup chime: two rising notes. */
    pickup() {
      tone('sine', 660, 660, 0.12, 0.2);
      tone('sine', 990, 990, 0.2, 0.2, 0.1);
    },

    /** A mission sting: a little three-note rise. */
    sting() {
      tone('triangle', 392, 392, 0.16, 0.22);
      tone('triangle', 523, 523, 0.16, 0.22, 0.14);
      tone('triangle', 784, 784, 0.3, 0.22, 0.28);
    },

    /** A sad two-note fall for failing a step. */
    fail() {
      tone('triangle', 330, 330, 0.2, 0.2);
      tone('triangle', 233, 220, 0.35, 0.2, 0.18);
    },

    /** A car horn: two tones together, short. */
    honk() {
      tone('square', 370, 370, 0.22, 0.1);
      tone('square', 466, 466, 0.22, 0.08);
    },

    /** A cash-register ka-ching when a mission pays out. */
    cash() {
      tone('sine', 1244, 1244, 0.09, 0.16);
      tone('sine', 1661, 1661, 0.22, 0.16, 0.08);
    },

    /** Turn the police siren on or off; the wail itself lives in update. */
    setSiren(on) {
      sirenOn = !!on;
      if (!sirenOn && sirenGain && ctx) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    },

    /**
     * Called every frame by the world: the engine follows the car's speed
     * (0..1, silent on foot) and the siren wails while any unit hunts.
     */
    update(dt, speed01, inCar) {
      if (!ctx) return;
      if (engineGain) {
        const target = inCar ? 0.05 + speed01 * 0.085 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        const freq = 52 + speed01 * 130;
        engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.06);
        engineOsc2.frequency.setTargetAtTime(freq * 1.015 + 2, ctx.currentTime, 0.06);
        engineFilter.frequency.setTargetAtTime(380 + speed01 * 900, ctx.currentTime, 0.1);
      }
      if (sirenOsc && sirenGain) {
        if (sirenOn) {
          sirenPhase += dt * 1.6;
          const up = Math.sin(sirenPhase * Math.PI * 2) > 0;
          const target = up ? 920 : 640;
          sirenOsc.frequency.setTargetAtTime(target, ctx.currentTime, 0.05);
          sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
        }
      }
    },
  };
}
