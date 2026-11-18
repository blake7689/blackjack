// Table sounds and haptics (#86). Every sound is synthesized here with the Web Audio API (no audio files, no third-party assets, see public/CREDITS.md).
// The board mirrors the saved settings into `prefs` (setSoundPrefs); a call does nothing while its setting is off or the browser has no AudioContext /
// navigator.vibrate. Playing never waits for anything and never throws. //

const prefs = { soundOn: false, soundVolume: 50, hapticsOn: false };
export const setSoundPrefs = ({ soundOn, soundVolume, hapticsOn }) => {
  const v = Number(soundVolume);
  return Object.assign(prefs, { soundOn: soundOn === true, soundVolume: Number.isFinite(v) ? v : 50, hapticsOn: hapticsOn === true });
};

let ctx = null;
let noise = null;
const context = () => {
  if (!ctx && typeof AudioContext === "function") ctx = new AudioContext(); // lazily, on the first sound (a user gesture has happened by then)
  if (ctx?.state === "suspended") ctx.resume?.()?.catch?.(() => {}); // a refused resume is not an error
  return ctx;
};

// iOS Safari only lets a context start (or resume) inside a user gesture, and the first sound often comes from a timer. So every tap or key press makes / resumes it
// while Sound is on; once it runs this is one cheap check.
const unlock = () => { if (prefs.soundOn) try { context(); } catch { /* ignore */ } };
for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, unlock, { capture: true, passive: true });

// A short buffer of white noise, made once.
const noiseBuffer = (c) => {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate / 2, c.sampleRate);
    const data = noise.getChannelData(0);
    let s = 1; // own LCG, never Math.random: e2e seeds that (see CLAUDE.md)
    for (let i = 0; i < data.length; i++) data[i] = ((s = (s * 1664525 + 1013904223) >>> 0) / 2147483648) - 1;
  }
  return noise;
};

// One voice: a tone (`freq` to `to`, Hz) or a band of noise (`freq` = its centre), `dur` s long, starting `at` s from now, at `peak` of the volume.
function voice(c, out, { kind = "tone", freq, to = freq, at = 0, dur, peak = 1, type = "sine" }) {
  const t = c.currentTime + at;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  gain.connect(out);
  let src;
  if (kind === "noise") {
    src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = freq;
    src.connect(band);
    band.connect(gain);
  } else {
    src = c.createOscillator();
    src.type = type;
    src.frequency.setValueAtTime(freq, t);
    src.frequency.exponentialRampToValueAtTime(to, t + dur);
    src.connect(gain);
  }
  src.start(t);
  src.stop(t + dur + 0.02);
}

const SOUNDS = {
  deal: [{ kind: "noise", freq: 2600, dur: 0.07, peak: 0.5 }],
  flip: [{ kind: "noise", freq: 3800, dur: 0.05, peak: 0.35 }, { freq: 900, to: 600, at: 0.02, dur: 0.05, peak: 0.12, type: "triangle" }],
  chip: [{ freq: 1900, to: 1200, dur: 0.06, peak: 0.5, type: "triangle" }, { kind: "noise", freq: 5000, dur: 0.03, peak: 0.25 }],
  win: [{ freq: 660, dur: 0.16, peak: 0.5 }, { freq: 990, at: 0.12, dur: 0.3, peak: 0.5 }],
  lose: [{ freq: 330, to: 300, dur: 0.18, peak: 0.5, type: "triangle" }, { freq: 220, to: 160, at: 0.14, dur: 0.34, peak: 0.5, type: "triangle" }],
  shuffle: [0, 0.18, 0.36, 0.54, 0.72, 0.9].map((at) => ({ kind: "noise", freq: 2200, at, dur: 0.12, peak: 0.3 })),
};

// `volume` 0-100 (the soundVolume setting) maps straight to the master gain.
export function playSound(name, volume = prefs.soundVolume) {
  if (!prefs.soundOn || !SOUNDS[name]) return;
  try {
    const c = context();
    if (!c) return;
    const out = c.createGain();
    out.gain.value = Math.max(0, Math.min(100, Number(volume) || 0)) / 100;
    out.connect(c.destination);
    SOUNDS[name].forEach((v) => voice(c, out, v));
  } catch { /* a sound that cannot play is never an error */ }
}

const PATTERNS = { win: [40, 60, 40], lose: [120] };

export function vibrate(kind) {
  if (!prefs.hapticsOn || typeof navigator === "undefined" || typeof navigator.vibrate !== "function" || !PATTERNS[kind]) return;
  try { navigator.vibrate(PATTERNS[kind]); } catch { /* ignore */ }
}
