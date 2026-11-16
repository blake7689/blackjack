import { describe, it, expect } from "vitest";
import { screen, fireEvent, cleanup, within } from "@testing-library/react";
import { renderUI, testPlayer } from "./testUtils";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import { initialGameState } from "../utils/gameReducer";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import CenterMessage from "../components/CenterMessage/CenterMessage";
import Dock from "../components/Dock/Dock";

const { PRE_DEAL, DEALING, OFFERS, PEEK, PLAYER_TURN, DEALER_TURN, SETTLING_HANDS, RESULTS, POST_ROUND, END_ROUND, NONE } = GamePhases;

describe("CenterMessage (the one 48 px line)", () => {
  const text = (props) => { const { container, unmount } = renderUI(<CenterMessage {...props} />); const t = container.firstChild.textContent; unmount(); return t; };

  it("is one polite live line, empty when a phase has nothing to say", () => {
    const { container } = renderUI(<CenterMessage gamePhase={NONE} />);
    expect(container.firstChild.className).toBe("msg");
    expect(container.firstChild.getAttribute("aria-live")).toBe("polite");
    expect(container.firstChild.textContent).toBe("");
  });

  it("says what each phase is doing", () => {
    expect(text({ gamePhase: DEALING })).toBe("Dealing");
    expect(text({ gamePhase: PEEK })).toBe("Dealer checks for blackjack");
    expect(text({ gamePhase: DEALER_TURN })).toBe("Dealer plays");
    expect(text({ gamePhase: SETTLING_HANDS })).toBe("Settling bets");
    expect(text({ gamePhase: RESULTS })).toBe("Settling bets");
    expect(text({ gamePhase: POST_ROUND })).toBe("");
    expect(text({ gamePhase: NONE })).toBe("");
  });

  it("between rounds: place your bets, tap Deal with a bet down, Dealing soon when auto deal is about to deal", () => {
    expect(text({ gamePhase: PRE_DEAL })).toBe("Place your bets");
    expect(text({ gamePhase: PRE_DEAL, bet: 0 })).toBe("Place your bets");
    expect(text({ gamePhase: PRE_DEAL, bet: 10 })).toBe("Tap Deal");
    expect(text({ gamePhase: PRE_DEAL, bet: 10, autoDealing: true })).toBe("Dealing soon");
    expect(text({ gamePhase: PRE_DEAL, bet: 0, autoDealing: true })).toBe("Dealing soon");
  });

  it("asks one question per offer: even money, then insurance, then surrender", () => {
    const all = { insurance: true, evenMoney: true, surrender: true };
    expect(text({ gamePhase: OFFERS, offers: all })).toBe("Even money?");
    expect(text({ gamePhase: OFFERS, offers: { ...all, evenMoney: false } })).toBe("Insurance?");
    expect(text({ gamePhase: OFFERS, offers: { ...all, evenMoney: false, insurance: false } })).toBe("Surrender?");
  });

  it("your move, or the last hand before the shuffle once the cut card is out", () => {
    expect(text({ gamePhase: PLAYER_TURN })).toBe("Your move");
    expect(text({ gamePhase: PLAYER_TURN, lastHand: true })).toBe("Last hand before the shuffle");
  });

  it("shuffling after the last hand, nothing otherwise at the end of the round", () => {
    expect(text({ gamePhase: END_ROUND })).toBe("");
    expect(text({ gamePhase: END_ROUND, lastHand: true })).toBe("Shuffling");
  });

  it("waiting for the server replaces the phase's words", () => {
    expect(text({ gamePhase: SETTLING_HANDS, waiting: true })).toBe("Waiting for the server...");
    expect(text({ gamePhase: SETTLING_HANDS, waiting: false })).toBe("Settling bets");
  });

  it("Reconnecting... takes the place of the words, with a pulsing dot (a class), announced by the one live line", () => {
    const { container } = renderUI(<CenterMessage gamePhase={PLAYER_TURN} reconnecting />);
    const span = container.querySelector(".msg > span");
    expect(span.textContent).toBe("Reconnecting...");
    expect(span.className).toBe("reconnecting");
    expect(screen.queryByRole("status")).toBeNull(); // one live level: the .msg line, no nested status
    expect(screen.queryByText("Your move")).toBeNull();
  });

  it("a notice takes the place of the words, and Reconnecting... wins over a notice", () => {
    const { container, rerender } = renderUI(<CenterMessage gamePhase={PRE_DEAL} notice="The server refused your bet, so the round was cancelled." />);
    const span = () => container.querySelector(".msg > span");
    expect(span().textContent).toBe("The server refused your bet, so the round was cancelled.");
    expect(span().className).toBe("notice");
    expect(screen.queryByText("Place your bets")).toBeNull();
    rerender(<CenterMessage gamePhase={PRE_DEAL} notice="x" reconnecting />);
    expect(span().textContent).toBe("Reconnecting...");
    rerender(<CenterMessage gamePhase={PRE_DEAL} notice={null} reconnecting={false} />);
    expect(span()).toBeNull();
    expect(screen.getByText("Place your bets")).toBeTruthy();
  });
});

