import { useEffect } from "react";
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
  useEffect(() => {
  const root = document.documentElement;
  const footer = () => document.querySelector(".bet-footer");

  const setVH = () => {
    const vh = window.visualViewport?.height || window.innerHeight;
    root.style.setProperty("--vh100", `${vh}px`);
  };

  const setFooterSpace = () => {
    const el = footer();
    if (el) root.style.setProperty("--bet-footer-space", `${el.offsetHeight}px`);
  };

  const setFooterLift = () => {
    const vv = window.visualViewport;
    // lift is how much bottom browser UI reduces usable layout
    const lift = vv ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) : 0;
    root.style.setProperty("--footer-lift", `${Math.round(lift)}px`);
  };

  const update = () => { setVH(); setFooterSpace(); setFooterLift(); };

  update();

  const el = footer();
  const ro = el && "ResizeObserver" in window ? new ResizeObserver(setFooterSpace) : null;
  el && ro?.observe(el);

  window.visualViewport?.addEventListener("resize", update);
  window.visualViewport?.addEventListener("scroll", update); // iOS toolbar show/hide
  window.addEventListener("orientationchange", update);
  window.addEventListener("resize", update);

  return () => {
    ro?.disconnect();
    window.visualViewport?.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("scroll", update);
    window.removeEventListener("orientationchange", update);
    window.removeEventListener("resize", update);
  };
}, []);

  const {
    dealer, shoe, hands, selectedHandIndex, gamePhase, setGamePhase, betCircle,
    deckCount, runningCount, endRound, setBetCircle, hit, stay, double, split, deal
  } = useGame();
  const { player } = usePlayer();

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
        <div className="top-left stats"><StatsPanel player={player} /></div>
        <div className="top-center card-count">
          <CardCountDisplay hands={hands} dealer={dealer} runningCount={runningCount} deckCount={deckCount} />
        </div>
        <div className="top-right deck-stack"><DeckStack shoe={shoe} /></div>
      </div>

      {/* MAIN */}
      <div className="main-area">
        <div className="dealer-container">
          <div className="dealer-scroll">
            <div className="dealer-track">
              {gamePhase !== GamePhases.PRE_DEAL && dealer.cards?.length > 0 && <DealerArea dealer={dealer} />}
            </div>
          </div>
        </div>

        <div className="center-msg-row"><CenterMessage gamePhase={gamePhase} /></div>

        <div className="player-container">
          <div className="hands-scroll">
            <div className="hands-track">
              {Array.isArray(hands) && hands.length > 0 && hands.map((hand, idx) => (
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