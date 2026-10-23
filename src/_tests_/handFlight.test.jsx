import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderUI, Flight, finishAnimations, settleDeal } from "./testUtils";
import { animations } from "./setup";
import DealerArea from "../components/DealerArea/DealerArea";
import PlayerHand from "../components/Playerhand/PlayerHand";
import GameBoard from "../components/GameBoard/GameBoard";
import { EASING, cardTiming, landed, queue, reserve } from "../utils/cardAnimation";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import { GamePhases } from "../utils/constants/gamePhases";
import { initialGameState } from "../utils/gameReducer";

const timing = cardTiming(1000);
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const flights = () => animations.filter((a) => a.el.tagName === "IMG");
const flips = () => animations.filter((a) => a.el.classList.contains("fly-inner"));
const glides = () => animations.filter((a) => a.frames[0]?.translate !== undefined);
const live = (c) => c.querySelector(".hand-total > span:not(.ht-size)").textContent;

let tags = 0;
const mkHand = (cards, extra = {}) => ({
  tag: `h${tags++}`, cards, hiddenCards: [], bet: 10, status: HandStatus.PLAYING, result: HandResult.NONE,
  totals: [20], total: 20, isBusted: false, isBlackjack: false, ...extra,
});
const handProps = { index: 0, active: true, gamePhase: GamePhases.DEALER_TURN, handCount: 1, maxSplitHands: 0, credits: 1000 };