describe("Dock", () => {
  let tags = 0;
  const hand = (codes, extra = {}) => ({
    tag: `d${tags++}`, cards: stackedShoe(codes), hiddenCards: [], bet: 10, payout: 0, status: HandStatus.PLAYING, result: HandResult.NONE,
    totals: [20], total: 20, isBusted: false, isBlackjack: false, ...extra,
  });
  const dealer = { cards: stackedShoe(["6"]), dealerDisplayTotal: 6 };
  const settings = (extra = {}) => ({ ...initialGameState.settings, ...extra });
  const rich = { ...testPlayer, credits: 1000 };
  const show = (game, { player = rich, busy = false } = {}) => renderUI(<Dock busy={busy} />, { game: { dealer, ...game }, player: { player } });
  const playing = (codes = ["8", "8"], extra = {}, game = {}) => ({ phase: PLAYER_TURN, hands: [hand(codes, extra)], ...game });
  const key = (name) => screen.getByRole("button", { name });
  const maybe = (name) => screen.queryByRole("button", { name });
  const dimmed = (name) => key(name).getAttribute("aria-disabled") === "true";
  const face = (container) => container.querySelector(".dock-in").getAttribute("data-face");
  const names = (container) => [...container.querySelectorAll(".dock button")].map((b) => b.textContent);
  const OFFER_INSURANCE = { insurance: true, evenMoney: false, surrender: false, peek: true };
  const offering = (offers, bet = 10) => ({ phase: OFFERS, offers, hands: [hand(["10", "6"], { bet })] });

  it("is a labelled footer, and one face per phase", () => {
    const faces = {
      [PRE_DEAL]: "betting", [POST_ROUND]: "results", [END_ROUND]: "results", [NONE]: "play", [DEALING]: "play", [PEEK]: "play",
      [PLAYER_TURN]: "play", [DEALER_TURN]: "play", [SETTLING_HANDS]: "play", [RESULTS]: "play",
    };
    for (const [phase, expected] of Object.entries(faces)) {
      const { container } = show({ phase, hands: [hand(["10", "6"], { status: HandStatus.DONE })] });
      expect(screen.getByLabelText("Controls").tagName).toBe("FOOTER");
      expect(face(container), phase).toBe(expected);
      cleanup();
    }
    const offers = show(offering(OFFER_INSURANCE));
    expect(face(offers.container)).toBe("offers");
  });

  describe("betting", () => {
    const betting = (extra = {}) => ({ phase: PRE_DEAL, ...extra });

    it("offers the chips the player can afford and wires chip, Clear and Deal", () => {
      const { gameActions } = show(betting({ betCircle: 15 }), { player: { ...testPlayer, credits: 30 } });
      const rack = screen.getByRole("group", { name: "Chips" });
      expect(within(rack).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Add 1", "Add 5", "Add 10", "Add 25"]);
      fireEvent.click(key("Add 10"));
      fireEvent.click(key("Clear"));
      fireEvent.click(key("Deal"));
      expect(gameActions.addBet).toHaveBeenCalledWith(10);
      expect(gameActions.clearBet).toHaveBeenCalledOnce();
      expect(gameActions.deal).toHaveBeenCalledOnce();
    });

    it("offers only the chips chosen in settings", () => {
      show(betting({ settings: settings({ chipValues: "5,25,100" }) }), { player: { ...testPlayer, credits: 60 } });
      expect(within(screen.getByRole("group", { name: "Chips" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Add 5", "Add 25"]);
    });

    it("shows the bet in a status (a polite live region that reads \"$N\")", () => {
      show(betting({ betCircle: 1500 }));
      expect(screen.getByRole("status").textContent).toBe("$1,500");
    });

    it("dims Clear and Deal with no bet: they stay in place, take focus, and do nothing when pressed", () => {
      const { gameActions } = show(betting());
      expect([dimmed("Clear"), dimmed("Deal")]).toEqual([true, true]);
      key("Deal").focus();
      expect(document.activeElement).toBe(key("Deal"));
      fireEvent.click(key("Clear"));
      fireEvent.click(key("Deal"));
      expect(gameActions.clearBet).not.toHaveBeenCalled();
      expect(gameActions.deal).not.toHaveBeenCalled();
    });

    it("lights Clear and Deal once a bet is down", () => {
      show(betting({ betCircle: 5 }));
      expect([dimmed("Clear"), dimmed("Deal")]).toEqual([false, false]);
    });

    it("says 'auto' on Deal while an automatic deal is armed", () => {
      const { container, rerender, gameState } = show(betting({ betCircle: 5 }));
      expect(key("Deal").querySelector("small")).toBeNull();
      gameState.autoDealPending = true;
      rerender(<Dock busy={false} />);
      expect(key("Deal").querySelector("small").textContent).toBe("auto");
      expect(key("Deal").getAttribute("aria-label")).toBe("Deal"); // the name does not change
      expect(container.querySelector(".options-wrap")).toBeNull(); // betting is not a busy-hidden face
    });

    it("has no chips and cannot deal without a player", () => {
      show(betting({ betCircle: 10 }), { player: null });
      expect(screen.queryByRole("button", { name: /^Add/ })).toBeNull();
      expect(dimmed("Deal")).toBe(true);
    });
  });

  describe("offers", () => {
    const group = () => within(screen.getByRole("group", { name: "Offers" }));
    const keys = () => group().getAllByRole("button").map((b) => b.textContent);

    it("insurance: 'Insurance $5' and 'No thanks', in a group named Offers that the busy board can find", () => {
      const { container } = show(offering(OFFER_INSURANCE));
      expect(keys()).toEqual(["Insurance $5", "No thanks"]);
      expect(container.querySelector(".options-wrap")).toBe(screen.getByRole("group", { name: "Offers" }));
    });

    it("a half-dollar stake is shown as it is: $2.5", () => {
      show(offering(OFFER_INSURANCE, 5));
      expect(screen.getByText("Insurance $2.5")).toBeTruthy();
    });

    it("even money, and early surrender with the stake it gives back", () => {
      show(offering({ insurance: false, evenMoney: true, surrender: false, peek: true }));
      expect(keys()).toEqual(["Even money", "No thanks"]);
      cleanup();
      show(offering({ insurance: true, evenMoney: false, surrender: true, peek: true }));
      expect(keys()).toEqual(["Insurance $5", "Surrender$5 back", "No thanks"]);
    });

    it("an offer already used is gone, and 'No thanks' is always there", () => {
      show(offering({ ...OFFER_INSURANCE, insurance: false }));
      expect(keys()).toEqual(["No thanks"]);
    });

    it("each key calls its own action (surrender for hand 0)", () => {
      const { gameActions } = show(offering({ insurance: true, evenMoney: true, surrender: true, peek: true }));
      for (const name of [/^Insurance/, "Even money", /^Surrender/, "No thanks"]) fireEvent.click(screen.getByRole("button", { name }));
      expect(gameActions.takeInsurance).toHaveBeenCalledOnce();
      expect(gameActions.evenMoney).toHaveBeenCalledOnce();
      expect(gameActions.surrender.mock.calls).toEqual([[0]]);
      expect(gameActions.declineOffers).toHaveBeenCalledOnce();
    });

    it("while cards fly every offer key is dimmed and does nothing", () => {
      const { gameActions } = show(offering({ insurance: true, evenMoney: true, surrender: true, peek: true }), { busy: true });
      for (const b of group().getAllByRole("button")) {
        expect(b.getAttribute("aria-disabled")).toBe("true");
        fireEvent.click(b);
      }
      for (const fn of [gameActions.takeInsurance, gameActions.evenMoney, gameActions.surrender, gameActions.declineOffers]) expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("your move", () => {
    it("the keys in order: Double, Split, Surrender, Triple (when on), Stay, Hit", () => {
      const { container, rerender, gameState } = show(playing());
      expect(names(container)).toEqual(["Double", "Split", "Surrender", "Stay", "Hit"]);
      gameState.settings = settings({ tripleDown: true });
      rerender(<Dock busy={false} />);
      expect(names(container)).toEqual(["Double", "Split", "Surrender", "Triple", "Stay", "Hit"]);
    });

    it("wires each key to the hand in play", () => {
      const { gameActions } = show(playing(["8", "8"], {}, { selectedHandIndex: 1, hands: [hand(["10", "9"], { status: HandStatus.DONE }), hand(["8", "8"])], settings: settings({ tripleDown: true }) }));
      for (const name of ["Hit", "Stay", "Double", "Triple", "Split", "Surrender"]) fireEvent.click(key(name));
      for (const act of ["hit", "stand", "double", "triple", "split", "surrender"]) expect(gameActions[act].mock.calls, act).toEqual([[1]]);
    });

    it("a player turn with no hands yet dims every key instead of crashing", () => {
      show({ phase: PLAYER_TURN, hands: [] });
      for (const name of ["Double", "Split", "Surrender", "Stay", "Hit"]) expect(dimmed(name), name).toBe(true);
    });

    it("hides what a setting turns off: Surrender none, Triple off", () => {
      show(playing(["8", "8"], {}, { settings: settings({ surrender: "none", tripleDown: false }) }));
      expect(maybe("Surrender")).toBeNull();
      expect(maybe("Triple")).toBeNull();
    });

    it("dims what the rules allow but not on this hand: Split on a non-pair, Double on three cards", () => {
      const { gameActions } = show(playing(["10", "6", "2"], {}, { settings: settings({ tripleDown: true }) }));
      for (const name of ["Split", "Double", "Triple", "Surrender"]) {
        expect(dimmed(name), name).toBe(true);
        fireEvent.click(key(name));
      }
      expect(dimmed("Hit") || dimmed("Stay")).toBe(false);
      for (const act of ["split", "double", "triple", "surrender"]) expect(gameActions[act]).not.toHaveBeenCalled();
    });

    it("dims Double, Triple and Split when the stake is not in the balance", () => {
      show(playing(["8", "8"], {}, { settings: settings({ tripleDown: true }) }), { player: { ...testPlayer, credits: 9 } });
      expect(["Double", "Triple", "Split"].map(dimmed)).toEqual([true, true, true]);
      expect(dimmed("Hit")).toBe(false);
    });

    it("a signed-out player has nothing to double with: every stake key is dimmed", () => {
      show(playing(["8", "8"]), { player: null });
      expect(["Double", "Split"].map(dimmed)).toEqual([true, true]);
    });

    it("dims every key unless it is your turn on a hand still in play with its cards dealt", () => {
      const off = (game, opts) => { const { unmount } = show(game, opts); const all = ["Hit", "Stay", "Double", "Split", "Surrender"].map(dimmed); unmount(); return all.every(Boolean); };
      expect(off(playing(["8", "8"]), { busy: true })).toBe(true);
      expect(off({ ...playing(["8", "8"]), phase: DEALER_TURN })).toBe(true);
      expect(off({ ...playing(["8", "8"]), phase: PEEK })).toBe(true);
      expect(off(playing(["8", "8"], { status: HandStatus.DONE }))).toBe(true);
      expect(off(playing(["8"], { awaitingCard: true }))).toBe(true);
      expect(off(playing(["8", "8"]))).toBe(false);
    });

    it("a split ace has no Hit unless the rules allow it", () => {
      show(playing(["A", "5"], { isSplit: true }));
      expect(dimmed("Hit")).toBe(true);
      expect(dimmed("Stay")).toBe(false);
      cleanup();
      show(playing(["A", "5"], { isSplit: true }, { settings: settings({ hitSplitAces: true }) }));
      expect(dimmed("Hit")).toBe(false);
    });

    it("clicking a dimmed key does nothing, but it keeps its place and can be focused", () => {
      const { gameActions } = show(playing(["8", "8"]), { busy: true });
      fireEvent.click(key("Hit"));
      key("Hit").focus();
      expect(document.activeElement).toBe(key("Hit"));
      expect(gameActions.hit).not.toHaveBeenCalled();
    });

    it("the action rows are .options-wrap, the hook the busy board makes inert", () => {
      const { container } = show(playing());
      expect(container.querySelector(".dock .options-wrap")).not.toBeNull();
    });
  });

  describe("results", () => {
    const settled = (hands, game = {}) => ({ phase: POST_ROUND, hands, ...game });
    const summary = (container) => ({ label: container.querySelector(".s-l small").textContent, net: container.querySelector(".s-l b"), balance: container.querySelector(".s-r b").textContent });

    it("a win: 'You won' over the signed amount, the balance and Next hand", () => {
      const { container, gameActions } = show(settled([hand(["10", "9"], { payout: 20 })]));
      const s = summary(container);
      expect([s.label, s.net.textContent, s.net.className, s.balance]).toEqual(["You won", "+$10", "up", "$1,000"]);
      fireEvent.click(key("Next hand"));
      expect(gameActions.continueRound).toHaveBeenCalledOnce();
    });

    it("a loss, with the insurance stake counted", () => {
      const { container } = show(settled([hand(["10", "9"], { payout: 0, insurance: 5 })]));
      const s = summary(container);
      expect([s.label, s.net.textContent, s.net.className]).toEqual(["You lost", "-$15", "down"]);
    });

    it("an even round has no sign and no colour", () => {
      const { container } = show(settled([hand(["10", "9"], { payout: 10 })], { phase: END_ROUND }));
      const s = summary(container);
      expect([s.label, s.net.textContent, s.net.className]).toEqual(["Even round", "$0", ""]);
    });

    it("shows cents when there are some", () => {
      const { container } = show(settled([hand(["A", "K"], { payout: 22.5 })]), { player: { ...testPlayer, credits: 1234.5 } });
      expect(summary(container).net.textContent).toBe("+$12.50");
      expect(summary(container).balance).toBe("$1,234.5"); // same as StatsPanel: credits.toLocaleString()
    });

    it("adds every hand of a split round", () => {
      const { container } = show(settled([hand(["10", "9"], { payout: 20 }), hand(["10", "8"], { payout: 0 }), hand(["10", "7"], { payout: 20 })]));
      expect(summary(container).net.textContent).toBe("+$10");
    });

    it("a signed-out player has a $0 balance", () => {
      const { container } = show(settled([hand(["10", "9"], { payout: 10 })]), { player: null });
      expect(summary(container).balance).toBe("$0");
    });
  });

  describe("Pause / Resume auto deal (#88)", () => {
    const on = settings({ resetInitialBet: true, autoDeal: true });
    const pauseKey = (name) => screen.queryByRole("button", { name });

    it("is not there unless auto deal and Reset Bet are both on", () => {
      for (const s of [settings(), settings({ autoDeal: true }), settings({ resetInitialBet: true })]) {
        for (const phase of [PRE_DEAL, POST_ROUND, END_ROUND]) {
          show({ phase, settings: s, hands: [] });
          expect(pauseKey(/auto deal/), phase).toBeNull();
          cleanup();
        }
      }
    });

    it("shows between rounds (betting and results), as Pause, then as Resume once paused, each calling its action", () => {
      for (const phase of [PRE_DEAL, POST_ROUND, END_ROUND]) {
        const { gameActions, rerender, gameState } = show({ phase, settings: on, hands: [] });
        expect(pauseKey("Resume auto deal")).toBeNull();
        expect(key("Pause auto deal").textContent).toBe("Pause");
        fireEvent.click(key("Pause auto deal"));
        expect(gameActions.pauseAutoDeal, phase).toHaveBeenCalledTimes(1);
        gameState.autoDealPaused = true;
        rerender(<Dock busy={false} />);
        expect(pauseKey("Pause auto deal")).toBeNull();
        expect(key("Resume auto deal").textContent).toBe("Resume");
        fireEvent.click(key("Resume auto deal"));
        expect(gameActions.resumeAutoDeal, phase).toHaveBeenCalledTimes(1);
        expect(gameActions.continueRound).not.toHaveBeenCalled(); // it is a key of its own, not a click on the table
        cleanup();
      }
    });

    it("is not in the page during a round, paused or not", () => {
      for (const phase of [NONE, DEALING, PEEK, PLAYER_TURN, DEALER_TURN, SETTLING_HANDS, RESULTS]) {
        for (const autoDealPaused of [false, true]) {
          show({ phase, settings: on, autoDealPaused, hands: [hand(["10", "6"], { status: HandStatus.DONE })] });
          expect(pauseKey(/auto deal/), `${phase} paused=${autoDealPaused}`).toBeNull();
          cleanup();
        }
      }
      show({ ...offering(OFFER_INSURANCE), settings: on });
      expect(pauseKey(/auto deal/)).toBeNull();
    });

    it("a pending deal adds no countdown", () => {
      const { container } = show({ phase: PRE_DEAL, settings: on, betCircle: 10, autoDealPending: true });
      expect(pauseKey("Pause auto deal")).not.toBeNull();
      expect(container.textContent).not.toMatch(/countdown|dealing in|seconds/i);
    });
  });

  describe("focus (DESIGN 8)", () => {
    const outside = () => { const el = document.createElement("button"); el.textContent = "outside"; document.body.append(el); el.focus(); return el; };

    it("offers: the first offer key", () => {
      show(offering({ insurance: true, evenMoney: true, surrender: true, peek: true }));
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Insurance/ })); // the first key of the row, not "No thanks"
    });

    it("offers: when the focused offer closes and others remain, focus moves to the next one, not the page", () => {
      const { rerender, gameState } = show(offering({ insurance: true, evenMoney: false, surrender: true, peek: true }));
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Insurance/ }));
      gameState.offers = { ...gameState.offers, insurance: false }; // insurance taken: its key unmounts
      rerender(<Dock busy={false} />);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Surrender/ }));
    });

    it("your move: Hit, even while it waits dimmed", () => {
      show(playing(), { busy: true });
      expect(document.activeElement).toBe(key("Hit"));
    });

    it("results: Next hand", () => {
      show({ phase: POST_ROUND, hands: [hand(["10", "9"], { payout: 20 })] });
      expect(document.activeElement).toBe(key("Next hand"));
    });

    it("betting, dealing, the dealer's turn and settling leave focus where it is", () => {
      for (const phase of [PRE_DEAL, DEALING, DEALER_TURN, SETTLING_HANDS]) {
        show({ phase, hands: [hand(["10", "6"], { status: HandStatus.DONE })] });
        expect(document.activeElement, phase).toBe(document.body);
        cleanup();
      }
    });

    it("moves with the phase while focus is on nothing or already in the dock", () => {
      const { rerender, gameState } = show({ phase: PRE_DEAL });
      key("Clear").focus();
      Object.assign(gameState, playing());
      rerender(<Dock busy={false} />);
      expect(document.activeElement).toBe(key("Hit")); // from a dock key to Hit
      key("Stay").focus();
      gameState.phase = DEALER_TURN;
      rerender(<Dock busy={false} />);
      expect(document.activeElement).toBe(key("Stay")); // nothing to move to: it stays
      gameState.phase = POST_ROUND;
      rerender(<Dock busy={false} />);
      expect(document.activeElement).toBe(key("Next hand"));
    });

    it("never pulls focus out of Settings, a menu or a dialog", () => {
      const { rerender, gameState } = show({ phase: PRE_DEAL });
      const el = outside();
      for (const next of [playing(), offering(OFFER_INSURANCE), { phase: POST_ROUND, hands: [hand(["10", "9"], { payout: 20 })] }]) {
        Object.assign(gameState, next);
        rerender(<Dock busy={false} />);
        expect(document.activeElement).toBe(el);
      }
      el.remove();
    });
  });
});
