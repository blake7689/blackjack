// Card deal and flip animation (#6, retimed in #83 to DESIGN section 3): the chosen timing, the queue every flight reserves its time in,
// and which cards have landed. One board shows at a time, so this state lives at module level.

export const EASING = "cubic-bezier(.33,0,.15,1)"; // --e-weight: objects sliding on cloth
export const FLIP_EASING = "cubic-bezier(.65,0,.35,1)"; // --e-io: flips and light
const START_ROTATION = -36; // deg: it leaves the shoe's mouth at the shoe's angle (-36 through -12 to -5 at 84 %) and squares up
const GAP = 40; // ms between one card landing and the next leaving
const BEAT_SHARE = 0.3; // of Rate of Play, the pause after the last card lands
export const SIDE_ROOM = 0.2; // of the card's width, on each side of a sideways double
export const TURN = 420; // ms of a flip (the turn on landing, the hole card, a face-down double, the sweep)
export const TURN_AT = 0.8; // a dealt card starts turning at 80 % of its flight
export const GLIDE = 360; // ms a card already down glides when its hand grows, re-centres or a split narrows the seats

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// k = Rate of Play / 1000, 0.33-1.2: the shuffle and the peek follow it.
export const speedK = (T) => clamp(T / 1000, 0.33, 1.2);

// T is Rate of Play (ms). The slide follows it, and so does the pause between one card leaving and the next.
export function cardTiming(T) {
  return { slide: clamp(0.52 * T, 300, 760), stagger: clamp(0.45 * T, 200, 900), flip: TURN, gap: GAP };
}

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// From (dx, dy) away to the card's spot at (0, 0): the angle closes from -36 deg through -12 (at 45 %) to -5 (at 84 %); the easing is applied to the
// whole timeline. `endRotation` is the card's own rotation at rest (a sideways double: 90).
export function flightFrames(dx, dy, endRotation = 0) {
  return [[0, 1, START_ROTATION], [0.45, 0.45, -12], [0.84, 0.08, -5], [1, 0, 0]].map(([offset, near, turn]) => ({
    offset, transform: `translate(${dx * near}px, ${dy * near}px) rotate(${endRotation + turn}deg)`,
  }));
}

// Everything that flies or flips reserves its end time here. Cards outside the opening deal queue behind it, the board hides its buttons while it
// runs, and the game's automatic steps wait for it (stepWait). `gate` (the shuffle and the peek: `reserve(end, true)`) also holds back the opening
// deal's cards, which would otherwise start at once. Bet chip flights never reserve.
export const queue = { free: 0, gate: 0, holds: new Set(), listeners: new Set() };
export function reserve(end, gated = false) {
  const prev = queue.free;
  const prevGate = queue.gate;
  const mine = queue.free = Math.max(prev, end);
  if (gated) queue.gate = Math.max(prevGate, end);
  queue.listeners.forEach((l) => l());
  return () => { // StrictMode's mount/cleanup/mount must not delay the second run
    if (queue.free === mine) queue.free = prev;
    if (gated && queue.gate === Math.max(prevGate, end)) queue.gate = prevGate;
  };
}

// A card holds the board busy until the browser reports its flight and flip finished: the clock above can run out first
// when frames come late (a slow device, a throttled tab), and the buttons must not wait on the clock alone. With `maxMs` the hold
// lets go by itself after that long (the shuffle and the peek: a background tab must never leave the board busy).
export function hold(maxMs) {
  const token = {};
  const notify = () => queue.listeners.forEach((l) => l());
  queue.holds.add(token);
  notify();
  const timer = maxMs ? setTimeout(() => release(), maxMs) : 0;
  const release = () => { clearTimeout(timer); if (queue.holds.delete(token)) notify(); };
  return release;
}

// A step normally fires after Rate of Play T, but never while a card is still on its way: it waits for the animation, then a beat.
export function stepWait(T) {
  return Math.max(T, queue.free - performance.now() + BEAT_SHARE * T);
}

// Where each card on the table lay at its last render (by its key, viewport px): a card that changes hands in a split glides from there (useSmoothRow, FlyCard).
export const spots = new Map();

// Cards that have landed and finished flipping: a hand's total counts only these.
export const landed = { ids: new Set(), version: 0, listeners: new Set() };
const bump = () => { landed.version++; landed.listeners.forEach((l) => l()); };
export const markLanded = (id) => { if (!landed.ids.has(id)) { landed.ids.add(id); bump(); } };
export const clearLanded = () => { if (landed.ids.size) { landed.ids.clear(); bump(); } };

// The shoe (state.shoeSeq) the board last played or skipped its shuffle for (useShuffle): a board that mounts again for the same shoe, back from Settings, plays nothing (L2-11).
export const shuffled = { seq: null };

export function resetCardStage() {
  shuffled.seq = null;
  queue.free = 0;
  queue.gate = 0;
  queue.holds.clear();
  queue.listeners.clear();
  landed.ids.clear();
  landed.listeners.clear();
  spots.clear();
}
