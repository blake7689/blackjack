import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
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
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText(/may be waking up/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(25000); });
    expect(screen.getByText(/still waking up/)).toBeTruthy();
    await act(async () => finish(testPlayer));
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

  it("applies a rules preset in one step, and shows Custom once a rule is changed", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL } });
    const preset = screen.getByLabelText("rulePreset");
    expect(preset.value).toBe("US");
    expect(screen.getByRole("option", { name: "Custom" }).disabled).toBe(true);

    fireEvent.change(preset, { target: { value: "EU" } });
    expect(confirm).not.toHaveBeenCalled();
    expect(gameActions.changeSettings).toHaveBeenCalledWith(RULE_PRESETS.EU);
    expect(preset.value).toBe("EU");
    expect(screen.getByLabelText("dealerHoleBehaviour").value).toBe("drawAfter");

    fireEvent.click(screen.getByLabelText("dealerDrawsOnPlayerBust"));
    expect(preset.value).toBe("Custom");
    fireEvent.click(screen.getByLabelText("dealerDrawsOnPlayerBust"));
    expect(preset.value).toBe("EU");
  });

  it("asks once before a preset resets a round in progress", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PLAYER_TURN } });
    const preset = screen.getByLabelText("rulePreset");
    fireEvent.change(preset, { target: { value: "EU" } });
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(preset.value).toBe("US");
    fireEvent.change(preset, { target: { value: "EU" } });
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

  it("offers 2, 3, 4 or Unlimited hands after splits, Unlimited by default", () => {
    const { gameActions } = renderUI(<Settings />, { path: "/settings?tab=game", game: { phase: GamePhases.PRE_DEAL } });
    const select = screen.getByLabelText("maxSplitHands");
    expect([...select.options].map((o) => o.text)).toEqual(["2", "3", "4", "Unlimited"]);
    expect(select.value).toBe("0");
    expect(screen.getByText("Max Hands After Splits: Unlimited")).toBeTruthy();
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
    // Untick all but $25 and $5 (ticked last, saved first), then try to untick the last two.
    for (const chip of [1, 10, 50, 100, 1000, 5000, 10000, 20000, 50000, 100000]) fireEvent.click(screen.getByLabelText(`chip ${chip}`));
    expect(save.disabled).toBe(false);
    fireEvent.click(screen.getByLabelText("chip 5"));
    expect(screen.getByLabelText("chip 25").disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("chip 5"));
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
