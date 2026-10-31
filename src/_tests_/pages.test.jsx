import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act, waitFor, cleanup, within } from "@testing-library/react";
import { renderUI, testPlayer } from "./testUtils";
import Home from "../pages/Home";
import Game from "../pages/Game";
import Login from "../pages/Login";
import Settings from "../pages/Settings";
import App from "../App";
import Header from "../components/Header/Header";
import { GamePhases } from "../utils/constants/gamePhases";
import { validateField } from "../utils/validation";
import { RULE_PRESETS } from "../utils/rulePresets";
import { initialGameState, LEGACY_RULES } from "../utils/gameReducer";
import { GROUPS, visibleIn, selectedValue, ruleSummary } from "../utils/ruleCatalog";
import { houseEdge, formatEdge } from "../utils/houseEdge";

const location = () => screen.getByTestId("location").textContent;
const type = (label, value) => fireEvent.change(screen.getByPlaceholderText(label), { target: { value } });
// Lets a rejected or resolved async handler finish.
const flush = () => act(async () => {});

// ---- the rules section (#91) ----
const NO_HOLE = "If the Dealer Has Blackjack, You Lose";
const TOGGLE_NAME = {
  tripleDown: "Triple Down", tripleDrawsOnBust: "Always Draw the Second Triple Card, Even on a Bust", doubleFaceDown: "Double Down Card Face Down",
  blackJackOnSplit: "Blackjack on Split", dealerDrawsOnPlayerBlackjack: "EU: Dealer Draws 2nd Card on a Player Blackjack",
  blackjackPaysImmediately: "Blackjack Pays Immediately", dealerDrawsOnceOn21: "EU: Dealer Draws Only Once Against a 21",
  dealerDrawsOnPlayerBust: "Dealer Draws 2nd Card After a Player Bust", dealerHoleNoCheck: "Dealer doesn't check the hole card",
};
// The toggles are named by their visible label.
const box = (key) => screen.getByRole("checkbox", { name: TOGGLE_NAME[key] });
const queryBox = (key) => screen.queryByRole("checkbox", { name: TOGGLE_NAME[key] });
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rulesGroup = (name) => within(screen.getByRole("group", { name }));
// An option button reads "6:5 +1.39% house edge" (the chosen one has no number; jsdom drops the spaces): match the label, with or without the number.
const option = (group, label) => rulesGroup(group).getByRole("button", { name: new RegExp(`^${escape(label)}(?:\\s*[+-]\\d+\\.\\d\\d%\\s*house edge)?$`) });
const optionLabels = (group) => rulesGroup(group).getAllByRole("button").map((b) => b.firstChild.textContent);
const pressed = (group) => rulesGroup(group).getByRole("button", { pressed: true }).firstChild.textContent;
const presetTiles = () => within(screen.getByRole("group", { name: "Table rules" })).getAllByRole("button");
const tile = (name) => presetTiles().find((t) => t.querySelector("strong").textContent === name);
const customTile = () => document.querySelector("[aria-current='true']");
const open = (game = {}, path = "/settings?tab=game") => renderUI(<Settings />, { path, game: { phase: GamePhases.PRE_DEAL, ...game } });
// The fake game state never changes by itself. This one applies a patch the way GameProvider does and re-renders, so a test sees the result.
function openLive(game = {}, path = "/settings?tab=game") {
  let view;
  const changeSettings = vi.fn((patch) => {
    view.gameState.settings = { ...view.gameState.settings, ...patch };
    view.rerender(<Settings />);
    return Promise.resolve();
  });
  view = renderUI(<Settings />, { path, game: { phase: GamePhases.PRE_DEAL, ...game }, actions: { changeSettings } });
  return view;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Home", () => {
  it("asks a visitor to log in", () => {
    renderUI(<Home />, { player: { player: null } });
    expect(screen.getByText("Please log in to start playing.")).toBeTruthy();
  });

  it("starts a game and opens the table", () => {
    const { gameActions } = renderUI(<Home />);
    fireEvent.click(screen.getByText("Start Game"));
    expect(gameActions.startGame).toHaveBeenCalled();
    expect(location()).toBe("/game");
  });
});

describe("Game", () => {
  it("sends visitors and unstarted games home", () => {
    renderUI(<Game />, { path: "/game", player: { player: null }, game: { phase: GamePhases.PRE_DEAL } });
    expect(location()).toBe("/");
  });

  it("sends an unstarted game home", () => {
    renderUI(<Game />, { path: "/game" });
    expect(location()).toBe("/");
  });

  it("shows the table for a started game", () => {
    renderUI(<Game />, { path: "/game", game: { phase: GamePhases.PRE_DEAL } });
    expect(screen.getByText("Place your bets!")).toBeTruthy();
  });
});

describe("Login", () => {
  it("logs in and goes home", async () => {
    const login = vi.fn().mockResolvedValue(testPlayer);
    renderUI(<Login />, { path: "/login", player: { login } });
    type("Username or Email", "tester");
    type("Password", "secret1");
    fireEvent.click(screen.getByText("Log in"));
    expect(screen.getByText("Contacting server...")).toBeTruthy();
    await flush();
    expect(login).toHaveBeenCalledWith({ usernameOrEmail: "tester", password: "secret1" });
    expect(location()).toBe("/");
  });

  it("keeps the player informed while a cold server wakes up", async () => {
    vi.useFakeTimers();
    let finish;
    const login = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    renderUI(<Login />, { path: "/login", player: { login } });
    fireEvent.click(screen.getByText("Log in"));
    expect(screen.getByText("Contacting server...")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText(/may be waking up/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(25000); });
    expect(screen.getByText(/still waking up/)).toBeTruthy();
    // A cold start can take longer than 30 s (#75): still waiting at 31 s, no error, then it signs in.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText(/still waking up/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => finish(testPlayer));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(location()).toBe("/");
  });

  it("shows the actual failure inline: network, server message, or a fallback", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const shown = [];
    const login = vi.fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(new Error("Invalid username/email or password."))
      .mockRejectedValueOnce(new Error(""));
    renderUI(<Login />, { path: "/login", player: { login } });
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText("Log in"));
      await flush();
      shown.push(screen.getByRole("alert").textContent);
    }
    expect(alert).not.toHaveBeenCalled();
    expect(shown).toEqual([
      "No response from server. It may be paused; try again in a minute.",
      "Invalid username/email or password.",
      "Login failed",
    ]);
    expect(location()).toBe("/login");
  });

  it("signs up with the typed details; the server sets the starting balance", async () => {
    const addPlayer = vi.fn().mockResolvedValue(testPlayer);
    renderUI(<Login />, { path: "/login", player: { addPlayer } });
    fireEvent.click(screen.getByText("Add player"));
    expect(screen.queryByPlaceholderText("Starting credits")).toBeNull();
    type("Username", "newbie");
    type("Email", "n@example.com");
    type("Password", "secret1");
    type("First name", "New");
    type("Last name", "Bie");
    fireEvent.click(screen.getByText("Create & sign in"));
    expect(screen.getByText("Creating…")).toBeTruthy();
    await flush();
    expect(addPlayer).toHaveBeenCalledWith({ userName: "newbie", password: "secret1", email: "n@example.com", firstName: "New", lastName: "Bie" });
    expect(location()).toBe("/");
  });

  it("shows each signup field's error and blocks the form until it is valid", () => {
    const addPlayer = vi.fn();
    renderUI(<Login />, { path: "/login", player: { addPlayer } });
    fireEvent.click(screen.getByText("Add player"));
    const button = screen.getByText("Create & sign in");
    expect(button.disabled).toBe(true);
    expect(screen.queryByText(/is required/)).toBeNull(); // nothing shown before the player touches a field

    type("Username", "ab");
    expect(screen.getByText("Username must be at least 3 characters.")).toBeTruthy();
    type("Email", "not-an-email");
    expect(screen.getByText("Invalid email format.")).toBeTruthy();
    type("Password", "123");
    expect(screen.getByText("Password must be at least 6 characters.")).toBeTruthy();
    type("Password", "");
    expect(screen.getByText("Password is required.")).toBeTruthy();
    fireEvent.blur(screen.getByPlaceholderText("First name"));
    expect(screen.getByText("First name is required.")).toBeTruthy();

    // Enter still submits a form: it shows every problem instead of signing up.
    fireEvent.submit(button.closest("form"));
    expect(screen.getByText("Last name is required.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Last name").getAttribute("aria-invalid")).toBe("true");
    expect(addPlayer).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
  });

  it("shows a failed signup inline", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderUI(<Login />, { path: "/login", player: { addPlayer: vi.fn().mockRejectedValue(new Error("")) } });
    fireEvent.click(screen.getByText("Add player"));
    type("Username", "newbie");
    type("Email", "n@example.com");
    type("Password", "secret1");
    type("First name", "New");
    type("Last name", "Bie");
    fireEvent.submit(screen.getByText("Create & sign in").closest("form"));
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Signup failed");
    expect(alert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Login"));
    expect(screen.getByPlaceholderText("Username or Email")).toBeTruthy();
  });
});

