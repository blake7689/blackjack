import { reducedMotion } from "./cardAnimation";
import { splitChips } from "./chips";
import { money } from "./money";
import { THICK } from "../components/Chip/Chip";

// Chips that fly (#83, DESIGN section 3): copies ("ghosts") in the flight layer that glide between the rack, the bet circle, the dock and above the
// table's edge. They are plain DOM, aria-hidden, and never reserve or hold the board's queue (a tap must not delay the dock); only the settle
// flights (payout) hand their length back so the caller can `reserve` it. Every call returns at once when motion is off, or when more than
// GHOSTS chips are already in the air (an old phone): then the change is simply instant. //
const EASE = "cubic-bezier(.33,0,.15,1)";
const FALL = "cubic-bezier(.5,0,.75,0)";
export const GHOSTS = 14;
export const BET_MS = 360; // a chip from the rack to the circle
export const BACK_MS = 380; // a stack back to the rack (Undo, Clear)
const BURST = 3; // chips in a Rebet / 2x burst
const BURST_GAP = 70;

const media = (q) => typeof matchMedia === "function" && matchMedia(q).matches;
const compact = () => media("(max-height: 520px), (min-width: 900px) and (min-aspect-ratio: 5/4)"); // the circle sits beside the hand
const landscape = () => media("(max-height: 520px)");
const ctr = (r) => [r.left + r.width / 2, r.top + r.height / 2];
const layer = () => document.querySelector(".flight-layer");
const rackChips = () => [...document.querySelectorAll(".rack .rc")];

const chipSVG = (v) => `<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#chip-${v}"/></svg>`;

// A stack seen from above, as Chip.jsx draws it (the mockup's stackSVG): the numeral on the top chip only when it is wide enough.
export function stackSVG(amount, px = 44) {
  const list = splitChips(amount);
  if (!list.length) return "";
  const n = list.length;
  const body = list.map((v, i) => {
    const y = (n - 1 - i) * THICK;
    return `<use href="#side-${v}" y="${i ? y + THICK : y + THICK * 0.6}" width="100" height="100"/><use href="#chip-${v}${i === n - 1 && px >= 44 ? "" : "-p"}" y="${y}" width="100" height="100"/>`;
  }).join("");
  return `<svg viewBox="0 0 100 ${100 + n * THICK}" style="--k:${(n - 1) * THICK + 50}" aria-hidden="true">${body}</svg>`;
}

// A ghost centred on (x, y), `w` px wide; null when motion is off or the layer is full.
function ghost(svg, [x, y], w, cls = "") {
  const l = layer();
  if (!l || !svg || reducedMotion() || l.querySelectorAll(".ghost").length >= GHOSTS) return null;
  const g = document.createElement("div");
  g.className = `ghost ${cls}`.trim();
  g.setAttribute("aria-hidden", "true");
  g.style.width = `${w}px`;
  g.style.setProperty("--chip", `${w}px`);
  g.innerHTML = svg;
  g.style.transform = `translate(${x - w / 2}px, ${y - w / 2}px)`;
  l.appendChild(g);
  return g;
}

// Moves a ghost centre to centre; it is removed when it arrives (unless `keep`). Opacity and scale go to their end values (s1, o1).
function glide(g, from, to, w, { dur = 420, delay = 0, ease = EASE, s0 = 1, s1 = 1, o0 = 1, o1 = 1, keep = false } = {}) {
  const at = (p, s, o) => ({ transform: `translate(${p[0] - w / 2}px, ${p[1] - w / 2}px) scale(${s})`, opacity: o });
  const anim = g.animate([at(from, s0, o0), at(to, s1, o1)], { duration: dur, delay, easing: ease, fill: "both" });
  if (!keep) {
    const end = () => g.remove();
    anim.onfinish = end;
    setTimeout(end, dur + delay + 150); // jsdom, and a background tab that never fires onfinish
  }
  return anim;
}

