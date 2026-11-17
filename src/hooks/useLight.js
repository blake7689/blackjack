import { useLayoutEffect } from "react";
import { GamePhases } from "../utils/constants/gamePhases";

// The one overhead lamp (#83, DESIGN section 3: the light model, table objects only), after every render:
// - `.felt-light` sits mid-table between rounds and follows the hand in play (--lx --ly on the felt; they ease over 900 ms, see GameBoard.css);
// - cast shadows fall away from the lamp: each hand and chip stack gets --shx / --shy (the mockup's shadowFor), which the cards' and chips' shadows read. //
const centre = (r) => [r.left + r.width / 2, r.top + r.height / 2];

export function useLight(feltRef, stageRef, { phase, active }) {
  useLayoutEffect(() => {
    const felt = feltRef.current;
    const f = felt.getBoundingClientRect();
    if (!f.width || !f.height) return; // not laid out
    const seat = phase === GamePhases.PLAYER_TURN ? stageRef.current.querySelectorAll(".seats .seat")[active] : null;
    if (seat) {
      const r = seat.getBoundingClientRect();
      felt.style.setProperty("--lx", `${(((r.left + r.width / 2 - f.left) / f.width) * 100).toFixed(1)}%`);
      felt.style.setProperty("--ly", "62%");
    } else {
      felt.style.setProperty("--lx", "50%");
      felt.style.setProperty("--ly", "50%");
    }
    const lx = f.left + f.width * (parseFloat(getComputedStyle(felt).getPropertyValue("--lx")) / 100 || 0.5);
    const ly = f.top + f.height * 0.48;
    stageRef.current.querySelectorAll(".dealer-hand, .seats .hand, .seats .stack").forEach((el) => {
      const [x, y] = centre(el.getBoundingClientRect());
      el.style.setProperty("--shx", `${(((x - lx) / f.width) * 10).toFixed(1)}px`);
      el.style.setProperty("--shy", `${(3 + ((y - ly) / f.height) * 8).toFixed(1)}px`);
    });
  });
}
