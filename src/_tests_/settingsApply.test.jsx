import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { renderUI } from "./testUtils";
import Settings from "../pages/Settings";
import { GamePhases } from "../utils/constants/gamePhases";

// Settings reads the rules section's patches as draft edits (#91, #84): a patch that changes nothing is no change, and a save sends only the
// keys that differ, because GameProvider deals a new shoe for any RESET_SETTINGS key in a patch, even an unchanged one. The section is replaced
// by one that sends whatever patch it is told to, so a future control that sends a no-op patch cannot cost the player a shoe.
vi.mock("../components/RulesSection/RulesSection", () => ({
  default: ({ onApply }) => (
    <>
      <button onClick={() => onApply({ deckCount: 6, surrender: "late" })}>same</button>
      <button onClick={() => onApply({})}>empty</button>
      <button onClick={() => onApply({ deckCount: 4 })}>different</button>
      <button onClick={() => onApply({ deckCount: 6, surrender: "none" })}>mixed</button>
      <button onClick={() => onApply({ tripleDown: true })}>app only</button>
    </>
  ),
}));

const open = (phase) => {
  const view = renderUI(<Settings />, { path: "/settings#rules", game: { phase } });
  return view;
};
const bar = () => screen.queryByRole("region", { name: "Save bar" });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

describe("Settings and the rules section's patches", () => {
  it("a patch that changes nothing is no change, even during a round: no bar, no question, no changeSettings", () => {
    const { gameActions } = open(GamePhases.PLAYER_TURN);
    fireEvent.click(screen.getByText("same"));
    fireEvent.click(screen.getByText("empty"));
    expect(bar()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });

  it("a patch that changes something is a draft until Save, and Save sends only the key that changed", () => {
    const { gameActions } = open(GamePhases.PRE_DEAL);
    fireEvent.click(screen.getByText("different"));
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(within(bar()).getByText("1 unsaved change")).toBeTruthy();
    save();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ deckCount: 4 }]]);
  });

  it("a patch with some unchanged keys sends only the ones that differ", () => {
    const { gameActions } = open(GamePhases.PRE_DEAL);
    fireEvent.click(screen.getByText("mixed"));
    save();
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ surrender: "none" }]]);
  });

  it("asks 'Start a new shoe?' during a round for a table rule, but not for an app-only toggle", async () => {
    const { gameActions } = open(GamePhases.PLAYER_TURN);
    fireEvent.click(screen.getByText("app only"));
    save();
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {});
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ tripleDown: true }]]);
    fireEvent.click(screen.getByText("different"));
    save();
    expect(screen.getByRole("dialog", { name: "Start a new shoe?" })).toBeTruthy();
    expect(gameActions.changeSettings).toHaveBeenCalledTimes(1);
  });
});
