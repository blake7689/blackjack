import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderUI } from "./testUtils";
import GameBoard from "../components/GameBoard/GameBoard";
import CenterMessage from "../components/CenterMessage/CenterMessage";
import { playRound } from "../utils/_tests_/stackedShoe";
import { GamePhases } from "../utils/constants/gamePhases";
import { initialGameState } from "../utils/gameReducer";
import { resultsLine } from "../utils/verdict";

// The round's verdict (#83, DESIGN section 5): one word on the felt, never over a card (it takes the message line's place); one hand shows it (and how the
// insurance went) and no tags; two or more hands show the net as the verdict and a tag under each circle.
const board = (round) => renderUI(<GameBoard />, { game: { ...round.state, seenIds: ["seen"] } }); // a table already in play: no shuffle on opening
const verdict = () => document.querySelector(".msg .verdict");
const tags = () => [...document.querySelectorAll(".seat .tag")].map((t) => t.textContent);
const felt = () => document.querySelector(".felt").className;

describe("one hand: the verdict line, no tags", () => {
  it("a win: WIN and the net, the felt takes the win light", () => {
    const round = playRound({ cards: ["10", "10", "9", "7"] }); // 19 against 17
    expect(round.state.phase).toBe(GamePhases.POST_ROUND);
    board(round);
    expect(verdict().className).toBe("verdict win");
    expect(verdict().textContent).toBe("WIN+$10");
    expect(tags()).toEqual([]);
    expect(felt()).toContain("r-win");
  });

  it("a loss: LOSE and the net; a push: PUSH with no amount", () => {
    board(playRound({ cards: ["10", "10", "7", "9"] }));
    expect(verdict().textContent).toBe("LOSE-$10");
    expect(felt()).toContain("r-lose");
    document.body.innerHTML = "";
    board(playRound({ cards: ["10", "10", "8", "8"] }));
    expect(verdict().className).toBe("verdict push");
    expect(verdict().textContent).toBe("PUSH");
    expect(felt()).toContain("r-push");
  });

  it("a bust says BUST, and the insurance's outcome is on the line: paid, or lost", () => {
    board(playRound({ cards: ["10", "A", "9", "K"], offers: ["take_insurance"], rules: { insurance: true }, bet: 10 })); // the dealer has blackjack; the $5 insurance pays $15
    expect(verdict().querySelector("b").textContent).toBe("LOSE");
    expect(verdict().querySelector("em").textContent).toBe("Insurance pays $15");
    document.body.innerHTML = "";
    board(playRound({ cards: ["10", "A", "9", "9"], offers: ["take_insurance"], rules: { insurance: true }, bet: 10 })); // no blackjack: the insurance is lost
    expect(verdict().querySelector("em").textContent).toBe("Insurance lost");
    document.body.innerHTML = "";
    board(playRound({ cards: ["10", "10", "6", "7", "K"], actions: ["hit"] }));
    expect(verdict().querySelector("b").textContent).toBe("BUST");
  });
});

describe("several hands: the net as the verdict, and a tag under each circle", () => {
  it("a split: each hand's own tag, and the round's net as the verdict (one loses, one wins: a push)", () => {
    const round = playRound({ cards: ["8", "10", "8", "7", "3", "10", "9"], actions: ["split", "stand", "stand"] }); // 11 loses to 17, 18 beats it
    expect(round.state.hands).toHaveLength(2);
    board(round);
    expect(tags()).toEqual(["LOSE", "WIN"]);
    expect(verdict().className).toBe("verdict push");
    expect(verdict().textContent).toBe("PUSH"); // a net of nothing has no amount
  });

  it("a split that wins both: the verdict is WIN with the round's net", () => {
    board(playRound({ cards: ["8", "10", "8", "7", "3", "10", "9"], actions: ["split", "hit", "stand"] })); // 20 and 18 against 17
    expect(tags()).toEqual(["WIN", "WIN"]);
    expect(verdict().textContent).toBe("WIN+$20");
  });
});

describe("nothing before the round is settled", () => {
  it("no verdict and no tags while the round is played", () => {
    const round = playRound({ cards: ["10", "10", "9", "7"] });
    renderUI(<GameBoard />, { game: { ...round.state, seenIds: ["seen"], phase: GamePhases.PLAYER_TURN, hands: round.state.hands.map((h) => ({ ...h, result: "none" })) } });
    expect(verdict()).toBeNull();
    expect(tags()).toEqual([]);
    expect(felt()).not.toMatch(/r-/);
  });
});

