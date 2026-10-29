import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { renderUI, testPlayer, fakePlayer } from "./testUtils";
import { PlayerContext } from "../context/PlayerContext";
import StatsPanel from "../components/StatsPanel/StatsPanel";
import GameBoard from "../components/GameBoard/GameBoard";
import TopUpPrompt from "../components/TopUpPrompt/TopUpPrompt";
import { GamePhases } from "../utils/constants/gamePhases";

// Hidden top-up (#90). The real code is never written in this repo: every test types this arbitrary stand-in.
const CODE = "dummy-code-123";
const dialog = () => screen.queryByRole("dialog");
const input = () => screen.getByLabelText("Code");
const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

describe("StatsPanel hidden taps", () => {
  const low = { player: { player: { ...testPlayer, credits: 50 } } };
  const tap = (times, gapMs = 0) => {
    for (let i = 0; i < times; i++) {
      fireEvent.click(screen.getByText("Credits:"));
      if (gapMs) act(() => { vi.advanceTimersByTime(gapMs); });
    }
  };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("7 quick taps open the prompt; 6 do nothing", () => {
    renderUI(<StatsPanel player={{ credits: 50 }} tapEnabled />, low);
    tap(6);
    expect(dialog()).toBeNull();
    tap(1);
    expect(dialog()).not.toBeNull();
  });

  it("the 7 taps must fit inside 3 s: a span of 2994 ms opens, 3000 ms does not", () => {
    renderUI(<StatsPanel player={{ credits: 50 }} tapEnabled />, low);
    tap(6, 499); // the 7th tap lands 6 x 499 = 2994 ms after the first
    tap(1);
    expect(dialog()).not.toBeNull();
    fireEvent.click(screen.getByText("Cancel"));

    tap(6, 500); // the 7th lands exactly 3000 ms after the first
    tap(1);
    expect(dialog()).toBeNull();
  });

  it("taps spread over more than 3 s never add up, but the window slides", () => {
    renderUI(<StatsPanel player={{ credits: 50 }} tapEnabled />, low);
    tap(10, 1000);
    expect(dialog()).toBeNull();
    tap(4);
    act(() => { vi.advanceTimersByTime(4000); }); // those 4 are now too old
    tap(6);
    expect(dialog()).toBeNull();
    tap(1);
    expect(dialog()).not.toBeNull();
  });

  it("does nothing when taps are not enabled (the default too)", () => {
    const { rerender } = renderUI(<StatsPanel player={{ credits: 50 }} tapEnabled={false} />, low);
    tap(20);
    expect(dialog()).toBeNull();
    rerender(<StatsPanel player={{ credits: 50 }} />);
    tap(20);
    expect(dialog()).toBeNull();
  });

  it("the counter starts over after the prompt opens; clicks inside the prompt are not taps", () => {
    renderUI(<StatsPanel player={{ credits: 50 }} tapEnabled />, low);
    tap(7);
    expect(dialog()).not.toBeNull();
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByText("Enter code"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(dialog()).toBeNull();
    tap(6);
    expect(dialog()).toBeNull();
    tap(1);
    expect(dialog()).not.toBeNull();
  });

  it("renders the overlay as a direct child of document.body, outside the panel; clicks inside it are not taps and 7 do not reopen it", () => {
    const { container } = renderUI(<StatsPanel player={{ credits: 50 }} tapEnabled />, low);
    tap(7);
    const overlay = document.querySelector(".topup-overlay");
    expect(overlay.parentElement).toBe(document.body);
    expect(container.contains(overlay)).toBe(false);
    expect(screen.getByRole("dialog").closest(".topup-overlay")).toBe(overlay);
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByLabelText("Code")); // would be a 2nd prompt if they counted
    fireEvent.click(screen.getByText("Cancel"));
    expect(document.querySelectorAll(".topup-overlay")).toHaveLength(0);
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByText("Credits:"));
    expect(dialog()).toBeNull(); // only 6 real taps since the reopen: the inside clicks did not add up
  });

  it("adds nothing to the DOM before the taps: same markup, no role, tabindex or aria on the balance", () => {
    const on = renderUI(<StatsPanel player={{ credits: 50 }} tapEnabled />, low);
    const markupOn = on.container.innerHTML;
    on.unmount();
    const off = renderUI(<StatsPanel player={{ credits: 50 }} tapEnabled={false} />, low);
    expect(markupOn).toBe(off.container.innerHTML);
    expect(off.container.querySelector("[role], [tabindex], [aria-label], [aria-describedby], button, input")).toBeNull();
  });
});

