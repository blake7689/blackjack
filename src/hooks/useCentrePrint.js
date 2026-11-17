import { useEffect, useLayoutEffect } from "react";
import { centrePrint } from "../utils/centrePrint";

// Keeps the felt print and the message line centred between the dealer's hand and the first seat: after every render (a hand grew,
// a total or a verdict changed the boxes) and whenever the stage resizes. The print redraws itself and calls centrePrint too. //
export function useCentrePrint(stageRef) {
  useLayoutEffect(() => centrePrint(stageRef.current));
  useEffect(() => {
    const stage = stageRef.current;
    const update = () => centrePrint(stage);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(stage);
    return () => observer?.disconnect();
  }, [stageRef]);
}
