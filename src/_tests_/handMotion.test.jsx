import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, within } from "@testing-library/react";
import { renderUI, Flight } from "./testUtils";
import { animations } from "./setup";
import PlayerHand from "../components/Playerhand/PlayerHand";
import { BET_MS, PAYOUT_MS } from "../utils/chipFlight";
import { queue } from "../utils/cardAnimation";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import { GamePhases } from "../utils/constants/gamePhases";

// A seat's chips in motion (#83): a bet's chips glide in from the rack and the stack shows when they land (whoever changed the bet: a tap, Rebet, 2x, the
// automatic rebet, a double, insurance); a stack that comes off the table glides back; at the results each stack is replaced by a moving copy in the same frame
// it hides (a chip never blinks) and paid or swept after the verdict has been on show a moment, reserving the board's time. None of it holds the board.
const { PRE_DEAL, PLAYER_TURN, RESULTS, POST_ROUND } = GamePhases;
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const ghosts = () => [...document.querySelectorAll(".flight-layer .ghost")];
const lifted = () => [...document.querySelectorAll(".flight-layer .ghost.lifted")];
const chipsIn = (el) => [...el.querySelectorAll("use")].map((u) => u.getAttribute("href")).filter((h) => !h.endsWith("-p") && h.startsWith("#chip-"));
const spotStack = (c) => c.querySelector(".spot .stack");

let tags = 0;
const mkHand = (extra = {}) => ({
  tag: `m${tags++}`, cards: [], hiddenCards: [], bet: 0, baseStake: 0, status: HandStatus.PLAYING, result: HandResult.NONE,
  totals: [16], total: 16, isBusted: false, isBlackjack: false, ...extra,
});
const base = { index: 0, active: false, gamePhase: PRE_DEAL, canBet: true, chip: 25, onBet: () => {}, multi: false };

