import { GamePhases } from "./constants/gamePhases";
import { HandStatus } from "./constants/handStatus";
import { DealerHoleOptions } from "./constants/dealerHoleOptions";
import { canSplit } from "./blackjackLogic";
import * as engine from "./gameEngine";

// All round state lives here. The reducer is pure apart from `refill`/`shoe` values passed in on actions,
// so React may call it twice (StrictMode) and get the same result. GameProvider owns the timers and credits.

export const initialGameState = {
  settings: {
    deckCount: 2,
    includeCutCard: true,
    playTimeout: 1000,
    dealerHoleBehaviour: DealerHoleOptions.US_PEEK,
    blackJackOnSplit: false,
    resetInitialBet: false,
    dealerDrawsOnceOn21: false,
    dealerDrawsOnPlayerBlackjack: true,
    dealerDrawsOnPlayerBust: false,
    blackjackPaysImmediately: true, // matches the US preset; makes no difference with a peek
    showCardCount: true,
    maxSplitHands: 0, // 0 = unlimited; 2 = one split per round
  },
  phase: GamePhases.NONE,
  shoe: [],
  hands: [],
  dealer: { cards: [] },
  dealerHole: { cards: [] },
  dealerRevealed: false,
  dealerSkipDraw: false,
  selectedHandIndex: 0,
  betCircle: 0,
  initialBet: 0,
  cutCardFound: false,
  seenIds: [],
  runningCount: 0,
  creditEvents: [],
  creditSeq: 0,
};

// Changing these settings deals a new shoe and resets the table. //
export const RESET_SETTINGS = ["deckCount", "includeCutCard", "dealerHoleBehaviour", "blackJackOnSplit",
  "dealerDrawsOnceOn21", "dealerDrawsOnPlayerBlackjack", "dealerDrawsOnPlayerBust", "blackjackPaysImmediately", "maxSplitHands"];

// Allowed ranges for number settings (the Settings page uses them too). maxSplitHands 0 = unlimited.
export const SETTING_RANGES = { deckCount: [1, 5], playTimeout: [250, 5000], maxSplitHands: [2, 4] };

// Settings saved on the server (#36) are untrusted: keep known keys of the right type, clamp numbers into range,
// fall back to the default for anything else, and fill what's missing from the defaults.
export function sanitizeSettings(saved) {
  return Object.fromEntries(Object.entries(initialGameState.settings).map(([key, fallback]) => {
    const value = saved?.[key];
    if (typeof value !== typeof fallback) return [key, fallback];
    if (key === "dealerHoleBehaviour") return [key, Object.values(DealerHoleOptions).includes(value) ? value : fallback];
    const range = SETTING_RANGES[key];
    if (!range || (key === "maxSplitHands" && value === 0)) return [key, value];
    return [key, Math.min(range[1], Math.max(range[0], Math.round(value)))];
  }));
}

const emptyRound = {
  hands: [],
  dealer: { cards: [] },
  dealerHole: { cards: [] },
  dealerRevealed: false,
  dealerSkipDraw: false,
  selectedHandIndex: 0,
};

// Queues a balance change; GameProvider hands each event to PlayerProvider exactly once. Kinds:
//   local:  chips moved on the table only ({ amount } is the change to the shown balance)
//   bet:    a stake for the server ledger ({ amount, newRound, alreadyDeducted })
//   settle: the round's payout for the server ledger ({ amount }, sent even when 0 to close the round)
function credit(state, event) {
  const creditSeq = state.creditSeq + 1;
  return { ...state, creditSeq, creditEvents: [...state.creditEvents, { seq: creditSeq, ...event }].slice(-20) };
}

const local = (amount) => ({ kind: "local", amount });

// Runs an engine draw on a copy of the shoe, so the state's shoe is never mutated. //
function draw(state, refill, fn) {
  const shoe = [...state.shoe];
  let cutCardFound = state.cutCardFound;
  let refilled = false;
  const result = fn(shoe, () => { cutCardFound = true; }, () => { refilled = true; return refill(); });
  return { result, next: { ...state, shoe, cutCardFound }, refilled };
}

// Adds newly visible cards to the running count (reset = a fresh shoe). //
function countSeen(state, reset = false) {
  const seenIds = reset ? [] : state.seenIds;
  const visible = [...state.hands.flatMap((h) => h.cards), ...state.dealer.cards];
  const fresh = visible.filter((c) => !seenIds.includes(c.id));
  return {
    ...state,
    seenIds: [...seenIds, ...fresh.map((c) => c.id)],
    runningCount: (reset ? 0 : state.runningCount) + fresh.reduce((sum, c) => sum + c.count, 0),
  };
}

