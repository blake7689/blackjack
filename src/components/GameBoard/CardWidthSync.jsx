import { useLayoutEffect } from "react";
import { applyCardWidth, useCardWidthNow } from "../../hooks/useCardWidth";

// Draws nothing: applies the card width in the commit (hooks/useCardWidth.js), then settles whether the seats are tight (which changes the card width) and
// whether they scroll (#193). A component of its own, rendered before the seats, because layout effects run in tree order and the seats' (the glide's
// measurement, a flight's target, a chip's landing spot) must see the final layout. //
export default function CardWidthSync({ stageRef, probeRef, seats, decideTight, syncScroll }) {
  useCardWidthNow(stageRef, probeRef, seats);
  useLayoutEffect(() => {
    if (decideTight?.()) applyCardWidth(stageRef.current, probeRef.current);
    syncScroll?.();
  });
  return null;
}
