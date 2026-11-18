import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { renderUI, Flight, finishAnimations } from "./testUtils";
import { vibrations } from "./setup";
import FlyCard from "../components/Card/FlyCard";
import PlayerHand from "../components/Playerhand/PlayerHand";
import GameBoard from "../components/GameBoard/GameBoard";
import { playSound, setSoundPrefs, vibrate } from "../utils/sound";
import { cardTiming } from "../utils/cardAnimation";
import { stackedShoe, playRound } from "../utils/_tests_/stackedShoe";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import { GamePhases } from "../utils/constants/gamePhases";
import { initialGameState } from "../utils/gameReducer";

// Where the sounds and the buzz are played (#86): each call site names its sound; utils/sound.js (its own tests) decides whether anything is heard.
// The real sound module runs, wrapped so the calls can be counted; jsdom's stub AudioContext (setup.js) lets the "Sound off" cases check that no audio is made.
vi.mock("../utils/sound", async (importActual) => {
  const actual = await importActual();
  return { ...actual, playSound: vi.fn(actual.playSound), vibrate: vi.fn(actual.vibrate) };
});

const timing = cardTiming(1000);
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const played = (name) => playSound.mock.calls.filter(([n]) => n === name).length;
const SOUND_ON = { ...initialGameState.settings, soundOn: true, soundVolume: 50, hapticsOn: true };

