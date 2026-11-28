import { GamePhases } from "./constants/gamePhases";
import { HandStatus } from "./constants/handStatus";
import { HandResult } from "./constants/handResult";
import { DealerHoleOptions } from "./constants/dealerHoleOptions";
import { BlackjackPayouts, DoubleOn, NoHoleCardLoss, SurrenderOptions } from "./constants/ruleOptions";
import { canHit, canSplit, canDouble, canSurrender, cents, insuranceStake } from "./blackjackLogic";
import { DEFAULT_CHIP_VALUES, parseChipValues } from "./chips";
import { money } from "./money";
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
    splitDeal: "one", // after a split the second hand's card is dealt when play reaches it ("both" = both hands at once)
    chipValues: DEFAULT_CHIP_VALUES,
    tripleDown: false,
    tripleDrawsOnBust: false, // a second triple card is drawn even if the first busted
    doubleFaceDown: false, // a double's card stays hidden until REVEAL_HIDDEN
    autoDeal: false, // rounds continue and deal by themselves (needs resetInitialBet)
    autoDealDelay: 3000, // ms between the rebet and the automatic deal
    feltTheme: "green", // display settings (#79): they drive <html data-felt / data-accent / data-mode / .no-totals>, see utils/theme.js
    accent: "emerald",
    mode: "dark", // "system" follows the device
    showTotals: true,
    soundOn: false, // table sounds and vibration (#86, utils/sound.js): display settings, not rules
    soundVolume: 50, // 0-100
    hapticsOn: false,
    tableMessages: "hints", // the message line (L2-1, CenterMessage): "all", "hints" (prompts after 5 s idle, results and notices) or "results" (results and notices only)
    currency: "auto", // the symbol on every amount (L2-2, utils/money.js): "auto" follows the device's language; play money, so only the symbol changes
    showKeyHints: false, // the keyboard shortcut hints on the dock keys and the rack (L2-3, 900 px and wider; the keys work either way)
  },
  phase: GamePhases.NONE,
  shoe: [],
  hands: [],
  dealer: { cards: [] },
  dealerHole: { cards: [] },
  dealerRevealed: false,
  dealerSkipDraw: false,
  offers: null, // what the player is still offered before the first move: { insurance, evenMoney, surrender, peek }, or null
  selectedHandIndex: 0,
  betCircle: 0,
  betHistory: [], // what was added to the circle since it was last empty, oldest first; UNDO_BET takes the last (the ledger never sees it)
  initialBet: 0,
  cutCardFound: false,
  seenIds: [],
  runningCount: 0,
  shoeSeq: 0, // +1 whenever a new shoe is made: the board plays its shuffle. shoeMid: it happened in a round (the shoe ran out)
  shoeMid: false,
  creditEvents: [],
  creditSeq: 0,
  pendingBets: [], // bets sent to the server and not yet answered: { seq, handTag, amount, newRound }
  nextHandTag: 1,
  notice: null, // a message about the round, such as a refused bet
  payoutNotice: null, // a refused payout (#196): outlives CONTINUE, the sweep and Resume; only the next DEAL (or sign-out) clears it
  refusedPayout: 0, // its amount, for a line that must say it along with something else (#207); lives and goes with payoutNotice
  payoutNoticeOld: false, // it was already there at SETTLE, so it is an earlier round's: it must not hide this round's verdict
  autoDealPaused: false, // the player stopped auto deal, or a rebet was unaffordable; Resume clears it
  autoDealBroke: false, // `notice` says the rebet of initialBet was unaffordable, so a later refused payout must keep saying it (#207)
  autoDealPending: false, // a rebet is on the table and the automatic DEAL step is armed
};

// Changing these settings deals a new shoe and resets the table. //
export const RESET_SETTINGS = ["deckCount", "includeCutCard", "dealerHoleBehaviour", "blackJackOnSplit",
  "dealerDrawsOnceOn21", "dealerDrawsOnPlayerBlackjack", "dealerDrawsOnPlayerBust", "blackjackPaysImmediately", "maxSplitHands",
  "dealerHitsSoft17", "blackjackPayout", "doubleOn", "doubleAfterSplit", "resplitAces", "hitSplitAces", "noHoleCardLoss", "surrender", "insurance", "splitDeal"];

// Allowed ranges for number settings (the Settings page uses them too). maxSplitHands 0 = unlimited.
export const SETTING_RANGES = { deckCount: [1, 8], playTimeout: [250, 5000], maxSplitHands: [2, 4], autoDealDelay: [0, 10000], soundVolume: [0, 100] };

