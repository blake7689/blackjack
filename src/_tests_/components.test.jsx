import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { initialGameState, gameReducer } from "../utils/gameReducer";
import { screen, fireEvent, cleanup, within } from "@testing-library/react";
import { renderUI, Flight, settleDeal, testPlayer } from "./testUtils";
import { stackedShoe, outOfCards } from "../utils/_tests_/stackedShoe";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import DealerArea from "../components/DealerArea/DealerArea";
import Dock from "../components/Dock/Dock";
import PlayerHand from "../components/Playerhand/PlayerHand";
import GameBoard from "../components/GameBoard/GameBoard";

let tagCount = 0;
const hand = (codes, extra = {}) => {
  const cards = stackedShoe(codes);
  return { tag: `t${tagCount++}`, cards, hiddenCards: [], bet: 10, status: HandStatus.PLAYING, result: HandResult.NONE, totals: [20], total: 20, isBusted: false, isBlackjack: false, ...extra };
};

// What a seat shows: the total pill (empty until a card has landed), then what is under the bet circle (the amount, the insurance, the result tags).
const pill = (c) => c.querySelector(".pill")?.textContent ?? "";
const amount = (c) => [...c.querySelector(".amt").children].map((el) => el.textContent).join(" ");
const live = (c) => `${pill(c)} | ${amount(c)}`;
const dealerPill = (c) => pill(c.querySelector(".dealer-hand"));

describe("dealing display (cards on the table, nothing landed yet)", () => {
  const countFigures = (c) => [...c.querySelectorAll(".count b")].map((b) => b.textContent);

  describe("cards still on the way", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    it("DealerArea shows no pill, and names its cards face down, until they have landed", () => {
      const dealer = { cards: stackedShoe(["A", "K"]), dealerDisplayTotal: 21, isBlackjack: true };
      const { container } = renderUI(<Flight><DealerArea dealer={dealer} /></Flight>);
      expect(container.querySelector(".pill")).toBeNull();
      expect(container.querySelector(".dealer-hand").getAttribute("aria-label")).toBe("Dealer: face-down card, face-down card");
      settleDeal();
      expect(pill(container)).toBe("Blackjack!");
      expect(container.querySelector(".dealer-hand").getAttribute("aria-label")).toBe("Dealer: ace of hearts, king of hearts, blackjack");
    });

    it("PlayerHand shows no pill, keeps the bet, and shows no result until its cards have landed", () => {
      const blackjack = hand(["A", "K"], { totals: [21], isBlackjack: true, result: HandResult.WIN });
      const props = { active: true, hand: blackjack };
      const { container } = renderUI(<Flight><PlayerHand {...props} multi gamePhase={GamePhases.POST_ROUND} /></Flight>); // with several hands each carries its tag (#83)
      expect(live(container)).toBe(" | $10");
      expect(container.querySelectorAll(".fly-card")).toHaveLength(2); // the cards stay on the table
      settleDeal();
      expect(live(container)).toBe("Blackjack! | BLACKJACK");
    });

    it("the board shows Dealing and no total or count between the deal and the first turn, then the totals and the keys that act", () => {
      const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: 1000, ...action });
      let s = step(initialGameState, { type: "START_GAME", shoe: stackedShoe(["10", "10", "9", "7"]) });
      const ready = step(s, { type: "ADD_BET", amount: 10 });
      const dealt = step(ready, { type: "DEAL" });
      const { container, gameState, rerender } = renderUI(<GameBoard />, { game: { ...ready, seenIds: ["seen"] } }); // a table already in play: no shuffle on opening
      Object.assign(gameState, dealt); // the board's first render was the empty table: these cards fly
      rerender(<GameBoard />);
      expect(screen.getByText("Dealing")).toBeTruthy();
      expect(live(container.querySelector(".seat"))).toBe(" | $10");
      expect(container.querySelector(".dealer .fly-card")).not.toBeNull();
      expect(container.querySelector(".pill")).toBeNull();
      expect(container.querySelector(".stage-in").classList.contains("dealing")).toBe(true); // Pill.css hides the totals while the opening cards are dealt
      expect(countFigures(container)).toEqual(["0", "0"]); // nothing has landed face up: nothing is counted yet
      expect(container.querySelectorAll(".fly-card")).toHaveLength(4);
      expect(screen.getByRole("button", { name: "Hit" }).getAttribute("aria-disabled")).toBe("true"); // dimmed while the cards fly
      Object.assign(gameState, step(dealt, { type: "DEAL_DONE" }));
      rerender(<GameBoard />);
      settleDeal();
      expect(screen.queryByText("Dealing")).toBeNull();
      expect(live(container.querySelector(".seat"))).toBe("19 | $10");
      expect(dealerPill(container)).toBe("10");
      expect(container.querySelector(".stage-in").classList.contains("dealing")).toBe(false);
      expect(countFigures(container)).toEqual(["-2", "-2"]); // the cards landed face up: 10, 10 and 9 are -1, -1 and 0 (the hole card is still down)
      expect(screen.getByRole("button", { name: "Hit" }).getAttribute("aria-disabled")).toBeNull();
    });
  });
});

