// Game speed (the Rate of Play, `playTimeout`, 250-5000 ms) on a 0-1000 slider (#84, DESIGN section 5). Four named stops sit evenly
// ([ms, name, position]); the last stretch runs on to "5 s". Positions near a stop snap to it; elsewhere the value is rounded to 25 ms
// (100 ms past Slow). Pure: Settings reads it, tests drive it. //
export const SPEED_STOPS = [[250, "Very fast", 0], [500, "Fast", 250], [1000, "Normal", 500], [1500, "Slow", 750]];
const POINTS = [[0, 250], [250, 500], [500, 1000], [750, 1500], [1000, 5000]]; // [slider position, ms]

export function posToMs(pos) {
  const near = SPEED_STOPS.find(([, , at]) => Math.abs(at - pos) <= 14);
  if (near) return near[0];
  const i = POINTS.findIndex(([p]) => pos <= p);
  const [p0, m0] = POINTS[i - 1];
  const [p1, m1] = POINTS[i];
  const step = i === 4 ? 100 : 25;
  return Math.round((m0 + ((m1 - m0) * (pos - p0)) / (p1 - p0)) / step) * step;
}

export function msToPos(ms) {
  const i = POINTS.findIndex(([, m]) => ms <= m);
  if (i < 1) return i === 0 ? 0 : 1000; // below Very fast, or past 5 s
  const [p0, m0] = POINTS[i - 1];
  const [p1, m1] = POINTS[i];
  return p0 + ((p1 - p0) * (ms - m0)) / (m1 - m0);
}

// The name of the nearest stop ("Normal").
export const speedName = (ms) => SPEED_STOPS.reduce((a, s) => (Math.abs(s[0] - ms) < Math.abs(a[0] - ms) ? s : a))[1];

// "Normal · 1.0 s": the nearest name and the exact seconds.
export const speedText = (ms) => `${speedName(ms)} · ${(ms / 1000).toFixed(ms % 100 ? 2 : 1)} s`;