// Saved settings carry a version (`v`). Version 2 (#91) added the table rules above, version 3 added surrender, version 4
// insurance, version 5 splitDeal; every save before that is `v: 1`. A missing rule key in an older object gets today's behaviour from
// LEGACY_RULES, so an existing table never changes payout (`v: 1` gets all of them; `v: 1` and `v: 2` get surrender "none"; `v: 1` to
// `v: 3` get insurance off; `v: 1` to `v: 4` get splitDeal "both"). `{}`, a missing `v` and the current version get the Vegas
// defaults. The next save writes `v: 5` with every key.
// Whoever adds a rule key later must bump SETTINGS_VERSION, add its RULE_SINCE entry and its LEGACY_RULES value.
export const SETTINGS_VERSION = 5;
export const LEGACY_RULES = {
  deckCount: 2, maxSplitHands: 0, dealerHitsSoft17: false, blackjackPayout: BlackjackPayouts.THREE_TWO, doubleOn: DoubleOn.ANY,
  doubleAfterSplit: true, resplitAces: false, hitSplitAces: false, noHoleCardLoss: NoHoleCardLoss.ALL,
  surrender: SurrenderOptions.NONE, insurance: false, splitDeal: "both",
};
// The saved version that introduced a rule key (a key not listed came with version 2). An older saved object has no such key.
const RULE_SINCE = { surrender: 3, insurance: 4, splitDeal: 5 };

// Settings that hold one of a fixed list of strings.
const ENUM_SETTINGS = {
  dealerHoleBehaviour: Object.values(DealerHoleOptions),
  blackjackPayout: Object.values(BlackjackPayouts),
  doubleOn: Object.values(DoubleOn),
  noHoleCardLoss: Object.values(NoHoleCardLoss),
  surrender: Object.values(SurrenderOptions),
  splitDeal: ["one", "both"],
  feltTheme: ["green", "blue", "red"],
  accent: ["emerald", "sapphire", "ember", "orchid"],
  mode: ["dark", "light", "system"],
  tableMessages: ["all", "hints", "results"],
  currency: ["auto", "USD", "GBP", "EUR"],
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
  offers: null,
  selectedHandIndex: 0,
  notice: null,
  autoDealBroke: false,
};

// One line for a refused payout and an unaffordable rebet, whichever came first (#207).
const refusedAndBroke = (payout, rebet) => `${money(payout)} payout refused, not paid. Can't rebet ${money(rebet)}: auto deal paused.`;