describe("DealerArea", () => {
  it("shows the total in a pill beside the cards, red when it busts, and 'Blackjack!' for a natural", () => {
    const dealer = { cards: stackedShoe(["10", "6"]), dealerDisplayTotal: 16, isBusted: false, isBlackjack: false };
    const { container, rerender } = renderUI(<DealerArea dealer={dealer} />);
    expect(pill(container)).toBe("16");
    expect(container.querySelector(".pill").className).not.toMatch(/bust|bj/);
    expect(container.querySelector(".pill").parentElement).toBe(container.querySelector(".dealer-hand")); // beside the row of cards, never on a card
    rerender(<DealerArea dealer={{ cards: stackedShoe(["10", "6", "K"]), dealerDisplayTotal: 26, isBusted: true }} />);
    expect(pill(container)).toBe("26");
    expect(container.querySelector(".pill.bust")).not.toBeNull();
    rerender(<DealerArea dealer={{ cards: stackedShoe(["A", "K"]), dealerDisplayTotal: 21, isBlackjack: true }} />);
    expect(pill(container)).toBe("Blackjack!");
    expect(container.querySelector(".pill.bj")).not.toBeNull();
  });

  it("names the hand, and leaves the total out with Show hand totals off", () => {
    const dealer = { cards: stackedShoe(["10", "6"]), dealerDisplayTotal: 16 };
    const { container, rerender } = renderUI(<DealerArea dealer={dealer} hiddenCount={1} />);
    expect(container.querySelector(".dealer-hand").getAttribute("aria-label")).toBe("Dealer: 10 of hearts, 6 of hearts, face-down card, showing 16");
    rerender(<DealerArea dealer={dealer} hiddenCount={1} showTotals={false} />);
    expect(container.querySelector(".dealer-hand").getAttribute("aria-label")).toBe("Dealer: 10 of hearts, 6 of hearts, face-down card");
  });

  it("shows one card back per hidden card, after the up card", () => {
    const dealer = { cards: stackedShoe(["10"]), dealerDisplayTotal: 10 };
    const { container, rerender } = renderUI(<DealerArea dealer={dealer} />);
    expect(container.querySelectorAll(".dealer .fly-card")).toHaveLength(1);
    rerender(<DealerArea dealer={dealer} hiddenCount={1} />);
    // the back is an aria-hidden div: no image, no "Card back" name, nothing of the card
    const cards = [...container.querySelectorAll(".dealer .fly-card")];
    expect(cards.map((c) => c.querySelector("img")?.alt)).toEqual(["10 of hearts", undefined]);
    expect(cards[1].querySelector(".fly-back").getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByAltText("Card back")).toBeNull();
    expect(screen.queryByText(/card back/i)).toBeNull();
    expect(pill(container)).toBe("10");
  });
});

