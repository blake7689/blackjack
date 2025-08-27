import "./BettingFooter.css";
import { GamePhases } from "../../../utils/constants/gamePhases";
import { usePlayer } from "../../hooks/usePlayer";

function Chip({ value, onClick, disabled }) {
  return (
    <button className="chip" onClick={onClick} aria-label={`Add ${value}`} disabled={disabled}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" />
        <circle cx="50" cy="50" r="32" />
        <text x="50" y="58" textAnchor="middle" fontSize="28" fontWeight="bold">
          ${value}
        </text>
      </svg>
    </button>
  );
}

export default function BettingFooter({ betCircle, setBetCircle, onDeal, gamePhase }) {
  const { player, addCreditsLocal, updateCreditsOnServer } = usePlayer();
  const chipValues = [1, 5, 10, 25, 50, 100];
  const credits = player ? Number(player.credits) : 0;

  const addChip = (val) => {
    if (!player || credits < val) return;
    setBetCircle(betCircle + val);
    addCreditsLocal(-val);
  };

  const clearBet = async () => {
    setBetCircle(0);
    addCreditsLocal(betCircle); // refund locally
    if (player) {
      await updateCreditsOnServer(player.credits + betCircle);
    }
  };

  return (
    <div className="bet-footer">
      <div className="betting-footer">
        <div className="footer-left">
          <div className="chips">
            {chipValues
              .filter((v) => v <= credits)
              .map((v) => (
                <Chip key={v} value={v} onClick={() => addChip(v)}
                  disabled={gamePhase !== GamePhases.PRE_DEAL}
                />
              ))}
          </div>
        </div>
        <div className="footer-middle">
          <div className="bet-info">
            <div className="bet-circle">
              <span className="bet-total">${betCircle}</span>
              {betCircle > 0}
            </div>
            <button className="clear" onClick={clearBet} disabled={betCircle === 0 || gamePhase !== GamePhases.PRE_DEAL}>
              Clear
            </button>
          </div>
        </div>
        <div className="footer-right">
          <button
            className="deal"
            disabled={betCircle === 0 || gamePhase !== GamePhases.PRE_DEAL}
            onClick={onDeal}
          >
            Deal
          </button>
        </div>
      </div>
    </div>
  );
}