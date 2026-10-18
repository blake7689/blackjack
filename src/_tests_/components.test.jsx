import { describe, it, expect, vi, afterEach } from "vitest";
import { initialGameState } from "../utils/gameReducer";
import { screen, fireEvent } from "@testing-library/react";
import { renderUI } from "./testUtils";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import Card from "../components/Card/Card";
import CardCountDisplay from "../components/CardCountDisplay/CardCountDisplay";
import CenterMessage from "../components/CenterMessage/CenterMessage";
import DealerArea from "../components/DealerArea/DealerArea";
import DeckStack from "../components/DeckStack/DeckStack";
import PlayerOptions from "../components/PlayerOptions/PlayerOptions";
import PlayerHand from "../components/Playerhand/PlayerHand";
import StatsPanel from "../components/StatsPanel/StatsPanel";
import BettingFooter from "../components/BettingFooter/BettingFooter";
import GameBoard from "../components/GameBoard/GameBoard";

const hand = (codes, extra = {}) => {
  const cards = stackedShoe(codes);
  return { cards, bet: 10, status: HandStatus.PLAYING, result: HandResult.NONE, totals: [20], total: 20, isBusted: false, isBlackjack: false, ...extra };
};

describe("Card", () => {
  it("shows the face, the back, or a placeholder", () => {
    const [ace] = stackedShoe(["A"]);
    const { container, rerender } = renderUI(<Card card={ace} />);
    expect(screen.getByAltText("ace of hearts").getAttribute("src")).toBe("/cards/ace_of_hearts.png");
    rerender(<Card card={ace} faceDown small />);
    expect(screen.getByAltText("Card back").className).toContain("small");
    rerender(<Card faceDown />);
    expect(screen.getByAltText("Card back").getAttribute("src")).toBe("/cards/back.png");
    rerender(<Card />);
    expect(container.querySelector(".card-skel")).not.toBeNull();
    rerender(<Card small />);
    expect(container.querySelector(".card-skel.small")).not.toBeNull();
  });
});

