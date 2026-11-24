import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, act, fireEvent } from "@testing-library/react";
import { renderUI } from "./testUtils";
import GameBoard from "../components/GameBoard/GameBoard";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";

// The seats (#81): one betting seat before the deal, one centred row of up to four hands, a row that scrolls one hand at a time otherwise.
let n = 0;
const hand = (codes = ["8", "3"]) => ({ tag: `s${n++}`, cards: stackedShoe(codes), hiddenCards: [], bet: 10, status: HandStatus.PLAYING, result: HandResult.NONE, totals: [11], total: 11 });
const table = (hands, extra = {}) => ({ phase: GamePhases.PLAYER_TURN, hands, dealer: { cards: stackedShoe(["10"]), dealerDisplayTotal: 10 }, shoe: stackedShoe(["2", "3"]), ...extra });
const seatsEl = (container) => container.querySelector(".seats");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete Element.prototype.scrollTo; });

describe("the betting seat", () => {
  it("is one empty seat with a printed circle that says BET, active between rounds", () => {
    const { container } = renderUI(<GameBoard />, { game: { phase: GamePhases.PRE_DEAL, hands: [], betCircle: 0, seenIds: ["x"] } }); // seenIds: no opening shuffle (no bet during it, #147)
    const seats = container.querySelectorAll(".seat");
    expect(seats).toHaveLength(1);
    expect(seats[0].classList.contains("nocards")).toBe(true);
    expect(seats[0].classList.contains("active")).toBe(true);
    expect(seats[0].querySelector(".bet-lbl").textContent).toBe("BET");
    expect(seats[0].querySelector(".spot").classList.contains("has")).toBe(false);
    expect(screen.getByRole("group", { name: "Hand 1: no cards" })).toBeTruthy();
    expect(container.querySelector(".stage-in").style.getPropertyValue("--n")).toBe("1");
  });

  it("shows the chips in the circle as its amount", () => {
    const { container } = renderUI(<GameBoard />, { game: { phase: GamePhases.PRE_DEAL, hands: [], betCircle: 25 } });
    expect(container.querySelector(".amt").textContent).toBe("$25");
    expect(container.querySelector(".spot").classList.contains("has")).toBe(true);
  });

  it("the circle is a button that bets the selected chip (the default is the $25 chip)", () => {
    const { gameActions } = renderUI(<GameBoard />, { game: { phase: GamePhases.PRE_DEAL, hands: [], betCircle: 0, seenIds: ["x"] } });
    const spot = screen.getByRole("button", { name: "Bet spot 1, $0. Adds a $25 chip" });
    fireEvent.click(spot);
    expect(gameActions.addBet).toHaveBeenCalledWith(25);
  });
});

describe("out of credits (L1-18)", () => {
  it("the line says Out of credits, and the disabled circle offers no chip in its name", () => {
    renderUI(<GameBoard />, { player: { player: { userName: "t", credits: 0 } }, game: { phase: GamePhases.PRE_DEAL, hands: [], betCircle: 0, seenIds: ["x"] } });
    expect(screen.getByText("Out of credits", { selector: ".msg" })).toBeTruthy();
    expect(screen.queryByText("Place your bets")).toBeNull();
    expect(screen.getByRole("button", { name: "Bet spot 1, $0" }).disabled).toBe(true);
  });
});

describe("hands", () => {
  it("hands not in play dim (the .turns row), the one in play is active", () => {
    const { container } = renderUI(<GameBoard />, { game: table([hand(), hand()], { selectedHandIndex: 1 }) });
    expect(seatsEl(container).classList.contains("turns")).toBe(true);
    expect([...container.querySelectorAll(".seat")].map((s) => s.classList.contains("active"))).toEqual([false, true]);
    expect(container.querySelector(".stage-in").classList.contains("multi")).toBe(true);
  });

  it("one hand, or the dealer's turn: nothing dims", () => {
    const one = renderUI(<GameBoard />, { game: table([hand()]) });
    expect(seatsEl(one.container).classList.contains("turns")).toBe(false);
    one.unmount();
    const two = renderUI(<GameBoard />, { game: table([hand(), hand()], { phase: GamePhases.DEALER_TURN }) });
    expect(seatsEl(two.container).classList.contains("turns")).toBe(false);
    expect(two.container.querySelector(".seat.active")).toBeNull();
  });

  it("the totals are named in the hand, and Show hand totals off leaves them out", () => {
    const { rerender, gameState } = renderUI(<GameBoard />, { game: table([hand(["8", "3"])]) });
    expect(screen.getByRole("group", { name: /^Hand 1: 8 of hearts, 3 of hearts, 11$/ })).toBeTruthy();
    gameState.settings = { ...gameState.settings, showTotals: false };
    rerender(<GameBoard />);
    expect(screen.getByRole("group", { name: "Hand 1: 8 of hearts, 3 of hearts" })).toBeTruthy();
  });
});

