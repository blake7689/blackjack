import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { PlayerContext } from "../context/PlayerContext";
import { getToken, setUnauthorizedHandler } from "../utils/api";
import {
  getMe, loginPlayer, registerPlayer, updateProfile, changePassword as changePasswordApi,
  deleteMe, logoutPlayer, placeBet, settleRound,
} from "../utils/playerEngine";
import { newRequestId, sendLedgerCall } from "../utils/ledgerCall";

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [creditChange, setCreditChange] = useState(null);
  // The latest player, updated synchronously so back-to-back credit changes never read a stale balance.
  const playerRef = useRef(null);
  // Displayed balance = the server's last answer + chips moved locally but not yet staked (unsent)
  // + optimistic changes whose ledger call hasn't answered yet (pending).
  const unsentRef = useRef(0);
  const pendingRef = useRef(0);
  // Ledger calls run one at a time, in the order the game made them.
  const queueRef = useRef(Promise.resolve());
  // Set when a round's opening bet is refused: the rest of that round's bets are then dropped unsent.
  const roundRefusedRef = useRef(false);
  const [reconnecting, setReconnecting] = useState(false);

  const signIn = useCallback((p) => {
    playerRef.current = p;
    unsentRef.current = 0;
    pendingRef.current = 0;
    roundRefusedRef.current = false;
    setPlayer(p);
    return p;
  }, []);

  const setCredits = useCallback((credits) => {
    playerRef.current = { ...playerRef.current, credits };
    setPlayer(playerRef.current);
  }, []);

  // Restore a session after a page refresh; an expired token (401) just leaves you signed out.
  // Ignore a late answer if you logged out or in as someone else meanwhile (the token changed).
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    getMe().then((p) => { if (getToken() === token) signIn(p); }).catch(() => {});
  }, [signIn]);

  // Any signed-in request that gets 401 signs you out here.
  useEffect(() => {
    setUnauthorizedHandler(() => signIn(null));
    return () => setUnauthorizedHandler(() => {});
  }, [signIn]);

  const login = useCallback(async (credentials) => signIn(await loginPlayer(credentials)), [signIn]);
  const addPlayer = useCallback(async (payload) => signIn(await registerPlayer(payload)), [signIn]);
  const updatePlayer = useCallback(async (profile) => {
    const updated = await updateProfile(profile);
    playerRef.current = { ...updated, credits: playerRef.current.credits };
    setPlayer(playerRef.current);
    return playerRef.current;
  }, []);
  const changePassword = useCallback((currentPassword, newPassword) => changePasswordApi(currentPassword, newPassword), []);
  const deletePlayer = useCallback(async () => {
    await deleteMe();
    signIn(null);
  }, [signIn]);
  const logout = useCallback(() => {
    logoutPlayer();
    signIn(null);
  }, [signIn]);

  {/* CREDITS */} /////////////////////////////////////////////////////////////////////////////////

  const getCredits = useCallback(() => playerRef.current?.credits ?? 0, []);

  const showChange = useCallback((delta) => {
    if (delta !== 0) setCreditChange((prev) => ({ delta, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  // Sends one ledger call after the ones before it (the queue stays serial, so a retrying call blocks the rest),
  // then shows the server's balance plus local changes. It stops quietly if the player signed out or changed
  // since it was queued, so one player's retry is never charged to another. report(seq, outcome) tells the game.
  const enqueue = useCallback(({ seq, newRound, optimistic, call }, report) => {
    const token = getToken();
    const stop = () => !playerRef.current || getToken() !== token;
    pendingRef.current += optimistic;
    queueRef.current = queueRef.current.then(async () => {
      const reload = async () => {
        try {
          const { credits } = await getMe();
          if (!stop()) setCredits(credits + unsentRef.current + pendingRef.current);
        } catch (err) {
          console.error("Reloading the balance failed", err);
        }
      };
      if (newRound) roundRefusedRef.current = false;
      const skipped = newRound === false && roundRefusedRef.current;
      const { outcome, res } = skipped && !stop()
        ? { outcome: "rejected" }
        : await sendLedgerCall(call, { shouldStop: stop, onReconnecting: setReconnecting });
      setReconnecting(false);
      if (outcome === "dropped" || stop()) return report(seq, "confirmed"); // balances were reset by the sign-out
      pendingRef.current -= optimistic;
      if (outcome === "confirmed") {
        setCredits(res.credits + unsentRef.current + pendingRef.current);
        return report(seq, "confirmed");
      }
      console.error("Ledger call refused; the game drops it", seq);
      if (newRound) roundRefusedRef.current = true;
      setCredits(playerRef.current.credits - optimistic); // undo the optimistic change even if the reload below fails
      if (!skipped) await reload();
      report(seq, "rejected");
    });
  }, [setCredits]);

  // Applies one credit event from the game reducer: local chip moves, ledger bets, and the round's settlement. //
  const applyCreditEvent = useCallback((event, report) => {
    if (!playerRef.current) return report(event.seq, "confirmed"); // signed out: nothing to wait for
    if (event.kind === "local") {
      unsentRef.current += event.amount;
      setCredits(playerRef.current.credits + event.amount);
      showChange(event.amount);
    } else if (event.kind === "bet") {
      const requestId = newRequestId(); // once per event; every retry reuses it
      const call = () => placeBet(event.amount, event.newRound, requestId);
      const common = { seq: event.seq, newRound: event.newRound, call };
      if (event.alreadyDeducted) {
        // The chips were taken from the balance locally; they now move to the server.
        unsentRef.current += event.amount;
        enqueue({ ...common, optimistic: 0 }, report);
      } else {
        setCredits(playerRef.current.credits - event.amount);
        showChange(-event.amount);
        enqueue({ ...common, optimistic: -event.amount }, report);
      }
    } else {
      setCredits(playerRef.current.credits + event.amount);
      showChange(event.amount);
      const requestId = newRequestId();
      enqueue({ seq: event.seq, optimistic: event.amount, call: () => settleRound(event.amount, requestId) }, report);
    }
  }, [enqueue, setCredits, showChange]);

  // The +/- badge next to the balance fades after a moment. //
  useEffect(() => {
    if (!creditChange) return;
    const timer = setTimeout(() => setCreditChange(null), 2500);
    return () => clearTimeout(timer);
  }, [creditChange]);

  const value = useMemo(
    () => ({ player, creditChange, reconnecting, login, addPlayer, updatePlayer, changePassword, deletePlayer, logout, getCredits, applyCreditEvent }),
    [player, creditChange, reconnecting, login, addPlayer, updatePlayer, changePassword, deletePlayer, logout, getCredits, applyCreditEvent]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
