import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderUI } from "./testUtils";
import Settings from "../pages/Settings";
import { GamePhases } from "../utils/constants/gamePhases";

// Settings.applyRules guards itself (#91): the rules section never offers a patch that changes nothing, but a future control might, and
// GameProvider would deal a new shoe for it. The section is replaced by one that sends whatever patch it is told to.
vi.mock("../components/RulesSection/RulesSection", () => ({
  default: ({ onApply }) => (
    <>
      <button onClick={() => onApply({ deckCount: 6, surrender: "late" })}>same</button>
      <button onClick={() => onApply({})}>empty</button>
      <button onClick={() => onApply({ deckCount: 4 })}>different</button>
      <button onClick={() => onApply({ tripleDown: true })}>app only</button>
    </>
  ),
}));

afterEach(() => vi.restoreAllMocks());

describe("Settings applyRules (#91)", () => {
  const open = (phase) => renderUI(<Settings />, { path: "/settings?tab=game", game: { phase } });

  it("does nothing for a patch that changes nothing, even during a round: no confirm, no changeSettings", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { gameActions } = open(GamePhases.PLAYER_TURN);
    fireEvent.click(screen.getByText("same"));
    fireEvent.click(screen.getByText("empty"));
    expect(confirm).not.toHaveBeenCalled();
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });

  it("applies a patch that changes something, asking only during a round and only for a table rule", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { gameActions } = open(GamePhases.PRE_DEAL);
    fireEvent.click(screen.getByText("different"));
    expect(confirm).not.toHaveBeenCalled();
    expect(gameActions.changeSettings).toHaveBeenCalledWith({ deckCount: 4 });
  });

  it("asks for a table rule during a round, but not for an app-only toggle", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { gameActions } = open(GamePhases.PLAYER_TURN);
    fireEvent.click(screen.getByText("app only"));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("different"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ tripleDown: true }], [{ deckCount: 4 }]]);
  });
});
