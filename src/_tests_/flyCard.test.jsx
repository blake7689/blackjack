import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { Flight, finishAnimations } from "./testUtils";
import { animations } from "./setup";
import FlyCard from "../components/Card/FlyCard";
import { cardTiming, landed, queue } from "../utils/cardAnimation";
import { stackedShoe } from "../utils/_tests_/stackedShoe";

const [king] = stackedShoe(["K"]);
const timing = cardTiming(1000); // slide 350, stagger 390, flip 450
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const flights = () => animations.filter((a) => a.el.tagName === "IMG");
const flips = () => animations.filter((a) => a.el.classList.contains("fly-inner"));
const layer = (c) => c.querySelector(".flight-layer");
const wrap = (c) => c.querySelector(".fly-card");
const hiddenWrap = (c) => wrap(c).style.visibility === "hidden";
const turn = (c) => c.querySelector(".fly-inner").style.transform;

const mount = (props, flight = {}) => {
  const Wrapper = ({ children }) => <Flight {...flight}>{children}</Flight>;
  const utils = render(<FlyCard fk="a" {...props} />, { wrapper: Wrapper });
  return { ...utils, again: (next) => utils.rerender(<FlyCard fk="a" {...next} />) };
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("FlyCard: a new card", () => {
  it("flies face down from the shoe, lands, then flips and counts as landed", () => {
    const t0 = performance.now();
    const { container } = mount({ card: king });
    // The real card waits, hidden; a face-down copy sits in the flight layer, aria-hidden, with no name or rank.
    expect(hiddenWrap(container)).toBe(true);
    const copy = layer(container).querySelector("img");
    expect(copy.getAttribute("alt")).toBe("");
    expect(copy.getAttribute("aria-hidden")).toBe("true");
    expect(copy.getAttribute("src")).toBe("/cards/back.png");
    expect(queue.free).toBe(t0 + timing.stagger + timing.flip); // it reserved its flight and its flip
    advance(0);
    expect(copy.style.visibility).toBe("visible");
    expect(flights()).toHaveLength(1);
    expect(flights()[0].frames).toHaveLength(17);
    expect(flights()[0].options).toMatchObject({ duration: timing.slide, fill: "forwards" });
    expect(hiddenWrap(container)).toBe(true);

    finishAnimations(); // lands, starts the flip, and finishes that too
    expect(hiddenWrap(container)).toBe(false);
    expect(layer(container).children).toHaveLength(0);
    expect(flips()).toHaveLength(1);
    expect(flips()[0].frames).toEqual([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }]);
    expect(flips()[0].options.duration).toBe(timing.flip);
    expect(turn(container)).toBe("rotateY(180deg)");
    expect(landed.ids.has(king.id)).toBe(true);
    expect(container.querySelector("img.fly-front").getAttribute("alt")).toBe("king of hearts");
  });

  it("does not count as landed until the flip is over", () => {
    const { container } = mount({ card: king });
    advance(0);
    act(() => { flights()[0].onfinish(); });
    expect(hiddenWrap(container)).toBe(false);
    expect(landed.ids.has(king.id)).toBe(false);
    expect(turn(container)).toBe("rotateY(0deg)");
    act(() => { flips()[0].onfinish(); });
    expect(landed.ids.has(king.id)).toBe(true);
  });

  it("lands from a timer when the browser never fires onfinish (background tab, jsdom)", () => {
    const { container } = mount({ card: king });
    advance(timing.slide + 149);
    expect(hiddenWrap(container)).toBe(true);
    advance(1);
    expect(hiddenWrap(container)).toBe(false);
    expect(layer(container).children).toHaveLength(0);
  });

  it("opening deal: dealOrder delays the copy by dealOrder * stagger", () => {
    const { container } = mount({ card: king, dealOrder: 2 });
    const copy = layer(container).querySelector("img");
    advance(2 * timing.stagger - 1);
    expect(copy.style.visibility).toBe("hidden");
    expect(flights()).toHaveLength(0);
    advance(1);
    expect(copy.style.visibility).toBe("visible");
    expect(flights()).toHaveLength(1);
  });

  it("dealOrder 0 leaves at once, even behind a busy queue", () => {
    queue.free = performance.now() + 5000;
    const { container } = mount({ card: king, dealOrder: 0 });
    advance(0);
    expect(layer(container).querySelector("img").style.visibility).toBe("visible");
  });

  it("without dealOrder it queues behind the cards already on their way", () => {
    queue.free = performance.now() + 500;
    const { container } = mount({ card: king });
    const copy = layer(container).querySelector("img");
    advance(499);
    expect(copy.style.visibility).toBe("hidden");
    advance(1);
    expect(copy.style.visibility).toBe("visible");
    expect(queue.free).toBe(performance.now() + timing.stagger + timing.flip);
  });

  it("aims at the shoe, and follows the real card if the layout moves while it flies", () => {
    const pos = { left: 0, top: 0 };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
      if (this.classList.contains("deck-stack")) return { left: 300, top: 100, width: 50, height: 70 };
      if (this.classList.contains("fly-card")) return { ...pos, width: 50, height: 70 };
      return { left: 0, top: 0, width: 0, height: 0 };
    });
    const { container } = mount({ card: king });
    const copy = layer(container).querySelector("img");
    advance(0);
    expect(flights()[0].frames[0].transform).toContain("translate(300px, 100px)"); // shoe centre minus the card's centre
    pos.left = 40;
    pos.top = 10;
    advance(16); // the next animation frame
    expect(copy.style.translate).toBe("40px 10px");
    finishAnimations();
    expect(copy.isConnected).toBe(false);
  });

  it("unmounting mid-flight removes the copy, cancels the flight and gives the queue back", () => {
    const { container, unmount } = mount({ card: king });
    advance(0);
    const [flight] = flights();
    const copy = layer(container).querySelector("img");
    unmount();
    expect(flight.cancelled).toBe(true);
    expect(copy.isConnected).toBe(false);
    expect(queue.free).toBe(0);
    advance(5000); // the timers are gone: nothing lands into an unmounted card
    expect(flips()).toHaveLength(0);
  });

  it("unmounting before the copy leaves cancels its timers (no flight at all)", () => {
    const { unmount } = mount({ card: king, dealOrder: 3 });
    unmount();
    advance(5000);
    expect(animations).toHaveLength(0);
  });

  it("unmounting mid-flip cancels the flip and gives its time back", () => {
    const { unmount } = mount({ card: king });
    advance(0);
    act(() => { flights()[0].onfinish(); });
    const [flip] = flips();
    unmount();
    expect(flip.cancelled).toBe(true);
    expect(queue.free).toBe(0);
  });
});

