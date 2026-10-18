import "./CardCountDisplay.css";
import { trueCount } from "../../utils/cards";

const CardCountDisplay = ({ shoe, runningCount }) => {
  return (
    <div className="card-count-display">
      <span className="count-label">Count:</span>
      <span className="count-value">{runningCount}</span>
      <span className="true-count-label">True:</span>
      <span className="true-count-value">{trueCount(runningCount, shoe)}</span>
    </div>
  );
};

export default CardCountDisplay;