describe("GameBoard tapEnabled", () => {
  const preDeal = { phase: GamePhases.PRE_DEAL, betCircle: 0, pendingBets: [] };
  const lowPlayer = { ...testPlayer, credits: 99 };
  // Seven quick taps on the balance: does the prompt open?
  const opens = (game, player = lowPlayer) => {
    const { unmount } = renderUI(<GameBoard />, { game, player: { player } });
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByText("Credits:"));
    const open = dialog() !== null;
    unmount();
    return open;
  };

  it("opens when signed in, under $100, before the deal, with nothing on the table or awaiting the server", () => {
    expect(opens(preDeal)).toBe(true);
    expect(opens(preDeal, { ...testPlayer, credits: 0 })).toBe(true);
  });

  it("not at $100 or more", () => {
    expect(opens(preDeal, { ...testPlayer, credits: 100 })).toBe(false);
    expect(opens(preDeal, { ...testPlayer, credits: 5000 })).toBe(false);
  });

  it("not when signed out", () => {
    expect(opens(preDeal, null)).toBe(false);
  });

  it("not in any other phase", () => {
    for (const phase of Object.values(GamePhases).filter((p) => p !== GamePhases.PRE_DEAL)) {
      expect(opens({ ...preDeal, phase }), phase).toBe(false);
    }
  });

  it("not with chips in the bet circle", () => {
    expect(opens({ ...preDeal, betCircle: 10 })).toBe(false);
  });

  it("not while a bet awaits the server", () => {
    expect(opens({ ...preDeal, pendingBets: [{ seq: 1, handTag: 1, amount: 10, newRound: true }] })).toBe(false);
  });
});

