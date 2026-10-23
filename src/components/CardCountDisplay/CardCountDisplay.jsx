import { memo } from "react";
import "./CardCountDisplay.css";
import { trueCount } from "../../utils/cards";
import { GamePhases } from "../../utils/constants/gamePhases";

const HIDDEN = { visibility: "hidden" }; // keeps the layout, so nothing shifts when the totals appear

const CardCountDisplay = ({ shoe, runningCount, gamePhase }) => {
  const style = gamePhase === GamePhases.DEALING ? HIDDEN : undefined;
  return (
    <div className="card-count-display">
      <span className="count-label">Count:</span>
      <span className="count-value" style={style}>{runningCount}</span>
      <span className="true-count-label">True:</span>
      <span className="true-count-value" style={style}>{trueCount(runningCount, shoe)}</span>
    </div>
  );
};

// Re-renders only when a card is drawn or the dealing starts or ends (#5).
export default memo(CardCountDisplay);
