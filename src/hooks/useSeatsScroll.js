import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { reducedMotion } from "../utils/cardAnimation";

// Whether the seats scroll one hand at a time (DESIGN section 4), and keeping the hand in play centred while they do.
// Up to four hands share one centred row; five or more scroll, and so does a row that does not fit (four on a small landscape phone):
// anything of a seat reaching past the row's edge. The decision is made once per hand count and stage width (a re-render never resets it),
// and only ever turns scrolling on within that pair. Returns [`scroll`, `sync`]: `sync` decides and puts the class on the row at once, so
// CardWidthSync can call it before the seats measure (#193); this hook's own effect checks again after them (for a size a seat's effect set).
// `layoutKey` (#140, GameBoard): a string that changes whenever a box measured here changes size (cards, bets, tags, phase...); the overflow check runs
// only when it, the stage width, the hand count or `scroll` changes, never on a plain re-render.
// `betting` (#59): the row holds the empty betting seats, decided apart from a round with as many hands (or it could stay scrolling after one). //
export function useSeatsScroll(seatsRef, stageRef, count, active, layoutKey, betting = false) {
  const [width, setWidth] = useState(0);
  const [scroll, setScroll] = useState(false);
  const decided = useRef(""); // the count@width the row was decided for
  const measured = useRef(""); // ... with the layoutKey it was last measured at
  const pair = `${count}@${width}${betting ? " betting" : ""}`;
  const stamp = `${pair},${layoutKey}`;

  useEffect(() => {
    const stage = stageRef.current;
    const update = () => setWidth(Math.round(stage.clientWidth));
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(stage);
    return () => observer?.disconnect();
  }, [stageRef]);

  const decide = () => {
    const seats = seatsRef.current;
    const was = seats.classList.contains("scroll"); // the class, not the state: `sync` may have changed it in this commit
    let on = decided.current === pair ? was : count > 4;
    decided.current = pair;
    measured.current = stamp;
    if (!on && count > 1) {
      const left = seats.scrollLeft;
      seats.classList.remove("scroll"); // measured as one centred row
      const row = seats.getBoundingClientRect();
      on = [...seats.querySelectorAll(".spot-row, .hand, .pill, .side-spot .stack svg")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.width && (r.left < row.left - 1 || r.right > row.right + 1);
      });
      if (on && was) { seats.classList.add("scroll"); seats.scrollLeft = left; } // turning it off lost the scroll position
    }
    seats.classList.toggle("scroll", on);
    setScroll(on);
  };
  const sync = () => { if (seatsRef.current && measured.current !== stamp) decide(); };

  useLayoutEffect(() => {
    decide();
    // `decide` reads nothing that is not listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatsRef, count, width, scroll, layoutKey]);

  // The hand in play sits in the middle of the row.
  useLayoutEffect(() => {
    if (!scroll) return;
    const seats = seatsRef.current;
    const seat = seats.children[Math.max(0, active)];
    if (seat) seats.scrollTo?.({ left: seat.offsetLeft - seats.clientWidth / 2 + seat.offsetWidth / 2, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [scroll, active, count, seatsRef]);

  return [scroll, sync];
}
