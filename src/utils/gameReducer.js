import { GamePhases } from "./constants/gamePhases";
import { HandStatus } from "./constants/handStatus";
import { DealerHoleOptions } from "./constants/dealerHoleOptions";
import { BlackjackPayouts, DoubleOn, NoHoleCardLoss, SurrenderOptions } from "./constants/ruleOptions";
import { canSplit, canDouble, canSurrender, isSplitAces, cents } from "./blackjackLogic";
import { DEFAULT_CHIP_VALUES, parseChipValues } from "./chips";
import * as engine from "./gameEngine";

// All round state lives here. The reducer is pure apart from `refill`/`shoe` values passed in on actions,
// so React may call it twice (StrictMode) and get the same result. GameProvider owns the timers and credits.

export const initialGameState = {
  settings: {
    deckCount: 6, // the defaults are the Vegas preset (utils/rulePresets.js)
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
    maxSplitHands: 4, // 0 = unlimited; 2 = one split per round
    dealerHitsSoft17: true,
    blackjackPayout: BlackjackPayouts.THREE_TWO,
    doubleOn: DoubleOn.ANY, // hard totals only
    doubleAfterSplit: true,
    resplitAces: false,
    hitSplitAces: false,
    noHoleCardLoss: NoHoleCardLoss.ORIGINAL, // a dealer blackjack found after the player added stakes: takes only the first bet
    surrender: SurrenderOptions.LATE,
    insurance: true, // offered against a dealer ace (and even money on a player blackjack)
    chipValues: DEFAULT_CHIP_VALUES,
    tripleDown: false,
    tripleDrawsOnBust: false, // a second triple card is drawn even if the first busted
    doubleFaceDown: false, // a double's card stays hidden until REVEAL_HIDDEN
    autoDeal: false, // rounds continue and deal by themselves (needs resetInitialBet)
    autoDealDelay: 3000, // ms between the rebet and the automatic deal
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
  pendingBets: [], // bets sent to the server and not yet answered: { seq, handTag, amount, newRound }
  nextHandTag: 1,
  notice: null, // a message about the round, such as a refused bet
  autoDealPaused: false, // the player stopped auto deal, or a rebet was unaffordable; Resume clears it
  autoDealPending: false, // a rebet is on the table and the automatic DEAL step is armed
};

// Changing these settings deals a new shoe and resets the table. //
export const RESET_SETTINGS = ["deckCount", "includeCutCard", "dealerHoleBehaviour", "blackJackOnSplit",
  "dealerDrawsOnceOn21", "dealerDrawsOnPlayerBlackjack", "dealerDrawsOnPlayerBust", "blackjackPaysImmediately", "maxSplitHands",
  "dealerHitsSoft17", "blackjackPayout", "doubleOn", "doubleAfterSplit", "resplitAces", "hitSplitAces", "noHoleCardLoss", "surrender", "insurance"];

// Allowed ranges for number settings (the Settings page uses them too). maxSplitHands 0 = unlimited.
export const SETTING_RANGES = { deckCount: [1, 8], playTimeout: [250, 5000], maxSplitHands: [2, 4], autoDealDelay: [0, 10000] };

// Saved settings carry a version (`v`). Version 2 (#91) added the table rules above, version 3 added surrender, version 4
// insurance; every save before that is `v: 1`. A missing rule key in an older object gets today's behaviour from LEGACY_RULES, so
// an existing table never changes payout (`v: 1` gets all of them; `v: 1` and `v: 2` get surrender "none"; `v: 1` to `v: 3` get
// insurance off). `{}`, a missing `v` and the current version get the Vegas defaults. The next save writes `v: 4` with every key.
// Whoever adds a rule key later must bump SETTINGS_VERSION, add its RULE_SINCE entry and its LEGACY_RULES value.
export const SETTINGS_VERSION = 4;
export const LEGACY_RULES = {
  deckCount: 2, maxSplitHands: 0, dealerHitsSoft17: false, blackjackPayout: BlackjackPayouts.THREE_TWO, doubleOn: DoubleOn.ANY,
  doubleAfterSplit: true, resplitAces: false, hitSplitAces: false, noHoleCardLoss: NoHoleCardLoss.ALL,
  surrender: SurrenderOptions.NONE, insurance: false,
};
// The saved version that introduced a rule key (a key not listed came with version 2). An older saved object has no such key.
const RULE_SINCE = { surrender: 3, insurance: 4 };

// Settings that hold one of a fixed list of strings.
const ENUM_SETTINGS = {
  dealerHoleBehaviour: Object.values(DealerHoleOptions),
  blackjackPayout: Object.values(BlackjackPayouts),
  doubleOn: Object.values(DoubleOn),
  noHoleCardLoss: Object.values(NoHoleCardLoss),
  surrender: Object.values(SurrenderOptions),
};

// Settings saved on the server (#36) are untrusted: keep known keys of the right type, clamp numbers into range,
// fall back to the default (or, for an older object, the legacy rule) for anything else, and fill what's missing.
export function sanitizeSettings(saved) {
  const v = saved?.v;
  const legacy = (key) => key in LEGACY_RULES && Number.isInteger(v) && v >= 1 && v < (RULE_SINCE[key] ?? 2);
  const settings = Object.fromEntries(Object.entries(initialGameState.settings).map(([key, standard]) => {
    const fallback = legacy(key) ? LEGACY_RULES[key] : standard;
    const value = saved?.[key];
    if (typeof value !== typeof fallback) return [key, fallback];
    if (key in ENUM_SETTINGS) return [key, ENUM_SETTINGS[key].includes(value) ? value : fallback];
    if (key === "chipValues") return [key, parseChipValues(value).join(",") || fallback];
    const range = SETTING_RANGES[key];
    if (!range || (key === "maxSplitHands" && value === 0)) return [key, value];
    return [key, Math.min(range[1], Math.max(range[0], Math.round(value)))];
  }));
  return settings.resetInitialBet ? settings : { ...settings, autoDeal: false }; // auto deal needs the rebet
}

// Auto deal runs only with Reset bet on and while the player has not stopped it.
export function autoDealOn(state) {
  return state.settings.autoDeal && state.settings.resetInitialBet && !state.autoDealPaused;
}

const emptyRound = {
  hands: [],
  dealer: { cards: [] },
  dealerHole: { cards: [] },
  dealerRevealed: false,
  dealerSkipDraw: false,
  selectedHandIndex: 0,
  notice: null,
};

// Queues a balance change; GameProvider hands each event to PlayerProvider exactly once. Kinds:
//   local:  chips moved on the table only ({ amount } is the change to the shown balance)
//   bet:    a stake for the server ledger ({ amount, newRound, alreadyDeducted, handTag }); handTag finds the hand
//           again when the answer comes (null for the opening bet). Until the server answers it sits in pendingBets.
//   settle: the round's payout for the server ledger ({ amount }, sent even when 0 to close the round)
function credit(state, event) {
  const creditSeq = state.creditSeq + 1;
  const pending = event.kind === "bet" ? [{ seq: creditSeq, handTag: event.handTag, amount: event.amount, newRound: event.newRound }] : [];
  return {
    ...state,
    creditSeq,
    creditEvents: [...state.creditEvents, { seq: creditSeq, ...event }].slice(-20),
    pendingBets: [...state.pendingBets, ...pending],
  };
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
  return countSeen({ ...refunded, ...emptyRound, shoe, phase, betCircle: 0, cutCardFound: false, pendingBets: [], autoDealPending: false }, true);
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

  if (action.type === "SURRENDER") {
    if (!canSurrender(hand, state.dealer, state.settings)) return state; // adds no stake, so it comes before the credits guard
    return advance(state, replaceHand(state.hands, handIdx, engine.playerSurrender(hand, state.dealer.cards[0], state.settings)), handIdx);
  }

  if (action.type === "HIT") {
    if (isSplitAces(hand) && !state.settings.hitSplitAces) return state; // a split ace may only be split again or stood on
    const { result, next, refilled } = draw(state, action.refill, (shoe, cut, refill) => engine.playerHit(hand, shoe, cut, refill));
    return countSeen(advance(next, replaceHand(state.hands, handIdx, result.hand), handIdx), refilled);
  }

  if (hand.bet <= 0 || action.credits < hand.bet) return state; // a hand whose stake was refused can't add to it

  if (action.type === "DOUBLE") {
    if (!canDouble(hand, state.settings)) return state;
    const { result, next, refilled } = draw(state, action.refill, (shoe, cut, refill) => engine.playerDouble(hand, shoe, cut, refill, state.settings.doubleFaceDown));
    return countSeen(advance(credit(next, { kind: "bet", amount: hand.bet, newRound: false, alreadyDeducted: false, handTag: hand.tag }), replaceHand(state.hands, handIdx, result.hand), handIdx), refilled);
  }

  if (action.type === "TRIPLE") {
    // Must return here: anything else falls through to the split code. Needs two more stakes. Allowed where a double is.
    if (!state.settings.tripleDown || !canDouble(hand, state.settings) || action.credits < hand.bet * 2) return state;
    const { result, next, refilled } = draw(state, action.refill,
      (shoe, cut, refill) => engine.playerTripleDown(hand, shoe, cut, refill, state.settings.tripleDrawsOnBust));
    return countSeen(advance(credit(next, { kind: "bet", amount: hand.bet * 2, newRound: false, alreadyDeducted: false, handTag: hand.tag }), replaceHand(state.hands, handIdx, result.hand), handIdx), refilled);
  }

  // SPLIT
  const { maxSplitHands, resplitAces, hitSplitAces } = state.settings;
  if (!canSplit(hand, state.hands.length, maxSplitHands, resplitAces)) return state;
  const { result, next, refilled } = draw(state, action.refill,
    (shoe, cut, refill) => engine.playerSplit(hand, shoe, cut, refill, { blackJackOnSplit: state.settings.blackJackOnSplit, resplitAces, hitSplitAces }));
  // Both new hands start as copies of the parent; the second one is a new hand and gets its own tag (it takes the new stake).
  const [first, second] = result.newHandsArray;
  const splitOff = { ...second, tag: next.nextHandTag };
  const split = credit({ ...next, nextHandTag: next.nextHandTag + 1 }, { kind: "bet", amount: hand.bet, newRound: false, alreadyDeducted: false, handTag: splitOff.tag });
  // A split ace left waiting to be split again that no longer can be (the hand limit) has nothing to do: finish it before
  // advance(), or the turn could stay on a finished hand. Every ace-split hand of the round is checked, not just the new ones.
  const hands = replaceHand(state.hands, handIdx, first, splitOff).map((h) =>
    isSplitAces(h) && !hitSplitAces && h.status === HandStatus.PLAYING && !canSplit(h, state.hands.length + 1, maxSplitHands, resplitAces)
      ? { ...h, status: HandStatus.DONE } : h);
  return countSeen(advance(split, hands, handIdx), refilled);
}

export function gameReducer(state, action) {
  switch (action.type) {
    case "START_GAME":
      return { ...resetTable(state, action.shoe, GamePhases.PRE_DEAL), autoDealPaused: false };

    case "RESET_GAME":
      return { ...resetTable(state, action.shoe, action.phase), autoDealPaused: false };

    case "SET_SETTING": {
      // { key, value } for one setting, or { values } for several at once (a rules preset).
      const values = action.values ?? { [action.key]: action.value };
      const settings = { ...state.settings, ...values };
      // Enabling auto deal starts it running; a pending deal does not outlive turning it off.
      const next = { ...state, settings, autoDealPaused: "autoDeal" in values ? false : state.autoDealPaused };
      next.autoDealPending = state.autoDealPending && autoDealOn(next);
      return action.shoe ? resetTable(next, action.shoe, GamePhases.PRE_DEAL) : next;
    }

    case "LOAD_SETTINGS": {
      // Saved settings arrive after sign-in. Between rounds a changed table setting deals the new shoe;
      // a round in progress is never reset.
      const next = { ...state, settings: sanitizeSettings(action.saved) };
      next.autoDealPending = state.autoDealPending && autoDealOn(next);
      const tableChanged = RESET_SETTINGS.some((key) => next.settings[key] !== state.settings[key]);
      return tableChanged && state.phase === GamePhases.PRE_DEAL ? resetTable(next, action.shoe, GamePhases.PRE_DEAL) : next;
    }

    case "ADD_BET":
      if (state.phase !== GamePhases.PRE_DEAL || action.amount > action.credits) return state;
      return credit({ ...state, betCircle: state.betCircle + action.amount, autoDealPending: false }, local(-action.amount));

    case "CLEAR_BET":
      if (state.phase !== GamePhases.PRE_DEAL || state.betCircle === 0) return state;
      return credit({ ...state, betCircle: 0, autoDealPending: false }, local(state.betCircle));

    case "DEAL": {
      if (state.phase !== GamePhases.PRE_DEAL || state.betCircle === 0) return state;
      if (action.auto && !state.autoDealPending) return state; // a timer step that was cancelled
      const { result, next, refilled } = draw(state, action.refill,
        (shoe, cut, refill) => engine.dealRound(shoe, state.betCircle, cut, refill, state.settings));
      const dealt = {
        ...next,
        ...emptyRound,
        hands: result.hands.map((h) => ({ ...h, tag: state.nextHandTag })),
        nextHandTag: state.nextHandTag + 1,
        dealer: result.dealer,
        dealerHole: result.dealerHoleCards,
        initialBet: state.betCircle,
        autoDealPending: false,
        phase: GamePhases.DEALING, // DEAL_DONE picks the next phase once the cards have been on the table for a step
      };
      // The chips already left the shown balance; this stakes them on the server and opens the round.
      return countSeen(credit(dealt, { kind: "bet", amount: state.betCircle, newRound: true, alreadyDeducted: true, handTag: null }), refilled);
    }

    case "DEAL_DONE":
      if (state.phase !== GamePhases.DEALING) return state;
      return { ...state, phase: state.hands[0].status === HandStatus.DONE ? GamePhases.DEALER_TURN : GamePhases.PLAYER_TURN };

    case "HIT":
    case "STAND":
    case "DOUBLE":
    case "TRIPLE":
    case "SPLIT":
    case "SURRENDER":
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
        (shoe, cut, refill) => engine.dealerPlay(state.dealer, { cards: [] }, shoe, state.dealerSkipDraw, cut, refill, state.settings.dealerHitsSoft17));
      const stillPlaying = result.dealer.status === HandStatus.PLAYING || result.dealer.status === HandStatus.DRAW_HOLE;
      return countSeen({ ...next, dealer: result.dealer, phase: stillPlaying ? GamePhases.DEALER_TURN : GamePhases.SETTLING_HANDS }, refilled);
    }

    case "REVEAL_HIDDEN":
      // Every hand at once, so the next step is SETTLE (one step per hand would repeat GameProvider's autoKey).
      return countSeen({ ...state, hands: state.hands.map(engine.revealHiddenCards) });

    case "BET_CONFIRMED":
      return state.pendingBets.some((b) => b.seq === action.seq)
        ? { ...state, pendingBets: state.pendingBets.filter((b) => b.seq !== action.seq) }
        : state;

    case "BET_REJECTED": {
      const bet = state.pendingBets.find((b) => b.seq === action.seq);
      if (!bet) return state; // answered already, or the table was reset
      if (bet.newRound) {
        // The server never took the stake, so the round never happened: back to betting, nothing to refund.
        return { ...state, ...emptyRound, phase: GamePhases.PRE_DEAL, betCircle: 0, pendingBets: [],
          notice: "The server refused your bet, so the round was cancelled." };
      }
      // Find the hand by its tag: its index may have moved since the bet was made.
      const hands = state.hands.map((h) => (h.tag === bet.handTag ? { ...h, bet: h.bet - bet.amount } : h));
      return { ...state, hands, betCircle: hands.reduce((sum, h) => sum + h.bet, 0),
        pendingBets: state.pendingBets.filter((b) => b !== bet), notice: `The server refused $${bet.amount} of your stake; that hand plays for less.` };
    }

    case "SETTLE":
      return { ...state, hands: engine.settleHands(state.hands, state.dealer, state.settings), phase: GamePhases.RESULTS };

    case "FINISH_RESULTS": {
      // Always settle, even a total loss, so the server closes the round.
      const payout = cents(state.hands.reduce((sum, h) => sum + h.payout, 0));
      return credit({ ...state, phase: GamePhases.POST_ROUND }, { kind: "settle", amount: payout });
    }

    case "CONTINUE":
      return state.phase === GamePhases.POST_ROUND ? { ...state, phase: GamePhases.END_ROUND } : state;

    case "END_ROUND": {
      const { initialBet } = state;
      const on = autoDealOn(state);
      const rebet = state.settings.resetInitialBet && initialBet > 0 && action.credits >= initialBet;
      const broke = on && initialBet > 0 && !rebet; // auto deal cannot rebet: nothing is dealt and it pauses
      let next = { ...state, ...emptyRound, phase: GamePhases.PRE_DEAL, betCircle: rebet ? initialBet : 0,
        autoDealPending: rebet && on, autoDealPaused: state.autoDealPaused || broke,
        notice: broke ? `Not enough credits to rebet $${initialBet.toLocaleString()}: auto deal paused` : null };
      if (rebet) next = credit(next, local(-initialBet));
      if (state.cutCardFound) next = countSeen({ ...next, shoe: action.shoe, cutCardFound: false }, true);
      return next;
    }

    case "PAUSE_AUTO_DEAL":
      return state.autoDealPaused && !state.autoDealPending ? state : { ...state, autoDealPaused: true, autoDealPending: false };

    case "CANCEL_AUTO_DEAL": // the player left the game page: drop a pending deal but do not pause
      return state.autoDealPending ? { ...state, autoDealPending: false } : state;

    case "RESUME_AUTO_DEAL": {
      const next = { ...state, autoDealPaused: false, notice: null };
      return { ...next, autoDealPending: autoDealOn(next) && state.phase === GamePhases.PRE_DEAL && state.betCircle > 0 };
    }

    default:
      throw new Error(`Unknown game action ${action.type}`);
  }
}

// Which automatic step comes next, if any; GameProvider schedules it after the play timeout. //
export function nextAutoAction(state) {
  switch (state.phase) {
    case GamePhases.DEALING: return "DEAL_DONE";
    case GamePhases.DEALER_TURN: return state.dealerRevealed ? "DEALER_STEP" : "DEALER_REVEAL";
    // Checks the hands, not the setting: the option may be turned off mid-round.
    // Waits until the server has answered every bet: a refused bet changes what the hands are worth.
    case GamePhases.SETTLING_HANDS:
      if (state.pendingBets.length > 0) return null;
      return state.hands.some((h) => h.hiddenCards.length > 0) ? "REVEAL_HIDDEN" : "SETTLE";
    case GamePhases.RESULTS: return "FINISH_RESULTS";
    case GamePhases.POST_ROUND: return autoDealOn(state) ? "CONTINUE" : null;
    case GamePhases.PRE_DEAL: return state.autoDealPending ? "DEAL" : null;
    case GamePhases.END_ROUND: return "END_ROUND";
    default: return null;
  }
}
