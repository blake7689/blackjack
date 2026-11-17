import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within, act } from "@testing-library/react";
import { renderUI, testPlayer } from "./testUtils";
import TopBar from "../components/TopBar/TopBar";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import { initialGameState } from "../utils/gameReducer";
import { markLanded } from "../utils/cardAnimation";

// The table's top bar (#81): balance, menu, count, Settings. (The hidden top-up taps are tested in topUp.test.jsx.)
const menu = () => document.querySelector("nav.menu");
const menuButton = () => screen.getByRole("button", { name: "Menu" });
const figures = () => [...document.querySelectorAll(".count b")].map((b) => b.textContent);
const hand = (codes, extra = {}) => ({ tag: "h", cards: stackedShoe(codes), hiddenCards: [], bet: 10, status: HandStatus.PLAYING, result: HandResult.NONE, totals: [20], total: 20, ...extra });

describe("the balance", () => {
  it("shows the balance under a label, in #bal, and a +/- badge for the last change", () => {
    const { container, rerender } = renderUI(<TopBar />, { player: { player: { ...testPlayer, credits: 1234 }, creditChange: { delta: 20, seq: 1 } } });
    expect(container.querySelector("#bal").textContent).toBe("$1,234");
    expect(screen.getByText("Balance")).toBeTruthy();
    expect(screen.getByText("+20").className).toContain("up");
    expect(container.querySelector(".bal").classList.contains("changing")).toBe(true);
    rerender(<TopBar />);
  });

  it("shows a loss badge, no badge without a recent change, and cents as two places", () => {
    const { container } = renderUI(<TopBar />, { player: { creditChange: { delta: -10, seq: 2 } } });
    expect(screen.getByText("-10").className).toContain("down");
    renderUI(<TopBar />, { player: { player: { ...testPlayer, credits: 12.5 } } });
    expect(document.querySelectorAll("#bal")[1].textContent).toBe("$12.50");
    expect(container.querySelectorAll(".delta")).toHaveLength(1);
  });

  it("reads $0 with no player", () => {
    const { container } = renderUI(<TopBar />, { player: { player: null } });
    expect(container.querySelector("#bal").textContent).toBe("$0");
  });
});

describe("the count", () => {
  it("is Hi-Lo over the cards on the table, with the true count, signed", () => {
    renderUI(<TopBar />, { game: { runningCount: 3, shoe: stackedShoe(Array(52).fill("7")), hands: [], dealer: { cards: [] } } });
    expect(figures()).toEqual(["+3", "+3"]);
    expect(screen.getByRole("group", { name: "Card count" })).toBeTruthy();
  });

  it("is hidden when the setting is off", () => {
    renderUI(<TopBar />, { game: { settings: { ...initialGameState.settings, showCardCount: false } } });
    expect(screen.queryByRole("group", { name: "Card count" })).toBeNull();
  });

  it("moves only as cards land face up: it leaves out the cards still on their way", () => {
    const five = hand(["5"]);
    const game = { runningCount: 1, shoe: stackedShoe(Array(52).fill("7")), hands: [five], dealer: { cards: [] } };
    const { rerender, gameState } = renderUI(<TopBar />, { game });
    expect(figures()).toEqual(["0", "0"]); // the 5 has not landed: not counted yet
    act(() => markLanded(five.cards[0].id));
    expect(figures()).toEqual(["+1", "+1"]);
    const [king] = stackedShoe(["K"]);
    gameState.runningCount = 0;
    gameState.dealer = { cards: [king] };
    rerender(<TopBar />);
    expect(figures()).toEqual(["+1", "+1"]); // the king (-1) is on its way
    act(() => markLanded(king.id));
    expect(figures()).toEqual(["0", "0"]);
  });
});

describe("the menu", () => {
  it("is closed to begin with, opens and closes from its button, and names its state", () => {
    renderUI(<TopBar />);
    expect(menuButton().getAttribute("aria-expanded")).toBe("false");
    expect(menu().hidden).toBe(true);
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull(); // hidden: not in the accessibility tree
    fireEvent.click(menuButton());
    expect(menuButton().getAttribute("aria-expanded")).toBe("true");
    expect(menu().hidden).toBe(false);
    expect(within(menu()).getAllByRole("button").map((b) => b.textContent.trim())).toEqual(["Home", "Table rules", "Analytics Soon", "Settings", "Log out"]);
    fireEvent.click(menuButton());
    expect(menu().hidden).toBe(true);
  });

  it("closes on Escape (focus back on the button) and on a press outside, but not on one inside", () => {
    renderUI(<TopBar />);
    fireEvent.click(menuButton());
    fireEvent.mouseDown(menu());
    expect(menu().hidden).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(menuButton());
    fireEvent.click(menuButton());
    fireEvent.keyDown(document, { key: "Enter" });
    expect(menu().hidden).toBe(false);
    fireEvent.mouseDown(document.body);
    expect(menu().hidden).toBe(true);
  });

  it("Table rules opens the Game tab of Settings, Settings opens Settings, and the menu closes", () => {
    renderUI(<TopBar />);
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("button", { name: "Table rules" }));
    expect(screen.getByTestId("location").textContent).toBe("/settings?tab=game");
    expect(menu().hidden).toBe(true);
  });

  it("the Settings key and the menu's Settings both open Settings and close the menu", () => {
    renderUI(<TopBar />, { path: "/game" });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("location").textContent).toBe("/settings");
    fireEvent.click(menuButton());
    fireEvent.click(within(menu()).getByRole("button", { name: "Settings" }));
    expect(menu().hidden).toBe(true);
  });

  it("Analytics says Soon and does nothing", () => {
    renderUI(<TopBar />);
    fireEvent.click(menuButton());
    const analytics = screen.getByRole("button", { name: /Analytics/ });
    expect(analytics.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(analytics);
    expect(menu().hidden).toBe(false);
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("Home resets the game and goes Home (asking first once cards are out)", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { gameActions } = renderUI(<TopBar />, { path: "/game", actions: { getPhase: () => GamePhases.PLAYER_TURN } });
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Leave game"));
    expect(gameActions.resetGame).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(gameActions.resetGame).toHaveBeenCalledOnce();
    expect(screen.getByTestId("location").textContent).toBe("/");
    confirm.mockRestore();
  });

  it("Log out asks, then signs out and goes Home", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { playerCtx, gameActions } = renderUI(<TopBar />, { path: "/game" });
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(playerCtx.logout).toHaveBeenCalledOnce();
    expect(gameActions.resetGame).toHaveBeenCalledOnce();
    expect(screen.getByTestId("location").textContent).toBe("/");
    confirm.mockRestore();
  });

  it("the felt swatches are a radio group on the saved felt; a pick applies it, and a failed save is swallowed", async () => {
    const changeSettings = vi.fn(() => Promise.reject(new Error("offline")));
    renderUI(<TopBar />, { game: { settings: { ...initialGameState.settings, feltTheme: "blue" } }, actions: { changeSettings } });
    fireEvent.click(menuButton());
    const group = screen.getByRole("radiogroup", { name: "Felt" });
    expect(within(group).getAllByRole("radio").map((r) => [r.getAttribute("aria-label"), r.getAttribute("aria-checked")])).toEqual([["Green", "false"], ["Blue", "true"], ["Red", "false"]]);
    await act(async () => { fireEvent.click(within(group).getByRole("radio", { name: "Red" })); });
    expect(changeSettings).toHaveBeenCalledWith({ feltTheme: "red" });
  });
});