describe("FlyCard: a face that arrives later", () => {
  it("never puts a hidden card in the DOM: the back is a div, with no image, name or text", () => {
    const { container } = mount({});
    const leaks = /king|hearts|card back/i;
    const check = () => {
      expect(container.querySelector(".fly-front")).toBeNull();
      expect(container.querySelector(".fly-back").tagName).toBe("DIV");
      expect(container.querySelector(".fly-back").getAttribute("aria-hidden")).toBe("true");
      expect(wrap(container).querySelector("img")).toBeNull();
      expect(wrap(container).innerHTML).not.toMatch(leaks);
      expect(wrap(container).textContent).toBe("");
    };
    check();
    advance(0);
    finishAnimations();
    check();
    expect(turn(container)).toBe("rotateY(0deg)");
    expect(flips()).toHaveLength(0);
  });

  it("flips in place on the same element, and does not fly again", () => {
    const { container, again } = mount({ dealOrder: 3 });
    advance(3 * timing.stagger);
    finishAnimations();
    const el = wrap(container);
    expect(flights()).toHaveLength(1);
    again({ card: king, dealOrder: 3 });
    expect(wrap(container)).toBe(el);
    expect(flights()).toHaveLength(1); // no second copy
    expect(layer(container).children).toHaveLength(0);
    expect(container.querySelector("img.fly-front").getAttribute("alt")).toBe("king of hearts");
    expect(queue.free).toBe(performance.now() + timing.flip + timing.gap); // the flip reserved its time
    finishAnimations();
    expect(turn(container)).toBe("rotateY(180deg)");
    expect(landed.ids.has(king.id)).toBe(true);
  });

  it("a card object that is only a new copy of the same card does not flip again", () => {
    const { again } = mount({ card: king });
    advance(0);
    finishAnimations();
    expect(flips()).toHaveLength(1);
    again({ card: { ...king } });
    finishAnimations();
    expect(flips()).toHaveLength(1);
  });

  it("a face that arrives while the card is still in the air flips once it has landed", () => {
    const { container, again } = mount({});
    advance(0);
    again({ card: king });
    expect(flips()).toHaveLength(0); // not on the table yet
    act(() => { flights()[0].onfinish(); });
    expect(flips()).toHaveLength(1);
    expect(hiddenWrap(container)).toBe(false);
  });
});

