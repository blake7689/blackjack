import { useEffect, useRef } from "react";
import { useGameBoardActions } from "../../hooks/useGameBoardActions";
import { useGame } from "../../hooks/useGame";
import StatsPanel from "../StatsPanel/StatsPanel";
import DealerArea from "../DealerArea/DealerArea";
import DeckStack from "../DeckStack/DeckStack";
import CenterMessage from "../CenterMessage/CenterMessage";
import PlayerHand from "../Playerhand/PlayerHand";
import BettingFooter from "../BettingFooter/BettingFooter";
import CardCountDisplay from "../CardCountDisplay/CardCountDisplay";
import "./GameBoard.css";

export default function GameBoard() {
  const {
    player, dealer, shoe, hands, selectedHandIndex, gamePhase, setGamePhase, betCircle,
    handleHit, handleStay, handleDouble, handleSplit, handleDeal,
    handleDealerTurn, handleSettle, setBetCircle,
  } = useGameBoardActions();
  const { deckCount, runningCount } = useGame();

  const hasSettled = useRef(false);
  useEffect(() => {
    if (gamePhase === "dealerTurn") {
      setTimeout(() => handleDealerTurn(), 100);
    }
    if (gamePhase === "settling" && !hasSettled.current) {
      hasSettled.current = true;
      handleSettle();
    }
    if (gamePhase !== "settling") {
      hasSettled.current = false;
    }
  }, [gamePhase, handleDealerTurn, handleSettle]);

  // Only allow click to continue during settle phase
  const handleBoardClick = () => {
    if (gamePhase === "results") {
      setGamePhase("settling");
    }
  };

  return (
    <div className="board" onClick={handleBoardClick}>
      {/* HEADER */}
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

      {/* MAIN */}
      <div className="main-area" style={{ gridArea: "main" }}>
        <div className="dealer-container">
          <div className="top-center dealer">
            <DealerArea dealer={dealer} />
          </div>
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
                onHit={() => handleHit(idx)}
                onStay={() => handleStay(idx)}
                onDouble={() => handleDouble(idx)}
                onSplit={() => handleSplit(idx)}
                gamePhase={gamePhase}
                disableActions={dealer && dealer.blackjack}
              />
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
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