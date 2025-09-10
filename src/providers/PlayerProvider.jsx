import { useState, useMemo, useCallback } from "react";
import { PlayerContext } from "../context/PlayerContext";
import {
  loginPlayer,
  addPlayerApi,
  updatePlayerApi,
  updateCreditsApi,
  deletePlayerApi,
} from "../utils/playerEngine";

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastLocalCreditChange, setLastLocalCreditChange] = useState(0);

  {/* LOGIN */} ///////////////////////////////////////////////////////////////////////////////////

  const login = useCallback(async ({ usernameOrEmail, password }) => {
    setLoading(true);
    try {
      const p = await loginPlayer({ usernameOrEmail, password });
      setPlayer(p);
      return p;
    } finally {
      setLoading(false);
      console.log("");
    }
  }, []);

  const logout = useCallback(() => setPlayer(null), []);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* PLAYER C.U.D. */} ///////////////////////////////////////////////////////////////////////////

  const addPlayer = useCallback(async (payload) => {
    setLoading(true);
    try {
      const p = await addPlayerApi(payload);
      setPlayer(p);
      return p;
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePlayer = useCallback(
    async (updates) => {
      if (!player) throw new Error("Not logged in");
      setLoading(true);
      try {
        const updated = await updatePlayerApi(player, updates);
        setPlayer(updated);
        return true;
      } finally {
        setLoading(false);
        console.log("");
      }
    },
    [player]
  );

  const deletePlayer = useCallback(async () => {
    if (!player) throw new Error("Not logged in");
    setLoading(true);
    try {
      await deletePlayerApi(player);
      setPlayer(null);
      return true;
    } finally {
      setLoading(false);
    }
  }, [player]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* CREDITS */} /////////////////////////////////////////////////////////////////////////////////

  const updateCreditsOnServer = useCallback(
    async (newCredits) => {
      if (!player) return;
      const updated = await updateCreditsApi(player, newCredits);
      if (updated.credits !== player.credits)
        setPlayer(updated);
      console.log("");
    },
    [player]
  );

  const addCreditsLocalOnly = useCallback((delta) => {
      setPlayer((prev) => (prev ? { ...prev, credits: Number(prev.credits) + Number(delta) } : prev));
      setLastLocalCreditChange(delta);
      setTimeout(() => setLastLocalCreditChange(0), 2000);
    },[]
  );

  /////////////////////////////////////////////////////////////////////////////////////////////////

  const value = useMemo(
    () => ({
      player,
      lastLocalCreditChange,
      loading,
      login,
      addPlayer,
      updatePlayer,
      updateCreditsOnServer,
      deletePlayer,
      logout,
      addCreditsLocalOnly,
    }),
    [player, lastLocalCreditChange, loading, login, addPlayer, updatePlayer, updateCreditsOnServer, deletePlayer, logout, addCreditsLocalOnly]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}