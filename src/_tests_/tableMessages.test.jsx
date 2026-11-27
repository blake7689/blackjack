import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import CenterMessage, { IDLE_MS } from "../components/CenterMessage/CenterMessage";
import GameBoard from "../components/GameBoard/GameBoard";
import { renderUI } from "./testUtils";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandResult, HandStatus, stackedShoe, outOfCards, confirmBets } from "../utils/_tests_/stackedShoe";
import { gameReducer, initialGameState, nextAutoAction } from "../utils/gameReducer";

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

describe("the board's #196 notices", () => {
  const UNLOADED = "Saved settings not loaded. Rules may differ. Retrying...";
  const PAYOUT = "The server refused your $20 payout; it was not paid.";
  const board = (game, messages = "all") => renderUI(<GameBoard />, { game: { phase: PRE_DEAL, seenIds: ["x"], ...game }, messages });
  const line = () => document.querySelector(".msg");
  const RESULTS = [GamePhases.RESULTS, GamePhases.POST_ROUND];
  const wonHand = { tag: 1, cards: [], hiddenCards: [], total: 19, bet: 10, payout: 20, result: HandResult.WIN, status: HandStatus.DONE };

  it.each(["all", "hints", "results"])("settings not loaded: the message line (the one live region) says so at once, in mode %s", (messages) => {
    board({ settingsUnloaded: true }, messages);
    expect(line().textContent).toBe(UNLOADED);
    expect(line().getAttribute("aria-live")).toBe("polite");
    expect(line().querySelector(".notice")).toBeTruthy();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
  });

  it.each([PLAYER_TURN, DEALING, OFFERS, END_ROUND, SETTLING_HANDS])("settings not loaded: shown in %s", (phase) => {
    board({ settingsUnloaded: true, phase, offers: phase === OFFERS ? { insurance: true } : null, hands: phase === OFFERS ? [wonHand] : [] });
    expect(line().textContent).toBe(UNLOADED);
  });

  it.each(RESULTS)("settings not loaded: never over a verdict (%s)", (phase) => {
    board({ settingsUnloaded: true, phase, hands: [wonHand] });
    expect(line().querySelector(".verdict")).toBeTruthy();
    expect(line().textContent).not.toContain(UNLOADED);
  });

  it("a refused bet's notice comes before the settings one", () => {
    board({ settingsUnloaded: true, notice: "The server refused your bet, so the round was cancelled." });
    expect(line().textContent).toBe("The server refused your bet, so the round was cancelled.");
  });

  it("a newer notice comes before a refused payout, which comes before the settings one", () => {
    const { unmount } = board({ settingsUnloaded: true, notice: "another notice", payoutNotice: PAYOUT }); // a refused payout clears `notice`, so this one is newer
    expect(line().textContent).toBe("another notice");
    unmount();
    board({ settingsUnloaded: true, payoutNotice: PAYOUT });
    expect(line().textContent).toBe(PAYOUT);
  });

  it.each([...RESULTS, END_ROUND, PRE_DEAL])("a refused payout is shown in place of the verdict in the live region (%s)", (phase) => {
    board({ payoutNotice: PAYOUT, phase, hands: RESULTS.includes(phase) ? [wonHand] : [] }, "results");
    expect(line().textContent).toBe(PAYOUT);
    expect(line().querySelector(".verdict")).toBeNull();
    expect(line().getAttribute("aria-live")).toBe("polite");
  });
});

