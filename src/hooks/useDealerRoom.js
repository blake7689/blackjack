import { useEffect } from "react";
import { dealerRoom } from "../utils/cardWidth";

// Sets --room on the stage element: how wide the dealer's hand may grow before it slides left, clear of the shoe's corner card
// (DESIGN section 2). Measured now and whenever the stage or the card width changes; call it after useCardWidth. //
export function useDealerRoom(stageRef, probeRef) {
  useEffect(() => {
    const stage = stageRef.current;
    const update = () => {
      const r = stage.getBoundingClientRect();
      const shoe = stage.querySelector(".shoe-card").getBoundingClientRect();
      const cw = parseFloat(stage.style.getPropertyValue("--cw")) || 70;
      const room = dealerRoom({ stageW: r.width, cw, shoeLeft: shoe.width ? shoe.left : null, centre: r.left + r.width / 2 });
      stage.style.setProperty("--room", `${Math.round(room)}px`);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(stage);
    observer?.observe(probeRef.current); // the card width can change while the stage does not
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [stageRef, probeRef]);
}
