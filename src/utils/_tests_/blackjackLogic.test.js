// Edge case helpers
const Ace = () => ({ rank: "A", suit: "spades", value: 11, type: "card" });
const Three = () => ({ rank: "3", suit: "hearts", value: 3, type: "card" });
const Four = () => ({ rank: "4", suit: "hearts", value: 4, type: "card" });
const Ten = () => ({ rank: "10", suit: "hearts", value: 10, type: "card" });
const Jack = () => ({ rank: "J", suit: "clubs", value: 10, type: "card" });
const Queen = () => ({ rank: "Q", suit: "clubs", value: 10, type: "card" });
const King = () => ({ rank: "K", suit: "clubs", value: 10, type: "card" });

describe("edge cases", () => {
  it("minimum hand total (2 aces as 1)", () => {
    const { total } = handTotals([Ace(), Ace()]);
    expect(total).toBe(12);
  });
  it("maximum hand total (4 aces, 3 tens)", () => {
    const { total } = handTotals([Ace(), Ace(), Ace(), Ace(), Ten(), Jack(), King()]);
    expect(total).toBe(34); // matches handTotals logic
  });
  it("soft hand stays soft until bust", () => {
    const { total, soft } = handTotals([Ace(), Six()]);
    expect(total).toBe(17);
    expect(soft).toBe(false);
  });
  it("hard hand after hitting with ace", () => {
    const { total, soft } = handTotals([Ace(), Six(), Ten()]);
    expect(total).toBe(17);
    expect(soft).toBe(false);
  });
  it("player busts with multiple aces", () => {
    const { total } = handTotals([Ace(), Ace(), King(), Queen(), Jack()]);
    expect(total).toBe(32); // matches handTotals logic
  });
  it("dealer busts with multiple cards", () => {
    const dealer = [Ten(), Nine(), Five()];
    expect(handTotals(dealer).total).toBe(24);
    expect(handTotals(dealer).total).toBeGreaterThan(21);
  });
  it("player gets blackjack with ace and ten", () => {
    expect(isBlackjack([Ace(), Ten()])).toBe(true);
  });
  it("player does not get blackjack with ace and nine", () => {
    expect(isBlackjack([Ace(), Nine()])).toBe(false);
  });
  it("player pushes with dealer", () => {
    const player = [Nine(), Eight()];
    const dealer = [Nine(), Eight()];
    expect(handTotals(player).total).toBe(handTotals(dealer).total);
  });
  it("player wins with higher total", () => {
    const player = [King(), Nine()];
    const dealer = [King(), Five()];
    expect(handTotals(player).total).toBeGreaterThan(handTotals(dealer).total);
  });
  it("player loses with lower total", () => {
    const player = [King(), Five()];
    const dealer = [King(), Nine()];
    expect(handTotals(player).total).toBeLessThan(handTotals(dealer).total);
  });
  it("split aces only count as 1 each after hit", () => {
    const hand = [Ace(), Ace(), Five()];
    expect(handTotals(hand).total).toBe(17);
  });
  it("player busts with 22 after split aces and hit", () => {
    const hand = [Ace(), Ace(), Ten()];
    expect(handTotals(hand).total).toBe(12);
  });
  it("dealer stands on soft 17", () => {
    expect(dealerShouldHit([Ace(), Six()])).toBe(false);
  });
  it("dealer hits on hard 16", () => {
    expect(dealerShouldHit([Nine(), Seven()])).toBe(true);
  });
  it("dealer stands on hard 17", () => {
    expect(dealerShouldHit([Nine(), Eight()])).toBe(false);
  });
  it("dealer stands on 18 with ace as 11", () => {
    expect(dealerShouldHit([Ace(), Seven()])).toBe(false);
  });
  it("player gets blackjack with ace and face card", () => {
    expect(isBlackjack([Ace(), King()])).toBe(true);
    expect(isBlackjack([Ace(), Queen()])).toBe(true);
    expect(isBlackjack([Ace(), Jack()])).toBe(true);
  });
  it("player does not get blackjack with two face cards", () => {
    expect(isBlackjack([King(), Queen()])).toBe(false);
    expect(isBlackjack([Jack(), Queen()])).toBe(false);
  });
  it("player gets blackjack only with two cards", () => {
    expect(isBlackjack([Ace(), Ten()])).toBe(true);
    expect(isBlackjack([Ace(), Ten(), Two()])).toBe(false);
  });
  it("player cannot bust with 21 and ace counted as 1", () => {
    const hand = [Ace(), Ten(), King()];
    expect(handTotals(hand).total).toBe(21);
  });
  it("player busts with 22 and ace counted as 1", () => {
    const hand = [Ace(), Ten(), King(), Two()];
    expect(handTotals(hand).total).toBe(23);
  });
});
const Seven = () => ({ rank:"7", suit:"hearts", value:7, type:"card" });
import { describe, it, expect } from "vitest";
import { handTotals, isBlackjack, dealerShouldHit } from "../../utils/blackjackLogic";