describe("PlayerHand", () => {
  const props = { active: true, gamePhase: GamePhases.PLAYER_TURN };

  it("shows a card back and the face-up total for a face-down double, and nothing of the hidden card", () => {
    const [king] = stackedShoe(["K"]);
    const doubled = hand(["6", "5"], { totals: [11], total: 11, bet: 20, status: HandStatus.DONE, hiddenCards: [king] });
    const { container } = renderUI(<PlayerHand {...props} gamePhase={GamePhases.DEALER_TURN} hand={doubled} />);
    expect(live(container)).toBe("11 | $20");
    expect([...container.querySelectorAll(".fly-card")].map((c) => c.querySelector("img")?.alt)).toEqual(["6 of hearts", "5 of hearts", undefined]);
    expect(container.querySelectorAll(".fly-back[aria-hidden='true']")).toHaveLength(3);
    expect(container.innerHTML).not.toMatch(new RegExp(`king|${king.id}|card back`, "i"));
  });

  it("shows soft totals, and holds no keys (they are in the dock)", () => {
    const { container } = renderUI(<PlayerHand {...props} active={false} hand={hand(["A", "6"], { totals: [17, 7] })} />);
    expect(live(container)).toBe("7/17 | $10");
    expect(screen.getByRole("button", { name: "Bet $10" }).hasAttribute("disabled")).toBe(true); // only the idle bet circle
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("marks the hand in play as active", () => {
    const { container, rerender } = renderUI(<PlayerHand {...props} hand={hand(["A", "6"])} />);
    expect(container.firstChild.classList.contains("active")).toBe(true);
    rerender(<PlayerHand {...props} active={false} hand={hand(["A", "6"])} />);
    expect(container.firstChild.classList.contains("active")).toBe(false);
  });

  it("with several hands shows each result as a tag under its circle, plus bust and blackjack tags; one hand has the verdict line instead", () => {
    const { container, rerender } = renderUI(<PlayerHand {...props} multi gamePhase={GamePhases.POST_ROUND}
      hand={hand(["10", "6", "K"], { status: HandStatus.DONE, result: HandResult.LOSE, isBusted: true })} />);
    expect(live(container)).toBe("26 | BUST");
    rerender(<PlayerHand {...props} multi gamePhase={GamePhases.RESULTS}
      hand={hand(["A", "K"], { status: HandStatus.DONE, result: HandResult.WIN, isBlackjack: true })} />);
    expect(live(container)).toBe("Blackjack! | BLACKJACK");
    expect(container.querySelector(".tag.bj")).not.toBeNull();
    rerender(<PlayerHand {...props} gamePhase={GamePhases.END_ROUND}
      hand={hand(["A", "K"], { status: HandStatus.DONE, result: HandResult.WIN, isBlackjack: true })} />);
    expect(live(container)).toBe("Blackjack! | $10"); // one hand: no tag
    expect(container.querySelector(".tag")).toBeNull();
  });

  it("hides an unsettled result", () => {
    renderUI(<PlayerHand {...props} gamePhase={GamePhases.POST_ROUND} hand={hand(["10", "9"], { status: HandStatus.DONE })} />);
    expect(screen.queryByText(/Win|Lose|Push/)).toBeNull();
  });
});

// The rules decide which keys of the dock are live (handActions): `has` is a key that is there and not dimmed.
describe("Dock keys follow the table rules (#91)", () => {
  const has = (name) => screen.queryByRole("button", { name })?.getAttribute("aria-disabled") == null && screen.queryByRole("button", { name }) !== null;
  const renderHand = (codes, extra = {}, rules = {}) => renderUI(<Dock busy={false} />, {
    game: { phase: GamePhases.PLAYER_TURN, hands: [hand(codes, extra)], dealer: { cards: stackedShoe(["6"]), dealerDisplayTotal: 6 }, settings: { ...initialGameState.settings, ...rules } },
    player: { player: { ...testPlayer, credits: 1000 } },
  });

  describe("split aces", () => {
    const splitAces = { isSplit: true };

    it("Hit is hidden on a split ace without hitSplitAces, and shown with it", () => {
      renderHand(["A", "5"], splitAces);
      expect([has("Hit"), has("Stay")]).toEqual([false, true]);
      cleanup();
      renderHand(["A", "5"], splitAces, { hitSplitAces: true });
      expect(has("Hit")).toBe(true);
    });

    it("an A-A that may be split again can split or stay but not hit; with hitSplitAces it can hit too", () => {
      renderHand(["A", "A"], splitAces, { resplitAces: true });
      expect([has("Hit"), has("Split"), has("Stay")]).toEqual([false, true, true]);
      cleanup();
      renderHand(["A", "A"], splitAces, { resplitAces: true, hitSplitAces: true });
      expect([has("Hit"), has("Split")]).toEqual([true, true]);
    });

    it("an A-A is split again only with resplitAces", () => {
      renderHand(["A", "A"], splitAces);
      expect(has("Split")).toBe(false);
    });

    it("Hit is still offered on an unsplit pair of aces and on a normal split hand", () => {
      renderHand(["A", "A"]);
      expect([has("Hit"), has("Split")]).toEqual([true, true]);
      cleanup();
      renderHand(["8", "3"], splitAces);
      expect(has("Hit")).toBe(true);
    });

    it("a split ace is never offered a double or a triple, even when it may hit", () => {
      renderHand(["A", "5"], splitAces, { hitSplitAces: true, tripleDown: true, doubleAfterSplit: true });
      expect([has("Hit"), has("Double"), has("Triple")]).toEqual([true, false, false]);
    });
  });

  describe("Double follows doubleOn and doubleAfterSplit", () => {
    it.each([
      ["any", ["5", "3"], true],
      ["any", ["A", "8"], true],
      ["9-11", ["5", "3"], false],
      ["9-11", ["5", "4"], true],
      ["9-11", ["6", "5"], true],
      ["9-11", ["7", "5"], false],
      ["9-11", ["A", "8"], false],
      ["10-11", ["5", "4"], false],
      ["10-11", ["6", "4"], true],
      ["10-11", ["A", "9"], false],
    ])("doubleOn %s with %j: Double shown is %s", (doubleOn, codes, shown) => {
      renderHand(codes, {}, { doubleOn });
      expect(has("Double")).toBe(shown);
    });

    it("doubleAfterSplit off hides Double on a split hand only", () => {
      renderHand(["5", "6"], { isSplit: true }, { doubleAfterSplit: false });
      expect(has("Double")).toBe(false);
      cleanup();
      renderHand(["5", "6"], {}, { doubleAfterSplit: false });
      expect(has("Double")).toBe(true);
      cleanup();
      renderHand(["5", "6"], { isSplit: true }, { doubleAfterSplit: true });
      expect(has("Double")).toBe(true);
    });

    it("a hand of three cards is never offered Double", () => {
      renderHand(["2", "3", "5"], {}, { doubleOn: "any" });
      expect(has("Double")).toBe(false);
    });

    it("the default rules (no props) offer Double on any two cards", () => {
      renderHand(["A", "8"]);
      expect(has("Double")).toBe(true);
    });
  });

  describe("Triple follows Double", () => {
    it("is shown exactly where Double is, when triple down is on", () => {
      renderHand(["5", "4"], {}, { tripleDown: true, doubleOn: "9-11" });
      expect([has("Double"), has("Triple")]).toEqual([true, true]);
      cleanup();
      renderHand(["5", "3"], {}, { tripleDown: true, doubleOn: "9-11" });
      expect([has("Double"), has("Triple")]).toEqual([false, false]);
      cleanup();
      renderHand(["5", "6"], { isSplit: true }, { tripleDown: true, doubleAfterSplit: false });
      expect([has("Double"), has("Triple")]).toEqual([false, false]);
    });

    it("is never shown with triple down off", () => {
      renderHand(["5", "4"], {}, { doubleOn: "9-11" });
      expect([has("Double"), has("Triple")]).toEqual([true, false]);
      expect(screen.queryByRole("button", { name: "Triple" })).toBeNull(); // off by a setting: not shown at all
    });
  });
});

describe("GameBoard", () => {
  const playing = {
    phase: GamePhases.PLAYER_TURN,
    hands: [hand(["8", "8"])],
    dealer: { cards: stackedShoe(["10"]), dealerDisplayTotal: 10 },
    shoe: stackedShoe(["2", "3"]),
  };

  it("wires the dock's keys to the hand in play", () => {
    const { gameActions, container } = renderUI(<GameBoard />, { game: { ...playing, selectedHandIndex: 1, hands: [hand(["10", "9"], { status: HandStatus.DONE }), ...playing.hands] } });
    ["Hit", "Stay", "Double", "Split"].forEach((name) => fireEvent.click(screen.getByRole("button", { name })));
    expect(screen.queryByRole("button", { name: "Triple" })).toBeNull();
    for (const act of ["hit", "stand", "double", "split"]) expect(gameActions[act]).toHaveBeenCalledWith(1);
    expect(gameActions.continueRound).not.toHaveBeenCalled();
    expect(dealerPill(container)).toBe("10");
    expect(screen.queryByAltText("Card back")).toBeNull();
  });

  it("offers Triple when the triple down setting is on", () => {
    const { gameActions } = renderUI(<GameBoard />, { game: { ...playing, settings: { ...initialGameState.settings, tripleDown: true } } });
    fireEvent.click(screen.getByRole("button", { name: "Triple" }));
    expect(gameActions.triple).toHaveBeenCalledWith(0);
  });

  it("has the stage structure and the e2e hooks (#79)", () => {
    const { container } = renderUI(<GameBoard />, { game: playing });
    const board = container.querySelector(".board");
    expect(board.classList.contains("table-screen")).toBe(true);
    const stageIn = board.querySelector(".main-area.stage .stage-in");
    expect(stageIn).not.toBeNull();
    expect(stageIn.querySelector(".cw-probe").getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".options-wrap")).not.toBeNull();
    expect(board.querySelector(".dock .options-wrap")).not.toBeNull(); // the keys that act sit in the dock, outside the hands
    expect(container.querySelector(".player-hand .options-wrap")).toBeNull();
    expect(container.querySelector(".flight-layer")).not.toBeNull();
    expect(container.querySelector(".deck-stack")).not.toBeNull();
    expect(board.classList.contains("busy")).toBe(false);
  });

  it("sets --n and the multi / many classes from the hand count (#79)", () => {
    const hands = (n) => Array.from({ length: n }, () => hand(["8", "8"]));
    const stageIn = (c) => c.querySelector(".stage-in");
    const one = renderUI(<GameBoard />, { game: { ...playing, hands: hands(1) } });
    expect(stageIn(one.container).style.getPropertyValue("--n")).toBe("1");
    expect(stageIn(one.container).className).toBe("stage-in");
    one.unmount();
    const two = renderUI(<GameBoard />, { game: { ...playing, hands: hands(2) } });
    expect(stageIn(two.container).style.getPropertyValue("--n")).toBe("2");
    expect(stageIn(two.container).className).toBe("stage-in multi");
    two.unmount();
    const four = renderUI(<GameBoard />, { game: { ...playing, hands: hands(4) } });
    expect(stageIn(four.container).style.getPropertyValue("--n")).toBe("4");
    expect(stageIn(four.container).className).toBe("stage-in multi many");
  });

  it("sets the card size variables on the stage (#79)", () => {
    const { container } = renderUI(<GameBoard />, { game: playing });
    expect(container.querySelector(".stage-in").style.getPropertyValue("--cw")).toBe("70px"); // jsdom measures 0: the fallback
    expect(container.querySelector(".stage-in").style.getPropertyValue("--ch")).toBe("102px");
  });

  it("has the tip line, empty and out of the way, between the stage and the dock (#3)", () => {
    const { container } = renderUI(<GameBoard />, { game: playing });
    const tip = container.querySelector(".tip-line");
    expect(tip.textContent).toBe("");
    expect(tip.childElementCount).toBe(0);
    expect(tip.previousElementSibling.classList.contains("room")).toBe(true);
    expect(tip.nextElementSibling).toBe(screen.getByLabelText("Controls"));
  });

  it("shows the card count by default", () => {
    renderUI(<GameBoard />, { game: playing });
    expect(screen.getByRole("group", { name: "Card count" })).toBeTruthy();
  });

  it("hides the card count when it is turned off (Dev tab)", () => {
    renderUI(<GameBoard />, { game: { ...playing, settings: { ...initialGameState.settings, showCardCount: false } } });
    expect(screen.queryByRole("group", { name: "Card count" })).toBeNull();
  });

  it("shows the US hole card face down", () => {
    const { container } = renderUI(<GameBoard />, { game: { ...playing, dealerHole: { cards: stackedShoe(["A"]) } } });
    const cards = [...container.querySelectorAll(".dealer .fly-card")];
    expect(cards.map((c) => c.querySelector("img")?.alt)).toEqual(["10 of hearts", undefined]); // the hole card is a plain back
    expect(cards[1].querySelector(".fly-back").getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByAltText("ace of hearts")).toBeNull();
    expect(container.innerHTML).not.toMatch(/ace[ _]of|card back/i);
  });

  it("a face-down double puts nothing of the hidden card in the page until the reveal", () => {
    const [six, ten, five, seven, king] = stackedShoe(["6", "10", "5", "7", "K"]);
    const hidden = { ...king, suit: "spades", id: "king-spades-0-1" }; // every other card on the table is a heart
    const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: 1000, ...action });
    let s = step(initialGameState, { type: "START_GAME", shoe: [six, ten, five, seven, hidden] });
    s = step(s, { type: "SET_SETTING", key: "doubleFaceDown", value: true });
    s = [{ type: "ADD_BET", amount: 10 }, { type: "DEAL" }, { type: "DEAL_DONE" }, { type: "DOUBLE", handIdx: 0 }].reduce(step, s);
    expect(s.hands[0].hiddenCards).toEqual([hidden]);
    const leaks = /king|spades|\b13\b|Busted|Blackjack/i;

    const { container, unmount } = renderUI(<GameBoard />, { game: s });
    expect(live(container.querySelector(".seat"))).toBe("11 | $20");
    expect(container.querySelectorAll(".player-hand .fly-back")).toHaveLength(3); // two face-up cards (their backs are hidden) and the double's back
    expect(container.querySelectorAll(".player-hand img")).toHaveLength(2); // the hidden card has no image
    expect(container.querySelector(".count b").textContent).toBe("+1"); // 6 +1, 10 -1, 5 +1: the king (-1) is not counted
    expect(container.innerHTML).not.toContain(hidden.id);
    expect(container.innerHTML).not.toMatch(leaks);
    expect(container.textContent).not.toMatch(leaks);
    unmount();

    const revealed = ["DEALER_REVEAL", "REVEAL_HIDDEN"].reduce((acc, type) => step(acc, { type }), s);
    const after = renderUI(<GameBoard />, { game: revealed });
    expect(screen.getByAltText("king of spades")).toBeTruthy(); // the search above is not vacuous
    expect(live(after.container.querySelector(".seat"))).toMatch(/^21 /);
    expect(after.container.querySelector(".count b").textContent).toBe("0");
    expect(screen.queryByAltText("Card back")).toBeNull();
  });

  it("tells the player the table is waiting for the server while settling with bets unanswered", () => {
    const waiting = { ...playing, phase: GamePhases.SETTLING_HANDS, pendingBets: [{ seq: 1, handTag: 1, amount: 10, newRound: false }] };
    renderUI(<GameBoard />, { game: waiting });
    expect(screen.getByText("Waiting for the server...")).toBeTruthy();
    cleanup();
    renderUI(<GameBoard />, { game: { ...waiting, pendingBets: [] } });
    expect(screen.getByText("Settling bets")).toBeTruthy();
    expect(screen.queryByText(/Waiting for the server/)).toBeNull();
    cleanup();
    // unanswered bets during the player's turn do not stop the turn or show the wait
    renderUI(<GameBoard />, { game: { ...waiting, phase: GamePhases.PLAYER_TURN } });
    expect(screen.queryByText(/Waiting for the server/)).toBeNull();
    expect(screen.getByRole("button", { name: "Hit" }).getAttribute("aria-disabled")).toBeNull();
  });

  it("shows Reconnecting... when the player context is reconnecting, and the round's notice", () => {
    const notice = "The server refused $10 of your stake; that hand plays for less.";
    renderUI(<GameBoard />, { game: { ...playing, notice }, player: { reconnecting: true } });
    expect(screen.getByText("Reconnecting...")).toBeTruthy(); // one line: Reconnecting... wins over the notice
    expect(screen.queryByText(/refused \$10 of your stake/)).toBeNull();
    cleanup();
    renderUI(<GameBoard />, { game: { ...playing, notice } });
    expect(screen.getByText(/refused \$10 of your stake/)).toBeTruthy();
    cleanup();
    renderUI(<GameBoard />, { game: playing });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("dims Double and Split on a hand whose stake was refused, and leaves Hit and Stay live", () => {
    renderUI(<GameBoard />, { game: { ...playing, hands: [hand(["8", "8"], { bet: 0 })] } });
    const off = (name) => screen.getByRole("button", { name }).getAttribute("aria-disabled");
    expect([off("Double"), off("Split"), off("Hit"), off("Stay")]).toEqual(["true", "true", null, null]);
  });

  it("continues on a click on the felt after the round, and hides an empty dealer", () => {
    const { gameActions, container } = renderUI(<GameBoard />, { game: { phase: GamePhases.POST_ROUND, hands: [hand(["10", "9"], { status: HandStatus.DONE, payout: 0 })] } });
    fireEvent.click(screen.getByRole("group", { name: /^Hand 1/ })); // a hand sits on the felt
    expect(gameActions.continueRound).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".dealer-area")).toBeNull();
  });

  it("a click on the felt continues only at the results, and one on the dock does not (the Next hand key does that itself)", () => {
    const { gameActions, rerender, gameState } = renderUI(<GameBoard />, { game: { phase: GamePhases.POST_ROUND, hands: [hand(["10", "9"], { status: HandStatus.DONE, payout: 0 })] } });
    fireEvent.click(screen.getByLabelText("Controls"));
    expect(gameActions.continueRound).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next hand" }));
    expect(gameActions.continueRound).toHaveBeenCalledTimes(1);
    for (const phase of [GamePhases.END_ROUND, GamePhases.PLAYER_TURN]) {
      gameState.phase = phase;
      rerender(<GameBoard />);
      fireEvent.click(screen.getByRole("group", { name: /^Hand 1/ }));
    }
    expect(gameActions.continueRound).toHaveBeenCalledTimes(1);
  });
});

