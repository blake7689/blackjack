import { describe, it, expect } from "vitest";
import { SPEED_STOPS, posToMs, msToPos, speedName, speedText } from "../gameSpeed";
import { SETTING_RANGES, initialGameState } from "../gameReducer";

// Game speed (#84): the Rate of Play (250-5000 ms) on a 0-1000 slider with four evenly placed stops.
describe("gameSpeed", () => {
  it("has the four named stops, evenly placed: Very fast 250, Fast 500, Normal 1000, Slow 1500", () => {
    expect(SPEED_STOPS).toEqual([[250, "Very fast", 0], [500, "Fast", 250], [1000, "Normal", 500], [1500, "Slow", 750]]);
  });

  it("the slider's ends are the Rate of Play range, and the default is a stop", () => {
    expect(posToMs(0)).toBe(SETTING_RANGES.playTimeout[0]);
    expect(posToMs(1000)).toBe(SETTING_RANGES.playTimeout[1]);
    expect(SPEED_STOPS.map(([ms]) => ms)).toContain(initialGameState.settings.playTimeout);
  });

  it("a position near a stop snaps to it (within 14), and one further away does not", () => {
    expect(posToMs(14)).toBe(250);
    expect(posToMs(236)).toBe(500);
    expect(posToMs(264)).toBe(500);
    expect(posToMs(490)).toBe(1000);
    expect(posToMs(760)).toBe(1500);
    expect(posToMs(15)).toBe(275);
    expect(posToMs(265)).not.toBe(500);
  });

  it("between stops the value is interpolated and rounded to 25 ms, and past Slow to 100 ms", () => {
    expect(posToMs(375)).toBe(750);
    expect(posToMs(600)).toBe(1200);
    expect(posToMs(900)).toBe(3600);
    expect(posToMs(999)).toBe(5000);
    for (const pos of [20, 100, 300, 420, 610, 700]) expect(posToMs(pos) % 25, `pos ${pos}`).toBe(0);
    for (const pos of [800, 850, 900, 950]) expect(posToMs(pos) % 100, `pos ${pos}`).toBe(0);
  });

  it("the position grows with the value, in step with posToMs, all the way across the slider", () => {
    let last = 0;
    for (let pos = 0; pos <= 1000; pos += 1) {
      const ms = posToMs(pos);
      expect(ms, `pos ${pos}`).toBeGreaterThanOrEqual(last);
      expect(ms).toBeGreaterThanOrEqual(250);
      expect(ms).toBeLessThanOrEqual(5000);
      last = ms;
    }
  });

  it("msToPos puts each stop and the ends where the slider expects them, and clamps what is out of range", () => {
    expect(SPEED_STOPS.map(([ms]) => msToPos(ms))).toEqual([0, 250, 500, 750]);
    expect(msToPos(5000)).toBe(1000);
    expect(msToPos(3250)).toBe(875);
    expect(msToPos(750)).toBe(375);
    expect(msToPos(100)).toBe(0); // below Very fast
    expect(msToPos(9000)).toBe(1000); // past 5 s
  });

  it("a stop survives the trip through the slider, and so does any 25 ms value outside a stop's snap zone", () => {
    for (const [ms] of SPEED_STOPS) expect(posToMs(msToPos(ms))).toBe(ms);
    const snaps = (ms) => SPEED_STOPS.some(([, , at]) => Math.abs(at - msToPos(ms)) <= 14);
    for (let ms = 250; ms <= 1500; ms += 25) if (!snaps(ms)) expect(posToMs(msToPos(ms)), `${ms} ms`).toBe(ms);
    expect(posToMs(msToPos(525))).toBe(500); // inside Fast's snap zone: it lands on the stop
  });

  it("speedName gives the nearest stop's name, the first one on a tie", () => {
    expect(SPEED_STOPS.map(([ms]) => speedName(ms))).toEqual(["Very fast", "Fast", "Normal", "Slow"]);
    expect(speedName(600)).toBe("Fast");
    expect(speedName(1250)).toBe("Normal");
    expect(speedName(5000)).toBe("Slow");
    expect(speedName(100)).toBe("Very fast");
  });

  it("speedText gives the nearest name and the exact seconds, to one decimal on a tenth and two otherwise", () => {
    expect(speedText(1000)).toBe("Normal · 1.0 s");
    expect(speedText(250)).toBe("Very fast · 0.25 s");
    expect(speedText(1250)).toBe("Normal · 1.25 s");
    expect(speedText(1200)).toBe("Normal · 1.2 s");
    expect(speedText(5000)).toBe("Slow · 5.0 s");
  });
});