describe("the row scrolls one hand at a time (useSeatsScroll)", () => {
  const five = () => [hand(), hand(), hand(), hand(), hand()];

  it("from five hands, with the hand in play centred", () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    const { container, gameState, rerender } = renderUI(<GameBoard />, { game: table(five(), { selectedHandIndex: 2 }) });
    expect(seatsEl(container).classList.contains("scroll")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "smooth" }); // jsdom has no layout: every offset is 0
    scrollTo.mockClear();
    gameState.selectedHandIndex = 3;
    rerender(<GameBoard />);
    expect(scrollTo).toHaveBeenCalledOnce();
  });

  it("centres the hand in play: the scroll puts the middle of its seat on the middle of the row, for every hand", () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    // a row 400 wide of seats 150 wide, 200 apart (a seat's place is its index among its siblings)
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(150);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function place() { return 200 * [...this.parentElement.children].indexOf(this); });
    const { gameState, rerender } = renderUI(<GameBoard />, { game: table(five(), { selectedHandIndex: 0 }) });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: -125, behavior: "smooth" }); // 0 - 400 / 2 + 150 / 2: the first seat's middle on the row's middle
    for (const index of [1, 2, 3, 4]) {
      gameState.selectedHandIndex = index;
      rerender(<GameBoard />);
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 200 * index - 125, behavior: "smooth" }); // one seat further each time: one hand at a time
    }
  });

  it("jumps instead of gliding with reduced motion", () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    renderUI(<GameBoard />, { game: table(five(), { selectedHandIndex: 0 }) });
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "auto" });
  });

  it("does nothing for a hand that is not there, or where the browser cannot scroll an element", () => {
    const { container } = renderUI(<GameBoard />, { game: table(five(), { selectedHandIndex: 9 }) });
    expect(seatsEl(container).classList.contains("scroll")).toBe(true);
    const plain = renderUI(<GameBoard />, { game: table(five(), { selectedHandIndex: 1 }) }); // no scrollTo in jsdom
    expect(seatsEl(plain.container).classList.contains("scroll")).toBe(true);
  });

  it("not up to four hands, which share one centred row", () => {
    const { container } = renderUI(<GameBoard />, { game: table(five().slice(0, 4), { selectedHandIndex: 0 }) });
    expect(seatsEl(container).classList.contains("scroll")).toBe(false);
  });

  it("also when a row of two to four does not fit, decided once per hand count and width", () => {
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function box() {
      const spills = this.classList.contains("hand");
      return { left: 0, top: 0, bottom: 10, width: spills ? 50 : 100, height: 10, right: spills ? 9999 : 100 };
    });
    const four = five().slice(0, 4);
    const { container, gameState, rerender } = renderUI(<GameBoard />, { game: table(four) });
    expect(seatsEl(container).classList.contains("scroll")).toBe(true);
    rect.mockRestore();
    rerender(<GameBoard />); // a re-render never resets it
    expect(seatsEl(container).classList.contains("scroll")).toBe(true);
    gameState.hands = four.slice(0, 3); // a new hand count is decided afresh: it fits
    rerender(<GameBoard />);
    expect(seatsEl(container).classList.contains("scroll")).toBe(false);
  });

  it("never measures one hand, and re-decides when the stage changes width", () => {
    let observe;
    vi.stubGlobal("ResizeObserver", class { constructor(cb) { observe = cb; } observe() {} disconnect() {} });
    let width = 400;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    const { container, unmount } = renderUI(<GameBoard />, { game: table([hand()]) });
    expect(seatsEl(container).classList.contains("scroll")).toBe(false);
    width = 800;
    act(() => observe());
    expect(seatsEl(container).classList.contains("scroll")).toBe(false);
    unmount();
  });
});
