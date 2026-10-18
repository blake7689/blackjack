import { memo } from "react";
import "./CardCountDisplay.css";
import { trueCount } from "../../utils/cards";

const CardCountDisplay = ({ shoe, runningCount }) => {
  return (
    <div className="card-count-display">
      <span className="count-label">Count:</span>
      <span className="count-value">{runningCount}</span>
      <span className="true-count-label" style={{marginLeft:8}}>True:</span>
      <span className="true-count-value">{trueCount(runningCount, shoe)}</span>
    </div>
  );
};

// Re-renders only when a card is drawn (#5).
export default memo(CardCountDisplay);
