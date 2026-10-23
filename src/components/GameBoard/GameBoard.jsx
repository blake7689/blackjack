import { useEffect, useRef } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";
import { useGameState, useGameActions } from "../../hooks/useGame";
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
  const { dealer, dealerHole, shoe, hands, selectedHandIndex, phase, runningCount, settings, pendingBets, notice } = useGameState();
  const { continueRound } = useGameActions();
  const { player, reconnecting } = usePlayer();
  const handsRef = useRef(null);

  // With many split hands the row scrolls sideways: keep the hand in play (and its buttons) on screen. //
  useEffect(() => {
    handsRef.current.querySelector(".player-hand.active")?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [selectedHandIndex, hands.length]);

  // Any click on the table moves on from the results //
  const handleBoardClick = () => {
    if (phase === GamePhases.POST_ROUND) continueRound();
  };

  return (
    <div className="board" onClick={handleBoardClick}>
      {/* TOP BAR */}
      <div className="top-bar">
        <div className="top-left stats">
          <StatsPanel player={player} />
        </div>
        <div className="top-center card-count">
          {settings.showCardCount && <CardCountDisplay shoe={shoe} runningCount={runningCount} />}
        </div>
        <div className="top-right deck-stack">
          <DeckStack shoe={shoe} />
        </div>
      </div>

      {/* MAIN GAME AREA */}
      <div className="main-area">
        <div className="dealer-container">
          <div className="dealer-scroll">
            <div className="dealer-track">
              {dealer.cards.length > 0 && <DealerArea dealer={dealer} hiddenCount={dealerHole.cards.length} />}
            </div>
          </div>
        </div>

        <div className="center-msg-row">
          <CenterMessage
            gamePhase={phase}
            waiting={phase === GamePhases.SETTLING_HANDS && pendingBets.length > 0}
            reconnecting={reconnecting}
            notice={notice}
          />
        </div>

        <div className="player-container">
          <div className="hands-scroll" ref={handsRef}>
            <div className="hands-track">
              {hands.map((hand, idx) => (
                <PlayerHand
                  key={idx}
                  hand={hand}
                  index={idx}
                  active={selectedHandIndex === idx}
                  gamePhase={phase}
                  handCount={hands.length}
                  maxSplitHands={settings.maxSplitHands}
                  tripleDown={settings.tripleDown}
                  credits={player.credits}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="betting-spacer">
        <BettingFooter />
      </div>
    </div>
  );
}
