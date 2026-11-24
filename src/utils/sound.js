// Table sounds and haptics (#86, recorded sounds L2-9). The sounds are CC0 recordings in public/sounds (see public/CREDITS.md), fetched and decoded into
// AudioBuffers the first time Sound is on (never at app start) and played through the Web Audio API. The board mirrors the saved settings into `prefs`
// (setSoundPrefs); a call does nothing while its setting is off or the browser has no AudioContext / navigator.vibrate. Playing never waits for anything
// and never throws: a sound that is not decoded yet (or whose file failed) is skipped. Never use Math.random here: the e2e seeds depend on its draw count.

// To swap a sound: drop the new file in public/sounds, then change its row. `file` (in public/sounds), `at` = where playing starts in the file (s),
// `ms` = the longest it plays (0 = the whole file; it fades out over its last moments), `gain` = its level against the others (measured, not heard:
// the chip's peak is the reference). The deal and flip fire for every card, so only their useful part plays.
const SOUNDS = {
  deal: { file: "deal.mp3", at: 0.25, ms: 300, gain: 1.5 },
  flip: { file: "flip.mp3", at: 0.25, ms: 500, gain: 1.5 },
  chip: { file: "chip.mp3", at: 0, ms: 0, gain: 1 },
  shuffle: { file: "shuffle.mp3", at: 0.1, ms: 3000, gain: 1.1 },
  win: { file: "win.mp3", at: 0, ms: 0, gain: 0.4 },
  lose: { file: "lose.mp3", at: 0, ms: 2500, gain: 0.7 },
};
const FADE = 0.15; // s, the fade-out at the end of every sound (never longer than half of it)

const prefs = { soundOn: false, soundVolume: 50, hapticsOn: false };
export const setSoundPrefs = ({ soundOn, soundVolume, hapticsOn }) => {
  const was = prefs.soundOn;
  const v = Number(soundVolume);
  const set = Object.assign(prefs, { soundOn: soundOn === true, soundVolume: Number.isFinite(v) ? v : 50, hapticsOn: hapticsOn === true });
  if (!was) preload(); // Sound has just been switched on (a no-op while it is off)
  return set;
};

let ctx = null;
const context = () => {
  if (!ctx && typeof AudioContext === "function") ctx = new AudioContext(); // lazily: when Sound is on at the first table render (setSoundPrefs), possibly suspended until the next gesture, or at the first sound
  if (ctx?.state === "suspended") ctx.resume?.()?.catch?.(() => {}); // a refused resume is not an error
  return ctx;
};

// name -> the decoded AudioBuffer; null while it loads or after it has failed twice; absent until asked for.
const buffers = new Map();
const failed = new Set();
function load(name) {
  if (buffers.has(name)) return;
  buffers.set(name, null);
  fetch(`/sounds/${SOUNDS[name].file}`)
    .then((r) => { if (!r.ok) throw new Error(`sound ${name}: ${r.status}`); return r.arrayBuffer(); })
    .then((data) => ctx.decodeAudioData(data))
    .then((buf) => buffers.set(name, buf), () => { if (!failed.has(name)) { failed.add(name); buffers.delete(name); } }); // one more try, on the next play
}

// Makes the context and starts loading all six files, so the first deal does not lag. Runs when Sound is switched on, and on every tap or key press
// while it is on (iOS Safari only lets a context start or resume inside an activating event, so pointerup counts too, and the first sound often comes from a timer); once everything
// is loaded and running it is a few cheap checks.
function preload() {
  if (!prefs.soundOn) return;
  try { if (context()) Object.keys(SOUNDS).forEach(load); } catch { /* ignore */ }
}
for (const type of ["pointerdown", "pointerup", "keydown"]) document.addEventListener(type, preload, { capture: true, passive: true });

// `volume` 0-100 (the soundVolume setting) maps straight to the master gain; `maxMs` shortens the sound further (the shuffle is cut at the on-screen shuffle's length).
export function playSound(name, volume = prefs.soundVolume, maxMs = Infinity) {
  const s = SOUNDS[name];
  if (!prefs.soundOn || !s) return;
  try {
    const c = context();
    if (!c) return;
    const buf = buffers.get(name);
    if (!buf) return load(name); // not decoded yet: this one is skipped (a failed one is asked for once more)
    const dur = Math.min(buf.duration - s.at, Math.min(s.ms || Infinity, maxMs) / 1000);
    const level = (Math.max(0, Math.min(100, Number(volume) || 0)) / 100) * s.gain;
    const t = c.currentTime;
    const gain = c.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.setValueAtTime(level, t + dur - Math.min(FADE, dur / 2));
    gain.gain.linearRampToValueAtTime(0, t + dur);
    gain.connect(c.destination);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start(t, s.at, dur);
  } catch { /* a sound that cannot play is never an error */ }
}

const PATTERNS = { win: [40, 60, 40], lose: [120] };

export function vibrate(kind) {
  if (!prefs.hapticsOn || typeof navigator === "undefined" || typeof navigator.vibrate !== "function" || !PATTERNS[kind]) return;
  try { navigator.vibrate(PATTERNS[kind]); } catch { /* ignore */ }
}
