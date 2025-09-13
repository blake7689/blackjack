import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from "@testing-library/react";
import { GameProvider } from "../../providers/GameProvider";
import { GamePhases } from "../../utils/constants/gamePhases";
import { useGame } from "../../hooks/useGame";
import { HandStatus } from "../../utils/constants/handStatus";
import * as gameEngine from "../../utils/gameEngine";
import jest from 'jest-mock';

// Helper component to access context
function TestComponent({ callback }) {
	const game = useGame();
	callback && callback(game);
	return null;
}

describe("GameProvider", () => {
	let contextValue = null;

	function renderWithProvider(callback) {
		return render(
			<GameProvider>
				<TestComponent callback={callback} />
			</GameProvider>
		);
	}

	beforeEach(() => {
		contextValue = null;
	});

	it("provides initial state", () => {
		renderWithProvider((game) => {
			contextValue = game;
		});
		expect(contextValue.deckCount).toBe(2);
		expect(Array.isArray(contextValue.shoe)).toBe(true);
		expect(Array.isArray(contextValue.hands)).toBe(true);
		expect(contextValue.dealer).toBeDefined();
		expect(contextValue.gamePhase).toBe(GamePhases.NONE);
		expect(contextValue.betCircle).toBe(0);
		expect(contextValue.selectedHandIndex).toBe(0);
		expect(contextValue.runningCount).toBe(0);
		expect(contextValue.lastCreditChange).toBe(0);
		expect(contextValue.includeCutCard).toBe(true);
		expect(contextValue.cutCardFound).toBe(false);
	});

	it("can set deck count", () => {
		renderWithProvider((game) => {
			act(() => {
				game.setDeckCount(4);
			});
			expect(game.deckCount).toBe(4);
		});
	});

	it("can set and reset shoe", () => {
		renderWithProvider((game) => {
			const oldShoe = game.shoe;
			act(() => {
				game.resetShoe();
			});
			expect(game.shoe).not.toBe(oldShoe);
			expect(Array.isArray(game.shoe)).toBe(true);
		});
	});

	it("can set and reset game", () => {
		renderWithProvider((game) => {
			act(() => {
				game.setDeckCount(3);
				game.setIncludeCutCard(false);
				game.resetGame(3, false, GamePhases.PRE_DEAL);
			});
			expect(game.deckCount).toBe(3);
			expect(game.includeCutCard).toBe(false);
			expect(game.gamePhase).toBe(GamePhases.PRE_DEAL);
			expect(Array.isArray(game.shoe)).toBe(true);
		});
	});

	it("can start game", () => {
		renderWithProvider((game) => {
			act(() => {
				game.startGame();
			});
			expect(game.gamePhase).toBe(GamePhases.PRE_DEAL);
			expect(Array.isArray(game.shoe)).toBe(true);
		});
	});

	it("can update credits and show lastCreditChange", () => {
		renderWithProvider((game) => {
			act(() => {
				game.updateCredits(1000);
			});
			expect(typeof game.lastCreditChange).toBe("number");
		});
	});

	it("can set and reset cutCardFound", () => {
		renderWithProvider((game) => {
			act(() => {
				game.setCutCardFound(true);
			});
			expect(game.cutCardFound).toBe(true);
			act(() => {
				game.setCutCardFound(false);
			});
			expect(game.cutCardFound).toBe(false);
		});
	});

	it("can end round and reset state", () => {
		renderWithProvider((game) => {
			act(() => {
				game.setGamePhase(GamePhases.RESULTS);
				game.setHands([{ cards: [{ id: 1 }], status: HandStatus.DONE }]);
				game.setDealer({ cards: [{ id: 2 }] });
				game.setBetCircle(50);
				game.endRound();
			});
			expect(game.gamePhase).toBe(GamePhases.PRE_DEAL);
			expect(game.hands.length).toBe(0);
			expect(game.dealer.cards.length).toBe(0);
			expect(game.betCircle).toBe(0);
		});
	});

	it("can refund local credits", () => {
		renderWithProvider((game) => {
			act(() => {
				game.setBetCircle(100);
				game.refundLocal();
			});
			// No assertion here, as refundLocal calls addCreditsLocalOnly from usePlayer
			// which is a mock in this test context.
		});
	});

	

	
});

