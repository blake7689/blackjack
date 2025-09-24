import { useEffect, useRef } from "react";
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
  const {
      dealer, shoe, hands, selectedHandIndex, gamePhase, setGamePhase, betCircle,
      deckCount, runningCount, endRound, setBetCircle, hit, stay, double, split, deal
    } = useGame();
  const { player } = usePlayer();
  
  const mainAreaRef = useRef(null);
  const footerObserver = useRef(null);

  // Set up observers to keep main area and footer in sync
  useEffect(() => {
    const mainEl = mainAreaRef.current;
    const footerEl = document.querySelector(".bet-footer");
    if (!mainEl || !footerEl) return;

    // Calculate and apply the bottom space needed
    const updateMainAreaSpace = () => {
      // Get footer's distance from top of viewport
      const footerTop = footerEl.getBoundingClientRect().top;
      // Get viewport height
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      // Calculate how much space to reserve (viewport height - footer position)
      const spaceToReserve = viewportHeight - footerTop;
      
      // Apply the padding to main area
      mainEl.style.paddingBottom = `${Math.max(0, spaceToReserve)}px`;
    };

    // Initial update
    updateMainAreaSpace();

    // Set up intersection observer to detect footer position changes
    const observer = new IntersectionObserver(updateMainAreaSpace, {
      threshold: [0, 0.1, 0.5, 1.0]
    });
    observer.observe(footerEl);
    
    // Set up resize observer to detect footer size changes
    const resizeObserver = new ResizeObserver(updateMainAreaSpace);
    resizeObserver.observe(footerEl);
    
    // Listen for viewport/window size changes
    const handleResize = updateMainAreaSpace;
    window.visualViewport?.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("scroll", handleResize);
    window.addEventListener("resize", handleResize);
    
    footerObserver.current = {
      update: updateMainAreaSpace,
      observers: [observer, resizeObserver]
    };

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  

  // Re-calculate on game phase change (in case UI changes)
  useEffect(() => {
    footerObserver.current?.update();
  }, [gamePhase]);

  const handleBoardClick = () => {
    if (gamePhase === GamePhases.POST_ROUND) {
      setGamePhase(GamePhases.END_ROUND);
      setTimeout(() => { endRound(); }, 1500);
    }
  };

  const handleDeal = () => {
    if (gamePhase !== GamePhases.PRE_DEAL || betCircle === 0 || !player) return;
    setGamePhase(GamePhases.DEALING);
    deal(betCircle);
  };

  return (
    <div className="board" onClick={handleBoardClick}>
      {/* TOP BAR */}
      <div className="top-bar">
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

      {/* MAIN AREA - with ref for direct measurement */}
      <div className="main-area" ref={mainAreaRef}>
        <div className="dealer-container">
          <div className="dealer-scroll">
            <div className="dealer-track">
              {gamePhase !== GamePhases.PRE_DEAL &&
                dealer.cards &&
                dealer.cards.length > 0 && <DealerArea dealer={dealer} />}
            </div>
          </div>
        </div>

        <div className="center-msg-row">
          <CenterMessage gamePhase={gamePhase} />
        </div>

        <div className="player-container">
          <div className="hands-scroll">
            <div className="hands-track">
              {Array.isArray(hands) && hands.length > 0 &&
                hands.map((hand, idx) => (
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
      </div>

      <BettingFooter
        betCircle={betCircle}
        setBetCircle={setBetCircle}
        onDeal={handleDeal}
        gamePhase={gamePhase}
      />
    </div>
  );
}