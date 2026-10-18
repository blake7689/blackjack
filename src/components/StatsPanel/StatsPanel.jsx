import { memo } from "react";
import { usePlayer } from "../../hooks/usePlayer";
import "./StatsPanel.css";

function StatsPanel({ player }) {
  const { creditChange } = usePlayer();
  const delta = creditChange?.delta;

  return (
    <div>
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
  );
}

// Re-renders only when the player or a credit change does (#5).
export default memo(StatsPanel);
