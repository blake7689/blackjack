import { describe, it, expect, vi, afterEach } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderUI } from "./testUtils";
import FeltPrint from "../components/FeltPrint/FeltPrint";
import Shoe from "../components/Shoe/Shoe";
import GameBoard from "../components/GameBoard/GameBoard";
import { useDealerRoom } from "../hooks/useDealerRoom";
import { useCentrePrint } from "../hooks/useCentrePrint";
import { centrePrint } from "../utils/centrePrint";
import { initialGameState } from "../utils/gameReducer";
import { RULE_PRESETS } from "../utils/rulePresets";
import { GamePhases } from "../utils/constants/gamePhases";
import { stackedShoe } from "../utils/_tests_/stackedShoe";

const settings = initialGameState.settings;
const size = (w, h) => {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(w);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(h);
};
const lines = (c) => [...c.querySelectorAll("text")].map((t) => t.textContent);

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete Element.prototype.getComputedTextLength; delete document.fonts; });

describe("FeltPrint (#81)", () => {
  it("is a button named Table rules and draws nothing until it has a size", () => {
    const { container } = render(<FeltPrint settings={settings} />);
    expect(screen.getByRole("button", { name: "Table rules" })).toBeTruthy();
    expect(container.querySelector("text")).toBeNull();
  });

  it("prints the payout, the rules and insurance on arcs once it has a size", () => {
    size(400, 82);
    const { container } = render(<FeltPrint settings={settings} />);
    expect(lines(container)).toEqual(["Blackjack Pays 3 to 2", "Dealer hits soft 17 · Dealer peeks", "Insurance pays 2 to 1"]);
    expect(container.querySelectorAll("path.band")).toHaveLength(2);
  });

  it("prints each preset's own words, in portrait and in landscape", () => {
    const words = { Vegas: "Dealer hits soft 17 · Dealer peeks" };
    for (const name of Object.keys(RULE_PRESETS)) {
      size(400, 82);
      const rules = words[name] ?? "Dealer stands on all 17s · No second card";
      const { container, unmount } = render(<FeltPrint settings={{ ...settings, ...RULE_PRESETS[name] }} />);
      expect(lines(container), name).toEqual(["Blackjack Pays 3 to 2", rules, "Insurance pays 2 to 1"]);
      expect(container.querySelectorAll("path.band"), name).toHaveLength(2);
      unmount();
      vi.restoreAllMocks();
      size(800, 44);
      vi.stubGlobal("matchMedia", () => ({ matches: true }));
      const wide = render(<FeltPrint settings={{ ...settings, ...RULE_PRESETS[name] }} />);
      expect(lines(wide.container), name).toEqual([`Blackjack Pays 3 to 2 · ${rules} · Insurance pays 2 to 1`]);
      wide.unmount();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("prints no insurance line or ruled band when insurance is off", () => {
    size(400, 82);
    const { container } = render(<FeltPrint settings={{ ...settings, insurance: false, blackjackPayout: "6:5" }} />);
    expect(lines(container)).toEqual(["Blackjack Pays 6 to 5", "Dealer hits soft 17 · Dealer peeks"]);
    expect(container.querySelector("path.band")).toBeNull();
  });

  it("is one line in landscape", () => {
    size(800, 44);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = render(<FeltPrint settings={settings} />);
    expect(lines(container)).toEqual(["Blackjack Pays 3 to 2 · Dealer hits soft 17 · Dealer peeks · Insurance pays 2 to 1"]);
  });

  it("steps a line down to 12 px when it is too long, and no further", () => {
    size(400, 82);
    Element.prototype.getComputedTextLength = () => 10_000;
    const { container } = render(<FeltPrint settings={settings} />);
    expect([...container.querySelectorAll("text")].map((t) => t.getAttribute("font-size"))).toEqual(["14", "12", "12"]); // 24 less 10 steps; 16 and 13 down to the floor
  });

  it("opens the rules on a click (a real button: Enter and Space click it), and a click is not a click on the felt", () => {
    const onOpen = vi.fn();
    const onFelt = vi.fn();
    render(<div onClick={onFelt}><FeltPrint settings={settings} onOpen={onOpen} /></div>);
    const print = screen.getByRole("button", { name: "Table rules" });
    expect(print.tagName).toBe("BUTTON");
    fireEvent.click(print);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onFelt).not.toHaveBeenCalled();
  });

  it("works without onOpen or ResizeObserver, redraws on a resize and when the fonts arrive", async () => {
    size(400, 82);
    const onDraw = vi.fn();
    let notify;
    vi.stubGlobal("ResizeObserver", vi.fn(function RO(fn) { notify = fn; return { observe() {}, disconnect() {} }; }));
    const load = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
    const { container } = render(<FeltPrint settings={settings} onDraw={onDraw} />);
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => {});
    const drawn = onDraw.mock.calls.length;
    size(300, 82);
    act(() => notify());
    expect(container.querySelector("svg").getAttribute("viewBox")).toBe("0 0 300 82");
    expect(onDraw.mock.calls.length).toBeGreaterThan(drawn);
    fireEvent.click(screen.getByRole("button", { name: "Table rules" })); // no onOpen: nothing happens
  });

  it("carries on when a font cannot be loaded", async () => {
    size(400, 82);
    Object.defineProperty(document, "fonts", { configurable: true, value: { load: () => Promise.reject(new Error("offline")) } });
    const { container } = render(<FeltPrint settings={settings} />);
    await act(async () => {});
    expect(lines(container)).toHaveLength(3);
  });

  it("does not draw again after it is gone when the fonts arrive late", async () => {
    let arrive;
    Object.defineProperty(document, "fonts", { configurable: true, value: { load: () => new Promise((r) => { arrive = r; }) } });
    const { unmount } = render(<FeltPrint settings={settings} />);
    unmount();
    await act(async () => { arrive(); });
  });
});

describe("Shoe (#81)", () => {
  it("is not in the accessibility tree, and its mouth is the flights' hook", () => {
    const { container } = render(<Shoe discard={0} cutOut={false} />);
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(3);
    expect(container.querySelector(".shoe .mouth.deck-stack")).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("the discard pile is hidden while empty and thickens as it grows; the cut card rests once it is drawn", () => {
    const { container, rerender } = render(<Shoe discard={0} cutOut={false} />);
    const pile = container.querySelector(".discard");
    expect(pile.classList.contains("empty")).toBe(true);
    expect(container.querySelector(".cut-rest").classList.contains("out")).toBe(false);
    rerender(<Shoe discard={13} cutOut />);
    expect(pile.classList.contains("empty")).toBe(false);
    expect(pile.dataset.lv).toBe("2");
    expect(container.querySelector(".cut-rest").classList.contains("out")).toBe(true);
    rerender(<Shoe discard={200} cutOut />);
    expect(pile.dataset.lv).toBe("4");
  });
});

describe("the table's felt (#81)", () => {
  const playing = { phase: GamePhases.PLAYER_TURN, dealer: { cards: stackedShoe(["6"]), dealerDisplayTotal: 6 } };

  it("has the felt, its rail, the shoe and the print on the stage, and the print opens the rules in Settings", () => {
    const { container } = renderUI(<GameBoard />, { game: playing });
    expect(container.querySelector(".room > .felt > .rail")).not.toBeNull();
    expect(container.querySelector(".felt .main-area.stage .stage-in .shoe .deck-stack")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Table rules" }));
    expect(screen.getByTestId("location").textContent).toBe("/settings?tab=game");
  });

  it("the discard pile counts what was dealt and has left the table", () => {
    const shoe = Array.from({ length: 100 }, (_, i) => ({ type: "card", id: `c${i}` })); // a 2-deck shoe: 4 dealt, 1 of them on the table
    const { container } = renderUI(<GameBoard />, { game: { ...playing, shoe, settings: { ...settings, deckCount: 2 } } });
    expect(container.querySelector(".discard").classList.contains("empty")).toBe(false);
    expect(container.querySelector(".discard").dataset.lv).toBe("1"); // 3 cards: 104 - 100 - 1
  });
});

function Stage({ cw = "89px" }) {
  const stage = useRef(null);
  const probe = useRef(null);
  useDealerRoom(stage, probe);
  useCentrePrint(stage);
  return (
    <div ref={stage} className="stage-in" style={cw ? { "--cw": cw } : undefined}>
      <div ref={probe} />
      <i className="shoe-card" />
    </div>
  );
}
const rects = (stage, shoe) => vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
  return this.classList.contains("shoe-card") ? shoe : stage;
});

describe("useDealerRoom (#81)", () => {
  it("sets --room: how wide the dealer's hand may grow, from the stage and the shoe's corner", () => {
    rects({ left: 0, width: 390 }, { left: 309, width: 40 });
    const { container } = render(<Stage />);
    expect(container.querySelector(".stage-in").style.getPropertyValue("--room")).toBe("240px");
  });

  it("needs no ResizeObserver, and a shoe with no size leaves only the stage's limits", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    rects({ left: 0, width: 390 }, { left: 0, width: 0 });
    const { container } = render(<Stage />);
    expect(container.querySelector(".stage-in").style.getPropertyValue("--room")).toBe("264px"); // 390 - 2 x (0.55 cards + 14)
  });

  it("takes a card for 70 px wide until the card width is set", () => {
    rects({ left: 0, width: 390 }, { left: 0, width: 0 });
    const { container } = render(<Stage cw="" />);
    expect(container.querySelector(".stage-in").style.getPropertyValue("--room")).toBe("274px"); // 390 - 2 x 58 (a card of 70 would allow 285)
  });

  it("updates when the stage or the card width resizes, and when the window does", () => {
    const notifiers = [];
    const observe = vi.fn();
    vi.stubGlobal("ResizeObserver", vi.fn(function RO(fn) { notifiers.push(fn); return { observe, disconnect() {} }; }));
    const notify = () => notifiers.forEach((fn) => fn());
    rects({ left: 0, width: 390 }, { left: 0, width: 0 });
    const { container, unmount } = render(<Stage />);
    expect(observe).toHaveBeenCalledTimes(3); // the room watches the stage and the probe, the print watches the stage
    rects({ left: 0, width: 500 }, { left: 0, width: 0 });
    act(() => notify());
    expect(container.querySelector(".stage-in").style.getPropertyValue("--room")).toBe("374px");
    rects({ left: 0, width: 600 }, { left: 0, width: 0 });
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(container.querySelector(".stage-in").style.getPropertyValue("--room")).toBe("474px");
    unmount();
    rects({ left: 0, width: 700 }, { left: 0, width: 0 });
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(container.querySelector(".stage-in")).toBeNull();
  });
});

describe("useCentrePrint (#81)", () => {
  it("centres the print again whenever the stage resizes, with or without a ResizeObserver", () => {
    let notify;
    vi.stubGlobal("ResizeObserver", vi.fn(function RO(fn) { notify = fn; return { observe() {}, disconnect() {} }; }));
    const first = render(<Stage />);
    expect(() => notify()).not.toThrow(); // no seat yet: centrePrint does nothing
    first.unmount();
    vi.stubGlobal("ResizeObserver", undefined);
    render(<Stage />);
  });
});

describe("centrePrint (#81): the print and the message are centred between the dealer's hand and the first seat", () => {
  function build() {
    document.body.innerHTML = `<div class="stage-in"><div class="dealer-container"></div><svg class="print"><text></text></svg><div class="mid"><p class="msg"></p></div><div class="seat"></div></div>`;
    const at = (sel, top, bottom) => { document.querySelector(sel).getBoundingClientRect = () => ({ top, bottom, height: bottom - top }); };
    return { stage: document.querySelector(".stage-in"), at };
  }

  it("shifts the block to the middle of the gap", () => {
    const { stage, at } = build();
    at(".dealer-container", 0, 100); at(".seat", 400, 500); at("text", 150, 190); at(".msg", 200, 230); at(".mid", 200, 248);
    centrePrint(stage);
    expect(stage.style.getPropertyValue("--py")).toBe("41px"); // the block is 150 to 268 (the message line's bottom + 20): its middle 209, the gap's 250
  });

  it("measures the block without its current shift", () => {
    const { stage, at } = build();
    stage.style.setProperty("--py", "10px");
    at(".dealer-container", 0, 100); at(".seat", 400, 500); at("text", 160, 200); at(".msg", 210, 240); at(".mid", 210, 258); // the same block, 10 px lower
    centrePrint(stage.querySelector(".print")); // any element in the stage will do
    expect(stage.style.getPropertyValue("--py")).toBe("41px");
  });

  it("never moves the block closer to the player's cards than 8 px, or up", () => {
    const { stage, at } = build();
    at(".dealer-container", 0, 250); at(".seat", 290, 400); at("text", 150, 190); at(".msg", 200, 230); at(".mid", 200, 248);
    centrePrint(stage);
    expect(stage.style.getPropertyValue("--py")).toBe("14px"); // 290 - 8 - 268, though the middle of the gap is further
    at(".dealer-container", 0, 100); at(".seat", 200, 400); // the block is taller than the gap: it stays where the layout put it
    centrePrint(stage);
    expect(stage.style.getPropertyValue("--py")).toBe("0px");
  });

  it("does nothing before there is a seat or any printed text", () => {
    const { stage } = build();
    centrePrint(stage); // jsdom: the text has no height yet
    expect(stage.style.getPropertyValue("--py")).toBe("");
    document.querySelector(".seat").remove();
    centrePrint(stage);
    expect(stage.style.getPropertyValue("--py")).toBe("");
  });
});
