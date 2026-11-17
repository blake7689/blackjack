import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderUI } from "./testUtils";
import { animations } from "./setup";
import GameBoard from "../components/GameBoard/GameBoard";
import ShuffleFx from "../components/GameBoard/ShuffleFx";
import { queue } from "../utils/cardAnimation";
import { stackedShoe, outOfCards } from "../utils/_tests_/stackedShoe";
import { GamePhases } from "../utils/constants/gamePhases";
import { gameReducer, initialGameState } from "../utils/gameReducer";

// The shuffle (#83, DESIGN section 3): in the centre, in order, nothing fading: the shoe slides away, the deck comes down, riffles, goes up, the shoe
// slides back (shoe 780k, down 620k, riffle 1700k, up 560k, shoe 780k: about 4.5 s at Normal, 1.5 s on Very fast). A tap on the table or the dock skips
// it. It holds the board busy until it ends, is skipped or times out. The mid-round refill plays it short (k 0.35) and keeps the cards on the table.
const { PRE_DEAL, PLAYER_TURN } = GamePhases;
const AWAY = 800, DOWN = 620, RIFFLE = 1700, UP = 560, BACK = 800;
const TOTAL = AWAY + DOWN + RIFFLE + UP + BACK; // x k
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settings = (playTimeout) => ({ ...initialGameState.settings, playTimeout });
const board = (game = {}, opts = {}) => renderUI(<GameBoard />, { game: { phase: PRE_DEAL, ...game }, ...opts });
const line = () => document.querySelector(".msg").textContent;
const riffle = () => document.querySelector(".riffle");
const stage = () => document.querySelector(".stage-in");
const shoe = () => document.querySelector(".shoe");
const rcards = () => animations.filter((a) => a.el.classList.contains("rcard"));
const ofEl = (el) => animations.filter((a) => a.el === el).map((a) => a.options.duration);
const shuffling = () => screen.queryByRole("button", { name: "Shuffling" }) !== null;

