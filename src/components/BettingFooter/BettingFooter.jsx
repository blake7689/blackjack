import "./BettingFooter.css";
import { useRef } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";
import { usePlayer } from "../../hooks/usePlayer";
import { useGameState, useGameActions } from "../../hooks/useGame";
import { useCssVarHeight } from "../../hooks/useCssVarHeight";

const CHIP_VALUES = [1, 5, 10, 25, 50, 100, 1000, 5000, 10000, 20000, 50000, 100000];

function Chip({ value, onClick }) {
  return (
    <button className="chip" onClick={onClick} aria-label={`Add ${value}`}>
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

export default function BettingFooter() {
  const { player } = usePlayer();
  const { betCircle, phase } = useGameState();
  const { addBet, clearBet, deal } = useGameActions();
  const footerRef = useRef(null);
  useCssVarHeight(footerRef, "--bet-footer-space");

  const credits = player ? player.credits : 0;
  const isPreDeal = phase === GamePhases.PRE_DEAL;
  const formattedBet = betCircle.toLocaleString();

  return (
    <div className={`bet-footer ${!isPreDeal ? "compact" : ""}`} ref={footerRef}>
      <div className="betting-footer">
        <div className="footer-left">
          <div className={`chips ${!isPreDeal ? "hidden" : ""}`} aria-hidden={!isPreDeal}>
            {isPreDeal &&
              CHIP_VALUES.filter((v) => v <= credits).map((v) => (
                <Chip key={v} value={v} onClick={() => addBet(v)} />
              ))}
          </div>
        </div>
        <div className="footer-middle">
          <div className="bet-info">
            <div className="bet-box" aria-live="polite" aria-label={`Current bet ${formattedBet}`}>
              <span className="bet-total">${formattedBet}</span>
            </div>
            <button
              className={`clear ${!isPreDeal ? "hidden" : ""}`}
              onClick={clearBet}
              disabled={betCircle === 0 || !isPreDeal}
              aria-hidden={!isPreDeal}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="footer-right">
          <button
            className={`deal ${!isPreDeal ? "hidden" : ""}`}
            disabled={betCircle === 0 || !isPreDeal || !player}
            onClick={deal}
            aria-hidden={!isPreDeal}
          >
            Deal
          </button>
        </div>
      </div>
    </div>
  );
}