describe("TopUpPrompt", () => {
  let onClose, topUp, error, log;
  const show = (extra = {}) => renderUI(<TopUpPrompt onClose={onClose} />, { player: { topUp, ...extra } });
  const type = (value = CODE) => fireEvent.change(input(), { target: { value } });
  const submit = () => fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  // Types the code, submits, and lets the (already resolved) answer land.
  const send = async () => {
    type();
    await act(async () => { submit(); });
  };

  beforeEach(() => {
    onClose = vi.fn();
    topUp = vi.fn().mockResolvedValue({ ok: false, locked: false });
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    log = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => { error.mockRestore(); log.mockRestore(); });

  it("is a labelled modal dialog with a neutral heading, a password field and Submit / Cancel", () => {
    show();
    const d = screen.getByRole("dialog", { name: "Enter code" });
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(within(d).getByRole("heading", { name: "Enter code" })).toBeTruthy();
    expect(input().type).toBe("password");
    expect(input().getAttribute("autocomplete")).toBe("new-password"); // "off" is ignored by browsers: they would offer to save the code
    for (const a of ["data-lpignore", "data-1p-ignore", "data-bwignore"]) expect(input().getAttribute(a), a).toBe("true");
    expect(input().maxLength).toBe(200);
    expect(within(d).getByRole("button", { name: "Submit" })).toBeTruthy();
    expect(within(d).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("focuses the input on open and gives focus back to what had it when it closes", () => {
    const ui = (open) => <><button>Opener</button>{open && <TopUpPrompt onClose={onClose} />}</>;
    const { rerender } = renderUI(ui(false), { player: { topUp } });
    screen.getByText("Opener").focus();
    rerender(ui(true));
    expect(document.activeElement).toBe(input());
    rerender(ui(false));
    expect(document.activeElement).toBe(screen.getByText("Opener"));
  });

  it("closes on Escape and Cancel, and ignores other keys", () => {
    show();
    fireEvent.keyDown(document, { key: "a" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe("keeping Tab inside", () => {
    const tab = (shiftKey = false) => fireEvent.keyDown(document, { key: "Tab", shiftKey }); // false when the page default was prevented

    it("Tab on the last control wraps to the first, shift-Tab on the first wraps to the last", () => {
      show();
      screen.getByRole("button", { name: "Cancel" }).focus();
      expect(tab()).toBe(false);
      expect(document.activeElement).toBe(input());
      expect(tab(true)).toBe(false);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    });

    it("leaves Tab alone between the ends", () => {
      show();
      expect(tab()).toBe(true); // input is first, not last
      screen.getByRole("button", { name: "Submit" }).focus();
      expect(tab()).toBe(true);
      expect(tab(true)).toBe(true);
    });

    it("pulls focus back in from outside the dialog, either direction", () => {
      const ui = (open) => <><button>Outside</button>{open && <TopUpPrompt onClose={onClose} />}</>;
      const { rerender } = renderUI(ui(false), { player: { topUp } });
      rerender(ui(true));
      screen.getByText("Outside").focus();
      expect(tab()).toBe(false);
      expect(document.activeElement).toBe(input());
      screen.getByText("Outside").focus();
      expect(tab(true)).toBe(false);
      expect(document.activeElement).toBe(input());
    });

    it("while a request is out Submit and Cancel are disabled and skipped: Tab and shift-Tab keep focus on the input", async () => {
      topUp.mockReturnValue(new Promise(() => {}));
      show();
      await send();
      expect(screen.getByRole("button", { name: "Submit" }).disabled).toBe(true);
      expect(screen.getByRole("button", { name: "Cancel" }).disabled).toBe(true);
      expect(document.activeElement).toBe(input());
      expect(tab()).toBe(false);
      expect(document.activeElement).toBe(input());
      expect(tab(true)).toBe(false);
      expect(document.activeElement).toBe(input());
    });
  });

  describe("while a submit is busy", () => {
    const busy = async () => {
      show();
      await send();
    };
    beforeEach(() => { topUp.mockReturnValue(new Promise(() => {})); });

    it("Cancel is disabled and a click does nothing", async () => {
      await busy();
      const cancel = screen.getByRole("button", { name: "Cancel" });
      expect(cancel.disabled).toBe(true);
      fireEvent.click(cancel);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("Escape is ignored: the prompt stays open and onClose is not called", async () => {
      await busy();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
    });

    it("after a refusal Cancel is enabled and Escape closes again", async () => {
      const pending = deferred();
      topUp.mockReturnValue(pending.promise);
      await busy();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
      await act(async () => { pending.resolve({ ok: false, locked: false }); });
      expect(screen.getByRole("button", { name: "Cancel" }).disabled).toBe(false);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("signing out still closes the prompt", async () => {
      const ui = (player) => (
        <PlayerContext.Provider value={fakePlayer({ player, topUp })}><TopUpPrompt onClose={onClose} /></PlayerContext.Provider>
      );
      const view = render(ui(testPlayer));
      await send();
      expect(onClose).not.toHaveBeenCalled();
      view.rerender(ui(null));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("ignores an empty submit", () => {
    show();
    submit();
    fireEvent.submit(screen.getByRole("dialog"));
    expect(topUp).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sends the typed code, clears the field at once and disables Submit while waiting; a second submit is ignored", async () => {
    const pending = deferred();
    topUp.mockReturnValue(pending.promise);
    show();
    type();
    expect(input().value).toBe(CODE);
    await act(async () => { submit(); });
    expect(topUp).toHaveBeenCalledTimes(1);
    expect(topUp).toHaveBeenCalledWith(CODE);
    expect(input().value).toBe("");
    expect(screen.getByRole("button", { name: "Submit" }).disabled).toBe(true);
    expect(input().readOnly).toBe(true);
    await act(async () => { fireEvent.submit(screen.getByRole("dialog")); });
    expect(topUp).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ ok: true }); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on success", async () => {
    topUp.mockResolvedValue({ ok: true });
    show();
    await send();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the same generic message in an alert for every refusal, never a reason, and lets you try again", async () => {
    show();
    for (const answer of [
      { ok: false, locked: false }, { ok: false }, { ok: false, locked: false, retryAfter: "600" }, { ok: false, locked: false, retryAfter: null },
    ]) {
      topUp.mockResolvedValue(answer);
      await send();
      expect(screen.getByRole("alert").textContent).toBe("That didn't work.");
      expect(screen.getByRole("button", { name: "Submit" }).disabled).toBe(false);
      expect(document.activeElement).toBe(input());
      expect(input().value).toBe("");
    }
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clears the old message when you submit again", async () => {
    show();
    await send();
    expect(screen.getByRole("alert")).toBeTruthy();
    topUp.mockReturnValue(new Promise(() => {}));
    await send();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  describe("lockout message", () => {
    const locked = async (retryAfter) => {
      topUp.mockResolvedValue({ ok: false, locked: true, retryAfter });
      show();
      await send();
      return screen.getByRole("alert").textContent;
    };
    const base = "Too many attempts. Try again later";

    it.each([
      ["600", "10 minutes"], ["60", "1 minute"], ["1", "1 minute"], ["61", "2 minutes"], ["90", "2 minutes"], ["119", "2 minutes"], ["3600", "60 minutes"],
    ])("Retry-After %s rounds up to %s", async (retryAfter, words) => {
      expect(await locked(retryAfter)).toBe(`${base} in about ${words}.`);
    });

    it.each([["0"], ["-5"], ["soon"], ["Wed, 21 Oct 2026 07:28:00 GMT"], [""], [null], [undefined]])(
      "Retry-After %j gives the plain message, no time", async (retryAfter) => {
        expect(await locked(retryAfter)).toBe(`${base}.`);
      },
    );
  });

  it("shows Reconnecting... in a status only while a submit is out and the player is reconnecting", async () => {
    topUp.mockReturnValue(new Promise(() => {}));
    show({ reconnecting: true });
    expect(screen.queryByRole("status")).toBeNull(); // nothing sent yet
    await send();
    expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toBe("Reconnecting...");
  });

  it("shows no Reconnecting... while busy but connected", async () => {
    topUp.mockReturnValue(new Promise(() => {}));
    show({ reconnecting: false });
    await send();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("ignores an answer that arrives after it was closed", async () => {
    const pending = deferred();
    topUp.mockReturnValue(pending.promise);
    const first = show();
    await send();
    first.unmount();
    await act(async () => { pending.resolve({ ok: true }); });
    expect(onClose).not.toHaveBeenCalled();

    const late = deferred();
    topUp.mockReturnValue(late.promise);
    const second = show();
    await send();
    second.unmount();
    await act(async () => { late.resolve({ ok: false, locked: true, retryAfter: "60" }); });
    expect(onClose).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  describe("signing out while open", () => {
    // Re-renders the prompt under a new player value (null = signed out); the same onClose and topUp throughout.
    const harness = () => {
      const ui = (player) => (
        <PlayerContext.Provider value={fakePlayer({ player, topUp })}><TopUpPrompt onClose={onClose} /></PlayerContext.Provider>
      );
      const view = render(ui(testPlayer));
      return { signOut: () => view.rerender(ui(null)), view };
    };

    it("closes itself when the player becomes null, and not before", () => {
      const { signOut } = harness();
      expect(onClose).not.toHaveBeenCalled();
      signOut();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when opened with no player at all", () => {
      render(<PlayerContext.Provider value={fakePlayer({ player: null, topUp })}><TopUpPrompt onClose={onClose} /></PlayerContext.Provider>);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("an answer arriving after the sign-out is ignored once the prompt has gone", async () => {
      const pending = deferred();
      topUp.mockReturnValue(pending.promise);
      const { signOut, view } = harness();
      await send();
      signOut();
      expect(onClose).toHaveBeenCalledTimes(1);
      view.unmount(); // the parent closes it in response
      await act(async () => { pending.resolve({ ok: true }); });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    });
  });

  it("never leaves the typed code in the DOM or the console, on failure, success or close", async () => {
    const seen = () => document.body.innerHTML + document.body.textContent + [...document.querySelectorAll("input")].map((i) => i.value).join();
    const { unmount } = show();
    await send(); // refused
    expect(seen()).not.toContain(CODE);
    topUp.mockResolvedValue({ ok: true });
    await send();
    expect(seen()).not.toContain(CODE);
    unmount();
    expect(seen()).not.toContain(CODE);
    expect(topUp).toHaveBeenCalledTimes(2);
    [error, log].forEach((spy) => expect(JSON.stringify(spy.mock.calls)).not.toContain(CODE));
  });
});