describe("CardCountDisplay", () => {
  it("shows the running count and the true count from the shoe", () => {
    renderUI(<CardCountDisplay shoe={stackedShoe(Array(104).fill("7"))} runningCount={4} />);
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
});

describe("CenterMessage", () => {
  it("shows the phase message, or nothing", () => {
    const { container, rerender } = renderUI(<CenterMessage gamePhase={GamePhases.PRE_DEAL} />);
    expect(screen.getByText("Place your bets!")).toBeTruthy();
    rerender(<CenterMessage gamePhase={GamePhases.END_ROUND} />);
    expect(container.firstChild.textContent).toBe("");
  });
});

describe("DealerArea", () => {
  it("shows the total and the bust or blackjack badges", () => {
    const dealer = { cards: stackedShoe(["10", "6"]), dealerDisplayTotal: 16, isBusted: false, isBlackjack: false };
    const { rerender } = renderUI(<DealerArea dealer={dealer} />);
    expect(screen.getByText("Total: 16")).toBeTruthy();
    expect(screen.queryByText(/Busted|Blackjack/)).toBeNull();
    rerender(<DealerArea dealer={{ ...dealer, isBusted: true, isBlackjack: true }} />);
    expect(screen.getByText(/Busted/)).toBeTruthy();
    expect(screen.getByText(/Blackjack/)).toBeTruthy();
  });

  it("shows one card back per hidden card, after the up card", () => {
    const dealer = { cards: stackedShoe(["10"]), dealerDisplayTotal: 10 };
    const { container, rerender } = renderUI(<DealerArea dealer={dealer} />);
    expect(screen.queryByAltText("Card back")).toBeNull();
    rerender(<DealerArea dealer={dealer} hiddenCount={1} />);
    const imgs = [...container.querySelectorAll(".dealer img")].map((img) => img.alt);
    expect(imgs).toEqual(["10 of hearts", "Card back"]);
    expect(screen.getByText("Total: 10")).toBeTruthy();
  });
});

describe("DeckStack", () => {
  it("shows decks, real cards left, and the cut-card notice", () => {
    const shoe = [...stackedShoe(["5", "6"]), { id: "CUT-1", type: "cut" }];
    renderUI(<DeckStack shoe={shoe} />, { game: { cutCardFound: true } });
    expect(screen.getByText("Shoe: 2")).toBeTruthy();
    expect(screen.getByText(/Decks: 2/)).toBeTruthy();
    expect(screen.getByText(/Cut Card Found/)).toBeTruthy();
  });

  it("hides the notice before the cut card", () => {
    renderUI(<DeckStack shoe={[]} />);
    expect(screen.queryByText(/Cut Card Found/)).toBeNull();
  });
});

describe("PlayerOptions", () => {
  it("always offers hit and stay, and double or split only when allowed", () => {
    const calls = { onHit: vi.fn(), onStay: vi.fn(), onDouble: vi.fn(), onSplit: vi.fn() };
    const { rerender } = renderUI(<PlayerOptions {...calls} showDouble showSplit />);
    ["Hit", "Stay", "Double", "Split"].forEach((name) => fireEvent.click(screen.getByText(name)));
    Object.values(calls).forEach((fn) => expect(fn).toHaveBeenCalledOnce());
    rerender(<PlayerOptions {...calls} />);
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

  it("hides split once the round has the most hands allowed", () => {
    renderUI(<PlayerHand {...props} handCount={2} maxSplitHands={2} hand={hand(["8", "8"], { isSplit: true })} />);
    expect(screen.queryByText("Split")).toBeNull();
  });

  it("offers double and split on an affordable pair", () => {
    renderUI(<PlayerHand {...props} hand={hand(["8", "8"], { totals: [16] })} />);
    expect(screen.getByText(/Total: 16 \| Bet: \$10/)).toBeTruthy();
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
    renderUI(<PlayerHand {...props} active={false} hand={hand(["A", "6"], { totals: [17, 7] })} />);
    expect(screen.getByText(/17 \/ 7/)).toBeTruthy();
    expect(screen.queryByText("Hit")).toBeNull();
  });

  it("shows the result after the round, plus bust and blackjack badges", () => {
    const { rerender } = renderUI(<PlayerHand {...props} gamePhase={GamePhases.POST_ROUND}
      hand={hand(["10", "6", "K"], { status: HandStatus.DONE, result: HandResult.LOSE, isBusted: true })} />);
    expect(screen.getByText("Lose")).toBeTruthy();
    expect(screen.getByText("Busted")).toBeTruthy();
    rerender(<PlayerHand {...props} gamePhase={GamePhases.END_ROUND}
      hand={hand(["A", "K"], { status: HandStatus.DONE, result: HandResult.WIN, isBlackjack: true })} />);
    expect(screen.getByText("Win")).toBeTruthy();
    expect(screen.getByText("Blackjack")).toBeTruthy();
  });

  it("hides an unsettled result", () => {
    renderUI(<PlayerHand {...props} gamePhase={GamePhases.POST_ROUND} hand={hand(["10", "9"], { status: HandStatus.DONE })} />);
    expect(screen.queryByText(/Win|Lose|Push/)).toBeNull();
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
    const { gameActions } = renderUI(<GameBoard />, { game: playing });
    ["Hit", "Stay", "Double", "Split"].forEach((name) => fireEvent.click(screen.getByText(name)));
    expect(gameActions.hit).toHaveBeenCalledWith(0);
    expect(gameActions.stand).toHaveBeenCalledWith(0);
    expect(gameActions.double).toHaveBeenCalledWith(0);
    expect(gameActions.split).toHaveBeenCalledWith(0);
    expect(gameActions.continueRound).not.toHaveBeenCalled();
    expect(screen.getByText("Total: 10")).toBeTruthy();
    expect(screen.queryByAltText("Card back")).toBeNull();
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
    renderUI(<GameBoard />, { game: { ...playing, dealerHole: { cards: stackedShoe(["A"]) } } });
    expect(screen.getByAltText("Card back")).toBeTruthy();
    expect(screen.queryByAltText("ace of hearts")).toBeNull();
  });

  it("continues on a table click after the round, and hides an empty dealer", () => {
    const { gameActions, container } = renderUI(<GameBoard />, { game: { phase: GamePhases.POST_ROUND } });
    fireEvent.click(container.querySelector(".board"));
    expect(gameActions.continueRound).toHaveBeenCalled();
    expect(container.querySelector(".dealer-area")).toBeNull();
  });
});
