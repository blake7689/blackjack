const API_BASE = import.meta.env.VITE_API_URL;
const TOKEN_KEY = "bj.token";
const REQUEST_TIMEOUT_MS = 10000;
// Sign-in, sign-up and the session restore wait out a cold API start (~30 s) instead of failing at 10 s (#75).
export const COLD_START_TIMEOUT_MS = 90000;

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

// A password change revokes the caller's token (#171); the swap gets a new one. While it runs, every other request
// waits here, so none goes out with the old token. Only the swap's own calls pass `ungated`.
let swap = null;
export async function swapToken(run) {
  let release;
  swap = new Promise((resolve) => { release = resolve; });
  try { return await run(); } finally { swap = null; release(); }
}

async function request(method, url, body, timeout = REQUEST_TIMEOUT_MS, ungated = false, retried = false) {
  if (!ungated) await swap;
  const token = getToken();
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout), // a request with no answer fails instead of hanging
  });
  if (!res.ok) {
    if (res.status === 401 && token) {
      // Sent with the old token while a swap ran (or finished): wait for it and retry once with the new token.
      if (!ungated && !retried && (swap || getToken() !== token)) {
        await swap;
        const fresh = getToken();
        if (fresh && fresh !== token) return request(method, url, body, timeout, ungated, true);
      }
      if (getToken() === token) {
        clearToken();
        onUnauthorized();
      }
    }
    const txt = await res.text();
    // err.status tells callers a definite refusal (4xx) from a network failure, which has none.
    // retryAfter (429 only): the lockout's whole seconds, as the server sent it.
    throw Object.assign(new Error(errorMessage(txt) || `${method} ${url} failed`), {
      status: res.status,
      ...(res.status === 429 && { retryAfter: res.headers.get("Retry-After") }),
    });
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

// The default 10 s suits the ledger (an unknown outcome is retried); pass a longer timeout where the API may be waking up.
export const apiGet = (url, timeout) => request("GET", url, undefined, timeout);
export const apiPost = (url, body, timeout, ungated) => request("POST", url, body, timeout, ungated);
export const apiPut = (url, body, ungated) => request("PUT", url, body, undefined, ungated);
export const apiDelete = (url, body) => request("DELETE", url, body);
