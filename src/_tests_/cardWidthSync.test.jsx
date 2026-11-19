import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { useCardWidth, useCardWidthNow } from "../hooks/useCardWidth";
import CardWidthSync from "../components/GameBoard/CardWidthSync";

// The card width in the commit (#147): the probe resizes when the seat count changes, but its ResizeObserver reports a frame later. CardWidthSync (rendered
// before the seats) re-applies --cw / --ch / --step in the same commit, so the seats' layout effects, which run after it, measure the final layout.
const widthFor = (seats) => (seats === 1 ? 100 : 60); // the probe is narrower with more seats
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function Table({ seats, seen }) {
  const stage = useRef(null);
  const probe = useRef(null);
  useCardWidth(stage, probe); // the mount (an effect, after the refs are attached); CardWidthSync takes over when the seat count changes
  return (
    <div data-testid="stage" ref={stage} style={{ "--n": seats }}>
      <div ref={probe} />
      <CardWidthSync stageRef={stage} probeRef={probe} seats={seats} />
      <Seat stage={stage} seen={seen} />
    </div>
  );
}
// Stands for a seat: its layout effect runs after CardWidthSync's and records the card width it can see (on the very first commit the stage ref is not attached yet).
function Seat({ stage, seen }) {
  useLayoutEffect(() => { seen.push(stage.current?.style.getPropertyValue("--cw")); });
  return null;
}

describe("CardWidthSync / useCardWidthNow (#147)", () => {
  const mockProbe = () => vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
    return { width: widthFor(Number(this.parentElement?.style.getPropertyValue("--n"))) };
  });

  it("sets --cw, --ch and --step at mount and again, in the same commit, when the seat count changes (the observer never reports)", () => {
    mockProbe();
    vi.stubGlobal("ResizeObserver", vi.fn(function ResizeObserver() { return { observe() {}, disconnect() {} }; })); // would only report a frame later
    const seen = [];
    const { getByTestId, rerender } = render(<Table seats={1} seen={seen} />);
    const stage = getByTestId("stage");
    expect(stage.style.getPropertyValue("--cw")).toBe("100px");
    expect(stage.style.getPropertyValue("--ch")).toBe("146px");
    expect(stage.style.getPropertyValue("--step")).toBe("27px");
    rerender(<Table seats={2} seen={seen} />); // a split: the probe is narrower in this very commit
    expect(stage.style.getPropertyValue("--cw")).toBe("60px");
    expect(stage.style.getPropertyValue("--ch")).toBe("88px");
    expect(stage.style.getPropertyValue("--step")).toBe("16px");
    expect(seen).toEqual([undefined, "60px"]); // the seat's own layout effect already saw the new width, not the old one
  });

  it("does nothing when the same seat count renders again, and when the elements are not there", () => {
    const spy = mockProbe();
    const seen = [];
    const { rerender } = render(<Table seats={1} seen={seen} />);
    const calls = spy.mock.calls.length;
    rerender(<Table seats={1} seen={seen} />);
    expect(spy.mock.calls.length).toBe(calls); // the effect depends on the seat count only
    function Bare() { // refs that point at nothing
      useCardWidthNow({ current: null }, { current: null }, 1);
      return null;
    }
    expect(() => render(<Bare />)).not.toThrow();
    function HalfBare() { // a stage without a probe
      useCardWidthNow({ current: document.body }, { current: null }, 1);
      return null;
    }
    expect(() => render(<HalfBare />)).not.toThrow();
  });
});