describe("validateField", () => {
  it("checks each profile field", () => {
    expect(validateField("userName", " ")).toBe("Username is required.");
    expect(validateField("userName", "ab")).toBe("Username must be at least 3 characters.");
    expect(validateField("userName", "abc")).toBe("");
    expect(validateField("email", "")).toBe("Email is required.");
    expect(validateField("email", "nope")).toBe("Invalid email format.");
    expect(validateField("email", "a@b.co")).toBe("");
    expect(validateField("password", "")).toBe("");
    expect(validateField("password", "12345")).toBe("Password must be at least 6 characters.");
    expect(validateField("password", "123456")).toBe("");
    expect(validateField("firstName", "")).toBe("First name is required.");
    expect(validateField("lastName", "")).toBe("Last name is required.");
    expect(validateField("lastName", "X")).toBe("");
  });
});

describe("Settings", () => {
  const saveButton = () => screen.getAllByText("Save")[0];

  it("asks a visitor to log in", () => {
    renderUI(<Settings />, { player: { player: null } });
    expect(screen.getByText("Please log in to manage settings.")).toBeTruthy();
  });

  it("enables Save only for a valid profile change, and saves it", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const updatePlayer = vi.fn().mockResolvedValue(true);
    const { container } = renderUI(<Settings />, { player: { updatePlayer } });
    const userName = container.querySelector('input[name="userName"]');
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(userName, { target: { value: "ab" } });
    expect(screen.getByText("Username must be at least 3 characters.")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(userName, { target: { value: "renamed" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await flush();
    expect(updatePlayer).toHaveBeenCalledWith({ userName: "renamed", email: "t@example.com", firstName: "Test", lastName: "Er" });
    expect(screen.getByRole("status").textContent).toBe("Saved");
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("changes the password only with the current one and a valid new one", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const changePassword = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("Incorrect password.")).mockRejectedValueOnce(new Error(""));
    const { container } = renderUI(<Settings />, { player: { changePassword } });
    const current = container.querySelector('input[name="currentPassword"]');
    const next = container.querySelector('input[name="newPassword"]');
    const button = screen.getByText("Change password");
    expect(current.type).toBe("password");
    expect(button.disabled).toBe(true);
    fireEvent.change(current, { target: { value: "old-pass" } });
    fireEvent.change(next, { target: { value: "123" } });
    expect(screen.getByText("Password must be at least 6 characters.")).toBeTruthy();
    expect(button.disabled).toBe(true);
    fireEvent.change(next, { target: { value: "new-pass" } });
    fireEvent.click(button);
    await flush();
    expect(changePassword).toHaveBeenCalledWith("old-pass", "new-pass");
    expect(current.value).toBe("");
    const shown = [screen.getByRole("status").textContent];
    for (let i = 0; i < 2; i++) {
      fireEvent.change(current, { target: { value: "wrong" } });
      fireEvent.change(next, { target: { value: "new-pass" } });
      fireEvent.click(button);
      await flush();
      shown.push(screen.getByRole("status").textContent);
    }
    expect(shown).toEqual(["Password changed", "Incorrect password.", "Password change failed"]);
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("shows a failed save inline, with a fallback message", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const updatePlayer = vi.fn().mockRejectedValueOnce(new Error("Name taken")).mockRejectedValueOnce(new Error(""));
    const { container } = renderUI(<Settings />, { player: { updatePlayer } });
    fireEvent.change(container.querySelector('input[name="firstName"]'), { target: { value: "Changed" } });
    fireEvent.click(saveButton());
    await flush();
    expect(screen.getByRole("status").textContent).toBe("Name taken");
    expect(screen.getByRole("status").className).toBe("notice error");
    fireEvent.click(saveButton());
    await flush();
    expect(screen.getByRole("status").textContent).toBe("Save failed");
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("deletes the profile only after confirming", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const deletePlayer = vi.fn().mockResolvedValue(true);
    const { gameActions } = renderUI(<Settings />, { path: "/settings", player: { deletePlayer } });
    fireEvent.click(screen.getByText("Delete Profile"));
    expect(deletePlayer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Delete Profile"));
    await flush();
    expect(window.alert).not.toHaveBeenCalled();
    expect(gameActions.resetGame).toHaveBeenCalled();
    expect(location()).toBe("/");
  });

  it("shows a failed delete inline, with a fallback message", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const deletePlayer = vi.fn().mockRejectedValueOnce(new Error("Gone")).mockRejectedValueOnce(new Error(""));
    renderUI(<Settings />, { player: { deletePlayer } });
    fireEvent.click(screen.getByText("Delete Profile"));
    await flush();
    expect(screen.getByRole("status").textContent).toBe("Gone");
    fireEvent.click(screen.getByText("Delete Profile"));
    await flush();
    expect(screen.getByRole("status").textContent).toBe("Delete failed");
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("applies a table rule at once, confirming first when a round is in play; other settings keep their Save button", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PLAYER_TURN } });
    const save = screen.getByLabelText("Save includeCutCard");
    expect(save.disabled).toBe(true);
    fireEvent.click(option("Deck size: 6", "4"));
    expect(confirm).toHaveBeenCalledWith("Changing this setting will reset the current game. Any bets will be lost. Continue?");
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    fireEvent.click(option("Deck size: 6", "4"));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ deckCount: 4 }]]);
    expect(gameActions.changeSetting).not.toHaveBeenCalled();
    // A Save-pattern setting that resets the game asks on Save, not before.
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByLabelText("includeCutCard"));
    expect(confirm).toHaveBeenCalledTimes(2);
    fireEvent.click(save);
    expect(gameActions.changeSetting).not.toHaveBeenCalled();
    fireEvent.click(save);
    expect(confirm).toHaveBeenCalledTimes(4);
    expect(gameActions.changeSetting).toHaveBeenCalledWith("includeCutCard", false);
  });

  it("offers the dealer rule options, and forces blackjack-pays-now when the EU dealer won't draw on it", () => {
    const { gameActions } = openLive({ phase: GamePhases.PRE_DEAL });
    expect(screen.queryByText(/NoDraw21/)).toBeNull();
    const paysNow = box("blackjackPaysImmediately");
    fireEvent.click(paysNow);
    expect([paysNow.checked, paysNow.disabled]).toEqual([false, false]);

    fireEvent.click(option("Second Card", "Dealt after you play"));
    fireEvent.click(box("dealerDrawsOnPlayerBlackjack"));
    expect([paysNow.checked, paysNow.disabled]).toEqual([true, true]);

    for (const key of ["dealerDrawsOnceOn21", "dealerDrawsOnPlayerBust"]) fireEvent.click(box(key));
    expect(gameActions.changeSettings.mock.calls).toEqual([
      [{ blackjackPaysImmediately: false }],
      [{ dealerHoleBehaviour: "drawAfter" }], // the player switched blackjackPaysImmediately off: it is kept
      [{ dealerDrawsOnPlayerBlackjack: false }],
      [{ dealerDrawsOnceOn21: true }],
      [{ dealerDrawsOnPlayerBust: true }],
    ]);
    expect(gameActions.changeSetting).not.toHaveBeenCalled();
  });

  it("offers triple down, and only lets the always-draw option be changed while it is on", () => {
    const { gameActions } = openLive();
    const draws = box("tripleDrawsOnBust");
    expect(draws.disabled).toBe(true);
    fireEvent.click(box("tripleDown"));
    expect(draws.disabled).toBe(false);
    fireEvent.click(draws);
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ tripleDown: true }], [{ tripleDrawsOnBust: true }]]);
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("true"); // House variations are not table rules
  });

  it("offers the face-down double option, off by default", () => {
    const { gameActions } = open();
    const faceDown = box("doubleFaceDown");
    expect(faceDown.checked).toBe(false);
    expect(screen.getByText("Double Down Card Face Down")).toBeTruthy();
    fireEvent.click(faceDown);
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ doubleFaceDown: true }]]);
  });

  it("shows the always-draw option unticked while triple down is off, without losing the saved choice", () => {
    openLive({ settings: { ...initialGameState.settings, tripleDrawsOnBust: true } });
    const draws = box("tripleDrawsOnBust");
    expect([draws.disabled, draws.checked]).toEqual([true, false]);
    fireEvent.click(box("tripleDown"));
    expect([draws.disabled, draws.checked]).toEqual([false, true]);
  });

  it("applies a rules preset in one step, and shows Custom once a rule is changed", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { gameActions } = openLive();
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Custom")).toBeNull();

    fireEvent.click(tile("Europe"));
    expect(confirm).not.toHaveBeenCalled();
    expect(gameActions.changeSettings.mock.calls).toEqual([[RULE_PRESETS.Europe]]);
    expect(tile("Europe").getAttribute("aria-pressed")).toBe("true");
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("false");
    expect(pressed("Second Card")).toBe("Dealt after you play");

    fireEvent.click(box("dealerDrawsOnPlayerBust"));
    expect(customTile()).toBeTruthy();
    expect(tile("Europe").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(box("dealerDrawsOnPlayerBust"));
    expect(customTile()).toBeNull();
    expect(tile("Europe").getAttribute("aria-pressed")).toBe("true");
  });

  it("asks once before a preset resets a round in progress", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { gameActions } = openLive({ phase: GamePhases.PLAYER_TURN });
    fireEvent.click(tile("Europe"));
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tile("Europe"));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(gameActions.changeSettings).toHaveBeenCalledTimes(1);
    expect(tile("Europe").getAttribute("aria-pressed")).toBe("true");
  });

  it("applies table rules without asking before a round, and Save-pattern settings, speed or rebet any time", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { gameActions, rerender } = open();
    fireEvent.click(screen.getByLabelText("includeCutCard"));
    fireEvent.click(screen.getByLabelText("Save includeCutCard"));
    fireEvent.click(option("Second Card", "Dealt after you play"));
    expect(confirm).not.toHaveBeenCalled();
    expect(gameActions.changeSetting.mock.calls).toEqual([["includeCutCard", false]]);
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ dealerHoleBehaviour: "drawAfter", blackjackPaysImmediately: false }]]);
    rerender(<Settings />);
    fireEvent.click(screen.getByRole("tab", { name: "Dev" }));
    fireEvent.change(screen.getByLabelText("playTimeout"), { target: { value: "500" } });
    expect(screen.getByText("Rate of Play: 0.5 seconds")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Save playTimeout"));
    fireEvent.click(screen.getByRole("tab", { name: "Game" }));
    fireEvent.click(screen.getByLabelText("resetInitialBet"));
    fireEvent.click(screen.getByLabelText("Save resetInitialBet"));
    expect(gameActions.changeSetting).toHaveBeenCalledWith("playTimeout", 500);
    expect(gameActions.changeSetting).toHaveBeenCalledWith("resetInitialBet", true);
  });

  it("warns about a reset only once a game exists", () => {
    renderUI(<Settings />, { path: "/settings?tab=game" });
    fireEvent.click(screen.getByLabelText("includeCutCard"));
    expect(screen.queryByText("Changing this setting will reset the current game.")).toBeNull();
    fireEvent.click(screen.getByText("Back to game"));
    expect(location()).toBe("/game");
    cleanup();
    open({ phase: GamePhases.PLAYER_TURN });
    fireEvent.click(screen.getByLabelText("includeCutCard"));
    expect(screen.getByText("Changing this setting will reset the current game.")).toBeTruthy();
  });

  it("shows one tab at a time, as buttons, and keeps the open tab in the URL", () => {
    renderUI(<Settings />, { path: "/settings" });
    const tab = (name) => screen.getByRole("tab", { name });
    expect(tab("Player").getAttribute("aria-selected")).toBe("true");
    expect(tab("Player").tagName).toBe("BUTTON");
    expect(screen.getByText("Delete Profile")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Table rules" })).toBeNull();

    fireEvent.click(tab("Game"));
    expect(location()).toBe("/settings?tab=game");
    expect(tab("Game").getAttribute("aria-selected")).toBe("true");
    expect(tab("Player").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("group", { name: "Table rules" })).toBeTruthy();
    for (const group of ["Second Card", "Deck size: 6", "Max Hands After Splits: 4"]) expect(screen.getByRole("group", { name: group })).toBeTruthy();
    for (const key of ["dealerDrawsOnceOn21", "blackJackOnSplit"]) expect(box(key)).toBeTruthy();
    for (const key of ["includeCutCard", "resetInitialBet"]) expect(screen.getByLabelText(key)).toBeTruthy();
    expect(screen.queryByText("Delete Profile")).toBeNull();
    expect(screen.queryByLabelText("playTimeout")).toBeNull();

    fireEvent.click(tab("Dev"));
    expect(location()).toBe("/settings?tab=dev");
    expect(screen.getByLabelText("playTimeout")).toBeTruthy();
    expect(screen.getByLabelText("showCardCount")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Table rules" })).toBeNull();
    expect(queryBox("blackJackOnSplit")).toBeNull();
  });

  it("opens the Player tab for an unknown tab in the URL", () => {
    renderUI(<Settings />, { path: "/settings?tab=nope" });
    expect(screen.getByRole("tab", { name: "Player" }).getAttribute("aria-selected")).toBe("true");
  });

  it("offers 2, 3, 4 or Unlimited hands after splits, 4 by default", () => {
    const { gameActions } = openLive();
    expect(optionLabels("Max Hands After Splits: 4")).toEqual(["2", "3", "4", "Unlimited"]);
    expect(pressed("Max Hands After Splits: 4")).toBe("4");
    expect(screen.getByText("Max Hands After Splits: 4")).toBeTruthy();
    fireEvent.click(option("Max Hands After Splits: 4", "3"));
    expect(screen.getByText("Max Hands After Splits: 3")).toBeTruthy();
    expect(pressed("Max Hands After Splits: 3")).toBe("3");
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ maxSplitHands: 3 }]]);
    fireEvent.click(option("Max Hands After Splits: 3", "Unlimited"));
    expect(screen.getByText("Max Hands After Splits: Unlimited")).toBeTruthy();
    expect(gameActions.changeSettings).toHaveBeenLastCalledWith({ maxSplitHands: 0 });
  });

  it("picks which chips to show, never leaves none, and saves them in chip order", () => {
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL } });
    expect(screen.getByRole("group", { name: "Chips to show" })).toBeTruthy();
    const save = screen.getByLabelText("Save chipValues");
    expect(save.disabled).toBe(true);
    // Named by the visible text ("$1,000"); a string name matches exactly, so "$1" does not match "$1,000".
    const chipBox = (n) => screen.getByRole("checkbox", { name: `$${n.toLocaleString()}` });
    // Untick all but $25 and $5 (ticked last, saved first), then try to untick the last two.
    for (const chip of [1, 10, 50, 100, 1000, 5000, 10000, 20000, 50000, 100000]) fireEvent.click(chipBox(chip));
    expect(save.disabled).toBe(false);
    fireEvent.click(chipBox(5));
    expect(chipBox(25).disabled).toBe(true);
    expect(screen.getByText("At least one chip must stay selected.").id).toBe("chip-hint");
    expect(chipBox(25).getAttribute("aria-describedby")).toBe("chip-hint");
    expect(chipBox(1).hasAttribute("aria-describedby")).toBe(false);
    fireEvent.click(chipBox(5));
    fireEvent.click(save);
    expect(gameActions.changeSetting).toHaveBeenCalledWith("chipValues", "5,25");
    expect(screen.queryByText("Changing this setting will reset the current game.")).toBeNull();
  });

  it("shows settings that finish loading after the page opened, keeping unsaved edits", () => {
    const { gameState, rerender } = renderUI(<Settings />, { path: "/settings?tab=game" });
    fireEvent.click(screen.getByLabelText("includeCutCard"));
    gameState.settings = { ...gameState.settings, deckCount: 4, resetInitialBet: true, blackJackOnSplit: true };
    rerender(<Settings />);
    expect(pressed("Deck size: 4")).toBe("4");
    expect(screen.getByLabelText("resetInitialBet").checked).toBe(true);
    expect(box("blackJackOnSplit").checked).toBe(true);
    expect(screen.getByLabelText("includeCutCard").checked).toBe(false);
    expect(customTile()).toBeTruthy();
  });

  it("says so when a setting can't be saved to the account, and clears it after a good save", async () => {
    const changeSetting = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    renderUI(<Settings />, { path: "/settings?tab=dev", actions: { changeSetting } });
    fireEvent.click(screen.getByLabelText("showCardCount"));
    fireEvent.click(screen.getByLabelText("Save showCardCount"));
    expect((await screen.findByRole("status")).textContent).toContain("Couldn't save your settings");
    fireEvent.click(screen.getByLabelText("Save showCardCount"));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("says so when a table rule can't be saved to the account, and clears it after a good save; the notice is the only status", async () => {
    const changeSettings = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL }, actions: { changeSettings } });
    expect(screen.queryByRole("status")).toBeNull(); // the live house-edge line is not a status
    fireEvent.click(option("Surrender", "None"));
    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("Couldn't save your settings");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    fireEvent.click(option("Surrender", "None"));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("toggles the card count from the Dev tab without resetting the game", () => {
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=dev", game: { phase: GamePhases.PLAYER_TURN } });
    fireEvent.click(screen.getByLabelText("showCardCount"));
    expect(screen.queryByText("Changing this setting will reset the current game.")).toBeNull();
    fireEvent.click(screen.getByLabelText("Save showCardCount"));
    expect(gameActions.changeSetting).toHaveBeenCalledWith("showCardCount", false);
  });

  it("Back to game, then the header's Settings, returns to the same tab", () => {
    renderUI(<><Header /><Settings /></>, { path: "/settings?tab=dev" });
    fireEvent.click(screen.getByText("Back to game"));
    expect(location()).toBe("/game");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(location()).toBe("/settings?tab=dev");
    fireEvent.click(screen.getByRole("tab", { name: "Player" }));
    fireEvent.click(screen.getByText("Back to game"));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(location()).toBe("/settings?tab=player");
  });

  it("starts the profile form empty for a player with no names", () => {
    renderUI(<Settings />, { player: { player: { ...testPlayer, firstName: "", lastName: "" } } });
    expect(screen.getByText("First name is required.")).toBeTruthy();
  });
});

