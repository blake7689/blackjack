import { describe, it, expect, vi, beforeEach } from "vitest";
import { dealRound, settleHands } from "../gameEngine";
import * as cardsModule from "../cards";
import * as blackjackLogic from "../blackjackLogic";
import { HandStatus } from "../constants/handStatus";
import { HandResult } from "../constants/handResult";

// dealer tests ///////////////////////////////////////////////////////////////////////////////////

describe("dealRound", () => {
    let mockShoe;
    let setCutCardFound;
    let resetShoe;
    let mockPlayerFirstCard, mockDealerUpCard, mockPlayerSecondCard, mockDealerDownCard;
    let getHandTotalsSpy/*, isTotalBlackjackSpy, getInitialPlayerHandEvaluationSpy, getInitialDealerHandEvaluationSpy, getDealerHandEvaluationSpy*/;

    beforeEach(() => {
        mockShoe = { cards: [1, 2, 3, 4, 5] };
        setCutCardFound = vi.fn();
        resetShoe = vi.fn();

        // Mock cards to be drawn
        mockPlayerFirstCard = { suit: "H", value: "A" };
        mockDealerUpCard = { suit: "S", value: "K" };
        mockPlayerSecondCard = { suit: "D", value: "9" };
        mockDealerDownCard = { suit: "C", value: "Q" };

        // Mock drawCardFromShoe to return cards in order
        vi.spyOn(cardsModule, "drawCardFromShoe")
            .mockImplementationOnce(() => mockPlayerFirstCard)
            .mockImplementationOnce(() => mockDealerUpCard)
            .mockImplementationOnce(() => mockPlayerSecondCard)
            .mockImplementationOnce(() => mockDealerDownCard);

        // Mock getHandTotals
        getHandTotalsSpy = vi.spyOn(blackjackLogic, "getHandTotals").mockImplementation((cards) => {
            // Return different totals based on input cards
            if (cards.length === 2 && cards[0] === mockPlayerFirstCard && cards[1] === mockPlayerSecondCard) {
                return { total: 20, totals: [20] }; // player
            }
            if (cards.length === 2 && cards[0] === mockDealerUpCard && cards[1].suit === "C") {
                return { total: 21, totals: [21] }; // dealer
            }
            if (cards.length === 1 && cards[0] === mockDealerUpCard) {
                return { total: 10, totals: [10] }; // dealer upcard
            }
            return { total: 0, totals: [0] };
        });

        // // Mock isTotalBlackjack
        // isTotalBlackjackSpy = vi.spyOn(blackjackLogic, "isTotalBlackjack").mockImplementation((total) => total === 21);

        // // Mock getInitialPlayerHandEvaluation
        // getInitialPlayerHandEvaluationSpy = vi.spyOn(blackjackLogic, "getInitialPlayerHandEvaluation").mockReturnValue({
        //     handStatus: HandStatus.DONE,
        //     handResult: HandResult.LOSS
        // });

        // // Mock getInitialDealerHandEvaluation
        // getInitialDealerHandEvaluationSpy = vi.spyOn(blackjackLogic, "getInitialDealerHandEvaluation").mockReturnValue(HandStatus.DONE);

        // // Mock getDealerHandEvaluation
        // getDealerHandEvaluationSpy = vi.spyOn(blackjackLogic, "getDealerHandEvaluation").mockReturnValue({
        //     handStatus: HandStatus.DONE
        // });
    });

    it("should deal initial hands and return correct structure", () => {
        const bet = 50;
        const result = dealRound(mockShoe, bet, setCutCardFound, resetShoe);

        expect(result).toHaveProperty("hands");
        expect(result).toHaveProperty("dealer");
        expect(result).toHaveProperty("shoe");

        // Player hand
        expect(result.hands).toHaveLength(1);
        const playerHand = result.hands[0];
        expect(playerHand.cards).toEqual([mockPlayerFirstCard, mockPlayerSecondCard]);
        expect(playerHand.bet).toBe(bet);
        expect(playerHand.status).toBe(HandStatus.DONE);
        expect(playerHand.isBlackjack).toBe(false); // player total is 20
        expect(playerHand.isDouble).toBe(false);
        expect(playerHand.isBusted).toBe(false);
        expect(playerHand.total).toBe(20);
        expect(playerHand.totals).toEqual([20]);
        expect(playerHand.result).toBe(HandResult.LOSS);
        expect(playerHand.payout).toBe(0);

        // Dealer hand
        const dealer = result.dealer;
        expect(dealer.cards).toHaveLength(2);
        expect(dealer.cards[0]).toEqual(mockDealerUpCard);
        expect(dealer.cards[1]).toMatchObject({ ...mockDealerDownCard, faceDown: false }); // blackjack, so faceDown is false
        expect(dealer.status).toBe(HandStatus.DONE);
        expect(dealer.dealerDisplayTotal).toBe(10);
        expect(dealer.total).toBe(21);
        expect(dealer.totals).toEqual([21]);
        expect(dealer.isBlackjack).toBe(true);
        expect(dealer.isBusted).toBe(false);
    });

    it("should set player and dealer blackjack flags correctly", () => {
        // Change getHandTotals to make player blackjack
        getHandTotalsSpy.mockImplementation((cards) => {
            if (cards.length === 2 && cards[0] === mockPlayerFirstCard && cards[1] === mockPlayerSecondCard) {
                return { total: 21, totals: [21] }; // player blackjack
            }
            if (cards.length === 2 && cards[0] === mockDealerUpCard && cards[1].suit === "C") {
                return { total: 21, totals: [21] }; // dealer blackjack
            }
            if (cards.length === 1 && cards[0] === mockDealerUpCard) {
                return { total: 10, totals: [10] };
            }
            return { total: 0, totals: [0] };
        });

        const result = dealRound(mockShoe, 100, setCutCardFound, resetShoe);

        expect(result.hands[0].isBlackjack).toBe(true);
        expect(result.dealer.isBlackjack).toBe(true);
    });

    it("should call drawCardFromShoe four times", () => {
        dealRound(mockShoe, 10, setCutCardFound, resetShoe);
        expect(cardsModule.drawCardFromShoe).toHaveBeenCalledTimes(4);
    });

    it("should call getHandTotals three times", () => {
        dealRound(mockShoe, 10, setCutCardFound, resetShoe);
        expect(blackjackLogic.getHandTotals).toHaveBeenCalledTimes(3);
    });

    it("should call isTotalBlackjack for dealer and player", () => {
        dealRound(mockShoe, 10, setCutCardFound, resetShoe);
        expect(blackjackLogic.isTotalBlackjack).toHaveBeenCalledTimes(2);
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// settleHands tests //////////////////////////////////////////////////////////////////////////////

describe("settleHands", () => {
    let settleHandSpy;
    let hands;
    let dealer;
    let result;

    beforeEach(() => {
        // Mock hands and dealer
        hands = [
            { id: 1, bet: 10 },
            { id: 2, bet: 20 }
        ];
        dealer = { cards: [{ value: "K" }, { value: "A" }], total: 21 };

        // Mock settleHand to return a result object for each hand
        settleHandSpy = vi.spyOn(blackjackLogic, "settleHand").mockImplementation((hand, dealerArg) => {
            return { ...hand, settled: true, dealerTotal: dealerArg.total };
        });

        result = settleHands(hands, dealer);
    });

    it("should call settleHand for each hand and return settled hands", () => {

        expect(settleHandSpy).toHaveBeenCalledTimes(hands.length);
        expect(settleHandSpy).toHaveBeenNthCalledWith(1, hands[0], dealer);
        expect(settleHandSpy).toHaveBeenNthCalledWith(2, hands[1], dealer);

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ id: 1, settled: true, dealerTotal: 21 });
        expect(result[1]).toMatchObject({ id: 2, settled: true, dealerTotal: 21 });
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// playerHit tests ////////////////////////////////////////////////////////////////////////////////

describe("playerHit", () => {
    let mockHand, mockShoe, setCutCardFound, resetShoe;
    let mockDrawnCard;
    let drawCardFromShoeSpy, getHandTotalsSpy, getHandEvaluationSpy;

    beforeEach(() => {
        mockHand = {
            cards: [{ suit: "H", value: "8" }, { suit: "D", value: "7" }],
            bet: 25,
            status: HandStatus.PLAYING,
            isBlackjack: false,
            isDouble: false,
            isBusted: false,
            total: 15,
            totals: [15],
            result: HandResult.NONE,
            payout: 0
        };
        mockShoe = { cards: [1, 2, 3] };
        setCutCardFound = vi.fn();
        resetShoe = vi.fn();
        mockDrawnCard = { suit: "S", value: "5" };

        drawCardFromShoeSpy = vi.spyOn(cardsModule, "drawCardFromShoe").mockReturnValue(mockDrawnCard);
        getHandTotalsSpy = vi.spyOn(blackjackLogic, "getHandTotals").mockImplementation((cards) => {
            if (cards.length === 3) {
                return { total: 20, totals: [20] };
            }
            return { total: 0, totals: [0] };
        });
        getHandEvaluationSpy = vi.spyOn(blackjackLogic, "getHandEvaluation").mockImplementation((/*totals, hand, numCards*/) => {
            return {
                handStatus: HandStatus.PLAYING,
                handResult: HandResult.NONE,
                isBlackjack: false,
                isBusted: false
            };
        });
    });

    it("should add a card to the hand and update totals and status", () => {
        // Call the function under test (assuming playerHit is imported)
        const { hand, shoe } = blackjackLogic.playerHit(
            mockHand,
            mockShoe,
            setCutCardFound,
            resetShoe
        );

        expect(drawCardFromShoeSpy).toHaveBeenCalledWith(mockShoe, setCutCardFound, resetShoe);
        expect(hand.cards).toEqual([...mockHand.cards, mockDrawnCard]);
        expect(getHandTotalsSpy).toHaveBeenCalledWith([...mockHand.cards, mockDrawnCard]);
        expect(getHandEvaluationSpy).toHaveBeenCalledWith([20], mockHand, 3);
        expect(hand.total).toBe(20);
        expect(hand.totals).toEqual([20]);
        expect(hand.status).toBe(HandStatus.PLAYING);
        expect(hand.result).toBe(HandResult.NONE);
        expect(hand.isBlackjack).toBe(false);
        expect(hand.isBusted).toBe(false);
        expect(shoe).toBe(mockShoe);
    });

    it("should set isBusted to true if handEvaluation returns isBusted true", () => {
        getHandEvaluationSpy.mockReturnValueOnce({
            handStatus: HandStatus.DONE,
            handResult: HandResult.LOSS,
            isBlackjack: false,
            isBusted: true
        });

        const { hand } = blackjackLogic.playerHit(
            mockHand,
            mockShoe,
            setCutCardFound,
            resetShoe
        );

        expect(hand.isBusted).toBe(true);
        expect(hand.status).toBe(HandStatus.DONE);
        expect(hand.result).toBe(HandResult.LOSS);
    });

    it("should set isBlackjack to true if handEvaluation returns isBlackjack true", () => {
        getHandEvaluationSpy.mockReturnValueOnce({
            handStatus: HandStatus.DONE,
            handResult: HandResult.WIN,
            isBlackjack: true,
            isBusted: false
        });

        const { hand } = blackjackLogic.playerHit(
            mockHand,
            mockShoe,
            setCutCardFound,
            resetShoe
        );

        expect(hand.isBlackjack).toBe(true);
        expect(hand.status).toBe(HandStatus.DONE);
        expect(hand.result).toBe(HandResult.WIN);
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// playerDouble tests //////////////////////////////////////////////////////////////////////////////

describe("playerDouble", () => {
    let mockHand, mockShoe, setCutCardFound, resetShoe;
    let mockDrawnCard;
    let drawCardFromShoeSpy, getHandTotalsSpy, getHandEvaluationSpy;

    beforeEach(() => {
        mockHand = {
            cards: [{ suit: "H", value: "8" }, { suit: "D", value: "7" }],
            bet: 25,
            status: HandStatus.PLAYING,
            isBlackjack: false,
            isDouble: false,
            isBusted: false,
            total: 15,
            totals: [15],
            result: HandResult.NONE,
            payout: 0
        };
        mockShoe = { cards: [1, 2, 3] };
        setCutCardFound = vi.fn();
        resetShoe = vi.fn();
        mockDrawnCard = { suit: "S", value: "5" };

        drawCardFromShoeSpy = vi.spyOn(cardsModule, "drawCardFromShoe").mockReturnValue(mockDrawnCard);
        getHandTotalsSpy = vi.spyOn(blackjackLogic, "getHandTotals").mockImplementation((cards) => {
            if (cards.length === 3) {
                return { total: 20, totals: [20] };
            }
            return { total: 0, totals: [0] };
        });
        getHandEvaluationSpy = vi.spyOn(blackjackLogic, "getHandEvaluation").mockImplementation((/*totals, hand, numCards*/) => {
            return {
                handStatus: HandStatus.DONE,
                handResult: HandResult.WIN,
                isBlackjack: false,
                isBusted: false
            };
        });
    });

    it("should add a card, double the bet, set isDouble true, and update totals and status", () => {
        const { hand, shoe } = blackjackLogic.playerDouble(
            mockHand,
            mockShoe,
            setCutCardFound,
            resetShoe
        );

        expect(drawCardFromShoeSpy).toHaveBeenCalledWith(mockShoe, setCutCardFound, resetShoe);
        expect(hand.cards).toEqual([...mockHand.cards, mockDrawnCard]);
        expect(getHandTotalsSpy).toHaveBeenCalledWith([...mockHand.cards, mockDrawnCard]);
        expect(getHandEvaluationSpy).toHaveBeenCalledWith([20], mockHand, 3);
        expect(hand.total).toBe(20);
        expect(hand.totals).toEqual([20]);
        expect(hand.status).toBe(HandStatus.DONE);
        expect(hand.result).toBe(HandResult.WIN);
        expect(hand.isDouble).toBe(true);
        expect(hand.bet).toBe(mockHand.bet * 2);
        expect(hand.isBlackjack).toBe(false);
        expect(hand.isBusted).toBe(false);
        expect(shoe).toBe(mockShoe);
    });

    it("should set isBusted to true if handEvaluation returns isBusted true", () => {
        getHandEvaluationSpy.mockReturnValueOnce({
            handStatus: HandStatus.DONE,
            handResult: HandResult.LOSS,
            isBlackjack: false,
            isBusted: true
        });

        const { hand } = blackjackLogic.playerDouble(
            mockHand,
            mockShoe,
            setCutCardFound,
            resetShoe
        );

        expect(hand.isBusted).toBe(true);
        expect(hand.status).toBe(HandStatus.DONE);
        expect(hand.result).toBe(HandResult.LOSS);
    });

    it("should set isBlackjack to true if handEvaluation returns isBlackjack true", () => {
        getHandEvaluationSpy.mockReturnValueOnce({
            handStatus: HandStatus.DONE,
            handResult: HandResult.WIN,
            isBlackjack: true,
            isBusted: false
        });

        const { hand } = blackjackLogic.playerDouble(
            mockHand,
            mockShoe,
            setCutCardFound,
            resetShoe
        );

        expect(hand.isBlackjack).toBe(true);
        expect(hand.status).toBe(HandStatus.DONE);
        expect(hand.result).toBe(HandResult.WIN);
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// playerSplit tests //////////////////////////////////////////////////////////////////////////////

describe("playerSplit", () => {
    let mockHand, mockShoe, setCutCardFound, resetShoe;
    let mockDrawnCard1, mockDrawnCard2;
    let drawCardFromShoeSpy, getHandTotalsSpy, getHandEvaluationSpy;

    beforeEach(() => {
        mockHand = {
            cards: [
                { suit: "H", value: "8" },
                { suit: "D", value: "8" }
            ],
            bet: 50,
            status: HandStatus.PLAYING,
            isBlackjack: false,
            isDouble: false,
            isBusted: false,
            total: 16,
            totals: [16],
            result: HandResult.NONE,
            payout: 0
        };
        mockShoe = { cards: [1, 2, 3, 4] };
        setCutCardFound = vi.fn();
        resetShoe = vi.fn();
        mockDrawnCard1 = { suit: "S", value: "3" };
        mockDrawnCard2 = { suit: "C", value: "5" };

        drawCardFromShoeSpy = vi.spyOn(cardsModule, "drawCardFromShoe")
            .mockImplementationOnce(() => mockDrawnCard1)
            .mockImplementationOnce(() => mockDrawnCard2);

        getHandTotalsSpy = vi.spyOn(blackjackLogic, "getHandTotals").mockImplementation((cards) => {
            if (cards.length === 2 && cards[0].value === "8" && cards[1].value === "3") {
                return { total: 11, totals: [11] };
            }
            if (cards.length === 2 && cards[0].value === "8" && cards[1].value === "5") {
                return { total: 13, totals: [13] };
            }
            return { total: 0, totals: [0] };
        });

        getHandEvaluationSpy = vi.spyOn(blackjackLogic, "getHandEvaluation").mockImplementation((totals/*, hand, numCards*/) => {
            if (totals[0] === 11) {
                return {
                    handStatus: HandStatus.PLAYING,
                    handResult: HandResult.NONE,
                    isBlackjack: false,
                    isBusted: false
                };
            }
            if (totals[0] === 13) {
                return {
                    handStatus: HandStatus.PLAYING,
                    handResult: HandResult.NONE,
                    isBlackjack: false,
                    isBusted: false
                };
            }
            return {
                handStatus: HandStatus.DONE,
                handResult: HandResult.LOSS,
                isBlackjack: false,
                isBusted: true
            };
        });
    });

    it("should split the hand, draw two cards, and return two new hands with correct cards and totals", () => {
        const { newHandsArray, shoe } = blackjackLogic.playerSplit(
            mockHand,
            mockShoe,
            setCutCardFound,
            resetShoe
        );

        expect(drawCardFromShoeSpy).toHaveBeenCalledTimes(2);
        expect(drawCardFromShoeSpy).toHaveBeenNthCalledWith(1, mockShoe, setCutCardFound, resetShoe);
        expect(drawCardFromShoeSpy).toHaveBeenNthCalledWith(2, mockShoe, setCutCardFound, resetShoe);

        expect(getHandTotalsSpy).toHaveBeenCalledTimes(2);
        expect(getHandTotalsSpy).toHaveBeenCalledWith([mockHand.cards[0], mockDrawnCard1]);
        expect(getHandTotalsSpy).toHaveBeenCalledWith([mockHand.cards[1], mockDrawnCard2]);

        expect(getHandEvaluationSpy).toHaveBeenCalledTimes(2);
        expect(getHandEvaluationSpy).toHaveBeenCalledWith([11], mockHand, 2);
        expect(getHandEvaluationSpy).toHaveBeenCalledWith([13], mockHand, 2);

        expect(newHandsArray).toHaveLength(2);

        // First split hand
        expect(newHandsArray[0].cards).toEqual([mockHand.cards[0], mockDrawnCard1]);
        expect(newHandsArray[0].total).toBe(11);
        expect(newHandsArray[0].totals).toEqual([11]);
        expect(newHandsArray[0].status).toBe(HandStatus.PLAYING);
        expect(newHandsArray[0].result).toBe(HandResult.NONE);
        expect(newHandsArray[0].isBlackjack).toBe(false);
        expect(newHandsArray[0].isBusted).toBe(false);

        // Second split hand
        expect(newHandsArray[1].cards).toEqual([mockHand.cards[1], mockDrawnCard2]);
        expect(newHandsArray[1].total).toBe(13);
        expect(newHandsArray[1].totals).toEqual([13]);
        expect(newHandsArray[1].status).toBe(HandStatus.PLAYING);
        expect(newHandsArray[1].result).toBe(HandResult.NONE);
        expect(newHandsArray[1].isBlackjack).toBe(false);
        expect(newHandsArray[1].isBusted).toBe(false);

        expect(shoe).toBe(mockShoe);
    });

    it("should propagate isBusted and status if hand evaluation returns a busted hand", () => {
        getHandEvaluationSpy.mockImplementation(() => ({
            handStatus: HandStatus.DONE,
            handResult: HandResult.LOSS,
            isBlackjack: false,
            isBusted: true
        }));

        const { newHandsArray } = blackjackLogic.playerSplit(
            mockHand,
            mockShoe,
            setCutCardFound,
            resetShoe
        );

        expect(newHandsArray[0].isBusted).toBe(true);
        expect(newHandsArray[0].status).toBe(HandStatus.DONE);
        expect(newHandsArray[0].result).toBe(HandResult.LOSS);

        expect(newHandsArray[1].isBusted).toBe(true);
        expect(newHandsArray[1].status).toBe(HandStatus.DONE);
        expect(newHandsArray[1].result).toBe(HandResult.LOSS);
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////

// dealerPlay tests ///////////////////////////////////////////////////////////////////////////////

describe("dealerPlay", () => {
    let mockDealer, mockShoe, setCutCardFound, resetShoe;
    let mockDrawnCard, drawCardFromShoeSpy, getHandTotalsSpy, getDealerHandEvaluationSpy;

    beforeEach(() => {
        mockDealer = {
            cards: [
                { suit: "S", value: "K", faceDown: false },
                { suit: "H", value: "7", faceDown: true }
            ],
            status: HandStatus.PLAYING,
            dealerDisplayTotal: 10,
            total: 17,
            totals: [17],
            isBlackjack: false,
            isBusted: false
        };
        mockShoe = { cards: [1, 2, 3] };
        setCutCardFound = vi.fn();
        resetShoe = vi.fn();
        mockDrawnCard = { suit: "D", value: "5" };

        drawCardFromShoeSpy = vi.spyOn(cardsModule, "drawCardFromShoe").mockReturnValue(mockDrawnCard);
        getHandTotalsSpy = vi.spyOn(blackjackLogic, "getHandTotals").mockImplementation((cards) => {
            // If a card was drawn, total is 22 (bust), else 17
            if (cards.length === 3) {
                return { total: 22, totals: [22] };
            }
            return { total: 17, totals: [17] };
        });
        getDealerHandEvaluationSpy = vi.spyOn(blackjackLogic, "getDealerHandEvaluation").mockImplementation((totals/*, dealerArg, playerAllBust*/) => {
            if (totals[0] === 22) {
                return { handStatus: HandStatus.DONE, isBusted: true };
            }
            return { handStatus: HandStatus.DONE, isBusted: false };
        });
    });

    it("should reveal all dealer cards and draw a card if status is PLAYING and playerAllBust is false", () => {
        const { dealer, shoe } = blackjackLogic.dealerPlay(
            mockDealer,
            mockShoe,
            false,
            setCutCardFound,
            resetShoe
        );

        // All cards should have faceDown: false
        dealer.cards.forEach(card => {
            expect(card.faceDown).toBe(false);
        });

        // Should draw a card
        expect(drawCardFromShoeSpy).toHaveBeenCalledWith(mockShoe, setCutCardFound, resetShoe);
        expect(dealer.cards).toContainEqual(mockDrawnCard);

        // Should call getHandTotals with all cards
        expect(getHandTotalsSpy).toHaveBeenCalledWith(dealer.cards);

        // Should call getDealerHandEvaluation with new totals
        expect(getDealerHandEvaluationSpy).toHaveBeenCalledWith([22], mockDealer, false);

        // Should update dealer status and isBusted
        expect(dealer.status).toBe(HandStatus.DONE);
        expect(dealer.isBusted).toBe(true);

        // Should update totals and total
        expect(dealer.total).toBe(22);
        expect(dealer.totals).toEqual([22]);
        expect(dealer.dealerDisplayTotal).toBe(22);

        // Shoe should be unchanged
        expect(shoe).toBe(mockShoe);
    });

    it("should not draw a card if playerAllBust is true", () => {
        const { dealer } = blackjackLogic.dealerPlay(
            mockDealer,
            mockShoe,
            true,
            setCutCardFound,
            resetShoe
        );

        // Should not draw a card
        expect(drawCardFromShoeSpy).not.toHaveBeenCalled();

        // Should call getHandTotals with original cards (faceDown: false)
        expect(getHandTotalsSpy).toHaveBeenCalledWith([
            { ...mockDealer.cards[0], faceDown: false },
            { ...mockDealer.cards[1], faceDown: false }
        ]);

        // Should call getDealerHandEvaluation with correct args
        expect(getDealerHandEvaluationSpy).toHaveBeenCalledWith([17], mockDealer, true);

        // Should update dealer status and isBusted
        expect(dealer.status).toBe(HandStatus.DONE);
        expect(dealer.isBusted).toBe(false);

        // Should update totals and total
        expect(dealer.total).toBe(17);
        expect(dealer.totals).toEqual([17]);
        expect(dealer.dealerDisplayTotal).toBe(17);
    });

    it("should not draw a card if dealer status is not PLAYING", () => {
        const dealerNotPlaying = { ...mockDealer, status: HandStatus.DONE };
        const { dealer } = blackjackLogic.dealerPlay(
            dealerNotPlaying,
            mockShoe,
            false,
            setCutCardFound,
            resetShoe
        );

        expect(drawCardFromShoeSpy).not.toHaveBeenCalled();
        expect(getHandTotalsSpy).toHaveBeenCalled();
        expect(getDealerHandEvaluationSpy).toHaveBeenCalled();
        expect(dealer.status).toBe(HandStatus.DONE);
    });

    it("should always return a new dealer object and shoe", () => {
        const result = blackjackLogic.dealerPlay(
            mockDealer,
            mockShoe,
            false,
            setCutCardFound,
            resetShoe
        );
        expect(result).toHaveProperty("dealer");
        expect(result).toHaveProperty("shoe");
    });
});

///////////////////////////////////////////////////////////////////////////////////////////////////