describe("CenterMessage: what takes the line", () => {
  const view = (props) => render(<CenterMessage gamePhase={GamePhases.PRE_DEAL} {...props} />).container.querySelector(".msg");
  const win = { kind: "win", word: "WIN", amt: "+$10", extra: null };

  it("the verdict shows the word, the net and the insurance line", () => {
    const line = view({ verdict: { ...win, extra: "Insurance lost" } });
    expect(line.querySelector("b").textContent).toBe("WIN");
    expect(line.querySelector(".num").textContent).toBe("+$10");
    expect(line.querySelector("em").textContent).toBe("Insurance lost");
  });

  it("a push has no amount, and no insurance line", () => {
    const line = view({ verdict: { kind: "push", word: "PUSH", amt: null, extra: null } });
    expect(line.textContent).toBe("PUSH");
  });

  it("the shuffle takes the line from the verdict, the peek's words show in turn, a notice or a reconnecting message beats them", () => {
    expect(view({ verdict: win, shuffling: true }).textContent).toBe("Shuffling");
    expect(view({ peek: "checking" }).textContent).toBe("Dealer checks for blackjack");
    expect(view({ peek: "clear" }).textContent).toBe("No blackjack");
    expect(view({ peek: "clear", shuffling: true }).textContent).toBe("Shuffling");
    expect(view({ notice: "Not enough credits", verdict: win }).textContent).toBe("Not enough credits");
    expect(view({ reconnecting: true, notice: "x" }).textContent).toBe("Reconnecting...");
    expect(view({ waiting: true, shuffling: true }).textContent).toBe("Waiting for the server...");
  });
});

describe("results for a screen reader (#85): one polite live region, resultsLine in it", () => {
  const live = () => document.querySelector(".msg");
  const heard = () => live().querySelector(".sr-only")?.textContent;
  const say = (round, showTotals = true) => resultsLine(round.state.hands, round.state.dealer, showTotals);

  it("each hand's outcome and total, then the dealer's", () => {
    expect(say(playRound({ cards: ["10", "10", "9", "7"] }))).toBe("Hand 1: win, 19. Dealer: 17.");
    expect(say(playRound({ cards: ["10", "10", "7", "9"] }))).toBe("Hand 1: lose, 17. Dealer: 19.");
    expect(say(playRound({ cards: ["10", "10", "8", "8"] }))).toBe("Hand 1: push, 18. Dealer: 18.");
    expect(say(playRound({ cards: ["10", "10", "6", "7", "K"], actions: ["hit"] }))).toBe("Hand 1: bust, 26. Dealer: 17.");
  });

  it("a split round names every hand", () => {
    const round = playRound({ cards: ["8", "10", "8", "7", "3", "10", "9"], actions: ["split", "stand", "stand"] });
    expect(say(round)).toBe("Hand 1: lose, 11. Hand 2: win, 18. Dealer: 17.");
  });

  it("a blackjack is said as blackjack, the dealer's too, instead of 21", () => {
    expect(say(playRound({ cards: ["A", "9", "K", "8"] }))).toBe("Hand 1: blackjack. Dealer: 17.");
    expect(say(playRound({ cards: ["10", "A", "9", "K"] }))).toBe("Hand 1: lose, 19. Dealer: blackjack.");
  });

  it("with Show hand totals off the totals are left out, but blackjack stays", () => {
    expect(say(playRound({ cards: ["10", "10", "9", "7"] }), false)).toBe("Hand 1: win.");
    expect(say(playRound({ cards: ["A", "9", "K", "8"] }), false)).toBe("Hand 1: blackjack.");
    expect(say(playRound({ cards: ["10", "A", "9", "K"] }), false)).toBe("Hand 1: lose. Dealer: blackjack.");
  });

  it("the board announces it inside the one aria-live line, once the round is settled", () => {
    board(playRound({ cards: ["10", "10", "9", "7"] }));
    expect(live().getAttribute("aria-live")).toBe("polite");
    expect(heard()).toBe("Hand 1: win, 19. Dealer: 17.");
    expect(live().textContent).toContain("WIN+$10"); // the visible verdict rides in the same line
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
  });

  it("the board follows Show hand totals", () => {
    renderUI(<GameBoard />, { game: { ...playRound({ cards: ["10", "10", "9", "7"] }).state, seenIds: ["seen"], settings: { ...initialGameState.settings, showTotals: false } } });
    expect(heard()).toBe("Hand 1: win.");
  });

  it("says nothing before the round is settled, and still only one live region", () => {
    const round = playRound({ cards: ["10", "10", "9", "7"] });
    renderUI(<GameBoard />, { game: { ...round.state, seenIds: ["seen"], phase: GamePhases.PLAYER_TURN, hands: round.state.hands.map((h) => ({ ...h, result: "none" })) } });
    expect(heard()).toBeUndefined();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
  });
});
