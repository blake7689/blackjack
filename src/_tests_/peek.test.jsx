import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderUI, finishAnimations } from "./testUtils";
import { animations } from "./setup";
import GameBoard from "../components/GameBoard/GameBoard";
import { queue } from "../utils/cardAnimation";
import { PEEK as PEEK_MS } from "../utils/cardFx";
import { stackedShoe, outOfCards } from "../utils/_tests_/stackedShoe";
import { DealerHoleOptions } from "../utils/constants/dealerHoleOptions";
import { GamePhases } from "../utils/constants/gamePhases";
import { gameReducer, initialGameState } from "../utils/gameReducer";

// The peek check (#83): in US peek mode with an ace or a ten up, the hole card slides up under the felt's edge (the mirror check) and back, then the result
// shows before the player acts: "No blackjack", or the hole card flips and the dealer's blackjack shows. Two paths: with an offer, the PEEK step after
// OFFERS; with none (a ten up on the Vegas table) a display hold after the deal, and a round that offers nothing gains no reducer step. The hole card's
// face never reaches the DOM before the result. Nothing at all in no-peek or EU modes.
const { DEALING, PLAYER_TURN, DEALER_TURN, PEEK } = GamePhases;
const UP = PEEK_MS.up, HOLD = PEEK_MS.hold, DOWN = PEEK_MS.down;
const CHECK = UP + HOLD + DOWN; // x k
const AFTER = 200, CLEAR = 500; // usePeek: the pause before the result, and how long "No blackjack" shows
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const line = () => document.querySelector(".msg").textContent;
const hole = () => document.querySelector('.dealer-hand [data-fk="hole"] .card');
const mirror = () => animations.filter((a) => a.el === hole() && a.frames.every((f) => "translate" in f));
const step = (s, a) => gameReducer(s, { refill: outOfCards, credits: 1000, ...a });
const faces = () => [...document.querySelectorAll(".dealer-hand img.fly-front")].map((i) => i.getAttribute("alt"));

