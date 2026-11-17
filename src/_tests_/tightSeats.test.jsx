import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { useTightSeats } from "../hooks/useTightSeats";

// jsdom has no layout, so each element's size comes from `size`, by class: stage / seat (clientWidth), spot / stack (offsetWidth).
const size = { stage: 400, seat: 100, spot: 60, stack: 30 };
const desc = (proto, name) => Object.getOwnPropertyDescriptor(proto, name);
const saved = { clientWidth: desc(Element.prototype, "clientWidth"), offsetWidth: desc(HTMLElement.prototype, "offsetWidth") };
const kind = (el) => ["stage", "seat", "spot", "stack"].find((c) => el.classList.contains(c));
Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get() { return size[kind(this)] ?? 0; } });
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return size[kind(this)] ?? 0; } });

function Seats({ count = 1, seats = 1 }) {
  const seatsRef = useRef(null);
  const stageRef = useRef(null);
  const tight = useTightSeats(seatsRef, stageRef, count);
  return (
    <div className="stage" ref={stageRef}>
      <div className="seats" ref={seatsRef} data-tight={String(tight)}>
        {Array.from({ length: seats }, (_, i) => <div key={i} className="seat"><button className="spot"><span className="stack" /></button></div>)}
      </div>
    </div>
  );
}

const tightOf = (container) => container.querySelector(".seats").getAttribute("data-tight");
const reset = () => Object.assign(size, { stage: 400, seat: 100, spot: 60, stack: 30 });

describe("useTightSeats: are the seats too narrow for the side stacks beside the circle (portrait only)?", () => {
  afterEach(() => { reset(); delete window.matchMedia; vi.restoreAllMocks(); });
  // the room a seat needs: the circle plus a side stack either side (a chip 1.12 wide and 6 px apart) = 60 + 2 * (30 * 1.12 + 6) = 139.2

  it("is tight when the seat is narrower than the circle and both side stacks", () => {
    expect(tightOf(render(<Seats />).container)).toBe("true"); // 100 < 139.2
  });

  it("is not tight when the seat has the room", () => {
    size.seat = 140;
    expect(tightOf(render(<Seats />).container)).toBe("false");
  });

  it("is tight just under the room needed", () => {
    size.seat = 139;
    expect(tightOf(render(<Seats />).container)).toBe("true");
  });

  it("waits while the seat is not laid out yet (no width), and decides on the next render", () => {
    size.seat = 0;
    const { container, rerender } = render(<Seats />);
    expect(tightOf(container)).toBe("false");
    size.seat = 100;
    rerender(<Seats />);
    expect(tightOf(container)).toBe("true");
  });

  it("waits while there is no seat yet", () => {
    const { container, rerender } = render(<Seats seats={0} />);
    expect(tightOf(container)).toBe("false");
    rerender(<Seats seats={1} />);
    expect(tightOf(container)).toBe("true");
  });

  it("is never tight on landscape phones and wide screens: those put the side stacks above or outside the circle", () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    const { container } = render(<Seats />);
    expect(tightOf(container)).toBe("false");
    expect(window.matchMedia).toHaveBeenCalledWith("(max-height: 520px), (min-width: 900px) and (min-aspect-ratio: 5/4)");
  });

  it("tight when the media query says portrait", () => {
    window.matchMedia = vi.fn(() => ({ matches: false }));
    expect(tightOf(render(<Seats />).container)).toBe("true");
  });

  it("measures once per hand count and stage width: a re-render at the same size never flips the decision back", () => {
    window.matchMedia = vi.fn(() => ({ matches: false }));
    const { container, rerender } = render(<Seats />);
    expect(tightOf(container)).toBe("true");
    expect(window.matchMedia).toHaveBeenCalledTimes(1);
    size.seat = 300; // tight changes the card width: a measurement now would say the opposite
    rerender(<Seats />);
    rerender(<Seats />);
    expect(tightOf(container)).toBe("true");
    expect(window.matchMedia).toHaveBeenCalledTimes(1);
  });

  it("measures again when the hand count or the stage width changes", () => {
    const { container, rerender } = render(<Seats count={1} />);
    expect(tightOf(container)).toBe("true");
    size.seat = 300;
    rerender(<Seats count={2} />); // a split: new decision
    expect(tightOf(container)).toBe("false");
    size.seat = 100;
    rerender(<Seats count={2} />); // same pair: kept
    expect(tightOf(container)).toBe("false");
    size.stage = 500; // the window was resized
    rerender(<Seats count={2} />);
    expect(tightOf(container)).toBe("true");
  });
});

// leave the prototypes as jsdom made them for any test that shares this worker
afterAll(() => {
  Object.defineProperty(Element.prototype, "clientWidth", saved.clientWidth);
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", saved.offsetWidth);
});
