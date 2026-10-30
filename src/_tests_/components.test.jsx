import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { initialGameState, gameReducer } from "../utils/gameReducer";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { renderUI, Flight, settleDeal } from "./testUtils";
import { stackedShoe, outOfCards } from "../utils/_tests_/stackedShoe";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import CardCountDisplay from "../components/CardCountDisplay/CardCountDisplay";
import CenterMessage from "../components/CenterMessage/CenterMessage";
import OfferOptions from "../components/OfferOptions/OfferOptions";
import DealerArea from "../components/DealerArea/DealerArea";
import DeckStack from "../components/DeckStack/DeckStack";
import PlayerOptions from "../components/PlayerOptions/PlayerOptions";
import PlayerHand from "../components/Playerhand/PlayerHand";
import StatsPanel from "../components/StatsPanel/StatsPanel";
import BettingFooter from "../components/BettingFooter/BettingFooter";
import GameBoard from "../components/GameBoard/GameBoard";

let tagCount = 0;
const hand = (codes, extra = {}) => {
  const cards = stackedShoe(codes);
  return { tag: `t${tagCount++}`, cards, hiddenCards: [], bet: 10, status: HandStatus.PLAYING, result: HandResult.NONE, totals: [20], total: 20, isBusted: false, isBlackjack: false, ...extra };
};

// The hand-total strip has live text over an invisible copy of the final text (.ht-size): these read the live one.
const live = (c) => c.querySelector(".hand-total > span:not(.ht-size)").textContent;

describe("CardCountDisplay", () => {
  it("shows the running count and the true count from the shoe", () => {
    renderUI(<CardCountDisplay shoe={stackedShoe(Array(104).fill("7"))} runningCount={4} />);
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
});

describe("dealing display (cards on the table, nothing counted yet)", () => {
  const isHidden = (el) => el.style.visibility === "hidden";
  const dealing = GamePhases.DEALING;

  it("CardCountDisplay keeps the count's place but hides both values while dealing", () => {
    const shoe = stackedShoe(Array(104).fill("7"));
    const { container, rerender } = renderUI(<CardCountDisplay shoe={shoe} runningCount={4} dealing />);
    expect([".count-value", ".true-count-value"].map((q) => isHidden(container.querySelector(q)))).toEqual([true, true]);
    expect(screen.getByText("Count:")).toBeTruthy();
    rerender(<CardCountDisplay shoe={shoe} runningCount={4} dealing={false} />);
    expect([".count-value", ".true-count-value"].map((q) => isHidden(container.querySelector(q)))).toEqual([false, false]);
  });

  it("CenterMessage says Dealing...", () => {
    renderUI(<CenterMessage gamePhase={dealing} />);
    expect(screen.getByText("Dealing...")).toBeTruthy();
  });

  describe("cards still on the way", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    const size = (c) => c.querySelector(".hand-total > .ht-size").textContent;

    it("DealerArea shows '-' and no badges until its cards have landed, but keeps their room in the layout", () => {
      const dealer = { cards: stackedShoe(["A", "K"]), dealerDisplayTotal: 21, isBusted: true, isBlackjack: true };
      const { container } = renderUI(<Flight><DealerArea dealer={dealer} /></Flight>);
      expect(live(container)).toBe("Total: -");
      expect(size(container)).toBe("Total: 21 Busted Blackjack"); // invisible copy of the final text keeps the width
      expect(container.querySelector(".ht-size").getAttribute("aria-hidden")).toBe("true");
      settleDeal();
      expect(live(container)).toBe("Total: 21 Busted Blackjack");
    });

    it("PlayerHand shows '-' and no labels, keeps the bet, and offers no buttons until its cards have landed", () => {
      const blackjack = hand(["A", "K"], { totals: [21], isBlackjack: true, isBusted: true, result: HandResult.WIN });
      const props = { index: 0, active: true, handCount: 1, maxSplitHands: 0, credits: 1000, hand: blackjack };
      const { container } = renderUI(<Flight><PlayerHand {...props} gamePhase={GamePhases.DEALING} /></Flight>);
      expect(live(container)).toBe("Total: - | Bet: $10");
      expect(size(container)).toBe("Total: 21 | Bet: $10 Busted Blackjack");
      expect(screen.queryByText("Hit")).toBeNull();
      expect(container.querySelectorAll(".fly-card")).toHaveLength(2); // the cards stay on the table
      settleDeal();
      expect(live(container)).toBe("Total: 21 | Bet: $10 Busted Blackjack");
    });

    it("the board shows Dealing... and no total or count between the deal and the first turn, then the totals and buttons", () => {
      const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: 1000, ...action });
      let s = step(initialGameState, { type: "START_GAME", shoe: stackedShoe(["10", "10", "9", "7"]) });
      const ready = step(s, { type: "ADD_BET", amount: 10 });
      const dealt = step(ready, { type: "DEAL" });
      const { container, gameState, rerender } = renderUI(<GameBoard />, { game: ready });
      Object.assign(gameState, dealt); // the board's first render was the empty table: these cards fly
      rerender(<GameBoard />);
      expect(screen.getByText("Dealing...")).toBeTruthy();
      expect(container.querySelector(".player-hand .hand-total > span:not(.ht-size)").textContent).toBe("Total: - | Bet: $10");
      expect(container.querySelector(".dealer .fly-card")).not.toBeNull();
      expect(container.querySelector(".dealer-hand .hand-total > span:not(.ht-size)").textContent).toBe("Total: -");
      expect(isHidden(container.querySelector(".count-value"))).toBe(true);
      expect(container.querySelectorAll(".fly-card")).toHaveLength(4);
      expect(screen.queryByText("Hit")).toBeNull();
      Object.assign(gameState, step(dealt, { type: "DEAL_DONE" }));
      rerender(<GameBoard />);
      settleDeal();
      expect(screen.queryByText("Dealing...")).toBeNull();
      expect(container.querySelector(".player-hand .hand-total > span:not(.ht-size)").textContent).toBe("Total: 19 | Bet: $10");
      expect(container.querySelector(".dealer-hand .hand-total > span:not(.ht-size)").textContent).toBe("Total: 10");
      expect(isHidden(container.querySelector(".count-value"))).toBe(false);
      expect(screen.getByText("Hit")).toBeTruthy();
    });
  });
});

