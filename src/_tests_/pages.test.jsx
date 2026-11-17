import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderUI, testPlayer } from "./testUtils";
import Home from "../pages/Home";
import Game from "../pages/Game";
import Login from "../pages/Login";
import App from "../App";
import Header from "../components/Header/Header";
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

  it("names the page Blakejack for screen readers and hides the drawn wordmark (#79)", () => {
    const { container } = renderUI(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "Blakejack" })).toBeTruthy();
    expect(container.querySelector("h1 svg").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows Loading, not Home, while a saved session is restored or the table is about to start (DESIGN section 8)", () => {
    const restoring = renderUI(<Home />, { player: { player: null, restoring: true } });
    expect(screen.getByRole("status").textContent).toContain("Shuffling up...");
    expect(screen.queryByText("Please log in to start playing.")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Blakejack" })).toBeTruthy();
    restoring.unmount();
    renderUI(<Home />, { game: { starting: true } });
    expect(screen.getByRole("status").textContent).toContain("Shuffling up...");
    expect(screen.queryByText("Start Game")).toBeNull();
  });

  it("has no status line once it is not loading", () => {
    renderUI(<Home />);
    expect(screen.queryByRole("status")).toBeNull();
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
    renderUI(<Game />, { path: "/game", game: { phase: GamePhases.PRE_DEAL, seenIds: ["seen"] } });
    expect(screen.getByText("Place your bets")).toBeTruthy();
  });

  it("opens with the shuffle when the round has not started (#83): the line and the Deal key say Shuffling", () => {
    renderUI(<Game />, { path: "/game", game: { phase: GamePhases.PRE_DEAL } });
    expect(screen.getByText("Shuffling", { selector: ".msg" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Shuffling" }).getAttribute("aria-disabled")).toBe("true");
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

describe("App", () => {
  it("renders the header and the routed page", () => {
    renderUI(<App />, { path: "/" });
    expect(screen.getByText("Blakejack")).toBeTruthy();
    expect(screen.getByText("Home")).toBeTruthy();
  });
});
