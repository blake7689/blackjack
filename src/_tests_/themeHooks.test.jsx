import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, render } from "@testing-library/react";
import { useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { useCardWidth } from "../hooks/useCardWidth";
import Wordmark from "../components/Wordmark/Wordmark";

const base = { feltTheme: "green", accent: "emerald", mode: "dark", showTotals: true };
const html = document.documentElement;
const realMatchMedia = window.matchMedia;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
  ["felt", "accent", "mode"].forEach((k) => html.removeAttribute(`data-${k}`));
  html.classList.remove("no-totals");
});

function fakeMedia(matches) {
  const listeners = new Set();
  const media = {
    matches,
    addEventListener: vi.fn((_, fn) => listeners.add(fn)),
    removeEventListener: vi.fn((_, fn) => listeners.delete(fn)),
    fire(next) { media.matches = next; listeners.forEach((fn) => fn()); },
    listeners,
  };
  window.matchMedia = vi.fn(() => media);
  return media;
}

describe("useTheme (#79)", () => {
  it("applies the settings on mount and when they change", () => {
    window.matchMedia = undefined;
    const { rerender } = renderHook((s) => useTheme(s), { initialProps: base });
    expect(html.dataset).toMatchObject({ felt: "green", accent: "emerald", mode: "dark" });
    rerender({ ...base, feltTheme: "red", mode: "light", showTotals: false });
    expect(html.dataset).toMatchObject({ felt: "red", mode: "light" });
    expect(html.classList.contains("no-totals")).toBe(true);
  });

  it("follows the device live in system mode and stops on cleanup", () => {
    const media = fakeMedia(false);
    const { unmount } = renderHook(() => useTheme({ ...base, mode: "system" }));
    expect(html.dataset.mode).toBe("dark");
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: light)");
    media.fire(true);
    expect(html.dataset.mode).toBe("light");
    unmount();
    expect(media.removeEventListener).toHaveBeenCalled();
    expect(media.listeners.size).toBe(0);
  });

  it("does not listen when the mode is fixed", () => {
    const media = fakeMedia(true);
    renderHook(() => useTheme(base));
    expect(media.addEventListener).not.toHaveBeenCalled();
    expect(html.dataset.mode).toBe("dark");
  });

  it("works without matchMedia (system falls back to dark)", () => {
    window.matchMedia = undefined;
    renderHook(() => useTheme({ ...base, mode: "system" }));
    expect(html.dataset.mode).toBe("dark");
  });
});

describe("useCardWidth (#79)", () => {
  function Stage() {
    const stage = useRef(null);
    const probe = useRef(null);
    useCardWidth(stage, probe);
    return <div data-testid="stage" ref={stage}><div data-testid="probe" ref={probe} /></div>;
  }
  const mockWidth = (w) => vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: w }));

  it("sets --cw and --ch from the probe's width, with no ResizeObserver", () => {
    mockWidth(89.69);
    vi.stubGlobal("ResizeObserver", undefined);
    const { getByTestId } = render(<Stage />);
    expect(getByTestId("stage").style.getPropertyValue("--cw")).toBe("89px");
    expect(getByTestId("stage").style.getPropertyValue("--ch")).toBe("129px");
  });

  it("updates on window resize and probe resize, and cleans up", () => {
    mockWidth(100);
    let notify;
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal("ResizeObserver", vi.fn(function ResizeObserver(fn) { notify = fn; return observer; }));
    const { getByTestId, unmount } = render(<Stage />);
    const stage = getByTestId("stage");
    expect(observer.observe).toHaveBeenCalledWith(getByTestId("probe"));
    expect(stage.style.getPropertyValue("--cw")).toBe("100px");
    mockWidth(60);
    window.dispatchEvent(new Event("resize"));
    expect(stage.style.getPropertyValue("--cw")).toBe("60px");
    mockWidth(50);
    notify();
    expect(stage.style.getPropertyValue("--cw")).toBe("50px");
    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
    mockWidth(80);
    window.dispatchEvent(new Event("resize"));
    expect(stage.style.getPropertyValue("--cw")).toBe("50px"); // no longer listening
  });
});

describe("Wordmark (#79)", () => {
  it("is a decorative svg carrying the class", () => {
    const { container } = render(<Wordmark className="x" />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("class")).toBe("x");
  });
});
