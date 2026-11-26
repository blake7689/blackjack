import { useEffect, useLayoutEffect } from "react";
import { cardSize, cardStep } from "../utils/cardWidth";

export const applyCardWidth = (stage, probe) => {
  const { cw, ch } = cardSize(probe.getBoundingClientRect().width);
  stage.style.setProperty("--cw", `${cw}px`);
  stage.style.setProperty("--ch", `${ch}px`);
  stage.style.setProperty("--step", `${cardStep(cw)}px`);
};

// Floors the probe's CSS width (--cwr) into whole-pixel --cw / --ch (and the hands' --step) on the stage element, now and whenever the probe resizes. //
export function useCardWidth(stageRef, probeRef) {
  useEffect(() => {
    const stage = stageRef.current;
    const probe = probeRef.current;
    const update = () => applyCardWidth(stage, probe);
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

// Re-applies the card width in the commit itself (#147). The probe resizes when the seat count (--n) changes, but its ResizeObserver reports a frame later,
// after the seats' layout effects have measured (the glide's "after", a chip's landing spot): they saw the old card size. Render this before the seats
// (layout effects run in tree order) and they measure the final layout. It sets the same values the observer will set, so nothing changes later.
// `seats`: the seat count, the only thing that moves the probe besides the window (which the observer handles in time).
export function useCardWidthNow(stageRef, probeRef, seats) {
  useLayoutEffect(() => {
    if (stageRef.current && probeRef.current) applyCardWidth(stageRef.current, probeRef.current);
  }, [stageRef, probeRef, seats]);
}
