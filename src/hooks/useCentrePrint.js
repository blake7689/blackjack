import { useEffect, useLayoutEffect } from "react";
import { centrePrint } from "../utils/centrePrint";

// Keeps the felt print and the message line centred between the dealer's hand and the first seat: when `layoutKey` changes (GameBoard's string of
// everything that sizes a box: a hand grew, a total or a verdict changed the boxes, #140) and whenever the stage resizes. The print redraws itself and calls centrePrint too. //
export function useCentrePrint(stageRef, layoutKey) {
  useLayoutEffect(() => centrePrint(stageRef.current), [stageRef, layoutKey]);
  useEffect(() => {
    const stage = stageRef.current;
    const update = () => centrePrint(stage);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(stage);
    return () => observer?.disconnect();
  }, [stageRef]);
}