function resetTable(state, shoe, phase) {
  const refunded = state.phase === GamePhases.PRE_DEAL && state.betCircle > 0 ? credit(state, local(state.betCircle)) : state;
  return countSeen({ ...refunded, ...emptyRound, shoe, phase, betCircle: 0, cutCardFound: false }, true);
}

// The player may act on a hand only on their turn, on the selected hand, while it is still in play. //
function canAct(state, handIdx) {
  return state.phase === GamePhases.PLAYER_TURN && handIdx === state.selectedHandIndex
    && state.hands[handIdx]?.status === HandStatus.PLAYING;
}

// After an action: keep playing this hand, move to the next unfinished hand, or hand over to the dealer. //
function advance(state, hands, handIdx) {
  const betCircle = hands.reduce((sum, h) => sum + h.bet, 0);
  if (hands[handIdx].status !== HandStatus.DONE) return { ...state, hands, betCircle };
  const nextIdx = hands.findIndex((h, i) => i > handIdx && h.status !== HandStatus.DONE);
  if (nextIdx !== -1) return { ...state, hands, betCircle, selectedHandIndex: nextIdx };
  return { ...state, hands, betCircle, selectedHandIndex: 0, phase: GamePhases.DEALER_TURN };
}

function replaceHand(hands, handIdx, ...replacement) {
  return [...hands.slice(0, handIdx), ...replacement, ...hands.slice(handIdx + 1)];
}

function playerAction(state, action) {
  const { handIdx } = action;
  if (!canAct(state, handIdx)) return state;
  const hand = state.hands[handIdx];

  if (action.type === "STAND") {
    return advance(state, replaceHand(state.hands, handIdx, { ...hand, status: HandStatus.DONE }), handIdx);
  }

  if (action.type === "HIT") {
    const { result, next, refilled } = draw(state, action.refill, (shoe, cut, refill) => engine.playerHit(hand, shoe, cut, refill));
    return countSeen(advance(next, replaceHand(state.hands, handIdx, result.hand), handIdx), refilled);
  }

  if (action.credits < hand.bet) return state;

  if (action.type === "DOUBLE") {
    if (hand.cards.length !== 2) return state;
    const { result, next, refilled } = draw(state, action.refill, (shoe, cut, refill) => engine.playerDouble(hand, shoe, cut, refill));
    return countSeen(advance(credit(next, { kind: "bet", amount: hand.bet, newRound: false, alreadyDeducted: false }), replaceHand(state.hands, handIdx, result.hand), handIdx), refilled);
  }

  // SPLIT
  if (!canSplit(hand, state.hands.length, state.settings.maxSplitHands)) return state;
  const { result, next, refilled } = draw(state, action.refill,
    (shoe, cut, refill) => engine.playerSplit(hand, shoe, cut, refill, state.settings.blackJackOnSplit));
  return countSeen(advance(credit(next, { kind: "bet", amount: hand.bet, newRound: false, alreadyDeducted: false }), replaceHand(state.hands, handIdx, ...result.newHandsArray), handIdx), refilled);
}

