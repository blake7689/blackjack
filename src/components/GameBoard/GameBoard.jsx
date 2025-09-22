import React, { useEffect, useRef, useState } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";
import { useGame } from "../../hooks/useGame";
import { usePlayer } from "../../hooks/usePlayer";
import StatsPanel from "../StatsPanel/StatsPanel";
import DealerArea from "../DealerArea/DealerArea";
import DeckStack from "../DeckStack/DeckStack";
import CenterMessage from "../CenterMessage/CenterMessage";
import PlayerHand from "../Playerhand/PlayerHand";
import BettingFooter from "../BettingFooter/BettingFooter";
import CardCountDisplay from "../CardCountDisplay/CardCountDisplay";
import "./GameBoard.css";

export default function GameBoard() {
  const { dealer, shoe, hands, selectedHandIndex, gamePhase, setGamePhase, betCircle, 
    deckCount, runningCount, endRound, setBetCircle,
    hit, stay, double, split, deal } = useGame();

  const { player } = usePlayer();

  const playerHandsRef = useRef(null);
  const [handsOverflow, setHandsOverflow] = useState(false);

  useEffect(() => {
    const el = playerHandsRef.current;
    if (!el) return;

    const checkOverflow = () => {
      const hasMultipleHands = Array.isArray(hands) && hands.length > 1;
      // small tolerance for rounding differences
      const overflow = el.scrollWidth > el.clientWidth + 1;
      setHandsOverflow(Boolean(hasMultipleHands && overflow));
    };

    // initial check
    checkOverflow();

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(checkOverflow);
      try {
        ro.observe(el);
        ro.observe(document.body); // observe body in case fonts/images change layout
      } catch {
        // ignore if observe fails on body in some environments
      }
    } else {
      window.addEventListener("resize", checkOverflow);
    }

    return () => {
      if (ro) {
        try {
          ro.disconnect();
        } catch {
          // ignore errors
        }
      } else {
        window.removeEventListener("resize", checkOverflow);
      }
    };
  }, [hands]);

  // Only allow click to continue //
  const handleBoardClick = () => {
    if (gamePhase === GamePhases.POST_ROUND) {
      setGamePhase(GamePhases.END_ROUND);
      setTimeout(() => { endRound(); }, 1500);
    }
  };

  // Update player credits and deal //
  const handleDeal = () => {
    if (gamePhase !== GamePhases.PRE_DEAL || betCircle === 0 || !player) return; // redundant?
    setGamePhase(GamePhases.DEALING);
    deal(betCircle);
  };

  return (
    <div className="board" onClick={handleBoardClick}>
      {/* TOP BAR */}
      <div className="top-bar" style={{ gridArea: "header" }}>
        <div className="top-left stats">
          <StatsPanel player={player} />
        </div>
        <div className="top-center card-count">
          <CardCountDisplay 
            hands={hands} 
            dealer={dealer} 
            runningCount={runningCount} 
            deckCount={deckCount} 
          />
        </div>
        <div className="top-right deck-stack">
          <DeckStack shoe={shoe} />
        </div>
      </div>

      {/* MAIN GAME AREA */}
      <div className="main-area" style={{ gridArea: "main" }}>
        <div className="dealer-container">
          {gamePhase !== GamePhases.PRE_DEAL && dealer.cards && dealer.cards.length > 0 && (
            <div className="top-center dealer">
              <DealerArea dealer={dealer} />
            </div>
          )}
        </div>
        <div className="center-msg-row">
          <CenterMessage gamePhase={gamePhase} />
        </div>
        <div className="player-container">
          <div
            ref={playerHandsRef}
            className={`bottom player-hands${handsOverflow ? " overflow" : ""}`}
          >
            {Array.isArray(hands) && hands.length > 0
              ? hands.map((hand, idx) => (
                  <PlayerHand
                    key={idx}
                    hand={hand}
                    active={selectedHandIndex === idx}
                    onHit={() => hit(idx)}
                    onStay={() => stay(idx)}
                    onDouble={() => double(idx)}
                    onSplit={() => split(idx)}
                    gamePhase={gamePhase}
                    disableActions={dealer && dealer.blackjack}
                  />
                ))
              : null}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      {/* <div className="bottom-bar" style={{ gridArea: "footer" }}> */}
        <div className="betting-spacer">
          <BettingFooter
            betCircle={betCircle}
            setBetCircle={setBetCircle}
            onDeal={handleDeal}
            gamePhase={gamePhase}
          />
        </div>
      </div>
    // </div>
  );
}