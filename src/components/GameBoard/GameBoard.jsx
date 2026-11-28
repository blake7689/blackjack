import { memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { lazyReload } from "../../utils/lazyReload";
import { FlightContext } from "../../context/FlightContext";
import { cardTiming, clearLanded, landed, queue, reserve, spots } from "../../utils/cardAnimation";
import { sweepCards } from "../../utils/cardFx";
import { playSound, setSoundPrefs, vibrate } from "../../utils/sound";
import { MOOD, resultsLine, verdictOf } from "../../utils/verdict";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandResult } from "../../utils/constants/handResult";
import { useGameState, useGameActions } from "../../hooks/useGame";
import { usePlayer } from "../../hooks/usePlayer";
import { useCardWidth } from "../../hooks/useCardWidth";
import { useDealerRoom } from "../../hooks/useDealerRoom";
import { useCentrePrint } from "../../hooks/useCentrePrint";
import { useSeatsScroll } from "../../hooks/useSeatsScroll";
import { useTightSeats } from "../../hooks/useTightSeats";
import { useLight } from "../../hooks/useLight";
import { usePeek } from "../../hooks/usePeek";
import { centrePrint } from "../../utils/centrePrint";
import { discardCount } from "../../utils/cards";
import { severalSpots } from "../../utils/blackjackLogic";
import { DEFAULT_CHIP, effectiveChip, visibleChips } from "../../utils/chips";
import TopBar from "../TopBar/TopBar";
import DealerArea from "../DealerArea/DealerArea";
import Shoe from "../Shoe/Shoe";
import FeltPrintBase from "../FeltPrint/FeltPrint";
import CenterMessage from "../CenterMessage/CenterMessage";
import PlayerHand from "../Playerhand/PlayerHand";
import Dock from "../Dock/Dock";
import ShuffleFx from "./ShuffleFx";
import CardWidthSync from "./CardWidthSync";
import "./GameBoard.css";

// Mirrors the API's "balance under 100" top-up guard; the API is the authority.
const TOP_UP_BELOW = 100;
const SETTINGS_UNLOADED = "Saved settings not loaded. Rules may differ. Retrying...";
// FeltPrint calls centrePrint (layout reads) after every one of its own renders; memoized, that is when its settings or box change, not on every board render (#140).
const FeltPrint = memo(FeltPrintBase);
const RulesSheet = lazyReload(() => import("../RulesSheet/RulesSheet")); // #169: loaded when first opened
const subscribeLanded = (l) => { landed.listeners.add(l); return () => landed.listeners.delete(l); };
const ROUND_SOUND = { win: "win", bj: "win", even: "win", lose: "lose", bust: "lose", surrender: "lose" }; // verdict kind -> sound and buzz (a push has neither)