describe("App", () => {
  it("renders the header and the routed page", () => {
    renderUI(<App />, { path: "/" });
    expect(screen.getByText("BlakeJack")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
  });
});

describe("Settings auto deal (#88)", () => {
  const game = (settings = {}, phase = GamePhases.PRE_DEAL) => ({ phase, settings: { ...initialGameState.settings, ...settings } });
  const open = (settings, phase) => renderUI(<Settings />, { path: "/settings?tab=game", game: game(settings, phase) });

  it("shows Auto Deal only while Reset Bet is on, and its delay only while Auto Deal is on too (drafts count before Save)", () => {
    open();
    expect(screen.queryByLabelText("autoDeal")).toBeNull();
    expect(screen.queryByLabelText("autoDealDelay")).toBeNull();
    fireEvent.click(screen.getByLabelText("resetInitialBet"));
    expect(screen.getByLabelText("autoDeal").checked).toBe(false);
    expect(screen.queryByLabelText("autoDealDelay")).toBeNull();
    fireEvent.click(screen.getByLabelText("autoDeal"));
    expect(screen.getByLabelText("autoDealDelay")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("autoDeal"));
    expect(screen.queryByLabelText("autoDealDelay")).toBeNull();
    fireEvent.click(screen.getByLabelText("autoDeal"));
    fireEvent.click(screen.getByLabelText("resetInitialBet")); // Reset Bet off again hides both
    expect(screen.queryByLabelText("autoDeal")).toBeNull();
    expect(screen.queryByLabelText("autoDealDelay")).toBeNull();
  });

  it("is on the Game tab only", () => {
    renderUI(<Settings />, { path: "/settings?tab=dev", game: game({ resetInitialBet: true, autoDeal: true }) });
    expect(screen.queryByLabelText("autoDeal")).toBeNull();
    expect(screen.queryByLabelText("autoDealDelay")).toBeNull();
  });

  it("the delay slider runs 0 to 10 seconds in steps of 0.1, shows seconds, and saves milliseconds", () => {
    const { gameActions } = open({ resetInitialBet: true, autoDeal: true });
    const slider = screen.getByLabelText("autoDealDelay");
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(["0", "10000", "100", "3000"]);
    expect(screen.getByText("Auto Deal Delay: 3 seconds")).toBeTruthy();
    fireEvent.change(slider, { target: { value: "1500" } });
    expect(screen.getByText("Auto Deal Delay: 1.5 seconds")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Save autoDealDelay"));
    expect(gameActions.changeSetting).toHaveBeenCalledWith("autoDealDelay", 1500);
    cleanup();
    open({ resetInitialBet: true, autoDeal: true, autoDealDelay: 0 });
    expect(screen.getByText("Auto Deal Delay: 0 seconds")).toBeTruthy();
  });

  it("saves Auto Deal by itself", () => {
    const { gameActions } = open({ resetInitialBet: true });
    fireEvent.click(screen.getByLabelText("autoDeal"));
    fireEvent.click(screen.getByLabelText("Save autoDeal"));
    expect(gameActions.changeSetting).toHaveBeenCalledWith("autoDeal", true);
  });

  it("saving Reset Bet off sends one changeSettings with auto deal off too, and forgets the autoDeal draft", () => {
    const { gameActions, gameState, rerender } = open({ resetInitialBet: true });
    fireEvent.click(screen.getByLabelText("autoDeal")); // an unsaved draft: on
    fireEvent.click(screen.getByLabelText("resetInitialBet"));
    fireEvent.click(screen.getByLabelText("Save resetInitialBet"));
    expect(gameActions.changeSettings).toHaveBeenCalledTimes(1);
    expect(gameActions.changeSettings).toHaveBeenCalledWith({ resetInitialBet: false, autoDeal: false });
    expect(gameActions.changeSetting).not.toHaveBeenCalled();

    gameState.settings = { ...gameState.settings, resetInitialBet: false, autoDeal: false }; // what the provider does with it
    rerender(<Settings />);
    fireEvent.click(screen.getByLabelText("resetInitialBet")); // Reset Bet back on
    expect(screen.getByLabelText("autoDeal").checked).toBe(false); // not the stale draft
  });

  it("saving Reset Bet off also turns a saved Auto Deal off", () => {
    const { gameActions } = open({ resetInitialBet: true, autoDeal: true });
    fireEvent.click(screen.getByLabelText("resetInitialBet"));
    fireEvent.click(screen.getByLabelText("Save resetInitialBet"));
    expect(gameActions.changeSettings).toHaveBeenCalledWith({ resetInitialBet: false, autoDeal: false });
  });

  it("saving Reset Bet on is the ordinary single save", () => {
    const { gameActions } = open();
    fireEvent.click(screen.getByLabelText("resetInitialBet"));
    fireEvent.click(screen.getByLabelText("Save resetInitialBet"));
    expect(gameActions.changeSetting).toHaveBeenCalledWith("resetInitialBet", true);
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });

  it("reports a failed save of Reset Bet off like any other", async () => {
    const changeSettings = vi.fn().mockRejectedValue(new Error("offline"));
    renderUI(<Settings />, { path: "/settings?tab=game", game: game({ resetInitialBet: true, autoDeal: true }), actions: { changeSettings } });
    fireEvent.click(screen.getByLabelText("resetInitialBet"));
    fireEvent.click(screen.getByLabelText("Save resetInitialBet"));
    expect((await screen.findByRole("status")).textContent).toContain("Couldn't save your settings");
  });
});

describe("Settings table rules (#91)", () => {
  const withMode = (dealerHoleBehaviour) => ({ settings: { ...initialGameState.settings, dealerHoleBehaviour } });

  it("shows every catalogue rule on the Game tab, with the Vegas values chosen, and none on the other tabs", () => {
    open();
    const rules = visibleIn(initialGameState.settings);
    expect(rules.map((r) => r.key)).not.toContain("noHoleCardLoss");
    const label = (rule) => rule.label(selectedValue(rule, initialGameState.settings));
    for (const rule of rules) {
      const group = screen.getByRole("group", { name: label(rule) });
      expect(within(group).getAllByRole("button", { pressed: true }), rule.key).toHaveLength(1);
    }
    expect(pressed("Deck size: 6")).toBe("6");
    expect(pressed("Second Card")).toBe("Dealer peeks for blackjack");
    expect(pressed("Soft 17")).toBe("Hits");
    expect(pressed("Blackjack Pays")).toBe("3:2");
    expect(pressed("Insurance and Even Money")).toBe("On");
    expect(pressed("Double On")).toBe("Any two cards");
    expect(pressed("Double After a Split")).toBe("On");
    expect(pressed("Max Hands After Splits: 4")).toBe("4");
    expect(pressed("Resplit Aces")).toBe("Off");
    expect(pressed("Hit Split Aces")).toBe("Off");
    expect(pressed("Surrender")).toBe("Late");
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(GROUPS);
    const labels = rules.map(label);
    for (const tab of ["Player", "Dev"]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      for (const name of labels) expect(screen.queryByRole("group", { name }), `${tab} ${name}`).toBeNull();
    }
  });

  it("offers the deck sizes 1, 2, 4, 6 and 8, and a saved 3, 5 or 7 shows as one extra chosen chip that goes once another is picked", () => {
    openLive();
    expect(optionLabels("Deck size: 6")).toEqual(["1", "2", "4", "6", "8"]);
    cleanup();
    for (const decks of [3, 5, 7]) {
      openLive({ settings: { ...initialGameState.settings, deckCount: decks } });
      const group = `Deck size: ${decks}`;
      expect(optionLabels(group)).toContain(`${decks} decks`);
      expect(optionLabels(group)).toHaveLength(6);
      expect(pressed(group)).toBe(`${decks} decks`);
      fireEvent.click(option(group, "6"));
      expect(optionLabels("Deck size: 6")).toEqual(["1", "2", "4", "6", "8"]);
      cleanup();
    }
  });

  it("offers each choice by its plain name", () => {
    open();
    expect(optionLabels("Blackjack Pays")).toEqual(["3:2", "6:5"]);
    expect(optionLabels("Double On")).toEqual(["Any two cards", "Hard 9 to 11", "Hard 10 to 11"]);
    expect(optionLabels("Soft 17")).toEqual(["Stands", "Hits"]);
    expect(optionLabels("Second Card")).toEqual(["Dealer peeks for blackjack", "Dealt after you play"]);
    expect(optionLabels("Surrender")).toEqual(["None", "Late", "Early", "Early (not against an ace)"]);
  });

  it("shows each choice's effect on the house edge, and none on the chosen one", () => {
    open();
    const named = (group, label, delta) => rulesGroup(group).getByRole("button", { name: new RegExp(`^${escape(label)}\\s*${escape(delta)}\\s*house edge$`) });
    expect(named("Blackjack Pays", "6:5", "+1.39%").textContent).toBe("6:5 +1.39% house edge");
    named("Soft 17", "Stands", "-0.22%");
    named("Double On", "Hard 9 to 11", "+0.09%");
    named("Surrender", "Early", "-0.56%");
    expect(rulesGroup("Blackjack Pays").getByRole("button", { name: "3:2" }).textContent).toBe("3:2");
    expect(rulesGroup("Insurance and Even Money").getByRole("button", { name: "Off" })).toBeTruthy(); // insurance is not counted
  });

  it("shows 'if the dealer has blackjack, you lose' only when the dealer has no hole card", () => {
    open(withMode("drawEarly_Check"));
    expect(screen.queryByRole("group", { name: NO_HOLE })).toBeNull();
    cleanup();
    for (const mode of ["drawAfter", "drawEarly_NoCheck"]) {
      open(withMode(mode));
      expect(pressed(NO_HOLE)).toBe("Only your first bet");
      expect(optionLabels(NO_HOLE)).toEqual(["Everything you staked", "Only your first bet"]);
      cleanup();
    }
  });

  it("shows it as soon as the dealer mode is changed to one with no peek, and hides it again", () => {
    openLive();
    expect(screen.queryByRole("group", { name: NO_HOLE })).toBeNull();
    fireEvent.click(option("Second Card", "Dealt after you play"));
    expect(screen.getByRole("group", { name: NO_HOLE })).toBeTruthy();
    fireEvent.click(option("Second Card", "Dealer peeks for blackjack"));
    expect(screen.queryByRole("group", { name: NO_HOLE })).toBeNull();
  });

  it("hides Resplit Aces when only two hands are allowed, and brings it back with more", () => {
    openLive();
    expect(screen.getByRole("group", { name: "Resplit Aces" })).toBeTruthy();
    fireEvent.click(option("Max Hands After Splits: 4", "2"));
    expect(screen.queryByRole("group", { name: "Resplit Aces" })).toBeNull();
    fireEvent.click(option("Max Hands After Splits: 2", "3"));
    expect(screen.getByRole("group", { name: "Resplit Aces" })).toBeTruthy();
  });

  it("applies each rule at once with the right value", () => {
    const { gameActions } = openLive(withMode("drawAfter"));
    fireEvent.click(option("Soft 17", "Stands"));
    fireEvent.click(option("Blackjack Pays", "6:5"));
    fireEvent.click(option("Double On", "Hard 9 to 11"));
    fireEvent.click(option("Double After a Split", "Off"));
    fireEvent.click(option("Resplit Aces", "On"));
    fireEvent.click(option("Hit Split Aces", "On"));
    fireEvent.click(option(NO_HOLE, "Everything you staked"));
    expect(gameActions.changeSettings.mock.calls).toEqual([
      [{ dealerHitsSoft17: false }], [{ blackjackPayout: "6:5" }], [{ doubleOn: "9-11" }], [{ doubleAfterSplit: false }],
      [{ resplitAces: true }], [{ hitSplitAces: true }], [{ noHoleCardLoss: "all" }],
    ]);
    expect(gameActions.changeSetting).not.toHaveBeenCalled();
  });

  it("shows the plain-language hint of the chosen option, and of a checkbox", () => {
    openLive();
    expect(screen.getByText("A $10 blackjack wins $15.")).toBeTruthy();
    fireEvent.click(option("Blackjack Pays", "6:5"));
    expect(screen.queryByText("A $10 blackjack wins $15.")).toBeNull();
    expect(screen.getByText(/A \$10 blackjack wins only \$12/)).toBeTruthy();
    expect(screen.getByText("You may double on any first two cards.")).toBeTruthy();
    fireEvent.click(option("Double On", "Hard 10 to 11"));
    expect(screen.getByText(/only on a hard total of 10 or 11/)).toBeTruthy();
    expect(screen.getByText("Off: each split ace gets one card and stands.")).toBeTruthy();
    expect(screen.getByText("Allows doubling on a hand made by splitting.")).toBeTruthy();
    expect(screen.getByText(/Hits: the dealer draws on a hand like ace-6/)).toBeTruthy();
  });

  it("a rule click during a round asks once; Cancel changes nothing", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { gameActions } = openLive({ phase: GamePhases.PLAYER_TURN });
    fireEvent.click(option("Resplit Aces", "On"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(pressed("Resplit Aces")).toBe("Off");
    fireEvent.click(option("Resplit Aces", "On"));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ resplitAces: true }]]);
    expect(pressed("Resplit Aces")).toBe("On");
  });

  it("every table rule asks during a round, the dealer toggles in Advanced too, and a House variation never does", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { gameActions } = open({ phase: GamePhases.DEALER_TURN });
    for (const [group, label] of [["Soft 17", "Stands"], ["Blackjack Pays", "6:5"], ["Surrender", "None"], ["Second Card", "Dealt after you play"], ["Insurance and Even Money", "Off"]]) {
      fireEvent.click(option(group, label));
    }
    for (const key of ["blackJackOnSplit", "dealerDrawsOnceOn21", "dealerHoleNoCheck"]) fireEvent.click(box(key));
    expect(confirm).toHaveBeenCalledTimes(8);
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    confirm.mockClear();
    for (const key of ["tripleDown", "doubleFaceDown"]) fireEvent.click(box(key));
    expect(confirm).not.toHaveBeenCalled();
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ tripleDown: true }], [{ doubleFaceDown: true }]]);
  });

  it("applying a preset sends all 17 rule keys in one call, and the tiles name the five presets", () => {
    const { gameActions } = openLive();
    const tiles = within(screen.getByRole("group", { name: "Table rules" })).getAllByRole("button");
    expect(tiles.map((t) => t.querySelector("strong").textContent)).toEqual(["Vegas", "Atlantic City", "Europe", "Australia", "Singapore"]);
    fireEvent.click(tile("Singapore"));
    expect(gameActions.changeSettings).toHaveBeenCalledTimes(1);
    const sent = gameActions.changeSettings.mock.calls[0][0];
    expect(Object.keys(sent)).toHaveLength(17);
    expect(sent).toMatchObject({ doubleOn: "any", maxSplitHands: 3, deckCount: 6, dealerHitsSoft17: false, noHoleCardLoss: "original" });
    expect(pressed("Double On")).toBe("Any two cards");
    expect(pressed("Max Hands After Splits: 3")).toBe("3");
    expect(pressed(NO_HOLE)).toBe("Only your first bet");
  });

  it("changing a single rule of a preset shows Custom", () => {
    openLive();
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(option("Soft 17", "Stands"));
    expect(customTile()).toBeTruthy();
    expect(presetTiles().filter((t) => t.getAttribute("aria-pressed") === "true")).toHaveLength(0);
    fireEvent.click(option("Soft 17", "Hits"));
    expect(customTile()).toBeNull();
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("true");
  });

  it("a saved table that matches no preset (a legacy two-deck table) shows Custom, with its own summary and edge", () => {
    open({ settings: { ...initialGameState.settings, deckCount: 2, dealerHitsSoft17: false, maxSplitHands: 0, noHoleCardLoss: "all" } });
    expect(customTile()).toBeTruthy();
    expect(customTile().textContent).toContain("2 decks · Dealer stands on soft 17 · 3:2 · Late surrender");
    expect(customTile().textContent).toContain("Split any number of hands");
  });

  describe("surrender", () => {
    it("is four choices on the Game tab, set to Late for Vegas, in every dealer mode", () => {
      for (const mode of ["drawEarly_Check", "drawEarly_NoCheck", "drawAfter"]) {
        open(withMode(mode));
        expect(pressed("Surrender")).toBe("Late");
        expect(optionLabels("Surrender")).toEqual(["None", "Late", "Early", "Early (not against an ace)"]);
        cleanup();
      }
    });

    it("shows the hint of the selected option, and the hint follows the selection", () => {
      openLive();
      expect(screen.getByText(/Give up half your bet on your first two cards\. If the dealer has blackjack/)).toBeTruthy();
      fireEvent.click(option("Surrender", "None"));
      expect(screen.getByText("You can't give up a hand.")).toBeTruthy();
      fireEvent.click(option("Surrender", "Early"));
      expect(screen.getByText(/before the dealer checks for blackjack\. You keep the half even if the dealer has one\./)).toBeTruthy();
      fireEvent.click(option("Surrender", "Early (not against an ace)"));
      expect(screen.getByText(/not offered when the dealer shows an ace\./)).toBeTruthy();
    });

    it("applies the chosen value at once, as one rule", () => {
      const { gameActions } = open();
      expect(screen.queryByLabelText("Save surrender")).toBeNull();
      fireEvent.click(option("Surrender", "Early"));
      expect(gameActions.changeSettings.mock.calls).toEqual([[{ surrender: "early" }]]);
    });

    it("a change during a round asks first", () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { gameActions } = open({ phase: GamePhases.PLAYER_TURN });
      fireEvent.click(option("Surrender", "None"));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(gameActions.changeSettings).not.toHaveBeenCalled();
    });

    it("the Singapore preset applies earlyNoAce, and Europe turns it off", () => {
      const { gameActions } = openLive();
      fireEvent.click(tile("Singapore"));
      expect(gameActions.changeSettings.mock.calls[0][0].surrender).toBe("earlyNoAce");
      expect(pressed("Surrender")).toBe("Early (not against an ace)");
      fireEvent.click(tile("Europe"));
      expect(gameActions.changeSettings.mock.calls[1][0].surrender).toBe("none");
      expect(pressed("Surrender")).toBe("None");
    });

    it("a Vegas table with surrender none (what a version 2 save becomes) shows Custom", () => {
      open({ settings: { ...initialGameState.settings, surrender: "none" } });
      expect(customTile()).toBeTruthy();
    });
  });
});

