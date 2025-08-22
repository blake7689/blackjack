const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5166";

export async function apiPut(url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `PUT ${url} failed`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export async function apiPost(url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `POST ${url} failed`);
  }
  return res.json();
}

export async function apiDelete(url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `DELETE ${url} failed`);
  }
  return null;
}