const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5166/api";
// const API_BASE = "https://blackjack-api-blake.azurewebsites.net/api";

async function handleResponse(res, url, method) {
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `${method} ${url} failed`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export async function apiPut(url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse(res, url, "PUT");
}

export async function apiPost(url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse(res, url, "POST");
}

export async function apiDelete(url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse(res, url, "DELETE");
}