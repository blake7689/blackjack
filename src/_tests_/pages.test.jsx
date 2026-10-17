import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderUI, testPlayer } from "./testUtils";
import Home from "../pages/Home";
import Game from "../pages/Game";
import Login from "../pages/Login";
import Settings from "../pages/Settings";
import App from "../App";
import { GamePhases } from "../utils/constants/gamePhases";
import { validateField } from "../utils/validation";

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

  it("alerts the actual failure: network, server message, or a fallback", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const login = vi.fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(new Error("Invalid username/email or password."))
      .mockRejectedValueOnce(new Error(""));
    renderUI(<Login />, { path: "/login", player: { login } });
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText("Log in"));
      await flush();
    }
    expect(alert.mock.calls.map(([m]) => m)).toEqual([
      "No response from server. It may be paused; try again in a minute.",
      "Invalid username/email or password.",
      "Login failed",
    ]);
    expect(location()).toBe("/login");
  });

  it("signs up with the typed details and starting credits", async () => {
    const addPlayer = vi.fn().mockResolvedValue(testPlayer);
    renderUI(<Login />, { path: "/login", player: { addPlayer } });
    fireEvent.click(screen.getByText("Add player"));
    type("Username", "newbie");
    type("Email", "n@example.com");
    type("Password", "secret1");
    type("First name", "New");
    type("Last name", "Bie");
    type("Starting credits", "500");
    fireEvent.click(screen.getByText("Create & sign in"));
    expect(screen.getByText("Creating…")).toBeTruthy();
    await flush();
    expect(addPlayer).toHaveBeenCalledWith({ userName: "newbie", password: "secret1", email: "n@example.com", firstName: "New", lastName: "Bie", credits: 500 });
    expect(location()).toBe("/");
  });

  it("alerts a failed signup", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderUI(<Login />, { path: "/login", player: { addPlayer: vi.fn().mockRejectedValue(new Error("")) } });
    fireEvent.click(screen.getByText("Add player"));
    fireEvent.submit(screen.getByText("Create & sign in").closest("form"));
    await flush();
    expect(alert).toHaveBeenCalledWith("Signup failed");
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

  it("enables Save only for a valid change, saves it, and clears the password", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const updatePlayer = vi.fn().mockResolvedValue(true);
    renderUI(<Settings />, { player: { updatePlayer } });
    expect(saveButton().disabled).toBe(true);
    type("Leave blank to keep", "123");
    expect(screen.getByText("Password must be at least 6 characters.")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    type("Leave blank to keep", "newpass1");
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await flush();
    expect(updatePlayer).toHaveBeenCalledWith({ userName: "tester", email: "t@example.com", password: "newpass1", firstName: "Test", lastName: "Er" });
    expect(window.alert).toHaveBeenCalledWith("Saved");
    expect(screen.getByPlaceholderText("Leave blank to keep").value).toBe("");
  });

  it("alerts a failed save, with a fallback message", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const updatePlayer = vi.fn().mockRejectedValueOnce(new Error("Name taken")).mockRejectedValueOnce(new Error(""));
    const { container } = renderUI(<Settings />, { player: { updatePlayer } });
    fireEvent.change(container.querySelector('input[name="firstName"]'), { target: { value: "Changed" } });
    fireEvent.click(saveButton());
    await flush();
    fireEvent.click(saveButton());
    await flush();
    expect(window.alert.mock.calls.map(([m]) => m)).toEqual(["Name taken", "Save failed"]);
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
    expect(window.alert).toHaveBeenCalledWith("Deleted");
    expect(gameActions.resetGame).toHaveBeenCalled();
    expect(location()).toBe("/");
  });

  it("alerts a failed delete, with a fallback message", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const deletePlayer = vi.fn().mockRejectedValueOnce(new Error("Gone")).mockRejectedValueOnce(new Error(""));
    renderUI(<Settings />, { player: { deletePlayer } });
    fireEvent.click(screen.getByText("Delete Profile"));
    await flush();
    fireEvent.click(screen.getByText("Delete Profile"));
    await flush();
    expect(window.alert.mock.calls.map(([m]) => m)).toEqual(["Gone", "Delete failed"]);
  });

  it("saves a table setting, confirming first when a round is in play", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { gameActions } = renderUI(<Settings />, { game: { phase: GamePhases.PLAYER_TURN } });
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

  it("saves table settings without asking before a round, and speed or rebet any time", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { gameActions, rerender } = renderUI(<Settings />, { game: { phase: GamePhases.PRE_DEAL } });
    fireEvent.click(screen.getByLabelText("includeCutCard"));
    fireEvent.click(screen.getByLabelText("Save includeCutCard"));
    fireEvent.change(screen.getByLabelText("dealerHoleBehaviour"), { target: { value: "drawAfter" } });
    expect(screen.getByText("Draw After (EU)")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Save dealerHoleBehaviour"));
    expect(confirm).not.toHaveBeenCalled();
    expect(gameActions.changeSetting.mock.calls).toEqual([["includeCutCard", false], ["dealerHoleBehaviour", "drawAfter"]]);
    rerender(<Settings />);
    fireEvent.change(screen.getByLabelText("playTimeout"), { target: { value: "500" } });
    expect(screen.getByText("Rate of Play: 0.5 seconds")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Save playTimeout"));
    fireEvent.click(screen.getByLabelText("resetInitialBet"));
    fireEvent.click(screen.getByLabelText("Save resetInitialBet"));
    expect(gameActions.changeSetting).toHaveBeenCalledWith("playTimeout", 500);
    expect(gameActions.changeSetting).toHaveBeenCalledWith("resetInitialBet", true);
  });

  it("warns about a reset only once a game exists", () => {
    renderUI(<Settings />);
    fireEvent.click(screen.getByLabelText("blackJackOnSplit"));
    expect(screen.queryByText("Changing this setting will reset the current game.")).toBeNull();
    fireEvent.click(screen.getByText("Back to game"));
    expect(location()).toBe("/game");
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
