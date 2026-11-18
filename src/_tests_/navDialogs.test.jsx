import { describe, it, expect } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderUI } from "./testUtils";
import Header from "../components/Header/Header";
import TopBar from "../components/TopBar/TopBar";
import { useNavActions } from "../hooks/useNavActions";
import { GamePhases } from "../utils/constants/gamePhases";

// The two styled confirms that replaced window.confirm (#87, DESIGN section 8): "Leave game and return Home?" and "Log out?".
// The safe button comes first and takes focus, the danger button is the outline, Escape is the safe answer, focus goes back.
const inRound = { path: "/game", actions: { getPhase: () => GamePhases.PLAYER_TURN } };
const location = () => screen.getByTestId("location").textContent;

describe("Leave game and return Home?", () => {
  it("is described by its body, lists Keep playing before Leave, and focuses Keep playing", () => {
    renderUI(<Header />, inRound);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    const dialog = screen.getByRole("dialog", { name: "Leave game and return Home?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")).textContent).toBe("Any bet in the circle will be lost.");
    const [safe, danger] = within(dialog).getAllByRole("button");
    expect([safe.textContent, danger.textContent]).toEqual(["Keep playing", "Leave"]);
    expect(document.activeElement).toBe(safe);
    expect(danger.className).toContain("danger-o");
    expect(safe.className).not.toContain("danger");
  });

  it("Escape means Keep playing: it closes, resets nothing and returns focus to the Home button", () => {
    const { gameActions } = renderUI(<Header />, inRound);
    const home = screen.getByRole("button", { name: "Home" });
    home.focus();
    fireEvent.click(home);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.resetGame).not.toHaveBeenCalled();
    expect(location()).toBe("/game");
    expect(document.activeElement).toBe(home);
  });

  it("Leave runs resetGame and navigates Home, once", () => {
    const { gameActions } = renderUI(<Header />, inRound);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(gameActions.resetGame).toHaveBeenCalledOnce();
    expect(location()).toBe("/");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Tab stays inside the dialog: from Leave to Keep playing, and Shift+Tab back", () => {
    renderUI(<Header />, inRound);
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    const [safe, danger] = within(screen.getByRole("dialog")).getAllByRole("button");
    danger.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(safe);
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(back);
    expect(document.activeElement).toBe(danger);
  });

  it.each([GamePhases.NONE, GamePhases.PRE_DEAL])("is not asked at %s: nothing is out, so Home goes straight home", (phase) => {
    const { gameActions } = renderUI(<Header />, { path: "/game", actions: { getPhase: () => phase } });
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.resetGame).toHaveBeenCalledOnce();
  });

  it("is the same dialog from the table's menu, and is not asked on Home", () => {
    const { gameActions } = renderUI(<TopBar />, inRound);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(within(screen.getByRole("dialog")).getAllByRole("button")[0].textContent).toBe("Keep playing");
    expect(gameActions.resetGame).not.toHaveBeenCalled();
  });

  it("does nothing on Home itself (no dialog, no reset)", () => {
    const { gameActions } = renderUI(<Header />, { path: "/", actions: { getPhase: () => GamePhases.PLAYER_TURN } });
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.resetGame).not.toHaveBeenCalled();
  });
});

describe("Log out?", () => {
  const ask = () => {
    const view = renderUI(<Header />, { path: "/game" });
    fireEvent.click(screen.getByRole("button", { name: "tester" }));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    return view;
  };

  it("says the balance stays, lists Stay logged in before Log out, and focuses the safe one", () => {
    ask();
    const dialog = screen.getByRole("dialog", { name: "Log out?" });
    expect(document.getElementById(dialog.getAttribute("aria-describedby")).textContent).toBe("Your balance stays on your account.");
    const [safe, danger] = within(dialog).getAllByRole("button");
    expect([safe.textContent, danger.textContent]).toEqual(["Stay logged in", "Log out"]);
    expect(document.activeElement).toBe(safe);
    expect(danger.className).toContain("danger-o");
  });

  it("Escape keeps the session; Log out resets the game, signs out and goes Home", () => {
    const { playerCtx, gameActions } = ask();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(playerCtx.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "tester" }));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Log out" }));
    expect(playerCtx.logout).toHaveBeenCalledOnce();
    expect(gameActions.resetGame).toHaveBeenCalledOnce();
    expect(location()).toBe("/");
  });
});

describe("goSettings", () => {
  function Go({ section }) {
    const { goSettings } = useNavActions();
    return <button onClick={() => goSettings(section)}>go</button>;
  }

  it("opens /settings, or /settings#<section> for a deep link to that section", () => {
    const first = renderUI(<Go />, { path: "/game" });
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(location()).toBe("/settings");
    first.unmount();
    renderUI(<Go section="rules" />, { path: "/game" });
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(location()).toBe("/settings#rules");
  });
});
