const API_BASE = import.meta.env.VITE_API_URL;

async function request(method, url, body) {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `${method} ${url} failed`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export const apiPost = (url, body) => request("POST", url, body);
export const apiPut = (url, body) => request("PUT", url, body);
export const apiDelete = (url, body) => request("DELETE", url, body);