describe("FlyCard: no flight", () => {
  const noFlight = (container) => {
    expect(hiddenWrap(container)).toBe(false);
    expect(layer(container).children).toHaveLength(0);
    advance(5000);
    expect(animations).toHaveLength(0);
    expect(queue.free).toBe(0);
  };

  it("the board's first render: cards already on the table are just there, face up", () => {
    const { container } = mount({ card: king, dealOrder: 1 }, { enabled: false });
    expect(turn(container)).toBe("rotateY(180deg)");
    noFlight(container);
    expect(landed.ids.has(king.id)).toBe(true);
  });

  it("a split's moved card never flies", () => {
    const { container } = mount({ card: king, moved: true });
    expect(turn(container)).toBe("rotateY(180deg)");
    noFlight(container);
    expect(landed.ids.has(king.id)).toBe(true);
  });

  it("reduced motion: no flight, no flip, the face at once", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = mount({ card: king });
    expect(turn(container)).toBe("rotateY(180deg)");
    expect(container.querySelector("img.fly-front")).not.toBeNull();
    noFlight(container);
    expect(landed.ids.has(king.id)).toBe(true);
  });

  it("reduced motion: a face arriving on a card already on the table shows at once, with no flip", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container, again } = mount({});
    expect(turn(container)).toBe("rotateY(0deg)");
    again({ card: king });
    expect(turn(container)).toBe("rotateY(180deg)");
    expect(animations).toHaveLength(0);
    expect(landed.ids.has(king.id)).toBe(true);
  });

  it("a card on the table at first render still flips when its face arrives later", () => {
    const { container, again } = mount({}, { enabled: false });
    again({ card: king });
    expect(flips()).toHaveLength(1);
    expect(flights()).toHaveLength(0);
    finishAnimations();
    expect(turn(container)).toBe("rotateY(180deg)");
  });
});

describe("FlyCard: sideways (a double)", () => {
  afterEach(() => { delete HTMLElement.prototype.offsetWidth; });

  it("is turned 90 degrees with room on both sides, and lands turned", () => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 100 });
    const { container, again } = mount({ card: king, sideways: true });
    expect(wrap(container).style.rotate).toBe("90deg");
    expect(wrap(container).style.marginInline).toBe("20px");
    advance(0);
    expect(flights()[0].frames[16].transform).toContain("rotate(90deg)");
    again({ card: king, sideways: false });
    expect(wrap(container).style.rotate).toBe("");
    expect(wrap(container).style.marginInline).toBe("");
  });
});

