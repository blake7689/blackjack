const API_BASE = import.meta.env.VITE_API_URL;
const TOKEN_KEY = "bj.token";

// The bearer token lives in sessionStorage so a page refresh keeps you signed in (ADR-0002).
// Storage can be unavailable (private mode, blocked site data); then the token simply isn't kept.
export function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* not kept; this tab stays signed in */ }
}

export function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* nothing stored */ }
}

let onUnauthorized = () => {};
// Called when a signed-in request gets 401 (expired or revoked token), after the token is cleared.
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(method, url, body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401 && token) {
      clearToken();
      onUnauthorized();
    }
    const txt = await res.text();
    throw new Error(errorMessage(txt) || `${method} ${url} failed`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

// API errors are JSON ({ message, errors }); show the specific errors when there are any.
function errorMessage(text) {
  try {
    const body = JSON.parse(text);
    const details = Array.isArray(body.errors) ? body.errors.flatMap((e) => (typeof e === "string" ? [e] : e.errors ?? [])) : [];
    return details.length ? details.join(" ") : body.message;
  } catch {
    return text;
  }
}

export const apiGet = (url) => request("GET", url);
export const apiPost = (url, body) => request("POST", url, body);
export const apiPut = (url, body) => request("PUT", url, body);
export const apiDelete = (url) => request("DELETE", url);
