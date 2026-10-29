import { memo, useCallback, useRef, useState } from "react";
import { usePlayer } from "../../hooks/usePlayer";
import TopUpPrompt from "../TopUpPrompt/TopUpPrompt";
import "./StatsPanel.css";

const TAPS = 7;
const TAP_WINDOW_MS = 3000;

// tapEnabled (set by GameBoard, which already reads the game state, so this stays memo'd) says taps may count (#90).
function StatsPanel({ player, tapEnabled = false }) {
  const { creditChange } = usePlayer();
  const delta = creditChange?.delta;
  const [asking, setAsking] = useState(false);
  const taps = useRef([]);

  // Hidden: 7 taps within 3 s open the code prompt. Nothing else on the page changes or is announced.
  const handleTap = () => {
    if (!tapEnabled) return;
    const now = Date.now();
    taps.current = [...taps.current, now].filter((t) => now - t < TAP_WINDOW_MS).slice(-TAPS);
    if (taps.current.length === TAPS) {
      taps.current = [];
      setAsking(true);
    }
  };

  const closePrompt = useCallback(() => setAsking(false), []);

  return (
    <>
      <div className="stats-panel" onClick={handleTap}>
        <div>Credits: </div>
        <div>
          ${player ? player.credits.toLocaleString() : 0}
          {delta !== undefined && (
            <span className={`credit-change ${delta > 0 ? "plus" : "minus"}`}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </div>
      </div>
      {asking && <TopUpPrompt onClose={closePrompt} />}
    </>
  );
}

// Re-renders only when the player or a credit change does (#5).
export default memo(StatsPanel);
