import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createShoe, drawCardFromShoe } from './cards';

// createShoe tests ///////////////////////////////////////////////////////////////////////////////

describe('createShoe', () => {
    it('creates a shoe with the correct number of cards for 1 deck (plus cut card)', () => {
        const shoe = createShoe(1, true);
        // 52 cards + 1 cut card
        expect(shoe.length).toBe(53);
        expect(shoe.some(card => card.type === 'cut')).toBe(true);
    });

    it('creates a shoe with the correct number of cards for 2 decks (plus cut card)', () => {
        const shoe = createShoe(2, true);
        expect(shoe.length).toBe(105); // 52*2 + 1
        expect(shoe.filter(card => card.type === 'cut').length).toBe(1);
    });

    it('creates a shoe without a cut card if includeCutCard is false', () => {
        const shoe = createShoe(2, false);
        expect(shoe.length).toBe(104);
        expect(shoe.some(card => card.type === 'cut')).toBe(false);
    });

    it('all cards in shoe have required properties', () => {
        const shoe = createShoe(1, false);
        for (const card of shoe) {
            expect(card).toHaveProperty('id');
            expect(card).toHaveProperty('rank');
            expect(card).toHaveProperty('suit');
            expect(card).toHaveProperty('value');
            expect(card).toHaveProperty('count');
            expect(card).toHaveProperty('altValue');
            expect(card).toHaveProperty('type', 'card');
        }
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// drawCardFromShoe tests /////////////////////////////////////////////////////////////////////////

describe('drawCardFromShoe', () => {
    let shoe, setCutCardFound, resetShoe;

    beforeEach(() => {
        // Create a shoe with 1 deck and a cut card
        shoe = createShoe(1, true);
        setCutCardFound = vi.fn();
        resetShoe = vi.fn(() => {
            // Return a new shoe with 1 deck and a cut card
            return createShoe(1, true);
        });
    });

    it('draws a card from the shoe and returns it', () => {
        const card = drawCardFromShoe([...shoe], setCutCardFound, resetShoe);
        expect(card).toBeDefined();
        expect(card.type).toBe('card');
    });

    it('skips the cut card and calls setCutCardFound', () => {
        // Place a cut card at the top
        const cutCard = { id: 'CUT-1', type: 'cut' };
        const normalCard = { id: '2-hearts-0-1', type: 'card', rank: '2', suit: 'hearts', value: 2, count: 1, altValue: 2 };
        const testShoe = [cutCard, normalCard];
        const card = drawCardFromShoe(testShoe, setCutCardFound, resetShoe);
        expect(card.type).toBe('card');
        expect(setCutCardFound).toHaveBeenCalledWith(true);
    });

    it('calls resetShoe if shoe is empty', () => {
        const emptyShoe = [];
        drawCardFromShoe(emptyShoe, setCutCardFound, resetShoe);
        expect(resetShoe).toHaveBeenCalledWith(true);
    });

    it('throws if shoe is undefined', () => {
        expect(() => drawCardFromShoe(undefined, setCutCardFound, resetShoe)).toThrow('Shoe is undefined');
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// buildDeck tests ////////////////////////////////////////////////////////////////////////////////

describe('buildDeck', () => {
    let buildDeck;

    beforeAll(async () => {
        ({ buildDeck } = await import('../cards.js'));
    });

    it('returns an array of 52 cards for a single deck', () => {
        const deck = buildDeck(0);
        expect(Array.isArray(deck)).toBe(true);
        expect(deck.length).toBe(52);
    });

    it('each card has the correct properties', () => {
        const deck = buildDeck(0);
        for (const card of deck) {
            expect(card).toHaveProperty('id');
            expect(card).toHaveProperty('rank');
            expect(card).toHaveProperty('suit');
            expect(card).toHaveProperty('value');
            expect(card).toHaveProperty('count');
            expect(card).toHaveProperty('altValue');
            expect(card).toHaveProperty('type', 'card');
        }
    });

    it('all suits and ranks are represented', () => {
        const deck = buildDeck(0);
        const suits = new Set(deck.map(card => card.suit));
        const ranks = new Set(deck.map(card => card.rank));
        expect(suits).toEqual(new Set(['hearts', 'diamonds', 'clubs', 'spades']));
        expect(ranks).toEqual(new Set([
            '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'
        ]));
    });

    it('id includes rank, suit, deckIndex, and a number', () => {
        const deck = buildDeck(5);
        for (const card of deck) {
            expect(card.id).toMatch(/^(2|3|4|5|6|7|8|9|10|jack|queen|king|ace)-(hearts|diamonds|clubs|spades)-5-\d+$/);
        }
    });

    it('altValue is 1 for aces and equals value for other cards', () => {
        const deck = buildDeck(0);
        for (const card of deck) {
            if (card.rank === 'ace') {
                expect(card.altValue).toBe(1);
            } else {
                expect(card.altValue).toBe(card.value);
            }
        }
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// shuffle tests //////////////////////////////////////////////////////////////////////////////////

describe('shuffle', () => {
    let shuffle;

    beforeAll(async () => {
        ({ shuffle } = await import('../cards.js'));
    });

    it('returns a new array with the same elements as the input', () => {
        const arr = [1, 2, 3, 4, 5];
        const shuffled = shuffle(arr);
        expect(Array.isArray(shuffled)).toBe(true);
        expect(shuffled).not.toBe(arr); // should be a new array
        expect(shuffled.sort()).toEqual(arr.sort());
    });

    it('does not mutate the original array', () => {
        const arr = [1, 2, 3, 4, 5];
        const arrCopy = [...arr];
        shuffle(arr);
        expect(arr).toEqual(arrCopy);
    });

    it('returns an array of the same length', () => {
        const arr = [1, 2, 3, 4, 5, 6, 7];
        const shuffled = shuffle(arr);
        expect(shuffled.length).toBe(arr.length);
    });

    it('shuffles the array (order is likely to change)', () => {
        // With small arrays, shuffle may return the same order by chance, so repeat
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let different = false;
        for (let i = 0; i < 10; i++) {
            const shuffled = shuffle(arr);
            if (shuffled.join() !== arr.join()) {
                different = true;
                break;
            }
        }
        expect(different).toBe(true);
    });

    it('works with empty arrays', () => {
        const arr = [];
        const shuffled = shuffle(arr);
        expect(shuffled).toEqual([]);
    });

    it('works with arrays of one element', () => {
        const arr = [42];
        const shuffled = shuffle(arr);
        expect(shuffled).toEqual([42]);
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////
