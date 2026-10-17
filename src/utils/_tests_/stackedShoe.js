import { buildDeck } from "../cards";
import { HandStatus } from "../constants/handStatus";
import { HandResult } from "../constants/handResult";
import { GamePhases } from "../constants/gamePhases";
import { DealerHoleOptions } from "../constants/dealerHoleOptions";
import { gameReducer, initialGameState, nextAutoAction } from "../gameReducer";

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
  PEEK: DealerHoleOptions["Draw Early - Check_US"],
  NO_PEEK: DealerHoleOptions["Draw Early - No Check_US"],
  EU: DealerHoleOptions["Draw After_EU"],
  EU_NO_DRAW_21: DealerHoleOptions["Draw_After - NoDraw21 EU"],
};

// Plays one round through gameReducer, as GameProvider does: start, bet, deal, the player's actions in order
// (a hand with no action left stands), then the automatic dealer and settlement steps up to POST_ROUND.
export function playRound({ cards, mode = Modes.PEEK, bet = 10, actions = [], blackJackOnSplit = false }) {
  const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: RICH, ...action });
  let s = step(initialGameState, { type: "START_GAME", shoe: stackedShoe(cards) });
  s = step(s, { type: "SET_SETTING", key: "dealerHoleBehaviour", value: mode });
  s = step(s, { type: "SET_SETTING", key: "blackJackOnSplit", value: blackJackOnSplit });
  s = step(s, { type: "ADD_BET", amount: bet });
  s = step(s, { type: "DEAL" });
  const afterDeal = s;

  const queue = [...actions];
  while (s.phase === GamePhases.PLAYER_TURN) {
    s = step(s, { type: (queue.shift() ?? "stand").toUpperCase(), handIdx: s.selectedHandIndex });
  }
  while (nextAutoAction(s)) {
    s = step(s, { type: nextAutoAction(s) });
    if (s.phase === GamePhases.POST_ROUND) break;
  }

  return {
    afterDeal,
    state: s,
    hands: s.hands,
    dealer: s.dealer,
    results: s.hands.map((h) => h.result),
    payout: s.hands.reduce((sum, h) => sum + h.payout, 0),
    staked: s.hands.reduce((sum, h) => sum + h.bet, 0),
    cardsLeft: s.shoe.length,
  };
}

export { HandResult, HandStatus };