const step = (s, a) => gameReducer(s, { refill: outOfCards, credits: 1000, ...a });
// A table in the player's turn (a ten and a six against a seven), so there are cards on it.
const midRound = () => [{ type: "ADD_BET", amount: 10 }, { type: "DEAL" }, { type: "DEAL_DONE" }].reduce(step, step(initialGameState, { type: "START_GAME", shoe: stackedShoe(["10", "7", "6", "9"]) }));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("the shuffle plays when the board opens at the start of a round (#83)", () => {
  it("in order at Normal speed: the shoe slides away, the deck comes down, riffles, goes up, the shoe slides back, about 4.5 s; nothing fades", async () => {
    board();
    expect(line()).toBe("Shuffling");
    expect(shuffling()).toBe(true); // the Deal key says it too
    expect(screen.getByRole("button", { name: "Shuffling" }).getAttribute("aria-disabled")).toBe("true");
    expect(shoe().classList.contains("shuffling")).toBe(true); // 1: the shoe slides away
    expect(stage().style.getPropertyValue("--shoe-t")).toBe("780ms");
    expect(riffle()).toBeNull();
    expect(queue.holds.size).toBe(1); // the board is held for it
    expect(queue.gate - performance.now()).toBeGreaterThanOrEqual(TOTAL);

    await tick(AWAY - 1);
    expect(riffle()).toBeNull();
    await tick(1); // 2: the deck comes down into the centre
    expect(riffle().getAttribute("aria-hidden")).toBe("true");
    expect(riffle().querySelectorAll(".rcard")).toHaveLength(14);
    expect(ofEl(riffle())).toEqual([DOWN]);
    expect(rcards()).toHaveLength(0);

    await tick(DOWN); // 3: it riffles
    expect(rcards()).toHaveLength(14);
    expect(rcards().every((a) => a.options.duration === RIFFLE)).toBe(true);
    expect(ofEl(riffle())).toEqual([DOWN]);

    await tick(RIFFLE); // 4: it goes back up off the top
    expect(ofEl(riffle())).toEqual([DOWN, UP]);
    expect(shoe().classList.contains("shuffling")).toBe(true);

    await tick(UP); // 5: the shoe slides back
    expect(riffle()).toBeNull();
    expect(shoe().classList.contains("shuffling")).toBe(false);
    expect(line()).toBe("Shuffling");
    await tick(BACK - 1);
    expect(shuffling()).toBe(true);
    await tick(1);
    expect(line()).not.toBe("Shuffling");
    expect(shuffling()).toBe(false);
    expect(queue.holds.size).toBe(0); // the hold is released ...
    expect(queue.free).toBe(0); // ... and the time it reserved given back
    expect(stage().style.getPropertyValue("--shoe-t")).toBe("");
    expect(animations.every((a) => a.frames.every((f) => !("opacity" in f)))).toBe(true); // nothing fades
  });

  it.each([[500, 0.5], [250, 0.33], [5000, 1.2]])("follows Game speed: Rate of Play %i ms is k = %f (clamped 0.33 to 1.2)", async (playTimeout, k) => {
    board({ settings: settings(playTimeout) });
    expect(stage().style.getPropertyValue("--shoe-t")).toBe(`${Math.round(780 * k)}ms`);
    await tick(AWAY * k + 5);
    expect(ofEl(riffle())).toEqual([DOWN * k]);
    await tick(DOWN * k);
    expect(rcards()[0].options.duration).toBe(RIFFLE * k);
    await tick(RIFFLE * k);
    expect(ofEl(riffle())).toEqual([DOWN * k, UP * k]);
    await tick(TOTAL * k - (AWAY + DOWN + RIFFLE) * k - 30); // just before the end
    expect(shuffling()).toBe(true);
    await tick(40);
    expect(shuffling()).toBe(false);
  });

  it("Very fast really is about 1.5 s", async () => {
    board({ settings: settings(250) });
    await tick(1400);
    expect(shuffling()).toBe(true);
    await tick(150);
    expect(shuffling()).toBe(false);
  });

  it("the pile still shows what it held while it is slid away, and is emptied when the deck comes down", async () => {
    const { gameState, rerender } = board({ settings: { ...initialGameState.settings, deckCount: 1 }, shoe: stackedShoe(Array(30).fill("7")), seenIds: ["seen"], shoeSeq: 0 });
    expect(document.querySelector(".discard").dataset.lv).toBe("2"); // 22 cards in the pile
    expect(shuffling()).toBe(false);
    Object.assign(gameState, { shoe: stackedShoe(Array(52).fill("7")), seenIds: [], shoeSeq: 1 }); // a new shoe: the pile is empty in the state
    rerender(<GameBoard />);
    expect(shuffling()).toBe(true);
    expect(document.querySelector(".discard").classList.contains("away")).toBe(true);
    expect(document.querySelector(".discard").classList.contains("empty")).toBe(false);
    expect(document.querySelector(".discard").dataset.lv).toBe("2"); // still the cards it held
    await tick(AWAY);
    expect(document.querySelector(".discard").classList.contains("empty")).toBe(true); // emptied behind the sliding shoe
    await tick(TOTAL);
    expect(document.querySelector(".discard").classList.contains("away")).toBe(false);
  });

  it("does not play on a board that opens mid-game (a table with cards seen), nor under a new round of the same shoe", async () => {
    board({ seenIds: ["seen"] });
    expect(shuffling()).toBe(false);
    expect(line()).toBe("Place your bets");
    expect(queue.holds.size).toBe(0);
    await tick(10);
    expect(riffle()).toBeNull();
  });

  it("plays again whenever a new shoe is made (the cut card, a changed table rule)", async () => {
    const { gameState, rerender } = board({ seenIds: ["seen"], shoeSeq: 3 });
    expect(shuffling()).toBe(false);
    Object.assign(gameState, { shoeSeq: 4, seenIds: [] });
    rerender(<GameBoard />);
    expect(line()).toBe("Shuffling");
    await tick(TOTAL + 5);
    expect(line()).toBe("Place your bets");
    Object.assign(gameState, { shoeSeq: 4 }); // the same shoe again: nothing
    rerender(<GameBoard />);
    expect(shuffling()).toBe(false);
  });

  it("reduced motion: no shuffle, no hold, no reserved time", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    board();
    expect(shuffling()).toBe(false);
    expect(line()).toBe("Place your bets");
    expect(riffle()).toBeNull();
    expect(queue.holds.size).toBe(0);
    expect(queue.free).toBe(0);
    await tick(10);
    expect(animations).toHaveLength(0);
  });

  it("does nothing without a table to play on (no stage)", () => {
    const set = vi.fn();
    render(<ShuffleFx set={set} seq={1} mid={false} speed={1000} enter pile={0} />);
    expect(set).not.toHaveBeenCalled();
    expect(queue.holds.size).toBe(0);
  });
});

