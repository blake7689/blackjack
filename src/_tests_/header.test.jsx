import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderUI } from "./testUtils";
import Header from "../components/Header/Header";
import { GamePhases } from "../utils/constants/gamePhases";

const location = () => screen.getByTestId("location").textContent;

describe("Header", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("asks before leaving a round in play, and stays if declined", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { gameActions } = renderUI(<Header />, { path: "/game", actions: { getPhase: () => GamePhases.PLAYER_TURN } });
    fireEvent.click(screen.getByText("Home"));
    expect(gameActions.resetGame).not.toHaveBeenCalled();
    expect(location()).toBe("/game");
    fireEvent.click(screen.getByText("Home"));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(location()).toBe("/");
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

  it("logs out from the user menu after confirming, closing the menu either way", () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { playerCtx, gameActions } = renderUI(<Header />, { path: "/game" });
    fireEvent.click(screen.getByText("tester"));
    fireEvent.click(screen.getByText("Log out"));
    expect(playerCtx.logout).not.toHaveBeenCalled();
    expect(screen.queryByText("Log out")).toBeNull();
    fireEvent.click(screen.getByText("tester"));
    fireEvent.click(screen.getByText("Log out"));
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
});
