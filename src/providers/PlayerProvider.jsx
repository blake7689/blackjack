import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { PlayerContext } from "../context/PlayerContext";
import { getToken, setUnauthorizedHandler } from "../utils/api";
import {
  getMe, loginPlayer, registerPlayer, updateProfile, changePassword as changePasswordApi,
  deleteMe, logoutPlayer, placeBet, settleRound,
} from "../utils/playerEngine";

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

  const signIn = useCallback((p) => {
    playerRef.current = p;
    unsentRef.current = 0;
    pendingRef.current = 0;
    setPlayer(p);
    return p;
  }, []);

  const setCredits = useCallback((credits) => {
    if (!playerRef.current) return;
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

  // Sends one ledger call after the ones before it, then shows the server's balance plus local changes.
  const enqueue = useCallback((call, optimistic) => {
    pendingRef.current += optimistic;
    queueRef.current = queueRef.current
      .then(call)
      .then((res) => {
        pendingRef.current -= optimistic;
        setCredits(res.credits + unsentRef.current + pendingRef.current);
      })
      .catch(async (err) => {
        pendingRef.current -= optimistic;
        if (!playerRef.current) return; // signed out (for example a 401)
        console.error("Ledger call failed; reloading the balance", err);
        try {
          setCredits((await getMe()).credits + unsentRef.current + pendingRef.current);
        } catch (reloadErr) {
          console.error("Reloading the balance failed", reloadErr);
        }
      });
  }, [setCredits]);

  // Applies one credit event from the game reducer: local chip moves, ledger bets, and the round's settlement. //
  const applyCreditEvent = useCallback((event) => {
    if (!playerRef.current) return;
    if (event.kind === "local") {
      unsentRef.current += event.amount;
      setCredits(playerRef.current.credits + event.amount);
      showChange(event.amount);
    } else if (event.kind === "bet") {
      if (event.alreadyDeducted) {
        // The chips were taken from the balance locally; they now move to the server.
        unsentRef.current += event.amount;
        enqueue(() => placeBet(event.amount, event.newRound), 0);
      } else {
        setCredits(playerRef.current.credits - event.amount);
        showChange(-event.amount);
        enqueue(() => placeBet(event.amount, event.newRound), -event.amount);
      }
    } else {
      setCredits(playerRef.current.credits + event.amount);
      showChange(event.amount);
      enqueue(() => settleRound(event.amount), event.amount);
    }
  }, [enqueue, setCredits, showChange]);

  // The +/- badge next to the balance fades after a moment. //
  useEffect(() => {
    if (!creditChange) return;
    const timer = setTimeout(() => setCreditChange(null), 2500);
    return () => clearTimeout(timer);
  }, [creditChange]);

  const value = useMemo(
    () => ({ player, creditChange, login, addPlayer, updatePlayer, changePassword, deletePlayer, logout, getCredits, applyCreditEvent }),
    [player, creditChange, login, addPlayer, updatePlayer, changePassword, deletePlayer, logout, getCredits, applyCreditEvent]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
