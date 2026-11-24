import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Sounds and haptics (#86, recorded files L2-9): fetched and decoded once per file when Sound is on, played from the decoded buffer, gated by the saved
// settings, never an error. Each test loads a fresh module (it keeps one lazily made AudioContext and the decoded buffers), a recording AudioContext and
// a fake fetch, so what a sound builds and requests can be counted.
const LENGTHS = { "deal.mp3": 0.533, "flip.mp3": 0.94, "chip.mp3": 0.21, "shuffle.mp3": 5.36, "win.mp3": 1.588, "lose.mp3": 5.709 }; // the measured files
let contexts;
let fetchMock;
let sound;
let added; // document listeners the fresh modules add, removed after each test so old modules never answer a later test's events

function RecordingContext() {
  const ctx = this;
  contexts.push(ctx);
  Object.assign(ctx, { currentTime: 10, state: "running", destination: { dest: true }, made: { gain: [], src: [] }, decoded: [], resumed: 0 });
  ctx.resume = () => { ctx.resumed++; };
  ctx.decodeAudioData = (data) => { ctx.decoded.push(data); return Promise.resolve({ duration: LENGTHS[data.file] }); };
  ctx.createGain = () => {
    const n = { gain: { set: [], ramps: [], setValueAtTime: (v, t) => n.gain.set.push([v, t]), linearRampToValueAtTime: (v, t) => n.gain.ramps.push([v, t]) }, connect: vi.fn() };
    ctx.made.gain.push(n);
    return n;
  };
  ctx.createBufferSource = () => { const n = { connect: vi.fn(), start: vi.fn() }; ctx.made.src.push(n); return n; };
}

const fileOf = (url) => url.split("/").pop();
const answer = async (url) => ({ ok: true, arrayBuffer: async () => ({ file: fileOf(url) }) });

beforeEach(async () => {
  contexts = [];
  fetchMock = vi.fn(answer);
  vi.stubGlobal("AudioContext", RecordingContext);
  vi.stubGlobal("fetch", fetchMock);
  added = [];
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((...a) => { added.push(a); add(...a); });
  vi.resetModules();
  sound = await import("../sound");
});
afterEach(() => { added.forEach(([t, f, o]) => document.removeEventListener(t, f, o)); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const on = (extra = {}) => sound.setSoundPrefs({ soundOn: true, soundVolume: 50, hapticsOn: false, ...extra });
const settle = () => new Promise((r) => setTimeout(r, 0)); // lets the fetch -> decode chains finish
const loaded = async (extra) => { on(extra); await settle(); }; // Sound on and every file decoded
const urls = () => fetchMock.mock.calls.map(([u]) => u).sort();
const FILES = Object.keys(LENGTHS).sort().map((f) => `/sounds/${f}`);

describe("loading", () => {
  it("does nothing while Sound is off: no context, no request, whatever the volume (a tap included)", () => {
    sound.setSoundPrefs({ soundOn: false, soundVolume: 100, hapticsOn: true });
    sound.playSound("deal");
    document.dispatchEvent(new Event("pointerdown"));
    sound.setSoundPrefs({ soundOn: "yes", soundVolume: 100 }); // only a real `true` turns it on
    sound.playSound("deal");
    expect(contexts).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is off before anything has set the prefs", () => {
    sound.playSound("win");
    expect(contexts).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switching Sound on fetches and decodes each of the six files once, from /sounds", async () => {
    on();
    expect(urls()).toEqual(FILES);
    await settle();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].decoded.map((d) => d.file).sort()).toEqual(Object.keys(LENGTHS).sort());
    on({ soundVolume: 80 }); // already on: a changed volume loads nothing more
    sound.playSound("deal");
    sound.playSound("win");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(contexts[0].decoded).toHaveLength(6);
  });

  it("a tap or key press while Sound is on makes the context and loads the files, so the first timer-driven sound is audible (iOS Safari)", async () => {
    vi.stubGlobal("AudioContext", undefined); // switched on before the browser offers Web Audio: nothing to do yet
    on();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal("AudioContext", RecordingContext);
    document.dispatchEvent(new Event("pointerdown"));
    expect(contexts).toHaveLength(1);
    expect(urls()).toEqual(FILES);
    document.dispatchEvent(new Event("keydown"));
    await settle();
    expect(contexts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(6); // running and loaded: nothing more to do
  });

  it("a gesture resumes a suspended context", () => {
    on();
    contexts[0].state = "suspended";
    document.dispatchEvent(new Event("keydown"));
    expect(contexts[0].resumed).toBe(1);
  });

  it("a gesture never throws when the context cannot be made or the fetch is missing", () => {
    on();
    vi.stubGlobal("AudioContext", function Broken() { throw new Error("blocked"); });
    sound.setSoundPrefs({ soundOn: false });
    on();
    expect(() => document.dispatchEvent(new Event("pointerdown"))).not.toThrow();
    vi.stubGlobal("AudioContext", RecordingContext);
    vi.stubGlobal("fetch", () => { throw new Error("no fetch"); });
    expect(() => document.dispatchEvent(new Event("pointerdown"))).not.toThrow();
  });

  it("the listeners are capturing and passive", () => {
    expect(added.map(([t, , o]) => [t, o])).toEqual([["pointerdown", { capture: true, passive: true }], ["pointerup", { capture: true, passive: true }], ["keydown", { capture: true, passive: true }]]);
  });

  it("a sound that is not decoded yet is skipped, never an error; the next one plays", async () => {
    on();
    expect(() => sound.playSound("deal")).not.toThrow();
    expect(contexts[0].made.src).toHaveLength(0);
    await settle();
    sound.playSound("deal");
    expect(contexts[0].made.src).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("a file that fails to load (a network error, a 404, a bad decode) is skipped without an error and asked for once more on the next play, then given up", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith("deal.mp3")) throw new Error("offline");
      if (url.endsWith("flip.mp3")) return { ok: false, status: 404 };
      if (url.endsWith("lose.mp3")) return { ok: true, arrayBuffer: async () => ({ file: "corrupt.mp3" }) };
      return answer(url);
    });
    vi.stubGlobal("AudioContext", function BadDecoder() { // a context that cannot decode the corrupt file
      RecordingContext.call(this);
      this.decodeAudioData = (data) => (data.file === "corrupt.mp3" ? Promise.reject(new Error("bad data")) : Promise.resolve({ duration: LENGTHS[data.file] }));
    });
    await loaded();
    const count = (name) => fetchMock.mock.calls.filter(([u]) => u.endsWith(`${name}.mp3`)).length;
    expect([count("deal"), count("flip"), count("lose")]).toEqual([1, 1, 1]);
    for (const name of ["deal", "flip", "lose", "chip"]) expect(() => sound.playSound(name)).not.toThrow();
    expect(contexts[0].made.src).toHaveLength(1); // chip loaded at once and played; the others were skipped
    await settle();
    expect([count("deal"), count("flip"), count("lose")]).toEqual([2, 2, 2]); // each is asked once more
    for (let i = 0; i < 3; i++) { for (const name of ["deal", "flip", "lose"]) sound.playSound(name); await settle(); }
    expect([count("deal"), count("flip"), count("lose")]).toEqual([2, 2, 2]); // no third request
    expect(contexts[0].made.src).toHaveLength(1);
  });

  it("a retry that works plays from then on", async () => {
    let first = true;
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith("win.mp3") && first) { first = false; throw new Error("offline"); }
      return answer(url);
    });
    await loaded();
    sound.playSound("win"); // skipped, and asked for again
    await settle();
    sound.playSound("win");
    expect(contexts[0].made.src).toHaveLength(1);
  });
});

