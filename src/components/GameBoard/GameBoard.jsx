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
  const { dealer, dealerHole, shoe, hands, selectedHandIndex, phase, runningCount } = useGameState();
  const { continueRound, hit, stand, double, split } = useGameActions();
  const { player } = usePlayer();

  // Any click on the table moves on from the results //
  const handleBoardClick = () => {
    if (phase === GamePhases.POST_ROUND) continueRound();
  };

  return (
    <div className="board" onClick={handleBoardClick}>
      {/* TOP BAR */}
      <div className="top-bar" style={{ gridArea: "header" }}>
        <div className="top-left stats">
          <StatsPanel player={player} />
        </div>
        <div className="top-center card-count">
          <CardCountDisplay shoe={shoe} runningCount={runningCount} />
        </div>
        <div className="top-right deck-stack">
          <DeckStack shoe={shoe} />
        </div>
      </div>

      {/* MAIN GAME AREA */}
      <div className="main-area" style={{ gridArea: "main" }}>
        <div className="dealer-container">
          <div className="dealer-scroll">
            <div className="dealer-track">
              {dealer.cards.length > 0 && <DealerArea dealer={dealer} hiddenCount={dealerHole.cards.length} />}
            </div>
          </div>
        </div>

        <div className="center-msg-row">
          <CenterMessage gamePhase={phase} />
        </div>

        <div className="player-container">
          <div className="hands-scroll">
            <div className="hands-track">
              {hands.map((hand, idx) => (
                <PlayerHand
                  key={idx}
                  hand={hand}
                  active={selectedHandIndex === idx}
                  onHit={() => hit(idx)}
                  onStay={() => stand(idx)}
                  onDouble={() => double(idx)}
                  onSplit={() => split(idx)}
                  gamePhase={phase}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="betting-spacer" style={{ gridArea: "footer" }}>
        <BettingFooter />
      </div>
    </div>
  );
}
