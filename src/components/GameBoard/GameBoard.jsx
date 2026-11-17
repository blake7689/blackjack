import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlightContext } from "../../context/FlightContext";
import { cardTiming, clearLanded, queue } from "../../utils/cardAnimation";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandResult } from "../../utils/constants/handResult";
import { useGameState, useGameActions } from "../../hooks/useGame";
import { usePlayer } from "../../hooks/usePlayer";
import { useCardWidth } from "../../hooks/useCardWidth";
import { useDealerRoom } from "../../hooks/useDealerRoom";
import { useCentrePrint } from "../../hooks/useCentrePrint";
import { useSeatsScroll } from "../../hooks/useSeatsScroll";
import { useTightSeats } from "../../hooks/useTightSeats";
import { centrePrint } from "../../utils/centrePrint";
import { discardCount } from "../../utils/cards";
import { DEFAULT_CHIP, effectiveChip, visibleChips } from "../../utils/chips";
import TopBar from "../TopBar/TopBar";
import DealerArea from "../DealerArea/DealerArea";
import Shoe from "../Shoe/Shoe";
import FeltPrint from "../FeltPrint/FeltPrint";
import CenterMessage from "../CenterMessage/CenterMessage";
import PlayerHand from "../Playerhand/PlayerHand";
import Dock from "../Dock/Dock";
import "./GameBoard.css";

// Mirrors the API's "balance under 100" top-up guard; the API is the authority.
const TOP_UP_BELOW = 100;

export default function GameBoard() {
  const { dealer, dealerHole, shoe, hands, selectedHandIndex, phase, betCircle, settings, pendingBets, notice, offers, autoDealPending, cutCardFound } = useGameState();
  const { continueRound, addBet } = useGameActions();
  const { player, reconnecting } = usePlayer();
  const navigate = useNavigate();
  const seatsRef = useRef(null);
  const layerRef = useRef(null);
  const stageInRef = useRef(null);
  const probeRef = useRef(null);
  useCardWidth(stageInRef, probeRef);
  useDealerRoom(stageInRef, probeRef);
  useCentrePrint(stageInRef);
  const scroll = useSeatsScroll(seatsRef, stageInRef, Math.max(1, hands.length), phase === GamePhases.PLAYER_TURN ? selectedHandIndex : -1);
  const tight = useTightSeats(seatsRef, stageInRef, Math.max(1, hands.length));
  // The chip picked in the rack (#82) is UI state, not round state: the rack picks it, the bet circle bets it. What is shown is always a chip the
  // rack offers (the balance fell below it: the largest one below it).
  const [picked, setPicked] = useState(DEFAULT_CHIP);
  const chips = visibleChips(settings.chipValues, player ? player.credits : 0);
  const chip = effectiveChip(chips, picked);
  const canBet = !!player && chips.length > 0;
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

  // The seats: the hands, or (before the deal) one empty seat holding the chips in the circle. Keyed by tag, never by index.
  const seats = hands.length ? hands : [{ tag: "bet", cards: [], hiddenCards: [], bet: betCircle, result: HandResult.NONE }];

  // A click on the felt moves on from the results (the dock has its own Next hand key) //
  const handleFeltClick = () => {
    if (phase === GamePhases.POST_ROUND) continueRound();
  };

  // The hidden top-up taps (#90) count only when idle, signed in, low, with no chips in the circle and nothing awaiting the server.
  const tapEnabled = !!player && player.credits < TOP_UP_BELOW && phase === GamePhases.PRE_DEAL && betCircle === 0 && pendingBets.length === 0;

  const seatsClass = `seats${scroll ? " scroll" : ""}${tight ? " tight" : ""}${hands.length > 1 && phase === GamePhases.PLAYER_TURN ? " turns" : ""}`;
  const stageClass = `stage-in${hands.length > 1 ? " multi" : ""}${hands.length >= 4 ? " many" : ""}${phase === GamePhases.DEALING ? " dealing" : ""}`;

  return (
    <FlightContext.Provider value={flight}>
    <div className={`board table-screen${busy ? " busy" : ""}`}>
      <TopBar tapEnabled={tapEnabled} />

      {/* THE FELT (#81): the cloth, its rail, and the table on it */}
      <div className="room">
       <div className="felt">
        <div className="felt-light" aria-hidden="true" />
        <div className="rail" aria-hidden="true" />
        <div className="main-area stage" onClick={handleFeltClick}>
         {/* .stage-in holds --cw / --ch / --step / --room; its probe is the one element whose width is the formula's result */}
         <div className={stageClass} ref={stageInRef} style={{ "--n": seats.length }}>
          <div className="cw-probe" ref={probeRef} aria-hidden="true" />
          <Shoe discard={discard} cutOut={cutCardFound} />
          <div className="dealer-container">
            {dealer.cards.length > 0 && <DealerArea dealer={dealer} hiddenCount={dealerHole.cards.length} showTotals={settings.showTotals} />}
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

          <section className={seatsClass} aria-label="Your seats" ref={seatsRef}>
            {seats.map((hand, idx) => (
              <PlayerHand
                key={hand.tag}
                hand={hand}
                index={idx}
                active={hands.length ? selectedHandIndex === idx && phase === GamePhases.PLAYER_TURN : phase === GamePhases.PRE_DEAL && canBet}
                gamePhase={phase}
                showTotals={settings.showTotals}
                chip={chip}
                canBet={canBet}
                onBet={addBet}
              />
            ))}
          </section>
         </div>
        </div>
       </div>
      </div>

      {/* #3: the tips slot, 0 px tall while empty */}
      <div className="tip-line" aria-live="polite" />

      <Dock busy={busy} chip={chip} onChip={setPicked} />
      <div className="flight-layer" ref={layerRef} />
    </div>
    </FlightContext.Provider>
  );
}