// A real table: [your first card, dealer up, your second, dealer hole]. The hole card is a spade with a unique id, so a leak is easy to find.
function table(codes, actions, settings = {}) {
  const cards = stackedShoe(codes);
  cards[3] = { ...cards[3], suit: "spades", id: `secret-${cards[3].rank}-spades` };
  let s = step(initialGameState, { type: "START_GAME", shoe: cards });
  for (const [key, value] of Object.entries(settings)) s = step(s, { type: "SET_SETTING", key, value });
  return [{ type: "ADD_BET", amount: 10 }, ...actions.map((type) => ({ type }))].reduce(step, s);
}
const noLeak = (container, rank) => {
  expect(container.innerHTML).not.toContain(`secret-${rank}`);
  expect(container.innerHTML).not.toMatch(new RegExp(`${rank} of spades`, "i"));
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("with an offer: the PEEK step after OFFERS", () => {
  const peeking = (hole) => table(["10", "A", "6", hole], ["DEAL", "DEAL_DONE", "DECLINE_OFFERS"]);

  it("no blackjack: the hole card slides up, holds and slides back (420k, 450k, 420k) with nothing of it in the page; then 'No blackjack'; then it lets go", () => {
    const s = peeking("9");
    expect(s.phase).toBe(PEEK);
    const { container } = renderUI(<GameBoard />, { game: s });
    expect(line()).toBe("Dealer checks for blackjack"); // already on the line
    const [out, back] = mirror();
    expect(out.options.duration).toBe(UP);
    expect(back.options).toMatchObject({ duration: DOWN, delay: UP + HOLD });
    expect(queue.holds.size).toBe(1);
    expect(hole().querySelector("img")).toBeNull(); // a back, no face
    noLeak(container, "9");
    advance(CHECK + AFTER - 1);
    expect(line()).toBe("Dealer checks for blackjack");
    advance(1); // the result
    expect(line()).toBe("No blackjack");
    noLeak(container, "9");
    advance(CLEAR - 1);
    expect(line()).toBe("No blackjack");
    expect(queue.holds.size).toBe(1);
    advance(1); // it is over
    expect(line()).toBe("Dealer checks for blackjack"); // the phase's own words again (the provider's PEEK step moves on)
    expect(queue.holds.size).toBe(0);
  });

  it("blackjack: the same check; at the result no 'No blackjack' is shown (the hole card flips and the blackjack shows when the peek lands) and it lets go", () => {
    const s = peeking("K");
    const { container, gameState, rerender } = renderUI(<GameBoard />, { game: s });
    noLeak(container, "king");
    advance(CHECK + AFTER);
    expect(line()).toBe("Dealer checks for blackjack"); // never "No blackjack"
    expect(queue.holds.size).toBe(0); // the check is over: the next step may go
    advance(CLEAR + 100);
    expect(line()).not.toBe("No blackjack");
    Object.assign(gameState, step(s, { type: "PEEK" })); // the provider's step
    rerender(<GameBoard />);
    expect(gameState.dealer.isBlackjack).toBe(true);
    expect(screen.getByAltText("king of spades")).toBeTruthy(); // the hole card's face, now
  });

  it("is the same animation whether or not the dealer has blackjack, so it tells nothing", () => {
    const record = (hole) => {
      animations.length = 0;
      const { unmount } = renderUI(<GameBoard />, { game: peeking(hole) });
      const seen = mirror().map((a) => [a.options.duration, a.options.delay, a.options.easing, JSON.stringify(a.frames)]);
      unmount();
      return seen;
    };
    const blackjack = record("K");
    expect(blackjack).toHaveLength(2);
    expect(record("9")).toEqual(blackjack);
  });

  it("follows Game speed (k = Rate of Play / 1000)", () => {
    const s = { ...peeking("9"), settings: { ...peeking("9").settings, playTimeout: 500 } };
    renderUI(<GameBoard />, { game: s });
    const [out, back] = mirror();
    expect([out.options.duration, back.options.duration, back.options.delay]).toEqual([UP * 0.5, DOWN * 0.5, (UP + HOLD) * 0.5]);
    advance(CHECK * 0.5 + AFTER);
    expect(line()).toBe("No blackjack");
    advance(CLEAR);
    expect(queue.holds.size).toBe(0);
  });

  it("is cancelled with its hold when the phase moves on first (the step came, or the player left)", () => {
    const s = peeking("9");
    const { gameState, rerender } = renderUI(<GameBoard />, { game: s });
    advance(300);
    expect(queue.holds.size).toBe(1);
    Object.assign(gameState, step(s, { type: "PEEK" }));
    rerender(<GameBoard />);
    expect(queue.holds.size).toBe(0);
    expect(mirror().every((a) => a.cancelled)).toBe(true);
    expect(line()).not.toBe("No blackjack");
    advance(5000);
    expect(line()).not.toBe("No blackjack"); // the timers died with it
  });

  it("reduced motion: no animation and no hold, and the result is there at once", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = renderUI(<GameBoard />, { game: peeking("9") });
    expect(mirror()).toHaveLength(0);
    expect(queue.holds.size).toBe(0);
    expect(queue.free).toBe(0);
    noLeak(container, "9");
  });
});