const stackWidth = (el) => el.querySelector(".stack")?.offsetWidth || el.offsetWidth * 0.6;
const pickedChip = () => document.querySelector('.rack .rc[aria-pressed="true"]') ?? rackChips()[0];
const dockTop = () => document.querySelector(".dock").getBoundingClientRect().top + 8;

// A bet of `amount` went into the circle: up to three chips glide from the rack, the burst for Rebet and 2x (a tap is one chip). Each leaves from the rack
// chip of its own value, or the selected one when the rack doesn't have it. Returns ms until the last one lands (the stack shows then), 0 if nothing flew.
export function chipsToSpot(spot, amount) {
  const rack = rackChips();
  if (!rack.length) return 0;
  const to = ctr(spot.getBoundingClientRect());
  const w = stackWidth(spot);
  let lands = 0;
  splitChips(amount).slice(0, BURST).forEach((v, i) => {
    const rc = rack.find((b) => b.getAttribute("aria-label") === `${money(v)} chip`) ?? pickedChip();
    const r = rc.getBoundingClientRect();
    const g = ghost(chipSVG(rc.dataset.chip), ctr(r), r.width);
    if (!g) return;
    const delay = i * BURST_GAP;
    glide(g, ctr(r), to, r.width, { dur: BET_MS, delay, s1: w / r.width });
    lands = delay + BET_MS;
  });
  return lands;
}

// Undo or Clear took `amount` off the circle: that stack glides back to the rack, shrinking and fading.
export function stackBack(spot, amount) {
  const from = ctr(spot.getBoundingClientRect());
  const w = stackWidth(spot);
  const rc = pickedChip();
  const g = ghost(stackSVG(amount, w), from, w);
  if (g) glide(g, from, rc ? ctr(rc.getBoundingClientRect()) : [innerWidth / 2, dockTop()], w, { dur: BACK_MS, s1: 0.8, o1: 0.2 });
}

// A double's second stake (or the insurance) goes down beside the circle: the stack comes up from the dock to the side spot. Returns ms until it lands.
export function stackToSide(side, amount) {
  const to = ctr(side.getBoundingClientRect());
  const w = stackWidth(side);
  const g = ghost(stackSVG(amount, w), [to[0], dockTop()], w);
  if (!g) return 0;
  glide(g, [to[0], dockTop()], to, w, { dur: BET_MS });
  return BET_MS;
}

// ---- settle (DESIGN section 3, Win / Loss / Push / Surrender / Insurance) ----
// The whole result of one seat, from the moment the stacks lift: win 560 + hold 240 + fall 720 (+60), loss hold 260 + 700, push 320 + 680, a part
// back (surrender, a refunded double) hold 260 + 700; the insurance stack adds nothing past that (it moves 700 after 300 at most).
export const PAYOUT_MS = { win: 1580, lose: 960, part: 960, push: 1000 };
export const payoutKind = (stake, ret) => (ret > stake ? "win" : ret === 0 ? "lose" : ret < stake ? "part" : "push");

// A stack leaves its spot as an exact copy, in the same frame the original hides: a chip never blinks out before it moves.
function lift(stack, restore) {
  const svg = stack?.querySelector("svg");
  const l = layer();
  if (!svg || !l || stack.closest("[hidden]") || reducedMotion()) return null;
  const r = svg.getBoundingClientRect();
  const g = document.createElement("div");
  g.className = "ghost lifted";
  g.setAttribute("aria-hidden", "true");
  g.style.width = `${r.width}px`;
  g.innerHTML = svg.outerHTML;
  g.style.transform = `translate(${r.left}px, ${r.top}px)`;
  l.appendChild(g);
  stack.style.visibility = "hidden";
  restore.push(() => { stack.style.visibility = ""; });
  return { g, r };
}

// Sends a lifted copy to (x, y) (its centre), shrinking and fading.
function send({ g, r }, [x, y], { dur = 420, delay = 0, ease = EASE, s1 = 1, o1 = 1 } = {}) {
  const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
  const anim = g.animate([{ transform: `translate(${r.left}px, ${r.top}px) scale(1)`, opacity: 1 },
    { transform: `translate(${r.left + dx}px, ${r.top + dy}px) scale(${s1})`, opacity: o1 }], { duration: dur, delay, easing: ease, fill: "both" });
  const end = () => g.remove();
  anim.onfinish = end;
  setTimeout(end, dur + delay + 150);
}

