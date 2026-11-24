import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderUI, testPlayer } from "./testUtils";
import { animations } from "./setup";
import Dock from "../components/Dock/Dock";
import GameBoard from "../components/GameBoard/GameBoard";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import { initialGameState } from "../utils/gameReducer";
import { SWEEP_MS, SWEEP_GAP } from "../utils/cardFx";
import { stackedShoe } from "../utils/_tests_/stackedShoe";

// Loop 2 pieces that need the board or the dock: the keyboard hints setting (L2-3), the Next hand countdown bar (L2-4) and the pile counting the swept cards (L2-10).
const { PRE_DEAL, POST_ROUND, END_ROUND } = GamePhases;
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const rich = { ...testPlayer, credits: 1000 };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Dock: Show keyboard shortcuts (L2-3)", () => {
  const dock = (settings) => renderUI(<Dock busy={false} />, { game: { phase: PRE_DEAL, settings: { ...initialGameState.settings, ...settings } }, player: { player: rich } });
  const footer = () => screen.getByLabelText("Controls");

  it("the hints are off by default, so the dock has no .hints class (Dock.css shows the kbd and the rack's numbers only under it)", () => {
    dock({});
    expect(footer().classList.contains("hints")).toBe(false);
  });

  it("with the setting on the dock carries .hints", () => {
    dock({ showKeyHints: true });
    expect(footer().classList.contains("hints")).toBe(true);
  });

  it("either way the keys keep their kbd, their aria-keyshortcuts and the rack its numbers: the keys work, only the sight of them is a setting", () => {
    for (const showKeyHints of [false, true]) {
      const { unmount } = dock({ showKeyHints });
      expect(document.querySelectorAll("kbd").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Deal" }).getAttribute("aria-keyshortcuts")).toBe("Space");
      expect(document.querySelector(".rc").getAttribute("data-key")).toBe("1");
      unmount();
    }
  });
});

describe("Dock: the Next hand countdown bar (L2-4)", () => {
  const hand = { tag: "h1", cards: stackedShoe(["10", "9"]), hiddenCards: [], bet: 10, payout: 20, status: HandStatus.DONE, result: HandResult.WIN, totals: [19], total: 19, isBusted: false, isBlackjack: false };
  const results = (autoBar) => renderUI(<Dock busy={false} />, { game: { phase: POST_ROUND, hands: [hand], dealer: { cards: stackedShoe(["6"]) }, autoBar }, player: { player: rich } });
  const next = () => screen.getByRole("button", { name: "Next hand" });

  it("has no bar unless the automatic CONTINUE step is waiting", () => {
    results(undefined);
    expect(next().querySelector(".bar")).toBeNull();
  });

  it("shows a bar that fills over that wait, hidden from assistive tech, and the key keeps its name", () => {
    results({ type: "CONTINUE", ms: 1250, at: 7 });
    const bar = next().querySelector(".bar");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.firstChild.style.animationDuration).toBe("1250ms");
    expect(next().textContent).toBe("Next hand");
  });

  it("the DEAL bar is not Next hand's", () => {
    results({ type: "DEAL", ms: 3000, at: 1 });
    expect(next().querySelector(".bar")).toBeNull();
  });
});

describe("GameBoard: the discard pile counts the swept cards when the last one lands (L2-10)", () => {
  const card = (n) => ({ id: `c${n}`, rank: "5", suit: "clubs", count: 1, value: 5 });
  const sweeping = () => {
    const dealer = { cards: [card(1), card(2)] };
    const hands = [{ tag: "h1", cards: [card(3), card(4)], hiddenCards: [], bet: 10, status: HandStatus.DONE, result: HandResult.WIN, totals: [10], total: 10, isBlackjack: false, isBusted: false }];
    return { phase: END_ROUND, dealer, hands, seenIds: ["x"], shoe: stackedShoe(Array(36).fill("5")), settings: { ...initialGameState.settings, deckCount: 1 } };
  };
  const pile = () => document.querySelector(".discard");

  it("the pile is as it was while the cards fly, and shows them (more cards, a higher level) once the last copy has landed", () => {
    renderUI(<GameBoard />, { game: sweeping() });
    const cards = document.querySelectorAll(".dealer-hand .card, .seats .card").length;
    expect(cards).toBeGreaterThan(0);
    expect(pile().getAttribute("data-lv")).toBe("1"); // 52 - 36 in the shoe - 4 on the table = 12 in the pile
    const landing = SWEEP_MS + (cards - 1) * SWEEP_GAP;
    expect(animations.some((a) => a.options.duration === SWEEP_MS)).toBe(true);
    advance(landing - 1);
    expect(pile().getAttribute("data-lv")).toBe("1");
    advance(1);
    expect(pile().getAttribute("data-lv")).toBe("2"); // 16 now: the swept cards are counted, a beat before the round's own state follows
  });
});