describe("Settings: insurance and even money (#91)", () => {
  const TEXT = /When the dealer shows an ace you may insure for half your bet; it pays 2:1 if the dealer has blackjack\. With your own blackjack you may take even money \(1:1\) at once\./;
  const GROUP = "Insurance and Even Money";

  it("is On / Off on the Game tab, on for Vegas, named 'Insurance and Even Money', with its hint", () => {
    open();
    expect(optionLabels(GROUP)).toEqual(["On", "Off"]);
    expect(pressed(GROUP)).toBe("On");
    expect(screen.getByText(GROUP)).toBeTruthy();
    expect(screen.getByText(TEXT)).toBeTruthy();
  });

  it("is not on the Player or Dev tabs", () => {
    open();
    for (const tab of ["Player", "Dev"]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      expect(screen.queryByRole("group", { name: GROUP }), tab).toBeNull();
    }
  });

  it("is shown in every dealer mode", () => {
    for (const dealerHoleBehaviour of ["drawEarly_Check", "drawEarly_NoCheck", "drawAfter"]) {
      open({ settings: { ...initialGameState.settings, dealerHoleBehaviour } });
      expect(screen.getByRole("group", { name: GROUP }), dealerHoleBehaviour).toBeTruthy();
      cleanup();
    }
  });

  it("shows a table with insurance off as Off", () => {
    open({ settings: { ...initialGameState.settings, insurance: false } });
    expect(pressed(GROUP)).toBe("Off");
  });

  it("applies Off at once, with nothing but insurance in the patch", () => {
    const { gameActions } = open();
    fireEvent.click(option(GROUP, "Off"));
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ insurance: false }]]);
    expect(screen.queryByLabelText("Save insurance")).toBeNull();
  });

  it("a change during a round asks first (it is a table setting)", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN });
    fireEvent.click(option(GROUP, "Off"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });

  it("also asks while the table waits at the offers or the peek (they count as mid-round)", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    for (const phase of [GamePhases.OFFERS, GamePhases.PEEK]) {
      confirm.mockClear();
      open({ phase });
      fireEvent.click(option(GROUP, "Off"));
      expect(confirm, phase).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it("every preset applies insurance on", () => {
    const { gameActions } = open({ settings: { ...initialGameState.settings, insurance: false } });
    for (const name of ["Vegas", "Atlantic City", "Europe", "Australia", "Singapore"]) fireEvent.click(tile(name));
    expect(gameActions.changeSettings.mock.calls.map(([sent]) => sent.insurance)).toEqual([true, true, true, true, true]);
  });

  it("switching it off on a preset table shows Custom, and switching it back shows the preset again", () => {
    openLive();
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(option(GROUP, "Off"));
    expect(customTile()).toBeTruthy();
    fireEvent.click(option(GROUP, "On"));
    expect(customTile()).toBeNull();
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("true");
  });

  it("a saved table with insurance off (a version 1 to 3 save) shows Custom, for every preset's other rules", () => {
    for (const preset of Object.values(RULE_PRESETS)) {
      open({ settings: { ...initialGameState.settings, ...preset, insurance: false } });
      expect(customTile()).toBeTruthy();
      cleanup();
    }
  });
});