describe("playSound", () => {
  it("an unknown name plays nothing", async () => {
    await loaded();
    sound.playSound("kaboom");
    sound.playSound();
    expect(contexts).toHaveLength(1); // only the one Sound-on made for loading
    expect(contexts[0].made.src).toHaveLength(0);
  });

  it.each([
    ["deal", "deal.mp3", 0.25, 0.283, 1.5],
    ["flip", "flip.mp3", 0.25, 0.5, 1.5],
    ["chip", "chip.mp3", 0, 0.21, 1],
    ["shuffle", "shuffle.mp3", 0.1, 3, 1.1],
    ["win", "win.mp3", 0, 1.588, 0.4],
    ["lose", "lose.mp3", 0, 2.5, 0.7],
  ])("%s plays %s from %s s for at most %s s, at %s x the volume, through one gain that fades out at the end", async (name, file, at, dur, gain) => {
    await loaded(); // volume 50
    sound.playSound(name);
    const [ctx] = contexts;
    expect(ctx.made.src).toHaveLength(1);
    const [src] = ctx.made.src;
    expect(src.buffer).toEqual({ duration: LENGTHS[file] });
    expect(src.start).toHaveBeenCalledWith(10, at, expect.closeTo(dur, 6));
    const [g] = ctx.made.gain;
    expect(src.connect).toHaveBeenCalledWith(g);
    expect(g.connect).toHaveBeenCalledWith(ctx.destination);
    const level = 0.5 * gain;
    const fade = Math.min(0.15, dur / 2);
    expect(g.gain.set).toEqual([[level, 10], [level, expect.closeTo(10 + dur - fade, 6)]]);
    expect(g.gain.ramps).toEqual([[0, expect.closeTo(10 + dur, 6)]]);
  });

  it("a maxMs shortens a sound (the shuffle stops with the on-screen shuffle) but never lengthens it", async () => {
    await loaded();
    sound.playSound("shuffle", 50, 1500);
    sound.playSound("shuffle", 50, 9000);
    sound.playSound("win", 50, 400);
    expect(contexts[0].made.src.map((s) => s.start.mock.calls[0][2])).toEqual([1.5, 3, 0.4]);
  });

  it("the volume (0-100) scales the gain; out-of-range and bad numbers are clamped, and with no argument the saved volume is used", async () => {
    await loaded({ soundVolume: 30 });
    sound.playSound("chip");
    sound.playSound("chip", 80);
    sound.playSound("chip", 250);
    sound.playSound("chip", -5);
    sound.playSound("chip", "loud");
    expect(contexts[0].made.gain.map((g) => g.gain.set[0][0])).toEqual([0.3, 0.8, 1, 0, 0]);
  });

  it("a volume of 0 is silent: the saved 0 is not replaced by the 50 default", async () => {
    await loaded({ soundVolume: 0 });
    sound.playSound("chip");
    expect(contexts[0].made.gain[0].gain.set[0][0]).toBe(0);
  });

  it("one context for the whole session, and a suspended context (autoplay policy) is resumed", async () => {
    await loaded();
    sound.playSound("deal");
    sound.playSound("shuffle");
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resumed).toBe(0); // running: no resume
    contexts[0].state = "suspended";
    sound.playSound("deal");
    expect(contexts[0].resumed).toBe(1);
    expect(contexts[0].made.src).toHaveLength(3); // and it still plays
  });

  it("a suspended context that has no resume() still plays", async () => {
    await loaded();
    contexts[0].state = "suspended";
    delete contexts[0].resume;
    expect(() => sound.playSound("deal")).not.toThrow();
    expect(contexts[0].made.src).toHaveLength(1);
  });

  it("a refused resume() (a rejected promise) is swallowed (an unhandled rejection would fail the run)", async () => {
    await loaded();
    contexts[0].state = "suspended";
    contexts[0].resume = vi.fn(() => Promise.reject(new Error("not allowed")));
    sound.playSound("deal");
    await settle();
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    expect(contexts[0].made.src).toHaveLength(1);
  });

  it("a resume() that returns something with no catch() (an old WebKit) still plays", async () => {
    await loaded();
    contexts[0].state = "suspended";
    contexts[0].resume = () => ({});
    expect(() => sound.playSound("deal")).not.toThrow();
    expect(contexts[0].made.src).toHaveLength(1);
  });

  it("a browser with no AudioContext is silent, not an error, and is asked again each time", async () => {
    vi.stubGlobal("AudioContext", undefined);
    on();
    expect(() => sound.playSound("win")).not.toThrow();
    expect(contexts).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal("AudioContext", RecordingContext); // it appears later (e.g. after permission): the next sound starts loading
    sound.playSound("win");
    expect(contexts).toHaveLength(1);
    await settle();
    sound.playSound("win");
    expect(contexts[0].made.src).toHaveLength(1);
  });

  it("an audio error is swallowed: a constructor that throws, and a node that throws mid-sound", async () => {
    vi.stubGlobal("AudioContext", function Broken() { throw new Error("blocked"); });
    expect(() => on()).not.toThrow();
    expect(() => sound.playSound("deal")).not.toThrow();
    vi.stubGlobal("AudioContext", RecordingContext);
    sound.playSound("deal"); // makes the context and starts loading
    await settle();
    contexts[0].createBufferSource = () => { throw new Error("no sources"); };
    expect(() => sound.playSound("deal")).not.toThrow();
  });
});

describe("setSoundPrefs", () => {
  it("coerces the volume to a number (a saved string works) and falls back to 50 for anything that is not one", async () => {
    await loaded();
    for (const [given, used] of [["30", 0.3], [undefined, 0.5], ["loud", 0.5], [Infinity, 0.5], [null, 0]]) {
      on({ soundVolume: given });
      sound.playSound("chip");
      expect(contexts[0].made.gain.at(-1).gain.set[0][0]).toBe(used);
    }
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
