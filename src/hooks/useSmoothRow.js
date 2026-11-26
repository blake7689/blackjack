import { useContext, useLayoutEffect, useRef } from "react";
import { FlightContext } from "../context/FlightContext";
import { EASING, GLIDE, reducedMotion, spotOf, spots } from "../utils/cardAnimation";

// When a hand grows, re-centres, or a split narrows the seats, the cards already down glide to their new spot (FLIP, 360 ms, x and y as the mockup's glideMoved). Positions are `spotOf` ones,
// so a whole hand re-centring glides too. Only a change in the number of cards (or of seats, the stage's --n) glides: a scroll or resize that moves the row
// between two renders must not. Children carry `data-fk`, their stable key. Every card's spot is remembered in `spots`, so a card that changes hands in a
// split (a new element, FlyCard's `moved`) can glide from where it lay. //
export function useSmoothRow(rowRef) {
  const { enabled } = useContext(FlightContext);
  const prev = useRef({ at: new Map(), count: 0, seats: null });
  useLayoutEffect(() => {
    const kids = [...rowRef.current.children];
    kids.forEach((el) => el.getAnimations().forEach((an) => an.finish())); // measure the real layout, not a glide in progress
    const seats = rowRef.current.closest(".stage-in")?.style.getPropertyValue("--n") ?? null;
    const changed = kids.length !== prev.current.count || seats !== prev.current.seats;
    const next = new Map();
    for (const el of kids) {
      const at = spotOf(el);
      const old = prev.current.at.get(el.dataset.fk);
      next.set(el.dataset.fk, at);
      spots.set(el.dataset.fk, at);
      if (changed && old && enabled && !reducedMotion() && (Math.abs(old.x - at.x) > 1 || Math.abs(old.y - at.y) > 1)) {
        el.animate([{ translate: `${old.x - at.x}px ${old.y - at.y}px` }, { translate: "0 0" }], { duration: GLIDE, easing: EASING });
      }
    }
    prev.current = { at: next, count: kids.length, seats };
  });
}
