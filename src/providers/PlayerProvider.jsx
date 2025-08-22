import { useState, useMemo, useCallback } from "react";
import { PlayerContext } from "../context/PlayerContext";
import { apiPost, apiPut, apiDelete } from "../utils/api";

function normalizePlayer(apiPlayer) {
  if (!apiPlayer) return null;
  return {
    playerId: apiPlayer.playerId ?? apiPlayer.PlayerId ?? null,
    userName: apiPlayer.userName ?? apiPlayer.UserName ?? "",
    email: apiPlayer.email ?? apiPlayer.Email ?? "",
    firstName: apiPlayer.firstName ?? apiPlayer.FirstName ?? "",
    lastName: apiPlayer.lastName ?? apiPlayer.LastName ?? "",
    password: apiPlayer.password ?? apiPlayer.Password ?? "",
    credits: Number(apiPlayer.credits ?? apiPlayer.Credits ?? 0),
    inActive: apiPlayer.inActive ?? apiPlayer.InActive ?? null,
  };
}

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async ({ usernameOrEmail, password }) => {
    setLoading(true);
    try {
      const data = await apiPost(`/api/Player/login`, { usernameOrEmail, password });
      const p = normalizePlayer(data);
      setPlayer(p);
      return p;
    } finally {
      setLoading(false);
    }
  }, []);

  const addPlayer = useCallback(async (payload) => {
    setLoading(true);
    try {
      const body = {
        playerId: 0,
        userName: payload.userName,
        password: payload.password,
        email: payload.email,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        credits: payload.credits ?? 0,
        inActive: null,
      };
      const data = await apiPost(`/api/Player`, body);
      const p = normalizePlayer(data);
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
        const body = {
          playerId: player.playerId,
          userName: updates.userName ?? player.userName,
          password: updates.password ?? player.password,
          email: updates.email ?? player.email,
          firstName: updates.firstName ?? player.firstName,
          lastName: updates.lastName ?? player.lastName,
          credits: updates.credits ?? player.credits,
          inActive: updates.inActive ?? player.inActive ?? null,
        };
        await apiPut(`/api/Player/${player.playerId}`, body);
        setPlayer(normalizePlayer(body));
        return true;
      } finally {
        setLoading(false);
      }
    },
    [player]
  );

  const updateCreditsOnServer = useCallback(
    async (newCredits) => {
      if (!player) return;
      const body = {
        playerId: player.playerId,
        userName: player.userName,
        password: player.password,
        email: player.email,
        firstName: player.firstName,
        lastName: player.lastName,
        credits: Number(newCredits),
        inActive: player.inActive ?? null,
      };
      await apiPut(`/api/Player/${player.playerId}`, body);
      setPlayer((prev) => (prev ? { ...prev, credits: Number(newCredits) } : prev));
    },
    [player]
  );

  const deletePlayer = useCallback(async () => {
    if (!player) throw new Error("Not logged in");
    setLoading(true);
    try {
      const body = { playerId: player.playerId, inActive: new Date().toISOString() };
      await apiDelete(`/api/Player/${player.playerId}`, body);
      setPlayer(null);
      return true;
    } finally {
      setLoading(false);
    }
  }, [player]);

  const logout = useCallback(() => setPlayer(null), []);
  const addCreditsLocal = useCallback(
    (delta) => setPlayer((prev) => (prev ? { ...prev, credits: Number(prev.credits) + Number(delta) } : prev)),
    []
  );

  const value = useMemo(
    () => ({
      player,
      setPlayer,
      loading,
      login,
      addPlayer,
      updatePlayer,
      updateCreditsOnServer,
      deletePlayer,
      logout,
      addCreditsLocal,
    }),
    [player, loading, login, addPlayer, updatePlayer, updateCreditsOnServer, deletePlayer, logout, addCreditsLocal]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}