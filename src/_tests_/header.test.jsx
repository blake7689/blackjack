import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderUI } from "./testUtils";
import Header from "../components/Header/Header";
import { GamePhases } from "../utils/constants/gamePhases";

const location = () => screen.getByTestId("location").textContent;

describe("Header", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("publishes its height as --header-height, watches it, and stops watching on unmount", () => {
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal("ResizeObserver", vi.fn(function ResizeObserver() { return observer; }));
    const { unmount } = renderUI(<Header />, { path: "/" });
    expect(document.documentElement.style.getPropertyValue("--header-height")).toBe("0px"); // jsdom measures 0
    expect(observer.observe).toHaveBeenCalledOnce();
    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("does nothing on Home when already home", () => {
    const { gameActions } = renderUI(<Header />, { path: "/" });
    fireEvent.click(screen.getByText("Home"));
    expect(gameActions.resetGame).not.toHaveBeenCalled();
  });

  it("goes home without asking when no round is in play", () => {
    const { gameActions } = renderUI(<Header />, { path: "/game", actions: { getPhase: () => GamePhases.PRE_DEAL } });
    fireEvent.click(screen.getByText("Home"));
    expect(gameActions.resetGame).toHaveBeenCalled();
    expect(location()).toBe("/");
  });

  const leaveDialog = () => screen.queryByRole("dialog", { name: "Leave game and return Home?" });

  it("asks in a dialog before leaving a round in play: Keep playing stays, Leave resets and goes Home", () => {
    const { gameActions } = renderUI(<Header />, { path: "/game", actions: { getPhase: () => GamePhases.PLAYER_TURN } });
    fireEvent.click(screen.getByText("Home"));
    expect(gameActions.resetGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(leaveDialog()).toBeNull();
    expect(gameActions.resetGame).not.toHaveBeenCalled();
    expect(location()).toBe("/game");
    fireEvent.click(screen.getByText("Home"));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(gameActions.resetGame).toHaveBeenCalledOnce();
    expect(location()).toBe("/");
  });

  it.each([GamePhases.OFFERS, GamePhases.PEEK])("asks before leaving a table waiting at %s: the insured bet would be lost", (phase) => {
    const { gameActions } = renderUI(<Header />, { path: "/game", actions: { getPhase: () => phase } });
    fireEvent.click(screen.getByText("Home"));
    expect(leaveDialog()).not.toBeNull();
    expect(gameActions.resetGame).not.toHaveBeenCalled();
    expect(location()).toBe("/game");
  });

  it("opens Settings", () => {
    renderUI(<Header />, { path: "/game" });
    fireEvent.click(screen.getByText("Settings"));
    expect(location()).toBe("/settings");
  });

  it("offers Log in without a player", () => {
    renderUI(<Header />, { player: { player: null } });
    expect(screen.getByText("Log in").getAttribute("href")).toBe("/login");
  });

  it("logs out from the user menu after the Log out? dialog, closing the menu either way", () => {
    const { playerCtx, gameActions } = renderUI(<Header />, { path: "/game" });
    fireEvent.click(screen.getByText("tester"));
    fireEvent.click(screen.getByText("Log out"));
    expect(screen.getByRole("dialog", { name: "Log out?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay logged in" }));
    expect(playerCtx.logout).not.toHaveBeenCalled();
    expect(screen.queryByText("Log out")).toBeNull();
    fireEvent.click(screen.getByText("tester"));
    fireEvent.click(screen.getByText("Log out"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Log out" }));
    expect(gameActions.resetGame).toHaveBeenCalled();
    expect(playerCtx.logout).toHaveBeenCalled();
    expect(location()).toBe("/");
  });

  it("toggles the user menu closed again", () => {
    renderUI(<Header />);
    fireEvent.click(screen.getByText("tester"));
    fireEvent.click(screen.getByText("tester"));
    expect(screen.queryByText("Log out")).toBeNull();
  });

  it("closes the user menu on a click outside it, but not inside it", () => {
    renderUI(<Header />);
    fireEvent.click(screen.getByText("tester"));
    fireEvent.mouseDown(screen.getByText("Log out"));
    expect(screen.getByText("Log out")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Log out")).toBeNull();
  });

  it("marks the user button aria-expanded, and Escape closes the menu and returns focus to that button", () => {
    renderUI(<Header />);
    const button = screen.getByRole("button", { name: "tester" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("closes the user menu on Escape only", () => {
    renderUI(<Header />);
    fireEvent.click(screen.getByText("tester"));
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByText("Log out")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Log out")).toBeNull();
  });

  it("closes the user menu on a route change", () => {
    renderUI(<Header />, { path: "/game" });
    fireEvent.click(screen.getByText("tester"));
    fireEvent.click(screen.getByText("Settings"));
    expect(location()).toBe("/settings");
    expect(screen.queryByText("Log out")).toBeNull();
  });
});
