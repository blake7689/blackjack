import { useContext, useLayoutEffect, useRef } from "react";
import { FlightContext } from "../context/FlightContext";
import { EASING, GLIDE, reducedMotion, spots } from "../utils/cardAnimation";

// When a hand grows, re-centres, or a split narrows the seats, the cards already down glide to their new x (FLIP, 360 ms). Positions are viewport coordinates,
// so a whole hand re-centring glides too. Only a change in the number of cards (or of seats, the stage's --n) glides: a scroll or resize that moves the row
// between two renders must not. Children carry `data-fk`, their stable key. Every card's spot is remembered in `spots`, so a card that changes hands in a
// split (a new element, FlyCard's `moved`) can glide from where it lay. //
export function useSmoothRow(rowRef) {
  const { enabled } = useContext(FlightContext);
  const prev = useRef({ x: new Map(), count: 0, seats: null });
  useLayoutEffect(() => {
    const kids = [...rowRef.current.children];
    kids.forEach((el) => el.getAnimations().forEach((an) => an.finish())); // measure the real layout, not a glide in progress
    const seats = rowRef.current.closest(".stage-in")?.style.getPropertyValue("--n") ?? null;
    const changed = kids.length !== prev.current.count || seats !== prev.current.seats;
    const next = new Map();
    for (const el of kids) {
      const r = el.getBoundingClientRect();
      const old = prev.current.x.get(el.dataset.fk);
      next.set(el.dataset.fk, r.left);
      spots.set(el.dataset.fk, { x: r.left, y: r.top });
      if (changed && old !== undefined && Math.abs(old - r.left) > 1 && enabled && !reducedMotion()) {
        el.animate([{ translate: `${old - r.left}px 0` }, { translate: "0 0" }], { duration: GLIDE, easing: EASING });
      }
    }
    prev.current = { x: next, count: kids.length, seats };
  });
}
