import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlightContext } from "../../context/FlightContext";
import { cardTiming, clearLanded, queue } from "../../utils/cardAnimation";
import { GamePhases } from "../../utils/constants/gamePhases";
import { useGameState, useGameActions } from "../../hooks/useGame";
import { usePlayer } from "../../hooks/usePlayer";
import { useCardWidth } from "../../hooks/useCardWidth";
import { useDealerRoom } from "../../hooks/useDealerRoom";
import { useCentrePrint } from "../../hooks/useCentrePrint";
import { centrePrint } from "../../utils/centrePrint";
import { discardCount } from "../../utils/cards";
import StatsPanel from "../StatsPanel/StatsPanel";
import DealerArea from "../DealerArea/DealerArea";
import DeckStack from "../DeckStack/DeckStack";
import Shoe from "../Shoe/Shoe";
import FeltPrint from "../FeltPrint/FeltPrint";
import CenterMessage from "../CenterMessage/CenterMessage";
import PlayerHand from "../Playerhand/PlayerHand";
import Dock from "../Dock/Dock";
import CardCountDisplay from "../CardCountDisplay/CardCountDisplay";
import "./GameBoard.css";

// Mirrors the API's "balance under 100" top-up guard; the API is the authority.
const TOP_UP_BELOW = 100;

export default function GameBoard() {
  const { dealer, dealerHole, shoe, hands, selectedHandIndex, phase, betCircle, runningCount, settings, pendingBets, notice, offers, autoDealPending, cutCardFound } = useGameState();
  const { continueRound } = useGameActions();
  const { player, reconnecting } = usePlayer();
  const navigate = useNavigate();
  const handsRef = useRef(null);
  const layerRef = useRef(null);
  const stageInRef = useRef(null);
  const probeRef = useRef(null);
  useCardWidth(stageInRef, probeRef);
  useDealerRoom(stageInRef, probeRef);
  useCentrePrint(stageInRef);
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

  // The discard pile: what was dealt and is no longer on the table.
  const onTable = dealer.cards.length + dealerHole.cards.length + hands.reduce((n, h) => n + h.cards.length + h.hiddenCards.length, 0);
  const discard = discardCount(settings.deckCount, shoe, onTable);

  // With many split hands the row scrolls sideways: keep the hand in play (and its buttons) on screen. //
  useEffect(() => {
    handsRef.current.querySelector(".player-hand.active")?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [selectedHandIndex, hands.length]);

  // A click on the felt moves on from the results (the dock has its own Next hand key) //
  const handleFeltClick = () => {
    if (phase === GamePhases.POST_ROUND) continueRound();
  };

  // The hidden top-up taps (#90) count only when idle, signed in, low, with no chips in the circle and nothing awaiting the server.
  const tapEnabled = !!player && player.credits < TOP_UP_BELOW && phase === GamePhases.PRE_DEAL && betCircle === 0 && pendingBets.length === 0;

  return (
    <FlightContext.Provider value={flight}>
    <div className={`board table-screen${busy ? " busy" : ""}`}>
      {/* TOP BAR */}
      <div className="top-bar">
        <div className="top-left stats">
          <StatsPanel player={player} tapEnabled={tapEnabled} />
        </div>
        <div className="top-center card-count">
          {settings.showCardCount && <CardCountDisplay shoe={shoe} runningCount={runningCount} dealing={phase === GamePhases.DEALING} />}
        </div>
        <div className="top-right">
          <DeckStack shoe={shoe} />
        </div>
      </div>

      {/* THE FELT (#81): the cloth, its rail, and the table on it */}
      <div className="room">
       <div className="felt">
        <div className="felt-light" aria-hidden="true" />
        <div className="rail" aria-hidden="true" />
        <div className="main-area stage" onClick={handleFeltClick}>
         {/* .stage-in holds --cw / --ch / --step / --room; its probe is the one element whose width is the formula's result */}
         <div className={`stage-in${hands.length > 1 ? " multi" : ""}${hands.length >= 4 ? " many" : ""}`} ref={stageInRef} style={{ "--n": hands.length }}>
          <div className="cw-probe" ref={probeRef} aria-hidden="true" />
          <Shoe discard={discard} cutOut={cutCardFound} />
          <div className="dealer-container">
            {dealer.cards.length > 0 && <DealerArea dealer={dealer} hiddenCount={dealerHole.cards.length} />}
          </div>

          <FeltPrint settings={settings} onOpen={() => navigate("/settings?tab=game")} onDraw={centrePrint} />
          <div className="mid">
            <CenterMessage
              gamePhase={busy && (phase === GamePhases.PLAYER_TURN || phase === GamePhases.OFFERS) ? GamePhases.DEALING : phase}
              offers={offers}
              bet={betCircle}
              autoDealing={autoDealPending}
              lastHand={cutCardFound}
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
                    active={selectedHandIndex === idx}
                    gamePhase={phase}
                  />
                ))}
              </div>
            </div>
          </div>
         </div>
        </div>
       </div>
      </div>

      {/* #3: the tips slot, 0 px tall while empty */}
      <div className="tip-line" aria-live="polite" />

      <Dock busy={busy} />
      <div className="flight-layer" ref={layerRef} />
    </div>
    </FlightContext.Provider>
  );
}
