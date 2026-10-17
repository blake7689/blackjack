import { buildDeck } from "../cards";
import { HandStatus } from "../constants/handStatus";
import { HandResult } from "../constants/handResult";
import { DealerHoleOptions } from "../constants/dealerHoleOptions";
import {
  dealRound, playerHit, playerDouble, playerSplit, dealerPlay, settleHands,
  revealDealerHole, dealerNeedsToPlay, dealerOnlyChecksBlackjack,
} from "../gameEngine";

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

const noop = () => {};
const outOfCards = () => { throw new Error("Scenario shoe ran out of cards"); };

export const Modes = {
  PEEK: DealerHoleOptions["Draw Early - Check_US"],
  NO_PEEK: DealerHoleOptions["Draw Early - No Check_US"],
  EU: DealerHoleOptions["Draw After_EU"],
  EU_NO_DRAW_21: DealerHoleOptions["Draw_After - NoDraw21 EU"],
};

// Plays one round with the engine the way GameProvider sequences it: deal, each hand in order
// (actions are consumed in order; a hand with no action left stands), dealer, settle.
// shortcut: mirrors GameProvider's orchestration by hand; Phase 3 moves it into gameReducer and these tests target that.
export function playRound({ cards, mode = Modes.PEEK, bet = 10, actions = [], blackJackOnSplit = false }) {
  const shoe = stackedShoe(cards);
  const dealt = dealRound(shoe, bet, noop, outOfCards, mode);
  const afterDeal = { hands: dealt.hands.map((h) => ({ ...h })), dealer: { ...dealt.dealer } };
  const hands = [...dealt.hands];
  const queue = [...actions];

  for (let i = 0; i < hands.length; i++) {
    while (hands[i].status === HandStatus.PLAYING) {
      const action = queue.shift() ?? "stand";
      if (action === "hit") hands[i] = playerHit(hands[i], shoe, noop, outOfCards).hand;
      else if (action === "double") hands[i] = playerDouble(hands[i], shoe, noop, outOfCards).hand;
      else if (action === "split") hands.splice(i, 1, ...playerSplit(hands[i], shoe, noop, outOfCards, blackJackOnSplit).newHandsArray);
      else hands[i] = { ...hands[i], status: HandStatus.DONE };
    }
  }

  let dealer = { ...revealDealerHole(dealt.dealer, dealt.dealerHoleCards), checkBlackjackOnly: dealerOnlyChecksBlackjack(hands) };
  const skipDraw = !dealerNeedsToPlay(hands);
  while (dealer.status === HandStatus.PLAYING || dealer.status === HandStatus.DRAW_HOLE) {
    dealer = dealerPlay(dealer, { cards: [] }, shoe, skipDraw, noop, outOfCards).dealer;
  }

  const settled = settleHands(hands, dealer);
  return {
    afterDeal,
    hands: settled,
    dealer,
    results: settled.map((h) => h.result),
    payout: settled.reduce((sum, h) => sum + h.payout, 0),
    staked: settled.reduce((sum, h) => sum + h.bet, 0),
    cardsLeft: shoe.length,
  };
}

export { HandResult, HandStatus };