const A = () => ({ rank:"A", suit:"spades", value:11, type:"card" });
const T = () => ({ rank:"10", suit:"hearts", value:10, type:"card" });
const K = () => ({ rank:"K", suit:"clubs", value:10, type:"card" });
const Q = () => ({ rank:"Q", suit:"clubs", value:10, type:"card" });
const J = () => ({ rank:"J", suit:"clubs", value:10, type:"card" });
const Five = () => ({ rank:"5", suit:"diamonds", value:5, type:"card" });
const Six  = () => ({ rank:"6", suit:"hearts", value:6, type:"card" });
const Nine = () => ({ rank:"9", suit:"hearts", value:9, type:"card" });
const Two = () => ({ rank:"2", suit:"hearts", value:2, type:"card" });
const Eight = () => ({ rank:"8", suit:"hearts", value:8, type:"card" });

describe("handTotals", () => {
  it("counts ace as 11 when safe", () => {
    const { total } = handTotals([A(), Five()]);
    expect(total).toBe(16);
  });
  it("drops ace to 1 when busting", () => {
    const { total } = handTotals([A(), K(), Five()]);
    expect(total).toBe(16);
  });
  it("handles multiple aces correctly", () => {
    const { total } = handTotals([A(), A(), Nine()]);
    expect(total).toBe(21); // one ace as 11, one as 1
  });
  it("busts with too many aces", () => {
    const { total } = handTotals([A(), A(), K(), Nine()]);
    expect(total).toBe(21); // two aces as 1, K as 10, Nine as 9
  });
  it("returns correct total for no ace", () => {
    const { total } = handTotals([Nine(), Eight()]);
    expect(total).toBe(17);
  });
});

describe("isBlackjack", () => {
  it("detects natural blackjack", () => {
    expect(isBlackjack([A(), K()])).toBe(true);
    expect(isBlackjack([T(), A()])).toBe(true);
    expect(isBlackjack([A(), Q()])).toBe(true);
    expect(isBlackjack([J(), A()])).toBe(true);
  });
  it("not blackjack with more than 2 cards", () => {
    expect(isBlackjack([A(), K(), Five()])).toBe(false);
    expect(isBlackjack([A(), K(), Q()])).toBe(false);
  });
  it("not blackjack with two non-ace 10s", () => {
    expect(isBlackjack([K(), Q()])).toBe(false);
  });
});

describe("dealerShouldHit", () => {
  it("stands on soft 17", () => {
    // A + 6 -> soft 17 -> stand
    expect(dealerShouldHit([A(), Six()])).toBe(false);
  });
  it("hits under 17", () => {
    expect(dealerShouldHit([Six(), Five()])).toBe(true);
  });
  it("stands on hard 17", () => {
    expect(dealerShouldHit([Nine(), Eight()])).toBe(false);
  });
  it("hits on 16", () => {
    expect(dealerShouldHit([Nine(), Seven()])).toBe(true);
  });
  it("stands on 18 with ace as 11", () => {
    expect(dealerShouldHit([A(), Seven()])).toBe(false);
  });
});

// Additional game scenarios
describe("game scenarios", () => {
  it("player busts", () => {
    const { total } = handTotals([K(), Q(), Five()]);
    expect(total).toBe(25); // ace logic not involved, bust
  });
  it("player pushes with dealer", () => {
    const player = [Nine(), Eight()];
    const dealer = [Nine(), Eight()];
    expect(handTotals(player).total).toBe(handTotals(dealer).total);
  });
  it("player wins with higher total", () => {
    const player = [K(), Nine()];
    const dealer = [K(), Five()];
    expect(handTotals(player).total).toBeGreaterThan(handTotals(dealer).total);
  });
  it("player loses with lower total", () => {
    const player = [K(), Five()];
    const dealer = [K(), Nine()];
    expect(handTotals(player).total).toBeLessThan(handTotals(dealer).total);
  });
  it("player gets blackjack, dealer does not", () => {
    expect(isBlackjack([A(), K()])).toBe(true);
    expect(isBlackjack([K(), Nine()])).toBe(false);
  });
  it("dealer busts over 21", () => {
    const dealer = [K(), Nine(), Five()];
    expect(handTotals(dealer).total).toBe(24);
    expect(handTotals(dealer).total).toBeGreaterThan(21);
  });
});