import { describe, it, expect, vi, afterEach } from "vitest";
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
  const show = (game, { player = rich, busy = false, props = {} } = {}) => renderUI(<Dock busy={busy} {...props} />, { game: { dealer, ...game }, player: { player } });
  const playing = (codes = ["8", "8"], extra = {}, game = {}) => ({ phase: PLAYER_TURN, hands: [hand(codes, extra)], ...game });
  const key = (name) => screen.getByRole("button", { name });
  const maybe = (name) => screen.queryByRole("button", { name });
  const dimmed = (name) => key(name).getAttribute("aria-disabled") === "true";
  const face = (container) => container.querySelector(".dock-in").getAttribute("data-face");
  const words = (b) => b.textContent; // a key's words; its shortcut hint is generated content (kbd[data-text]), not text (#85)
  const names = (container) => [...container.querySelectorAll(".dock button")].map(words);
  const OFFER_INSURANCE = { insurance: true, evenMoney: false, surrender: false, peek: true };
  const offering = (offers, bet = 10) => ({ phase: OFFERS, offers, hands: [hand(["10", "6"], { bet })] });

  it("is a labelled footer, and one face per phase", () => {
    const faces = {
      [PRE_DEAL]: "betting", [POST_ROUND]: "results", [END_ROUND]: "betting", [NONE]: "play", [DEALING]: "play", [PEEK]: "play",
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
      const { gameActions } = show(betting({ betCircle: 15, betHistory: [15] }), { player: { ...testPlayer, credits: 30 } });
      const rack = screen.getByRole("group", { name: "Chips" });
      expect(within(rack).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["$1 chip", "$5 chip", "$10 chip", "$25 chip"]);
      fireEvent.click(key("Undo"));
      fireEvent.click(key("Clear"));
      fireEvent.click(key("Deal"));
      expect(gameActions.undoBet).toHaveBeenCalledOnce();
      expect(gameActions.clearBet).toHaveBeenCalledOnce();
      expect(gameActions.deal).toHaveBeenCalledOnce();
    });

    it("offers only the chips chosen in settings", () => {
      show(betting({ settings: settings({ chipValues: "5,25,100" }) }), { player: { ...testPlayer, credits: 60 } });
      expect(within(screen.getByRole("group", { name: "Chips" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["$5 chip", "$25 chip"]);
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
      expect(screen.queryByRole("button", { name: /chip$/ })).toBeNull();
      expect(dimmed("Deal")).toBe(true);
    });
  });

  describe("chips and betting keys (#82)", () => {
    const betting = (extra = {}) => ({ phase: PRE_DEAL, ...extra });
    const withCredits = (credits) => ({ player: { ...testPlayer, credits } });
    const chipBtn = (v) => screen.getByRole("button", { name: `$${v.toLocaleString()} chip` });
    const pressed = () => within(screen.getByRole("group", { name: "Chips" })).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("aria-label"));
    let clock = 0;
    const at = (ms) => { clock = ms; };
    const tap = (v, ms) => { at(ms); fireEvent.click(chipBtn(v)); };
    const press = (k, init = {}) => fireEvent.keyDown(document.body, { key: k, ...init });

    afterEach(() => { vi.restoreAllMocks(); });
    const withClock = () => { clock = 0; vi.spyOn(performance, "now").mockImplementation(() => clock); };

    describe("selecting a chip", () => {
      it("marks the selected chip aria-pressed, and shows the 1-9 key of the first nine on them", () => {
        const { container } = show(betting(), { props: { chip: 10 } });
        expect(pressed()).toEqual(["$10 chip"]);
        expect([...container.querySelectorAll(".rc")].map((b) => b.getAttribute("data-key"))).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
      });

      it("a chip the rack no longer offers falls to the largest one below it (or the smallest)", () => {
        show(betting(), { ...withCredits(30), props: { chip: 1000 } });
        expect(pressed()).toEqual(["$25 chip"]);
        cleanup();
        show(betting(), { ...withCredits(30), props: { chip: 0.5 } });
        expect(pressed()).toEqual(["$1 chip"]);
        cleanup();
        show(betting(), { ...withCredits(30) }); // no chip given: the smallest
        expect(pressed()).toEqual(["$1 chip"]);
      });

      it("only the first nine chips carry a key number", () => {
        const { container } = show(betting({ settings: settings({ chipValues: "1,5,10,25,50,100,1000,5000,10000,20000,50000" }) }), { ...withCredits(100000) });
        const keys = [...container.querySelectorAll(".rc")].map((b) => b.getAttribute("data-key"));
        expect(keys).toHaveLength(11);
        expect(keys.slice(0, 9)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
        expect(keys.slice(9)).toEqual([null, null]);
      });

      it("a tap selects the chip and bets nothing", () => {
        withClock();
        const onChip = vi.fn();
        const { gameActions } = show(betting(), { props: { chip: 25, onChip } });
        tap(10, 0);
        expect(onChip.mock.calls).toEqual([[10]]);
        expect(gameActions.addBet).not.toHaveBeenCalled();
      });

      it("works without an onChip (the dock alone, as in the other tests)", () => {
        const { gameActions } = show(betting());
        fireEvent.click(chipBtn(5));
        expect(gameActions.addBet).not.toHaveBeenCalled();
      });
    });

    describe("double tap (within 400 ms, timed by hand)", () => {
      it("a second tap on the same chip within 400 ms selects it and bets it once", () => {
        withClock();
        const onChip = vi.fn();
        const { gameActions } = show(betting(), { props: { chip: 25, onChip } });
        tap(10, 1000);
        tap(10, 1399);
        expect(onChip.mock.calls).toEqual([[10], [10]]);
        expect(gameActions.addBet.mock.calls).toEqual([[10]]);
      });

      it("400 ms or more apart is two single taps, not a bet", () => {
        withClock();
        const { gameActions } = show(betting());
        tap(10, 0);
        tap(10, 400);
        expect(gameActions.addBet).not.toHaveBeenCalled();
        tap(10, 799); // the second tap started a new pair
        expect(gameActions.addBet.mock.calls).toEqual([[10]]);
      });

      it("a different chip in between is not a double tap", () => {
        withClock();
        const { gameActions } = show(betting());
        tap(10, 0);
        tap(5, 100);
        tap(10, 200);
        expect(gameActions.addBet).not.toHaveBeenCalled();
      });

      it("a third quick tap starts over: it does not bet again", () => {
        withClock();
        const { gameActions } = show(betting());
        tap(10, 0);
        tap(10, 100);
        tap(10, 200);
        expect(gameActions.addBet.mock.calls).toEqual([[10]]);
        tap(10, 300);
        expect(gameActions.addBet.mock.calls).toEqual([[10], [10]]);
      });

    });

    describe("keyboard", () => {
      it("1-9 select the chip at that position in the rack; the same key twice bets it (if it is the selected one)", () => {
        const onChip = vi.fn();
        const { gameActions } = show(betting(), { props: { chip: 5, onChip } });
        press("2");
        expect(onChip.mock.calls).toEqual([[5]]);
        expect(gameActions.addBet).not.toHaveBeenCalled();
        press("2");
        expect(gameActions.addBet.mock.calls).toEqual([[5]]);
        press("2"); // the pair is used up
        expect(gameActions.addBet).toHaveBeenCalledOnce();
      });

      it("the second press only selects when that chip is not the selected one yet", () => {
        const onChip = vi.fn();
        const { gameActions } = show(betting(), { props: { chip: 25, onChip } }); // the parent has not applied the first press
        press("2");
        press("2");
        expect(onChip.mock.calls).toEqual([[5], [5]]);
        expect(gameActions.addBet).not.toHaveBeenCalled();
      });

      it("another key in between breaks the pair", () => {
        const { gameActions } = show(betting({ betHistory: [5], betCircle: 5 }), { props: { chip: 5 } });
        press("2");
        press("3");
        press("2");
        expect(gameActions.addBet).not.toHaveBeenCalled();
        press("2");
        expect(gameActions.addBet.mock.calls).toEqual([[5]]);
        press("2"); // nothing pending after a bet
        press("2");
        expect(gameActions.addBet.mock.calls).toEqual([[5], [5]]);
      });

      it("a key with no chip behind it (past the rack, or 0) does nothing", () => {
        const onChip = vi.fn();
        const { gameActions } = show(betting(), { ...withCredits(30), props: { onChip } }); // four chips
        for (const k of ["5", "9", "0"]) press(k);
        expect(onChip).not.toHaveBeenCalled();
        expect(gameActions.addBet).not.toHaveBeenCalled();
      });

      it("a held key (auto repeat) does nothing", () => {
        const onChip = vi.fn();
        const { gameActions } = show(betting(), { props: { chip: 1, onChip } });
        press("1");
        press("1", { repeat: true });
        press("1", { repeat: true });
        expect(onChip.mock.calls).toEqual([[1]]);
        expect(gameActions.addBet).not.toHaveBeenCalled();
      });

      it("U undoes, C clears, B rebets the last bet, X doubles every bet (letter case ignored)", () => {
        const { gameActions } = show(betting({ betCircle: 10, betHistory: [10], initialBet: 10 }));
        press("u");
        press("C");
        press("x");
        expect(gameActions.undoBet).toHaveBeenCalledOnce();
        expect(gameActions.clearBet).toHaveBeenCalledOnce();
        expect(gameActions.addBet.mock.calls).toEqual([[10]]); // X: the circle's 10 again
        press("b"); // a bet is down: Rebet is dimmed
        expect(gameActions.addBet).toHaveBeenCalledOnce();
        cleanup();
        const empty = show(betting({ initialBet: 15 }));
        press("B");
        expect(empty.gameActions.addBet.mock.calls).toEqual([[15]]);
      });

      it("a key that is dimmed does nothing (U with no history, C and X with an empty circle, B with nothing to rebet)", () => {
        const { gameActions } = show(betting());
        for (const k of ["u", "c", "x", "b"]) press(k);
        for (const fn of [gameActions.undoBet, gameActions.clearBet, gameActions.addBet]) expect(fn).not.toHaveBeenCalled();
      });

      it("other keys, and keys with Ctrl, Alt or Meta held (browser shortcuts), do nothing", () => {
        const { gameActions } = show(betting({ betCircle: 10, betHistory: [10], initialBet: 10 }));
        press("q");
        press("Enter");
        for (const mod of ["ctrlKey", "altKey", "metaKey"]) { press("c", { [mod]: true }); press("1", { [mod]: true }); }
        expect(gameActions.clearBet).not.toHaveBeenCalled();
        expect(gameActions.addBet).not.toHaveBeenCalled();
      });

      it("typing in a field, a select or a dialog does not bet", () => {
        const { gameActions } = show(betting({ betCircle: 10, betHistory: [10], initialBet: 10 }));
        const field = document.createElement("input");
        const dialog = document.createElement("dialog");
        const inner = document.createElement("button");
        dialog.append(inner);
        document.body.append(field, dialog);
        for (const el of [field, inner]) fireEvent.keyDown(el, { key: "c" });
        field.remove();
        dialog.remove();
        expect(gameActions.clearBet).not.toHaveBeenCalled();
      });

      it("the keys only work while betting", () => {
        const { gameActions } = show(playing());
        for (const k of ["1", "u", "c", "x", "b"]) press(k);
        for (const fn of [gameActions.addBet, gameActions.undoBet, gameActions.clearBet]) expect(fn).not.toHaveBeenCalled();
      });

      it("stops listening when the dock goes", () => {
        const { gameActions, unmount } = show(betting({ betCircle: 10, betHistory: [10] }));
        unmount();
        press("c");
        expect(gameActions.clearBet).not.toHaveBeenCalled();
      });
    });

    describe("Undo, Clear, Rebet and 2x", () => {
      it("Undo is dimmed without history and calls undoBet with it", () => {
        const { gameActions, rerender, gameState } = show(betting());
        expect(dimmed("Undo")).toBe(true);
        fireEvent.click(key("Undo"));
        expect(gameActions.undoBet).not.toHaveBeenCalled();
        Object.assign(gameState, { betCircle: 5, betHistory: [5] });
        rerender(<Dock busy={false} />);
        expect(dimmed("Undo")).toBe(false);
        fireEvent.click(key("Undo"));
        expect(gameActions.undoBet).toHaveBeenCalledOnce();
      });

      it("Rebet adds the last round's bet: only with an empty circle, a bet to repeat, and the balance for it", () => {
        const cases = [
          [{ betCircle: 0, initialBet: 20 }, 1000, false],
          [{ betCircle: 5, initialBet: 20 }, 1000, true], // a bet is already down
          [{ betCircle: 0, initialBet: 0 }, 1000, true], // nothing to repeat
          [{ betCircle: 0, initialBet: 20 }, 19, true], // cannot afford it
          [{ betCircle: 0, initialBet: 20 }, 20, false], // exactly enough
        ];
        for (const [game, credits, off] of cases) {
          const { gameActions } = show(betting(game), withCredits(credits));
          expect(dimmed("Rebet"), JSON.stringify([game, credits])).toBe(off);
          fireEvent.click(key("Rebet"));
          expect(gameActions.addBet.mock.calls, JSON.stringify([game, credits])).toEqual(off ? [] : [[20]]);
          cleanup();
        }
      });

      it("2x ('Double every bet') adds the circle again: not with an empty circle, nor beyond the balance", () => {
        const cases = [
          [0, 1000, true],
          [30, 29, true],
          [30, 30, false],
          [30, 1000, false],
        ];
        for (const [betCircle, credits, off] of cases) {
          const { gameActions } = show(betting({ betCircle, betHistory: betCircle ? [betCircle] : [] }), withCredits(credits));
          expect(dimmed("Double every bet"), `${betCircle}/${credits}`).toBe(off);
          fireEvent.click(key("Double every bet"));
          expect(gameActions.addBet.mock.calls, `${betCircle}/${credits}`).toEqual(off ? [] : [[betCircle]]);
          cleanup();
        }
      });

      it("the keys come in order, 2x shown as a glyph with the key hints beside them", () => {
        const { container } = show(betting());
        expect([...container.querySelectorAll(".dock-row")[1].querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent.replace(/[A-Z]$/, "")))
          .toEqual(["Undo", "Clear", "Rebet", "Double every bet", "Deal"]);
        expect(container.querySelector(".glyph").getAttribute("data-text")).toBe("2x");
        expect([...container.querySelectorAll("kbd")].map((k) => k.getAttribute("data-text"))).toEqual(["U", "C", "B", "X", "Space"]);
        expect(container.querySelector("kbd").getAttribute("aria-hidden")).toBe("true");
      });
    });

    describe("out of credits", () => {
      it("the rack becomes a note with the balance, and nothing that bets is live", () => {
        const { container, gameActions } = show(betting({ initialBet: 10 }), withCredits(0.5));
        expect(screen.queryByRole("group", { name: "Chips" })).toBeNull();
        expect(screen.getByText("Out of credits. Your balance is $0.50.")).toBeTruthy();
        expect(container.querySelector(".dock-note svg use").getAttribute("href")).toBe("#i-info");
        for (const name of ["Undo", "Clear", "Rebet", "Double every bet", "Deal"]) expect(dimmed(name), name).toBe(true);
        for (const k of ["1", "u", "c", "b", "x"]) press(k);
        for (const fn of [gameActions.addBet, gameActions.undoBet, gameActions.clearBet]) expect(fn).not.toHaveBeenCalled();
      });

      it("a signed-out player sees a $0 balance in the note", () => {
        show(betting(), { player: null });
        expect(screen.getByText("Out of credits. Your balance is $0.")).toBeTruthy();
      });

      it("chips still in the circle keep the rack (to Undo them), with no chip to pick", () => {
        show(betting({ betCircle: 10, betHistory: [10] }), withCredits(0));
        expect(screen.queryByText(/Out of credits/)).toBeNull();
        expect(within(screen.getByRole("group", { name: "Chips" })).queryAllByRole("button")).toHaveLength(0);
        expect(dimmed("Undo")).toBe(false);
      });
    });

    // The rack fits whole chips (jsdom has no layout, so the sizes are given): a chip is 44 px, the rack and its wrapper are `rack` / `wrap` wide.
    describe("the rack scrolls by whole chips when they do not fit", () => {
      const sizes = { rc: 44, rack: 280, wrap: 300, scrollWidth: 500 };
      const own = (proto, name) => Object.getOwnPropertyDescriptor(proto, name);
      const saved = { offsetWidth: own(HTMLElement.prototype, "offsetWidth"), clientWidth: own(Element.prototype, "clientWidth"), scrollWidth: own(Element.prototype, "scrollWidth") };
      const layout = (over = {}) => {
        const s = { ...sizes, ...over };
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return this.classList.contains("rc") ? s.rc : 0; } });
        Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get() { return this.classList.contains("rack") ? s.rack : this.classList.contains("rack-wrap") ? s.wrap : 0; } });
        Object.defineProperty(Element.prototype, "scrollWidth", { configurable: true, get() { return this.classList.contains("rack") ? s.scrollWidth : 0; } });
      };
      afterEach(() => {
        for (const [name, proto] of [["offsetWidth", HTMLElement.prototype], ["clientWidth", Element.prototype], ["scrollWidth", Element.prototype]]) Object.defineProperty(proto, name, saved[name]);
        delete globalThis.ResizeObserver;
      });
      const wrap = (container) => container.querySelector(".rack-wrap");
      const rackEl = (container) => container.querySelector(".rack");
      const classes = (container) => ["scroll", "more-l", "more-r"].filter((c) => wrap(container).classList.contains(c));

      it("chips that fit stay evenly spaced: no scrolling, nothing set by hand", () => {
        layout({ rack: 1000 });
        const { container } = show(betting());
        expect(classes(container)).toEqual([]);
        expect(wrap(container).style.getPropertyValue("--rgap")).toBe("");
      });

      it("seven chips in 280 px scroll: whole chips (k = 5 at 52 px a chip), the padding centring them, a chevron toward more", () => {
        layout();
        const { container } = show(betting(), { props: { chip: 5 } });
        expect(classes(container)).toEqual(["scroll", "more-r"]); // selected chip 2 is in view: at the start
        expect(wrap(container).style.getPropertyValue("--rgap")).toBe("8px");
        expect(wrap(container).style.getPropertyValue("--rpad")).toBe("24px"); // (300 - (5 * 52 - 8)) / 2
        expect(rackEl(container).scrollLeft).toBe(0);
      });

      it("scrolls to bring the selected chip into view as the last whole chip", () => {
        layout();
        const { container } = show(betting(), { props: { chip: 1000 } }); // seventh of seven
        expect(rackEl(container).scrollLeft).toBe(104); // (7 - 5) chips of 52
        expect(classes(container)).toEqual(["scroll", "more-l", "more-r"]);
      });

      it("a scroll event updates the chevrons: more to the left, then none at the far end", () => {
        layout();
        const { container } = show(betting(), { props: { chip: 5 } });
        const rack = rackEl(container);
        rack.scrollLeft = 100;
        fireEvent.scroll(rack);
        expect(classes(container)).toEqual(["scroll", "more-l", "more-r"]);
        rack.scrollLeft = 218; // scrollWidth - clientWidth - 2: the end
        fireEvent.scroll(rack);
        expect(classes(container)).toEqual(["scroll", "more-l"]);
        rack.scrollLeft = 1; // within 2 px of the start
        fireEvent.scroll(rack);
        expect(classes(container)).toEqual(["scroll", "more-r"]);
      });

      it("never scrolls less than one chip wide, however narrow the dock", () => {
        layout({ wrap: 30, rack: 30 });
        const { container } = show(betting(), { props: { chip: 5 } });
        expect(wrap(container).style.getPropertyValue("--rpad")).toBe("-7px"); // k is held at 1: floor((30 - 44) / 2)
      });

      it("fits again when the window is resized or the dock is resized (ResizeObserver)", () => {
        layout();
        const observers = [];
        globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.disconnect = vi.fn(); this.observe = vi.fn(); observers.push(this); } };
        const { container, unmount } = show(betting(), { props: { chip: 5 } });
        expect(observers).toHaveLength(1);
        expect(observers[0].observe.mock.calls[0][0]).toBe(container.querySelector(".dock-in"));
        expect(classes(container)).toEqual(["scroll", "more-r"]);
        layout({ rack: 1000 }); // the dock grew: everything fits
        observers[0].cb();
        expect(classes(container)).toEqual([]);
        layout();
        fireEvent(window, new Event("resize"));
        expect(classes(container)).toEqual(["scroll", "more-r"]);
        unmount();
        expect(observers[0].disconnect).toHaveBeenCalledOnce();
      });

      it("a refit with no chip pressed (the guard) keeps the rack where it is", () => {
        layout();
        const observers = [];
        globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.disconnect = vi.fn(); this.observe = vi.fn(); observers.push(this); } };
        const { container } = show(betting(), { props: { chip: 1000 } });
        const rack = rackEl(container);
        expect(rack.scrollLeft).toBe(104);
        rack.scrollLeft = 30;
        container.querySelector('[aria-pressed="true"]').setAttribute("aria-pressed", "false");
        observers[0].cb();
        expect(rack.scrollLeft).toBe(30);
        expect(classes(container)).toEqual(["scroll", "more-l", "more-r"]);
      });

      it("measures again when the chips on offer change (the balance moved), and stops listening on unmount", () => {
        layout();
        const { container, rerender, playerCtx, unmount } = show(betting(), { props: { chip: 5 } });
        expect(classes(container)).toContain("scroll");
        playerCtx.player = { ...testPlayer, credits: 30 }; // four chips of 44 px fit in 280
        rerender(<Dock busy={false} chip={5} />);
        expect(classes(container)).toEqual([]);
        unmount();
        fireEvent(window, new Event("resize")); // would throw on a removed rack if the listener were still there
      });
    });
  });

  describe("offers", () => {
    const group = () => within(screen.getByRole("group", { name: "Offers" }));
    const keys = () => group().getAllByRole("button").map(words);

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
      const { container } = show(settled([hand(["10", "9"], { payout: 10 })], { phase: POST_ROUND }));
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

  describe("keyboard (#85, DESIGN 8)", () => {
    const press = (k, init = {}, target = document.body) => fireEvent.keyDown(target, { key: k, ...init }); // false when the handler called preventDefault
    const openOffers = { insurance: true, evenMoney: true, surrender: true, peek: true };
    const rules = settings({ tripleDown: true });
    const pairInPlay = (extra = {}) => playing(["8", "8"], {}, { settings: rules, ...extra });
    const addOutside = (tag, attrs = {}) => { const el = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); document.body.append(el); return el; };
    const all = (gameActions) => Object.values(gameActions).filter((fn) => fn.mock);
    const stray = [];
    const outside = (...args) => { const el = addOutside(...args); stray.push(el); return el; };
    afterEach(() => { stray.splice(0).forEach((el) => el.remove()); });

    describe("your move", () => {
      it("H hits, S stays, D doubles, P splits, R surrenders, T triples: the hand in play, either case", () => {
        const { gameActions } = show(pairInPlay({ selectedHandIndex: 0 }));
        for (const k of ["h", "S", "d", "P", "r", "T"]) press(k);
        for (const act of ["hit", "stand", "double", "split", "surrender", "triple"]) expect(gameActions[act].mock.calls, act).toEqual([[0]]);
      });

      it("acts on the selected hand of a split round", () => {
        const { gameActions } = show(playing(["8", "8"], {}, { selectedHandIndex: 1, hands: [hand(["10", "9"], { status: HandStatus.DONE }), hand(["8", "8"])] }));
        press("h");
        expect(gameActions.hit.mock.calls).toEqual([[1]]);
      });

      it("a key the rules hide does nothing: R with Surrender none, T with Triple off", () => {
        const { gameActions } = show(playing(["8", "8"], {}, { settings: settings({ surrender: "none", tripleDown: false }) }));
        expect(maybe("Surrender")).toBeNull();
        expect(maybe("Triple")).toBeNull();
        press("r");
        press("t");
        expect(gameActions.surrender).not.toHaveBeenCalled();
        expect(gameActions.triple).not.toHaveBeenCalled();
      });

      it("a dimmed key does nothing: D, P, T and R on three cards, H on a split ace", () => {
        const three = show(playing(["10", "6", "2"], {}, { settings: rules }));
        for (const k of ["d", "p", "t", "r"]) press(k);
        for (const act of ["double", "split", "triple", "surrender"]) expect(three.gameActions[act], act).not.toHaveBeenCalled();
        press("s"); // Stay is still live
        expect(three.gameActions.stand).toHaveBeenCalledOnce();
        cleanup();
        const ace = show(playing(["A", "5"], { isSplit: true }));
        press("h");
        expect(ace.gameActions.hit).not.toHaveBeenCalled();
      });

      it("nothing acts while a card flies, off your turn, on a finished hand or on a hand waiting for its card", () => {
        const waits = [
          [pairInPlay(), { busy: true }],
          [{ ...pairInPlay(), phase: DEALER_TURN }, {}],
          [{ ...pairInPlay(), phase: PEEK }, {}],
          [playing(["8", "8"], { status: HandStatus.DONE }, { settings: rules }), {}],
          [playing(["8"], { awaitingCard: true }, { settings: rules }), {}],
        ];
        for (const [game, opts] of waits) {
          const { gameActions, unmount } = show(game, opts);
          for (const k of ["h", "s", "d", "p", "r", "t"]) press(k);
          for (const fn of all(gameActions)) expect(fn).not.toHaveBeenCalled();
          unmount();
        }
      });

      it("a handled key is kept from the page (preventDefault); an unbound key is not", () => {
        show(pairInPlay());
        expect(press("h")).toBe(false);
        expect(press("q")).toBe(true);
        expect(press("1")).toBe(true); // digits are for betting only
      });

      it("Space and Enter do nothing on your turn", () => {
        const { gameActions } = show(pairInPlay());
        press(" ");
        press("Enter");
        for (const fn of all(gameActions)) expect(fn).not.toHaveBeenCalled();
      });
    });

    describe("offers", () => {
      it("I takes insurance, E even money, R surrenders hand 0, N says no thanks", () => {
        const { gameActions } = show(offering(openOffers));
        for (const k of ["i", "E", "r", "N"]) press(k);
        expect(gameActions.takeInsurance).toHaveBeenCalledOnce();
        expect(gameActions.evenMoney).toHaveBeenCalledOnce();
        expect(gameActions.surrender.mock.calls).toEqual([[0]]);
        expect(gameActions.declineOffers).toHaveBeenCalledOnce();
      });

      it("an offer that is not open (or already taken) has no key: I, E and R do nothing, N still works", () => {
        const { gameActions } = show(offering({ insurance: false, evenMoney: false, surrender: false, peek: true }));
        for (const k of ["i", "e", "r", "h", "s"]) press(k);
        for (const fn of all(gameActions)) expect(fn).not.toHaveBeenCalled();
        press("n");
        expect(gameActions.declineOffers).toHaveBeenCalledOnce();
      });

      it("while cards fly the offer keys do nothing", () => {
        const { gameActions } = show(offering(openOffers), { busy: true });
        for (const k of ["i", "e", "r", "n"]) press(k);
        for (const fn of all(gameActions)) expect(fn).not.toHaveBeenCalled();
      });
    });

    describe("Space and Enter", () => {
      it("deal while betting, and take the next hand at the results, from the page or the document", () => {
        const betting = show({ phase: PRE_DEAL, betCircle: 10 });
        expect(press(" ")).toBe(false);
        press("Enter");
        fireEvent.keyDown(document, { key: " " }); // an event whose target has no closest()
        expect(betting.gameActions.deal).toHaveBeenCalledTimes(3);
        cleanup();
        const results = show({ phase: POST_ROUND, hands: [hand(["10", "9"], { payout: 20 })] });
        press(" ");
        press("Enter");
        expect(results.gameActions.continueRound).toHaveBeenCalledTimes(2);
        cleanup();
        const end = show({ phase: END_ROUND, hands: [hand(["10", "9"], { payout: 20 })] });
        press(" "); // the sweep: the betting face is up and its Deal key is dimmed (#147)
        expect(end.gameActions.continueRound).not.toHaveBeenCalled();
        expect(end.gameActions.deal).not.toHaveBeenCalled();
      });

      it("do not deal with no bet down, with no player, or while the shuffle plays", () => {
        const empty = show({ phase: PRE_DEAL, betCircle: 0 });
        press(" ");
        expect(empty.gameActions.deal).not.toHaveBeenCalled();
        cleanup();
        const out = show({ phase: PRE_DEAL, betCircle: 10 }, { player: null });
        press("Enter");
        expect(out.gameActions.deal).not.toHaveBeenCalled();
        cleanup();
        const shuffling = show({ phase: PRE_DEAL, betCircle: 10 }, { props: { shuffling: true } });
        press(" ");
        expect(shuffling.gameActions.deal).not.toHaveBeenCalled();
      });

      it("on a focused button, link, summary or role=button, Space keeps that control's own action: the table does not deal", () => {
        const { gameActions } = show({ phase: PRE_DEAL, betCircle: 10 });
        const own = [outside("button"), outside("a", { href: "#x" }), outside("summary"), outside("div", { role: "button" }), key("Undo")];
        for (const el of own) expect(press(" ", {}, el), el.tagName).toBe(true); // not prevented: the control's click goes ahead
        expect(gameActions.deal).not.toHaveBeenCalled();
        press(" ", {}, outside("span")); // a plain element is still the table
        expect(gameActions.deal).toHaveBeenCalledOnce();
      });

      it("the letter keys still work with a button focused (only Space and Enter are the button's own)", () => {
        const { gameActions } = show(pairInPlay());
        press("h", {}, key("Stay"));
        expect(gameActions.hit).toHaveBeenCalledOnce();
      });
    });

    describe("digits 1-9", () => {
      it("do nothing outside betting: playing, offers, results", () => {
        for (const game of [pairInPlay(), offering(openOffers), { phase: POST_ROUND, hands: [hand(["10", "9"], { payout: 20 })] }]) {
          const { gameActions, unmount } = show(game, { props: { chip: 5 } });
          for (const k of ["1", "2", "9"]) press(k);
          expect(gameActions.addBet).not.toHaveBeenCalled();
          unmount();
        }
      });

      it("the same digit twice selects then adds that chip; a different key between starts over", () => {
        const onChip = vi.fn();
        const { gameActions, rerender } = show({ phase: PRE_DEAL, betCircle: 5, betHistory: [5] }, { props: { chip: 1, onChip } });
        press("3"); // $10
        expect(onChip.mock.calls).toEqual([[10]]);
        rerender(<Dock busy={false} chip={10} onChip={onChip} />); // the board applied the pick
        press("3");
        expect(gameActions.addBet.mock.calls).toEqual([[10]]);
        press("3");
        rerender(<Dock busy={false} chip={10} onChip={onChip} />);
        press("c"); // clears, and breaks the pair
        press("3");
        expect(gameActions.addBet).toHaveBeenCalledOnce();
      });
    });

    describe("guards", () => {
      it("a held key does nothing, and neither do Ctrl, Alt or Meta chords", () => {
        const { gameActions } = show(pairInPlay());
        press("h", { repeat: true });
        for (const mod of ["ctrlKey", "altKey", "metaKey"]) press("h", { [mod]: true });
        expect(gameActions.hit).not.toHaveBeenCalled();
        press("h", { shiftKey: true }); // shift alone is just a capital
        expect(gameActions.hit).toHaveBeenCalledOnce();
      });

      it("typing in an input, textarea, select or editable element does nothing", () => {
        const { gameActions } = show(pairInPlay());
        for (const el of [outside("input"), outside("textarea"), outside("select"), outside("div", { contenteditable: "true" })]) {
          press("h", {}, el);
          press("s", {}, el);
        }
        expect(gameActions.hit).not.toHaveBeenCalled();
        expect(gameActions.stand).not.toHaveBeenCalled();
      });

      it("a dialog: keys from inside it, and from anywhere while one is open, do nothing", () => {
        const { gameActions } = show(pairInPlay());
        const dialog = outside("div", { role: "dialog" });
        const inner = document.createElement("button");
        dialog.append(inner);
        press("h", {}, inner);
        press("h"); // focus has slipped to the page behind it
        expect(gameActions.hit).not.toHaveBeenCalled();
        dialog.remove();
        press("h");
        expect(gameActions.hit).toHaveBeenCalledOnce();
      });

      it("an open menu stops the keys; a closed (hidden) one does not", () => {
        const { gameActions } = show(pairInPlay());
        const menu = outside("nav", { class: "menu" });
        menu.hidden = true;
        press("h");
        expect(gameActions.hit).toHaveBeenCalledOnce();
        menu.hidden = false;
        press("h");
        press("Enter");
        expect(gameActions.hit).toHaveBeenCalledOnce();
      });
    });

    describe("hints", () => {
      const shortcuts = (container) => [...container.querySelectorAll(".dock button")].map((b) => [words(b), b.getAttribute("aria-keyshortcuts")]);

      it("every key that has one says it: aria-keyshortcuts, and a kbd hint the screen reader skips", () => {
        const { container } = show(pairInPlay());
        expect(shortcuts(container)).toEqual([["Double", "D"], ["Split", "P"], ["Surrender", "R"], ["Triple", "T"], ["Stay", "S"], ["Hit", "H"]]);
        for (const k of container.querySelectorAll("kbd")) expect(k.getAttribute("aria-hidden")).toBe("true");
        cleanup();
        const offers = show(offering(openOffers));
        expect(shortcuts(offers.container)).toEqual([["Insurance $5", "I"], ["Even money", "E"], ["Surrender$5 back", "R"], ["No thanks", "N"]]);
        cleanup();
        const betting = show({ phase: PRE_DEAL, betCircle: 10 });
        expect(shortcuts(betting.container).slice(-5)).toEqual([["Undo", "U"], ["Clear", "C"], ["Rebet", "B"], ["", "X"], ["Deal", "Space"]]);
        cleanup();
        const results = show({ phase: POST_ROUND, hands: [hand(["10", "9"], { payout: 20 })] });
        expect(shortcuts(results.container)).toEqual([["Next hand", "Space"]]);
      });

      it("keys with no shortcut (the chips, Pause) say none", () => {
        const { container } = show({ phase: PRE_DEAL, betCircle: 10, settings: settings({ resetInitialBet: true, autoDeal: true }) });
        expect(key("Pause auto deal").hasAttribute("aria-keyshortcuts")).toBe(false);
        expect(container.querySelector(".rc").hasAttribute("aria-keyshortcuts")).toBe(false);
      });
    });

    describe("focus once the cards have landed", () => {
      it("your move: Hit takes focus when busy clears, if focus was on nothing or in the dock", () => {
        const { rerender } = show(playing(), { busy: true });
        key("Stay").focus();
        rerender(<Dock busy={false} />);
        expect(document.activeElement).toBe(key("Hit"));
      });

      it("offers: the first offer takes focus when busy clears", () => {
        const { rerender } = show(offering(openOffers), { busy: true });
        key("No thanks").focus();
        rerender(<Dock busy={false} />);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Insurance/ }));
      });

      it("busy clearing never takes focus from a control outside the dock", () => {
        const { rerender } = show(playing(), { busy: true });
        const el = outside("button");
        el.focus();
        rerender(<Dock busy={false} />);
        expect(document.activeElement).toBe(el);
      });
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
