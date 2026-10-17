import { usePlayer } from "../../hooks/usePlayer";
import "./StatsPanel.css";

export default function StatsPanel({ player }) {
  const { creditChange } = usePlayer();
  const delta = creditChange?.delta;

  return (
    <div>
      <div>Credits: </div>
      <div>
        ${player ? player.credits.toLocaleString() : 0}
        {delta !== undefined && (
          <span className={`credit-change ${delta > 0 ? "plus" : "minus"}`} style={{ marginLeft: 8 }}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
    </div>
  );
}
