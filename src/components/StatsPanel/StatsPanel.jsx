import { useGame } from "../../hooks/useGame";
import { usePlayer } from "../../hooks/usePlayer";
import "./StatsPanel.css";

export default function StatsPanel({ player }) {
  const { lastCreditChange } = useGame();
  const { lastLocalCreditChange } = usePlayer();

  const creditChange = lastCreditChange !== 0 ? lastCreditChange : lastLocalCreditChange;

  return (
    <div>
      <div>Credits: </div>
      <div>
        ${player ? Number(player.credits).toLocaleString() : 0}
        {creditChange !== 0 && (
          <span
            className={`credit-change ${creditChange > 0 ? "plus" : "minus"}`}
            style={{ marginLeft: 8 }}
          >
            {creditChange > 0 ? `+${creditChange}` : creditChange}
          </span>
        )}
      </div>
    </div>
  );
}