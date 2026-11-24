import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveMode, applyTheme, saveLook, readLook } from "../theme";

const settings = { feltTheme: "blue", accent: "orchid", mode: "light", showTotals: true };
const html = document.documentElement;

afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = "";
  ["felt", "accent", "mode"].forEach((k) => html.removeAttribute(`data-${k}`));
  html.classList.remove("no-totals");
});

describe("resolveMode (#79)", () => {
  it("keeps dark and light as they are", () => {
    expect(resolveMode("dark", true)).toBe("dark");
    expect(resolveMode("light", false)).toBe("light");
  });

  it("resolves system through the device preference", () => {
    expect(resolveMode("system", true)).toBe("light");
    expect(resolveMode("system", false)).toBe("dark");
  });
});

describe("applyTheme (#79)", () => {
  it("writes the three axes on <html>", () => {
    applyTheme(settings, false);
    expect(html.dataset).toMatchObject({ felt: "blue", accent: "orchid", mode: "light" });
  });

  it("resolves system mode with the device preference", () => {
    applyTheme({ ...settings, mode: "system" }, true);
    expect(html.dataset.mode).toBe("light");
    applyTheme({ ...settings, mode: "system" }, false);
    expect(html.dataset.mode).toBe("dark");
  });

  it("adds no-totals only when showTotals is false", () => {
    applyTheme({ ...settings, showTotals: false }, false);
    expect(html.classList.contains("no-totals")).toBe(true);
    applyTheme(settings, false);
    expect(html.classList.contains("no-totals")).toBe(false);
  });

  it("sets the theme-color meta from the computed --bg", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000">';
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ getPropertyValue: () => " #123456 " });
    applyTheme(settings, false);
    expect(document.querySelector('meta[name="theme-color"]').getAttribute("content")).toBe("#123456");
  });

  it("leaves the meta alone when --bg is empty, and copes with no meta", () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000">';
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ getPropertyValue: () => "  " });
    applyTheme(settings, false);
    expect(document.querySelector('meta[name="theme-color"]').getAttribute("content")).toBe("#000");
    document.head.innerHTML = "";
    window.getComputedStyle.mockReturnValue({ getPropertyValue: () => "#123456" });
    expect(() => applyTheme(settings, false)).not.toThrow();
  });
});

describe("saveLook and readLook (boot look)", () => {
  const base = { feltTheme: "green", accent: "emerald", mode: "dark", showTotals: true, deckCount: 6 };
  afterEach(() => localStorage.clear());

  it("reads back what was saved, laid over the base settings", () => {
    saveLook({ ...settings, deckCount: 2 });
    expect(readLook(base)).toEqual({ ...base, ...settings }); // only the four look keys are stored
  });

  it("gives the base when nothing, junk or a non-object is stored", () => {
    expect(readLook(base)).toEqual(base);
    for (const junk of ["{not json", "null", "5", '"x"']) {
      localStorage.setItem("bj.look", junk);
      expect(readLook(base), junk).toEqual(base);
    }
  });

  it("ignores each invalid value on its own and keeps the valid ones", () => {
    localStorage.setItem("bj.look", JSON.stringify({ feltTheme: "purple", accent: "ember", mode: "neon", showTotals: "yes" }));
    expect(readLook(base)).toEqual({ ...base, accent: "ember" });
    localStorage.setItem("bj.look", JSON.stringify({ mode: "system", showTotals: false }));
    expect(readLook(base)).toEqual({ ...base, mode: "system", showTotals: false });
  });

  it("copes with blocked storage: reading gives the base, writing does not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(readLook(base)).toEqual(base);
    expect(() => saveLook(settings)).not.toThrow();
  });
});