// The table's furniture the chips fly between: the rack (a $25 chip), the dock and the felt.
const Stage = ({ children, enabled = true }) => (
  <Flight enabled={enabled}>
    <div className="felt" /><div className="dock" />
    <div className="rack"><button type="button" className="rc" data-chip="25" aria-label="$25 chip" aria-pressed="true" /></div>
    {children}
  </Flight>
);
const mount = (props, opts) => {
  const view = renderUI(<Stage {...opts}><PlayerHand {...base} {...props} /></Stage>);
  return { ...view, again: (next) => view.rerender(<Stage {...opts}><PlayerHand {...base} {...next} /></Stage>) };
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("PlayerHand: chips arriving and leaving", () => {
  const empty = () => mkHand({ bet: 0 });

  it("a tap's chip glides in from the rack; the stack shows only when it lands (360 ms), and nothing holds the board", () => {
    const { container, again } = mount({ hand: empty() });
    expect(chipsIn(spotStack(container))).toEqual([]);
    again({ hand: { ...empty(), bet: 25 } });
    expect(ghosts()).toHaveLength(1);
    expect(ghosts()[0].getAttribute("aria-hidden")).toBe("true");
    expect(chipsIn(spotStack(container))).toEqual([]); // not yet: it is still in the air
    advance(BET_MS - 1);
    expect(chipsIn(spotStack(container))).toEqual([]);
    advance(1);
    expect(chipsIn(spotStack(container))).toEqual(["#chip-25"]);
    expect(queue.holds.size).toBe(0); // a tap never delays the dock
    expect(queue.free).toBe(0);
  });

  it("the automatic rebet: a seat that mounts with its bet already there (a new round re-placed it) flies it in too", () => {
    const { container } = mount({ hand: { ...empty(), bet: 25 } });
    expect(chipsIn(spotStack(container))).toEqual([]);
    expect(ghosts()).toHaveLength(1);
    advance(BET_MS);
    expect(chipsIn(spotStack(container))).toEqual(["#chip-25"]);
  });

  it("Rebet and 2x fly a short burst; the stack shows when the last chip lands", () => {
    const { container, again } = mount({ hand: empty() });
    again({ hand: { ...empty(), bet: 185 } }); // $100, $50, $25, $10: four chips, three fly
    expect(ghosts()).toHaveLength(3);
    advance(2 * 70 + BET_MS - 1);
    expect(chipsIn(spotStack(container))).toEqual([]);
    advance(1);
    expect(chipsIn(spotStack(container))).toEqual(["#chip-10"]); // the stack's top chip carries the numeral
  });

  it("Undo and Clear: the stack is gone at once and a copy glides back to the rack", () => {
    const { container, again } = mount({ hand: { ...empty(), bet: 25 } });
    advance(BET_MS);
    expect(chipsIn(spotStack(container))).toEqual(["#chip-25"]);
    advance(150); // the first chip's copy is gone
    again({ hand: empty() });
    expect(chipsIn(spotStack(container))).toEqual([]);
    expect(ghosts()).toHaveLength(1);
    expect(animations.at(-1).frames[1].opacity).toBe(0.2);
  });

  it("a bet that grows (a second chip) shows the whole stack when the new chip lands", () => {
    const { container, again } = mount({ hand: { ...empty(), bet: 25 } });
    advance(BET_MS + 150);
    again({ hand: { ...empty(), bet: 50 } });
    expect(ghosts()).toHaveLength(1);
    expect(chipsIn(spotStack(container))).toEqual(["#chip-25"]); // the old amount until it lands
    advance(BET_MS);
    expect(chipsIn(spotStack(container))).toEqual(["#chip-50"]);
  });

  it("a double's second stake comes up beside the circle and shows when it lands; the first stack stays put", () => {
    const { container, again } = mount({ gamePhase: PLAYER_TURN, hand: mkHand({ bet: 10, baseStake: 10 }) });
    expect(container.querySelector(".side-spot.dbl")).toBeNull();
    again({ gamePhase: PLAYER_TURN, hand: mkHand({ bet: 20, baseStake: 10, isDouble: true, tag: "m-double" }) });
    expect(ghosts()).toHaveLength(1);
    const side = container.querySelector(".side-spot.dbl .stack");
    expect(chipsIn(side)).toEqual([]);
    advance(BET_MS);
    expect(chipsIn(side)).toEqual(["#chip-10"]);
    expect(chipsIn(spotStack(container))).toEqual(["#chip-10"]);
    expect(queue.holds.size).toBe(0);
  });

  it("the insurance stake does the same, and a refused one (the amount falling) is gone at once", () => {
    const { container, again } = mount({ gamePhase: PLAYER_TURN, hand: mkHand({ bet: 20, insurance: 0 }) });
    again({ gamePhase: PLAYER_TURN, hand: { ...mkHand({ bet: 20 }), insurance: 10 } });
    advance(BET_MS);
    const ins = container.querySelector(".side-spot.ins .stack");
    expect(chipsIn(ins)).toEqual(["#chip-10"]);
    again({ gamePhase: PLAYER_TURN, hand: mkHand({ bet: 20, insurance: 0 }) });
    expect(container.querySelector(".side-spot.ins")).toBeNull();
  });

  it("outside betting a changed bet shows at once, with no chips in the air", () => {
    const { container, again } = mount({ gamePhase: PLAYER_TURN, hand: mkHand({ bet: 10 }) });
    again({ gamePhase: PLAYER_TURN, hand: { ...mkHand({ bet: 15 }), tag: "x" } });
    expect(ghosts()).toHaveLength(0);
    expect(chipsIn(spotStack(container))).toEqual(["#chip-5"]); // $15 = $10 + $5: the top chip carries the numeral
  });

  it("reduced motion, or a board that has not started flying yet: the stack is there at once, nothing flies", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const view = mount({ hand: { ...empty(), bet: 25 } });
    expect(chipsIn(spotStack(view.container))).toEqual(["#chip-25"]);
    expect(ghosts()).toHaveLength(0);
    view.unmount();
    vi.unstubAllGlobals();
    const first = mount({ hand: { ...empty(), bet: 25 } }, { enabled: false });
    expect(chipsIn(spotStack(first.container))).toEqual(["#chip-25"]);
    expect(ghosts()).toHaveLength(0);
  });
});

