import { useEffect } from "react";
import { cardSize, cardStep } from "../utils/cardWidth";

// Floors the probe's CSS width (--cwr) into whole-pixel --cw / --ch (and the hands' --step) on the stage element, now and whenever the probe resizes. //
export function useCardWidth(stageRef, probeRef) {
  useEffect(() => {
    const stage = stageRef.current;
    const probe = probeRef.current;
    const update = () => {
      const { cw, ch } = cardSize(probe.getBoundingClientRect().width);
      stage.style.setProperty("--cw", `${cw}px`);
      stage.style.setProperty("--ch", `${ch}px`);
      stage.style.setProperty("--step", `${cardStep(cw)}px`);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(probe);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [stageRef, probeRef]);
}
