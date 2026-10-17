import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { PlayerContext } from "../context/PlayerContext";
import { GameStateContext, GameActionsContext } from "../context/GameContext";
import { initialGameState } from "../utils/gameReducer";
import { GamePhases } from "../utils/constants/gamePhases";

export const testPlayer = { playerId: 7, userName: "tester", email: "t@example.com", firstName: "Test", lastName: "Er", credits: 100 };

export function fakePlayer(overrides = {}) {
  return {
    player: testPlayer, creditChange: null,
    login: vi.fn(), addPlayer: vi.fn(), updatePlayer: vi.fn(), deletePlayer: vi.fn(), logout: vi.fn(),
    getCredits: vi.fn(() => 100), adjustCredits: vi.fn(),
    ...overrides,
  };
}

export function fakeActions(overrides = {}) {
  return {
    startGame: vi.fn(), resetGame: vi.fn(), addBet: vi.fn(), clearBet: vi.fn(), deal: vi.fn(),
    hit: vi.fn(), stand: vi.fn(), double: vi.fn(), split: vi.fn(), continueRound: vi.fn(),
    changeSetting: vi.fn(), getPhase: vi.fn(() => GamePhases.NONE),
    ...overrides,
  };
}

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
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