describe("PlayerHand: a split-off hand's stake (#147)", () => {
  const [moved] = stackedShoe(["8"]);
  const splitHand = (bet = 10, extra = {}) => mkHand({ cards: [{ ...moved, moved: true }], bet, tag: "split-off", ...extra });
  const onTurn = { gamePhase: PLAYER_TURN };

  it("comes up from the dock to its circle as one ghost, the stack shows after BET_MS, and nothing reserves or holds the board", () => {
    const { container } = mount({ ...onTurn, hand: splitHand() });
    expect(ghosts()).toHaveLength(1);
    expect(chipsIn(spotStack(container))).toEqual([]); // still in the air
    expect(queue.holds.size).toBe(0);
    expect(queue.free).toBe(0);
    advance(BET_MS - 1);
    expect(chipsIn(spotStack(container))).toEqual([]);
    advance(1);
    expect(chipsIn(spotStack(container))).toEqual(["#chip-10"]);
    expect(queue.holds.size).toBe(0);
    expect(queue.free).toBe(0);
  });

  it("a later bet increase on it (a double) flies nothing: the new amount shows at once", () => {
    const view = mount({ ...onTurn, hand: splitHand() });
    advance(BET_MS + 200); // landed, and the first ghost has gone
    view.again({ ...onTurn, hand: splitHand(30, { tag: "split-off" }) });
    expect(ghosts()).toHaveLength(0);
    expect(chipsIn(spotStack(view.container))).toEqual(["#chip-5"]); // $30 = $25 + $5, the top chip carries the numeral
  });

  it("a hand with a first card that did not change hands flies no stake, and neither does a split-off one under reduced motion", () => {
    mount({ ...onTurn, hand: mkHand({ cards: [moved], bet: 10 }) });
    expect(ghosts()).toHaveLength(0);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const view = mount({ ...onTurn, hand: splitHand() });
    expect(ghosts()).toHaveLength(0);
    expect(chipsIn(spotStack(view.container))).toEqual(["#chip-10"]);
  });
});

