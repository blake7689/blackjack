import { describe, it, expect } from "vitest";
import { dealRound, revealDealerHole, revealHiddenCards, playerSplit, playerDouble } from "../gameEngine";
import { initialGameState } from "../gameReducer";
import { stackedShoe, outOfCards, Modes } from "./stackedShoe";

// Animation hints are plain data on copies of the cards: the shoe's own cards are never touched.
const settings = (mode) => ({ ...initialGameState.settings, dealerHoleBehaviour: mode });
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
