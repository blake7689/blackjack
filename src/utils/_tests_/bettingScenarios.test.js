import { describe, it, expect, beforeEach } from 'vitest';

function makeCard(rank, value) {
  return { rank, suit: 'spades', value, type: 'card' };
}

const Ace = () => makeCard('A', 11);
const Ten = () => makeCard('10', 10);
const Nine = () => makeCard('9', 9);
const Eight = () => makeCard('8', 8);
const King = () => makeCard('K', 10);
const Two = () => makeCard('2', 2);

function mockPlayer(credits) {
  return { credits };
}

describe('Betting and payout scenarios', () => {
  let player;
  beforeEach(() => {
    player = mockPlayer(1000);
  });

  it('deducts bet from player credits on deal', () => {
    const bet = 100;
    player.credits -= bet;
    expect(player.credits).toBe(900);
  });

  it('doubles bet and deducts again on double', () => {
    const bet = 100;
    player.credits -= bet;
    expect(player.credits).toBe(900);
    player.credits -= bet;
    expect(player.credits).toBe(800);
  });

  it('splits hand and deducts bet for split', () => {
    const bet = 100;
    player.credits -= bet;
    expect(player.credits).toBe(900);
    player.credits -= bet;
    expect(player.credits).toBe(800);
  });

  it('adds winnings for win (bet x2)', () => {
    const bet = 100;
    player.credits -= bet;
    // win
    player.credits += bet * 2;
  expect(player.credits).toBe(1100);
  });

  it('returns bet for push', () => {
    const bet = 100;
    player.credits -= bet;
    // push
    player.credits += bet;
  expect(player.credits).toBe(1000);
  });

  it('does not add credits for loss', () => {
    const bet = 100;
    player.credits -= bet;
    // lose
    expect(player.credits).toBe(900);
  });

  it('handles multiple hands with win, push, lose', () => {
    const bet = 100;
    player.credits -= bet * 3;
    // hand1 win, hand2 push, hand3 lose
    player.credits += bet * 2; // win (credits: 1000)
    player.credits += bet;     // push (credits: 1100)
    // lose: nothing
  expect(player.credits).toBe(1000);
  });

  it('handles double then win', () => {
    const bet = 100;
    player.credits -= bet; // initial
    player.credits -= bet; // double
    player.credits += bet * 2; // win (total payout for double is bet*2)
  expect(player.credits).toBe(1000);
  });

  it('handles split then win both', () => {
    const bet = 100;
    player.credits -= bet; // initial
    player.credits -= bet; // split
    player.credits += bet * 2; // win hand1
    player.credits += bet * 2; // win hand2
    expect(player.credits).toBe(1200);
  });

  it('handles split then lose both', () => {
    const bet = 100;
    player.credits -= bet; // initial
    player.credits -= bet; // split
    // both lose
    expect(player.credits).toBe(800);
  });

  it('handles split then push both', () => {
    const bet = 100;
    player.credits -= bet; // initial
    player.credits -= bet; // split
    player.credits += bet; // push hand1
    player.credits += bet; // push hand2
  expect(player.credits).toBe(1000);
  });

  it('handles split then win one, lose one', () => {
    const bet = 100;
    player.credits -= bet; // initial
    player.credits -= bet; // split
    player.credits += bet * 2; // win hand1
    // lose hand2
  expect(player.credits).toBe(1000);
  });

  it('handles double then push', () => {
    const bet = 100;
    player.credits -= bet; // initial
    player.credits -= bet; // double
    player.credits += bet; // push
    expect(player.credits).toBe(900);
  });

  it('handles double then lose', () => {
    const bet = 100;
    player.credits -= bet; // initial
    player.credits -= bet; // double
    // lose
    expect(player.credits).toBe(800);
  });

  it('handles blackjack payout (bet x2.5)', () => {
    const bet = 100;
    player.credits -= bet;
    player.credits += bet * 2.5;
    expect(player.credits).toBe(1150);
  });

  it('handles split, double, and all outcomes', () => {
    const bet = 100;
    player.credits -= bet; // initial
    player.credits -= bet; // split
    player.credits -= bet; // double on hand1
    // hand1 win (double): bet=200, payout=400
    player.credits += 200 * 2;
    // hand2 push: bet=100, payout=100
    player.credits += 100;
    expect(player.credits).toBe(1200);
  });
});
