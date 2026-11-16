import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveMode, applyTheme } from "../theme";

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
