import { useLayoutEffect, useRef, useState } from "react";

// Whether the seats are too narrow for the side stacks (a double's, the insurance) beside the circle (DESIGN section 4, portrait only): then CSS puts
// them under the amount, in room the seats keep (.seats.tight). Landscape and wide screens put them above or outside the circle and never need it.
// Measured once per hand count and stage width (like useSeatsScroll), never on every render: tight changes the card width, and a decision that
// followed it could flip back and forth. Returns [`tight`, `decide`]: `decide` puts the class on the row at once, so CardWidthSync can call it
// before the seats measure (#193); it returns true when it made a new decision. //
export function useTightSeats(seatsRef, stageRef, count) {
  const [tight, setTight] = useState(false);
  const decided = useRef("");
  const decide = () => {
    const seats = seatsRef.current; // null for CardWidthSync on the board's first mount
    const seat = seats?.children[0];
    if (!seat?.clientWidth) return false; // not laid out yet (or jsdom): decide on the next render
    const key = `${count}@${Math.round(stageRef.current.clientWidth)}`;
    if (decided.current === key) return false;
    decided.current = key;
    const wide = window.matchMedia?.("(max-height: 520px), (min-width: 900px) and (min-aspect-ratio: 5/4)").matches;
    const chip = seat.querySelector(".spot .stack").offsetWidth;
    const next = !wide && seat.clientWidth < seat.querySelector(".spot").offsetWidth + 2 * (chip * 1.12 + 6);
    seats.classList.toggle("tight", next);
    setTight(next);
    return true;
  };
  // runs after every render on purpose: the key says whether to measure
  useLayoutEffect(() => { decide(); });
  return [tight, decide];
}
