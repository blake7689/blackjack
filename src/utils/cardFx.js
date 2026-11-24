import { EASING, FLIP_EASING, TURN, reducedMotion } from "./cardAnimation";

// Table motion that is plain DOM over what React drew (#83, DESIGN section 3): the end-of-round sweep, the peek's mirror check and the cut card's
// flight. Each returns what the caller needs to reserve the time, and a cancel; all of them are a no-op under reduced motion. //

export const SWEEP_MS = 620; // each card, to the discard pile
export const SWEEP_GAP = 45; // between one card leaving and the next, the dealer's first
export const CUT_MS = 760;
export const PEEK = { up: 420, hold: 450, down: 420 }; // x k (speed / 1000, 0.33-1.2)

const CARD_BACK = '<svg viewBox="0 0 250 363" focusable="false"><use href="#cardback"/></svg>';

// End of round: every card on the table sweeps off to the discard pile (top left), the dealer's first, 45 ms apart, turning face down as it starts and
// landing square, centre on the pile's top card (L2-10: not on its visible corner: a copy landing lower than the card it covers jumped up when it went, and showed a
// logo the pile never shows). The real cards hide in the frame their copy appears and go with the round's state a moment later. The copies are swept inside the felt
// (in the table, which the felt clips): the pile's corner and the cards end at its edge, never over the top bar. Returns { ms, cancel } or null.
export function sweepCards() {
  const layer = document.querySelector(".stage-in");
  const pile = document.querySelector(".discard .discard-card");
  const cards = [...document.querySelectorAll(".dealer-hand .fan-row .card, .seats .fan-row .card")];
  if (!layer || !pile || !cards.length || reducedMotion()) return null;
  const m = pile.getBoundingClientRect();
  const px = m.left + m.width / 2, py = m.top + m.height / 2; // where each copy ends: the middle of the pile's top card
  const o = layer.getBoundingClientRect();
  const made = [];
  cards.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const w = el.offsetWidth, h = el.offsetHeight;
    const img = el.querySelector(".cf img");
    const sideways = el.style.rotate === "90deg";
    const copy = document.createElement("div");
    copy.className = `fly-copy sweep ${img ? "up" : "down"}`;
    copy.setAttribute("aria-hidden", "true");
    copy.innerHTML = `<div class="cin"><div class="cf">${img ? `<img src="${img.getAttribute("src")}" alt="" draggable="false">` : ""}</div><div class="cb">${CARD_BACK}</div></div>`;
    Object.assign(copy.style, { position: "absolute", left: `${cx - w / 2 - o.left}px`, top: `${cy - h / 2 - o.top}px`, width: `${w}px`, height: `${h}px`, borderRadius: `${w * 0.07}px`, zIndex: 40 + i, willChange: "transform" });
    layer.appendChild(copy);
    el.style.visibility = "hidden";
    const delay = i * SWEEP_GAP;
    copy.animate([{ translate: "0 0", rotate: sideways ? "90deg" : "0deg" }, { translate: `${px - cx}px ${py - cy}px`, rotate: "0deg" }],
      { duration: SWEEP_MS, delay, easing: "cubic-bezier(.5,0,.2,1)", fill: "both" });
    if (img) copy.firstChild.animate([{ transform: "rotateY(180deg)" }, { transform: "rotateY(0deg)" }], { duration: TURN, delay, easing: FLIP_EASING, fill: "both" });
    made.push({ el, copy });
  });
  const ms = SWEEP_MS + (cards.length - 1) * SWEEP_GAP;
  const clear = () => made.forEach(({ copy }) => copy.remove());
  const timer = setTimeout(clear, ms + 100);
  return { ms, cancel: () => { clearTimeout(timer); clear(); made.forEach(({ el }) => { el.style.visibility = ""; }); } };
}

// The mirror check (US peek, an ace or a ten up): the hole card slides up so its top edge tucks under the felt's top (about 14 % of the card), holds, and
// slides back; at least 85 % of it stays in view every frame and its face never shows (the card is still the face-down element). Up 420k, hold 450k,
// down 420k ms. Returns { ms, cancel } or null (no hole card on the table).
export function mirrorCheck(k) {
  const hole = document.querySelector('.dealer-hand [data-fk="hole"] .card');
  const felt = document.querySelector(".felt");
  if (!hole || !felt || reducedMotion()) return null;
  const r = hole.getBoundingClientRect();
  const up = -Math.ceil(r.top - felt.getBoundingClientRect().top + r.height * 0.14);
  const out = hole.animate([{ translate: "0 0" }, { translate: `0 ${up}px` }], { duration: PEEK.up * k, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" });
  const back = hole.animate([{ translate: `0 ${up}px` }, { translate: "0 0" }], { duration: PEEK.down * k, delay: (PEEK.up + PEEK.hold) * k, easing: "cubic-bezier(.25,1,.5,1)", fill: "forwards" });
  const ms = (PEEK.up + PEEK.hold + PEEK.down) * k;
  const cancel = () => { clearTimeout(timer); out.cancel(); back.cancel(); };
  const timer = setTimeout(cancel, ms + 50);
  return { ms, cancel };
}

// The cut card comes out of the shoe and lies at the felt's left edge until the shuffle.
export function cutFly(el) {
  const mouth = document.querySelector(".shoe .mouth");
  if (!el || !mouth || reducedMotion()) return;
  const r = el.getBoundingClientRect(), m = mouth.getBoundingClientRect();
  el.animate([{ translate: `${m.left - (r.left + r.width / 2)}px ${m.top - (r.top + r.height / 2)}px`, rotate: "-36deg" }, { translate: "0 0", rotate: "0deg" }], { duration: CUT_MS, easing: EASING });
}
