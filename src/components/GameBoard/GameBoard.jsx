import { useEffect, useMemo, useRef, useState } from "react";
import { FlightContext } from "../../context/FlightContext";
import { cardTiming, clearLanded, queue } from "../../utils/cardAnimation";
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

// Mirrors the API's "balance under 100" top-up guard; the API is the authority.
const TOP_UP_BELOW = 100;

export default function GameBoard() {
  const { dealer, dealerHole, shoe, hands, selectedHandIndex, phase, betCircle, runningCount, settings, pendingBets, notice } = useGameState();
  const { continueRound } = useGameActions();
  const { player, reconnecting } = usePlayer();
  const handsRef = useRef(null);
  const layerRef = useRef(null);
  // Cards on the board's first render never fly (returning from Settings): they read `enabled` while it is still false.
  const [enabled, setEnabled] = useState(false);
  useEffect(() => setEnabled(true), []);
  useEffect(() => { if (phase === GamePhases.PRE_DEAL) clearLanded(); }, [phase]);
  // Busy while any card is flying or flipping: the buttons wait until it lands (like a real dealer's hands).
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let t;
    const check = () => {
      clearTimeout(t);
      const left = queue.free - performance.now();
      if (left > 0) { setBusy(true); t = setTimeout(check, left + 5); } else setBusy(queue.holds.size > 0); // released holds call check again
    };
    queue.listeners.add(check);
    return () => { queue.listeners.delete(check); clearTimeout(t); };
  }, []);
  const timing = useMemo(() => cardTiming(Number(settings.playTimeout)), [settings.playTimeout]);
  const flight = useMemo(() => ({ enabled, layerRef, timing }), [enabled, timing]);

  // With many split hands the row scrolls sideways: keep the hand in play (and its buttons) on screen. //
  useEffect(() => {
    handsRef.current.querySelector(".player-hand.active")?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [selectedHandIndex, hands.length]);

  // Any click on the table moves on from the results //
  const handleBoardClick = () => {
    if (phase === GamePhases.POST_ROUND) continueRound();
  };

  // The hidden top-up taps (#90) count only when idle, signed in, low, with no chips in the circle and nothing awaiting the server.
  const tapEnabled = !!player && player.credits < TOP_UP_BELOW && phase === GamePhases.PRE_DEAL && betCircle === 0 && pendingBets.length === 0;

  return (
    <FlightContext.Provider value={flight}>
    <div className={`board${busy ? " busy" : ""}`} onClick={handleBoardClick}>
      {/* TOP BAR */}
      <div className="top-bar">
        <div className="top-left stats">
          <StatsPanel player={player} tapEnabled={tapEnabled} />
        </div>
        <div className="top-center card-count">
          {settings.showCardCount && <CardCountDisplay shoe={shoe} runningCount={runningCount} dealing={phase === GamePhases.DEALING} />}
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
            gamePhase={busy && phase === GamePhases.PLAYER_TURN ? GamePhases.DEALING : phase}
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
                  key={hand.tag}
                  hand={hand}
                  index={idx}
                  active={selectedHandIndex === idx}
                  gamePhase={phase}
                  handCount={hands.length}
                  maxSplitHands={settings.maxSplitHands}
                  doubleOn={settings.doubleOn}
                  doubleAfterSplit={settings.doubleAfterSplit}
                  resplitAces={settings.resplitAces}
                  hitSplitAces={settings.hitSplitAces}
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
      <div className="flight-layer" ref={layerRef} />
    </div>
    </FlightContext.Provider>
  );
}
