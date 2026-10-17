import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { PlayerContext } from "../context/PlayerContext";
import { loginPlayer, addPlayerApi, updatePlayerApi, updateCreditsApi, deletePlayerApi } from "../utils/playerEngine";

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [creditChange, setCreditChange] = useState(null);
  // The latest player, updated synchronously so back-to-back credit changes never read a stale balance.
  const playerRef = useRef(null);

  const signIn = useCallback((p) => {
    playerRef.current = p;
    setPlayer(p);
    return p;
  }, []);

  const login = useCallback(async (credentials) => signIn(await loginPlayer(credentials)), [signIn]);
  const addPlayer = useCallback(async (payload) => signIn(await addPlayerApi(payload)), [signIn]);
  const updatePlayer = useCallback(async (profile) => signIn(await updatePlayerApi(playerRef.current, profile)), [signIn]);
  const deletePlayer = useCallback(async () => {
    await deletePlayerApi(playerRef.current);
    signIn(null);
  }, [signIn]);
  const logout = useCallback(() => signIn(null), [signIn]);

  {/* CREDITS */} /////////////////////////////////////////////////////////////////////////////////

  const getCredits = useCallback(() => playerRef.current?.credits ?? 0, []);

  // delta: change to the balance; persist: also save the new balance to the server. //
  const adjustCredits = useCallback((delta, persist) => {
    const current = playerRef.current;
    if (!current) return;
    signIn({ ...current, credits: current.credits + delta });
    if (delta !== 0) setCreditChange((prev) => ({ delta, seq: (prev?.seq ?? 0) + 1 }));
    // shortcut: a failed save is only logged; Phase 4's server ledger makes the server the source of truth.
    if (persist) updateCreditsApi(playerRef.current, playerRef.current.credits).catch((err) => console.error("Saving credits failed", err));
  }, [signIn]);

  // The +/- badge next to the balance fades after a moment. //
  useEffect(() => {
    if (!creditChange) return;
    const timer = setTimeout(() => setCreditChange(null), 2500);
    return () => clearTimeout(timer);
  }, [creditChange]);

  const value = useMemo(
    () => ({ player, creditChange, login, addPlayer, updatePlayer, deletePlayer, logout, getCredits, adjustCredits }),
    [player, creditChange, login, addPlayer, updatePlayer, deletePlayer, logout, getCredits, adjustCredits]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
