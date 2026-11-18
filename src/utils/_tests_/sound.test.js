import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Sounds and haptics (#86): synthesized with Web Audio, gated by the saved settings, never an error. Each test loads a fresh module (it keeps one
// lazily made AudioContext) and a recording AudioContext, so what a sound builds can be counted.
let contexts;
let sound;
let added; // document listeners the fresh modules add, removed after each test so old modules never answer a later test's events

function RecordingContext() {
  const ctx = this;
  contexts.push(ctx);
  Object.assign(ctx, { currentTime: 10, sampleRate: 8000, state: "running", destination: { dest: true }, made: { gain: [], osc: [], src: [], filter: [] }, buffers: 0, resumed: 0 });
  ctx.resume = () => { ctx.resumed++; };
  ctx.createBuffer = (channels, length) => { ctx.buffers++; const data = new Float32Array(length); return { length, getChannelData: () => data }; };
  ctx.createGain = () => { const n = { gain: { value: 1, set: [], ramps: [], setValueAtTime: (v, t) => n.gain.set.push([v, t]), exponentialRampToValueAtTime: (v, t) => n.gain.ramps.push([v, t]) }, connect: vi.fn() }; ctx.made.gain.push(n); return n; };
  ctx.createOscillator = () => { const n = { type: "", frequency: { set: [], ramps: [], setValueAtTime: (v, t) => n.frequency.set.push([v, t]), exponentialRampToValueAtTime: (v, t) => n.frequency.ramps.push([v, t]) }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }; ctx.made.osc.push(n); return n; };
  ctx.createBufferSource = () => { const n = { connect: vi.fn(), start: vi.fn(), stop: vi.fn() }; ctx.made.src.push(n); return n; };
  ctx.createBiquadFilter = () => { const n = { type: "", frequency: { value: 0 }, connect: vi.fn() }; ctx.made.filter.push(n); return n; };
}

beforeEach(async () => {
  contexts = [];
  vi.stubGlobal("AudioContext", RecordingContext);
  added = [];
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((...a) => { added.push(a); add(...a); });
  vi.resetModules();
  sound = await import("../sound");
});
afterEach(() => { added.forEach(([t, f, o]) => document.removeEventListener(t, f, o)); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const on = (extra = {}) => sound.setSoundPrefs({ soundOn: true, soundVolume: 50, hapticsOn: false, ...extra });
const voices = (ctx) => ({ osc: ctx.made.osc.length, noise: ctx.made.src.length });

describe("playSound", () => {
  it("does nothing while Sound is off: no context is even made, whatever the volume", () => {
    sound.setSoundPrefs({ soundOn: false, soundVolume: 100, hapticsOn: true });
    sound.playSound("deal");
    expect(contexts).toHaveLength(0);
    sound.setSoundPrefs({ soundOn: "yes", soundVolume: 100 }); // only a real `true` turns it on
    sound.playSound("deal");
    expect(contexts).toHaveLength(0);
  });

  it("is off before anything has set the prefs", () => {
    sound.playSound("win");
    expect(contexts).toHaveLength(0);
  });

  it.each([
    ["deal", { osc: 0, noise: 1 }],
    ["flip", { osc: 1, noise: 1 }],
    ["chip", { osc: 1, noise: 1 }],
    ["win", { osc: 2, noise: 0 }],
    ["lose", { osc: 2, noise: 0 }],
    ["shuffle", { osc: 0, noise: 6 }],
  ])("%s builds its voices and starts and stops each of them", (name, expected) => {
    on();
    sound.playSound(name);
    expect(contexts).toHaveLength(1);
    const [ctx] = contexts;
    expect(voices(ctx)).toEqual(expected);
    for (const n of [...ctx.made.osc, ...ctx.made.src]) {
      expect(n.start).toHaveBeenCalledTimes(1);
      expect(n.stop).toHaveBeenCalledTimes(1);
      expect(n.stop.mock.calls[0][0]).toBeGreaterThan(n.start.mock.calls[0][0]); // it ends after it starts
    }
    expect(ctx.made.filter).toHaveLength(expected.noise); // noise goes through one band-pass each
    ctx.made.filter.forEach((f) => expect(f.type).toBe("bandpass"));
    expect(ctx.made.gain).toHaveLength(1 + expected.osc + expected.noise); // the master gain and one envelope per voice
    expect(ctx.made.gain[0].connect).toHaveBeenCalledWith(ctx.destination);
  });

  it("an unknown name plays nothing, and does not even make a context", () => {
    on();
    sound.playSound("kaboom");
    sound.playSound();
    expect(contexts).toHaveLength(0);
  });

  it("each voice starts at the context's clock plus its own offset, with a fast attack and a decay (the shuffle's riffles are spread out)", () => {
    on();
    sound.playSound("shuffle");
    const starts = contexts[0].made.src.map((s) => s.start.mock.calls[0][0]);
    expect(starts).toEqual([10, 10.18, 10.36, 10.54, 10.72, 10.9].map((t) => expect.closeTo(t, 6)));
    const [, env] = contexts[0].made.gain; // the first voice's envelope
    expect(env.gain.set).toEqual([[0.0001, 10]]);
    expect(env.gain.ramps).toEqual([[0.3, expect.closeTo(10.008, 6)], [0.0001, expect.closeTo(10.12, 6)]]);
  });

  it("a tone glides from its pitch to its target pitch; a tone with no target holds its pitch", () => {
    on();
    sound.playSound("chip"); // 1900 -> 1200 Hz
    const [chipTone] = contexts[0].made.osc;
    expect(chipTone.type).toBe("triangle");
    expect(chipTone.frequency.set).toEqual([[1900, 10]]);
    expect(chipTone.frequency.ramps[0][0]).toBe(1200);
    sound.playSound("win"); // 660 Hz, no target
    const [winTone] = contexts[0].made.osc.slice(1);
    expect(winTone.type).toBe("sine");
    expect(winTone.frequency.ramps[0][0]).toBe(660);
  });

  it("the volume (0-100) is the master gain; out-of-range and bad numbers are clamped, and with no argument the saved volume is used", () => {
    on({ soundVolume: 30 });
    sound.playSound("deal");
    sound.playSound("deal", 80);
    sound.playSound("deal", 250);
    sound.playSound("deal", -5);
    sound.playSound("deal", "loud");
    const masters = contexts[0].made.gain.filter((_, i) => i % 2 === 0).map((g) => g.gain.value);
    expect(masters).toEqual([0.3, 0.8, 1, 0, 0]);
  });

  it("a volume of 0 is silent: the saved 0 is not replaced by the 50 default", () => {
    on({ soundVolume: 0 });
    sound.playSound("deal");
    expect(contexts[0].made.gain[0].gain.value).toBe(0);
  });

  it("one context for the whole session, one noise buffer, and a suspended context (autoplay policy) is resumed", () => {
    on();
    sound.playSound("deal");
    sound.playSound("shuffle");
    expect(contexts).toHaveLength(1);
    expect(contexts[0].buffers).toBe(1);
    expect(contexts[0].resumed).toBe(0); // running: no resume
    contexts[0].state = "suspended";
    sound.playSound("deal");
    expect(contexts[0].resumed).toBe(1);
    expect(contexts[0].made.src.at(-1).start).toHaveBeenCalled(); // and it still plays
  });

  it("a suspended context that has no resume() still plays", () => {
    on();
    sound.playSound("deal");
    contexts[0].state = "suspended";
    delete contexts[0].resume;
    expect(() => sound.playSound("deal")).not.toThrow();
    expect(contexts[0].made.src).toHaveLength(2);
  });

  it("a refused resume() (a rejected promise) is swallowed (an unhandled rejection would fail the run)", async () => {
    on();
    sound.playSound("deal");
    contexts[0].state = "suspended";
    contexts[0].resume = vi.fn(() => Promise.reject(new Error("not allowed")));
    sound.playSound("deal");
    await new Promise((r) => setTimeout(r, 0));
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    expect(contexts[0].made.src).toHaveLength(2);
  });

  it("a resume() that returns something with no catch() (an old WebKit) still plays", () => {
    on();
    sound.playSound("deal");
    contexts[0].state = "suspended";
    contexts[0].resume = () => ({});
    expect(() => sound.playSound("deal")).not.toThrow();
    expect(contexts[0].made.src).toHaveLength(2);
  });

  it("a browser with no AudioContext is silent, not an error, and is asked again each time", () => {
    vi.stubGlobal("AudioContext", undefined);
    on();
    expect(() => sound.playSound("win")).not.toThrow();
    expect(contexts).toHaveLength(0);
    vi.stubGlobal("AudioContext", RecordingContext); // it appears later (e.g. after permission): the next sound plays
    sound.playSound("win");
    expect(contexts).toHaveLength(1);
  });

  it("an audio error is swallowed: a constructor that throws, and a node that throws mid-sound", () => {
    on();
    vi.stubGlobal("AudioContext", function Broken() { throw new Error("blocked"); });
    expect(() => sound.playSound("deal")).not.toThrow();
    vi.stubGlobal("AudioContext", RecordingContext);
    sound.playSound("deal"); // makes the context
    contexts[0].createOscillator = () => { throw new Error("no oscillators"); };
    expect(() => sound.playSound("win")).not.toThrow();
  });
});

describe("setSoundPrefs", () => {
  it("coerces the volume to a number (a saved string works) and falls back to 50 for anything that is not one", () => {
    for (const [given, used] of [["30", 0.3], [undefined, 0.5], ["loud", 0.5], [Infinity, 0.5], [null, 0]]) {
      on({ soundVolume: given });
      sound.playSound("deal");
      expect(contexts[0].made.gain.at(-2).gain.value).toBe(used);
    }
  });
});

describe("unlock on a user gesture (iOS Safari)", () => {
  const gesture = (type) => document.dispatchEvent(new Event(type));

  it("a tap or key press makes the context while Sound is on, so the first timer-driven sound is audible", () => {
    on();
    expect(contexts).toHaveLength(0);
    gesture("pointerdown");
    expect(contexts).toHaveLength(1);
    gesture("keydown");
    expect(contexts).toHaveLength(1); // running: nothing more to do
  });

  it("a gesture resumes a suspended context", () => {
    on();
    gesture("pointerdown");
    contexts[0].state = "suspended";
    gesture("keydown");
    expect(contexts[0].resumed).toBe(1);
  });

  it("a gesture does nothing while Sound is off, and never throws when the context cannot be made", () => {
    sound.setSoundPrefs({ soundOn: false });
    gesture("pointerdown");
    expect(contexts).toHaveLength(0);
    on();
    vi.stubGlobal("AudioContext", function Broken() { throw new Error("blocked"); });
    expect(() => gesture("pointerdown")).not.toThrow();
  });

  it("the listeners are capturing and passive", () => {
    expect(added.map(([t, , o]) => [t, o])).toEqual([["pointerdown", { capture: true, passive: true }], ["keydown", { capture: true, passive: true }]]);
  });
});

describe("vibrate", () => {
  let calls;
  beforeEach(() => {
    calls = [];
    vi.stubGlobal("navigator", { vibrate: (p) => { calls.push(p); return true; } });
  });
  const haptics = (hapticsOn) => sound.setSoundPrefs({ soundOn: false, soundVolume: 50, hapticsOn });

  it("a win buzzes short-long-short, a loss once, longer", () => {
    haptics(true);
    sound.vibrate("win");
    sound.vibrate("lose");
    expect(calls).toEqual([[40, 60, 40], [120]]);
  });

  it("is independent of Sound: it buzzes with Sound off, and Sound on does not buzz without Vibration", () => {
    haptics(true);
    sound.vibrate("win");
    expect(calls).toHaveLength(1);
    sound.setSoundPrefs({ soundOn: true, soundVolume: 50, hapticsOn: false });
    sound.vibrate("win");
    sound.setSoundPrefs({ soundOn: true, soundVolume: 50 }); // missing is off
    sound.vibrate("win");
    expect(calls).toHaveLength(1);
  });

  it("a push, an unknown kind and no argument have no pattern", () => {
    haptics(true);
    sound.vibrate("push");
    sound.vibrate("nope");
    sound.vibrate();
    expect(calls).toEqual([]);
  });

  it("a device with no navigator.vibrate (iOS Safari), or no navigator, does nothing", () => {
    haptics(true);
    vi.stubGlobal("navigator", {});
    expect(() => sound.vibrate("win")).not.toThrow();
    vi.stubGlobal("navigator", undefined);
    expect(() => sound.vibrate("win")).not.toThrow();
  });

  it("a vibrate() that throws is swallowed", () => {
    haptics(true);
    vi.stubGlobal("navigator", { vibrate: () => { throw new Error("not allowed"); } });
    expect(() => sound.vibrate("lose")).not.toThrow();
  });
});
