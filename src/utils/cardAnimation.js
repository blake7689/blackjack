// Card deal and flip animation (#6): the chosen timing, the queue every flight reserves its time in,
// and which cards have landed. One board shows at a time, so this state lives at module level.

export const EASING = "cubic-bezier(.2,.8,.2,1)";
const ARC = 40; // px the flight bows upward
const START_ROTATION = -12; // deg, settles to the card's own rotation
const SLIDE_SHARE = 0.35; // of Rate of Play
const SLIDE_CAP = 450; // ms
const FLIP = 450; // ms, never more than half of Rate of Play
const GAP = 40; // ms between one card landing and the next leaving
const BEAT_SHARE = 0.3; // of Rate of Play, the pause after the last card lands
export const SIDE_ROOM = 0.2; // of the card's width, on each side of a sideways double
const STEPS = 16;

// T is Rate of Play (ms). Only the slide follows it; a deal takes as long as its cards need.
export function cardTiming(T) {
  const slide = Math.min(SLIDE_SHARE * T, SLIDE_CAP);
  return { slide, stagger: slide + GAP, flip: Math.min(FLIP, T / 2), gap: GAP };
}

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Sampled quadratic curve from (dx, dy) away to the card's spot at (0, 0); the easing is applied to the whole timeline.
export function flightFrames(dx, dy, endRotation) {
  const len = Math.hypot(dx, dy) || 1;
  let ux = -dy / len, uy = dx / len;
  if (uy > 0) { ux = -ux; uy = -uy; } // bow upward
  const cx = dx / 2 + 2 * ux * ARC, cy = dy / 2 + 2 * uy * ARC;
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS, u = 1 - t;
    const x = u * u * dx + 2 * u * t * cx, y = u * u * dy + 2 * u * t * cy;
    return { transform: `translate(${x}px, ${y}px) rotate(${endRotation + START_ROTATION * u}deg)` };
  });
}

// Everything that flies or flips reserves its end time here. Cards outside the opening deal queue behind it,
// the board hides its buttons while it runs, and the game's automatic steps wait for it (stepWait).
export const queue = { free: 0, holds: new Set(), listeners: new Set() };
export function reserve(end) {
  const prev = queue.free;
  const mine = queue.free = Math.max(prev, end);
  queue.listeners.forEach((l) => l());
  return () => { if (queue.free === mine) queue.free = prev; }; // StrictMode's mount/cleanup/mount must not delay the second run
}

// A card holds the board busy until the browser reports its flight and flip finished: the clock above can run out first
// when frames come late (a slow device, a throttled tab), and the buttons must not wait on the clock alone.
export function hold() {
  const token = {};
  queue.holds.add(token);
  queue.listeners.forEach((l) => l());
  return () => { if (queue.holds.delete(token)) queue.listeners.forEach((l) => l()); };
}

// A step normally fires after Rate of Play T, but never while a card is still on its way: it waits for the animation, then a beat.
export function stepWait(T) {
  return Math.max(T, queue.free - performance.now() + BEAT_SHARE * T);
}

// Cards that have landed and finished flipping: a hand's total counts only these.
export const landed = { ids: new Set(), version: 0, listeners: new Set() };
const bump = () => { landed.version++; landed.listeners.forEach((l) => l()); };
export const markLanded = (id) => { if (!landed.ids.has(id)) { landed.ids.add(id); bump(); } };
export const clearLanded = () => { if (landed.ids.size) { landed.ids.clear(); bump(); } };

export function resetCardStage() {
  queue.free = 0;
  queue.holds.clear();
  queue.listeners.clear();
  landed.ids.clear();
  landed.listeners.clear();
}
