import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { guardImport } from "../lazyReload";

const KEY = "bj.chunkReload";
const boom = new Error("Failed to fetch dynamically imported module");
let reload;

beforeEach(() => {
  sessionStorage.clear();
  reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("guardImport (#169)", () => {
  it("returns the module and clears the flag when the chunk loads", async () => {
    sessionStorage.setItem(KEY, "1");
    expect(await guardImport(async () => ({ default: 1 }))()).toEqual({ default: 1 });
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("still returns the module when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(await guardImport(async () => ({ default: 2 }))()).toEqual({ default: 2 });
  });

  it("on the first failure sets the flag, reloads once and never settles", async () => {
    const settled = vi.fn();
    guardImport(() => Promise.reject(boom))().then(settled, settled);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem(KEY)).toBe("1");
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
  });

  it("rethrows when the flag is already set, so a second failure does not loop", async () => {
    sessionStorage.setItem(KEY, "1");
    await expect(guardImport(() => Promise.reject(boom))()).rejects.toBe(boom);
    expect(reload).not.toHaveBeenCalled();
  });

  it("rethrows when the flag cannot be read or kept", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    await expect(guardImport(() => Promise.reject(boom))()).rejects.toBe(boom);
    expect(reload).not.toHaveBeenCalled();
  });
});
