import { describe, it, expect } from "vitest";
import { dealRound, revealDealerHole, revealHiddenCards, playerSplit, playerDouble, playerSurrender, dealerNeedsToPlay, dealerOnlyChecksBlackjack, dealerShowsSecondCard } from "../gameEngine";
import { HandResult } from "../constants/handResult";
import { HandStatus } from "../constants/handStatus";
import { initialGameState } from "../gameReducer";
import { stackedShoe, outOfCards, Modes } from "./stackedShoe";

// Animation hints are plain data on copies of the cards: the shoe's own cards are never touched.
// insurance off: these tests are about the cards, and an ace up would offer insurance and defer the peek
const settings = (mode) => ({ ...initialGameState.settings, dealerHoleBehaviour: mode, insurance: false });
const deal = (codes, mode = Modes.PEEK) => {
  const shoe = stackedShoe(codes);
  const originals = [...shoe];
  return { ...dealRound(shoe, 10, () => {}, outOfCards, settings(mode)), originals };
};
describe("card hints", () => {
  it("dealRound numbers the face-up opening cards in dealing order and leaves the shoe's cards alone", () => {
    const { hands, dealer, dealerHoleCards, originals } = deal(["10", "9", "8", "7"]);
    expect(hands[0].cards.map((c) => c.dealOrder)).toEqual([0, 2]);
    expect(dealer.cards.map((c) => c.dealOrder)).toEqual([1]);
    expect(dealerHoleCards.cards[0].dealOrder).toBeUndefined();
    expect(dealerHoleCards.cards[0].revealed).toBeUndefined();
    expect(originals.every((c) => c.dealOrder === undefined && c.revealed === undefined)).toBe(true);
    expect(hands[0].cards[0]).not.toBe(originals[0]);
    expect(hands[0].cards[0].id).toBe(originals[0].id);
  });

  it("a peek that finds a dealer blackjack shows the hole card at the deal: dealt 4th and revealed", () => {
    const { dealer, dealerHoleCards } = deal(["10", "A", "9", "K"]);
    expect(dealer.cards.map((c) => [c.dealOrder, c.revealed])).toEqual([[1, undefined], [3, true]]);
    expect(dealerHoleCards.cards).toEqual([]);
  });

  it("with no peek a dealer blackjack stays hidden and carries no hint", () => {
    const { dealer, dealerHoleCards } = deal(["10", "A", "9", "K"], Modes.NO_PEEK);
    expect(dealer.cards.map((c) => c.dealOrder)).toEqual([1]);
    expect(dealerHoleCards.cards[0].revealed).toBeUndefined();
    expect(dealerHoleCards.cards[0].dealOrder).toBeUndefined();
  });

  it("EU deals only three cards, numbered the same way", () => {
    const { hands, dealer, dealerHoleCards } = deal(["10", "9", "8"], Modes.EU);
    expect([hands[0].cards.map((c) => c.dealOrder), dealer.cards.map((c) => c.dealOrder), dealerHoleCards.cards]).toEqual([[0, 2], [1], []]);
  });

  it("revealDealerHole marks a copy of the hole card revealed and nothing else", () => {
    const { dealer, dealerHoleCards } = deal(["10", "9", "8", "7"]);
    const revealed = revealDealerHole(dealer, dealerHoleCards);
    expect(revealed.cards.map((c) => c.revealed)).toEqual([undefined, true]);
    expect(revealed.cards[1].id).toBe(dealerHoleCards.cards[0].id);
    expect(dealerHoleCards.cards[0].revealed).toBeUndefined();
    expect(revealDealerHole(dealer, { cards: [] }).cards).toEqual(dealer.cards); // EU: no hole card yet
  });

  it("revealHiddenCards marks the face-down double's card revealed, on a copy", () => {
    const { hands } = deal(["5", "10", "6", "7", "10"]);
    const { hand } = playerDouble(hands[0], stackedShoe(["10"]), () => {}, outOfCards, true);
    const revealed = revealHiddenCards(hand);
    expect(revealed.cards.map((c) => c.revealed)).toEqual([undefined, undefined, true]);
    expect(hand.hiddenCards[0].revealed).toBeUndefined();
  });

  it("playerSplit marks only the card that moves to the new hand", () => {
    const { hands } = deal(["8", "10", "8", "7"]);
    const { newHandsArray } = playerSplit(hands[0], stackedShoe(["3", "4"]), () => {}, outOfCards, {});
    expect(newHandsArray.map((h) => h.cards.map((c) => c.moved))).toEqual([[undefined, undefined], [true, undefined]]);
    expect(hands[0].cards[1].moved).toBeUndefined();
  });
});

