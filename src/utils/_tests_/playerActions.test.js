import { describe, it, expect } from 'vitest';
import { playerDouble, playerSplit } from '../gameEngine';

describe('playerDouble', () => {
  it('doubles the bet and sets status to stand', () => {
    const hand = { cards: [
      { rank: '9', suit: 'spades', value: 9, type: 'card' },
      { rank: '2', suit: 'hearts', value: 2, type: 'card' }
    ], bet: 100, status: 'playing', total: 11 };
    const shoe = [
      { rank: 'K', suit: 'clubs', value: 10, type: 'card' }
    ];
    const { hand: newHand } = playerDouble(hand, shoe);
    expect(newHand.bet).toBe(200);
    expect(newHand.cards.length).toBe(3);
    expect(newHand.status).toBe('stand');
    expect(newHand.total).toBe(21);
  });
});

describe('playerSplit', () => {
  it('creates two hands with equal bet and correct cards', () => {
    const hand = { cards: [
      { rank: '8', suit: 'spades', value: 8, type: 'card' },
      { rank: '8', suit: 'hearts', value: 8, type: 'card' }
    ], bet: 50, status: 'playing', total: 16 };
    const shoe = [
      { rank: '2', suit: 'clubs', value: 2, type: 'card' },
      { rank: '3', suit: 'diamonds', value: 3, type: 'card' }
    ];
    const [hand1, hand2] = playerSplit(hand, shoe);
    expect(hand1.cards.length).toBe(2);
    expect(hand2.cards.length).toBe(2);
    expect(hand1.bet).toBe(50);
    expect(hand2.bet).toBe(50);
    expect(hand1.cards[0].rank).toBe('8');
    expect(hand2.cards[0].rank).toBe('8');
    expect(hand1.cards[1].rank).toBe('2');
    expect(hand2.cards[1].rank).toBe('3');
  });
});
