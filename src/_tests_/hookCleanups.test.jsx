import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { renderUI } from "./testUtils";
import GameBoard from "../components/GameBoard/GameBoard";
import { useSeatsScroll } from "../hooks/useSeatsScroll";
import { queue } from "../utils/cardAnimation";
import { mirrorCheck, PEEK as PEEK_MS } from "../utils/cardFx";
import { stackedShoe, outOfCards } from "../utils/_tests_/stackedShoe";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import { gameReducer, initialGameState } from "../utils/gameReducer";

// Hook cleanups #145 (usePeek: one run per phase change, a backstop hold) and #140 (layout reads only when the layout changed).
vi.mock("../utils/cardFx", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, mirrorCheck: vi.fn(real.mirrorCheck) };
});

const CHECK = PEEK_MS.up + PEEK_MS.hold + PEEK_MS.down; // x k, k = 1 at the default Rate of Play
const TOTAL = CHECK + 200 + 500; // usePeek: reveal (check + AFTER_CHECK) + SHOW_CLEAR, no blackjack
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const step = (s, a) => gameReducer(s, { refill: outOfCards, credits: 1000, ...a });
const dealing = (hole = "9") => { // US peek, a ten up: the check is a display hold from DEALING to the player's turn
  const cards = stackedShoe(["10", "K", "6", hole]);
  return [{ type: "ADD_BET", amount: 10 }, { type: "DEAL" }].reduce(step, step(initialGameState, { type: "START_GAME", shoe: cards }));
};

beforeEach(() => { vi.useFakeTimers(); mirrorCheck.mockClear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("#145 usePeek", () => {
  it("backstop: if the check's own end timer never fires (a throttled tab), the hold still lets go at total + 1500 ms", () => {
    const s = dealing();
    const { gameState, rerender, container } = renderUI(<GameBoard />, { game: s });
    // Swallow the one timer that ends the check (delay TOTAL); every other timer, the backstop included, runs on the fake clock as usual.
    const fake = globalThis.setTimeout;
    const swallowed = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, ms, ...args) => {
      if (ms === TOTAL) { swallowed.push(fn); return 0; }
      return fake(fn, ms, ...args);
    });
    Object.assign(gameState, step(s, { type: "DEAL_DONE" }));
    rerender(<GameBoard />);
    expect(swallowed).toHaveLength(1);
    expect(queue.holds.size).toBe(1);
    expect(container.querySelector(".board").classList.contains("busy")).toBe(true);
    advance(TOTAL + 1500 - 1);
    expect(queue.holds.size).toBe(1); // the end timer is gone: only the backstop is left, and it has not run yet
    advance(1);
    expect(queue.holds.size).toBe(0);
    expect(container.querySelector(".board").classList.contains("busy")).toBe(false);
  });

  describe("the effect runs once per phase change", () => {
    const peeking = () => {
      const s = dealing();
      const r = renderUI(<GameBoard />, { game: s });
      return { s, ...r };
    };

    it("a re-render with the phase unchanged but speed, round and dealer changed does not start another check", () => {
      const { s, gameState, rerender } = peeking();
      expect(mirrorCheck).not.toHaveBeenCalled(); // DEALING: nothing to check yet
      Object.assign(gameState, step(s, { type: "DEAL_DONE" }));
      rerender(<GameBoard />);
      expect(mirrorCheck).toHaveBeenCalledTimes(1);
      advance(100);
      gameState.settings = { ...gameState.settings, playTimeout: 500 }; // speed
      gameState.nextHandTag = 99; // round
      gameState.dealer = { ...gameState.dealer }; // dealer
      rerender(<GameBoard />);
      gameState.dealerHole = { ...gameState.dealerHole, cards: [...gameState.dealerHole.cards] };
      rerender(<GameBoard />);
      expect(mirrorCheck).toHaveBeenCalledTimes(1);
      expect(queue.holds.size).toBe(1); // the first check is still running, not cancelled and restarted
    });

    it("a phase change calls it once, and nothing else does while the phase stays", () => {
      const { s, gameState, rerender } = peeking();
      rerender(<GameBoard />);
      expect(mirrorCheck).toHaveBeenCalledTimes(0);
      Object.assign(gameState, step(s, { type: "DEAL_DONE" })); // DEALING -> PLAYER_TURN
      expect(gameState.phase).toBe(GamePhases.PLAYER_TURN);
      rerender(<GameBoard />);
      rerender(<GameBoard />);
      expect(mirrorCheck).toHaveBeenCalledTimes(1);
      advance(TOTAL + 100);
      expect(mirrorCheck).toHaveBeenCalledTimes(1);
    });
  });
});