describe("playerSurrender", () => {
  const hand = { tag: 1, bet: 10, baseStake: 10, status: HandStatus.PLAYING, result: HandResult.NONE, cards: [], hiddenCards: [] };
  const up = (code) => stackedShoe([code])[0];
  const surrender = (value, mode, upCode) => playerSurrender(hand, up(upCode), { surrender: value, dealerHoleBehaviour: mode });

  it("always ends the hand and flags it, on a copy that keeps everything else", () => {
    const s = surrender("late", Modes.PEEK, "6");
    expect(s).toMatchObject({ tag: 1, bet: 10, baseStake: 10, status: HandStatus.DONE, surrendered: true });
    expect(s).not.toBe(hand);
    expect(hand).not.toHaveProperty("surrendered");
  });

  it("late with no hole card against an ace or a ten waits; the dealer's blackjack decides at settlement", () => {
    for (const mode of [Modes.NO_PEEK, Modes.EU]) {
      for (const code of ["A", "10", "K"]) expect(surrender("late", mode, code).result).toBe(HandResult.NONE);
    }
  });

  it("late against 2-9 is fixed at once, in every mode (no blackjack is possible)", () => {
    for (const mode of [Modes.PEEK, Modes.NO_PEEK, Modes.EU]) {
      for (const code of ["2", "6", "9"]) expect(surrender("late", mode, code).result).toBe(HandResult.SURRENDER);
    }
  });

  it("late with a peek is fixed at once even against an ace or ten: the peek already ruled the blackjack out", () => {
    for (const code of ["A", "10"]) expect(surrender("late", Modes.PEEK, code).result).toBe(HandResult.SURRENDER);
  });

  it("early and earlyNoAce are always fixed at once, whatever the mode or up card", () => {
    for (const value of ["early", "earlyNoAce"]) {
      for (const mode of [Modes.PEEK, Modes.NO_PEEK, Modes.EU]) {
        for (const code of ["6", "10", "A"]) expect(surrender(value, mode, code).result).toBe(HandResult.SURRENDER);
      }
    }
  });
});

describe("dealer helpers with a surrendered hand", () => {
  const live = { isBusted: false, isBlackjack: false, total: 16, result: HandResult.NONE };
  const waiting = { ...live, surrendered: true, status: HandStatus.DONE };
  const atOnce = { ...waiting, result: HandResult.SURRENDER };
  const rules = (extra = {}) => ({ dealerHoleBehaviour: Modes.EU, dealerDrawsOnceOn21: false, dealerDrawsOnPlayerBust: false, dealerDrawsOnPlayerBlackjack: false, ...extra });

  it("dealerNeedsToPlay: neither a waiting nor an at-once surrender needs the dealer's total", () => {
    expect(dealerNeedsToPlay([live])).toBe(true);
    expect(dealerNeedsToPlay([waiting])).toBe(false);
    expect(dealerNeedsToPlay([atOnce])).toBe(false);
  });

  it("dealerOnlyChecksBlackjack: a waiting surrender needs only the blackjack check; an at-once one is not waiting at all", () => {
    expect(dealerOnlyChecksBlackjack([live], rules())).toBe(false);
    expect(dealerOnlyChecksBlackjack([waiting], rules())).toBe(true);
    expect(dealerOnlyChecksBlackjack([atOnce], rules())).toBe(true); // nothing waits: the empty list
  });

  it("dealerShowsSecondCard: true after a surrender, only through the surrendered clause", () => {
    expect(dealerShowsSecondCard([live], rules())).toBe(false);
    expect(dealerShowsSecondCard([waiting], rules())).toBe(true);
    expect(dealerShowsSecondCard([atOnce], rules())).toBe(true);
    // with both rules on, a live hand that is neither busted nor a blackjack still gives false
    expect(dealerShowsSecondCard([live], rules({ dealerDrawsOnPlayerBust: true, dealerDrawsOnPlayerBlackjack: true }))).toBe(false);
  });
});