// The table drawn from real reducer states: a refusal that arrives a round late (#196).
describe("the board with an earlier round's late refusal", () => {
  const PAYOUT = "The server refused your $5 payout; it was not paid.";
  const run = (state, ...actions) => actions.reduce((s, a) => gameReducer(s, { refill: outOfCards, credits: 1000, ...a }), state);
  const to = (s, phase) => {
    let next = s;
    for (let i = 0; i < 10 && next.phase !== phase; i++) next = run(next, { type: nextAutoAction(next) });
    expect(next.phase).toBe(phase);
    return next;
  };
  // 19 against 17, the earlier round's settle refused during the player's turn.
  const during = () => run(confirmBets(run(initialGameState, { type: "START_GAME", shoe: stackedShoe(["10", "10", "9", "7"]) }, { type: "ADD_BET", amount: 10 }, { type: "DEAL" }, { type: "DEAL_DONE" })),
    { type: "BET_REJECTED", seq: 999, payout: 5 });
  const stood = () => run(during(), { type: "STAND", handIdx: 0 });
  const draw = (game) => {
    renderUI(<GameBoard />, { game: { ...game, seenIds: ["x"] } });
    return document.querySelector(".msg");
  };

  it("during play the line says the refusal", () => {
    expect(draw(during()).textContent).toBe(PAYOUT);
  });

  it.each([GamePhases.RESULTS, GamePhases.POST_ROUND])("%s: this round's verdict shows, and the live line carries its results for a screen reader", (phase) => {
    const state = to(stood(), phase);
    const line = draw(state);
    expect(line.getAttribute("aria-live")).toBe("polite");
    expect(line.querySelector(".verdict b").textContent).toBe("WIN");
    expect(line.querySelector(".sr-only").textContent).toBe("Hand 1: win, 19. Dealer: 17.");
    expect(line.textContent).not.toContain("refused");
    expect(line.querySelector(".notice")).toBeNull();
  });

  it.each([GamePhases.END_ROUND, GamePhases.PRE_DEAL])("%s: the refusal is back on the line", (phase) => {
    let state = run(to(stood(), GamePhases.POST_ROUND), { type: "CONTINUE" });
    if (phase === GamePhases.PRE_DEAL) state = run(state, { type: "END_ROUND", shoe: stackedShoe(["2"]) });
    expect(state.phase).toBe(phase);
    expect(draw(state).textContent).toBe(PAYOUT);
  });

  it("this round's own refusal then takes the verdict's place", () => {
    const state = run(to(stood(), GamePhases.POST_ROUND), { type: "BET_REJECTED", seq: 1000, payout: 20 });
    const line = draw(state);
    expect(line.textContent).toBe("The server refused your $20 payout; it was not paid.");
    expect(line.querySelector(".verdict, .sr-only")).toBeNull();
  });
});

describe("the board shows the newest of a refused payout and a round's notice (#196)", () => {
  const PAYOUT = "The server refused your $20 payout; it was not paid.";
  const late = { type: "BET_REJECTED", seq: 999, payout: 20 };
  const run = (state, ...actions) => actions.reduce((s, a) => gameReducer(s, { refill: outOfCards, credits: 1000, ...a }), state);
  const dealt = (cards, settings = {}) => run({ ...initialGameState, settings: { ...initialGameState.settings, ...settings } },
    { type: "START_GAME", shoe: stackedShoe(cards) }, { type: "ADD_BET", amount: 10 }, { type: "DEAL" }, { type: "DEAL_DONE" });
  const shown = (game) => {
    renderUI(<GameBoard />, { game: { ...game, seenIds: ["x"] } });
    return document.querySelector(".msg").textContent;
  };

  it("an old payout notice, then a refused opening bet: the line says the round was cancelled", () => {
    const s = run(dealt(["10", "10", "9", "7"]), late);
    expect(shown(run(s, { type: "BET_REJECTED", seq: s.pendingBets[0].seq }))).toBe("The server refused your bet, so the round was cancelled.");
  });

  it("an old payout notice, then a refused double: the line says so during play", () => {
    const doubled = run(confirmBets(dealt(["5", "10", "6", "7", "K"])), late, { type: "DOUBLE", handIdx: 0 });
    expect(shown(run(doubled, { type: "BET_REJECTED", seq: doubled.pendingBets[0].seq }))).toBe("The server refused $10 of your stake; that hand plays for less.");
  });

  it("this round's payout refusal replaces an earlier bet notice and its verdict", () => {
    let s = confirmBets(dealt(["5", "10", "6", "7", "K"]));
    s = run(s, { type: "DOUBLE", handIdx: 0 });
    s = run(s, { type: "BET_REJECTED", seq: s.pendingBets[0].seq });
    for (let i = 0; i < 10 && s.phase !== GamePhases.POST_ROUND; i++) s = run(s, { type: nextAutoAction(s) });
    expect(s.phase).toBe(GamePhases.POST_ROUND);
    expect(shown(run(s, late))).toBe(PAYOUT);
  });

  it("this round's payout refused and the rebet now unaffordable: the next betting step still says the payout was not paid", () => {
    let s = confirmBets(dealt(["10", "10", "9", "7"], { resetInitialBet: true, autoDeal: true }));
    s = run(s, { type: "STAND", handIdx: 0 });
    for (let i = 0; i < 10 && s.phase !== GamePhases.POST_ROUND; i++) s = run(s, { type: nextAutoAction(s) });
    s = run(s, late, { type: "CONTINUE" }, { type: "END_ROUND", credits: 0, shoe: stackedShoe(["2"]) });
    expect(s).toMatchObject({ phase: GamePhases.PRE_DEAL, autoDealPaused: true });
    expect(shown(s)).toBe(PAYOUT);
  });
});
