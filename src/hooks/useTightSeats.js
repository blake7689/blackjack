import { useLayoutEffect, useRef, useState } from "react";

// Whether the seats are too narrow for the side stacks (a double's, the insurance) beside the circle (DESIGN section 4, portrait only): then CSS puts
// them under the amount, in room the seats keep (.seats.tight). Landscape and wide screens put them above or outside the circle and never need it.
// Measured once per hand count and stage width (like useSeatsScroll), never on every render: tight changes the card width, and a decision that
// followed it could flip back and forth. Returns `tight`. //
export function useTightSeats(seatsRef, stageRef, count) {
  const [tight, setTight] = useState(false);
  const decided = useRef("");
  // runs after every render on purpose: the key says whether to measure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const seat = seatsRef.current.children[0];
    const width = Math.round(stageRef.current.clientWidth);
    const key = `${count}@${width}`;
    if (!seat || !seat.clientWidth || decided.current === key) return; // not laid out yet (or jsdom): decide on the next render
    decided.current = key;
    const wide = window.matchMedia?.("(max-height: 520px), (min-width: 900px) and (min-aspect-ratio: 5/4)").matches;
    const chip = seat.querySelector(".spot .stack").offsetWidth;
    setTight(!wide && seat.clientWidth < seat.querySelector(".spot").offsetWidth + 2 * (chip * 1.12 + 6));
  });
  return tight;
}