// The board stays busy while any card holds: a hold ends only when the browser reports the flight and flip over (#72).
describe("FlyCard: holds the board until it is over", () => {
  const holds = () => queue.holds.size;

  it("a flying card holds from mount through the flight and the flip, and lets go at the flip's onfinish", () => {
    mount({ card: king });
    expect(holds()).toBe(1);
    advance(0);
    expect(holds()).toBe(1);
    act(() => { flights()[0].onfinish(); }); // landed, flip under way
    expect(holds()).toBe(1);
    act(() => { flips()[0].onfinish(); });
    expect(holds()).toBe(0);
  });

  it("keeps holding past the reserved time when the frames come late", () => {
    mount({ card: king });
    advance(0);
    act(() => { flights()[0].onfinish(); });
    advance(timing.flip + timing.gap + 5000); // the clock is long over, the browser has not said the flip is done
    expect(queue.free).toBeLessThan(performance.now());
    expect(holds()).toBe(1);
  });

  it("a face-less card (hole, face-down double) holds until it has landed, with no flip to wait for", () => {
    mount({ dealOrder: 3 });
    expect(holds()).toBe(1);
    advance(3 * timing.stagger);
    expect(holds()).toBe(1); // in the air
    act(() => { flights()[0].onfinish(); });
    expect(holds()).toBe(0);
    expect(flips()).toHaveLength(0);
  });

  it("a face-less card also lets go when the landing timer fires without an onfinish", () => {
    mount({});
    advance(timing.slide + 149);
    expect(holds()).toBe(1);
    advance(1);
    expect(holds()).toBe(0);
  });

  it("a face arriving later holds again through the in-place flip", () => {
    const { again } = mount({});
    advance(0);
    finishAnimations();
    expect(holds()).toBe(0);
    again({ card: king });
    expect(holds()).toBe(1);
    finishAnimations();
    expect(holds()).toBe(0);
  });

  it("a face arriving while the card is still in the air holds without a gap, through the landing and the flip", () => {
    const { again } = mount({});
    advance(0);
    again({ card: king });
    expect(holds()).toBe(1);
    act(() => { flights()[0].onfinish(); });
    expect(holds()).toBe(1);
    act(() => { flips()[0].onfinish(); });
    expect(holds()).toBe(0);
  });

  it("a card that never flies holds nothing", () => {
    mount({ card: king, dealOrder: 1 }, { enabled: false }); // the board's first render
    mount({ card: king, moved: true }); // a split's moved card
    mount({}, { enabled: false }); // the hole card already on the table, face down
    expect(holds()).toBe(0);
  });

  it("reduced motion holds nothing, even when a face arrives later", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { again } = mount({});
    expect(holds()).toBe(0);
    again({ card: king });
    expect(holds()).toBe(0);
  });

  it("a face arriving on a card that never flew holds through its flip", () => {
    const { again } = mount({}, { enabled: false });
    again({ card: king });
    expect(holds()).toBe(1);
    finishAnimations();
    expect(holds()).toBe(0);
  });

  it("unmounting mid-flight releases the hold", () => {
    const { unmount } = mount({ card: king });
    advance(0);
    unmount();
    expect(holds()).toBe(0);
  });

  it("unmounting before the copy has left releases the hold", () => {
    const { unmount } = mount({ card: king, dealOrder: 3 });
    expect(holds()).toBe(1);
    unmount();
    expect(holds()).toBe(0);
  });

  it("unmounting mid-flip releases the hold", () => {
    const { unmount } = mount({ card: king });
    advance(0);
    act(() => { flights()[0].onfinish(); });
    expect(holds()).toBe(1);
    unmount();
    expect(holds()).toBe(0);
  });

  it("several cards: the board is held until the last one is over", () => {
    mount({ card: king, dealOrder: 0 });
    render(<FlyCard fk="b" card={{ ...king, id: "other" }} dealOrder={1} />, { wrapper: ({ children }) => <Flight>{children}</Flight> });
    expect(holds()).toBe(2);
    advance(timing.stagger);
    act(() => { flights()[0].onfinish(); });
    act(() => { flips()[0].onfinish(); });
    expect(holds()).toBe(1);
    finishAnimations();
    expect(holds()).toBe(0);
  });
});
