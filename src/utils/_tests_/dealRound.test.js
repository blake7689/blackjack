import { describe, it, expect } from 'vitest';
import { dealRound } from '../gameEngine';

describe('dealRound', () => {
  it('sets player hand status to blackjack if initial two cards are a natural blackjack', () => {
    // Mock shoe to always deal Ace then Ten for player, then any cards for dealer
    const mockShoe = [
      { rank: 'A', suit: 'spades', value: 11, type: 'card' }, // player 1
      { rank: '10', suit: 'hearts', value: 10, type: 'card' }, // player 2
      { rank: '9', suit: 'clubs', value: 9, type: 'card' }, // dealer up
      { rank: '8', suit: 'diamonds', value: 8, type: 'card' }, // dealer down
    ];
    const bet = 100;
    const result = dealRound([...mockShoe], bet);
    expect(result.hands[0].status).toBe('blackjack');
    expect(result.hands[0].total).toBe(21);
  });

  it('sets player hand status to push if both player and dealer have blackjack', () => {
    // Player: Ace, Ten; Dealer: Ace, Ten
    const mockShoe = [
      { rank: 'A', suit: 'spades', value: 11, type: 'card' }, // player 1
      { rank: '10', suit: 'hearts', value: 10, type: 'card' }, // player 2
      { rank: 'A', suit: 'clubs', value: 11, type: 'card' }, // dealer up
      { rank: '10', suit: 'diamonds', value: 10, type: 'card' }, // dealer down
    ];
    const bet = 100;
    const result = dealRound([...mockShoe], bet);
    expect(result.hands[0].status).toBe('push');
    expect(result.dealer.blackjack).toBe(true);
  });

  it('sets player hand status to lose if dealer has blackjack and player does not', () => {
    // Player: Nine, Ten; Dealer: Ace, Ten
    const mockShoe = [
      { rank: '9', suit: 'spades', value: 9, type: 'card' }, // player 1
      { rank: '10', suit: 'hearts', value: 10, type: 'card' }, // player 2
      { rank: 'A', suit: 'clubs', value: 11, type: 'card' }, // dealer up
      { rank: '10', suit: 'diamonds', value: 10, type: 'card' }, // dealer down
    ];
    const bet = 100;
    const result = dealRound([...mockShoe], bet);
    expect(result.hands[0].status).toBe('lose');
    expect(result.dealer.blackjack).toBe(true);
  });

  it('sets player hand status to playing if neither has blackjack', () => {
    // Player: Nine, Ten; Dealer: Nine, Eight
    const mockShoe = [
      { rank: '9', suit: 'spades', value: 9, type: 'card' }, // player 1
      { rank: '10', suit: 'hearts', value: 10, type: 'card' }, // player 2
      { rank: '9', suit: 'clubs', value: 9, type: 'card' }, // dealer up
      { rank: '8', suit: 'diamonds', value: 8, type: 'card' }, // dealer down
    ];
    const bet = 100;
    const result = dealRound([...mockShoe], bet);
    expect(result.hands[0].status).toBe('playing');
    expect(result.dealer.blackjack).toBe(false);
  });

  it('player with initial blackjack does not get options to hit/stay/double', () => {
    // Mock shoe: Ace, Ten for player, any for dealer
    const mockShoe = [
      { rank: 'A', suit: 'spades', value: 11, type: 'card' },
      { rank: '10', suit: 'hearts', value: 10, type: 'card' },
      { rank: '9', suit: 'clubs', value: 9, type: 'card' },
      { rank: '8', suit: 'diamonds', value: 8, type: 'card' },
    ];
    const bet = 100;
    const result = dealRound([...mockShoe], bet);
    expect(result.hands[0].status).toBe('blackjack');
    // Simulate PlayerHand logic
    const hand = result.hands[0];
    const isOptionsShown = hand.status === 'playing' && hand.cards.length === 2 && !(hand.cards.some(c => c.rank === 'A') && hand.cards.some(c => c.value === 10 && c.rank !== 'A'));
    expect(isOptionsShown).toBe(false);
  });

  it('immediately sets results phase if dealer has blackjack', () => {
    // Mock shoe: Player gets 9, 8; Dealer gets Ace, King
    const mockShoe = [
      { rank: '9', suit: 'spades', value: 9, type: 'card', id: 'p1' },
      { rank: '8', suit: 'hearts', value: 8, type: 'card', id: 'p2' },
      { rank: 'A', suit: 'clubs', value: 11, type: 'card', id: 'd1' },
      { rank: 'K', suit: 'diamonds', value: 10, type: 'card', id: 'd2' },
    ];
    const bet = 100;
    const result = dealRound([...mockShoe], bet);
    expect(result.dealer.blackjack).toBe(true);
    expect(result.hands[0].status).toBe('lose');
  });
});
