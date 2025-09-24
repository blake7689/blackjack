import "./BettingFooter.css";
import React, { useEffect, useRef } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";
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
  const { player, addCreditsLocalOnly } = usePlayer();
  const chipValues = [1, 5, 10, 25, 50, 100, 1000, 5000, 10000, 20000, 50000, 100000];
  const credits = player ? Number(player.credits) : 0;

  const footerRef = useRef(null);

  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const setVar = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--bet-footer-space", `${h}px`);
    };
    setVar();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(setVar);
      ro.observe(el);
    }
    window.addEventListener("resize", setVar);
    return () => {
      try { ro && ro.disconnect(); } catch { /* ignore errors */ }
      window.removeEventListener("resize", setVar);
    };
  }, []);

  const addChip = (val) => {
    if (!player || credits < val) return;
    setBetCircle(betCircle + val);
    addCreditsLocalOnly(-val);
  };

  const clearBet = () => {
    setBetCircle(0);
    addCreditsLocalOnly(betCircle);
  };

  const isPreDeal = gamePhase === GamePhases.PRE_DEAL;
  const formattedBet = betCircle.toLocaleString();

  return (
    <div className={`bet-footer ${!isPreDeal ? "compact" : ""}`} ref={footerRef}>
      <div className="betting-footer">
        <div className="footer-left">
          <div
            className={`chips ${!isPreDeal ? "hidden" : ""}`}
            aria-hidden={!isPreDeal}
          >
            {isPreDeal &&
              chipValues
                .filter((v) => v <= credits)
                .map((v) => (
                  <Chip
                    key={v}
                    value={v}
                    onClick={() => addChip(v)}
                    disabled={!isPreDeal}
                  />
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
            disabled={betCircle === 0 || !isPreDeal}
            onClick={onDeal}
            aria-hidden={!isPreDeal}
          >
            Deal
          </button>
        </div>
      </div>
    </div>
  );
}