describe("PlayerHand: the results (the settle handoff)", () => {
  const settled = (extra = {}) => mkHand({ bet: 10, baseStake: 10, status: HandStatus.DONE, result: HandResult.WIN, payout: 20, ...extra });
  const results = (hand, props = {}) => mount({ gamePhase: PLAYER_TURN, hand, ...props });
  const toResults = (view, hand, props = {}) => view.again({ gamePhase: RESULTS, hand, ...props });

  it("after the verdict has been on show 520 ms the stack lifts into a moving copy in the same frame the real one hides: a chip never blinks", () => {
    const view = results(settled());
    advance(BET_MS); // the stack was already there (mounted outside betting)
    toResults(view, settled());
    const seat = view.container.querySelector(".seat");
    expect(seat.classList.contains("paid")).toBe(false);
    expect(lifted()).toHaveLength(0);
    advance(519);
    expect(lifted()).toHaveLength(0);
    advance(1);
    expect(lifted()).toHaveLength(1); // the copy is on show ...
    expect(spotStack(view.container).style.visibility).toBe("hidden"); // ... in the very call that hid the real stack
    expect(seat.classList.contains("paid")).toBe(false); // the seat is paid when the chips have gone (#147: the "$25" stays, no BET yet)
    expect(lifted()[0].querySelector("svg").outerHTML).toBe(spotStack(view.container).querySelector("svg").outerHTML);
    advance(PAYOUT_MS.win);
    expect(seat.classList.contains("paid")).toBe(true);
  });

  it("the seat is not paid, and its stake label stays, until the chips have gone (PAYOUT_MS of its kind); then it is paid (the bare circle says BET again)", () => {
    for (const [kind, extra] of [["win", {}], ["lose", { result: HandResult.LOSE, payout: 0 }], ["push", { result: HandResult.PUSH, payout: 10 }]]) {
      const view = results(settled(extra));
      advance(BET_MS);
      toResults(view, settled(extra));
      const seat = view.container.querySelector(".seat");
      advance(520); // the chips lift
      advance(PAYOUT_MS[kind] - 1);
      expect(seat.classList.contains("paid"), kind).toBe(false);
      expect(view.container.querySelector(".amt .num").textContent, kind).toBe("$10"); // the stake is still shown
      advance(1);
      expect(seat.classList.contains("paid"), kind).toBe(true);
      expect(view.container.querySelector(".spot.has .bet-lbl"), kind).not.toBeNull();
      view.unmount();
    }
  });

  it("leaving before the chips have gone cancels the paid timer (the seat never turns paid)", () => {
    const view = results(settled());
    advance(BET_MS);
    toResults(view, settled());
    const seat = view.container.querySelector(".seat");
    advance(520 + 100); // the chips are in the air
    view.unmount();
    advance(PAYOUT_MS.win);
    expect(seat.classList.contains("paid")).toBe(false);
  });

  it("when the chips cannot fly (no felt to measure from) the seat is still paid, right after the verdict", () => {
    const view = renderUI(<Flight><PlayerHand {...base} gamePhase={PLAYER_TURN} hand={settled()} /></Flight>);
    advance(BET_MS);
    view.rerender(<Flight><PlayerHand {...base} gamePhase={RESULTS} hand={settled()} /></Flight>);
    advance(520);
    expect(view.container.querySelector(".seat").classList.contains("paid")).toBe(false); // not before the verdict has been on show
    advance(1);
    expect(view.container.querySelector(".seat").classList.contains("paid")).toBe(true);
  });

  it("reserves the board's time for the whole payout, so the next step waits (and never holds)", () => {
    const view = results(settled());
    const t0 = performance.now();
    toResults(view, settled());
    expect(queue.free - t0).toBeGreaterThanOrEqual(520 + PAYOUT_MS.win);
    expect(queue.holds.size).toBe(0);
  });

  it("each seat follows the one before by 90 ms", () => {
    const view = results(settled(), { index: 2 });
    toResults(view, settled(), { index: 2 });
    advance(520 + 179);
    expect(lifted()).toHaveLength(0);
    advance(1);
    expect(lifted()).toHaveLength(1);
  });

  it("an insured hand pays or sweeps the insurance stack inside the same result (its payout is not part of the stake's)", () => {
    const hand = settled({ result: HandResult.LOSE, payout: 15, insurance: 5, insurancePayout: 15 });
    const view = results({ ...hand, payout: 0, insurance: 5, insurancePayout: 0, result: HandResult.LOSE });
    advance(BET_MS);
    toResults(view, hand);
    advance(520);
    expect(lifted()).toHaveLength(2); // the stake and the insurance
    expect(queue.free - performance.now()).toBeGreaterThan(1000);
  });

  it("a hand with no insurance payout field (nothing taken) still settles", () => {
    const view = results(settled({ payout: 0, result: HandResult.LOSE }));
    toResults(view, settled({ payout: 0, result: HandResult.LOSE }));
    advance(520);
    expect(lifted()).toHaveLength(1);
  });

  it("leaving before the copies go (or after) puts everything back: the copies are removed and the reserved time given back", () => {
    const view = results(settled());
    toResults(view, settled());
    advance(100);
    view.unmount(); // before the 520 ms
    expect(queue.free).toBe(0);
    expect(lifted()).toHaveLength(0);

    const second = results(settled());
    toResults(second, settled());
    advance(520);
    expect(lifted()).toHaveLength(1);
    second.unmount(); // while the chips fly
    expect(lifted()).toHaveLength(0);
  });

  it("reduced motion: the seat is simply paid at once, nothing flies, no time is reserved", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const view = results(settled());
    toResults(view, settled());
    expect(view.container.querySelector(".seat").classList.contains("paid")).toBe(true);
    expect(lifted()).toHaveLength(0);
    expect(queue.free).toBe(0);
  });

  it("a seat that mounts after the results (the board redrawn, back from Settings) does not pay them again", () => {
    const view = mount({ gamePhase: POST_ROUND, hand: settled() });
    expect(view.container.querySelector(".seat").classList.contains("paid")).toBe(true);
    advance(5000);
    expect(lifted()).toHaveLength(0);
    expect(queue.free).toBe(0);
  });
});

describe("PlayerHand: result tags only with two or more hands; one hand has the verdict line (#83)", () => {
  const tagged = (multi) => {
    const view = mount({ gamePhase: POST_ROUND, multi, hand: mkHand({ bet: 10, status: HandStatus.DONE, result: HandResult.WIN, payout: 20 }) });
    // the cards of a seat that mounts after its flights have landed
    return view.container;
  };

  it("several hands: a tag under the circle; one hand: none (the bet's amount stays)", () => {
    const several = tagged(true);
    expect(within(several).queryByText("WIN")).not.toBeNull();
    expect(several.querySelector(".tag.win")).not.toBeNull();
    const single = tagged(false);
    expect(single.querySelector(".tag")).toBeNull();
    expect(single.querySelector(".amt").textContent).toBe("$10");
  });
});
