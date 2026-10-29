import { useMemo, useRef } from "react";
import { vi } from "vitest";
import { render, act } from "@testing-library/react";
import { animations } from "./setup";
import { FlightContext } from "../context/FlightContext";
import { cardTiming } from "../utils/cardAnimation";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { PlayerContext } from "../context/PlayerContext";
import { GameStateContext, GameActionsContext } from "../context/GameContext";
import { initialGameState } from "../utils/gameReducer";
import { GamePhases } from "../utils/constants/gamePhases";

export const testPlayer = { playerId: 7, userName: "tester", email: "t@example.com", firstName: "Test", lastName: "Er", credits: 100 };

export function fakePlayer(overrides = {}) {
  return {
    player: testPlayer, creditChange: null, reconnecting: false,
    login: vi.fn(), addPlayer: vi.fn(), updatePlayer: vi.fn(), deletePlayer: vi.fn(), logout: vi.fn(),
    getCredits: vi.fn(() => 100), applyCreditEvent: vi.fn(), changePassword: vi.fn(), topUp: vi.fn(),
    ...overrides,
  };
}

export function fakeActions(overrides = {}) {
  return {
    startGame: vi.fn(), resetGame: vi.fn(), addBet: vi.fn(), clearBet: vi.fn(), deal: vi.fn(),
    hit: vi.fn(), stand: vi.fn(), double: vi.fn(), triple: vi.fn(), split: vi.fn(), continueRound: vi.fn(),
    changeSetting: vi.fn(() => Promise.resolve()), changeSettings: vi.fn(() => Promise.resolve()), getPhase: vi.fn(() => GamePhases.NONE),
    ...overrides,
  };
}

function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

// Renders ui with fake player and game contexts at `path`; returns the fakes for assertions.
export function renderUI(ui, { player = {}, game = {}, actions = {}, path = "/" } = {}) {
  const playerCtx = fakePlayer(player);
  const gameActions = fakeActions(actions);
  const gameState = { ...initialGameState, ...game };
  // A wrapper (not inline JSX) so rerender() keeps the providers.
  const wrapper = ({ children }) => (
    <MemoryRouter initialEntries={[path]}>
      <PlayerContext.Provider value={playerCtx}>
        <GameActionsContext.Provider value={gameActions}>
          <GameStateContext.Provider value={gameState}>
            <Routes><Route path="*" element={<>{children}<Location /></>} /></Routes>
          </GameStateContext.Provider>
        </GameActionsContext.Provider>
      </PlayerContext.Provider>
    </MemoryRouter>
  );
  return { ...render(ui, { wrapper }), playerCtx, gameActions, gameState };
}

// A board's flight context, a shoe to fly from and the layer the copies fly in. `enabled` false is the board's first render.
const defaultTiming = cardTiming(1000);
export function Flight({ children, enabled = true, timing = defaultTiming }) {
  const layerRef = useRef(null);
  const value = useMemo(() => ({ enabled, layerRef, timing }), [enabled, timing]);
  return (
    <FlightContext.Provider value={value}>
      <div className="deck-stack" />
      <div className="flight-layer" ref={layerRef} />
      {children}
    </FlightContext.Provider>
  );
}

// Fires every animation's onfinish once (a flight that lands starts a flip, so repeat until nothing is left), inside act.
export function finishAnimations() {
  let fired;
  do {
    fired = false;
    act(() => {
      animations.filter((a) => a.onfinish && !a.fired && !a.cancelled).forEach((a) => { a.fired = true; a.onfinish(); fired = true; });
    });
  } while (fired);
}

// Lets every timer run, then every animation finish: the opening deal is over and all cards are on the table face up.
export function settleDeal(ms = 10_000) {
  act(() => { vi.advanceTimersByTime(ms); });
  finishAnimations();
  act(() => { vi.advanceTimersByTime(ms); });
}