describe("a tap skips the shuffle", () => {
  // Every animation made while the shuffle plays gets a spy: a skip must jump each one to its end.
  function spyOnFinish() {
    const animate = Element.prototype.animate;
    const spies = [];
    vi.spyOn(Element.prototype, "animate").mockImplementation(function (...args) {
      const anim = animate.apply(this, args);
      anim.finish = vi.fn();
      spies.push(anim.finish);
      return anim;
    });
    return spies;
  }

  it("a tap on the table jumps every move to its end, ends the shuffle at once and sends nothing to the game", async () => {
    const spies = spyOnFinish();
    const { gameActions } = board();
    await tick(AWAY + DOWN); // the deck is riffling
    expect(spies).toHaveLength(15); // the box and its 14 cards
    expect(spies.some((s) => s.mock.calls.length)).toBe(false);
    fireEvent.click(screen.getByRole("region", { name: "Your seats" })); // on the felt
    expect(spies.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(stage().style.getPropertyValue("--shoe-t")).toBe("0ms"); // the shoe's own slide jumps too
    await tick(0); // the steps that are left run through without waiting
    expect(shuffling()).toBe(false);
    expect(line()).toBe("Place your bets");
    expect(riffle()).toBeNull();
    expect(queue.holds.size).toBe(0);
    expect(Object.values(gameActions).every((fn) => !fn.mock.calls.length)).toBe(true); // the order of the shoe stays
  });

  it("a tap on the dock skips it too", async () => {
    board();
    await tick(100);
    fireEvent.click(screen.getByRole("button", { name: "Shuffling" })); // a key in the dock
    await tick(0);
    expect(shuffling()).toBe(false);
    expect(queue.holds.size).toBe(0);
  });

  it("a tap before the deck is down skips the moves that are still to come", async () => {
    const spies = spyOnFinish();
    board();
    await tick(50);
    expect(spies).toHaveLength(0);
    fireEvent.click(screen.getByRole("region", { name: "Your seats" }));
    await tick(0);
    expect(spies.length).toBe(16); // the box down, 14 cards, the box up: made after the tap, each jumped to its end at once
    expect(spies.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(shuffling()).toBe(false);
  });

  it("a tap anywhere else (the top bar) does not", async () => {
    board();
    await tick(100);
    fireEvent.click(document.querySelector("header.top"));
    await tick(AWAY);
    expect(shuffling()).toBe(true);
    expect(riffle()).not.toBeNull(); // still playing
  });

  it("a tap after it ended does nothing, and the listener is gone", async () => {
    const remove = vi.spyOn(document, "removeEventListener");
    board();
    await tick(TOTAL + 5);
    expect(remove).toHaveBeenCalledWith("click", expect.any(Function), true);
    fireEvent.click(screen.getByRole("region", { name: "Your seats" }));
    expect(shuffling()).toBe(false);
  });
});

describe("the mid-round refill (Include cut card off) is the same shuffle, short, and the cards stay", () => {
  it("plays at k 0.35 (about 1.6 s) with Shuffling on the message line; the hands on the table stay; dealing goes on after it", async () => {
    const { gameState, rerender } = board(midRound());
    expect(gameState.phase).toBe(PLAYER_TURN);
    expect(shuffling()).toBe(false);
    const cards = () => screen.getAllByRole("group").map((g) => g.getAttribute("aria-label")).filter((l) => /^(Dealer|Hand)/.test(l));
    const before = cards();
    expect(before.length).toBe(2);
    Object.assign(gameState, { shoeSeq: gameState.shoeSeq + 1, shoeMid: true }); // the shoe ran out
    rerender(<GameBoard />);
    expect(line()).toBe("Shuffling");
    expect(cards()).toEqual(before); // nothing leaves the table
    expect(queue.holds.size).toBe(1);
    const t0 = performance.now();
    expect(queue.gate - t0).toBeGreaterThanOrEqual(TOTAL * 0.35); // the cards that arrive now wait for it ...
    expect(queue.gate - t0).toBeLessThan(TOTAL); // ... a short one
    await tick(AWAY * 0.35 + 5);
    expect(ofEl(riffle())).toEqual([DOWN * 0.35]);
    await tick(TOTAL * 0.35 - AWAY * 0.35);
    expect(line()).not.toBe("Shuffling");
    expect(cards()).toEqual(before);
    expect(queue.holds.size).toBe(0); // the next step, manual or automatic, may go
    expect(Math.round(performance.now() - t0)).toBeLessThan(1700);
  });

  it("is never a first-render shuffle: opening on a round in progress plays nothing", () => {
    board(midRound());
    expect(shuffling()).toBe(false);
    expect(queue.holds.size).toBe(0);
  });
});

describe("a background tab never leaves the board busy", () => {
  it("the shuffle lets go on its own when its steps never come (timers throttled): by total + 1.2 s, with the hold itself timed out at total + 1.5 s", async () => {
    board();
    expect(queue.holds.size).toBe(1);
    await act(async () => { vi.advanceTimersByTime(TOTAL + 1200); }); // all at once: the first step's continuation never got to run
    expect(shuffling()).toBe(false);
    expect(queue.holds.size).toBe(0);
    expect(queue.free).toBe(0);
    await tick(10); // the late steps find it over and do nothing
    expect(riffle()).toBeNull();
  });

  it("leaving the table mid-shuffle releases the hold and the reserved time, whichever step it was at", async () => {
    for (const at of [100, AWAY + 100, AWAY + DOWN + 100, AWAY + DOWN + RIFFLE + 100, AWAY + DOWN + RIFFLE + UP + 100]) {
      const { unmount } = board();
      await tick(at);
      expect(queue.holds.size).toBe(1);
      unmount();
      expect(queue.holds.size).toBe(0);
      expect(queue.free).toBe(0);
      await tick(TOTAL); // the steps still to come stop, and nothing complains
      expect(riffle()).toBeNull();
    }
  });

  it("a newer shoe while one is shuffling starts that one over, with one hold and one reserved time", async () => {
    const { gameState, rerender } = board();
    await tick(500);
    Object.assign(gameState, { shoeSeq: 1, seenIds: [] });
    rerender(<GameBoard />);
    expect(line()).toBe("Shuffling");
    expect(queue.holds.size).toBe(1);
    expect(document.querySelectorAll(".riffle")).toHaveLength(0); // it began again from the shoe sliding away
    await tick(AWAY + 5);
    expect(document.querySelectorAll(".riffle")).toHaveLength(1);
    await tick(TOTAL);
    expect(line()).toBe("Place your bets");
    expect(queue.holds.size).toBe(0);
  });
});

describe("StrictMode's second effect run", () => {
  const harness = (props) => (
    <StrictMode><div className="stage-in" /><ShuffleFx set={set} seq={0} mid={false} speed={1000} enter={false} pile={0} {...props} /></StrictMode>
  );
  const set = vi.fn();
  beforeEach(() => set.mockClear());

  it("a board that opens mid-game plays nothing, however many times the effect runs", () => {
    render(harness());
    expect(set).not.toHaveBeenCalled();
    expect(queue.holds.size).toBe(0);
  });

  it("a board that opens at the start of a round plays one shuffle: the cancelled first run lets go and the second one holds, and it ends", async () => {
    render(harness({ enter: true }));
    expect(queue.holds.size).toBe(1);
    expect(set).toHaveBeenLastCalledWith({ away: true, emptied: false, pile: 0 });
    await tick(TOTAL + 5);
    expect(set).toHaveBeenLastCalledWith(null);
    expect(queue.holds.size).toBe(0);
  });
});
