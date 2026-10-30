import { useReducer, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { GameStateContext, GameActionsContext } from "../context/GameContext";
import { gameReducer, initialGameState, nextAutoAction, RESET_SETTINGS, SETTINGS_VERSION, sanitizeSettings } from "../utils/gameReducer";
import { GamePhases } from "../utils/constants/gamePhases";
import { createShoe } from "../utils/cards";
import { usePlayer } from "../hooks/usePlayer";
import { getToken } from "../utils/api";
import { getSettings, saveSettings } from "../utils/playerEngine";
import { stepWait } from "../utils/cardAnimation";

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const { player, getCredits, applyCreditEvent } = usePlayer();
  const signedIn = player != null;
  const { deckCount, includeCutCard, playTimeout, autoDealDelay } = state.settings;
  const onGame = useLocation().pathname === "/game";

  // Read only from event handlers (never during render), so lagging one commit behind is fine.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const makeShoe = useCallback(() => createShoe(deckCount, includeCutCard), [deckCount, includeCutCard]);

  // On sign-in (or a restored session), load the player's saved settings. A failed load keeps what's there, and while
  // nothing has loaded a signed-in change is applied here but never saved: it would overwrite the stored table with defaults. //
  const loadedRef = useRef(false);
  useEffect(() => {
    loadedRef.current = false;
    if (!signedIn) return;
    let current = true;
    getSettings().then((saved) => {
      if (!current) return;
      const settings = sanitizeSettings(saved);
      dispatch({ type: "LOAD_SETTINGS", saved, shoe: createShoe(settings.deckCount, settings.includeCutCard) });
      loadedRef.current = true;
    }).catch(() => {});
    return () => { current = false; };
  }, [signedIn]);

  // Apply each credit event from the reducer exactly once. The server's answer to a bet comes back as an action. //
  const appliedSeq = useRef(0);
  useEffect(() => {
    const report = (seq, outcome) => dispatch({ type: outcome === "rejected" ? "BET_REJECTED" : "BET_CONFIRMED", seq });
    for (const event of state.creditEvents) {
      if (event.seq <= appliedSeq.current) continue;
      applyCreditEvent(event, report);
      appliedSeq.current = event.seq;
    }
  }, [state.creditEvents, applyCreditEvent]);

  // One timer drives the automatic steps (dealer, settle, results, next round), each after Rate of Play or, while a card is still moving, after it lands (stepWait). Its cleanup cancels it
  // whenever the state moves on or the provider unmounts, so a stale step can never fire into a new game.
  // Auto deal's own steps (CONTINUE, DEAL) wait while the player is off the game page; gating here clears the timer in the same commit.
  const next = nextAutoAction(state);
  const auto = (next === "CONTINUE" || next === "DEAL") && !onGame ? null : next;
  const autoKey = auto && `${auto}|${state.dealer.cards.length}|${state.dealer.status}`;
  useEffect(() => {
    if (!autoKey) return;
    const type = autoKey.split("|")[0];
    const timer = setTimeout(() => {
      dispatch({ type, auto: true, refill: makeShoe, credits: getCredits(), shoe: type === "END_ROUND" ? makeShoe() : undefined });
    }, stepWait(Number(type === "DEAL" ? autoDealDelay : playTimeout)));
    return () => clearTimeout(timer);
  }, [autoKey, playTimeout, autoDealDelay, makeShoe, getCredits]);

  // Leaving the game page cancels a pending deal (it is not a pause: coming back carries on with the next round). //
  useEffect(() => {
    if (!onGame) dispatch({ type: "CANCEL_AUTO_DEAL" });
  }, [onGame, state.autoDealPending]);

  const actions = useMemo(() => ({
    startGame: () => dispatch({ type: "START_GAME", shoe: makeShoe() }),
    resetGame: (phase = GamePhases.NONE) => dispatch({ type: "RESET_GAME", shoe: makeShoe(), phase }),
    addBet: (amount) => dispatch({ type: "ADD_BET", amount, credits: getCredits() }),
    clearBet: () => dispatch({ type: "CLEAR_BET" }),
    deal: () => dispatch({ type: "DEAL", refill: makeShoe }),
    hit: (handIdx) => dispatch({ type: "HIT", handIdx, refill: makeShoe }),
    stand: (handIdx) => dispatch({ type: "STAND", handIdx }),
    double: (handIdx) => dispatch({ type: "DOUBLE", handIdx, credits: getCredits(), refill: makeShoe }),
    triple: (handIdx) => dispatch({ type: "TRIPLE", handIdx, credits: getCredits(), refill: makeShoe }),
    split: (handIdx) => dispatch({ type: "SPLIT", handIdx, credits: getCredits(), refill: makeShoe }),
    continueRound: () => dispatch({ type: "CONTINUE" }),
    pauseAutoDeal: () => dispatch({ type: "PAUSE_AUTO_DEAL" }),
    resumeAutoDeal: () => dispatch({ type: "RESUME_AUTO_DEAL" }),
    // Table settings deal a fresh shoe built with the new values and reset the table.
    changeSetting: (key, value) => actions.changeSettings({ [key]: value }),
    // Applies at once; when signed in, also saves the whole settings object. The promise rejects if the save fails.
    changeSettings: (values) => {
      const next = { ...stateRef.current.settings, ...values };
      const shoe = Object.keys(values).some((k) => RESET_SETTINGS.includes(k)) ? createShoe(next.deckCount, next.includeCutCard) : undefined;
      dispatch({ type: "SET_SETTING", values, shoe });
      if (!getToken()) return Promise.resolve();
      return loadedRef.current ? saveSettings({ v: SETTINGS_VERSION, ...next }) : Promise.reject(new Error("Settings have not loaded yet"));
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
