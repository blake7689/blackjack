import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderUI } from "./testUtils";
import GameBoard from "../components/GameBoard/GameBoard";
import { GamePhases } from "../utils/constants/gamePhases";

// No bet while the table shuffles or sweeps (#147): the rack dims (`.rack-wrap.off`, every chip aria-disabled), the betting keys are dimmed, the digit keys
// and the bet circle do nothing; at END_ROUND (the cards are being swept) the betting face is up with the same lock, and Deal says "Shuffling" only when
// the cut card was out. With `seenIds` (no opening shuffle) or once the shuffle is over, all of it is live again.
const { PRE_DEAL, END_ROUND } = GamePhases;
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const press = (k) => fireEvent.keyDown(document.body, { key: k });
const chip = (v) => screen.getByRole("button", { name: `$${v} chip` });
const key = (name) => screen.getByRole("button", { name });
const spot = () => document.querySelector(".spot");
const wrap = () => document.querySelector(".rack-wrap");
const betting = (extra = {}) => ({ phase: PRE_DEAL, hands: [], betCircle: 10, betHistory: [10], initialBet: 10, ...extra });
const nothingHappened = (a) => ["addBet", "undoBet", "clearBet", "deal", "continueRound"].forEach((n) => expect(a[n], n).not.toHaveBeenCalled());
const BETTING_KEYS = ["Undo", "Clear", "Rebet", "Double every bet", "Deal"];

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("no bet during the opening shuffle (#147)", () => {
  it("the rack is dimmed, every chip is aria-disabled, the circle is disabled and Deal still says Deal", () => {
    renderUI(<GameBoard />, { game: betting() });
    expect(wrap().classList.contains("off")).toBe(true);
    const chips = [...document.querySelectorAll(".rc")];
    expect(chips.length).toBeGreaterThan(3);
    expect(chips.every((c) => c.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(spot().disabled).toBe(true);
    expect(document.querySelector(".dock-in").getAttribute("data-face")).toBe("betting");
    expect(key("Deal").getAttribute("aria-disabled")).toBe("true");
    for (const name of ["Undo", "Clear", "Double every bet"]) expect(key(name).getAttribute("aria-disabled"), name).toBe("true");
  });

  it("a chip tap, a double tap, the keys 1-9, Undo, Clear, 2x, Deal and the circle place no bet", () => {
    const { gameActions } = renderUI(<GameBoard />, { game: betting() });
    fireEvent.click(chip(10));
    fireEvent.click(chip(10)); // a double tap
    for (const k of ["1", "1", "3", "3", "9", "u", "c", "x", " "]) press(k);
    fireEvent.click(spot());
    for (const name of ["Undo", "Clear", "Double every bet", "Deal"]) fireEvent.click(key(name));
    nothingHappened(gameActions);
    expect(chip(25).getAttribute("aria-pressed")).toBe("true"); // a tap on a dimmed chip does not even select it
  });

  it("Rebet does nothing either", () => {
    const { gameActions } = renderUI(<GameBoard />, { game: betting({ betCircle: 0, betHistory: [] }) });
    expect(key("Rebet").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(key("Rebet"));
    press("b");
    nothingHappened(gameActions);
  });

  it("it is all live again once the shuffle is over", async () => {
    const { gameActions } = renderUI(<GameBoard />, { game: betting({ betCircle: 0, betHistory: [] }) });
    await tick(10_000);
    expect(wrap().classList.contains("off")).toBe(false);
    expect([...document.querySelectorAll(".rc")].some((c) => c.getAttribute("aria-disabled"))).toBe(false);
    expect(spot().disabled).toBe(false);
    expect(key("Deal")).toBeTruthy();
    fireEvent.click(chip(10));
    fireEvent.click(chip(10)); // a double tap bets again
    expect(gameActions.addBet.mock.calls).toEqual([[10]]);
    press("3"); // the key: the same number twice adds
    press("3");
    expect(gameActions.addBet.mock.calls).toEqual([[10], [10]]);
    fireEvent.click(spot());
    expect(gameActions.addBet).toHaveBeenLastCalledWith(10); // the circle bets the selected chip
    press("b");
    expect(gameActions.addBet).toHaveBeenCalledTimes(4);
  });

  it("2x is live again after the shuffle", async () => {
    const { gameActions } = renderUI(<GameBoard />, { game: betting() });
    await tick(10_000);
    press("x");
    expect(gameActions.addBet.mock.calls).toEqual([[10]]);
  });

  it("with seenIds there is no opening shuffle: everything is live at once", () => {
    const { gameActions } = renderUI(<GameBoard />, { game: betting({ betCircle: 0, betHistory: [], seenIds: ["x"] }) });
    expect(wrap().classList.contains("off")).toBe(false);
    expect(spot().disabled).toBe(false);
    fireEvent.click(spot());
    expect(gameActions.addBet).toHaveBeenCalledWith(25);
  });
});

describe("the sweep at the end of a round (END_ROUND, #147)", () => {
  const end = (extra = {}) => renderUI(<GameBoard />, { game: betting({ phase: END_ROUND, seenIds: ["x"], ...extra }) });

  it("the betting face is up, the rack and every betting key are dimmed, and Deal says Deal (the cut card is not out)", () => {
    end();
    expect(document.querySelector(".dock-in").getAttribute("data-face")).toBe("betting");
    expect(wrap().classList.contains("off")).toBe(true);
    expect([...document.querySelectorAll(".rc")].every((c) => c.getAttribute("aria-disabled") === "true")).toBe(true);
    for (const name of BETTING_KEYS) expect(key(name).getAttribute("aria-disabled"), name).toBe("true");
    expect(screen.queryByRole("button", { name: "Shuffling" })).toBeNull();
  });

  it("Deal still reads Deal when the cut card was out, and stays dimmed (L2-4)", () => {
    end({ cutCardFound: true });
    expect(key("Deal").getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("button", { name: "Shuffling" })).toBeNull();
  });

  it("nothing bets, deals or continues from the chips, keys, Rebet, 2x or the circle", () => {
    const { gameActions } = end();
    fireEvent.click(chip(10));
    fireEvent.click(chip(10));
    for (const k of ["1", "1", "3", "3", "u", "c", "b", "x", " ", "Enter"]) press(k);
    fireEvent.click(spot());
    for (const name of BETTING_KEYS) fireEvent.click(key(name));
    nothingHappened(gameActions);
  });

  it("Rebet is dimmed at END_ROUND with an empty circle too", () => {
    const { gameActions } = end({ betCircle: 0, betHistory: [] });
    expect(key("Rebet").getAttribute("aria-disabled")).toBe("true");
    press("b");
    nothingHappened(gameActions);
  });
});
