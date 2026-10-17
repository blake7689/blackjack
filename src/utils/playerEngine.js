import { apiPost, apiPut, apiDelete } from "./api";

// The API returns camelCase JSON and never a password. //
export function normalizePlayer(apiPlayer) {
  return {
    playerId: apiPlayer.playerId,
    userName: apiPlayer.userName,
    email: apiPlayer.email,
    firstName: apiPlayer.firstName ?? "",
    lastName: apiPlayer.lastName ?? "",
    credits: Number(apiPlayer.credits),
  };
}

export async function loginPlayer({ usernameOrEmail, password }) {
  return normalizePlayer(await apiPost(`/Player/login`, { usernameOrEmail, password }));
}

export async function addPlayerApi(payload) {
  const body = {
    playerId: 0,
    userName: payload.userName,
    password: payload.password,
    email: payload.email,
    firstName: payload.firstName || null,
    lastName: payload.lastName || null,
    credits: payload.credits,
  };
  return normalizePlayer(await apiPost(`/Player`, body));
}

// profile: userName, email, firstName, lastName, and password (blank keeps the current one). //
export async function updatePlayerApi(player, profile) {
  const { password, ...fields } = profile;
  const body = {
    ...fields,
    playerId: player.playerId,
    password: password || undefined, // JSON.stringify drops undefined, so the API keeps the password
    credits: player.credits,
  };
  await apiPut(`/Player/${player.playerId}`, body);
  return normalizePlayer({ ...player, ...fields });
}

export async function updateCreditsApi(player, newCredits) {
  const { playerId, userName, email, firstName, lastName } = player;
  await apiPut(`/Player/${playerId}`, { playerId, userName, email, firstName, lastName, credits: Number(newCredits) });
}

export async function deletePlayerApi(player) {
  await apiDelete(`/Player/${player.playerId}`, { playerId: player.playerId });
}
