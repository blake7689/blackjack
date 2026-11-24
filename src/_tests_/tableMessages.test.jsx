import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import CenterMessage, { IDLE_MS } from "../components/CenterMessage/CenterMessage";
import GameBoard from "../components/GameBoard/GameBoard";
import { renderUI } from "./testUtils";
import { GamePhases } from "../utils/constants/gamePhases";

// Table messages (L2-1): "all" is every line as it happens; "hints" (the default) keeps the line empty, shows a prompt (Place your bets, Tap Deal, Your move, the offers) once the
// player has been idle 5 s, never shows a status that resolves by itself (Dealing, Dealer plays...), and always shows results and notices; "results" shows only those two.
// A line that is not shown is not rendered at all (screen readers do not hear it); the .msg element stays.
const { PRE_DEAL, OFFERS, PLAYER_TURN, DEALER_TURN, DEALING, PEEK, END_ROUND, SETTLING_HANDS } = GamePhases;
const verdict = { kind: "win", word: "WIN", amt: "+$10", extra: null };
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const msg = (c) => c.querySelector(".msg");
const shown = (c) => msg(c).textContent;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const hints = (props = {}) => render(<CenterMessage gamePhase={PRE_DEAL} messages="hints" {...props} />);

describe("Hints (the default)", () => {
  it("keeps the line empty, then fades the prompt in once the player has been idle for 5 s", () => {
    const { container } = hints();
    expect(shown(container)).toBe("");
    advance(IDLE_MS - 1);
    expect(shown(container)).toBe("");
    advance(1);
    expect(shown(container)).toBe("Place your bets");
    expect(container.querySelector(".msg .prompt").textContent).toBe("Place your bets"); // .prompt carries the fade (and, with reduced motion, no fade)
  });

  it("the 5 s is 5000 ms", () => {
    expect(IDLE_MS).toBe(5000);
  });

  it("any pointer or key on the page starts the wait again", () => {
    const { container } = hints();
    advance(4000);
    fireEvent.pointerDown(document.body);
    advance(4999);
    expect(shown(container)).toBe("");
    advance(1);
    expect(shown(container)).toBe("Place your bets");
    fireEvent.keyDown(document.body, { key: "x" }); // an input while it shows hides it again, and the wait restarts
    expect(shown(container)).toBe("");
    advance(IDLE_MS);
    expect(shown(container)).toBe("Place your bets");
  });

  it("a phase change restarts the wait, and each prompt is its own: Tap Deal after a bet, Your move on the turn, the offers one by one", () => {
    const { container, rerender } = hints();
    advance(IDLE_MS);
    expect(shown(container)).toBe("Place your bets");
    rerender(<CenterMessage gamePhase={PRE_DEAL} messages="hints" bet={10} />);
    expect(shown(container)).toBe(""); // a new prompt waits its own 5 s
    advance(IDLE_MS);
    expect(shown(container)).toBe("Tap Deal");
    rerender(<CenterMessage gamePhase={PLAYER_TURN} messages="hints" />);
    expect(shown(container)).toBe("");
    advance(IDLE_MS);
    expect(shown(container)).toBe("Your move");
    rerender(<CenterMessage gamePhase={OFFERS} messages="hints" offers={{ insurance: true, evenMoney: true }} />);
    advance(IDLE_MS - 1);
    expect(shown(container)).toBe("");
    advance(1);
    expect(shown(container)).toBe("Even money?");
    rerender(<CenterMessage gamePhase={OFFERS} messages="hints" offers={{ insurance: true }} />);
    expect(shown(container)).toBe("");
    advance(IDLE_MS);
    expect(shown(container)).toBe("Insurance?");
    rerender(<CenterMessage gamePhase={OFFERS} messages="hints" offers={{ surrender: true }} />);
    advance(IDLE_MS);
    expect(shown(container)).toBe("Surrender?");
  });

  it("lines that resolve by themselves never show: Dealing, Dealer plays, Settling bets, Dealer checks, No blackjack, Shuffling, Waiting for the server, Dealing soon", () => {
    const lines = [
      { gamePhase: DEALING }, { gamePhase: DEALER_TURN }, { gamePhase: SETTLING_HANDS }, { gamePhase: PEEK }, { gamePhase: END_ROUND, lastHand: true },
      { gamePhase: PRE_DEAL, peek: "checking" }, { gamePhase: PLAYER_TURN, peek: "clear" }, { gamePhase: PRE_DEAL, shuffling: true },
      { gamePhase: SETTLING_HANDS, waiting: true }, { gamePhase: PRE_DEAL, bet: 10, autoDealing: true },
    ];
    for (const props of lines) {
      const { container, unmount } = hints(props);
      advance(60_000);
      expect(shown(container), JSON.stringify(props)).toBe("");
      unmount();
    }
  });

  it("a status after a prompt takes it off, and the prompt waits again when it comes back", () => {
    const { container, rerender } = hints();
    advance(IDLE_MS);
    rerender(<CenterMessage gamePhase={DEALING} messages="hints" />);
    expect(shown(container)).toBe("");
    rerender(<CenterMessage gamePhase={PRE_DEAL} messages="hints" />);
    expect(shown(container)).toBe(""); // not shown at once because it was shown before
    advance(IDLE_MS);
    expect(shown(container)).toBe("Place your bets");
  });

  it("notices always show, at once: Out of credits, the last hand, a refused bet, Reconnecting", () => {
    expect(shown(hints({ broke: true }).container)).toBe("Out of credits");
    expect(shown(hints({ gamePhase: PLAYER_TURN, lastHand: true }).container)).toBe("Last hand before the shuffle");
    expect(shown(hints({ notice: "Bet refused" }).container)).toBe("Bet refused");
    expect(shown(hints({ reconnecting: true }).container)).toBe("Reconnecting...");
  });

  it("a notice over a prompt hides it, and the prompt waits again after it", () => {
    const { container, rerender } = hints();
    advance(IDLE_MS);
    rerender(<CenterMessage gamePhase={PRE_DEAL} messages="hints" notice="Bet refused" />);
    expect(shown(container)).toBe("Bet refused");
    rerender(<CenterMessage gamePhase={PRE_DEAL} messages="hints" />);
    expect(shown(container)).toBe("");
    advance(IDLE_MS);
    expect(shown(container)).toBe("Place your bets");
  });

  it("a prompt that comes back with the same text after Reconnecting waits its 5 s again, and shows from no earlier commit", () => {
    const { container, rerender } = hints({ gamePhase: PLAYER_TURN });
    advance(IDLE_MS);
    expect(shown(container)).toBe("Your move");
    rerender(<CenterMessage gamePhase={PLAYER_TURN} messages="hints" reconnecting />);
    expect(shown(container)).toBe("Reconnecting...");
    rerender(<CenterMessage gamePhase={PLAYER_TURN} messages="hints" />);
    expect(shown(container)).toBe("");
    advance(IDLE_MS - 1);
    expect(shown(container)).toBe("");
    advance(1);
    expect(shown(container)).toBe("Your move");
  });

  it("the turn moving to another split hand (the same words) starts the wait again", () => {
    const { container, rerender } = hints({ gamePhase: PLAYER_TURN, hand: 0 });
    advance(IDLE_MS);
    expect(shown(container)).toBe("Your move");
    rerender(<CenterMessage gamePhase={PLAYER_TURN} messages="hints" hand={1} />);
    expect(shown(container)).toBe("");
    advance(IDLE_MS - 1);
    expect(shown(container)).toBe("");
    advance(1);
    expect(shown(container)).toBe("Your move");
  });

  it("the prompt is held while a dialog or the menu is open, and comes 5 s after they close", () => {
    const dialog = document.body.appendChild(document.createElement("div"));
    dialog.setAttribute("role", "dialog");
    const { container } = hints();
    advance(IDLE_MS * 4);
    expect(shown(container)).toBe("");
    dialog.remove();
    advance(IDLE_MS - 1);
    expect(shown(container)).toBe("");
    advance(1);
    expect(shown(container)).toBe("Place your bets");
    const menu = document.body.appendChild(document.createElement("nav"));
    menu.className = "menu";
    fireEvent.keyDown(document.body, { key: "x" }); // a key hides the prompt and the wait starts over, behind the open menu
    advance(IDLE_MS * 3);
    expect(shown(container)).toBe("");
    menu.hidden = true; // a closed menu does not hold it
    advance(IDLE_MS);
    expect(shown(container)).toBe("Place your bets");
    menu.remove();
  });

  it("every result shows at once, with its screen reader line", () => {
    const { container } = hints({ gamePhase: GamePhases.RESULTS, verdict, heard: "You win, 19 to 18" });
    expect(container.querySelector(".verdict.win b").textContent).toBe("WIN");
    expect(container.querySelector(".sr-only").textContent).toBe("You win, 19 to 18");
  });

  it("a line that is not shown is not in the page at all: no text, no hidden copy for a screen reader; the live region stays", () => {
    const { container } = hints({ gamePhase: DEALER_TURN });
    expect(msg(container).getAttribute("aria-live")).toBe("polite");
    expect(msg(container).innerHTML).toBe("");
    const waiting = hints();
    expect(msg(waiting.container).innerHTML).toBe("");
    expect(waiting.container.querySelector(".sr-only")).toBeNull();
  });
});

