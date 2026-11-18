import { useEffect, useLayoutEffect, useRef } from "react";
import { hold, reducedMotion, reserve, speedK } from "../utils/cardAnimation";
import { playSound } from "../utils/sound";

// The shuffle (#83, DESIGN section 3), in the centre, in order, nothing fading: the shoe slides away (the discard pile with it, emptied), the deck comes
// down into the centre, riffles, goes back up off the top, then the shoe slides back. Lengths x k (Rate of Play / 1000, 0.33-1.2): shoe 780, down 620,
// riffle 1700, up 560, shoe 780: about 4.5 s at Normal, 1.5 s on Very fast. A tap on the table or the dock skips it (every move jumps to its end, the
// order stays). It reserves the board's time and holds it busy, so the next step (manual or automatic: auto deal waits through it) comes after; the hold
// lets go when it ends, on a skip tap, or after a timeout, whichever comes first, so a background tab can never leave the board busy.
const AWAY = 800, DOWN = 620, RIFFLE = 1700, UP = 560, BACK = 800; // each x k; the shoe's own slide is 780k and the next step waits a beat
const HALF = 7; // cards in each half of the riffled deck
const MID_K = 0.35; // the mid-round refill (Include cut card off): the same shuffle, short
const CARD_BACK = '<svg viewBox="0 0 250 363" focusable="false"><use href="#cardback"/></svg>';

// Plays when a new shoe is made (`seq` = state.shoeSeq changes; `mid`: the shoe ran out in a round) and on the board's first render when the round has not
// started (`enter`: PRE_DEAL with nothing seen). While it plays it reports through `set`: { away, emptied, pile } (the shoe and the pile are slid off, the pile
// has been emptied, and how many cards it held when the shuffle began, read at that moment), and null when it is over. It runs from ShuffleFx, which the board
// renders before the table: its effect must reserve the time before the cards that arrive in the same render (a refill mid-round) plan their flights.
export function useShuffle({ set: setShuf, seq, mid, speed, enter, pile }) {
  const shown = useRef(null); // the shoe the board has shuffled for; null until the first look
  const pileRef = useRef(pile);
  useEffect(() => { pileRef.current = pile; });

  useLayoutEffect(() => {
    const before = shown.current;
    if (before === seq) return;
    shown.current = seq;
    if ((before === null && !enter) || reducedMotion()) return;
    const stage = document.querySelector(".stage-in");
    if (!stage) return;
    const k = mid ? MID_K : speedK(speed);
    const total = (AWAY + DOWN + RIFFLE + UP + BACK) * k;
    playSound("shuffle");
    const undo = reserve(performance.now() + total + 100, true);
    const release = hold(total + 1500);
    let skipped = false, ended = false, box = null;
    const waits = new Set();
    const anims = new Set();
    const wait = (ms) => new Promise((resolve) => {
      if (skipped) return resolve();
      const done = () => { clearTimeout(timer); waits.delete(done); resolve(); };
      const timer = setTimeout(done, ms);
      waits.add(done);
    });
    const move = (el, frames, options) => {
      const anim = el.animate(frames, { fill: "both", ...options });
      anims.add(anim);
      if (skipped) anim.finish?.();
      return anim;
    };
    const skip = (e) => {
      if (!e.target.closest?.(".felt, .dock")) return;
      skipped = true;
      stage.style.setProperty("--shoe-t", "0ms");
      anims.forEach((a) => a.finish?.());
      [...waits].forEach((w) => w());
    };
    const end = () => {
      if (ended) return;
      ended = true;
      document.removeEventListener("click", skip, true);
      box?.remove();
      stage.style.removeProperty("--shoe-t");
      release();
      undo();
      setShuf(null);
    };
    document.addEventListener("click", skip, true);
    const safety = setTimeout(end, total + 1200);
    stage.style.setProperty("--shoe-t", `${Math.round(780 * k)}ms`); // the shoe and the pile move at the same pace
    setShuf({ away: true, emptied: false, pile: pileRef.current });

    (async () => {
      await wait(AWAY * k);
      if (ended) return;
      setShuf((s) => s && { ...s, emptied: true });
      box = document.createElement("div");
      box.className = "riffle";
      box.setAttribute("aria-hidden", "true");
      stage.appendChild(box);
      const ch = box.offsetHeight, cw = box.offsetWidth;
      box.style.top = `${Math.round((stage.clientHeight - ch) / 2)}px`;
      const up = -(box.offsetTop + ch + 30); // just above the felt's top edge
      const cards = Array.from({ length: 2 * HALF }, (_, c) => {
        const el = document.createElement("div");
        el.className = "rcard";
        el.innerHTML = CARD_BACK;
        el.style.zIndex = c;
        el.style.transform = `translate(0px, ${-c * 0.6}px)`;
        box.appendChild(el);
        return el;
      });
      move(box, [{ transform: `translateY(${up}px)` }, { transform: "translateY(0)" }], { duration: DOWN * k, easing: "cubic-bezier(.2,.7,.2,1)" });
      await wait(DOWN * k);
      if (ended) return;
      cards.forEach((el, c) => { // the deck splits into two halves and the cards interleave back
        const left = c % 2 === 0, j = c >> 1, side = left ? -1 : 1, tk = 0.34 + j * 0.06;
        const stack = `translate(0px, ${-c * 0.6}px)`;
        const half = `translate(${Math.round(side * cw * 0.66)}px, ${-j * 0.8}px) rotate(${side * 8}deg)`;
        move(el, [{ transform: stack, offset: 0 }, { transform: half, offset: 0.24 }, { transform: half, offset: Math.min(0.9, tk) },
          { transform: stack, offset: Math.min(0.97, tk + 0.07) }, { transform: stack, offset: 1 }], { duration: RIFFLE * k, easing: "cubic-bezier(.45,0,.25,1)" });
      });
      await wait(RIFFLE * k);
      if (ended) return;
      move(box, [{ transform: "translateY(0)" }, { transform: `translateY(${up}px)` }], { duration: UP * k, easing: "cubic-bezier(.6,0,.8,.3)" });
      await wait(UP * k);
      if (ended) return;
      box.remove();
      setShuf((s) => s && { ...s, away: false }); // the shoe slides back
      await wait(BACK * k);
      end();
    })();

    return () => {
      clearTimeout(safety);
      const finished = ended;
      end();
      if (!finished) shown.current = before; // cancelled (StrictMode, a newer shoe): the next run plays it
    };
    // Once per shoe: what it reads (speed, enter, mid) is what the board saw when the shoe was made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
}
