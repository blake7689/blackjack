import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import GameBoard from "../components/GameBoard/GameBoard";
import Settings from "../pages/Settings";
import { renderUI, fakeActions } from "./testUtils";
import { initialGameState } from "../utils/gameReducer";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";

// The table with several betting spots (#59): one circle per spot, the selected one takes the bet keys, offers and names go spot by spot.
const three = { ...initialGameState.settings, handSpots: 3 };
const betting = (extra = {}) => ({ phase: GamePhases.PRE_DEAL, hands: [], settings: three, seenIds: ["x"], ...extra });
const circle = (n) => screen.getByRole("button", { name: new RegExp(`^Bet spot ${n},`) });
const key = (k) => fireEvent.keyDown(document.body, { key: k });
const board = (game, options = {}) => renderUI(<GameBoard />, { game, actions: fakeActions({ addSpots: () => {}, ...options.actions }), ...options });

const card = (id, rank) => ({ id, rank, suit: "hearts" });
const hand = (tag, spot, extra = {}) => ({
  tag, spot, cards: [card(`a${tag}`, "10"), card(`b${tag}`, "8")], hiddenCards: [], bet: 10, baseStake: 10, status: HandStatus.PLAYING, result: HandResult.NONE, ...extra,
});
const dealt = (extra = {}) => ({
  phase: GamePhases.OFFERS, settings: three, seenIds: ["x"], hands: [hand(1, 0), hand(2, 2, { bet: 30 })], selectedHandIndex: 0,
  dealer: { cards: [card("d", "ace")], status: HandStatus.PLAYING }, dealerHole: { cards: [card("h", "9")] },
  offers: { insurance: true, evenMoney: false, surrender: true, peek: true }, ...extra,
});

describe("before the deal (#59)", () => {
  it("one circle per offered spot; the last one tapped takes the rack's double press", () => {
    const { gameActions } = board(betting());
    expect(screen.getAllByRole("button", { name: /^Bet spot/ })).toHaveLength(3);
    expect(screen.getByRole("group", { name: "Spot 2, hand 2: no cards" })).toBeTruthy();
    expect(circle(1).getAttribute("aria-pressed")).toBe("true");
    key("2"); key("2");
    fireEvent.click(circle(2));
    expect([circle(1), circle(2)].map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    key("2"); key("2");
    const [first, tap, second] = gameActions.addBet.mock.calls;
    expect([first.length, tap[1], second[1]]).toEqual([1, 1, 1]); // spot 1 keeps the old one-argument call
    fireEvent.click(circle(1));
    expect(gameActions.addBet.mock.calls.at(-1)).toHaveLength(1);
  });

  it("one spot: one plain circle", () => {
    board(betting({ settings: initialGameState.settings, betCircle: 10 }));
    expect(screen.getAllByRole("button", { name: /^Bet spot/ })).toHaveLength(1);
    expect(circle(1).getAttribute("aria-pressed")).toBeNull();
    expect(screen.getByRole("group", { name: "Hand 1: no cards" })).toBeTruthy();
  });

  it("Rebet restores every spot and 2x doubles every spot", () => {
    const addSpots = [];
    const actions = { addSpots: (s) => addSpots.push(s) };
    const { unmount } = board(betting({ initialBet: 30, initialSpots: [10, 0, 20] }), { actions });
    key("b");
    unmount();
    board(betting({ betCircle: 30, betSpots: [10, 0, 20], betHistory: [[10, 0, 20]] }), { actions });
    key("x");
    expect(addSpots).toEqual([[10, 0, 20], [10, 0, 20]]);
  });

  it("Rebet is dimmed when the credits do not cover the total", () => {
    board(betting({ initialBet: 300, initialSpots: [100, 100, 100] }));
    expect(screen.getByRole("button", { name: "Rebet" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("a spot no longer offered gives the selection back to spot 1", () => {
    const { gameState, rerender } = board(betting());
    fireEvent.click(circle(3));
    gameState.settings = { ...three, handSpots: 2 };
    rerender(<GameBoard />);
    expect(circle(1).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("a dealt round with several spots (#59)", () => {
  it("offers go spot by spot: prompt, price, surrendered hand and focus", () => {
    const { gameState, gameActions, rerender } = board(dealt());
    expect(screen.getByText("Spot 1: insurance?")).toBeTruthy();
    expect(document.activeElement === screen.getByRole("button", { name: /Insurance \$5/ })).toBe(true);
    screen.getByRole("button", { name: "No thanks" }).focus();
    gameState.selectedHandIndex = 1;
    rerender(<GameBoard />);
    expect(screen.getByText("Spot 3: insurance?")).toBeTruthy();
    expect(document.activeElement === screen.getByRole("button", { name: /Insurance \$15/ })).toBe(true);
    key("r");
    expect(gameActions.surrender).toHaveBeenCalledWith(1);
  });

  it("Insurance is dimmed when the credits are short of the stake", () => {
    board(dealt(), { player: { player: { userName: "t", credits: 2 } } });
    expect(screen.getByRole("button", { name: /Insurance \$5/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("each spot's first hand is labelled, split hands are not, and the names stay if the setting drops to 1", () => {
    const { container } = board(dealt({ phase: GamePhases.PLAYER_TURN, offers: null, settings: initialGameState.settings, hands: [hand(1, 0), hand(2, 0), hand(3, 2)] }));
    expect([...container.querySelectorAll(".spot-name")].map((e) => e.textContent)).toEqual(["Spot 1", "Spot 3"]);
    expect(screen.getByRole("group", { name: /^Spot 1, hand 2:/ })).toBeTruthy();
    expect(screen.getByRole("group", { name: /^Spot 3, hand 3:/ })).toBeTruthy();
  });
});

describe("Settings: Hands per round (#59)", () => {
  it("is a 1 to 3 choice in Gameplay, saved with the other settings", () => {
    const { container, gameActions } = renderUI(<Settings />, { path: "/settings#play", game: { phase: GamePhases.PRE_DEAL } });
    const pick = (n) => container.querySelector(`[data-pick-spots="${n}"]`);
    expect(pick(1).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(pick(3));
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    expect(gameActions.changeSettings).toHaveBeenCalledWith({ handSpots: 3 });
  });
});
