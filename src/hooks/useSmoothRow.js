import { useContext, useLayoutEffect, useRef } from "react";
import { FlightContext } from "../context/FlightContext";
import { EASING, reducedMotion } from "../utils/cardAnimation";

// When a card joins a row, the cards already there glide to their new x (FLIP). Positions are viewport coordinates,
// so a whole hand re-centring glides too. Only a change in the number of cards glides: a scroll or resize that moves the
// row between two renders must not. Children carry `data-fk`, their stable key.
export function useSmoothRow(rowRef) {
  const { enabled, timing } = useContext(FlightContext);
  const prev = useRef({ x: new Map(), count: 0 });
  useLayoutEffect(() => {
    const kids = [...rowRef.current.children];
    kids.forEach((el) => el.getAnimations().forEach((an) => an.finish())); // measure the real layout, not a glide in progress
    const next = new Map();
    for (const el of kids) {
      const x = el.getBoundingClientRect().left;
      const old = prev.current.x.get(el.dataset.fk);
      next.set(el.dataset.fk, x);
      if (kids.length !== prev.current.count && old !== undefined && Math.abs(old - x) > 1 && enabled && !reducedMotion()) {
        el.animate([{ translate: `${old - x}px 0` }, { translate: "0 0" }], { duration: timing.slide, easing: EASING });
      }
    }
    prev.current = { x: next, count: kids.length };
  });
}
