import { useReducer, useEffect, useRef, useCallback, useMemo } from "react";
import { GameStateContext, GameActionsContext } from "../context/GameContext";
import { gameReducer, initialGameState, nextAutoAction, RESET_SETTINGS } from "../utils/gameReducer";
import { GamePhases } from "../utils/constants/gamePhases";
import { createShoe } from "../utils/cards";
import { usePlayer } from "../hooks/usePlayer";

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const { getCredits, applyCreditEvent } = usePlayer();
  const { deckCount, includeCutCard, playTimeout } = state.settings;

  // Read only from event handlers (never during render), so lagging one commit behind is fine.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const makeShoe = useCallback(() => createShoe(deckCount, includeCutCard), [deckCount, includeCutCard]);

  // Apply each credit event from the reducer exactly once. //
  const appliedSeq = useRef(0);
  useEffect(() => {
    for (const event of state.creditEvents) {
      if (event.seq <= appliedSeq.current) continue;
      applyCreditEvent(event);
      appliedSeq.current = event.seq;
    }
  }, [state.creditEvents, applyCreditEvent]);

  // One timer drives the automatic steps (dealer, settle, results, next round). Its cleanup cancels it
  // whenever the state moves on or the provider unmounts, so a stale step can never fire into a new game.
  const auto = nextAutoAction(state);
  const autoKey = auto && `${auto}|${state.dealer.cards.length}|${state.dealer.status}`;
  useEffect(() => {
    if (!autoKey) return;
    const type = autoKey.split("|")[0];
    const timer = setTimeout(() => {
      dispatch({ type, refill: makeShoe, credits: getCredits(), shoe: type === "END_ROUND" ? makeShoe() : undefined });
    }, Number(playTimeout));
    return () => clearTimeout(timer);
  }, [autoKey, playTimeout, makeShoe, getCredits]);

  const actions = useMemo(() => ({
    startGame: () => dispatch({ type: "START_GAME", shoe: makeShoe() }),
    resetGame: (phase = GamePhases.NONE) => dispatch({ type: "RESET_GAME", shoe: makeShoe(), phase }),
    addBet: (amount) => dispatch({ type: "ADD_BET", amount, credits: getCredits() }),
    clearBet: () => dispatch({ type: "CLEAR_BET" }),
    deal: () => dispatch({ type: "DEAL", refill: makeShoe }),
    hit: (handIdx) => dispatch({ type: "HIT", handIdx, refill: makeShoe }),
    stand: (handIdx) => dispatch({ type: "STAND", handIdx }),
    double: (handIdx) => dispatch({ type: "DOUBLE", handIdx, credits: getCredits(), refill: makeShoe }),
    split: (handIdx) => dispatch({ type: "SPLIT", handIdx, credits: getCredits(), refill: makeShoe }),
    continueRound: () => dispatch({ type: "CONTINUE" }),
    // Table settings deal a fresh shoe built with the new values and reset the table.
    changeSetting: (key, value) => actions.changeSettings({ [key]: value }),
    changeSettings: (values) => {
      const next = { ...stateRef.current.settings, ...values };
      const shoe = Object.keys(values).some((k) => RESET_SETTINGS.includes(k)) ? createShoe(next.deckCount, next.includeCutCard) : undefined;
      dispatch({ type: "SET_SETTING", values, shoe });
    },
    getPhase: () => stateRef.current.phase,
  }), [makeShoe, getCredits]);

  return (
    <GameActionsContext.Provider value={actions}>
      <GameStateContext.Provider value={state}>
        {children}
      </GameStateContext.Provider>
    </GameActionsContext.Provider>
  );
}