// One seat's chips settle: `stake` is what lay on the table (bet, double, insurance excluded), `ret` what the hand pays back (insurance excluded).
// Win: the dealer's chips come down from above the table's edge and land beside the stake on the side away from the hand (right of the circle in
// portrait, left on wide and landscape screens), hold, then everything slides down into the dock. Loss: the stack is swept up off the table's top edge.
// Push: the stake slides down. A part back (surrender): half goes up, half comes down. The insurance stack is paid 2:1 (down into the dock) or swept up.
// Returns { ms, cancel }: how long it takes, and a cancel that removes every ghost and shows the real stacks again. Null when it cannot fly.
export function payoutFx(seat, { stake, ret, insured, insurancePaid }) {
  const l = layer();
  const spot = seat.querySelector(".spot");
  const felt = document.querySelector(".felt");
  if (!l || !spot || !felt || reducedMotion()) return null;
  const timers = [];
  const restore = [];
  const own = []; // ghosts made here besides the lifted copies
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const c = ctr(spot.getBoundingClientRect());
  const w = stackWidth(spot);
  const f = felt.getBoundingClientRect();
  const tray = [f.left + f.width / 2, f.top - 30]; // the dealer's float: just above the table's edge
  const down = [c[0], dockTop()];
  // all lifted in this one frame
  const main = lift(spot.querySelector(".stack"), restore);
  const dbl = lift(seat.querySelector(".side-spot.dbl .stack"), restore);
  const ins = lift(seat.querySelector(".side-spot.ins .stack"), restore);
  if (ins) send(ins, insurancePaid ? [ins.r.left + ins.r.width / 2, dockTop()] : tray, insurancePaid ? { dur: 700, delay: 300, o1: 0 } : { dur: 700, s1: 0.6, o1: 0 });
  const kind = payoutKind(stake, ret);
  if (kind === "win") {
    const out = compact() ? -1 : 1; // wide and landscape: the hand is right of the circle, so the winnings land on its left
    const beside = [Math.max(f.left + w * 0.6, c[0] + out * w * 1.15 * (out < 0 && dbl && landscape() ? 2 : 1)), c[1]];
    const win = ghost(stackSVG(ret - stake, w), tray, w);
    if (win) own.push(win);
    if (win) glide(win, tray, beside, w, { dur: 560, keep: true });
    later(560 + 240, () => {
      const fall = { dur: 720, o1: 0, ease: FALL };
      if (main) send(main, down, fall);
      if (dbl) send(dbl, [down[0] + w * 0.6, down[1]], fall);
      if (win) glide(win, beside, [beside[0], down[1]], w, { ...fall, delay: 60 });
    });
  } else if (kind === "lose") {
    later(260, () => { [main, dbl].forEach((x) => x && send(x, tray, { dur: 700, s1: 0.45, o1: 0 })); });
  } else if (kind === "part") { // half goes up to the dealer, half comes back
    later(260, () => {
      [main, dbl].forEach((x) => x && send(x, tray, { dur: 700, s1: 0.45, o1: 0 }));
      const back = ghost(stackSVG(ret, w), c, w);
      if (back) { own.push(back); glide(back, c, down, w, { dur: 700, o1: 0 }); }
    });
  } else {
    later(320, () => { [main, dbl].forEach((x) => x && send(x, down, { dur: 680, o1: 0 })); });
  }
  const ms = Math.max(PAYOUT_MS[kind], insured ? 1000 : 0);
  const cancel = () => {
    timers.forEach(clearTimeout);
    restore.forEach((fn) => fn());
    own.forEach((g) => g.remove());
    l.querySelectorAll(".ghost.lifted").forEach((g) => g.remove());
  };
  return { ms, cancel };
}
