import { memo } from "react";
import "./CardCountDisplay.css";
import { trueCount } from "../../utils/cards";
import { dealingStyle } from "../dealingStyle";

const CardCountDisplay = ({ shoe, runningCount, dealing }) => {
  const style = dealingStyle(dealing);
  return (
    <div className="card-count-display">
      <span className="count-label">Count:</span>
      <span className="count-value" style={style}>{runningCount}</span>
      <span className="true-count-label">True:</span>
      <span className="true-count-value" style={style}>{trueCount(runningCount, shoe)}</span>
    </div>
  );
};

// Re-renders only when a card is drawn or the dealing starts or ends (#5); `dealing` is the DEALING phase or not.
export default memo(CardCountDisplay);
