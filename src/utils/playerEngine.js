import { apiPost, apiPut, apiDelete } from "./api";

export function normalizePlayer(apiPlayer) {
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

export async function loginPlayer({ usernameOrEmail, password }) {
  const data = await apiPost(`/api/Player/login`, { usernameOrEmail, password });
  return normalizePlayer(data);
}

export async function addPlayerApi(payload) {
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
  return normalizePlayer(data);
}

export async function updatePlayerApi(player, updates) {
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
  return normalizePlayer(body);
}

export async function updateCreditsApi(player, newCredits) {
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
  return { ...player, credits: Number(newCredits) };
}

export async function deletePlayerApi(player) {
  const body = { playerId: player.playerId, inActive: new Date().toISOString() };
  await apiDelete(`/api/Player/${player.playerId}`, body);
}