describe("with no offer: a ten up on the Vegas table peeks inside the deal, and the check is a display hold after the cards land", () => {
  const dealing = (hole) => table(["10", "K", "6", hole], ["DEAL"]);

  it("the deal needs no extra reducer step: DEALING goes to the player's turn with the same state it always had", () => {
    const s = dealing("9");
    expect(s.phase).toBe(DEALING);
    expect(s.offers).toBeNull();
    expect(step(s, { type: "DEAL_DONE" }).phase).toBe(PLAYER_TURN); // no PEEK or OFFERS phase in between
  });

  it("no blackjack: after the cards land the check plays, the keys wait through it, then 'No blackjack' and play starts", () => {
    const s = dealing("9");
    const { container, gameState, rerender } = renderUI(<GameBoard />, { game: s });
    expect(mirror()).toHaveLength(0); // nothing while the cards are still dealt
    Object.assign(gameState, step(s, { type: "DEAL_DONE" }));
    rerender(<GameBoard />);
    expect(gameState.phase).toBe(PLAYER_TURN);
    expect(line()).toBe("Dealer checks for blackjack");
    expect(mirror()).toHaveLength(2);
    expect(queue.holds.size).toBe(1);
    expect(screen.getByRole("button", { name: "Hit" }).getAttribute("aria-disabled")).toBe("true"); // the player cannot act yet
    noLeak(container, "9");
    advance(CHECK + AFTER);
    expect(line()).toBe("No blackjack");
    advance(CLEAR + 200);
    expect(line()).not.toBe("No blackjack");
    expect(queue.holds.size).toBe(0);
    expect(screen.getByRole("button", { name: "Hit" }).getAttribute("aria-disabled")).not.toBe("true");
  });

  it("blackjack: the hole card stays face down through the check, then flips, and 'No blackjack' is never shown", () => {
    const s = dealing("A");
    expect(s.dealer.isBlackjack).toBe(true); // the engine knows at the deal
    const { container, gameState, rerender } = renderUI(<GameBoard />, { game: s });
    expect(faces()).toEqual(["king of hearts"]); // the up card only; the hole card is held back as a back
    noLeak(container, "ace");
    Object.assign(gameState, step(s, { type: "DEAL_DONE" }));
    rerender(<GameBoard />);
    expect(gameState.phase).toBe(DEALER_TURN);
    expect(mirror()).toHaveLength(2); // the same check
    expect(line()).toBe("Dealer checks for blackjack");
    advance(CHECK + AFTER - 1);
    expect(faces()).toEqual(["king of hearts"]); // still nothing of it
    noLeak(container, "ace");
    advance(1); // the result: the hole card turns over
    expect(screen.getByAltText("ace of spades")).toBeTruthy();
    advance(CLEAR + 200);
    expect(line()).not.toBe("No blackjack");
    finishAnimations(); // the hole card's own flip (#6) holds the board until the browser says it is done
    expect(queue.holds.size).toBe(0);
  });

  it("is the same animation with or without a blackjack", () => {
    const record = (hole) => {
      animations.length = 0;
      const s = dealing(hole);
      const { gameState, rerender, unmount } = renderUI(<GameBoard />, { game: s });
      Object.assign(gameState, step(s, { type: "DEAL_DONE" }));
      rerender(<GameBoard />);
      const seen = mirror().map((a) => [a.options.duration, a.options.delay, a.options.easing, JSON.stringify(a.frames)]);
      unmount();
      return seen;
    };
    const blackjack = record("A");
    expect(blackjack).toHaveLength(2);
    expect(record("9")).toEqual(blackjack);
  });

  it("reduced motion: the blackjack's hole card shows its face at once, with no hold", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const s = dealing("A");
    const { gameState, rerender } = renderUI(<GameBoard />, { game: s });
    Object.assign(gameState, step(s, { type: "DEAL_DONE" }));
    rerender(<GameBoard />);
    expect(mirror()).toHaveLength(0);
    expect(queue.holds.size).toBe(0);
    expect(screen.getByAltText("ace of spades")).toBeTruthy();
  });

  it("a board that opens after the deal (back from Settings) has nothing to wait for: the face shows and nothing plays", () => {
    const s = step(dealing("A"), { type: "DEAL_DONE" });
    renderUI(<GameBoard />, { game: s });
    expect(screen.getByAltText("ace of spades")).toBeTruthy();
    expect(mirror()).toHaveLength(0);
    expect(queue.holds.size).toBe(0);
  });
});

describe("nothing is shown where there is no check", () => {
  const settle = (codes, settings) => {
    const s = table(codes, ["DEAL"], settings);
    const { gameState, rerender } = renderUI(<GameBoard />, { game: s });
    Object.assign(gameState, step(s, { type: "DEAL_DONE" }));
    rerender(<GameBoard />);
    return gameState;
  };
  const quiet = () => {
    expect(mirror()).toHaveLength(0);
    expect(queue.holds.size).toBe(0);
    expect(screen.queryByText(/Dealer checks|No blackjack/)).toBeNull();
  };

  it("US no peek, a ten up", () => {
    settle(["10", "K", "6", "9"], { dealerHoleBehaviour: DealerHoleOptions.US_NO_PEEK });
    quiet();
  });

  it("EU, a ten up", () => {
    settle(["10", "K", "6", "9"], { dealerHoleBehaviour: DealerHoleOptions.EU });
    quiet();
  });

  it("US peek, but a card that is not an ace or a ten up", () => {
    settle(["10", "7", "6", "9"]);
    quiet();
  });

  it("EU or no peek never reaches the PEEK phase, and an ace up only asks the offers", () => {
    const s = table(["10", "A", "6", "9"], ["DEAL", "DEAL_DONE"], { dealerHoleBehaviour: DealerHoleOptions.US_NO_PEEK });
    expect(s.phase).not.toBe(PEEK);
    renderUI(<GameBoard />, { game: s });
    quiet();
  });
});
