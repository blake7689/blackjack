import { buildDeck } from "../cards";
import { HandStatus } from "../constants/handStatus";
import { HandResult } from "../constants/handResult";
import { GamePhases } from "../constants/gamePhases";
import { DealerHoleOptions } from "../constants/dealerHoleOptions";
import { gameReducer, initialGameState, nextAutoAction, LEGACY_RULES } from "../gameReducer";

const RANK_CODES = { A: "ace", K: "king", Q: "queen", J: "jack" };
const DECK = buildDeck(0);
let nextId = 0;

// Builds a shoe whose cards come out in the given order, e.g. stackedShoe(["A", "K", "9", "7"]).
export function stackedShoe(codes) {
  return codes.map((code) => {
    const rank = RANK_CODES[code] ?? code;
    const template = DECK.find((c) => c.rank === rank);
    if (!template) throw new Error(`Unknown card code ${code}`);
    return { ...template, id: `stacked-${rank}-${nextId++}` };
  });
}

export const outOfCards = () => { throw new Error("Scenario shoe ran out of cards"); };
const RICH = 1e9;

export const Modes = {
  PEEK: DealerHoleOptions.US_PEEK,
  NO_PEEK: DealerHoleOptions.US_NO_PEEK,
  EU: DealerHoleOptions.EU,
};

// The server confirms every bet that is still waiting for an answer.
export const confirmBets = (state) =>
  state.pendingBets.reduce((s, { seq }) => gameReducer(s, { type: "BET_CONFIRMED", seq }), state);

// Plays one round through gameReducer, as GameProvider does: start, bet, deal, deal done, the player's actions in order
// (a hand with no action left stands), then the automatic dealer and settlement steps up to POST_ROUND.
// `beforeReveal` is the state just before a face-down double's card is turned over (null if none).
// `rules` sets any other game settings on top of LEGACY_RULES, e.g. { dealerDrawsOnPlayerBust: true }.
// `offers` answers the offers step in order (reducer action types in lower case: "take_insurance", "even_money", "surrender");
// what is left unanswered is declined. `afterDeal` may be the OFFERS state; `afterOffers` is the state once the offers and the peek are over.
// `credits` is the balance the deal and the offers see (insurance must be affordable); the bets themselves always go through.
// The server answers every bet once the round reaches settling: it confirms them all, except the ledger bets whose
// position in `refuse` (0 = the opening bet, 1 = the next bet, ...) is listed, which it refuses.
export function playRound({ cards, mode = Modes.PEEK, bet = 10, actions = [], offers = [], blackJackOnSplit = false, rules = {}, refuse = [], credits = RICH }) {
  const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: RICH, ...action });
  let s = step(initialGameState, { type: "START_GAME", shoe: stackedShoe(cards) });
  // Scenarios start from the rules the game had before #91 (S17, 2 decks, no split limit, a dealer blackjack takes all); `rules` changes them.
  s = step(s, { type: "SET_SETTING", values: LEGACY_RULES });
  s = step(s, { type: "SET_SETTING", key: "dealerHoleBehaviour", value: mode });
  s = step(s, { type: "SET_SETTING", key: "blackJackOnSplit", value: blackJackOnSplit });
  // Scenarios start from the bare mode: a blackjack waits for the dealer unless `rules` says otherwise.
  for (const [key, value] of Object.entries({ blackjackPaysImmediately: false, ...rules })) s = step(s, { type: "SET_SETTING", key, value });
  s = step(s, { type: "ADD_BET", amount: bet });
  s = step(s, { type: "DEAL", credits });
  s = step(s, { type: "DEAL_DONE" }); // the cards sit on the table for one step, then play (or the dealer) begins
  const afterDeal = s;
  const offerQueue = [...offers];
  while (s.phase === GamePhases.OFFERS) s = step(s, { type: (offerQueue.shift() ?? "decline_offers").toUpperCase(), handIdx: 0, credits });
  while (s.phase === GamePhases.PEEK) s = step(s, { type: "PEEK" });
  const afterOffers = s;

  const queue = [...actions];
  while (s.phase === GamePhases.PLAYER_TURN) {
    s = step(s, { type: (queue.shift() ?? "stand").toUpperCase(), handIdx: s.selectedHandIndex });
  }
  let beforeReveal = null; // the state just before REVEAL_HIDDEN (face-down doubles), if the round reaches it
  const betSeqs = s.creditEvents.filter((e) => e.kind === "bet").map((e) => e.seq);
  while (nextAutoAction(s) || (s.phase === GamePhases.SETTLING_HANDS && s.pendingBets.length)) {
    if (!nextAutoAction(s)) {
      for (const { seq } of s.pendingBets) s = step(s, { type: refuse.includes(betSeqs.indexOf(seq)) ? "BET_REJECTED" : "BET_CONFIRMED", seq });
      if (s.phase === GamePhases.PRE_DEAL) break; // a refused opening bet voided the round
      continue;
    }
    if (nextAutoAction(s) === "REVEAL_HIDDEN") beforeReveal = s;
    s = step(s, { type: nextAutoAction(s) });
    if (s.phase === GamePhases.POST_ROUND) break;
  }

  return {
    afterDeal,
    afterOffers,
    beforeReveal,
    state: s,
    hands: s.hands,
    dealer: s.dealer,
    results: s.hands.map((h) => h.result),
    payout: s.hands.reduce((sum, h) => sum + h.payout, 0),
    staked: s.hands.reduce((sum, h) => sum + h.bet, 0),
    insuranceStaked: s.hands.reduce((sum, h) => sum + (h.insurance ?? 0), 0),
    cardsLeft: s.shoe.length,
  };
}

export { HandResult, HandStatus };