export function gameReducer(state, action) {
  switch (action.type) {
    case "START_GAME":
      return resetTable(state, action.shoe, GamePhases.PRE_DEAL);

    case "RESET_GAME":
      return resetTable(state, action.shoe, action.phase);

    case "SET_SETTING": {
      // { key, value } for one setting, or { values } for several at once (a rules preset).
      const next = { ...state, settings: { ...state.settings, ...(action.values ?? { [action.key]: action.value }) } };
      return action.shoe ? resetTable(next, action.shoe, GamePhases.PRE_DEAL) : next;
    }

    case "LOAD_SETTINGS": {
      // Saved settings arrive after sign-in. Between rounds a changed table setting deals the new shoe;
      // a round in progress is never reset.
      const next = { ...state, settings: sanitizeSettings(action.saved) };
      const tableChanged = RESET_SETTINGS.some((key) => next.settings[key] !== state.settings[key]);
      return tableChanged && state.phase === GamePhases.PRE_DEAL ? resetTable(next, action.shoe, GamePhases.PRE_DEAL) : next;
    }

    case "ADD_BET":
      if (state.phase !== GamePhases.PRE_DEAL || action.amount > action.credits) return state;
      return credit({ ...state, betCircle: state.betCircle + action.amount }, local(-action.amount));

    case "CLEAR_BET":
      if (state.phase !== GamePhases.PRE_DEAL || state.betCircle === 0) return state;
      return credit({ ...state, betCircle: 0 }, local(state.betCircle));

    case "DEAL": {
      if (state.phase !== GamePhases.PRE_DEAL || state.betCircle === 0) return state;
      const { result, next, refilled } = draw(state, action.refill,
        (shoe, cut, refill) => engine.dealRound(shoe, state.betCircle, cut, refill, state.settings));
      const dealt = {
        ...next,
        ...emptyRound,
        hands: result.hands,
        dealer: result.dealer,
        dealerHole: result.dealerHoleCards,
        initialBet: state.betCircle,
        phase: result.hands[0].status === HandStatus.DONE ? GamePhases.DEALER_TURN : GamePhases.PLAYER_TURN,
      };
      // The chips already left the shown balance; this stakes them on the server and opens the round.
      return countSeen(credit(dealt, { kind: "bet", amount: state.betCircle, newRound: true, alreadyDeducted: true }), refilled);
    }

    case "HIT":
    case "STAND":
    case "DOUBLE":
    case "SPLIT":
      return playerAction(state, action);

    case "DEALER_REVEAL": {
      const dealer = engine.revealDealerHole(state.dealer, state.dealerHole);
      const revealed = { ...state, dealerHole: { cards: [] }, dealerRevealed: true };
      if (dealer.status === HandStatus.DONE) {
        return countSeen({ ...revealed, dealer, phase: GamePhases.SETTLING_HANDS });
      }
      return countSeen({
        ...revealed,
        dealer: {
          ...dealer,
          status: dealer.status === HandStatus.DRAW_HOLE ? HandStatus.DRAW_HOLE : HandStatus.PLAYING,
          checkBlackjackOnly: engine.dealerOnlyChecksBlackjack(state.hands, state.settings),
        },
        dealerSkipDraw: !engine.dealerNeedsToPlay(state.hands) && !engine.dealerShowsSecondCard(state.hands, state.settings),
      });
    }

    case "DEALER_STEP": {
      const { result, next, refilled } = draw(state, action.refill,
        (shoe, cut, refill) => engine.dealerPlay(state.dealer, { cards: [] }, shoe, state.dealerSkipDraw, cut, refill));
      const stillPlaying = result.dealer.status === HandStatus.PLAYING || result.dealer.status === HandStatus.DRAW_HOLE;
      return countSeen({ ...next, dealer: result.dealer, phase: stillPlaying ? GamePhases.DEALER_TURN : GamePhases.SETTLING_HANDS }, refilled);
    }

    case "SETTLE":
      return { ...state, hands: engine.settleHands(state.hands, state.dealer), phase: GamePhases.RESULTS };

    case "FINISH_RESULTS": {
      // Always settle, even a total loss, so the server closes the round.
      const payout = state.hands.reduce((sum, h) => sum + h.payout, 0);
      return credit({ ...state, phase: GamePhases.POST_ROUND }, { kind: "settle", amount: payout });
    }

    case "CONTINUE":
      return state.phase === GamePhases.POST_ROUND ? { ...state, phase: GamePhases.END_ROUND } : state;

    case "END_ROUND": {
      const { initialBet } = state;
      const rebet = state.settings.resetInitialBet && initialBet > 0 && action.credits >= initialBet;
      let next = { ...state, ...emptyRound, phase: GamePhases.PRE_DEAL, betCircle: rebet ? initialBet : 0 };
      if (rebet) next = credit(next, local(-initialBet));
      if (state.cutCardFound) next = countSeen({ ...next, shoe: action.shoe, cutCardFound: false }, true);
      return next;
    }

    default:
      throw new Error(`Unknown game action ${action.type}`);
  }
}

// Which automatic step comes next, if any; GameProvider schedules it after the play timeout. //
export function nextAutoAction(state) {
  switch (state.phase) {
    case GamePhases.DEALER_TURN: return state.dealerRevealed ? "DEALER_STEP" : "DEALER_REVEAL";
    case GamePhases.SETTLING_HANDS: return "SETTLE";
    case GamePhases.RESULTS: return "FINISH_RESULTS";
    case GamePhases.END_ROUND: return "END_ROUND";
    default: return null;
  }
}