beforeEach(() => { vi.useFakeTimers(); playSound.mockClear(); vibrate.mockClear(); setSoundPrefs({ soundOn: false, soundVolume: 50, hapticsOn: false }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("the card sounds (FlyCard)", () => {
  const [king, five] = stackedShoe(["K", "5"]);
  const mount = (props, flight = {}) => {
    const Wrapper = ({ children }) => <Flight {...flight}>{children}</Flight>;
    const utils = render(<FlyCard fk="a" {...props} />, { wrapper: Wrapper });
    return { ...utils, again: (next) => utils.rerender(<FlyCard fk="a" {...next} />) };
  };

  it("plays one deal sound for each card as it leaves the shoe, at its own start time (the opening deal's cards are staggered)", () => {
    const Wrapper = ({ children }) => <Flight>{children}</Flight>;
    render(<><FlyCard fk="a" card={king} dealOrder={0} /><FlyCard fk="b" card={five} dealOrder={1} /></>, { wrapper: Wrapper });
    expect(played("deal")).toBe(0); // nothing before the card moves
    advance(0);
    expect(played("deal")).toBe(1);
    advance(timing.stagger - 1);
    expect(played("deal")).toBe(1);
    advance(1);
    expect(played("deal")).toBe(2);
    advance(10_000);
    expect(played("deal")).toBe(2); // landing does not play it again
  });

  it("a card that does not fly makes no deal sound: the board's first render, a split's moved card, reduced motion", () => {
    mount({ card: king, dealOrder: 1 }, { enabled: false });
    mount({ card: king, moved: true });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    mount({ card: five });
    advance(10_000);
    expect(playSound).not.toHaveBeenCalled();
  });

  it("a face that arrives later (the hole card, a face-down double) plays the flip sound once, when it turns over in place", () => {
    const { again } = mount({});
    advance(10_000); // the hole card flies in face down and lands
    finishAnimations();
    expect(played("deal")).toBe(1);
    expect(played("flip")).toBe(0);
    again({ card: king });
    expect(played("flip")).toBe(1);
    finishAnimations();
    advance(10_000);
    expect(played("flip")).toBe(1);
  });

  it("a card already on the table whose face arrives flips with its sound; under reduced motion it shows at once and is silent", () => {
    const { again } = mount({}, { enabled: false });
    again({ card: king });
    expect(playSound.mock.calls).toEqual([["flip"]]);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    playSound.mockClear();
    const quiet = mount({}, { enabled: false });
    quiet.again({ card: five });
    expect(playSound).not.toHaveBeenCalled();
  });
});

describe("the chip sound (PlayerHand)", () => {
  let tags = 0;
  const mkHand = (extra = {}) => ({
    tag: `s${tags++}`, cards: [], hiddenCards: [], bet: 0, status: HandStatus.PLAYING, result: HandResult.NONE, totals: [], total: 0, isBusted: false, isBlackjack: false, ...extra,
  });
  const seat = (hand, gamePhase, enabled = true) => <Flight enabled={enabled}><PlayerHand hand={hand} index={0} active gamePhase={gamePhase} handCount={1} maxSplitHands={0} credits={1000} /></Flight>;

  it("plays once for each stake added to the circle while betting, none when the stack shrinks or the seat first appears", () => {
    const hand = mkHand();
    const { rerender } = renderUI(seat(hand, GamePhases.PRE_DEAL, false));
    expect(played("chip")).toBe(0);
    rerender(seat({ ...hand, bet: 10 }, GamePhases.PRE_DEAL, false));
    expect(played("chip")).toBe(1);
    rerender(seat({ ...hand, bet: 35 }, GamePhases.PRE_DEAL, false)); // a 2x or a bigger chip is still one stake added
    expect(played("chip")).toBe(2);
    rerender(seat({ ...hand, bet: 25 }, GamePhases.PRE_DEAL, false)); // undo
    rerender(seat({ ...hand, bet: 0 }, GamePhases.PRE_DEAL, false)); // clear
    expect(played("chip")).toBe(2);
  });

  it("the automatic rebet's chips make the sound too, once, when the seat mounts with a stack", () => {
    renderUI(seat(mkHand({ bet: 10 }), GamePhases.PRE_DEAL));
    expect(played("chip")).toBe(1);
  });

  it("plays for a double's second stake and for the insurance stake, but not when the main stake changes outside betting", () => {
    const cards = stackedShoe(["6", "5"]);
    const hand = mkHand({ cards, bet: 10, baseStake: 10, totals: [11], total: 11 });
    const { rerender } = renderUI(seat(hand, GamePhases.PLAYER_TURN, false));
    rerender(seat({ ...hand, insurance: 5 }, GamePhases.PLAYER_TURN, false));
    expect(played("chip")).toBe(1); // insurance
    rerender(seat({ ...hand, insurance: 5, isDouble: true, bet: 20 }, GamePhases.PLAYER_TURN, false));
    expect(played("chip")).toBe(2); // the double's second stake
    rerender(seat({ ...hand, insurance: 5, isDouble: false, bet: 30 }, GamePhases.PLAYER_TURN, false)); // a tripled / refused hand: the main stack grows, but it is not betting
    expect(played("chip")).toBe(2);
  });
});

describe("the shuffle sound (useShuffle)", () => {
  const board = (game = {}) => renderUI(<GameBoard />, { game: { phase: GamePhases.PRE_DEAL, ...game } });

  it("plays once when the table opens with the shuffle, and not again as it runs", async () => {
    board();
    expect(played("shuffle")).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(played("shuffle")).toBe(1);
  });

  it("is silent when the board opens on a table already in play (no shuffle)", () => {
    board({ seenIds: ["seen"] });
    expect(played("shuffle")).toBe(0);
  });
});

describe("the win and lose sounds, and the buzz (GameBoard)", () => {
  const round = (cards, extra = {}) => playRound({ cards, ...extra });
  // The settled round, shown at the results (the verdict's first moment).
  const results = (r, settings = SOUND_ON) => renderUI(<GameBoard />, { game: { ...r.state, phase: GamePhases.RESULTS, seenIds: ["seen"], settings } });
  const WIN = ["10", "10", "9", "7"]; // 19 against 17
  const LOSE = ["10", "10", "7", "9"];
  const PUSH = ["10", "10", "8", "8"];
  const buzzes = () => vibrations.slice();

  it("a win plays the win sound and buzzes once", () => {
    results(round(WIN));
    expect(playSound.mock.calls.filter(([n]) => n === "win" || n === "lose")).toEqual([["win"]]);
    expect(buzzes()).toEqual([[40, 60, 40]]);
  });

  it("a blackjack counts as a win", () => {
    results(round(["A", "10", "K", "9"]));
    expect(played("win")).toBe(1);
    expect(buzzes()).toEqual([[40, 60, 40]]);
  });

  it("a loss and a bust play the lose sound and buzz once, long", () => {
    results(round(LOSE));
    expect(played("lose")).toBe(1);
    expect(played("win")).toBe(0);
    expect(buzzes()).toEqual([[120]]);
    vibrations.length = 0;
    playSound.mockClear();
    document.body.innerHTML = "";
    results(round(["10", "10", "6", "7", "K"], { actions: ["hit"] })); // 26: bust
    expect(playSound.mock.calls.filter(([n]) => n === "win" || n === "lose")).toEqual([["lose"]]);
    expect(buzzes()).toEqual([[120]]);
  });

  it("a push has no sound and no buzz", () => {
    results(round(PUSH));
    expect(played("win") + played("lose")).toBe(0);
    expect(vibrate).not.toHaveBeenCalled();
    expect(buzzes()).toEqual([]);
  });

  it("the round's result plays once: not again as the board moves on to Next hand, and again for the next round's result", () => {
    const r = round(WIN);
    const view = results(r);
    const go = (phase) => { view.gameState.phase = phase; view.rerender(<GameBoard />); };
    go(GamePhases.RESULTS); // a redraw at the same phase
    go(GamePhases.POST_ROUND);
    go(GamePhases.END_ROUND);
    expect(played("win")).toBe(1);
    expect(buzzes()).toHaveLength(1);
    go(GamePhases.PRE_DEAL);
    go(GamePhases.RESULTS); // the next round's verdict
    expect(played("win")).toBe(2);
    expect(buzzes()).toHaveLength(2);
  });

  it("nothing is made or buzzed while Sound and Vibration are off: no audio context work, no navigator.vibrate", () => {
    const gain = vi.spyOn(globalThis.AudioContext.prototype, "createGain");
    results(round(WIN), { ...SOUND_ON, soundOn: false, hapticsOn: false });
    expect(gain).not.toHaveBeenCalled();
    expect(buzzes()).toEqual([]);
  });

  it("Sound and Vibration are separate: Sound alone makes the chime and no buzz, Vibration alone buzzes and makes no audio", () => {
    const osc = vi.spyOn(globalThis.AudioContext.prototype, "createOscillator");
    results(round(WIN), { ...SOUND_ON, soundOn: true, hapticsOn: false });
    expect(osc).toHaveBeenCalledTimes(2); // the win chime's two notes
    expect(buzzes()).toEqual([]);
    cleanup();
    osc.mockClear();
    results(round(WIN), { ...SOUND_ON, soundOn: false, hapticsOn: true });
    expect(osc).not.toHaveBeenCalled();
    expect(buzzes()).toEqual([[40, 60, 40]]);
  });

  it("the board follows the saved settings as they change: it plays with Sound on, and goes quiet when it is turned off", () => {
    const osc = vi.spyOn(globalThis.AudioContext.prototype, "createOscillator");
    const view = results(round(WIN), { ...SOUND_ON, hapticsOn: false });
    expect(osc).toHaveBeenCalledTimes(2);
    view.gameState.phase = GamePhases.POST_ROUND;
    view.gameState.settings = { ...SOUND_ON, soundOn: false, hapticsOn: false };
    view.rerender(<GameBoard />);
    view.gameState.phase = GamePhases.RESULTS;
    view.rerender(<GameBoard />);
    expect(played("win")).toBe(2); // asked again for the next result ...
    expect(osc).toHaveBeenCalledTimes(2); // ... but Sound is off, so nothing was made
  });
});
