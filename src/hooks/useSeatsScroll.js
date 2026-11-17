import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { reducedMotion } from "../utils/cardAnimation";

// Whether the seats scroll one hand at a time (DESIGN section 4), and keeping the hand in play centred while they do.
// Up to four hands share one centred row; five or more scroll, and so does a row that does not fit (four on a small landscape phone):
// anything of a seat reaching past the row's edge. The decision is made once per hand count and stage width (a re-render never resets it),
// and only ever turns scrolling on within that pair. Returns `scroll`. //
export function useSeatsScroll(seatsRef, stageRef, count, active) {
  const [width, setWidth] = useState(0);
  const [scroll, setScroll] = useState(false);
  const decided = useRef("");

  useEffect(() => {
    const stage = stageRef.current;
    const update = () => setWidth(Math.round(stage.clientWidth));
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(stage);
    return () => observer?.disconnect();
  }, [stageRef]);

  // runs after every render on purpose: the overflow check must see each layout
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const seats = seatsRef.current;
    const key = `${count}@${width}`;
    if (decided.current !== key) {
      decided.current = key;
      setScroll(count > 4);
      return;
    }
    if (count < 2 || scroll) return;
    const row = seats.getBoundingClientRect();
    const spills = [...seats.querySelectorAll(".spot-row, .hand, .pill, .side-spot .stack svg")].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width && (r.left < row.left - 1 || r.right > row.right + 1);
    });
    if (spills) setScroll(true);
  });

  // The hand in play sits in the middle of the row.
  useLayoutEffect(() => {
    if (!scroll) return;
    const seats = seatsRef.current;
    const seat = seats.children[Math.max(0, active)];
    if (seat) seats.scrollTo?.({ left: seat.offsetLeft - seats.clientWidth / 2 + seat.offsetWidth / 2, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [scroll, active, count, seatsRef]);

  return scroll;
}
