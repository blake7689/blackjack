import { useEffect, useRef } from "react";
// import { useGameBoardActions } from "../../hooks/useGameBoardActions";
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
    deckCount, runningCount , dealerTurn, settle, setBetCircle,
    hit, stay, double, split, deal } = useGame();

  const { player, updateCreditsOnServer } = usePlayer();

  const hasSettled = useRef(false);

  //runs twice when dealing and three times when settling !!! Unnecessary
  useEffect(() => { 
    if (gamePhase === "dealerTurn") {
      setTimeout(() => dealerTurn(), 100);
    }
    if (gamePhase === "settling" && !hasSettled.current) {
      hasSettled.current = true;
      settle();
    }
    if (gamePhase !== "settling") {
      hasSettled.current = false;
    }
  }, [gamePhase, dealerTurn, settle]);

  // Only allow click to continue during settle phase
  const handleBoardClick = () => {
    if (gamePhase === "results") {
      setGamePhase("settling");
    }
  };

  const handleDeal = () => {
    if (gamePhase !== "preDeal" || betCircle === 0 || !player) return;
    updateCreditsOnServer(player.credits);
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
          <CardCountDisplay hands={hands} dealer={dealer} runningCount={runningCount} deckCount={deckCount} />
        </div>
        <div className="top-right deck-stack">
          <DeckStack shoe={shoe} />
        </div>
      </div>

      {/* MAIN GAME AREA */}
      <div className="main-area" style={{ gridArea: "main" }}>
        <div className="dealer-container">
          {gamePhase !== "betting" && gamePhase !== "waiting" && dealer.cards && dealer.cards.length > 0 && (
            <div className="top-center dealer">
              <DealerArea dealer={dealer} />
            </div>
          )}
        </div>
        <div className="center-msg-row">
          {gamePhase === "results" ? (
            <CenterMessage
              gamePhase={gamePhase}
              message={"Click anywhere to continue..."}
            />
          ) : (
            <CenterMessage gamePhase={gamePhase} />
          )}
        </div>
        <div className="player-container">
          <div className="bottom player-hands">
            {hands.map((hand, idx) => (
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
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bottom-bar" style={{ gridArea: "footer" }}>
        <div className="betting-footer">
          <BettingFooter
            betCircle={betCircle}
            setBetCircle={setBetCircle}
            onDeal={handleDeal}
            gamePhase={gamePhase}
          />
        </div>
      </div>
    </div>
  );
}