// One card at a time: the next flight starts once the previous has landed and flipped.
function landNext() {
  for (let i = 0; i < 40 && !flights().some((a) => !a.fired); i++) advance(50); // the queue starts the next flight when the last is done
  const flight = flights().find((a) => !a.fired);
  act(() => { flight.fired = true; flight.onfinish(); });
  finishAnimations();
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("PlayerHand with a face-down double", () => {
  it("only the hidden card is sideways; the visible cards keep their keys and nothing flies a second time at the reveal", () => {
    const error = vi.spyOn(console, "error");
    const [six, five, king] = stackedShoe(["6", "5", "K"]);
    const down = mkHand([six, five], { isDouble: true, hiddenCards: [king], status: HandStatus.DONE, totals: [11], bet: 20 });
    const ui = (h) => <Flight><PlayerHand {...handProps} hand={h} /></Flight>;
    const { container, rerender } = renderUI(ui(down));
    settleDeal();
    const before = [...container.querySelectorAll(".fly-card")];
    expect(before).toHaveLength(3);
    expect(before.map((el) => el.style.rotate)).toEqual(["", "", "90deg"]);
    expect(before.map((el) => el.dataset.fk)).toEqual([six.id, five.id, "dbl"]);
    expect(flights()).toHaveLength(3); // each card flew once, in its first mount
    expect(error).not.toHaveBeenCalled(); // no duplicate key warning

    rerender(ui(mkHand([six, five, king], { ...down, tag: down.tag, hiddenCards: [], cards: [six, five, king] })));
    const after = [...container.querySelectorAll(".fly-card")];
    expect(after).toHaveLength(3);
    after.forEach((el, i) => expect(el).toBe(before[i])); // same elements: nothing remounted
    expect(after.map((el) => el.style.rotate)).toEqual(["", "", "90deg"]);
    expect(after.map((el) => el.dataset.fk)).toEqual([six.id, five.id, "dbl"]);
    expect(flights()).toHaveLength(3); // no second launch
    expect(container.querySelector(".flight-layer").children).toHaveLength(0);
    expect(flips()).toHaveLength(3); // the three flips so far: the two cards and the new face of the double
    expect(after[2].querySelector("img.fly-front").getAttribute("alt")).toBe("king of hearts");
    finishAnimations();
    expect(after[2].querySelector(".fly-inner").style.transform).toBe("rotateY(180deg)");
    expect(landed.ids.has(king.id)).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it("a double already face up has only its last card sideways", () => {
    const [six, five, king] = stackedShoe(["6", "5", "K"]);
    const { container } = renderUI(<Flight enabled={false}><PlayerHand {...handProps} hand={mkHand([six, five, king], { isDouble: true })} /></Flight>);
    expect([...container.querySelectorAll(".fly-card")].map((el) => el.style.rotate)).toEqual(["", "", "90deg"]);
  });
});

describe("DealerArea hole card", () => {
  it("keeps its element from face down to face up: it flips in place and does not fly again", () => {
    const [ten, ace] = stackedShoe(["10", "A"]);
    const up = { cards: [ten], dealerDisplayTotal: 10 };
    const { container, rerender } = renderUI(<Flight><DealerArea dealer={up} hiddenCount={1} /></Flight>);
    settleDeal();
    const [upEl, holeEl] = container.querySelectorAll(".fly-card");
    expect(holeEl.querySelector("img")).toBeNull();
    expect(flights()).toHaveLength(2);
    expect(live(container)).toBe("Total: 10");

    rerender(<Flight><DealerArea dealer={{ cards: [ten, ace], dealerDisplayTotal: 21, isBlackjack: true }} hiddenCount={0} /></Flight>);
    const now = container.querySelectorAll(".fly-card");
    expect([now[0], now[1]]).toEqual([upEl, holeEl]);
    expect(flights()).toHaveLength(2);
    expect(live(container)).toBe("Total: 10"); // the new card has not finished turning over
    finishAnimations();
    expect(live(container)).toBe("Total: 21 Blackjack");
  });
});

describe("totals count only cards that have landed", () => {
  it("DealerArea: '-' with none, the landed cards' total in between, the final total and labels after the last", () => {
    const dealer = { cards: stackedShoe(["10", "9"]), dealerDisplayTotal: 19, isBusted: false, isBlackjack: false };
    const { container } = renderUI(<Flight><DealerArea dealer={dealer} /></Flight>);
    expect(live(container)).toBe("Total: -");
    landNext();
    expect(live(container)).toBe("Total: 10");
    landNext();
    expect(live(container)).toBe("Total: 19");
  });

  it("PlayerHand: the labels and result wait for every card; the bet is always shown", () => {
    const cards = stackedShoe(["A", "6", "K"]);
    const h = mkHand(cards, { totals: [17], isBusted: true, result: HandResult.LOSE, status: HandStatus.DONE });
    const { container } = renderUI(<Flight><PlayerHand {...handProps} gamePhase={GamePhases.POST_ROUND} hand={h} /></Flight>);
    expect(live(container)).toBe("Total: - | Bet: $10");
    landNext();
    expect(live(container)).toBe("Total: 11 / 1 | Bet: $10"); // an ace on its own is soft
    landNext();
    expect(live(container)).toBe("Total: 17 / 7 | Bet: $10");
    landNext();
    expect(live(container)).toBe("Total: 17 | Bet: $10 Lose Busted");
  });

  it("a hand re-rendered with a card that has not landed shows the total of the landed ones", () => {
    const [ten, nine, two] = stackedShoe(["10", "9", "2"]);
    const ui = (cards, totals) => <Flight><PlayerHand {...handProps} hand={mkHand(cards, { tag: "same", totals })} /></Flight>;
    const { container, rerender } = renderUI(ui([ten, nine], [19]));
    settleDeal();
    expect(live(container)).toBe("Total: 19 | Bet: $10");
    rerender(ui([ten, nine, two], [21]));
    expect(live(container)).toBe("Total: 19 | Bet: $10"); // the hit card is on its way
    settleDeal();
    expect(live(container)).toBe("Total: 21 | Bet: $10");
  });
});

describe("useSmoothRow", () => {
  const [a, b] = stackedShoe(["5", "6"]);
  const lefts = {};
  beforeEach(() => {
    Object.keys(lefts).forEach((k) => delete lefts[k]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
      return { left: lefts[this.dataset?.fk] ?? 0, top: 0, width: 50, height: 70 };
    });
  });
  const ui = (cards, flight) => <Flight {...flight}><PlayerHand {...handProps} hand={mkHand(cards, { tag: "row" })} /></Flight>;

  it("glides a card that was already there to its new place when another joins the row", () => {
    lefts[a.id] = 100;
    const { rerender } = renderUI(ui([a]));
    settleDeal();
    rerender(ui([a])); // measured at its settled place
    expect(glides()).toHaveLength(0);
    lefts[a.id] = 60; // the row re-centres around the new card
    rerender(ui([a, b]));
    expect(glides()).toHaveLength(1);
    expect(glides()[0].frames).toEqual([{ translate: "40px 0" }, { translate: "0 0" }]);
    expect(glides()[0].options).toEqual({ duration: timing.slide, easing: EASING });
    expect(glides()[0].el.dataset.fk).toBe(a.id); // the new card does not glide: it flies
  });

  it("finishes a glide in progress before measuring, and ignores moves of a pixel or less", () => {
    lefts[a.id] = 100;
    const { rerender } = renderUI(ui([a]));
    settleDeal();
    const finish = vi.fn();
    vi.spyOn(Element.prototype, "getAnimations").mockReturnValue([{ finish }]);
    lefts[a.id] = 100.5;
    rerender(ui([a, b]));
    expect(finish).toHaveBeenCalled();
    expect(glides()).toHaveLength(0);
  });

  it("does not glide under reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    lefts[a.id] = 100;
    const { rerender } = renderUI(ui([a]));
    rerender(ui([a]));
    lefts[a.id] = 60;
    rerender(ui([a, b]));
    expect(animations).toHaveLength(0);
  });

  it("does not glide on the board's first render", () => {
    lefts[a.id] = 100;
    const { rerender } = renderUI(ui([a], { enabled: false }));
    rerender(ui([a], { enabled: false }));
    lefts[a.id] = 60;
    rerender(ui([a, b], { enabled: false }));
    expect(animations).toHaveLength(0);
  });
});

describe("GameBoard flights", () => {
  const playing = {
    phase: GamePhases.PLAYER_TURN,
    hands: [mkHand(stackedShoe(["8", "8"]), { tag: "a" })],
    dealer: { cards: stackedShoe(["10"]), dealerDisplayTotal: 10 },
    shoe: stackedShoe(["2", "3"]),
  };

  it("cards on the table at the board's first render never fly; a card added later does, at Rate of Play", () => {
    const { container, gameState, rerender } = renderUI(<GameBoard />, { game: { ...playing, settings: { ...initialGameState.settings, playTimeout: 250 } } });
    advance(5000);
    expect(animations).toHaveLength(0);
    expect(container.querySelector(".flight-layer").children).toHaveLength(0);
    Object.assign(gameState, { hands: [mkHand([...playing.hands[0].cards, ...stackedShoe(["3"])], { tag: "a" })] });
    rerender(<GameBoard />);
    advance(0);
    expect(flights()).toHaveLength(1);
    expect(flights()[0].options.duration).toBe(cardTiming(250).slide);
  });

  it("is busy while a card is on its way: the table says Dealing..., the buttons are hidden, then it frees up", () => {
    const { container } = renderUI(<GameBoard />, { game: playing });
    expect(container.querySelector(".board").classList.contains("busy")).toBe(false);
    expect(screen.getByText("Your turn!")).toBeTruthy();
    act(() => { reserve(performance.now() + 2000); });
    expect(container.querySelector(".board").classList.contains("busy")).toBe(true);
    expect(screen.getByText("Dealing...")).toBeTruthy();
    expect(screen.queryByText("Your turn!")).toBeNull();
    act(() => { reserve(performance.now() + 3000); }); // a later end replaces the check, it does not stack
    advance(2100);
    expect(container.querySelector(".board").classList.contains("busy")).toBe(true);
    advance(1000);
    expect(container.querySelector(".board").classList.contains("busy")).toBe(false);
    expect(screen.getByText("Your turn!")).toBeTruthy();
  });

  it("busy only changes the message during the player's turn", () => {
    const { container } = renderUI(<GameBoard />, { game: { ...playing, phase: GamePhases.DEALER_TURN } });
    act(() => { reserve(performance.now() + 2000); });
    expect(container.querySelector(".board").classList.contains("busy")).toBe(true);
    expect(screen.getByText("Dealer's turn...")).toBeTruthy();
  });

  it("leaving while busy stops the check (no update after unmount)", () => {
    const { unmount } = renderUI(<GameBoard />, { game: playing });
    act(() => { reserve(performance.now() + 2000); });
    unmount();
    expect(queue.listeners.size).toBe(0);
    expect(() => advance(5000)).not.toThrow();
  });

  it("clears the landed cards at PRE_DEAL", () => {
    renderUI(<GameBoard />, { game: { ...playing, phase: GamePhases.PRE_DEAL, hands: [], dealer: { cards: [] } } });
    landed.ids.add("left-over");
    const { rerender, gameState } = renderUI(<GameBoard />, { game: { ...playing, phase: GamePhases.PLAYER_TURN } });
    expect(landed.ids.has("left-over")).toBe(true);
    Object.assign(gameState, { phase: GamePhases.PRE_DEAL });
    rerender(<GameBoard />);
    expect(landed.ids.size).toBe(0);
  });

  it("keeps a hand's element when the hands before it change (hands are keyed by tag)", () => {
    const first = mkHand(stackedShoe(["8", "8"]), { tag: "a" });
    const second = mkHand(stackedShoe(["9", "9"]), { tag: "b" });
    const { container, gameState, rerender } = renderUI(<GameBoard />, { game: { ...playing, hands: [first, second] } });
    const [elA] = container.querySelectorAll(".player-hand");
    Object.assign(gameState, { hands: [second, first] });
    rerender(<GameBoard />);
    expect(container.querySelectorAll(".player-hand")[1]).toBe(elA);
  });
});