describe("CenterMessage", () => {
  it("shows the phase message, or nothing", () => {
    const { container, rerender } = renderUI(<CenterMessage gamePhase={GamePhases.PRE_DEAL} />);
    expect(screen.getByText("Place your bets!")).toBeTruthy();
    rerender(<CenterMessage gamePhase={GamePhases.END_ROUND} />);
    expect(container.firstChild.textContent).toBe("");
  });

  it("says it is waiting for the server instead of the phase message", () => {
    renderUI(<CenterMessage gamePhase={GamePhases.SETTLING_HANDS} waiting />);
    expect(screen.getByText("Waiting for the server...")).toBeTruthy();
    expect(screen.queryByText("Settling bets...")).toBeNull();
  });

  it("shows the phase message again once nothing is awaited", () => {
    renderUI(<CenterMessage gamePhase={GamePhases.SETTLING_HANDS} waiting={false} />);
    expect(screen.getByText("Settling bets...")).toBeTruthy();
    expect(screen.queryByText(/Waiting for the server/)).toBeNull();
  });

  it("shows Reconnecting... while the server does not answer, beside the phase message", () => {
    renderUI(<CenterMessage gamePhase={GamePhases.PLAYER_TURN} reconnecting />);
    expect(screen.getByRole("status").textContent).toBe("Reconnecting...");
  });

  it("shows a notice, and shows no status line without one", () => {
    const { rerender } = renderUI(<CenterMessage gamePhase={GamePhases.PRE_DEAL} notice="The server refused your bet, so the round was cancelled." />);
    expect(screen.getByRole("status").textContent).toBe("The server refused your bet, so the round was cancelled.");
    expect(screen.getByText("Place your bets!")).toBeTruthy();
    rerender(<CenterMessage gamePhase={GamePhases.PRE_DEAL} notice={null} reconnecting={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("DealerArea", () => {
  it("shows the total and the bust or blackjack badges", () => {
    const dealer = { cards: stackedShoe(["10", "6"]), dealerDisplayTotal: 16, isBusted: false, isBlackjack: false };
    const { container, rerender } = renderUI(<DealerArea dealer={dealer} />);
    expect(live(container)).toBe("Total: 16");
    expect(screen.queryByText(/Busted|Blackjack/)).toBeNull();
    rerender(<DealerArea dealer={{ ...dealer, isBusted: true, isBlackjack: true }} />);
    expect(live(container)).toBe("Total: 16 Busted Blackjack");
    expect(container.querySelector(".busted")).not.toBeNull();
    expect(container.querySelector(".blackjack")).not.toBeNull();
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
    expect(live(container)).toBe("Total: 10");
  });
});

describe("DeckStack", () => {
  it("shows decks, real cards left, and the cut-card notice", () => {
    const shoe = [...stackedShoe(["5", "6"]), { id: "CUT-1", type: "cut" }];
    renderUI(<DeckStack shoe={shoe} />, { game: { cutCardFound: true } });
    expect(screen.getByText("Shoe: 2")).toBeTruthy();
    expect(screen.getByText(/Decks: 6/)).toBeTruthy();
    expect(screen.getByText(/Cut Card Found/)).toBeTruthy();
  });

  it("hides the notice before the cut card", () => {
    renderUI(<DeckStack shoe={[]} />);
    expect(screen.queryByText(/Cut Card Found/)).toBeNull();
  });
});

describe("PlayerOptions", () => {
  it("always offers hit and stay, and double or split only when allowed", () => {
    const calls = { onHit: vi.fn(), onStay: vi.fn(), onDouble: vi.fn(), onTriple: vi.fn(), onSplit: vi.fn() };
    const { rerender } = renderUI(<PlayerOptions {...calls} showDouble showTriple showSplit />);
    ["Hit", "Stay", "Double", "Triple", "Split"].forEach((name) => fireEvent.click(screen.getByText(name)));
    Object.values(calls).forEach((fn) => expect(fn).toHaveBeenCalledOnce());
    rerender(<PlayerOptions {...calls} />);
    expect(screen.queryByText("Triple")).toBeNull();
    expect(screen.queryByText("Double")).toBeNull();
    expect(screen.queryByText("Split")).toBeNull();
  });
});

describe("PlayerHand", () => {
  const props = { index: 0, active: true, gamePhase: GamePhases.PLAYER_TURN, handCount: 1, maxSplitHands: 0, credits: 1000 };

  it("sends each option to the game for this hand", () => {
    const { gameActions } = renderUI(<PlayerHand {...props} index={2} hand={hand(["8", "8"])} />);
    ["Hit", "Stay", "Double", "Split"].forEach((name) => fireEvent.click(screen.getByText(name)));
    expect([gameActions.hit, gameActions.stand, gameActions.double, gameActions.split].map((fn) => fn.mock.calls)).toEqual([[[2]], [[2]], [[2]], [[2]]]);
  });

  it("shows a card back and the face-up total for a face-down double, and nothing of the hidden card", () => {
    const [king] = stackedShoe(["K"]);
    const doubled = hand(["6", "5"], { totals: [11], total: 11, bet: 20, status: HandStatus.DONE, hiddenCards: [king] });
    const { container } = renderUI(<PlayerHand {...props} gamePhase={GamePhases.DEALER_TURN} hand={doubled} />);
    expect(live(container)).toBe("Total: 11 | Bet: $20");
    expect([...container.querySelectorAll(".fly-card")].map((c) => c.querySelector("img")?.alt)).toEqual(["6 of hearts", "5 of hearts", undefined]);
    expect(container.querySelectorAll(".fly-back[aria-hidden='true']")).toHaveLength(3);
    expect(screen.queryByText(/Busted|Blackjack/)).toBeNull();
    expect(container.innerHTML).not.toMatch(new RegExp(`king|${king.id}|card back`, "i"));
  });

  it("offers triple only when the option is on, with two cards and two more stakes in the balance", () => {
    const pair = hand(["8", "8"]);
    const { gameActions, unmount } = renderUI(<PlayerHand {...props} index={1} tripleDown hand={pair} />);
    fireEvent.click(screen.getByText("Triple"));
    expect(gameActions.triple).toHaveBeenCalledWith(1);
    unmount();
    renderUI(<PlayerHand {...props} hand={pair} />);
    expect(screen.queryByText("Triple")).toBeNull();
    cleanup();
    renderUI(<PlayerHand {...props} tripleDown credits={19} hand={pair} />);
    expect(screen.getByText("Double")).toBeTruthy();
    expect(screen.queryByText("Triple")).toBeNull();
  });

  it("a hand whose stake was refused (bet 0) offers no double, triple or split, only hit and stay", () => {
    renderUI(<PlayerHand {...props} tripleDown hand={hand(["8", "8"], { bet: 0 })} />);
    expect(screen.getByText("Hit")).toBeTruthy();
    expect(screen.getByText("Stay")).toBeTruthy();
    for (const name of ["Double", "Triple", "Split"]) expect(screen.queryByText(name)).toBeNull();
  });

  it("hides split once the round has the most hands allowed", () => {
    renderUI(<PlayerHand {...props} handCount={2} maxSplitHands={2} hand={hand(["8", "8"], { isSplit: true })} />);
    expect(screen.queryByText("Split")).toBeNull();
  });

  it("offers double and split on an affordable pair", () => {
    const { container } = renderUI(<PlayerHand {...props} hand={hand(["8", "8"], { totals: [16] })} />);
    expect(live(container)).toBe("Total: 16 | Bet: $10");
    expect(screen.getByText("Double")).toBeTruthy();
    expect(screen.getByText("Split")).toBeTruthy();
  });

  it("hides double and split when the stake is not affordable", () => {
    renderUI(<PlayerHand {...props} credits={5} hand={hand(["8", "8"])} />);
    expect(screen.getByText("Hit")).toBeTruthy();
    expect(screen.queryByText("Double")).toBeNull();
    expect(screen.queryByText("Split")).toBeNull();
  });

  it("shows soft totals, and no options when not its turn", () => {
    const { container } = renderUI(<PlayerHand {...props} active={false} hand={hand(["A", "6"], { totals: [17, 7] })} />);
    expect(live(container)).toBe("Total: 17 / 7 | Bet: $10");
    expect(screen.queryByText("Hit")).toBeNull();
  });

  it("shows the result after the round, plus bust and blackjack badges", () => {
    const { container, rerender } = renderUI(<PlayerHand {...props} gamePhase={GamePhases.POST_ROUND}
      hand={hand(["10", "6", "K"], { status: HandStatus.DONE, result: HandResult.LOSE, isBusted: true })} />);
    expect(live(container)).toBe("Total: 20 | Bet: $10 Lose Busted");
    rerender(<PlayerHand {...props} gamePhase={GamePhases.END_ROUND}
      hand={hand(["A", "K"], { status: HandStatus.DONE, result: HandResult.WIN, isBlackjack: true })} />);
    expect(live(container)).toBe("Total: 20 | Bet: $10 Win Blackjack");
  });

  it("hides an unsettled result", () => {
    renderUI(<PlayerHand {...props} gamePhase={GamePhases.POST_ROUND} hand={hand(["10", "9"], { status: HandStatus.DONE })} />);
    expect(screen.queryByText(/Win|Lose|Push/)).toBeNull();
  });
});

describe("PlayerOptions Hit button (#91)", () => {
  it("hides Hit when showHit is false and shows it by default", () => {
    const calls = { onHit: vi.fn(), onStay: vi.fn() };
    const { rerender } = renderUI(<PlayerOptions {...calls} showHit={false} />);
    expect(screen.queryByText("Hit")).toBeNull();
    expect(screen.getByText("Stay")).toBeTruthy();
    rerender(<PlayerOptions {...calls} />);
    expect(screen.getByText("Hit")).toBeTruthy();
  });
});

describe("PlayerHand table rules (#91)", () => {
  const props = { index: 0, active: true, gamePhase: GamePhases.PLAYER_TURN, handCount: 1, maxSplitHands: 0, credits: 1000 };
  const has = (name) => screen.queryByText(name) !== null;
  const renderHand = (codes, extra = {}, rules = {}) => renderUI(<PlayerHand {...props} {...rules} hand={hand(codes, extra)} />);

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
    });
  });
});

describe("StatsPanel", () => {
  it("shows the balance with a +/- badge for the last change", () => {
    const { rerender } = renderUI(<StatsPanel player={{ credits: 1234 }} />, { player: { creditChange: { delta: 20, seq: 1 } } });
    expect(screen.getByText("$1,234")).toBeTruthy();
    expect(screen.getByText("+20").className).toContain("plus");
    rerender(<StatsPanel player={null} />);
    expect(screen.getByText("$0")).toBeTruthy();
  });

  it("shows a loss badge, or none", () => {
    renderUI(<StatsPanel player={{ credits: 90 }} />, { player: { creditChange: { delta: -10, seq: 2 } } });
    expect(screen.getByText("-10").className).toContain("minus");
  });

  it("shows no badge without a recent change", () => {
    const { container } = renderUI(<StatsPanel player={{ credits: 90 }} />);
    expect(container.querySelector(".credit-change")).toBeNull();
  });
});

describe("BettingFooter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers the chips the player can afford and wires bet, clear and deal", () => {
    const { gameActions } = renderUI(<BettingFooter />, { game: { phase: GamePhases.PRE_DEAL, betCircle: 15 }, player: { player: { credits: 30 } } });
    expect(screen.getAllByRole("button", { name: /^Add/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Add 1", "Add 5", "Add 10", "Add 25"]);
    fireEvent.click(screen.getByLabelText("Add 10"));
    fireEvent.click(screen.getByText("Clear"));
    fireEvent.click(screen.getByText("Deal"));
    expect(gameActions.addBet).toHaveBeenCalledWith(10);
    expect(gameActions.clearBet).toHaveBeenCalled();
    expect(gameActions.deal).toHaveBeenCalled();
    expect(screen.getByText("$15")).toBeTruthy();
  });

  it("offers only the chips chosen in settings", () => {
    renderUI(<BettingFooter />, { game: { phase: GamePhases.PRE_DEAL, settings: { ...initialGameState.settings, chipValues: "5,25,100" } }, player: { player: { credits: 60 } } });
    expect(screen.getAllByRole("button", { name: /^Add/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Add 5", "Add 25"]);
  });

  it("disables clear and deal with no bet, and hides the chips during a round", () => {
    const { container, rerender } = renderUI(<BettingFooter />, { game: { phase: GamePhases.PRE_DEAL } });
    expect(screen.getByText("Clear").disabled).toBe(true);
    expect(screen.getByText("Deal").disabled).toBe(true);
    rerender(<BettingFooter />);
    expect(container.querySelector(".bet-footer.compact")).toBeNull();
  });

  it("is compact with no chips outside PRE_DEAL", () => {
    const { container } = renderUI(<BettingFooter />, { game: { phase: GamePhases.PLAYER_TURN, betCircle: 10 } });
    expect(container.querySelector(".bet-footer.compact")).not.toBeNull();
    expect(screen.queryByLabelText("Add 1")).toBeNull();
  });

  it("has no chips and cannot deal without a player", () => {
    const { container } = renderUI(<BettingFooter />, { game: { phase: GamePhases.PRE_DEAL, betCircle: 10 }, player: { player: null } });
    expect(container.querySelector(".chip")).toBeNull();
    expect(screen.getByText("Deal").disabled).toBe(true);
  });

  it("publishes its height as a CSS variable and stops observing on unmount", () => {
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal("ResizeObserver", vi.fn(() => observer));
    const { unmount } = renderUI(<BettingFooter />, { game: { phase: GamePhases.PRE_DEAL } });
    expect(document.documentElement.style.getPropertyValue("--bet-footer-space")).toBe("0px");
    expect(observer.observe).toHaveBeenCalled();
    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
  });
});

describe("GameBoard", () => {
  const playing = {
    phase: GamePhases.PLAYER_TURN,
    hands: [hand(["8", "8"])],
    dealer: { cards: stackedShoe(["10"]), dealerDisplayTotal: 10 },
    shoe: stackedShoe(["2", "3"]),
  };

  it("wires each hand's buttons to that hand", () => {
    const { gameActions, container } = renderUI(<GameBoard />, { game: playing });
    ["Hit", "Stay", "Double", "Split"].forEach((name) => fireEvent.click(screen.getByText(name)));
    expect(screen.queryByText("Triple")).toBeNull();
    expect(gameActions.hit).toHaveBeenCalledWith(0);
    expect(gameActions.stand).toHaveBeenCalledWith(0);
    expect(gameActions.double).toHaveBeenCalledWith(0);
    expect(gameActions.split).toHaveBeenCalledWith(0);
    expect(gameActions.continueRound).not.toHaveBeenCalled();
    expect(container.querySelector(".dealer-hand .hand-total > span:not(.ht-size)").textContent).toBe("Total: 10");
    expect(screen.queryByAltText("Card back")).toBeNull();
  });

  it("offers Triple when the triple down setting is on", () => {
    const { gameActions } = renderUI(<GameBoard />, { game: { ...playing, settings: { ...initialGameState.settings, tripleDown: true } } });
    fireEvent.click(screen.getByText("Triple"));
    expect(gameActions.triple).toHaveBeenCalledWith(0);
  });

  it("scrolls the hand in play into view (many split hands scroll sideways)", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { rerender } = renderUI(<GameBoard />, { game: { ...playing, hands: [hand(["8", "8"]), hand(["8", "3"])] } });
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest", inline: "nearest" });
      rerender(<GameBoard />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });

  it("shows the card count by default", () => {
    renderUI(<GameBoard />, { game: playing });
    expect(screen.getByText("Count:")).toBeTruthy();
  });

  it("hides the card count when it is turned off (Dev tab)", () => {
    renderUI(<GameBoard />, { game: { ...playing, settings: { ...initialGameState.settings, showCardCount: false } } });
    expect(screen.queryByText("Count:")).toBeNull();
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
    expect(live(container.querySelector(".player-hand"))).toBe("Total: 11 | Bet: $20");
    expect(container.querySelectorAll(".player-hand .fly-back")).toHaveLength(3); // two face-up cards (their backs are hidden) and the double's back
    expect(container.querySelectorAll(".player-hand img")).toHaveLength(2); // the hidden card has no image
    expect(container.querySelector(".count-value").textContent).toBe("1"); // 6 +1, 10 -1, 5 +1: the king (-1) is not counted
    expect(container.innerHTML).not.toContain(hidden.id);
    expect(container.innerHTML).not.toMatch(leaks);
    expect(container.textContent).not.toMatch(leaks);
    unmount();

    const revealed = ["DEALER_REVEAL", "REVEAL_HIDDEN"].reduce((acc, type) => step(acc, { type }), s);
    const after = renderUI(<GameBoard />, { game: revealed });
    expect(screen.getByAltText("king of spades")).toBeTruthy(); // the search above is not vacuous
    expect(live(after.container.querySelector(".player-hand"))).toMatch(/^Total: 21/);
    expect(after.container.querySelector(".count-value").textContent).toBe("0");
    expect(screen.queryByAltText("Card back")).toBeNull();
  });

  it("tells the player the table is waiting for the server while settling with bets unanswered", () => {
    const waiting = { ...playing, phase: GamePhases.SETTLING_HANDS, pendingBets: [{ seq: 1, handTag: 1, amount: 10, newRound: false }] };
    renderUI(<GameBoard />, { game: waiting });
    expect(screen.getByText("Waiting for the server...")).toBeTruthy();
    cleanup();
    renderUI(<GameBoard />, { game: { ...waiting, pendingBets: [] } });
    expect(screen.getByText("Settling bets...")).toBeTruthy();
    expect(screen.queryByText(/Waiting for the server/)).toBeNull();
    cleanup();
    // unanswered bets during the player's turn do not stop the turn or show the wait
    renderUI(<GameBoard />, { game: { ...waiting, phase: GamePhases.PLAYER_TURN } });
    expect(screen.queryByText(/Waiting for the server/)).toBeNull();
    expect(screen.getByText("Hit")).toBeTruthy();
  });

  it("shows Reconnecting... when the player context is reconnecting, and the round's notice", () => {
    renderUI(<GameBoard />, { game: { ...playing, notice: "The server refused $10 of your stake; that hand plays for less." }, player: { reconnecting: true } });
    expect(screen.getByText("Reconnecting...")).toBeTruthy();
    expect(screen.getByText(/refused \$10 of your stake/)).toBeTruthy();
    cleanup();
    renderUI(<GameBoard />, { game: playing });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not offer Double or Split on a hand whose stake was refused", () => {
    renderUI(<GameBoard />, { game: { ...playing, hands: [hand(["8", "8"], { bet: 0 })] } });
    expect(screen.queryByText("Double")).toBeNull();
    expect(screen.queryByText("Split")).toBeNull();
    expect(screen.getByText("Hit")).toBeTruthy();
  });

  it("continues on a table click after the round, and hides an empty dealer", () => {
    const { gameActions, container } = renderUI(<GameBoard />, { game: { phase: GamePhases.POST_ROUND } });
    fireEvent.click(container.querySelector(".board"));
    expect(gameActions.continueRound).toHaveBeenCalled();
    expect(container.querySelector(".dealer-area")).toBeNull();
  });
});

describe("BettingFooter auto deal control (#88)", () => {
  const on = { ...initialGameState.settings, resetInitialBet: true, autoDeal: true };
  const toggle = (name) => screen.queryByRole("button", { name });

  it("has no Pause or Resume button unless auto deal and Reset Bet are both on", () => {
    for (const settings of [initialGameState.settings, { ...initialGameState.settings, autoDeal: true }, { ...initialGameState.settings, resetInitialBet: true }]) {
      renderUI(<BettingFooter />, { game: { phase: GamePhases.PRE_DEAL, settings } });
      expect(toggle(/auto deal/)).toBeNull();
      cleanup();
    }
  });

  it("shows Pause, and Resume once paused, and each calls its action", () => {
    const { gameActions, rerender, gameState } = renderUI(<BettingFooter />, { game: { phase: GamePhases.PRE_DEAL, settings: on } });
    const pause = toggle("Pause auto deal");
    expect(pause.textContent).toBe("Pause");
    expect(toggle("Resume auto deal")).toBeNull();
    fireEvent.click(pause);
    expect(gameActions.pauseAutoDeal).toHaveBeenCalledTimes(1);
    expect(gameActions.resumeAutoDeal).not.toHaveBeenCalled();

    gameState.autoDealPaused = true;
    rerender(<BettingFooter />);
    const resume = toggle("Resume auto deal");
    expect(resume.textContent).toBe("Resume");
    expect(toggle("Pause auto deal")).toBeNull();
    fireEvent.click(resume);
    expect(gameActions.resumeAutoDeal).toHaveBeenCalledTimes(1);
    expect(gameActions.pauseAutoDeal).toHaveBeenCalledTimes(1);
  });

  it("shows only between rounds: in PRE_DEAL, POST_ROUND and END_ROUND", () => {
    for (const phase of [GamePhases.PRE_DEAL, GamePhases.POST_ROUND, GamePhases.END_ROUND]) {
      renderUI(<BettingFooter />, { game: { phase, settings: on } });
      expect(toggle("Pause auto deal"), phase).not.toBeNull();
      cleanup();
    }
  });

  it("is not in the page during a round: dealing, the turns, settling, results, or before the game starts", () => {
    const duringRound = [GamePhases.DEALING, GamePhases.PLAYER_TURN, GamePhases.DEALER_TURN, GamePhases.SETTLING_HANDS, GamePhases.RESULTS, GamePhases.NONE];
    for (const phase of duringRound) {
      for (const autoDealPaused of [false, true]) {
        renderUI(<BettingFooter />, { game: { phase, settings: on, autoDealPaused, betCircle: 10 } });
        expect(toggle(/auto deal/), `${phase} paused=${autoDealPaused}`).toBeNull();
        cleanup();
      }
    }
  });

  it("stays absent between rounds when either setting is off", () => {
    for (const phase of [GamePhases.PRE_DEAL, GamePhases.POST_ROUND, GamePhases.END_ROUND]) {
      for (const settings of [{ ...on, autoDeal: false }, { ...on, resetInitialBet: false }]) {
        renderUI(<BettingFooter />, { game: { phase, settings } });
        expect(toggle(/auto deal/), phase).toBeNull();
        cleanup();
      }
    }
  });

  it("a pending deal adds no countdown", () => {
    const { container } = renderUI(<BettingFooter />, { game: { phase: GamePhases.PRE_DEAL, settings: on, betCircle: 10, autoDealPending: true } });
    expect(toggle("Pause auto deal")).not.toBeNull();
    expect(container.textContent).not.toMatch(/countdown|dealing in|seconds/i);
  });

  it("clicking it does not reach the board's click, which would continue the round", () => {
    const { gameActions, container } = renderUI(<GameBoard />, { game: { phase: GamePhases.POST_ROUND, settings: on } });
    fireEvent.click(screen.getByRole("button", { name: "Pause auto deal" }));
    expect(gameActions.pauseAutoDeal).toHaveBeenCalledTimes(1);
    expect(gameActions.continueRound).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".board")); // the board itself still continues
    expect(gameActions.continueRound).toHaveBeenCalledTimes(1);
  });

  it("Resume does not continue the round either", () => {
    const { gameActions } = renderUI(<GameBoard />, { game: { phase: GamePhases.POST_ROUND, settings: on, autoDealPaused: true } });
    fireEvent.click(screen.getByRole("button", { name: "Resume auto deal" }));
    expect(gameActions.resumeAutoDeal).toHaveBeenCalledTimes(1);
    expect(gameActions.continueRound).not.toHaveBeenCalled();
  });
});

describe("Surrender (#91)", () => {
  const props = { index: 0, active: true, gamePhase: GamePhases.PLAYER_TURN, handCount: 1, maxSplitHands: 0, credits: 1000 };
  const label = (container) => live(container);
  // A hand after a surrender: DONE, flagged, with the result the engine gave it.
  const given = (result, extra = {}) => hand(["10", "6"], { status: HandStatus.DONE, surrendered: true, result, totals: [16], total: 16, ...extra });

  describe("PlayerOptions", () => {
    it("hides Surrender by default and shows it, last, when asked; the click calls onSurrender", () => {
      const onSurrender = vi.fn();
      const { rerender, container } = renderUI(<PlayerOptions onHit={vi.fn()} onStay={vi.fn()} />);
      expect(screen.queryByText("Surrender")).toBeNull();
      rerender(<PlayerOptions onHit={vi.fn()} onStay={vi.fn()} showSurrender onSurrender={onSurrender} />);
      expect([...container.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Hit", "Stay", "Surrender"]);
      fireEvent.click(screen.getByText("Surrender"));
      expect(onSurrender).toHaveBeenCalledOnce();
    });
  });

  describe("PlayerHand buttons", () => {
    it("shows Surrender only when told to, and sends it to the game for this hand", () => {
      const { gameActions, unmount } = renderUI(<PlayerHand {...props} index={2} showSurrender hand={hand(["10", "6"])} />);
      fireEvent.click(screen.getByText("Surrender"));
      expect(gameActions.surrender.mock.calls).toEqual([[2]]);
      unmount();
      renderUI(<PlayerHand {...props} hand={hand(["10", "6"])} />);
      expect(screen.queryByText("Surrender")).toBeNull();
    });

    it("no button when it is not this hand's turn, even if the board allows it", () => {
      renderUI(<PlayerHand {...props} active={false} showSurrender hand={hand(["10", "6"])} />);
      expect(screen.queryByText("Surrender")).toBeNull();
      cleanup();
      renderUI(<PlayerHand {...props} gamePhase={GamePhases.DEALER_TURN} showSurrender hand={hand(["10", "6"])} />);
      expect(screen.queryByText("Surrender")).toBeNull();
    });
  });

  describe("PlayerHand label", () => {
    it.each([GamePhases.PLAYER_TURN, GamePhases.DEALER_TURN, GamePhases.SETTLING_HANDS, GamePhases.RESULTS, GamePhases.POST_ROUND, GamePhases.END_ROUND])(
      "an at-once surrender shows 'Surrendered' straight away (%s)", (gamePhase) => {
        const { container } = renderUI(<PlayerHand {...props} active={false} gamePhase={gamePhase} hand={given(HandResult.SURRENDER)} />);
        expect(label(container)).toBe("Total: 16 | Bet: $10 Surrendered");
        expect(screen.queryByText(/pending/)).toBeNull();
        expect(container.querySelector(".hand-result.Surrendered")).toBeTruthy();
      });

    it.each([GamePhases.DEALER_TURN, GamePhases.SETTLING_HANDS, GamePhases.RESULTS])("a waiting surrender shows 'Surrender pending' while the round plays on (%s)", (gamePhase) => {
      const { container } = renderUI(<PlayerHand {...props} active={false} gamePhase={gamePhase} hand={given(HandResult.NONE)} />);
      expect(label(container)).toBe("Total: 16 | Bet: $10 Surrender pending");
      expect(screen.queryByText(/Lose|Win|Push/)).toBeNull();
    });

    it("a waiting surrender settled as a loss to the dealer blackjack shows 'Lose' once the round is over, and nothing about pending", () => {
      for (const gamePhase of [GamePhases.POST_ROUND, GamePhases.END_ROUND]) {
        const { container, unmount } = renderUI(<PlayerHand {...props} active={false} gamePhase={gamePhase} hand={given(HandResult.LOSE)} />);
        expect(label(container)).toBe("Total: 16 | Bet: $10 Lose");
        unmount();
      }
    });

    it("a waiting surrender settled to half shows 'Surrendered' once the round is over", () => {
      const { container } = renderUI(<PlayerHand {...props} active={false} gamePhase={GamePhases.POST_ROUND} hand={given(HandResult.SURRENDER)} />);
      expect(label(container)).toBe("Total: 16 | Bet: $10 Surrendered");
    });

    it("the invisible size copy carries the final text, so the strip does not change width", () => {
      for (const result of [HandResult.SURRENDER, HandResult.NONE]) {
        const { container, unmount } = renderUI(<PlayerHand {...props} active={false} gamePhase={GamePhases.DEALER_TURN} hand={given(result)} />);
        const copy = container.querySelector(".hand-total > .ht-size");
        expect(copy.getAttribute("aria-hidden")).toBe("true");
        expect(copy.textContent).toBe(label(container));
        expect(copy.textContent).toMatch(result === HandResult.NONE ? /Surrender pending/ : /Surrendered/);
        unmount();
      }
    });

    it("a hand that was not surrendered and has no result shows no label before the round ends", () => {
      const { container } = renderUI(<PlayerHand {...props} active={false} gamePhase={GamePhases.DEALER_TURN} hand={hand(["10", "9"], { status: HandStatus.DONE })} />);
      expect(label(container)).toBe("Total: 20 | Bet: $10");
      expect(container.querySelector(".hand-result")).toBeNull();
    });

    it("an ordinary result still waits for the round to end", () => {
      const { container } = renderUI(<PlayerHand {...props} active={false} gamePhase={GamePhases.DEALER_TURN} hand={hand(["10", "9"], { status: HandStatus.DONE, result: HandResult.WIN })} />);
      expect(container.querySelector(".hand-result")).toBeNull();
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
    const shown = (game) => { const { unmount } = renderUI(<GameBoard />, { game }); const yes = screen.queryByText("Surrender") !== null; unmount(); return yes; };

    it("late against a ten: the button is there, and sends Surrender for hand 0", () => {
      const { gameActions } = renderUI(<GameBoard />, { game: board(["10", "6"], "K") });
      fireEvent.click(screen.getByText("Surrender"));
      expect(gameActions.surrender.mock.calls).toEqual([[0]]);
    });

    it("none hides it, whatever the dealer shows", () => {
      expect(shown(board(["10", "6"], "K", { surrender: "none" }))).toBe(false);
      expect(shown(board(["10", "6"], "6", { surrender: "none" }))).toBe(false);
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

    it("is hidden after a hit (three cards), on a split hand, and after a double", () => {
      expect(shown(board(["2", "3", "4"], "K"))).toBe(false);
      expect(shown(board(["8", "3"], "K", {}, { isSplit: true }))).toBe(false);
      expect(shown(board(["5", "6"], "K", {}, { isDouble: true }))).toBe(false);
    });

    it("is hidden outside the player's turn, with no dealer card needed", () => {
      for (const phase of [GamePhases.PRE_DEAL, GamePhases.DEALING, GamePhases.DEALER_TURN, GamePhases.POST_ROUND]) {
        expect(shown({ ...board(["10", "6"], "K"), phase, dealer: { cards: [], dealerDisplayTotal: 0 } }), phase).toBe(false);
      }
    });

    it("is shown on the hand in play only", () => {
      const game = { ...board(["8", "8"], "K"), hands: [hand(["10", "6"]), hand(["9", "7"])], selectedHandIndex: 1 };
      renderUI(<GameBoard />, { game });
      expect(screen.getAllByText("Surrender")).toHaveLength(1);
    });
  });
});

describe("Offers (#91): insurance, even money and early surrender", () => {
  const { OFFERS, PEEK } = GamePhases;
  const props = { index: 0, active: true, gamePhase: OFFERS, handCount: 1, maxSplitHands: 0, credits: 1000 };
  const INSURANCE = { insurance: true, evenMoney: false, surrender: false, peek: true };
  const EVEN = { insurance: false, evenMoney: true, surrender: false, peek: true };
  const buttons = (container) => [...container.querySelectorAll(".options-wrap button")].map((b) => b.textContent);
  const step = (state, action) => gameReducer(state, { refill: outOfCards, credits: 1000, ...action });
  // A real table at the offers: Vegas rules, a bet of 10, the cards dealt and settled in front of the player.
  const table = (codes, settings = {}, upTo = "DEAL_DONE") => {
    let s = step(initialGameState, { type: "START_GAME", shoe: stackedShoe(codes) });
    for (const [key, value] of Object.entries(settings)) s = step(s, { type: "SET_SETTING", key, value });
    return [{ type: "ADD_BET", amount: 10 }, { type: "DEAL" }, { type: upTo }].reduce(step, s);
  };

  describe("CenterMessage", () => {
    it("names the offer that is open", () => {
      const message = (offers) => { const { unmount, container } = renderUI(<CenterMessage gamePhase={OFFERS} offers={offers} />); const text = container.firstChild.textContent; unmount(); return text; };
      expect(message(INSURANCE)).toBe("Insurance?");
      expect(message(EVEN)).toBe("Even money?");
      expect(message({ ...INSURANCE, surrender: true })).toBe("Insurance or surrender?");
      expect(message({ ...INSURANCE, insurance: false, surrender: true })).toBe("Surrender?");
    });

    it("says nothing at OFFERS without offers, and says what the dealer is doing at PEEK", () => {
      const { container, rerender } = renderUI(<CenterMessage gamePhase={OFFERS} offers={null} />);
      expect(container.firstChild.textContent).toBe("");
      rerender(<CenterMessage gamePhase={PEEK} />);
      expect(container.firstChild.textContent).toBe("Dealer checks for blackjack...");
    });

    it("waiting for the server still wins over an offer", () => {
      renderUI(<CenterMessage gamePhase={OFFERS} offers={INSURANCE} waiting />);
      expect(screen.getByText("Waiting for the server...")).toBeTruthy();
    });
  });

  describe("OfferOptions", () => {
    const stake = 5;
    const handlers = () => ({ onInsurance: vi.fn(), onEvenMoney: vi.fn(), onSurrender: vi.fn(), onDecline: vi.fn() });

    it("insurance offered: 'Insurance $5' and 'No thanks', in that order", () => {
      const { container } = renderUI(<OfferOptions offers={INSURANCE} stake={stake} {...handlers()} />);
      expect(buttons(container)).toEqual(["Insurance $5", "No thanks"]);
      expect(screen.getByRole("group", { name: "Offers" })).toBeTruthy();
      expect(container.querySelector(".options-wrap")).not.toBeNull(); // the class the busy board hides
    });

    it("a half-dollar stake is shown as it is: $2.5", () => {
      renderUI(<OfferOptions offers={INSURANCE} stake={2.5} {...handlers()} />);
      expect(screen.getByText("Insurance $2.5")).toBeTruthy();
    });

    it("even money offered: 'Even money' and 'No thanks'", () => {
      const { container } = renderUI(<OfferOptions offers={EVEN} stake={stake} {...handlers()} />);
      expect(buttons(container)).toEqual(["Even money", "No thanks"]);
    });

    it("early surrender and insurance together, then each one alone", () => {
      const { container, rerender } = renderUI(<OfferOptions offers={{ ...INSURANCE, surrender: true }} stake={stake} {...handlers()} />);
      expect(buttons(container)).toEqual(["Insurance $5", "Surrender", "No thanks"]);
      rerender(<OfferOptions offers={{ ...INSURANCE, insurance: false, surrender: true }} stake={stake} {...handlers()} />);
      expect(buttons(container)).toEqual(["Surrender", "No thanks"]);
    });

    it("an offer already used is gone, and 'No thanks' is always there", () => {
      const { container } = renderUI(<OfferOptions offers={{ ...INSURANCE, insurance: false }} stake={stake} {...handlers()} />);
      expect(buttons(container)).toEqual(["No thanks"]);
    });

    it("each button calls its own handler", () => {
      const h = handlers();
      renderUI(<OfferOptions offers={{ insurance: true, evenMoney: true, surrender: true }} stake={stake} {...h} />);
      for (const name of ["Insurance $5", "Even money", "Surrender", "No thanks"]) fireEvent.click(screen.getByText(name));
      expect([h.onInsurance, h.onEvenMoney, h.onSurrender, h.onDecline].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 1]);
    });
  });

  describe("PlayerHand", () => {
    it("shows the offers on the hand in play at OFFERS and sends each to the game (surrender for this hand)", () => {
      const { gameActions } = renderUI(<PlayerHand {...props} index={3} offers={{ ...INSURANCE, surrender: true }} hand={hand(["10", "6"])} />);
      for (const name of ["Insurance $5", "Surrender", "No thanks"]) fireEvent.click(screen.getByText(name));
      expect(gameActions.takeInsurance).toHaveBeenCalledOnce();
      expect(gameActions.surrender.mock.calls).toEqual([[3]]);
      expect(gameActions.declineOffers).toHaveBeenCalledOnce();
      expect(gameActions.evenMoney).not.toHaveBeenCalled();
      expect(screen.queryByText("Hit")).toBeNull(); // the player's options wait for the offers
    });

    it("even money goes to the game", () => {
      const { gameActions } = renderUI(<PlayerHand {...props} offers={EVEN} hand={hand(["A", "K"], { isBlackjack: true, status: HandStatus.DONE, totals: [21], total: 21 })} />);
      fireEvent.click(screen.getByText("Even money"));
      expect(gameActions.evenMoney).toHaveBeenCalledOnce();
    });

    it("the stake follows the bet: $5 on a $10 bet, $2.5 on a $5 bet", () => {
      renderUI(<PlayerHand {...props} offers={INSURANCE} hand={hand(["10", "6"], { bet: 5 })} />);
      expect(screen.getByText("Insurance $2.5")).toBeTruthy();
    });

    it("no offers when not at OFFERS, when it is not the hand in play, or when none are passed", () => {
      renderUI(<PlayerHand {...props} gamePhase={GamePhases.PLAYER_TURN} offers={INSURANCE} hand={hand(["10", "6"])} />);
      expect(screen.queryByText("No thanks")).toBeNull();
      cleanup();
      renderUI(<PlayerHand {...props} active={false} offers={INSURANCE} hand={hand(["10", "6"])} />);
      expect(screen.queryByText("No thanks")).toBeNull();
      cleanup();
      renderUI(<PlayerHand {...props} offers={null} hand={hand(["10", "6"])} />);
      expect(screen.queryByText("No thanks")).toBeNull();
    });

    describe("labels", () => {
      const insured = (extra = {}) => hand(["10", "6"], { totals: [16], total: 16, insurance: 5, ...extra });
      const view = (h, gamePhase) => renderUI(<PlayerHand {...props} active={false} gamePhase={gamePhase} hand={h} />).container;

      it.each([OFFERS, PEEK, GamePhases.PLAYER_TURN, GamePhases.DEALER_TURN])("an insured hand shows its insurance next to the bet (%s)", (gamePhase) => {
        expect(live(view(insured(), gamePhase))).toBe("Total: 16 | Bet: $10 | Insurance: $5");
      });

      it("a half-dollar insurance shows as $2.5", () => {
        expect(live(view(insured({ bet: 5, insurance: 2.5 }), PEEK))).toBe("Total: 16 | Bet: $5 | Insurance: $2.5");
      });

      it("an uninsured hand, or one whose insurance was refused (0), shows nothing about it", () => {
        expect(live(view(hand(["10", "6"], { totals: [16], total: 16 }), PEEK))).toBe("Total: 16 | Bet: $10");
        expect(live(view(insured({ insurance: 0 }), GamePhases.POST_ROUND))).toBe("Total: 16 | Bet: $10");
        expect(screen.queryByText(/Insurance/)).toBeNull();
      });

      it.each([GamePhases.POST_ROUND, GamePhases.END_ROUND])("settled, a paid insurance says so (%s)", (gamePhase) => {
        const container = view(insured({ result: HandResult.LOSE, insurancePayout: 15 }), gamePhase);
        expect(live(container)).toBe("Total: 16 | Bet: $10 | Insurance: $5 Lose Insurance pays $15");
        expect(container.querySelector(".hand-total > span:not(.ht-size) .hand-result.Win").textContent).toBe(" Insurance pays $15");
      });

      it("settled, a lost insurance says so", () => {
        const container = view(insured({ result: HandResult.LOSE, insurancePayout: 0 }), GamePhases.POST_ROUND);
        expect(live(container)).toBe("Total: 16 | Bet: $10 | Insurance: $5 Lose Insurance lost");
        expect(container.querySelector(".hand-result.Lose").textContent).not.toBe("");
      });

      it("the outcome of the insurance waits for the round to settle", () => {
        const container = view(insured({ result: HandResult.NONE, insurancePayout: 15 }), GamePhases.DEALER_TURN);
        expect(live(container)).toBe("Total: 16 | Bet: $10 | Insurance: $5");
      });

      it("an insured early surrender shows both: 'Surrendered' at once and the insurance outcome at the end", () => {
        const gone = insured({ surrendered: true, result: HandResult.SURRENDER, status: HandStatus.DONE, insurancePayout: 15 });
        expect(live(view(gone, PEEK))).toBe("Total: 16 | Bet: $10 | Insurance: $5 Surrendered");
        cleanup();
        expect(live(view(gone, GamePhases.POST_ROUND))).toBe("Total: 16 | Bet: $10 | Insurance: $5 Surrendered Insurance pays $15");
      });

      it("even money reads 'Even money' at once, instead of 'Win', next to the Blackjack label", () => {
        const even = hand(["A", "K"], { totals: [21], total: 21, isBlackjack: true, result: HandResult.WIN, evenMoney: true, status: HandStatus.DONE });
        for (const gamePhase of [PEEK, GamePhases.DEALER_TURN, GamePhases.POST_ROUND]) {
          const container = view(even, gamePhase);
          expect(live(container), gamePhase).toBe("Total: 21 | Bet: $10 Even money Blackjack");
          expect(container.querySelector(".hand-result.Win")).toBeTruthy();
          cleanup();
        }
      });

      it("a declined blackjack shows nothing before the settle, then Win or Push as always", () => {
        const bj = hand(["A", "K"], { totals: [21], total: 21, isBlackjack: true, result: HandResult.NONE, status: HandStatus.DONE });
        expect(live(view(bj, OFFERS))).toBe("Total: 21 | Bet: $10 Blackjack");
      });

      it("the invisible size copy carries the same text, so the strip does not change width", () => {
        const container = view(insured({ result: HandResult.LOSE, insurancePayout: 15 }), GamePhases.POST_ROUND);
        expect(container.querySelector(".hand-total > .ht-size").textContent).toBe(live(container));
      });
    });
  });

  describe("GameBoard", () => {
    it("at OFFERS it shows the question and the buttons, and no player options", () => {
      const { container } = renderUI(<GameBoard />, { game: table(["10", "A", "6", "K"]) });
      expect(screen.getByText("Insurance?")).toBeTruthy();
      expect(buttons(container)).toEqual(["Insurance $5", "No thanks"]);
      expect(screen.queryByText("Hit")).toBeNull();
    });

    it("sends the buttons to the game", () => {
      const { gameActions } = renderUI(<GameBoard />, { game: table(["10", "A", "6", "K"], { surrender: "early" }) });
      for (const name of ["Insurance $5", "Surrender", "No thanks"]) fireEvent.click(screen.getByText(name));
      expect(gameActions.takeInsurance).toHaveBeenCalledOnce();
      expect(gameActions.surrender.mock.calls).toEqual([[0]]);
      expect(gameActions.declineOffers).toHaveBeenCalledOnce();
    });

    it("a player blackjack gets 'Even money' and the question to match", () => {
      const { gameActions, container } = renderUI(<GameBoard />, { game: table(["A", "A", "K", "5"]) });
      expect(screen.getByText("Even money?")).toBeTruthy();
      expect(buttons(container)).toEqual(["Even money", "No thanks"]);
      fireEvent.click(screen.getByText("Even money"));
      expect(gameActions.evenMoney).toHaveBeenCalledOnce();
    });

    it("a table click at OFFERS does not continue or decline anything", () => {
      const { gameActions, container } = renderUI(<GameBoard />, { game: table(["10", "A", "6", "K"]) });
      fireEvent.click(container.querySelector(".board"));
      expect(gameActions.continueRound).not.toHaveBeenCalled();
      expect(gameActions.declineOffers).not.toHaveBeenCalled();
    });

    it("the offers are not passed on once the phase has moved on: the peek has no buttons and says what the dealer does", () => {
      const peeking = step(table(["10", "A", "6", "K"]), { type: "DECLINE_OFFERS" });
      expect(peeking.phase).toBe(PEEK);
      const { container } = renderUI(<GameBoard />, { game: peeking });
      expect(screen.getByText("Dealer checks for blackjack...")).toBeTruthy();
      expect(buttons(container)).toEqual([]);
      expect(screen.queryByText("No thanks")).toBeNull();
      expect(live(container.querySelector(".player-hand"))).toBe("Total: 16 | Bet: $10");
    });

    it("the insurance is shown on the hand once taken", () => {
      const insured = step(table(["10", "A", "6", "K"]), { type: "TAKE_INSURANCE" });
      const { container } = renderUI(<GameBoard />, { game: insured });
      expect(live(container.querySelector(".player-hand"))).toBe("Total: 16 | Bet: $10 | Insurance: $5");
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
        expect(container.querySelector(".dealer-hand .hand-total > span:not(.ht-size)").textContent).toBe("Total: 11");
        expect(container.innerHTML).not.toContain(secret.id);
        expect(container.innerHTML).not.toMatch(leaks);
        expect(container.textContent).not.toMatch(leaks);
        expect(s.runningCount).toBe(-1); // 10 -1, ace -1, 6 +1: the hole card's -1 is not counted yet
        expect(container.querySelector(".count-value").textContent).toBe("-1");
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