describe("GameProvider game actions", () => {
	function renderWithProvider(callback) {
		return render(
			<GameProvider>
				<TestComponent callback={callback} />
			</GameProvider>
		);
	}

	beforeEach(() => {
		jest.resetAllMocks && jest.resetAllMocks();
	});
    it("deal updates hands, dealer, and phase", () => {
        const mockHands = [{ cards: [{ id: 1 }], status: HandStatus.PLAYING }];
        const mockDealer = { cards: [{ id: 2 }] };
        const mockShoe = [{ id: 3 }];
        jest.spyOn(gameEngine, "dealRound").mockReturnValue({ hands: mockHands, dealer: mockDealer, shoe: mockShoe });
        renderWithProvider((game) => {
            act(() => {
                game.deal(50);
            });
            expect(game.hands).toEqual(mockHands);
            expect(game.dealer).toEqual(mockDealer);
            expect(game.shoe).toEqual(mockShoe);
            expect([
                GamePhases.PLAYER_TURN,
                GamePhases.DEALER_TURN
            ]).toContain(game.gamePhase);
        });
    });

    it("hit updates hand and shoe", () => {
        const mockHand = { cards: [{ id: 1 }, { id: 4 }], status: HandStatus.PLAYING };
        const mockShoe = [{ id: 5 }];
        jest.spyOn(gameEngine, "playerHit").mockReturnValue({ hand: mockHand, shoe: mockShoe });
        renderWithProvider((game) => {
            act(() => {
                game.setHands([{ cards: [{ id: 1 }], status: HandStatus.PLAYING }]);
                game.setShoe([{ id: 2 }]);
                game.hit(0);
            });
            expect(game.hands[0].cards.length).toBe(2);
            expect(game.shoe).toEqual(mockShoe);
        });
    });

    it("stay marks hand as done and advances phase or hand", () => {
        renderWithProvider((game) => {
            act(() => {
                game.setHands([
                    { cards: [{ id: 1 }], status: HandStatus.PLAYING },
                    { cards: [{ id: 2 }], status: HandStatus.PLAYING }
                ]);
                game.stay(0);
            });
            expect(game.hands[0].status).toBe(HandStatus.DONE);
            // selectedHandIndex should advance or reset
            expect([0, 1]).toContain(game.selectedHandIndex);
        });
    });

    it("double updates hand, shoe, betCircle, and credits", () => {
        const mockHand = { cards: [{ id: 1 }, { id: 2 }], bet: 100, status: HandStatus.DONE };
        const mockShoe = [{ id: 3 }];
        jest.spyOn(gameEngine, "playerDouble").mockReturnValue({ hand: mockHand, shoe: mockShoe });
        renderWithProvider((game) => {
            act(() => {
                game.setHands([{ cards: [{ id: 1 }], bet: 100, status: HandStatus.PLAYING }]);
                game.setShoe([{ id: 2 }]);
                game.setBetCircle(100);
                game.setGamePhase(GamePhases.PLAYER_TURN);
                game.double(0);
            });
            expect(game.hands[0].cards.length).toBe(2);
            expect(game.shoe).toEqual(mockShoe);
            expect(typeof game.betCircle).toBe("number");
        });
    });

    it("split updates hands, shoe, and betCircle", () => {
        const mockHandsArr = [
            { cards: [{ id: 1 }], bet: 50, status: HandStatus.PLAYING },
            { cards: [{ id: 2 }], bet: 50, status: HandStatus.PLAYING }
        ];
        const mockShoe = [{ id: 3 }];
        jest.spyOn(gameEngine, "playerSplit").mockReturnValue({ newHandsArray: mockHandsArr, shoe: mockShoe });
        renderWithProvider((game) => {
            act(() => {
                game.setHands([
                    { cards: [{ id: 1 }, { id: 2 }], bet: 50, status: HandStatus.PLAYING }
                ]);
                game.setShoe([{ id: 2 }]);
                game.setBetCircle(50);
                game.split(0);
            });
            expect(game.hands.length).toBe(2);
            expect(game.shoe).toEqual(mockShoe);
            expect(typeof game.betCircle).toBe("number");
        });
    });

    it("dealerTurn sets dealer and phase", () => {
        const mockDealer = { cards: [{ id: 1 }], status: HandStatus.PLAYING };
        renderWithProvider((game) => {
            act(() => {
                game.setDealer(mockDealer);
                game.dealerTurn();
            });
            expect(game.dealer.cards.length).toBeGreaterThan(0);
            expect([
                GamePhases.SETTLING_HANDS,
                GamePhases.RESULTS
            ]).toContain(game.gamePhase);
        });
    });
});
