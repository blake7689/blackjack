import { useRef } from "react";
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { render } from "@testing-library/react";
import { useLight } from "../hooks/useLight";
import { GamePhases } from "../utils/constants/gamePhases";

// The one overhead lamp (#83, DESIGN section 3): the felt's light pool sits mid-table between rounds and follows the hand in play, and the cast shadows of
// the table's objects fall away from the lamp.
function Table({ phase, active = 0 }) {
  const felt = useRef(null);
  const stage = useRef(null);
  useLight(felt, stage, { phase, active });
  return (
    <div ref={felt} className="felt" data-testid="felt">
      <div ref={stage}>
        <div className="dealer-hand" data-testid="dealer" />
        <div className="seats">
          <div className="seat"><div className="hand" data-testid="hand0" /><span className="stack" data-testid="stack0" /></div>
          <div className="seat"><div className="hand" data-testid="hand1" /></div>
        </div>
      </div>
    </div>
  );
}

// jsdom lays nothing out: each element answers with the box the test gives it (the felt is 800 x 600 at the origin).
let boxes = new Map();
const box = (el, left, top, width = 100, height = 100) => boxes.set(el, { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
const zero = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 };
const original = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function getBoundingClientRect() { return boxes.get(this) ?? zero; };
afterEach(() => { boxes = new Map(); });
afterAll(() => { Element.prototype.getBoundingClientRect = original; });

const lay = (screen) => {
  box(screen.getByTestId("felt"), 0, 0, 800, 600);
  box(screen.getByTestId("dealer"), 430, 70); // centre (480, 120)
  box(screen.getByTestId("hand0"), 270, 350); // centre (320, 400)
  box(screen.getByTestId("hand1"), 550, 350); // centre (600, 400)
  box(screen.getByTestId("stack0"), 270, 450); // centre (320, 500)
  const seats = [...screen.getByTestId("felt").querySelectorAll(".seat")];
  box(seats[0], 220, 340, 200, 200); // centre x 320
  box(seats[1], 500, 340, 200, 200); // centre x 600
};
const shadow = (screen, id) => [screen.getByTestId(id).style.getPropertyValue("--shx"), screen.getByTestId(id).style.getPropertyValue("--shy")];
const lamp = (screen) => [screen.getByTestId("felt").style.getPropertyValue("--lx"), screen.getByTestId("felt").style.getPropertyValue("--ly")];

describe("useLight", () => {
  it("sets nothing while the table is not laid out", () => {
    const view = render(<Table phase={GamePhases.PRE_DEAL} />);
    expect(lamp(view)).toEqual(["", ""]);
    expect(shadow(view, "dealer")).toEqual(["", ""]);
  });

  it("between rounds the lamp sits mid-table, and shadows fall away from it", () => {
    const view = render(<Table phase={GamePhases.PRE_DEAL} />);
    lay(view);
    view.rerender(<Table phase={GamePhases.PRE_DEAL} />);
    expect(lamp(view)).toEqual(["50%", "50%"]);
    // the lamp is at x 400, y 288: a card right of it casts to the right (and a little down, more the lower it lies)
    expect(shadow(view, "dealer")).toEqual(["1.0px", "0.8px"]);
    expect(shadow(view, "hand0")).toEqual(["-1.0px", "4.5px"]); // left of the lamp: to the left
    expect(shadow(view, "stack0")).toEqual(["-1.0px", "5.8px"]); // chips get the same
  });

  it("follows the hand in play: the pool goes under that seat, and the shadows swing with it", () => {
    const view = render(<Table phase={GamePhases.PLAYER_TURN} active={1} />);
    lay(view);
    view.rerender(<Table phase={GamePhases.PLAYER_TURN} active={1} />);
    expect(lamp(view)).toEqual(["75.0%", "62%"]); // seat 1's centre (600) of the felt's 800
    expect(shadow(view, "hand1")).toEqual(["0.0px", "4.5px"]); // straight under the lamp: no sideways cast
    expect(shadow(view, "hand0")).toEqual(["-3.5px", "4.5px"]);
    view.rerender(<Table phase={GamePhases.PLAYER_TURN} active={0} />);
    expect(lamp(view)).toEqual(["40.0%", "62%"]);
  });

  it("goes back to the middle when the hand is no longer in play, and with no such seat", () => {
    const view = render(<Table phase={GamePhases.PLAYER_TURN} active={1} />);
    lay(view);
    view.rerender(<Table phase={GamePhases.PLAYER_TURN} active={1} />);
    view.rerender(<Table phase={GamePhases.DEALER_TURN} active={1} />);
    expect(lamp(view)).toEqual(["50%", "50%"]);
    view.rerender(<Table phase={GamePhases.PLAYER_TURN} active={5} />);
    expect(lamp(view)).toEqual(["50%", "50%"]);
  });

  it("with several hands it also follows the one asked at the offers (#59)", () => {
    const view = render(<Table phase={GamePhases.OFFERS} active={1} />);
    lay(view);
    view.rerender(<Table phase={GamePhases.OFFERS} active={1} />);
    expect(lamp(view)).toEqual(["75.0%", "62%"]);
  });

  it("a lamp position the browser cannot read leaves the pool in the middle", () => {
    const spy = vi.spyOn(window, "getComputedStyle").mockReturnValue({ getPropertyValue: () => "" });
    const view = render(<Table phase={GamePhases.PRE_DEAL} />);
    lay(view);
    view.rerender(<Table phase={GamePhases.PRE_DEAL} />);
    expect(shadow(view, "dealer")).toEqual(["1.0px", "0.8px"]);
    spy.mockRestore();
  });
});