export default function GameBoard() {
  const { dealer, dealerHole, shoe, hands, selectedHandIndex, phase, betCircle, betSpots, settings, pendingBets, notice, offers, autoDealPending, cutCardFound,
    seenIds, shoeSeq, shoeMid, nextHandTag, payoutNotice, payoutNoticeOld, settingsUnloaded } = useGameState();
  const { continueRound, addBet } = useGameActions();
  const { player, reconnecting } = usePlayer();
  const [rules, setRules] = useState(false); // the Table rules sheet (#87)
  const openRules = useCallback(() => setRules(true), []);
  setSoundPrefs(settings); // in render: the seats' own effects (an automatic rebet on mount) run before any effect here
  const seatsRef = useRef(null);
  const layerRef = useRef(null);
  const stageInRef = useRef(null);
  const feltRef = useRef(null);
  const probeRef = useRef(null);
  useCardWidth(stageInRef, probeRef);
  useDealerRoom(stageInRef, probeRef);
  // The seats: the hands, or (before the deal) one empty seat per offered spot with the chips on it (one spot: the circle's total). Keyed by tag, never by index.
  const several = severalSpots(settings, hands);
  const seats = hands.length ? hands : Array.from({ length: settings.handSpots }, (_, spot) => (
    { tag: `bet${spot}`, spot, cards: [], hiddenCards: [], bet: several ? betSpots[spot] : betCircle, result: HandResult.NONE }));
  const [tight, decideTight] = useTightSeats(seatsRef, stageInRef, seats.length);
  // The circle tapped last (#59) is UI state too: the rack's double tap and the keys 1-9 bet into it. A spot no longer offered falls back to the first.
  const [tapped, setTapped] = useState(0);
  const selectedSpot = tapped < settings.handSpots ? tapped : 0;
  const betOnSpot = useCallback((value, spot) => { setTapped(spot); if (spot) addBet(value, spot); else addBet(value); }, [addBet]);
  // The chip picked in the rack (#82) is UI state, not round state: the rack picks it, the bet circle bets it. What is shown is always a chip the
  // rack offers (the balance fell below it: the largest one below it).
  const [picked, setPicked] = useState(DEFAULT_CHIP);
  const chips = visibleChips(settings.chipValues, player ? player.credits : 0);
  const chip = effectiveChip(chips, picked);
  // No bet while the table shuffles (#147; the mockup's circle is disabled then, and Dock dims the rack and keys): the circle is idle, not open.
  const [shuf, setShuf] = useState(null); // the shuffle in progress (ShuffleFx, below): { away, emptied, pile }, null when none
  const canBet = !!player && chips.length > 0 && !shuf;
  // Cards on the board's first render never fly (returning from Settings): they read `enabled` while it is still false.
  const [enabled, setEnabled] = useState(false);
  useEffect(() => setEnabled(true), []);
  useEffect(() => { if (phase === GamePhases.PRE_DEAL) { clearLanded(); spots.clear(); } }, [phase]);
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
    check(); // time reserved before this subscribed (the opening shuffle's layout effect) counts too
    return () => { queue.listeners.delete(check); clearTimeout(t); };
  }, []);
  const timing = useMemo(() => cardTiming(Number(settings.playTimeout)), [settings.playTimeout]);
  const flight = useMemo(() => ({ enabled, layerRef, timing }), [enabled, timing]);

  // The discard pile: what was dealt and is no longer on the table.
  const onTable = dealer.cards.length + dealerHole.cards.length + hands.reduce((n, h) => n + h.cards.length + h.hiddenCards.length, 0);
  const discard = discardCount(settings.deckCount, shoe, onTable);

  // Motion (#83). The shuffle (ShuffleFx, below): the shoe and the pile slide off while it plays, the pile still shows what it held until it is emptied.
  // The peek check: a blackjack's hole card keeps its face down until the check is over. The sweep: Next hand sends every card to the pile (the real cards
  // go with the round's state a moment later). The light follows the hand in play; the verdict and the result light show once the hands are settled.
  const speed = Number(settings.playTimeout);
  const { peek, hideHole } = usePeek({ phase, dealer, dealerHole, settings, round: nextHandTag, speed });
  // The pile counts the swept cards from the moment the last one lands (`swept`), not when the round's state follows a beat later: the pile is already there, at its
  // level, under the copies when they go, so nothing flickers or jumps (L2-10).
  const [swept, setSwept] = useState(false);
  useLayoutEffect(() => {
    if (phase !== GamePhases.END_ROUND) return;
    const fx = sweepCards();
    if (!fx) return;
    const undo = reserve(performance.now() + fx.ms + 50);
    const landedAt = setTimeout(() => flushSync(() => setSwept(true)), fx.ms); // flushed in this task: the copies' own timer (ms + 100, cardFx) can then never run before the pile has rendered its new level
    return () => { undo(); fx.cancel(); clearTimeout(landedAt); setSwept(false); };
  }, [phase]);
  useLight(feltRef, stageInRef, { phase, active: selectedHandIndex });
  // The hand in play, and with several spots the one being asked at the offers, is highlighted and kept in view.
  const asking = phase === GamePhases.PLAYER_TURN || (several && phase === GamePhases.OFFERS);
  const verdict = phase === GamePhases.RESULTS || phase === GamePhases.POST_ROUND ? verdictOf(hands) : null;
  // The message line's notice (it takes the verdict's place too). The newest wins: a refused payout clears `notice` (or sets one that says both, #207), so one set here includes or came after it. A payout refusal replaces
  // its own verdict (it would be wrong), never a later round's. Unloaded settings never hide a verdict.
  const lineNotice = notice || (payoutNoticeOld && verdict ? null : payoutNotice) || (settingsUnloaded && !verdict ? SETTINGS_UNLOADED : null);
  // The round's one win or lose sound and buzz, when the verdict first shows (a push has neither).
  const kind = phase === GamePhases.RESULTS ? verdict?.kind : null;
  useEffect(() => {
    const result = ROUND_SOUND[kind];
    if (!result) return;
    playSound(result);
    vibrate(result);
  }, [kind]);
  const shownDiscard = shuf && !shuf.emptied ? shuf.pile : swept ? discard + onTable : discard;

  // Layout reads (#140): useSeatsScroll's overflow check and useCentrePrint measure boxes only when this string changes (a re-render that changes none of
  // what sizes a box reads nothing). It lists what sizes them: each seat's cards, bet, result tag and side stakes; the dealer's cards; the phase, the
  // message line's state, the shuffle and the totals switch, and how many of each seat's cards have landed (#161: the pill, which can widen to
  // "Blackjack!" or "7/17", changes only when a card lands; the string snapshot re-renders the board only when a count changes).
  const landedCounts = useSyncExternalStore(subscribeLanded, () => seats.map((h) => h.cards.filter((c) => landed.ids.has(c.id)).length).join("."));
  const layoutKey = [
    landedCounts,
    seats.map((h) => [h.tag, h.cards.length, h.hiddenCards.length, h.bet, h.result, h.isDouble ? 1 : 0, h.baseStake ?? 0, h.insurance ?? 0, h.insurancePayout ?? 0].join(".")).join("|"),
    dealer.cards.length, dealerHole.cards.length, phase, !!offers, !!lineNotice, reconnecting, peek, verdict?.kind, !!shuf, settings.showTotals,
  ].join(",");
  const [scroll, syncScroll] = useSeatsScroll(seatsRef, stageInRef, seats.length, asking ? selectedHandIndex : -1, layoutKey, !hands.length);
  useCentrePrint(stageInRef, `${layoutKey},${scroll},${tight}`); // scroll and tight change the seats' boxes too

  // A click on the felt moves on from the results (the dock has its own Next hand key) //
  const handleFeltClick = () => {
    if (phase === GamePhases.POST_ROUND) continueRound();
  };

  // The hidden top-up taps (#90) count only when idle, signed in, low, with no chips in the circle and nothing awaiting the server.
  const tapEnabled = !!player && player.credits < TOP_UP_BELOW && phase === GamePhases.PRE_DEAL && betCircle === 0 && pendingBets.length === 0;

  const seatsClass = `seats${scroll ? " scroll" : ""}${tight ? " tight" : ""}${hands.length > 1 && asking ? " turns" : ""}`;
  const stageClass = `stage-in${seats.length > 1 ? " multi" : ""}${seats.length >= 4 ? " many" : ""}${several ? " spots" : ""}${phase === GamePhases.DEALING ? " dealing" : ""}${phase === GamePhases.END_ROUND ? " ending" : ""}`;

  return (
    <FlightContext.Provider value={flight}>
    <div className={`board table-screen${busy ? " busy" : ""}`}>
      <ShuffleFx set={setShuf} seq={shoeSeq} mid={shoeMid} speed={speed} enter={phase === GamePhases.PRE_DEAL && seenIds.length === 0} pile={discard + onTable} />
      <TopBar tapEnabled={tapEnabled} onRules={() => setRules(true)} />

      {/* THE FELT (#81): the cloth, its rail, and the table on it */}
      <div className="room">
       <div className={`felt${verdict ? ` ${MOOD[verdict.kind]}` : ""}`} ref={feltRef}>
        <div className="felt-light" aria-hidden="true" />
        <div className="mood" aria-hidden="true" />
        <div className="rail" aria-hidden="true" />
        <div className="main-area stage" onClick={handleFeltClick}>
         {/* .stage-in holds --cw / --ch / --step / --room; its probe is the one element whose width is the formula's result */}
         <div className={stageClass} ref={stageInRef} style={{ "--n": seats.length }}>
          <div className="cw-probe" ref={probeRef} aria-hidden="true" />
          <CardWidthSync stageRef={stageInRef} probeRef={probeRef} seats={seats.length} decideTight={decideTight} syncScroll={syncScroll} />
          <Shoe discard={shownDiscard} cutOut={cutCardFound} away={!!shuf?.away} />
          <div className="dealer-container">
            {dealer.cards.length > 0 && <DealerArea dealer={dealer} hiddenCount={dealerHole.cards.length} showTotals={settings.showTotals} holdHole={hideHole} holeOrder={2 * Math.max(1, new Set(hands.map((h) => h.spot)).size) + 1} seats={seats.length} />}
          </div>

          <FeltPrint settings={settings} onOpen={openRules} onDraw={centrePrint} />
          <div className="mid">
            <CenterMessage
              gamePhase={busy && (phase === GamePhases.PLAYER_TURN || phase === GamePhases.OFFERS) ? GamePhases.DEALING : phase}
              offers={offers}
              bet={betCircle}
              broke={chips.length === 0}
              autoDealing={autoDealPending}
              lastHand={cutCardFound}
              waiting={phase === GamePhases.SETTLING_HANDS && pendingBets.length > 0}
              reconnecting={reconnecting}
              notice={lineNotice}
              verdict={verdict}
              heard={verdict && resultsLine(hands, dealer, settings.showTotals)}
              shuffling={!!shuf}
              peek={peek}
              messages={settings.tableMessages}
              hand={selectedHandIndex}
              askSpot={several && phase === GamePhases.OFFERS ? hands[selectedHandIndex].spot + 1 : 0}
            />
          </div>

          <section className={seatsClass} aria-label="Your seats" ref={seatsRef}>
            {seats.map((hand, idx) => (
              <PlayerHand
                key={hand.tag}
                hand={hand}
                index={idx}
                active={hands.length ? asking && selectedHandIndex === idx : phase === GamePhases.PRE_DEAL && canBet && idx === selectedSpot}
                spotNo={several ? hand.spot + 1 : 0}
                first={idx === 0 || seats[idx - 1].spot !== hand.spot}
                pressed={!hands.length && several ? idx === selectedSpot : undefined}
                gamePhase={phase}
                showTotals={settings.showTotals}
                chip={chip}
                canBet={canBet}
                onBet={betOnSpot}
                multi={seats.length > 1}
                seats={seats.length}
              />
            ))}
          </section>
         </div>
        </div>
       </div>
      </div>

      {/* #3: the tips slot, 0 px tall while empty */}
      <div className="tip-line" />

      <Dock busy={busy} chip={chip} onChip={setPicked} shuffling={!!shuf} spot={selectedSpot} />
      <div className="flight-layer" ref={layerRef} />
      {rules && <Suspense fallback={null}><RulesSheet settings={settings} onClose={() => setRules(false)} /></Suspense>}
    </div>
    </FlightContext.Provider>
  );
}