describe("Surrender (#91)", () => {
  const props = { active: true, gamePhase: GamePhases.PLAYER_TURN };
  const label = (container) => live(container);
  // A hand after a surrender: DONE, flagged, with the result the engine gave it.
  const given = (result, extra = {}) => hand(["10", "6"], { status: HandStatus.DONE, surrendered: true, result, totals: [16], total: 16, ...extra });

  describe("PlayerHand label", () => {
    it.each([GamePhases.RESULTS, GamePhases.POST_ROUND, GamePhases.END_ROUND])("with several hands a surrendered hand carries the tag 'SURRENDER' once the round settles (%s)", (gamePhase) => {
      const { container } = renderUI(<PlayerHand {...props} multi active={false} gamePhase={gamePhase} hand={given(HandResult.SURRENDER)} />);
      expect(label(container)).toBe("16 | SURRENDER");
      expect(container.querySelector(".tag.surrender")).toBeTruthy();
    });

    it.each([GamePhases.PLAYER_TURN, GamePhases.DEALER_TURN, GamePhases.SETTLING_HANDS])("a surrender shows no tag before the round settles (%s)", (gamePhase) => {
      const { container } = renderUI(<PlayerHand {...props} multi active={false} gamePhase={gamePhase} hand={given(HandResult.SURRENDER)} />);
      expect(label(container)).toBe("16 | $10");
      expect(container.querySelector(".tag")).toBeNull();
    });

    it.each([GamePhases.DEALER_TURN, GamePhases.SETTLING_HANDS, GamePhases.RESULTS])("a waiting surrender shows nothing while the round plays on (%s)", (gamePhase) => {
      const { container } = renderUI(<PlayerHand {...props} multi active={false} gamePhase={gamePhase} hand={given(HandResult.NONE)} />);
      expect(label(container)).toBe("16 | $10");
      expect(screen.queryByText(/pending|Lose|Win|Push/i)).toBeNull();
    });

    it("a waiting surrender settled as a loss to the dealer blackjack shows 'LOSE' once the round is over, and nothing about pending", () => {
      for (const gamePhase of [GamePhases.POST_ROUND, GamePhases.END_ROUND]) {
        const { container, unmount } = renderUI(<PlayerHand {...props} multi active={false} gamePhase={gamePhase} hand={given(HandResult.LOSE)} />);
        expect(label(container)).toBe("16 | LOSE");
        unmount();
      }
    });

    it("a waiting surrender settled to half shows 'SURRENDER' once the round is over", () => {
      const { container } = renderUI(<PlayerHand {...props} multi active={false} gamePhase={GamePhases.POST_ROUND} hand={given(HandResult.SURRENDER)} />);
      expect(label(container)).toBe("16 | SURRENDER");
    });

    it("a hand that was not surrendered and has no result shows no label before the round ends", () => {
      const { container } = renderUI(<PlayerHand {...props} active={false} gamePhase={GamePhases.DEALER_TURN} hand={hand(["10", "9"], { status: HandStatus.DONE })} />);
      expect(label(container)).toBe("19 | $10");
      expect(container.querySelector(".tag")).toBeNull();
    });

    it("an ordinary result still waits for the round to end", () => {
      const { container } = renderUI(<PlayerHand {...props} active={false} gamePhase={GamePhases.DEALER_TURN} hand={hand(["10", "9"], { status: HandStatus.DONE, result: HandResult.WIN })} />);
      expect(container.querySelector(".tag")).toBeNull();
    });
  });

  describe("GameBoard", () => {
    const board = (cards, dealerCode, settings = {}, extra = {}) => ({
      phase: GamePhases.PLAYER_TURN,
      hands: [hand(cards, extra)],
      dealer: { cards: stackedShoe([dealerCode]), dealerDisplayTotal: 10 },
      shoe: stackedShoe(["2", "3"]),
      settings: { ...initialGameState.settings, ...settings },
    });
    const shown = (game) => { const { unmount } = renderUI(<GameBoard />, { game }); const key = screen.queryByRole("button", { name: /^Surrender/ }); const yes = key !== null && key.getAttribute("aria-disabled") === null; unmount(); return yes; };

    it("late against a ten: the key is there, and sends Surrender for hand 0", () => {
      const { gameActions } = renderUI(<GameBoard />, { game: board(["10", "6"], "K") });
      fireEvent.click(screen.getByRole("button", { name: /^Surrender/ }));
      expect(gameActions.surrender.mock.calls).toEqual([[0]]);
    });

    it("none hides it (the key is not there at all), whatever the dealer shows", () => {
      expect(shown(board(["10", "6"], "K", { surrender: "none" }))).toBe(false);
      expect(shown(board(["10", "6"], "6", { surrender: "none" }))).toBe(false);
      renderUI(<GameBoard />, { game: board(["10", "6"], "K", { surrender: "none" }) });
      expect(screen.queryByRole("button", { name: /Surrender/ })).toBeNull();
    });

    it("a rule that allows it but not on this hand shows the key dimmed, in place", () => {
      renderUI(<GameBoard />, { game: board(["2", "3", "4"], "K") });
      expect(screen.getByRole("button", { name: /^Surrender/ }).getAttribute("aria-disabled")).toBe("true");
    });

    it("early with no peek is offered against every up card; earlyNoAce is hidden against an ace only", () => {
      const noPeek = { dealerHoleBehaviour: "drawEarly_NoCheck" };
      for (const up of ["6", "K", "A"]) expect(shown(board(["10", "6"], up, { ...noPeek, surrender: "early" })), `early ${up}`).toBe(true);
      expect(shown(board(["10", "6"], "K", { ...noPeek, surrender: "earlyNoAce" }))).toBe(true);
      expect(shown(board(["10", "6"], "A", { ...noPeek, surrender: "earlyNoAce" }))).toBe(false);
    });

    it("with a peek, early is a move on the turn against a 2-9 only: against an ace or ten it was offered before the peek", () => {
      expect(shown(board(["10", "6"], "6", { surrender: "early" }))).toBe(true);
      for (const up of ["K", "A"]) expect(shown(board(["10", "6"], up, { surrender: "early" })), `early ${up}`).toBe(false);
      expect(shown(board(["10", "6"], "K", { surrender: "earlyNoAce" }))).toBe(false);
    });

    it("is not live after a hit (three cards), on a split hand, and after a double", () => {
      expect(shown(board(["2", "3", "4"], "K"))).toBe(false);
      expect(shown(board(["8", "3"], "K", {}, { isSplit: true }))).toBe(false);
      expect(shown(board(["5", "6"], "K", {}, { isDouble: true }))).toBe(false);
    });

    it("is not live outside the player's turn, with no dealer card needed", () => {
      for (const phase of [GamePhases.PRE_DEAL, GamePhases.DEALING, GamePhases.DEALER_TURN, GamePhases.POST_ROUND]) {
        expect(shown({ ...board(["10", "6"], "K"), phase, dealer: { cards: [], dealerDisplayTotal: 0 } }), phase).toBe(false);
      }
    });

    it("follows the hand in play: live on a two-card hand, dimmed on the next, which has three", () => {
      const game = { ...board(["8", "8"], "K"), hands: [hand(["10", "6"]), hand(["2", "3", "4"])] };
      const { gameActions, rerender, gameState } = renderUI(<GameBoard />, { game });
      expect(screen.getAllByRole("button", { name: /^Surrender/ })).toHaveLength(1);
      expect(screen.getByRole("button", { name: /^Surrender/ }).getAttribute("aria-disabled")).toBeNull();
      gameState.selectedHandIndex = 1;
      rerender(<GameBoard />);
      expect(screen.getByRole("button", { name: /^Surrender/ }).getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: /^Surrender/ }));
      expect(gameActions.surrender).not.toHaveBeenCalled();
    });
  });
});

