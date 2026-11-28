import { buildDeck, createShoe } from "../cards";
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

// Cards of one new createShoe shoe, [rank, suit] in draw order: real ids, for what stackedShoe's always-unique ids cannot show (#197).
export function realCards(...faces) {
  const shoe = createShoe(1, false);
  return faces.map(([rank, suit]) => shoe.find((c) => c.rank === rank && c.suit === suit));
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
// Multi-hand (#59): `bets` is the stake on each spot, left to right (0 = empty; it replaces `bet` and sets handSpots). Then the server
// answers the deal's bets (position 0 = the first betting spot's, 1 = the next spot's, ...) before DEAL_DONE, as the table waits for them.
// `spotActions` is { [spot]: [...] }, each spot's actions in the order its hands ask; it replaces `actions`.
// Every round is also held to the server's cap: a settle is never more than 2.5x the stakes the server accepted.
export function playRound({ cards, mode = Modes.PEEK, bet = 10, bets, actions = [], spotActions, offers = [], blackJackOnSplit = false, rules = {}, refuse = [], credits = RICH }) {
  const ledger = []; // every credit event of the round (state.creditEvents keeps only the last 20)
  let logged = 0;
  const step = (state, action) => {
    const next = gameReducer(state, { refill: outOfCards, credits: RICH, ...action });
    for (const e of next.creditEvents) if (e.seq > logged) { ledger.push(e); logged = e.seq; }
    return next;
  };
  const betEvents = () => ledger.filter((e) => e.kind === "bet");
  const refusedSeqs = new Set();
  const answer = (state, seq) => {
    const refused = refuse.includes(betEvents().findIndex((e) => e.seq === seq));
    if (refused) refusedSeqs.add(seq);
    return step(state, { type: refused ? "BET_REJECTED" : "BET_CONFIRMED", seq });
  };
  let s = step(initialGameState, { type: "START_GAME", shoe: stackedShoe(cards) });
  // Scenarios start from the rules the game had before #91 (S17, 2 decks, no split limit, a dealer blackjack takes all); `rules` changes them.
  s = step(s, { type: "SET_SETTING", values: LEGACY_RULES });
  s = step(s, { type: "SET_SETTING", key: "dealerHoleBehaviour", value: mode });
  s = step(s, { type: "SET_SETTING", key: "blackJackOnSplit", value: blackJackOnSplit });
  // Scenarios start from the bare mode: a blackjack waits for the dealer unless `rules` says otherwise.
  for (const [key, value] of Object.entries({ blackjackPaysImmediately: false, ...rules })) s = step(s, { type: "SET_SETTING", key, value });
  if (bets) {
    s = step(s, { type: "SET_SETTING", key: "handSpots", value: bets.length });
    bets.forEach((amount, spot) => { if (amount > 0) s = step(s, { type: "ADD_BET", amount, spot }); });
  } else {
    s = step(s, { type: "ADD_BET", amount: bet });
  }
  s = step(s, { type: "DEAL", credits });
  const dealt = s; // DEALING, no bet answered yet
  if (s.pendingBets.some((b) => b.side === "spot")) {
    for (const { seq } of dealt.pendingBets) {
      if (s.pendingBets.some((b) => b.seq === seq)) s = answer(s, seq); // a refused opening bet voids the round, and the rest with it
    }
  }
  const answered = s;
  s = step(s, { type: "DEAL_DONE" }); // the cards sit on the table for one step, then play (or the dealer) begins
  const afterDeal = s;
  const offerQueue = [...offers];
  while (s.phase === GamePhases.OFFERS) s = step(s, { type: (offerQueue.shift() ?? "decline_offers").toUpperCase(), handIdx: 0, credits });
  while (s.phase === GamePhases.PEEK) s = step(s, { type: "PEEK" });
  const afterOffers = s;

  const queue = [...actions];
  const perSpot = spotActions && Object.fromEntries(Object.entries(spotActions).map(([spot, list]) => [spot, [...list]]));
  const nextMove = () => (perSpot ? perSpot[s.hands[s.selectedHandIndex].spot]?.shift() : queue.shift()) ?? "stand";
  while (s.phase === GamePhases.PLAYER_TURN) {
    // splitDeal "one": a split-off hand waits for its card (an automatic step), then the player acts on it
    s = nextAutoAction(s) === "DEAL_SPLIT_CARD" ? step(s, { type: "DEAL_SPLIT_CARD" })
      : step(s, { type: nextMove().toUpperCase(), handIdx: s.selectedHandIndex });
  }
  let beforeReveal = null; // the state just before REVEAL_HIDDEN (face-down doubles), if the round reaches it
  while (nextAutoAction(s) || (s.phase === GamePhases.SETTLING_HANDS && s.pendingBets.length)) {
    if (!nextAutoAction(s)) {
      for (const { seq } of s.pendingBets) s = answer(s, seq);
      if (s.phase === GamePhases.PRE_DEAL) break; // a refused opening bet voided the round
      continue;
    }
    if (nextAutoAction(s) === "REVEAL_HIDDEN") beforeReveal = s;
    s = step(s, { type: nextAutoAction(s) });
    if (s.phase === GamePhases.POST_ROUND) break;
  }

  // Bets still unanswered here were never asked about (a round that stopped short): count them as accepted.
  const accepted = betEvents().filter((e) => !refusedSeqs.has(e.seq)).reduce((sum, e) => sum + e.amount, 0);
  const settled = ledger.find((e) => e.kind === "settle")?.amount;
  if (settled > accepted * 2.5 + 1e-9) throw new Error(`Settle ${settled} is over the server's cap: 2.5 x ${accepted} accepted`);

  return {
    dealt,
    answered,
    ledger,
    accepted,
    settled,
    net: (settled ?? 0) - (s.phase === GamePhases.PRE_DEAL ? 0 : accepted), // what the player's server balance moved by
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
