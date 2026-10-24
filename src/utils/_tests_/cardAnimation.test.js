import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cardTiming, flightFrames, hold, reducedMotion, reserve, queue, stepWait, landed, markLanded, clearLanded, resetCardStage,
} from "../cardAnimation";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("cardTiming", () => {
  it.each([
    [250, 87.5, 125],
    [1000, 350, 450],
    [5000, 450, 450], // the slide is capped at 450 ms
  ])("Rate of Play %i ms: slide %f, flip %f", (T, slide, flip) => {
    expect(cardTiming(T)).toEqual({ slide, stagger: slide + 40, flip, gap: 40 });
  });
});

describe("flightFrames", () => {
  const translate = (f) => f.transform.match(/translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/).slice(1).map(Number);

  it("has 17 frames from the shoe to the card's own spot, settling at the end rotation", () => {
    const frames = flightFrames(100, -60, 90);
    expect(frames).toHaveLength(17);
    expect(translate(frames[0])).toEqual([100, -60]);
    expect(frames[0].transform).toContain("rotate(78deg)"); // 90 - 12
    expect(translate(frames[16])).toEqual([0, 0]);
    expect(frames[16].transform).toContain("rotate(90deg)");
  });

  it.each([[120, 80], [120, -80], [-120, 80], [-120, -80], [0, 90], [0, -90], [90, 0], [0, 0]])(
    "bows upward for (dx %i, dy %i): the path never dips below the straight line",
    (dx, dy) => {
      const frames = flightFrames(dx, dy, 0);
      const ys = frames.map((f) => translate(f)[1]);
      // At each sample the point is above (smaller y than) the straight line from start to end.
      frames.forEach((f, i) => {
        const t = i / 16;
        expect(translate(f)[1]).toBeLessThanOrEqual(dy * (1 - t) + 1e-9);
      });
      const lift = Math.min(...frames.map((f, i) => translate(f)[1] - dy * (1 - i / 16)));
      if (dx) expect(lift).toBeLessThan(-10); // a real bow, not a straight line
      else if (dy) expect(Math.max(...frames.map((f) => Math.abs(translate(f)[0])))).toBeGreaterThan(10); // straight above/below the shoe it bows sideways
      expect(ys[16]).toBe(0);
    }
  );
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