describe("Celebrations only", () => {
  it("shows results and notices and nothing else, however long the player waits", () => {
    for (const props of [{}, { bet: 10 }, { gamePhase: PLAYER_TURN }, { gamePhase: OFFERS, offers: { insurance: true } }, { gamePhase: DEALER_TURN }, { shuffling: true }]) {
      const { container, unmount } = render(<CenterMessage gamePhase={PRE_DEAL} messages="results" {...props} />);
      advance(60_000);
      expect(shown(container), JSON.stringify(props)).toBe("");
      unmount();
    }
    expect(shown(render(<CenterMessage gamePhase={PRE_DEAL} messages="results" broke />).container)).toBe("Out of credits");
    expect(shown(render(<CenterMessage gamePhase={PRE_DEAL} messages="results" notice="Bet refused" />).container)).toBe("Bet refused");
    expect(render(<CenterMessage gamePhase={GamePhases.RESULTS} messages="results" verdict={verdict} />).container.querySelector(".verdict")).not.toBeNull();
  });
});

describe("All", () => {
  it("is every line as it happens, with no wait", () => {
    expect(shown(render(<CenterMessage gamePhase={PRE_DEAL} messages="all" />).container)).toBe("Place your bets");
    expect(shown(render(<CenterMessage gamePhase={DEALER_TURN} messages="all" />).container)).toBe("Dealer plays");
    expect(shown(render(<CenterMessage gamePhase={PRE_DEAL} messages="all" shuffling />).container)).toBe("Shuffling");
    expect(shown(render(<CenterMessage gamePhase={PRE_DEAL} messages="all" bet={5} autoDealing />).container)).toBe("Dealing soon");
  });

  it("is the default of the component", () => {
    expect(shown(render(<CenterMessage gamePhase={PRE_DEAL} />).container)).toBe("Place your bets");
  });
});

describe("the board passes the setting through", () => {
  it("Hints on the table: an empty line, then Place your bets after 5 s", () => {
    renderUI(<GameBoard />, { game: { phase: PRE_DEAL, seenIds: ["x"] }, messages: "hints" });
    expect(document.querySelector(".msg").textContent).toBe("");
    advance(IDLE_MS);
    expect(document.querySelector(".msg").textContent).toBe("Place your bets");
  });
});
