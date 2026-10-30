import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
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
import { initialGameState } from "../utils/gameReducer";

const location = () => screen.getByTestId("location").textContent;
const type = (label, value) => fireEvent.change(screen.getByPlaceholderText(label), { target: { value } });
// Lets a rejected or resolved async handler finish.
const flush = () => act(async () => {});

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

  it("saves a table setting, confirming first when a round is in play", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PLAYER_TURN } });
    const save = screen.getByLabelText("Save deckCount");
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("deckCount"), { target: { value: "4" } });
    expect(screen.getByText("Deck size: 4")).toBeTruthy();
    expect(screen.getByText("Changing this setting will reset the current game.")).toBeTruthy();
    fireEvent.click(save);
    expect(gameActions.changeSetting).not.toHaveBeenCalled();
    fireEvent.click(save);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(gameActions.changeSetting).toHaveBeenCalledWith("deckCount", 4);
  });

  it("offers the dealer rule options, and forces blackjack-pays-now when the EU dealer won't draw on it", () => {
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL } });
    expect(screen.queryByText(/NoDraw21/)).toBeNull();
    const paysNow = screen.getByLabelText("blackjackPaysImmediately");
    fireEvent.click(paysNow);
    expect([paysNow.checked, paysNow.disabled]).toEqual([false, false]);

    fireEvent.change(screen.getByLabelText("dealerHoleBehaviour"), { target: { value: "drawAfter" } });
    fireEvent.click(screen.getByLabelText("dealerDrawsOnPlayerBlackjack"));
    expect([paysNow.checked, paysNow.disabled]).toEqual([true, true]);

    for (const key of ["dealerDrawsOnceOn21", "dealerDrawsOnPlayerBust"]) {
      fireEvent.click(screen.getByLabelText(key));
      fireEvent.click(screen.getByLabelText(`Save ${key}`));
    }
    fireEvent.click(screen.getByLabelText("Save dealerDrawsOnPlayerBlackjack"));
    expect(gameActions.changeSetting.mock.calls).toEqual([
      ["dealerDrawsOnceOn21", true], ["dealerDrawsOnPlayerBust", true], ["dealerDrawsOnPlayerBlackjack", false]]);
  });

  it("offers triple down, and only lets the always-draw option be changed while it is on", () => {
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL } });
    const draws = screen.getByLabelText("tripleDrawsOnBust");
    expect(draws.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("tripleDown"));
    expect(draws.disabled).toBe(false);
    fireEvent.click(draws);
    fireEvent.click(screen.getByLabelText("Save tripleDown"));
    fireEvent.click(screen.getByLabelText("Save tripleDrawsOnBust"));
    expect(gameActions.changeSetting.mock.calls).toEqual([["tripleDown", true], ["tripleDrawsOnBust", true]]);
    expect(screen.getByLabelText("rulePreset").value).toBe("Vegas");
  });

  it("offers the face-down double option, off by default", () => {
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL } });
    const faceDown = screen.getByLabelText("doubleFaceDown");
    expect(faceDown.checked).toBe(false);
    expect(screen.getByText("Double Down Card Face Down")).toBeTruthy();
    fireEvent.click(faceDown);
    fireEvent.click(screen.getByLabelText("Save doubleFaceDown"));
    expect(gameActions.changeSetting).toHaveBeenCalledWith("doubleFaceDown", true);
  });

  it("shows the always-draw option unticked while triple down is off, without losing the saved choice", () => {
    renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL, settings: { ...initialGameState.settings, tripleDrawsOnBust: true } } });
    const draws = screen.getByLabelText("tripleDrawsOnBust");
    expect([draws.disabled, draws.checked]).toEqual([true, false]);
    fireEvent.click(screen.getByLabelText("tripleDown"));
    expect([draws.disabled, draws.checked]).toEqual([false, true]);
  });

  it("applies a rules preset in one step, and shows Custom once a rule is changed", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL } });
    const preset = screen.getByLabelText("rulePreset");
    expect(preset.value).toBe("Vegas");
    expect(screen.getByRole("option", { name: "Custom" }).disabled).toBe(true);

    fireEvent.change(preset, { target: { value: "Europe" } });
    expect(confirm).not.toHaveBeenCalled();
    expect(gameActions.changeSettings).toHaveBeenCalledWith(RULE_PRESETS.Europe);
    expect(preset.value).toBe("Europe");
    expect(screen.getByLabelText("dealerHoleBehaviour").value).toBe("drawAfter");

    fireEvent.click(screen.getByLabelText("dealerDrawsOnPlayerBust"));
    expect(preset.value).toBe("Custom");
    fireEvent.click(screen.getByLabelText("dealerDrawsOnPlayerBust"));
    expect(preset.value).toBe("Europe");
  });

  it("asks once before a preset resets a round in progress", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PLAYER_TURN } });
    const preset = screen.getByLabelText("rulePreset");
    fireEvent.change(preset, { target: { value: "Europe" } });
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(preset.value).toBe("Vegas");
    fireEvent.change(preset, { target: { value: "Europe" } });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(gameActions.changeSettings).toHaveBeenCalledTimes(1);
  });

  it("saves table settings without asking before a round, and speed or rebet any time", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { gameActions, rerender } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL } });
    fireEvent.click(screen.getByLabelText("includeCutCard"));
    fireEvent.click(screen.getByLabelText("Save includeCutCard"));
    fireEvent.change(screen.getByLabelText("dealerHoleBehaviour"), { target: { value: "drawAfter" } });
    expect(screen.getByText("Draw After (EU)")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Save dealerHoleBehaviour"));
    expect(confirm).not.toHaveBeenCalled();
    expect(gameActions.changeSetting.mock.calls).toEqual([["includeCutCard", false], ["dealerHoleBehaviour", "drawAfter"]]);
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
    fireEvent.click(screen.getByLabelText("blackJackOnSplit"));
    expect(screen.queryByText("Changing this setting will reset the current game.")).toBeNull();
    fireEvent.click(screen.getByText("Back to game"));
    expect(location()).toBe("/game");
  });

  it("shows one tab at a time, as buttons, and keeps the open tab in the URL", () => {
    renderUI(<Settings />, { path: "/settings" });
    const tab = (name) => screen.getByRole("tab", { name });
    expect(tab("Player").getAttribute("aria-selected")).toBe("true");
    expect(tab("Player").tagName).toBe("BUTTON");
    expect(screen.getByText("Delete Profile")).toBeTruthy();
    expect(screen.queryByLabelText("deckCount")).toBeNull();

    fireEvent.click(tab("Game"));
    expect(location()).toBe("/settings?tab=game");
    expect(tab("Game").getAttribute("aria-selected")).toBe("true");
    expect(tab("Player").getAttribute("aria-selected")).toBe("false");
    for (const key of ["rulePreset", "dealerHoleBehaviour", "dealerDrawsOnceOn21", "deckCount", "includeCutCard", "resetInitialBet", "blackJackOnSplit", "maxSplitHands"]) {
      expect(screen.getByLabelText(key)).toBeTruthy();
    }
    expect(screen.queryByText("Delete Profile")).toBeNull();
    expect(screen.queryByLabelText("playTimeout")).toBeNull();

    fireEvent.click(tab("Dev"));
    expect(location()).toBe("/settings?tab=dev");
    expect(screen.getByLabelText("playTimeout")).toBeTruthy();
    expect(screen.getByLabelText("showCardCount")).toBeTruthy();
    expect(screen.queryByLabelText("deckCount")).toBeNull();
  });

  it("opens the Player tab for an unknown tab in the URL", () => {
    renderUI(<Settings />, { path: "/settings?tab=nope" });
    expect(screen.getByRole("tab", { name: "Player" }).getAttribute("aria-selected")).toBe("true");
  });

  it("offers 2, 3, 4 or Unlimited hands after splits, 4 by default", () => {
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL } });
    const select = screen.getByLabelText("maxSplitHands");
    expect([...select.options].map((o) => o.text)).toEqual(["2", "3", "4", "Unlimited"]);
    expect(select.value).toBe("4");
    expect(screen.getByText("Max Hands After Splits: 4")).toBeTruthy();
    fireEvent.change(select, { target: { value: "3" } });
    expect(screen.getByText("Max Hands After Splits: 3")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Save maxSplitHands"));
    expect(gameActions.changeSetting).toHaveBeenCalledWith("maxSplitHands", 3);
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
    fireEvent.click(screen.getByLabelText("blackJackOnSplit"));
    gameState.settings = { ...gameState.settings, deckCount: 4, resetInitialBet: true };
    rerender(<Settings />);
    expect(screen.getByLabelText("deckCount").value).toBe("4");
    expect(screen.getByLabelText("resetInitialBet").checked).toBe(true);
    expect(screen.getByLabelText("blackJackOnSplit").checked).toBe(true);
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
  const open = (game = {}, path = "/settings?tab=game") => renderUI(<Settings />, { path, game: { phase: GamePhases.PRE_DEAL, ...game } });
  const RULE_KEYS = ["deckCount", "maxSplitHands", "dealerHitsSoft17", "blackjackPayout", "doubleOn", "doubleAfterSplit", "resplitAces", "hitSplitAces"];
  const withMode = (dealerHoleBehaviour) => ({ settings: { ...initialGameState.settings, dealerHoleBehaviour } });

  it("shows every catalogue rule on the Game tab, with the Vegas values, and none on the other tabs", () => {
    open();
    for (const key of RULE_KEYS) expect(screen.getByLabelText(key), key).toBeTruthy();
    expect(screen.getByLabelText("dealerHitsSoft17").checked).toBe(true);
    expect(screen.getByLabelText("blackjackPayout").value).toBe("3:2");
    expect(screen.getByLabelText("doubleOn").value).toBe("any");
    expect(screen.getByLabelText("doubleAfterSplit").checked).toBe(true);
    expect(screen.getByLabelText("resplitAces").checked).toBe(false);
    expect(screen.getByLabelText("hitSplitAces").checked).toBe(false);
    expect(screen.getByLabelText("deckCount").value).toBe("6");
    for (const text of ["Dealer Hits Soft 17", "Blackjack Pays", "Double On", "Double After a Split", "Resplit Aces", "Hit Split Aces", "Deck size: 6"]) {
      expect(screen.getByText(text), text).toBeTruthy();
    }
    for (const tab of ["Player", "Dev"]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      for (const key of RULE_KEYS) expect(screen.queryByLabelText(key), `${tab} ${key}`).toBeNull();
    }
  });

  it("the deck-size slider runs from 1 to 8", () => {
    open();
    const slider = screen.getByLabelText("deckCount");
    expect([slider.min, slider.max]).toEqual(["1", "8"]);
  });

  it("offers each choice by its plain name", () => {
    open();
    expect([...screen.getByLabelText("blackjackPayout").options].map((o) => [o.value, o.text])).toEqual([["3:2", "3:2"], ["6:5", "6:5"]]);
    expect([...screen.getByLabelText("doubleOn").options].map((o) => [o.value, o.text])).toEqual([
      ["any", "Any two cards"], ["9-11", "Hard 9 to 11"], ["10-11", "Hard 10 to 11"]]);
  });

  it("shows 'if the dealer has blackjack, you lose' only when the dealer has no hole card", () => {
    open(withMode("drawEarly_Check"));
    expect(screen.queryByLabelText("noHoleCardLoss")).toBeNull();
    cleanup();
    for (const mode of ["drawAfter", "drawEarly_NoCheck"]) {
      open(withMode(mode));
      const select = screen.getByLabelText("noHoleCardLoss");
      expect(select.value).toBe("original");
      expect([...select.options].map((o) => [o.value, o.text])).toEqual([["all", "Everything you staked"], ["original", "Only your first bet"]]);
      cleanup();
    }
  });

  it("shows it as soon as the dealer mode is edited to one with no peek, before it is saved, and hides it again", () => {
    open();
    expect(screen.queryByLabelText("noHoleCardLoss")).toBeNull();
    fireEvent.change(screen.getByLabelText("dealerHoleBehaviour"), { target: { value: "drawAfter" } });
    expect(screen.getByLabelText("noHoleCardLoss")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("dealerHoleBehaviour"), { target: { value: "drawEarly_Check" } });
    expect(screen.queryByLabelText("noHoleCardLoss")).toBeNull();
  });

  it("saves each new rule with the right value", () => {
    const { gameActions } = open(withMode("drawAfter"));
    fireEvent.click(screen.getByLabelText("dealerHitsSoft17"));
    fireEvent.click(screen.getByLabelText("Save dealerHitsSoft17"));
    fireEvent.change(screen.getByLabelText("blackjackPayout"), { target: { value: "6:5" } });
    fireEvent.click(screen.getByLabelText("Save blackjackPayout"));
    fireEvent.change(screen.getByLabelText("doubleOn"), { target: { value: "9-11" } });
    fireEvent.click(screen.getByLabelText("Save doubleOn"));
    fireEvent.click(screen.getByLabelText("doubleAfterSplit"));
    fireEvent.click(screen.getByLabelText("Save doubleAfterSplit"));
    fireEvent.click(screen.getByLabelText("resplitAces"));
    fireEvent.click(screen.getByLabelText("Save resplitAces"));
    fireEvent.click(screen.getByLabelText("hitSplitAces"));
    fireEvent.click(screen.getByLabelText("Save hitSplitAces"));
    fireEvent.change(screen.getByLabelText("noHoleCardLoss"), { target: { value: "all" } });
    fireEvent.click(screen.getByLabelText("Save noHoleCardLoss"));
    expect(gameActions.changeSetting.mock.calls).toEqual([
      ["dealerHitsSoft17", false], ["blackjackPayout", "6:5"], ["doubleOn", "9-11"], ["doubleAfterSplit", false],
      ["resplitAces", true], ["hitSplitAces", true], ["noHoleCardLoss", "all"],
    ]);
  });

  it("shows the plain-language hint of the chosen option, and of a checkbox", () => {
    open();
    expect(screen.getByText("A $10 blackjack wins $15.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("blackjackPayout"), { target: { value: "6:5" } });
    expect(screen.queryByText("A $10 blackjack wins $15.")).toBeNull();
    expect(screen.getByText(/A \$10 blackjack wins only \$12/)).toBeTruthy();
    expect(screen.getByText("You may double on any first two cards.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("doubleOn"), { target: { value: "10-11" } });
    expect(screen.getByText(/only on a hard total of 10 or 11/)).toBeTruthy();
    expect(screen.getByText("Off: each split ace gets one card and stands.")).toBeTruthy();
    expect(screen.getByText("Allows doubling on a hand made by splitting.")).toBeTruthy();
  });

  it("a rule change warns that it resets a round in progress", () => {
    open({ phase: GamePhases.PLAYER_TURN });
    expect(screen.queryByText("Changing this setting will reset the current game.")).toBeNull();
    fireEvent.click(screen.getByLabelText("resplitAces"));
    expect(screen.getByText("Changing this setting will reset the current game.")).toBeTruthy();
  });

  it("applying a preset sends all 16 rule keys in one call, and the list names the five presets and Custom", () => {
    const { gameActions } = open();
    const select = screen.getByLabelText("rulePreset");
    expect([...select.options].map((o) => o.text)).toEqual(["Vegas", "Atlantic City", "Europe", "Australia", "Singapore", "Custom"]);
    fireEvent.change(select, { target: { value: "Singapore" } });
    expect(gameActions.changeSettings).toHaveBeenCalledTimes(1);
    const sent = gameActions.changeSettings.mock.calls[0][0];
    expect(Object.keys(sent)).toHaveLength(16);
    expect(sent).toMatchObject({ doubleOn: "any", maxSplitHands: 3, deckCount: 6, dealerHitsSoft17: false, noHoleCardLoss: "original" });
    expect(screen.getByLabelText("doubleOn").value).toBe("any");
    expect(screen.getByLabelText("maxSplitHands").value).toBe("3");
    expect(screen.getByLabelText("noHoleCardLoss").value).toBe("original");
  });

  it("changing a single rule of a preset shows Custom", () => {
    open();
    expect(screen.getByLabelText("rulePreset").value).toBe("Vegas");
    fireEvent.click(screen.getByLabelText("dealerHitsSoft17"));
    expect(screen.getByLabelText("rulePreset").value).toBe("Custom");
    fireEvent.click(screen.getByLabelText("dealerHitsSoft17"));
    expect(screen.getByLabelText("rulePreset").value).toBe("Vegas");
  });

  it("a saved table that matches no preset (a legacy two-deck table) shows Custom", () => {
    open({ settings: { ...initialGameState.settings, deckCount: 2, dealerHitsSoft17: false, maxSplitHands: 0, noHoleCardLoss: "all" } });
    expect(screen.getByLabelText("rulePreset").value).toBe("Custom");
  });

  describe("surrender", () => {
    it("is a select of four choices on the Game tab, set to Late for Vegas, in every dealer mode", () => {
      for (const mode of ["drawEarly_Check", "drawEarly_NoCheck", "drawAfter"]) {
        open(withMode(mode));
        const select = screen.getByLabelText("surrender");
        expect(select.value).toBe("late");
        expect([...select.options].map((o) => [o.value, o.text])).toEqual([
          ["none", "None"], ["late", "Late"], ["early", "Early"], ["earlyNoAce", "Early (not against an ace)"]]);
        expect(screen.getByText("Surrender")).toBeTruthy();
        cleanup();
      }
    });

    it("shows the hint of the selected option, and the hint follows the selection before it is saved", () => {
      open();
      expect(screen.getByText(/Give up half your bet on your first two cards\. If the dealer has blackjack/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText("surrender"), { target: { value: "none" } });
      expect(screen.getByText("You can't give up a hand.")).toBeTruthy();
      fireEvent.change(screen.getByLabelText("surrender"), { target: { value: "early" } });
      expect(screen.getByText(/before the dealer checks for blackjack\. You keep the half even if the dealer has one\..*works like Late/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText("surrender"), { target: { value: "earlyNoAce" } });
      expect(screen.getByText(/not offered when the dealer shows an ace\..*works like Late/)).toBeTruthy();
    });

    it("saves the chosen value with its Save button", () => {
      const { gameActions } = open();
      expect(screen.getByLabelText("Save surrender")).toBeTruthy();
      fireEvent.change(screen.getByLabelText("surrender"), { target: { value: "early" } });
      fireEvent.click(screen.getByLabelText("Save surrender"));
      expect(gameActions.changeSetting.mock.calls).toEqual([["surrender", "early"]]);
    });

    it("a change warns that it resets a round in progress", () => {
      open({ phase: GamePhases.PLAYER_TURN });
      expect(screen.queryByText("Changing this setting will reset the current game.")).toBeNull();
      fireEvent.change(screen.getByLabelText("surrender"), { target: { value: "none" } });
      expect(screen.getByText("Changing this setting will reset the current game.")).toBeTruthy();
    });

    it("the Singapore preset applies earlyNoAce, and Europe turns it off", () => {
      const { gameActions } = open();
      fireEvent.change(screen.getByLabelText("rulePreset"), { target: { value: "Singapore" } });
      expect(gameActions.changeSettings.mock.calls[0][0].surrender).toBe("earlyNoAce");
      expect(screen.getByLabelText("surrender").value).toBe("earlyNoAce");
      fireEvent.change(screen.getByLabelText("rulePreset"), { target: { value: "Europe" } });
      expect(gameActions.changeSettings.mock.calls[1][0].surrender).toBe("none");
      expect(screen.getByLabelText("surrender").value).toBe("none");
    });

    it("a Vegas table with surrender none (what a version 2 save becomes) shows Custom", () => {
      open({ settings: { ...initialGameState.settings, surrender: "none" } });
      expect(screen.getByLabelText("rulePreset").value).toBe("Custom");
    });
  });
});
