import { apiGet, apiPost, apiPut, apiDelete, setToken, clearToken } from "./api";

// The API's /api/player/me profile; it never includes a password or a player id. //
export function normalizePlayer(profile) {
  return {
    userName: profile.userName,
    email: profile.email,
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    credits: Number(profile.credits),
  };
}

export async function getMe() {
  return normalizePlayer(await apiGet("/player/me"));
}

async function signInWith(url, body) {
  const { accessToken } = await apiPost(url, body);
  setToken(accessToken);
  return getMe();
}

export const loginPlayer = ({ usernameOrEmail, password }) => signInWith("/auth/login", { usernameOrEmail, password });

// The server sets the starting balance; signup never sends one.
export const registerPlayer = ({ userName, email, password, firstName, lastName }) =>
  signInWith("/auth/register", { userName, email, password, firstName: firstName || null, lastName: lastName || null });

export async function updateProfile({ userName, email, firstName, lastName }) {
  return normalizePlayer(await apiPut("/player/me", { userName, email, firstName: firstName || null, lastName: lastName || null }));
}

export const changePassword = (currentPassword, newPassword) => apiPut("/player/me/password", { currentPassword, newPassword });

export async function deleteMe() {
  await apiDelete("/player/me");
  clearToken();
}

export const logoutPlayer = () => clearToken();

// Ledger (ADR-0003): the server owns the balance and answers with it. //
// Game settings saved on the server (#36): one flat object, or {} when none are saved.
export const getSettings = () => apiGet("/player/me/settings");
export const saveSettings = (settings) => apiPut("/player/me/settings", settings);

export const placeBet = (amount, newRound) => apiPost("/ledger/bet", { amount, newRound });
export const settleRound = (payout) => apiPost("/ledger/settle", { payout });