describe("#140 layout reads only when the layout changed", () => {
  const size = (w, h) => {
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(w);
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(h);
  };
  let n = 0;
  const hand = (codes = ["8", "3"]) => ({ tag: `h${n++}`, cards: stackedShoe(codes), hiddenCards: [], bet: 10, status: HandStatus.PLAYING, result: HandResult.NONE, totals: [11], total: 11 });
  const table = (hands) => ({ phase: GamePhases.PLAYER_TURN, hands, dealer: { cards: stackedShoe(["10"]), dealerDisplayTotal: 10 }, shoe: stackedShoe(["2", "3"]) });
  // The reads of the two hooks: useSeatsScroll's row (.seats) and centrePrint's text boxes (also reached through the felt print's onDraw).
  const reads = (spy) => ({
    seats: spy.mock.contexts.filter((el) => el.classList?.contains("seats")).length,
    print: spy.mock.contexts.filter((el) => el.closest?.(".print") && el.tagName.toLowerCase() === "text").length,
  });

  it("a plain re-render reads nothing; a card-count change reads the seats and the print", () => {
    vi.useRealTimers();
    size(400, 82); // gives the felt print a box, so centrePrint has text to measure
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect");
    const hands = [hand(), hand()];
    const { gameState, rerender } = renderUI(<GameBoard />, { game: table(hands) });
    expect(reads(spy).seats).toBeGreaterThan(0); // mounted: measured
    expect(reads(spy).print).toBeGreaterThan(0);
    spy.mockClear();
    rerender(<GameBoard />);
    rerender(<GameBoard />);
    expect(reads(spy)).toEqual({ seats: 0, print: 0 });
    gameState.hands = [{ ...hands[0], cards: stackedShoe(["8", "3", "2"]) }, hands[1]]; // a card was added
    rerender(<GameBoard />);
    const after = reads(spy);
    expect(after.seats).toBeGreaterThan(0);
    expect(after.print).toBeGreaterThan(0);
  });

  it("the felt print is memoized: unchanged settings do not redraw it, changed settings do", () => {
    vi.useRealTimers();
    size(400, 82);
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect");
    const { gameState, rerender } = renderUI(<GameBoard />, { game: table([hand(), hand()]) });
    spy.mockClear();
    rerender(<GameBoard />);
    expect(reads(spy).print).toBe(0);
    gameState.settings = { ...gameState.settings }; // a new settings object: the print draws again and centres the block (layout key unchanged)
    rerender(<GameBoard />);
    expect(reads(spy).print).toBeGreaterThan(0);
    expect(reads(spy).seats).toBe(0);
  });
});

describe("#140 useSeatsScroll decisions", () => {
  // A row of `count` hands; a hand spills past the row's edge while `spill.on`.
  const spill = { on: false };
  let observe;
  let width = 400;
  const Harness = ({ count, layoutKey = "k" }) => {
    const seatsRef = useRef(null);
    const stageRef = useRef(null);
    const scroll = useSeatsScroll(seatsRef, stageRef, count, 0, layoutKey);
    return (
      <div ref={stageRef}>
        <div ref={seatsRef} data-scroll={scroll}>
          {Array.from({ length: count }, (_, i) => <div key={i} className="hand" />)}
        </div>
      </div>
    );
  };
  const on = (c) => c.querySelector("[data-scroll]").dataset.scroll === "true";

  beforeEach(() => {
    vi.useRealTimers();
    spill.on = false;
    width = 400;
    vi.stubGlobal("ResizeObserver", class { constructor(cb) { observe = cb; } observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function box() {
      const hand = this.classList.contains("hand");
      return { left: 0, top: 0, bottom: 10, width: hand ? 50 : 100, height: 10, right: hand && spill.on ? 9999 : 100 };
    });
  });

  it("count 5 turns scrolling on without a measure; back to 4 (fitting) turns it off", () => {
    const { container, rerender } = render(<Harness count={5} />);
    expect(on(container)).toBe(true);
    rerender(<Harness count={4} />);
    expect(on(container)).toBe(false);
  });

  it("fall-through: a new hand count whose decision leaves scroll unchanged still measures in that pass (2 -> 3 turns it on)", () => {
    const { container, rerender } = render(<Harness count={2} />);
    expect(on(container)).toBe(false);
    spill.on = true;
    rerender(<Harness count={3} />); // 3 > 4 is false and scroll is false: no state change, so only the same-pass measure can see the spill
    expect(on(container)).toBe(true);
  });

  it("fall-through: a width change (the stage resized) with overflowing seats turns scrolling on", () => {
    const { container } = render(<Harness count={3} />);
    expect(on(container)).toBe(false);
    spill.on = true;
    width = 800;
    act(() => observe());
    expect(on(container)).toBe(true);
  });

  it("the first render with a spilling row of three turns scrolling on at once", () => {
    spill.on = true;
    const { container } = render(<Harness count={3} />);
    expect(on(container)).toBe(true);
  });

  it("once on within a count@width pair it is not turned off, even when the layout key changes and the row fits again", () => {
    spill.on = true;
    const { container, rerender } = render(<Harness count={3} />);
    expect(on(container)).toBe(true);
    spill.on = false;
    rerender(<Harness count={3} layoutKey="other" />);
    rerender(<Harness count={3} layoutKey="again" />);
    expect(on(container)).toBe(true);
    rerender(<Harness count={4} layoutKey="again" />); // a new pair is decided afresh: it fits
    expect(on(container)).toBe(false);
  });

  it("a one-hand row is never measured", () => {
    spill.on = true;
    const { container } = render(<Harness count={1} />);
    expect(on(container)).toBe(false);
  });
});
