import { apiGet, apiPost, apiPut, apiDelete, setToken, clearToken, COLD_START_TIMEOUT_MS } from "./api";

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

// The default 10 s suits a balance reload inside the serial ledger queue; sign-in and the session restore pass a long one.
export async function getMe(timeout) {
  return normalizePlayer(await apiGet("/player/me", timeout));
}

async function signInWith(url, body) {
  const { accessToken } = await apiPost(url, body, COLD_START_TIMEOUT_MS);
  setToken(accessToken);
  return getMe(COLD_START_TIMEOUT_MS);
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

// requestId makes a call safe to repeat: the server applies a given id once and replays its answer.
export const placeBet = (amount, newRound, requestId) => apiPost("/ledger/bet", { amount, newRound, requestId });
export const settleRound = (payout, requestId) => apiPost("/ledger/settle", { payout, requestId });
export const topUp = (code, requestId) => apiPost("/ledger/topup", { code, requestId });
