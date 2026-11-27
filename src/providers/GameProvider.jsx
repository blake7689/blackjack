import { useReducer, useEffect, useRef, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GameStateContext, GameActionsContext } from "../context/GameContext";
import { gameReducer, initialGameState, nextAutoAction, RESET_SETTINGS, SETTINGS_VERSION, sanitizeSettings } from "../utils/gameReducer";
import { GamePhases } from "../utils/constants/gamePhases";
import { createShoe } from "../utils/cards";
import { usePlayer } from "../hooks/usePlayer";
import { getToken } from "../utils/api";
import { getSettings, saveSettings } from "../utils/playerEngine";
import { stepWait } from "../utils/cardAnimation";
import { useTheme } from "../hooks/useTheme";
import { readLook, saveLook } from "../utils/theme";
import { setCurrency } from "../utils/money";

const ENTRY_ROUTES = new Set(["/", "/login", "/signup"]);
// A failed settings load is retried after 1, 2, 4, 8, 16 and 30 s, then every 30 s.
const retryWait = (attempt) => Math.min(1000 * 2 ** attempt, 30000);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialGameState, (s) => ({ ...s, settings: readLook(s.settings) })); // starts with the last look, so no flash before the saved settings load
  const { player, getCredits, applyCreditEvent } = usePlayer();
  const signedIn = player != null;
  const { deckCount, includeCutCard, playTimeout, autoDealDelay } = state.settings;
  const { pathname } = useLocation();
  const nav = useNavigate();
  const onGame = pathname === "/game";
  // Signed in and the table not yet started: the player is about to land on it (see the settings effect below).
  const [started, setStarted] = useState(false);
  useTheme(state.settings); // <html> data-felt / data-accent / data-mode / .no-totals follow the saved settings
  const { feltTheme, accent, mode, showTotals } = state.settings;
  setCurrency(state.settings.currency); // in render, like setSoundPrefs: every money string below this provider reads the symbol it sets
  useEffect(() => saveLook({ feltTheme, accent, mode, showTotals }), [feltTheme, accent, mode, showTotals]); // read back at boot (main.jsx)

  // Read only from event handlers (never during render), so lagging one commit behind is fine.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const whereRef = useRef({ pathname, nav });
  useEffect(() => { whereRef.current = { pathname, nav }; }, [pathname, nav]);

  const makeShoe = useCallback(() => createShoe(deckCount, includeCutCard), [deckCount, includeCutCard]);

  // On sign-in (or a restored session), load the player's saved settings. A failed load keeps what's there and is retried in the background (#196), and while
  // nothing has loaded a signed-in change is applied here but never saved: it would overwrite the stored table with defaults.
  // Then, once per sign-in or restore (never on a later visit to Home), the table starts and a player still on "/" lands on it (DESIGN
  // section 8); a failed load starts it with the settings it has. The sign-in pages count as entry routes too: whereRef lags the route commit
  // (Login's nav("/") may not have rendered yet), so a player can still read "/login" here (#144). //
  const loadedRef = useRef(false);
  const load = useCallback((saved) => {
    const settings = sanitizeSettings(saved);
    dispatch({ type: "LOAD_SETTINGS", saved, shoe: createShoe(settings.deckCount, settings.includeCutCard) });
    loadedRef.current = true;
    return settings;
  }, []);
  // null: nothing wrong. {}: the first load failed, retrying. { saved }: a retry answered; it waits for a break between rounds.
  const [late, setLate] = useState(null);
  useEffect(() => {
    loadedRef.current = false;
    setLate(null);
    if (!signedIn) { setStarted(false); dispatch({ type: "SIGN_OUT" }); return; }
    let current = true;
    let timer;
    const retry = (attempt) => {
      timer = setTimeout(() => getSettings().then(
        (saved) => { if (current) setLate({ saved }); },
        () => { if (current) retry(attempt + 1); },
      ), retryWait(attempt));
    };
    const begin = (settings) => {
      dispatch({ type: "START_GAME", shoe: createShoe(settings.deckCount, settings.includeCutCard) });
      setStarted(true);
      const { pathname: at, nav: go } = whereRef.current;
      if (ENTRY_ROUTES.has(at)) go("/game", { replace: true });
    };
    getSettings().then((saved) => {
      if (current) begin(load(saved));
    }, () => {
      if (!current) return;
      setLate({});
      begin(stateRef.current.settings);
      retry(0);
    });
    return () => { current = false; clearTimeout(timer); };
  }, [signedIn, load]);

  // A late answer never changes the rules under a round in progress: it is applied only before a deal. `signedIn`: a sign-out in the same commit wins.
  useEffect(() => {
    if (!signedIn || !late || !("saved" in late) || (state.phase !== GamePhases.NONE && state.phase !== GamePhases.PRE_DEAL)) return;
    load(late.saved);
    setLate(null);
  }, [signedIn, late, state.phase, load]);

  // Apply each credit event from the reducer exactly once. The server's answer to a bet comes back as an action. //
  const appliedSeq = useRef(0);
  useEffect(() => {
    for (const event of state.creditEvents) {
      if (event.seq <= appliedSeq.current) continue;
      const payout = event.kind === "settle" ? event.amount : undefined; // kept here: state.creditEvents is cut to the last 20
      applyCreditEvent(event, (seq, outcome) => dispatch({ type: outcome === "rejected" ? "BET_REJECTED" : "BET_CONFIRMED", seq, payout }));
      appliedSeq.current = event.seq;
    }
  }, [state.creditEvents, applyCreditEvent]);

  // One timer drives the automatic steps (dealer, settle, results, next round), each after Rate of Play or, while a card is still moving, after it lands (stepWait). Its cleanup cancels it
  // whenever the state moves on or the provider unmounts, so a stale step can never fire into a new game.
  // Auto deal's own steps (CONTINUE, DEAL) wait while the player is off the game page; gating here clears the timer in the same commit.
  const next = nextAutoAction(state);
  const auto = (next === "CONTINUE" || next === "DEAL") && !onGame ? null : next;
  const autoKey = auto && `${auto}|${state.dealer.cards.length}|${state.dealer.status}|${state.selectedHandIndex}`; // the hand: two split hands can wait for a card one after the other
  // `autoBar` (L2-4): while auto deal's own DEAL or CONTINUE step waits, the length of that wait for the countdown bar on the Deal / Next hand key, and when it began (a new object each time the timer restarts).
  const [autoBar, setAutoBar] = useState(null);
  useEffect(() => {
    if (!autoKey) return;
    const type = autoKey.split("|")[0];
    const wait = stepWait(Number(type === "DEAL" ? autoDealDelay : playTimeout));
    const timer = setTimeout(() => {
      dispatch({ type, auto: true, refill: makeShoe, credits: getCredits(), shoe: type === "END_ROUND" ? makeShoe() : undefined });
    }, wait);
    if (type === "DEAL" || type === "CONTINUE") setAutoBar({ type, ms: wait, at: performance.now() });
    return () => { clearTimeout(timer); setAutoBar(null); };
  }, [autoKey, playTimeout, autoDealDelay, makeShoe, getCredits]);

  // A hand in play is lost by a reload (L2-12): the browser asks first. Between rounds (nothing dealt yet, or the round settled) it does not.
  const inPlay = ![GamePhases.NONE, GamePhases.PRE_DEAL, GamePhases.POST_ROUND, GamePhases.END_ROUND].includes(state.phase);
  useEffect(() => {
    if (!inPlay) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inPlay]);

  // Leaving the game page cancels a pending deal (it is not a pause: coming back carries on with the next round). //
  useEffect(() => {
    if (!onGame) dispatch({ type: "CANCEL_AUTO_DEAL" });
  }, [onGame, state.autoDealPending]);

  const actions = useMemo(() => ({
    startGame: () => dispatch({ type: "START_GAME", shoe: makeShoe() }),
    resetGame: (phase = GamePhases.NONE) => dispatch({ type: "RESET_GAME", shoe: makeShoe(), phase }),
    addBet: (amount) => dispatch({ type: "ADD_BET", amount, credits: getCredits() }),
    undoBet: () => dispatch({ type: "UNDO_BET" }),
    clearBet: () => dispatch({ type: "CLEAR_BET" }),
    deal: () => dispatch({ type: "DEAL", refill: makeShoe, credits: getCredits() }), // credits: only insurance reads it (affordable?)
    hit: (handIdx) => dispatch({ type: "HIT", handIdx, refill: makeShoe }),
    stand: (handIdx) => dispatch({ type: "STAND", handIdx }),
    double: (handIdx) => dispatch({ type: "DOUBLE", handIdx, credits: getCredits(), refill: makeShoe }),
    triple: (handIdx) => dispatch({ type: "TRIPLE", handIdx, credits: getCredits(), refill: makeShoe }),
    split: (handIdx) => dispatch({ type: "SPLIT", handIdx, credits: getCredits(), refill: makeShoe }),
    surrender: (handIdx) => dispatch({ type: "SURRENDER", handIdx }),
    takeInsurance: () => dispatch({ type: "TAKE_INSURANCE", credits: getCredits() }),
    evenMoney: () => dispatch({ type: "EVEN_MONEY" }),
    declineOffers: () => dispatch({ type: "DECLINE_OFFERS" }),
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

  // `starting`: signed in but the table not started yet, so Home shows Loading instead of its Start Game button (a provider flag, not round state).
  const starting = signedIn && !started;
  const settingsUnloaded = signedIn && late !== null; // from a failed first load until the saved settings are applied: the table says so
  const shown = useMemo(() => ({ ...state, starting, settingsUnloaded, autoBar }), [state, starting, settingsUnloaded, autoBar]);

  return (
    <GameActionsContext.Provider value={actions}>
      <GameStateContext.Provider value={shown}>
        {children}
      </GameStateContext.Provider>
    </GameActionsContext.Provider>
  );
}