describe("Settings rules section (#91)", () => {
  const settingsWith = (patch) => ({ settings: { ...initialGameState.settings, ...patch } });
  const edgeLine = () => document.querySelector("[aria-live='polite']").textContent;

  it("shows five preset tiles, each with its name, its two summary lines and its house edge; the current one is pressed", () => {
    open();
    for (const [name, preset] of Object.entries(RULE_PRESETS)) {
      const [line1, line2] = ruleSummary(preset);
      const button = tile(name);
      expect(button.textContent).toBe(`${name}${line1}${line2}≈ about ${formatEdge(houseEdge(preset))} house edge`);
      expect(button.getAttribute("aria-pressed")).toBe(String(name === "Vegas"));
    }
    expect(tile("Vegas").textContent).toBe("Vegas6 decks · Dealer hits soft 17 · 3:2 · Late surrenderDealer peeks · Double on any two cards · Split up to 4 hands≈ about 0.6% house edge");
    expect(tile("Atlantic City").textContent).toContain("about 0.4% house edge");
    expect(tile("Singapore").textContent).toContain("about 0.2% house edge");
  });

  it("the tile's spoken edge reads 'about 0.6% house edge', while the sign '≈' is hidden from screen readers", () => {
    open();
    const edge = tile("Vegas").querySelector(".rule-edge");
    expect(edge.querySelector("[aria-hidden='true']").textContent).toBe("≈ ");
    expect(edge.querySelector(".sr-only").textContent).toBe("about ");
    expect(screen.getAllByRole("button", { name: /about\s*0\.6%\s*house edge$/ }).map((b) => b.querySelector("strong").textContent)).toEqual(["Vegas", "Europe"]);
  });

  it("shows no Custom tile for a preset, and a non-interactive Custom tile for any other table", () => {
    open();
    expect(customTile()).toBeNull();
    expect(screen.queryByText("Custom")).toBeNull();
    cleanup();
    const { gameActions } = open(settingsWith({ blackjackPayout: "6:5" }));
    const custom = customTile();
    expect(custom.tagName).toBe("DIV");
    expect(custom.getAttribute("aria-current")).toBe("true");
    expect(custom.querySelector("strong").textContent).toBe("Custom");
    expect(custom.textContent).toContain("6 decks · Dealer hits soft 17 · 6:5 · Late surrender");
    expect(custom.textContent).toContain(`about ${formatEdge(houseEdge({ ...RULE_PRESETS.Vegas, blackjackPayout: "6:5" }))} house edge`);
    expect(custom.textContent).toContain("about 2.0% house edge");
    expect(presetTiles()).toHaveLength(5);
    expect(presetTiles().some((t) => t.getAttribute("aria-pressed") === "true")).toBe(false);
    fireEvent.click(custom); // it is not a control
    expect(screen.queryAllByRole("button", { name: /^Custom/ })).toHaveLength(0);
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });

  it("a pre-#91 table (the legacy rules) shows Custom", () => {
    open(settingsWith({ ...LEGACY_RULES }));
    expect(customTile()).toBeTruthy();
    expect(customTile().textContent).toContain("2 decks · Dealer stands on soft 17");
  });

  it("clicking the tile that is already chosen does nothing, even during a round", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN });
    fireEvent.click(tile("Vegas"));
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("clicking the option that is already chosen does nothing, even during a round", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN });
    for (const [group, label] of [["Deck size: 6", "6"], ["Soft 17", "Hits"], ["Surrender", "Late"], ["Second Card", "Dealer peeks for blackjack"], ["Insurance and Even Money", "On"]]) {
      fireEvent.click(option(group, label));
    }
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("shows the estimate and how to read it: the note, and a live line for this table", () => {
    open();
    expect(screen.getByText(/estimate for a player who uses basic strategy/)).toBeTruthy();
    expect(screen.getByText(/approximate/)).toBeTruthy();
    expect(screen.getByText(/A plus sign means a worse deal for you/)).toBeTruthy();
    expect(edgeLine()).toBe("This table: ≈ about 0.6% house edge (estimate)");
  });

  it("the live line follows the applied table", () => {
    const { gameState, rerender } = open();
    gameState.settings = { ...gameState.settings, blackjackPayout: "6:5" };
    rerender(<Settings />);
    expect(edgeLine()).toBe("This table: ≈ about 2.0% house edge (estimate)");
  });

  it("the notice is still the only status, and the house-edge line is announced politely instead", () => {
    open();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("[aria-live='polite']")).toBeTruthy();
  });

  it("Customize, House variations and Advanced are three separate collapsed groups", () => {
    open();
    const details = [...document.querySelectorAll("details")];
    expect(details.map((d) => d.querySelector("summary").textContent)).toEqual(["Customize rules", "House variations", "Advanced"]);
    for (const d of details) expect(d.open).toBe(false);
    expect(within(details[0]).queryByRole("group", { name: "Surrender" })).toBeTruthy();
    expect(within(details[1]).getAllByRole("checkbox").map((c) => c.closest("label").textContent)).toEqual(["tripleDown", "tripleDrawsOnBust", "doubleFaceDown"].map((k) => TOGGLE_NAME[k]));
    expect(within(details[2]).getAllByRole("checkbox").map((c) => c.closest("label").textContent)).toEqual([
      "blackJackOnSplit", "dealerDrawsOnPlayerBlackjack", "blackjackPaysImmediately", "dealerDrawsOnceOn21", "dealerDrawsOnPlayerBust", "dealerHoleNoCheck"].map((k) => TOGGLE_NAME[k]));
    expect(within(details[1]).getByText(/not casino rules/)).toBeTruthy();
    expect(within(details[2]).getByText(/makes the table Custom/)).toBeTruthy();
  });

  it("a change in Advanced makes the table Custom, and putting it back brings the preset back", () => {
    const { gameActions } = openLive();
    fireEvent.click(box("blackJackOnSplit"));
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ blackJackOnSplit: true }]]);
    expect(customTile()).toBeTruthy();
    expect(customTile().textContent).toContain("about 0.6% house edge"); // not counted: the same estimate as Vegas
    fireEvent.click(box("blackJackOnSplit"));
    expect(customTile()).toBeNull();
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("true");
  });

  it("a change in House variations does not change the table, and its edge is not counted", () => {
    const { gameActions } = openLive();
    for (const key of ["tripleDown", "doubleFaceDown"]) fireEvent.click(box(key));
    expect(gameActions.changeSettings).toHaveBeenCalledTimes(2);
    expect(customTile()).toBeNull();
    expect(edgeLine()).toBe("This table: ≈ about 0.6% house edge (estimate)");
  });

  it("'Dealer doesn't check the hole card' writes the mode and the blackjack timing, makes the table Custom, and is undone by unticking", () => {
    const { gameActions } = openLive();
    const noCheck = box("dealerHoleNoCheck");
    expect(noCheck.checked).toBe(false);
    expect(screen.getByText("Dealer doesn't check the hole card")).toBeTruthy();
    fireEvent.click(noCheck);
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ dealerHoleBehaviour: "drawEarly_NoCheck", blackjackPaysImmediately: false }]]);
    expect(noCheck.checked).toBe(true);
    expect(customTile()).toBeTruthy();
    expect(screen.getByRole("group", { name: NO_HOLE })).toBeTruthy(); // no peek: a dealer blackjack is found after the stakes
    fireEvent.click(noCheck);
    expect(gameActions.changeSettings).toHaveBeenLastCalledWith({ dealerHoleBehaviour: "drawEarly_Check", blackjackPaysImmediately: true });
    expect(noCheck.checked).toBe(false);
    expect(tile("Vegas").getAttribute("aria-pressed")).toBe("true"); // the pairing restores the preset's own values
  });

  it("is hidden in EU, where there is no hole card to check", () => {
    open({ settings: { ...initialGameState.settings, ...RULE_PRESETS.Europe } });
    expect(queryBox("dealerHoleNoCheck")).toBeNull();
    expect(box("dealerDrawsOnceOn21")).toBeTruthy();
  });

  it("Second Card shows 'Dealer peeks' chosen for a US no-peek table, and clicking it does nothing", () => {
    const { gameActions } = open(settingsWith({ dealerHoleBehaviour: "drawEarly_NoCheck", blackjackPaysImmediately: false }));
    expect(pressed("Second Card")).toBe("Dealer peeks for blackjack");
    expect(box("dealerHoleNoCheck").checked).toBe(true);
    fireEvent.click(option("Second Card", "Dealer peeks for blackjack"));
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    fireEvent.click(option("Second Card", "Dealt after you play"));
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ dealerHoleBehaviour: "drawAfter", blackjackPaysImmediately: false }]]);
  });

  it("Second Card also sets when a blackjack pays, so hand-built Atlantic City rules equal the Atlantic City tile", () => {
    const { gameActions } = openLive();
    fireEvent.click(option("Second Card", "Dealt after you play"));
    expect(customTile()).toBeTruthy();
    fireEvent.click(option("Deck size: 6", "8"));
    fireEvent.click(option("Soft 17", "Stands"));
    expect(gameActions.changeSettings).toHaveBeenCalledTimes(3);
    expect(customTile()).toBeNull();
    expect(tile("Atlantic City").getAttribute("aria-pressed")).toBe("true");
    expect(box("blackjackPaysImmediately").checked).toBe(false);
  });

  it("a blackjack timing the player set on purpose in Advanced is kept when the dealer mode changes; one that still follows the mode moves with it", () => {
    // Vegas with "Blackjack Pays Immediately" switched off: it no longer follows the peek, so neither Second Card nor the checkbox touches it.
    const off = settingsWith({ blackjackPaysImmediately: false });
    let view = open(off);
    fireEvent.click(option("Second Card", "Dealt after you play"));
    fireEvent.click(box("dealerHoleNoCheck"));
    expect(view.gameActions.changeSettings.mock.calls).toEqual([[{ dealerHoleBehaviour: "drawAfter" }], [{ dealerHoleBehaviour: "drawEarly_NoCheck" }]]);
    cleanup();
    // An EU table that pays a blackjack at once on purpose keeps doing so when the dealer starts to peek.
    view = open(settingsWith({ ...RULE_PRESETS.Europe, blackjackPaysImmediately: true }));
    fireEvent.click(option("Second Card", "Dealer peeks for blackjack"));
    expect(view.gameActions.changeSettings.mock.calls).toEqual([[{ dealerHoleBehaviour: "drawEarly_Check" }]]);
    cleanup();
    // The same EU table with the preset's own timing (waits) moves to the peek's.
    view = open(settingsWith(RULE_PRESETS.Europe));
    fireEvent.click(option("Second Card", "Dealer peeks for blackjack"));
    expect(view.gameActions.changeSettings.mock.calls).toEqual([[{ dealerHoleBehaviour: "drawEarly_Check", blackjackPaysImmediately: true }]]);
  });

  it("the Advanced checkboxes show the saved values, and disable only Always-draw (triple down off) and a forced blackjack payment", () => {
    open(settingsWith({ ...RULE_PRESETS.Europe, dealerDrawsOnPlayerBlackjack: false }));
    const forced = box("blackjackPaysImmediately");
    expect([forced.checked, forced.disabled]).toEqual([true, true]);
    expect(box("dealerDrawsOnPlayerBlackjack").disabled).toBe(false);
    expect(box("tripleDrawsOnBust").disabled).toBe(true);
  });
});