// Queues a balance change; GameProvider hands each event to PlayerProvider exactly once. Kinds:
//   local:  chips moved on the table only ({ amount } is the change to the shown balance)
//   bet:    a stake for the server ledger ({ amount, newRound, alreadyDeducted, handTag, side }); handTag finds the hand
//           again when the answer comes (null for the opening bet). Until the server answers it sits in pendingBets.
//           side: "insurance" tells a refused insurance bet from a refused double or split (the API has no such field).
//   settle: the round's payout for the server ledger ({ amount }, sent even when 0 to close the round)
function credit(state, event) {
  const creditSeq = state.creditSeq + 1;
  const pending = event.kind === "bet" ? [{ seq: creditSeq, handTag: event.handTag, amount: event.amount, newRound: event.newRound, ...(event.side && { side: event.side }) }] : [];
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

// Adds newly visible cards to the running count (reset = a fresh shoe: the board plays its shuffle, a short one when it happened in a round). //
function countSeen(state, reset = false) {
  const seenIds = reset ? [] : state.seenIds;
  const visible = [...state.hands.flatMap((h) => h.cards), ...state.dealer.cards];
  const fresh = visible.filter((c) => !seenIds.includes(c.id));
  return {
    ...state,
    seenIds: [...seenIds, ...fresh.map((c) => c.id)],
    runningCount: (reset ? 0 : state.runningCount) + fresh.reduce((sum, c) => sum + c.count, 0),
    ...(reset && { shoeSeq: state.shoeSeq + 1, shoeMid: state.phase !== GamePhases.PRE_DEAL && state.phase !== GamePhases.NONE }),
  };
}

function resetTable(state, shoe, phase) {
  const refunded = state.phase === GamePhases.PRE_DEAL && state.betCircle > 0 ? credit(state, local(state.betCircle)) : state;
  return countSeen({ ...refunded, ...emptyRound, shoe, phase, betCircle: 0, betHistory: [], cutCardFound: false, pendingBets: [], autoDealPending: false }, true);
}

// The player may act on a hand only on their turn, on the selected hand, while it is still in play. //
function canAct(state, handIdx) {
  return state.phase === GamePhases.PLAYER_TURN && handIdx === state.selectedHandIndex
    && state.hands[handIdx]?.status === HandStatus.PLAYING && !state.hands[handIdx].awaitingCard; // a hand waiting for its split card can't act
}

// A split ace left waiting to be split again that no longer can be (the hand limit) has nothing to do: finish it before advance(),
// or the turn could stay on a finished hand. Every ace-split hand of the round is checked; one still waiting for its card is not (it has one card).
const finishDeadAces = (hands, { maxSplitHands, resplitAces, hitSplitAces }) => hands.map((h) =>
  !h.awaitingCard && !canHit(h, { hitSplitAces }) && h.status === HandStatus.PLAYING && !canSplit(h, hands.length, maxSplitHands, resplitAces)
    ? { ...h, status: HandStatus.DONE } : h);

// After an action: keep playing this hand, move to the next unfinished hand, or hand over to the dealer. //
function advance(state, hands, handIdx) {
  const betCircle = hands.reduce((sum, h) => sum + h.bet, 0);
  if (hands[handIdx].status !== HandStatus.DONE) return { ...state, hands, betCircle };
  const nextIdx = hands.findIndex((h, i) => i > handIdx && h.status !== HandStatus.DONE);
  if (nextIdx !== -1) return { ...state, hands, betCircle, selectedHandIndex: nextIdx };
  return { ...state, hands, betCircle, selectedHandIndex: 0, phase: GamePhases.DEALER_TURN };
}

// Each offer closes by itself; when none is left open the offers are over: the peek (if it was deferred), else the first move. //
// While the peek is pending `offers` is kept so PEEK knows; PEEK clears it.
function closeOffer(state, keys, hands = state.hands) {
  const offers = { ...state.offers, ...Object.fromEntries(keys.map((key) => [key, false])) };
  if (offers.insurance || offers.evenMoney || offers.surrender) return { ...state, hands, offers };
  const phase = offers.peek ? GamePhases.PEEK : hands[0].status === HandStatus.DONE ? GamePhases.DEALER_TURN : GamePhases.PLAYER_TURN;
  return { ...state, hands, offers: offers.peek ? offers : null, phase };
}

// The offers all act on the one hand dealt (hand 0). //
function offerAction(state, action) {
  if (state.phase !== GamePhases.OFFERS) return state;
  const hand = state.hands[0];
  switch (action.type) {
    case "TAKE_INSURANCE": {
      const stake = insuranceStake(hand.bet);
      if (!state.offers.insurance || action.credits < stake) return state;
      const insured = credit(state, { kind: "bet", amount: stake, newRound: false, alreadyDeducted: false, handTag: hand.tag, side: "insurance" });
      return closeOffer(insured, ["insurance"], replaceHand(state.hands, 0, { ...hand, insurance: stake }));
    }
    case "EVEN_MONEY":
      return state.offers.evenMoney ? closeOffer(state, ["evenMoney", "insurance"], replaceHand(state.hands, 0, { ...hand, result: HandResult.WIN, evenMoney: true })) : state;
    case "SURRENDER":
      return state.offers.surrender ? closeOffer(state, ["surrender"], replaceHand(state.hands, 0, engine.playerSurrender(hand, state.dealer.cards[0], state.settings))) : state;
    default: // DECLINE_OFFERS
      return closeOffer(state, ["insurance", "evenMoney", "surrender"]);
  }
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
    if (!canHit(hand, state.settings)) return state;
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
  const { maxSplitHands, resplitAces, hitSplitAces, splitDeal } = state.settings;
  if (!canSplit(hand, state.hands.length, maxSplitHands, resplitAces)) return state;
  const { result, next, refilled } = draw(state, action.refill,
    (shoe, cut, refill) => engine.playerSplit(hand, shoe, cut, refill, { blackJackOnSplit: state.settings.blackJackOnSplit, resplitAces, hitSplitAces, splitDeal }));
  // Both new hands start as copies of the parent; the second one is a new hand and gets its own tag (it takes the new stake).
  const [first, second] = result.newHandsArray;
  const splitOff = { ...second, tag: next.nextHandTag };
  const split = credit({ ...next, nextHandTag: next.nextHandTag + 1 }, { kind: "bet", amount: hand.bet, newRound: false, alreadyDeducted: false, handTag: splitOff.tag });
  const hands = finishDeadAces(replaceHand(state.hands, handIdx, first, splitOff), state.settings);
  return countSeen(advance(split, hands, handIdx), refilled);
}

// The automatic step for a split-off hand that waits for its second card (splitDeal "one"): deal it, then carry on as after any action. //
function dealSplitCard(state, action) {
  const idx = state.selectedHandIndex;
  const hand = state.hands[idx];
  if (state.phase !== GamePhases.PLAYER_TURN || !hand?.awaitingCard) return state;
  const { blackJackOnSplit, resplitAces, hitSplitAces } = state.settings;
  const { result, next, refilled } = draw(state, action.refill,
    (shoe, cut, refill) => engine.dealSplitSecondCard(hand, shoe, cut, refill, { blackJackOnSplit, resplitAces, hitSplitAces }));
  return countSeen(advance(next, finishDeadAces(replaceHand(state.hands, idx, result.hand), state.settings), idx), refilled);
}

export function gameReducer(state, action) {
  switch (action.type) {
    case "START_GAME": // only starts a table: Home's Play also reaches here with a round live, and must not throw it away (#196)
      if (state.phase !== GamePhases.NONE) return state;
      return { ...resetTable(state, action.shoe, GamePhases.PRE_DEAL), autoDealPaused: false };

    case "RESET_GAME":
      return { ...resetTable(state, action.shoe, action.phase), autoDealPaused: false };

    case "SIGN_OUT": // no credit event: the chips on the table leave with the player (#195); both counters are remembered outside this state, so they never restart
      return { ...initialGameState, settings: state.settings, creditSeq: state.creditSeq, shoeSeq: state.shoeSeq };

    case "SET_SETTING": {
      // { key, value } for one setting, or { values } for several at once (a rules preset).
      const values = action.values ?? { [action.key]: action.value };
      const settings = { ...state.settings, ...values };
      // Enabling auto deal starts it running; a pending deal does not outlive turning it off.
      const next = { ...state, settings, ...("autoDeal" in values && { autoDealPaused: false, autoDealBroke: false }) };
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
      return credit({ ...state, betCircle: state.betCircle + action.amount, betHistory: [...state.betHistory, action.amount], autoDealPending: false }, local(-action.amount));

    case "UNDO_BET": {
      if (state.phase !== GamePhases.PRE_DEAL || state.betHistory.length === 0) return state;
      const amount = state.betHistory.at(-1);
      return credit({ ...state, betCircle: state.betCircle - amount, betHistory: state.betHistory.slice(0, -1), autoDealPending: false }, local(amount));
    }

    case "CLEAR_BET":
      if (state.phase !== GamePhases.PRE_DEAL || state.betCircle === 0) return state;
      return credit({ ...state, betCircle: 0, betHistory: [], autoDealPending: false }, local(state.betCircle));

    case "DEAL": {
      if (state.phase !== GamePhases.PRE_DEAL || state.betCircle === 0) return state;
      if (action.auto && !state.autoDealPending) return state; // a timer step that was cancelled
      const { result, next, refilled } = draw(state, action.refill,
        (shoe, cut, refill) => engine.dealRound(shoe, state.betCircle, cut, refill, state.settings, action.credits));
      const dealt = {
        ...next,
        ...emptyRound,
        hands: result.hands.map((h) => ({ ...h, tag: state.nextHandTag })),
        nextHandTag: state.nextHandTag + 1,
        dealer: result.dealer,
        dealerHole: result.dealerHoleCards,
        offers: result.offers,
        initialBet: state.betCircle,
        betHistory: [],
        payoutNotice: null,
        refusedPayout: 0,
        payoutNoticeOld: false,
        autoDealPending: false,
        phase: GamePhases.DEALING, // DEAL_DONE picks the next phase once the cards have been on the table for a step
      };
      // The chips already left the shown balance; this stakes them on the server and opens the round.
      return countSeen(credit(dealt, { kind: "bet", amount: state.betCircle, newRound: true, alreadyDeducted: true, handTag: null }), refilled);
    }

    case "DEAL_DONE":
      if (state.phase !== GamePhases.DEALING) return state;
      if (state.offers) return { ...state, phase: GamePhases.OFFERS };
      return { ...state, phase: state.hands[0].status === HandStatus.DONE ? GamePhases.DEALER_TURN : GamePhases.PLAYER_TURN };

    case "TAKE_INSURANCE":
    case "EVEN_MONEY":
    case "DECLINE_OFFERS":
      return offerAction(state, action);

    case "PEEK": {
      if (state.phase !== GamePhases.PEEK) return state;
      const { hands, dealer, hole } = engine.peekDealer(state.hands, state.dealer, state.dealerHole);
      // The same turn order as DEAL_DONE: the dealer's turn if every hand is finished, else the player's.
      const phase = hands[0].status === HandStatus.DONE ? GamePhases.DEALER_TURN : GamePhases.PLAYER_TURN;
      return countSeen({ ...state, hands, dealer, dealerHole: hole, offers: null, phase });
    }

    case "HIT":
    case "STAND":
    case "DOUBLE":
    case "TRIPLE":
    case "SPLIT":
      return playerAction(state, action);

    case "DEAL_SPLIT_CARD":
      return dealSplitCard(state, action);

    case "SURRENDER":
      return state.phase === GamePhases.OFFERS ? offerAction(state, action) : playerAction(state, action);

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
      // A settle is never in pendingBets, so GameProvider sends its amount (`payout`). A refused 0 costs nothing: no notice.
      if (action.payout > 0) return { ...state, payoutNotice: `The server refused your ${money(action.payout)} payout; it was not paid.`, refusedPayout: action.payout, payoutNoticeOld: false,
        notice: state.autoDealBroke ? refusedAndBroke(action.payout, state.initialBet) : null }; // the newest message wins the line, but never loses why auto deal paused
      const bet = state.pendingBets.find((b) => b.seq === action.seq);
      if (!bet) return state; // answered already, or the table was reset
      if (bet.newRound) {
        // The server never took the stake, so the round never happened: back to betting, nothing to refund. Its cards were seen face up, so they stay
        // out of the shoe and go to the discard pile, like a misdeal (L1-27: by design; putting them back would deal them again).
        return { ...state, ...emptyRound, phase: GamePhases.PRE_DEAL, betCircle: 0, betHistory: [], pendingBets: [],
          notice: state.payoutNotice ? `${money(state.refusedPayout)} payout refused, not paid. New bet refused: round cancelled.`
            : "The server refused your bet, so the round was cancelled." };
      }
      // Find the hand by its tag: its index may have moved since the bet was made.
      if (bet.side === "insurance") {
        // Only the insurance is void: the hand's own stake is untouched.
        const hands = state.hands.map((h) => (h.tag === bet.handTag ? { ...h, insurance: 0 } : h));
        return { ...state, hands, pendingBets: state.pendingBets.filter((b) => b !== bet), notice: `The server refused your ${money(bet.amount)} insurance bet; the hand is not insured.` };
      }
      const hands = state.hands.map((h) => (h.tag === bet.handTag ? { ...h, bet: h.bet - bet.amount } : h));
      return { ...state, hands, betCircle: hands.reduce((sum, h) => sum + h.bet, 0),
        pendingBets: state.pendingBets.filter((b) => b !== bet), notice: `The server refused ${money(bet.amount)} of your stake; that hand plays for less.` };
    }

    case "SETTLE": // the ledger queue is serial and this waited for the round's own bets, so a payoutNotice here is an earlier round's
      return { ...state, hands: engine.settleHands(state.hands, state.dealer, state.settings), phase: GamePhases.RESULTS, payoutNoticeOld: state.payoutNotice !== null };

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
      let next = { ...state, ...emptyRound, phase: GamePhases.PRE_DEAL, betCircle: rebet ? initialBet : 0, betHistory: rebet ? [initialBet] : [],
        autoDealPending: rebet && on, autoDealPaused: state.autoDealPaused || broke, autoDealBroke: broke,
        notice: !broke ? null : state.payoutNotice ? refusedAndBroke(state.refusedPayout, initialBet) : `Not enough credits to rebet ${money(initialBet)}: auto deal paused` };
      if (rebet) next = credit(next, local(-initialBet));
      if (state.cutCardFound) next = countSeen({ ...next, shoe: action.shoe, cutCardFound: false }, true);
      return next;
    }

    case "PAUSE_AUTO_DEAL":
      return state.autoDealPaused && !state.autoDealPending ? state : { ...state, autoDealPaused: true, autoDealPending: false };

    case "CANCEL_AUTO_DEAL": // the player left the game page: drop a pending deal but do not pause
      return state.autoDealPending ? { ...state, autoDealPending: false } : state;

    case "RESUME_AUTO_DEAL": {
      const next = { ...state, autoDealPaused: false, autoDealBroke: false, notice: null };
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
    case GamePhases.OFFERS: return null; // the player decides; no timer, and auto deal never declines for them
    case GamePhases.PEEK: return "PEEK";
    case GamePhases.PLAYER_TURN: return state.hands[state.selectedHandIndex]?.awaitingCard ? "DEAL_SPLIT_CARD" : null; // else the player acts
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
