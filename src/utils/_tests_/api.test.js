import { describe, it, expect, vi, afterEach } from "vitest";
import { apiPost, apiPut, apiDelete } from "../api";

const respond = (res) => {
  const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: 1 }), text: async () => "", ...res }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("sends JSON and returns the parsed body", async () => {
    const fetch = respond({});
    expect(await apiPost("/Player", { a: 1 })).toEqual({ ok: 1 });
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: '{"a":1}' });
  });

  it("returns null for 204 or a body that is not JSON", async () => {
    respond({ status: 204 });
    expect(await apiPut("/Player/1", {})).toBeNull();
    respond({ json: async () => { throw new Error("empty"); } });
    expect(await apiPut("/Player/1", {})).toBeNull();
  });

  it("sends no body when there is none", async () => {
    const fetch = respond({});
    await apiDelete("/Player/1");
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it("throws the server's message, or a default one", async () => {
    respond({ ok: false, status: 401, text: async () => "Invalid username/email or password." });
    await expect(apiPost("/Player/login", {})).rejects.toThrow("Invalid username/email or password.");
    respond({ ok: false, status: 500 });
    await expect(apiDelete("/Player/1", {})).rejects.toThrow("DELETE /Player/1 failed");
  });
});
