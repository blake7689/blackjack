import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { renderUI, testPlayer } from "./testUtils";
import Home from "../pages/Home";
import Game from "../pages/Game";
import Login from "../pages/Login";
import App from "../App";
import { LoadingScreen, ErrorScreen } from "../components/PageScreens/PageScreens";
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
  describe("signed out", () => {
    const visitor = () => renderUI(<Home />, { player: { player: null } });

    it("asks a visitor to log in, with Log in, Create an account and Rules, and no Play", () => {
      visitor();
      expect(screen.getByText("Please log in to start playing.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
      expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/signup");
      expect(screen.getByRole("button", { name: "Rules" })).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Play" })).toBeNull();
      expect(screen.queryByText(/Signed in as/)).toBeNull();
    });

    it("Rules opens the Table rules sheet without a Change rules link, and Close puts focus back on Rules", async () => {
      visitor();
      const rules = screen.getByRole("button", { name: "Rules" });
      rules.focus();
      fireEvent.click(rules);
      const sheet = await screen.findByRole("dialog", { name: "Table rules" });
      expect(within(sheet).queryByRole("link", { name: "Change rules" })).toBeNull();
      fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(rules);
    });
  });

  describe("signed in", () => {
    it("has Play, Rules, Settings and 'Signed in as ... Log out'", () => {
      renderUI(<Home />);
      expect(screen.getByRole("link", { name: "Play" }).getAttribute("href")).toBe("/game");
      expect(screen.getByRole("button", { name: "Rules" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
      expect(screen.getByText(/Signed in as tester/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
      expect(screen.queryByText("Please log in to start playing.")).toBeNull();
      expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    });

    it("Play starts a game and opens the table", () => {
      const { gameActions } = renderUI(<Home />);
      fireEvent.click(screen.getByRole("link", { name: "Play" }));
      expect(gameActions.startGame).toHaveBeenCalled();
      expect(location()).toBe("/game");
    });

    it("Rules opens the sheet with a Change rules link to Settings", async () => {
      renderUI(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Rules" }));
      expect(within(await screen.findByRole("dialog", { name: "Table rules" })).getByRole("link", { name: "Change rules" }).getAttribute("href")).toBe("/settings#rules");
    });

    it("Log out asks 'Log out?' with the safe button first and focused; Stay logged in keeps the session, Log out signs out", () => {
      const { playerCtx, gameActions } = renderUI(<Home />);
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
      const dialog = screen.getByRole("dialog", { name: "Log out?" });
      const [safe, danger] = within(dialog).getAllByRole("button");
      expect(safe.textContent).toBe("Stay logged in");
      expect(danger.textContent).toBe("Log out");
      expect(document.activeElement).toBe(safe);
      fireEvent.click(safe);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(playerCtx.logout).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Log out" }));
      expect(playerCtx.logout).toHaveBeenCalledOnce();
      expect(gameActions.resetGame).toHaveBeenCalledOnce();
    });
  });

  it("names the page Blakejack for screen readers and hides the drawn wordmark (#79)", () => {
    const { container } = renderUI(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "Blakejack" })).toBeTruthy();
    expect(container.querySelector("h1 svg").getAttribute("aria-hidden")).toBe("true");
  });

  it("has no felt hero (L2-5): the wordmark, the actions and nothing decorative", () => {
    const { container } = renderUI(<Home />);
    expect(container.querySelector(".hero, img")).toBeNull();
    expect(container.querySelector("main.page.home h1 svg")).toBeTruthy();
  });

  it("shows Loading, not Home, while the table is about to start (DESIGN section 8)", () => {
    renderUI(<Home />, { game: { starting: true } });
    expect(screen.getByRole("status").textContent).toContain("Shuffling up...");
    expect(screen.queryByRole("link", { name: "Play" })).toBeNull();
  });

  it("has no status line once it is not loading", () => {
    renderUI(<Home />);
    expect(screen.queryByRole("status")).toBeNull();
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

  it("waits on Loading, not Home, while the signed-in table is being started (L1-14)", () => {
    renderUI(<Game />, { path: "/game", game: { starting: true } });
    expect(screen.getByRole("status").textContent).toContain("Shuffling up...");
    expect(location()).toBe("/game");
  });

  it("still sends a visitor home while `starting` is set", () => {
    renderUI(<Game />, { path: "/game", player: { player: null }, game: { starting: true } });
    expect(location()).toBe("/");
  });

  it("shows the table for a started game", () => {
    renderUI(<Game />, { path: "/game", game: { phase: GamePhases.PRE_DEAL, seenIds: ["seen"] } });
    expect(screen.getByText("Place your bets")).toBeTruthy();
  });

  it("opens with the shuffle when the round has not started (#83): the line says Shuffling, the dock waits and Deal still says Deal", () => {
    renderUI(<Game />, { path: "/game", game: { phase: GamePhases.PRE_DEAL } });
    expect(screen.getByText("Shuffling", { selector: ".msg" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deal" }).getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelector(".rack-wrap").classList.contains("off")).toBe(true);
  });
});

describe("Log in (/login)", () => {
  const logInButton = () => screen.getByRole("button", { name: /^Log(ging)? in/ });

  it("is a standalone screen: the wordmark, an h1 'Log in', labelled fields with placeholders, a Log in button and a link to Create an account", () => {
    const { container } = renderUI(<Login />, { path: "/login", player: { player: null } });
    expect(screen.getByRole("heading", { level: 1, name: "Log in" })).toBeTruthy();
    expect(container.querySelector("svg.wm").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByLabelText("Username or email").getAttribute("placeholder")).toBe("Username or Email");
    expect(screen.getByLabelText("Password").getAttribute("placeholder")).toBe("Password");
    expect(logInButton().textContent).toBe("Log in");
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe("/signup");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("logs in and goes home", async () => {
    const login = vi.fn().mockResolvedValue(testPlayer);
    renderUI(<Login />, { path: "/login", player: { player: null, login } });
    type("Username or Email", "tester");
    type("Password", "secret12");
    fireEvent.click(logInButton());
    expect(screen.getByText("Contacting server...")).toBeTruthy();
    expect(logInButton().textContent).toBe("Logging in...");
    expect(logInButton().disabled).toBe(true);
    await flush();
    expect(login).toHaveBeenCalledWith({ usernameOrEmail: "tester", password: "secret12" });
    expect(location()).toBe("/");
  });

  it("keeps the player informed while a cold server wakes up", async () => {
    vi.useFakeTimers();
    let finish;
    const login = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    renderUI(<Login />, { path: "/login", player: { player: null, login } });
    fireEvent.click(logInButton());
    expect(screen.getByRole("status").textContent).toBe("Contacting server...");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText(/waking up the table/i)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(25000); });
    expect(screen.getByText(/still waking up/i)).toBeTruthy();
    // A cold start can take longer than 30 s (#75): still waiting at 31 s, no error, then it signs in.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText(/still waking up/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => finish(testPlayer));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(location()).toBe("/");
  });

  it("shows one inline alert with the actual failure (network, server message, or a fallback) and marks both fields invalid", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const shown = [];
    const login = vi.fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(new Error("Invalid username/email or password."))
      .mockRejectedValueOnce(new Error(""));
    renderUI(<Login />, { path: "/login", player: { player: null, login } });
    for (let i = 0; i < 3; i++) {
      fireEvent.click(logInButton());
      await flush();
      shown.push(screen.getByRole("alert").textContent);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getByLabelText("Username or email").getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("true");
    }
    expect(alert).not.toHaveBeenCalled();
    expect(shown).toEqual([
      "No response from server. It may be paused; try again in a minute.",
      "Invalid username/email or password.",
      "Login failed",
    ]);
    expect(location()).toBe("/login");
  });

  it("the fields are not invalid before an error, and the error clears when the next attempt starts", async () => {
    const login = vi.fn().mockRejectedValueOnce(new Error("Nope")).mockResolvedValueOnce(testPlayer);
    renderUI(<Login />, { path: "/login", player: { player: null, login } });
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("false");
    fireEvent.click(logInButton());
    await flush();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(logInButton());
    expect(screen.queryByRole("alert")).toBeNull();
    await flush();
    expect(location()).toBe("/");
  });

  it("the crash variant says something went wrong, offers Reload and Home, and shares the Error screen's frame (L2-13)", () => {
    const onRetry = vi.fn();
    const onHome = vi.fn();
    const { container } = renderUI(<ErrorScreen crash onRetry={onRetry} onHome={onHome} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeTruthy();
    expect(screen.queryByText(/Can't reach the table/)).toBeNull();
    expect(container.querySelector("main.page .btn-col .btn.primary").textContent).toBe("Reload");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(onHome).toHaveBeenCalledOnce();
  });
});

describe("Log in and Create an account when already signed in", () => {
  it.each([["/login", <Login />], ["/signup", <Login signup />]])("%s sends a signed-in player to /game", (path, ui) => {
    renderUI(ui, { path });
    expect(location()).toBe("/game");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("does not redirect while its own log-in is in flight (it goes home itself)", async () => {
    let finish;
    const login = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const { playerCtx, rerender } = renderUI(<Login />, { path: "/login", player: { player: null, login } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    playerCtx.player = testPlayer; // the provider signs the player in before login() resolves
    rerender(<Login />);
    expect(location()).toBe("/login");
    await act(async () => finish(testPlayer));
    expect(location()).toBe("/");
  });

  it("the crash variant says something went wrong, offers Reload and Home, and shares the Error screen's frame (L2-13)", () => {
    const onRetry = vi.fn();
    const onHome = vi.fn();
    const { container } = renderUI(<ErrorScreen crash onRetry={onRetry} onHome={onHome} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeTruthy();
    expect(screen.queryByText(/Can't reach the table/)).toBeNull();
    expect(container.querySelector("main.page .btn-col .btn.primary").textContent).toBe("Reload");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(onHome).toHaveBeenCalledOnce();
  });
});

describe("Create an account (/signup)", () => {
  const createButton = () => screen.getByRole("button", { name: /^Creat/ });
  const fillAll = () => {
    type("Username", "newbie");
    type("Email", "n@example.com");
    type("Password", "secret12");
    type("First name", "New");
    type("Last name", "Bie");
  };
  const signup = (player = {}) => renderUI(<Login signup />, { path: "/signup", player: { player: null, ...player } });

  it("has an h1 'Create an account', the five fields each with a real label, a disabled Create account button, and a link back to Log in", () => {
    signup();
    expect(screen.getByRole("heading", { level: 1, name: "Create an account" })).toBeTruthy();
    for (const label of ["Username", "Email", "Password", "First name", "Last name"]) {
      expect(screen.getByLabelText(label), label).toBeTruthy();
      expect(screen.getByLabelText(label).getAttribute("placeholder"), label).toBe(label);
    }
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(createButton().textContent).toBe("Create account");
    expect(createButton().disabled).toBe(true);
    expect(screen.getByText(/Have an account\?/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByLabelText("Username or email")).toBeNull();
  });

  it("signs up with the typed details; the server sets the starting balance", async () => {
    const addPlayer = vi.fn().mockResolvedValue(testPlayer);
    signup({ addPlayer });
    expect(screen.queryByPlaceholderText("Starting credits")).toBeNull();
    fillAll();
    expect(createButton().disabled).toBe(false);
    fireEvent.click(createButton());
    expect(createButton().textContent).toBe("Creating account...");
    await flush();
    expect(addPlayer).toHaveBeenCalledWith({ userName: "newbie", password: "secret12", email: "n@example.com", firstName: "New", lastName: "Bie" });
    expect(location()).toBe("/");
  });

  it("shows the provider's notice as an alert (e.g. a password change we could not sign back in from, #171), and none without one", () => {
    const { unmount } = renderUI(<Login />, { path: "/login", player: { player: null, notice: "Please sign in with your new password." } });
    expect(screen.getByRole("alert").textContent).toBe("Please sign in with your new password.");
    unmount();
    renderUI(<Login />, { path: "/login", player: { player: null } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("applies no length rule when logging in, so a 6 or 7 character password from before the 8-character rule still works", async () => {
    const login = vi.fn().mockResolvedValue(testPlayer);
    for (const password of ["secret", "secret1"]) {
      const view = renderUI(<Login />, { path: "/login", player: { player: null, login } });
      type("Username or Email", "tester");
      type("Password", password);
      expect(screen.queryByText(/at least/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /^Log(ging)? in/ }));
      await flush();
      expect(login).toHaveBeenLastCalledWith({ usernameOrEmail: "tester", password });
      view.unmount();
    }
  });

  it("signup refuses a 7 character password and accepts 8", () => {
    signup({ addPlayer: vi.fn() });
    type("Password", "1234567");
    expect(screen.getByText("Password must be at least 8 characters.")).toBeTruthy();
    type("Password", "12345678");
    expect(screen.queryByText(/at least 8/)).toBeNull();
  });

  it("shows each field's error (linked with aria-describedby) once touched, and blocks the form until it is valid", () => {
    const addPlayer = vi.fn();
    signup({ addPlayer });
    const button = createButton();
    expect(button.disabled).toBe(true);
    expect(screen.queryByText(/is required/)).toBeNull(); // nothing shown before the player touches a field

    type("Username", "ab");
    expect(screen.getByText("Username must be at least 3 characters.")).toBeTruthy();
    expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Username").getAttribute("aria-describedby")).toBe(screen.getByText("Username must be at least 3 characters.").id);
    type("Username", "abc");
    expect(screen.queryByText(/Username must/)).toBeNull();
    expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByLabelText("Username").hasAttribute("aria-describedby")).toBe(false);
    type("Email", "not-an-email");
    expect(screen.getByText("Invalid email format.")).toBeTruthy();
    type("Password", "123");
    expect(screen.getByText("Password must be at least 8 characters.")).toBeTruthy();
    type("Password", "");
    expect(screen.getByText("Password is required.")).toBeTruthy();
    fireEvent.blur(screen.getByPlaceholderText("First name"));
    expect(screen.getByText("First name is required.")).toBeTruthy();

    // Enter still submits a form: it shows every problem instead of signing up.
    fireEvent.submit(button.closest("form"));
    expect(screen.getByText("Last name is required.")).toBeTruthy();
    expect(screen.getByLabelText("Last name").getAttribute("aria-invalid")).toBe("true");
    expect(addPlayer).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
  });

  it("shows a failed signup inline as one alert, with a link back to Log in", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    signup({ addPlayer: vi.fn().mockRejectedValue(new Error("")) });
    fillAll();
    fireEvent.submit(createButton().closest("form"));
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Signup failed");
    expect(alert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Log in" }));
    expect(location()).toBe("/login");
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
    expect(validateField("password", "1234567")).toBe("Password must be at least 8 characters.");
    expect(validateField("password", "12345678")).toBe("");
    expect(validateField("firstName", "")).toBe("First name is required.");
    expect(validateField("lastName", "")).toBe("Last name is required.");
    expect(validateField("lastName", "X")).toBe("");
  });
});

describe("App", () => {
  const banner = () => screen.queryByRole("button", { name: "Home" }); // the old global Header's Home button: gone (L1-12)

  it("Home is a standalone screen with no header; Settings has only its own Table / Settings head and loads as a lazy chunk (#169)", async () => {
    const view = renderUI(<App />, { path: "/" });
    expect(screen.getByRole("heading", { level: 1, name: "Blakejack" })).toBeTruthy();
    expect(banner()).toBeNull();
    view.unmount();
    renderUI(<App />, { path: "/settings" });
    expect(banner()).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Shuffling up..."); // the Loading screen while the chunk loads
    // the first import of the page is slow under coverage, so wait longer than the default
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" }, { timeout: 14000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Table" })).toBeTruthy();
    // Home is reached from the table's menu, Log out from the Account section
  }, 15000);

  it("routes /login to Log in and /signup to Create an account", () => {
    const view = renderUI(<App />, { path: "/login", player: { player: null } });
    expect(screen.getByRole("heading", { level: 1, name: "Log in" })).toBeTruthy();
    expect(banner()).toBeNull();
    view.unmount();
    renderUI(<App />, { path: "/signup", player: { player: null } });
    expect(screen.getByRole("heading", { level: 1, name: "Create an account" })).toBeTruthy();
  });

  it("swapping /login for /signup shows a fresh form, not the typed login", () => {
    const view = renderUI(<App />, { path: "/login", player: { player: null } });
    type("Username or Email", "typed");
    fireEvent.click(screen.getByRole("link", { name: "Create an account" }));
    expect(location()).toBe("/signup");
    expect(screen.getByRole("heading", { level: 1, name: "Create an account" })).toBeTruthy();
    expect(screen.getByLabelText("Username").value).toBe("");
    view.unmount();
  });

  it("shows Loading on every page while a saved session is restored, never a page that thinks you are signed out", () => {
    for (const path of ["/", "/game", "/settings", "/login"]) {
      const view = renderUI(<App />, { path, player: { player: null, restoring: true } });
      expect(screen.getByRole("status").textContent, path).toContain("Shuffling up...");
      expect(screen.queryByText("Please log in to start playing."), path).toBeNull();
      expect(banner(), path).toBeNull();
      view.unmount();
    }
  });

  it("shows the Error screen when the restore failed: Try again asks for the restore again, Home skips it", () => {
    const retryRestore = vi.fn();
    const skipRestore = vi.fn();
    renderUI(<App />, { path: "/", player: { player: null, restoreFailed: true, retryRestore, skipRestore } });
    expect(screen.getByRole("heading", { level: 1, name: "Can't reach the table" })).toBeTruthy();
    expect(screen.queryByText("Please log in to start playing.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryRestore).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(skipRestore).toHaveBeenCalledOnce();
    expect(location()).toBe("/");
  });

  it("the Error screen wins over Loading", () => {
    renderUI(<App />, { player: { player: null, restoring: true, restoreFailed: true } });
    expect(screen.getByRole("heading", { name: "Can't reach the table" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the Loading and Error screens (#87)", () => {
  it("Loading is one status line with the decorative dealing cards hidden and the wordmark first", () => {
    const { container } = renderUI(<LoadingScreen />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Shuffling up...");
    expect(status.querySelector(".deal-load").getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("main > svg.wm")).toBeTruthy();
  });

  it("Error names itself, says the balance is safe, and offers Try again and Home", () => {
    const onRetry = vi.fn();
    const onHome = vi.fn();
    renderUI(<ErrorScreen onRetry={onRetry} onHome={onHome} />, { path: "/settings" });
    expect(screen.getByText(/Your balance is safe/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onHome).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(onHome).toHaveBeenCalledOnce();
    expect(location()).toBe("/");
  });

  it("the crash variant says something went wrong, offers Reload and Home, and shares the Error screen's frame (L2-13)", () => {
    const onRetry = vi.fn();
    const onHome = vi.fn();
    const { container } = renderUI(<ErrorScreen crash onRetry={onRetry} onHome={onHome} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeTruthy();
    expect(screen.queryByText(/Can't reach the table/)).toBeNull();
    expect(container.querySelector("main.page .btn-col .btn.primary").textContent).toBe("Reload");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(onHome).toHaveBeenCalledOnce();
  });
});