describe("Offers (#91): insurance, even money and early surrender", () => {
  const { OFFERS, PEEK } = GamePhases;
  const props = { active: true, gamePhase: OFFERS };
  const INSURANCE = { insurance: true, evenMoney: false, surrender: false, peek: true };
  const EVEN = { insurance: false, evenMoney: true, surrender: false, peek: true };
  const offerKeys = () => within(screen.getByRole("group", { name: "Offers" })).getAllByRole("button").map((b) => b.textContent);
  const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: 1000, ...action });
  // A real table at the offers: Vegas rules, a bet of 10, the cards dealt and settled in front of the player.
  const table = (codes, settings = {}, upTo = "DEAL_DONE") => {
    let s = step(initialGameState, { type: "START_GAME", shoe: stackedShoe(codes) });
    for (const [key, value] of Object.entries(settings)) s = step(s, { type: "SET_SETTING", key, value });
    return [{ type: "ADD_BET", amount: 10 }, { type: "DEAL" }, { type: upTo }].reduce(step, s);
  };

  describe("PlayerHand", () => {
    describe("labels", () => {
      const insured = (extra = {}) => hand(["10", "6"], { totals: [16], total: 16, insurance: 5, ...extra });
      const view = (h, gamePhase) => renderUI(<PlayerHand {...props} multi active={false} gamePhase={gamePhase} hand={h} />).container; // several hands: the tags (one hand has the verdict line)

      it.each([OFFERS, PEEK, GamePhases.PLAYER_TURN, GamePhases.DEALER_TURN])("an insured hand shows its insurance next to the bet (%s)", (gamePhase) => {
        const container = view(insured(), gamePhase);
        expect(live(container)).toBe("16 | $10");
        expect(container.querySelector(".side-spot.ins").textContent).toBe("INS $5"); // its own side stack, its amount on a label
        expect(container.querySelector(".side-spot.ins svg")).not.toBeNull();
      });

      it("a half-dollar insurance shows as $2.50", () => {
        const container = view(insured({ bet: 5, insurance: 2.5 }), PEEK);
        expect(live(container)).toBe("16 | $5");
        expect(container.querySelector(".side-spot.ins i").textContent).toBe("INS $2.50");
      });

      it("an uninsured hand, or one whose insurance was refused (0), shows nothing about it", () => {
        expect(live(view(hand(["10", "6"], { totals: [16], total: 16 }), PEEK))).toBe("16 | $10");
        expect(live(view(insured({ insurance: 0 }), GamePhases.POST_ROUND))).toBe("16 | $10");
        expect(screen.queryByText(/Insurance|INS/)).toBeNull();
      });

      it.each([GamePhases.POST_ROUND, GamePhases.END_ROUND])("settled, a paid insurance says so (%s)", (gamePhase) => {
        const container = view(insured({ result: HandResult.LOSE, insurancePayout: 15 }), gamePhase);
        expect(live(container)).toBe("16 | LOSE Insurance pays $15");
        expect(container.querySelector(".tag.win").textContent).toBe("Insurance pays $15");
      });

      it("settled, a lost insurance says so", () => {
        const container = view(insured({ result: HandResult.LOSE, insurancePayout: 0 }), GamePhases.POST_ROUND);
        expect(live(container)).toBe("16 | LOSE Insurance lost");
        expect(container.querySelector(".tag.lose")).not.toBeNull();
      });

      it("the outcome of the insurance waits for the round to settle", () => {
        const container = view(insured({ result: HandResult.NONE, insurancePayout: 15 }), GamePhases.DEALER_TURN);
        expect(live(container)).toBe("16 | $10");
      });

      it("an insured early surrender shows both at the end: 'SURRENDER' and the insurance outcome", () => {
        const gone = insured({ surrendered: true, result: HandResult.SURRENDER, status: HandStatus.DONE, insurancePayout: 15 });
        expect(live(view(gone, PEEK))).toBe("16 | $10");
        cleanup();
        expect(live(view(gone, GamePhases.POST_ROUND))).toBe("16 | SURRENDER Insurance pays $15");
      });

      it("even money reads 'EVEN MONEY' instead of 'WIN' once the round settles, next to the Blackjack label", () => {
        const even = hand(["A", "K"], { totals: [21], total: 21, isBlackjack: true, result: HandResult.WIN, evenMoney: true, status: HandStatus.DONE });
        for (const gamePhase of [PEEK, GamePhases.DEALER_TURN]) {
          expect(live(view(even, gamePhase)), gamePhase).toBe("Blackjack! | $10");
          cleanup();
        }
        const container = view(even, GamePhases.POST_ROUND);
        expect(live(container)).toBe("Blackjack! | EVEN MONEY");
        expect(container.querySelector(".tag.even")).toBeTruthy();
      });

      it("a declined blackjack shows nothing before the settle, then Win or Push as always", () => {
        const bj = hand(["A", "K"], { totals: [21], total: 21, isBlackjack: true, result: HandResult.NONE, status: HandStatus.DONE });
        expect(live(view(bj, OFFERS))).toBe("Blackjack! | $10");
      });

    });
  });

  describe("GameBoard", () => {
    it("at OFFERS it shows the question and the offer keys, and no player options", () => {
      renderUI(<GameBoard />, { game: table(["10", "A", "6", "K"]) });
      expect(screen.getByText("Insurance?")).toBeTruthy();
      expect(offerKeys()).toEqual(["Insurance $5", "No thanks"]);
      expect(screen.queryByRole("button", { name: "Hit" })).toBeNull();
    });

    it("sends the offer keys to the game", () => {
      const { gameActions } = renderUI(<GameBoard />, { game: table(["10", "A", "6", "K"], { surrender: "early" }) });
      for (const name of [/^Insurance \$5/, /^Surrender/, "No thanks"]) fireEvent.click(screen.getByRole("button", { name }));
      expect(gameActions.takeInsurance).toHaveBeenCalledOnce();
      expect(gameActions.surrender.mock.calls).toEqual([[0]]);
      expect(gameActions.declineOffers).toHaveBeenCalledOnce();
    });

    it("a player blackjack gets 'Even money' and the question to match", () => {
      const { gameActions } = renderUI(<GameBoard />, { game: table(["A", "A", "K", "5"]) });
      expect(screen.getByText("Even money?")).toBeTruthy();
      expect(offerKeys()).toEqual(["Even money", "No thanks"]);
      fireEvent.click(screen.getByRole("button", { name: "Even money" }));
      expect(gameActions.evenMoney).toHaveBeenCalledOnce();
    });

    it("a click on the felt at OFFERS does not continue or decline anything", () => {
      const { gameActions } = renderUI(<GameBoard />, { game: table(["10", "A", "6", "K"]) });
      fireEvent.click(screen.getByRole("group", { name: /^Hand 1/ }));
      expect(gameActions.continueRound).not.toHaveBeenCalled();
      expect(gameActions.declineOffers).not.toHaveBeenCalled();
    });

    it("the offers are gone once the phase has moved on: the peek has no offer keys, its action keys wait, and it says what the dealer does", () => {
      const peeking = step(table(["10", "A", "6", "K"]), { type: "DECLINE_OFFERS" });
      expect(peeking.phase).toBe(PEEK);
      const { container } = renderUI(<GameBoard />, { game: peeking });
      expect(screen.getByText("Dealer checks for blackjack")).toBeTruthy();
      expect(screen.queryByRole("group", { name: "Offers" })).toBeNull();
      expect(screen.queryByText("No thanks")).toBeNull();
      expect(screen.getByRole("button", { name: "Hit" }).getAttribute("aria-disabled")).toBe("true");
      expect(live(container.querySelector(".seat"))).toBe("16 | $10");
    });

    it("the insurance is shown on the hand once taken", () => {
      const insured = step(table(["10", "A", "6", "K"]), { type: "TAKE_INSURANCE" });
      const { container } = renderUI(<GameBoard />, { game: insured });
      expect(live(container.querySelector(".seat"))).toBe("16 | $10");
      expect(container.querySelector(".side-spot.ins i").textContent).toBe("INS $5");
    });

    describe("the dealt hole card stays out of the page until the peek", () => {
      it("nothing of the hole card (rank, suit, id, count) is in the DOM at OFFERS, and it appears when the peek shows a blackjack", () => {
        const [p1, up, p2, hole] = stackedShoe(["10", "A", "6", "K"]);
        const secret = { ...hole, suit: "spades", id: "king-spades-0-1" }; // every other card on the table is a heart
        let s = step(initialGameState, { type: "START_GAME", shoe: [p1, up, p2, secret] });
        s = [{ type: "ADD_BET", amount: 10 }, { type: "DEAL" }, { type: "DEAL_DONE" }].reduce(step, s);
        expect(s.phase).toBe(OFFERS);
        expect(s.dealerHole.cards).toEqual([secret]); // the engine has it, the page must not
        const leaks = /king|spades/i;

        const { container, unmount } = renderUI(<GameBoard />, { game: s });
        expect(container.querySelectorAll(".dealer .fly-card")).toHaveLength(2); // the ace and a plain back
        expect(dealerPill(container)).toBe("1/11");
        expect(container.innerHTML).not.toContain(secret.id);
        expect(container.innerHTML).not.toMatch(leaks);
        expect(container.textContent).not.toMatch(leaks);
        expect(s.runningCount).toBe(-1); // 10 -1, ace -1, 6 +1: the hole card's -1 is not counted yet
        expect(container.querySelector(".count b").textContent).toBe("-1");
        unmount();

        // The same table through the peek, with the other cards unchanged.
        const peeked = step(step(s, { type: "DECLINE_OFFERS" }), { type: "PEEK" });
        expect(peeked.dealer.isBlackjack).toBe(true);
        renderUI(<GameBoard />, { game: peeked });
        expect(screen.getByAltText("king of spades")).toBeTruthy(); // the search above is not vacuous
      });

      it("while the peek is pending the hole card is still a back", () => {
        const [p1, up, p2, hole] = stackedShoe(["10", "A", "6", "K"]);
        const secret = { ...hole, suit: "spades", id: "king-spades-0-1" };
        const peeking = ["ADD_BET", "DEAL", "DEAL_DONE", "DECLINE_OFFERS"].reduce((acc, type) => step(acc, type === "ADD_BET" ? { type, amount: 10 } : { type }), step(initialGameState, { type: "START_GAME", shoe: [p1, up, p2, secret] }));
        expect(peeking.phase).toBe(PEEK);
        const { container } = renderUI(<GameBoard />, { game: peeking });
        expect(container.innerHTML).not.toMatch(/king|spades/i);
        expect(container.innerHTML).not.toContain(secret.id);
      });
    });
  });
});

