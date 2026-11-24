import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cardTiming, flightFrames, hold, reducedMotion, reserve, queue, speedK, stepWait, landed, markLanded, clearLanded, resetCardStage,
} from "../cardAnimation";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("cardTiming", () => {
  it.each([
    [250, 300, 200], // the slide is clamp(.52 x speed, 300, 760); the pause between cards clamp(.45 x speed, 200, 900)
    [1000, 520, 450],
    [5000, 760, 900],
  ])("Rate of Play %i ms: slide %f, stagger %f, turn 420", (T, slide, stagger) => {
    expect(cardTiming(T)).toEqual({ slide, stagger, flip: 420, gap: 40 });
  });

  it("speedK is Rate of Play / 1000, 0.33 to 1.2", () => {
    expect([250, 1000, 5000].map(speedK)).toEqual([0.33, 1, 1.2]);
  });
});

describe("flightFrames", () => {
  const parts = (f) => f.transform.match(/translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) rotate\((-?[\d.e-]+)deg\)/).slice(1).map(Number);

  it("has four frames from the shoe to the card's own spot: -36 deg through -12 (45 %) and -5 (84 %) to the end rotation", () => {
    const frames = flightFrames(100, -60, 90);
    expect(frames.map((f) => f.offset)).toEqual([0, 0.45, 0.84, 1]);
    expect(parts(frames[0])).toEqual([100, -60, 54]); // 90 - 36
    expect(parts(frames[1])).toEqual([45, -27, 78]);
    expect(parts(frames[2])).toEqual([8, -4.8, 85]);
    expect(parts(frames[3])).toEqual([0, 0, 90]);
  });

  it("settles square (0 deg) by default", () => {
    expect(parts(flightFrames(10, 10).at(-1))).toEqual([0, 0, 0]);
  });
});

describe("reducedMotion", () => {
  it("follows the prefers-reduced-motion query", () => {
    vi.stubGlobal("matchMedia", vi.fn((q) => ({ matches: q === "(prefers-reduced-motion: reduce)" })));
    expect(reducedMotion()).toBe(true);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    expect(reducedMotion()).toBe(false);
  });

  it("is false where matchMedia does not exist (jsdom)", () => {
    expect(typeof matchMedia).toBe("undefined");
    expect(reducedMotion()).toBe(false);
  });
});

describe("reserve and stepWait", () => {
  it("reserve keeps the latest end, tells listeners, and undo restores only its own reservation", () => {
    const listener = vi.fn();
    queue.listeners.add(listener);
    const undoA = reserve(500);
    expect(queue.free).toBe(500);
    const undoB = reserve(900);
    expect(queue.free).toBe(900);
    expect(listener).toHaveBeenCalledTimes(2);
    undoA(); // not the latest: nothing to give back
    expect(queue.free).toBe(900);
    undoB(); // the latest: back to what it found
    expect(queue.free).toBe(500);
    reserve(100); // an earlier end never shortens the queue
    expect(queue.free).toBe(500);
  });

  it("StrictMode: mount, cleanup, mount reserves the same time once", () => {
    const first = reserve(700);
    first();
    reserve(700);
    expect(queue.free).toBe(700);
  });

  it.each([250, 1000, 5000])("stepWait(%i) is the Rate of Play with an empty queue", (T) => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(10_000);
    expect(queue.free).toBe(0);
    expect(stepWait(T)).toBe(T);
  });

  it.each([250, 1000, 5000])("stepWait(%i) waits for a busy queue, then a beat of 0.3 T", (T) => {
    vi.useFakeTimers();
    queue.free = performance.now() + 2000;
    expect(stepWait(T)).toBe(Math.max(T, 2000 + 0.3 * T));
    queue.free = performance.now() + 10; // a nearly done queue never makes the step earlier than T
    expect(stepWait(T)).toBe(Math.max(T, 10 + 0.3 * T));
  });
});

describe("hold", () => {
  it("takes the board's attention until released, and tells listeners on take and on release", () => {
    const listener = vi.fn();
    queue.listeners.add(listener);
    const release = hold();
    expect(queue.holds.size).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    const other = hold(); // each hold is its own: two cards at once
    expect(queue.holds.size).toBe(2);
    release();
    expect(queue.holds.size).toBe(1);
    expect(listener).toHaveBeenCalledTimes(3);
    other();
    expect(queue.holds.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("release is idempotent: a second call changes nothing and tells nobody", () => {
    const listener = vi.fn();
    const release = hold();
    const other = hold();
    queue.listeners.add(listener);
    release();
    release();
    expect(queue.holds.size).toBe(1); // the other hold is untouched
    expect(listener).toHaveBeenCalledTimes(1);
    other();
  });

  it("does not touch the reserved clock", () => {
    reserve(900);
    hold()();
    expect(queue.free).toBe(900);
  });

  it("with maxMs lets go by itself after that long (a background tab must never leave the board busy), telling the listeners once", () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    queue.listeners.add(listener);
    const release = hold(500);
    expect(queue.holds.size).toBe(1);
    vi.advanceTimersByTime(499);
    expect(queue.holds.size).toBe(1);
    vi.advanceTimersByTime(1);
    expect(queue.holds.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2); // taken, released
    release(); // a late release changes nothing
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("with maxMs, an early release cancels the timer", () => {
    vi.useFakeTimers();
    const release = hold(500);
    release();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("landed cards", () => {
  it("marks each card once, notifies listeners, and clears", () => {
    const listener = vi.fn();
    landed.listeners.add(listener);
    const v = landed.version;
    markLanded("a");
    markLanded("a");
    expect(landed.ids.has("a")).toBe(true);
    expect(landed.version).toBe(v + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    clearLanded();
    expect(landed.ids.size).toBe(0);
    expect(landed.version).toBe(v + 2);
    clearLanded(); // already empty: no change, no notice
    expect(landed.version).toBe(v + 2);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("resetCardStage", () => {
  it("empties the queue, its holds, the landed set and the listeners", () => {
    reserve(5000);
    hold();
    queue.listeners.add(() => {});
    markLanded("x");
    landed.listeners.add(() => {});
    resetCardStage();
    expect([queue.free, queue.holds.size, queue.listeners.size, landed.ids.size, landed.listeners.size]).toEqual([0, 0, 0, 0, 0]);
  });
});