describe("a split hand waiting for its card (#133)", () => {
  const props = { active: true, gamePhase: GamePhases.PLAYER_TURN };
  const waiting = (extra = {}) => hand(["8"], { isSplit: true, awaitingCard: true, totals: [8], total: 8, ...extra });

  const key = (name) => screen.getByRole("button", { name });
  const dock = (hands) => renderUI(<Dock busy={false} />, {
    game: { phase: GamePhases.PLAYER_TURN, hands, selectedHandIndex: 1, dealer: { cards: stackedShoe(["6"]), dealerDisplayTotal: 6 }, settings: { ...initialGameState.settings, tripleDown: true } },
    player: { player: { ...testPlayer, credits: 1000 } },
  });

  it("PlayerHand shows its one card and the bet", () => {
    const { container } = renderUI(<PlayerHand {...props} hand={waiting()} />);
    expect(container.querySelectorAll(".fly-card")).toHaveLength(1);
    expect(live(container)).toBe("8 | $10");
  });

  it("the dock dims every key while the hand in play waits for its card", () => {
    dock([hand(["8", "5"], { isSplit: true }), waiting()]);
    for (const name of ["Hit", "Stay", "Double", "Triple", "Split"]) expect(key(name).getAttribute("aria-disabled"), name).toBe("true");
  });

  it("the same hand without the flag is offered its keys, and again once the card has come", () => {
    dock([hand(["8", "5"], { isSplit: true }), waiting({ awaitingCard: undefined })]);
    expect(key("Hit").getAttribute("aria-disabled")).toBeNull();
    cleanup();
    const { gameActions } = dock([hand(["8", "5"], { isSplit: true }), hand(["8", "5"], { isSplit: true, awaitingCard: false, totals: [13], total: 13 })]);
    fireEvent.click(key("Stay"));
    expect(gameActions.stand).toHaveBeenCalledWith(1);
  });

  describe("on the board", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: 1000, ...action });
    const reachWaitingHand = () => {
      let s = step(initialGameState, { type: "START_GAME", shoe: stackedShoe(["8", "10", "8", "7", "3", "K"]) });
      s = [{ type: "ADD_BET", amount: 10 }, { type: "DEAL" }, { type: "DEAL_DONE" }, { type: "SPLIT", handIdx: 0 }, { type: "STAND", handIdx: 0 }].reduce(step, s);
      return s;
    };

    it("shows the first hand's two cards and the second hand's one, the keys dimmed while it waits, then live once it has its card", () => {
      const waiting = reachWaitingHand();
      expect(waiting.hands[1].awaitingCard).toBe(true);
      const { container, gameState, rerender } = renderUI(<GameBoard />, { game: waiting });
      settleDeal();
      expect([...container.querySelectorAll(".player-hand")].map((h) => h.querySelectorAll(".fly-card").length)).toEqual([2, 1]);
      expect(key("Hit").getAttribute("aria-disabled")).toBe("true");
      expect(key("Stay").getAttribute("aria-disabled")).toBe("true");
      Object.assign(gameState, step(waiting, { type: "DEAL_SPLIT_CARD" }));
      rerender(<GameBoard />);
      settleDeal();
      expect([...container.querySelectorAll(".player-hand")].map((h) => h.querySelectorAll(".fly-card").length)).toEqual([2, 2]);
      expect(key("Hit").getAttribute("aria-disabled")).toBeNull();
      expect(key("Stay").getAttribute("aria-disabled")).toBeNull();
    });
  });
});
