import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import ConfirmDialog from "../components/SettingsControls/ConfirmDialog";
import { HintLayer, HintI, HintText, Section, Group, Row, Radio, Switch, Slider } from "../components/SettingsControls/Controls";

// The Settings page's building blocks (#84, DESIGN section 5), on their own.
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Two switches, each followed by an "i" inside its label, so a tap on the "i" must never toggle the switch.
function Hints({ onChange = () => {} }) {
  return (
    <HintLayer className="screen">
      <Switch id="a" label="Alpha" hint="Hint for alpha" checked={false} onChange={onChange} />
      <Switch id="b" label="Beta" hint="Hint for beta" checked={false} onChange={onChange} />
      <Switch id="c" label="Gamma" checked={false} onChange={onChange} />
      <button type="button">Elsewhere</button>
    </HintLayer>
  );
}
const mark = (id) => document.querySelector(`.hint-i[data-for="hd-${id}"]`);
const tip = () => document.querySelector(".hint-tip");
const rect = (r) => vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, right: 0, width: 0, height: 0, top: 0, bottom: 0, ...r });

describe("HintLayer, HintI and HintText", () => {
  it("a click on the 'i' shows its hint above it, never toggles the control, and hides after 2.6 s", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    rect({ left: 300, width: 18, top: 200, bottom: 218 });
    render(<Hints onChange={onChange} />);
    fireEvent.click(mark("a"));
    expect(onChange).not.toHaveBeenCalled();
    expect(tip().textContent).toBe("Hint for alpha");
    expect(tip().getAttribute("aria-hidden")).toBe("true");
    expect(tip().classList.contains("below")).toBe(false);
    expect(tip().style.top).toBe("194px");
    expect(tip().style.left).toBe("309px");
    act(() => { vi.advanceTimersByTime(2599); });
    expect(tip()).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(tip()).toBeNull();
  });

  it("a second tap on the same 'i' hides it; a tap on another 'i' moves it; a tap elsewhere hides it, and a tap with no tip showing does nothing", () => {
    rect({ left: 300, width: 18, top: 200, bottom: 218 });
    render(<Hints />);
    fireEvent.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(tip()).toBeNull();
    fireEvent.click(mark("a"));
    fireEvent.click(mark("a"));
    expect(tip()).toBeNull();
    fireEvent.click(mark("a"));
    fireEvent.click(mark("b"));
    expect(tip().textContent).toBe("Hint for beta");
    fireEvent.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(tip()).toBeNull();
  });

  it("shows the hint under the 'i' when there is no room above it, and keeps the bubble on screen at both edges", () => {
    const spy = rect({ left: 0, width: 18, top: 10, bottom: 28 });
    render(<Hints />);
    fireEvent.click(mark("a"));
    expect(tip().classList.contains("below")).toBe(true);
    expect(tip().style.top).toBe("34px");
    expect(tip().style.left).toBe("168px"); // 8 + half of the 320 px bubble
    fireEvent.click(mark("a"));
    spy.mockReturnValue({ left: 1100, width: 18, top: 300, bottom: 318 });
    fireEvent.click(mark("a"));
    expect(tip().style.left).toBe("856px"); // 1024 - 8 - 160
  });

  it("a mouse resting on the 'i' for 250 ms shows the hint, and leaving hides it; a touch pointer does not hover", () => {
    vi.useFakeTimers();
    rect({ left: 300, width: 18, top: 200, bottom: 218 });
    render(<Hints />);
    fireEvent.pointerOver(mark("a"), { pointerType: "touch" });
    act(() => { vi.advanceTimersByTime(400); });
    expect(tip()).toBeNull();
    fireEvent.pointerOver(mark("a"), { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(249); });
    expect(tip()).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(tip().textContent).toBe("Hint for alpha");
    fireEvent.pointerOut(mark("a"), { pointerType: "touch" });
    expect(tip()).toBeTruthy();
    fireEvent.pointerOut(mark("a"), { pointerType: "mouse" });
    expect(tip()).toBeNull();
    // Passing over something that is not an "i" does nothing.
    fireEvent.pointerOver(screen.getByRole("button", { name: "Elsewhere" }), { pointerType: "mouse" });
    fireEvent.pointerOut(screen.getByRole("button", { name: "Elsewhere" }), { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(400); });
    expect(tip()).toBeNull();
  });

  it("keyboard focus on a control shows its hint; focus on one with no hint, or by the mouse, hides it", () => {
    rect({ left: 300, width: 18, top: 200, bottom: 218 });
    render(<Hints />);
    const matches = Element.prototype.matches;
    let ring = true; // jsdom has no focus ring: say whether the focus came from the keyboard
    vi.spyOn(Element.prototype, "matches").mockImplementation(function focusVisible(selector) {
      return selector === ":focus-visible" ? ring : matches.call(this, selector);
    });
    act(() => { screen.getByRole("switch", { name: "Alpha" }).focus(); });
    expect(tip().textContent).toBe("Hint for alpha");
    act(() => { screen.getByRole("switch", { name: "Gamma" }).focus(); });
    expect(tip()).toBeNull();
    act(() => { screen.getByRole("switch", { name: "Beta" }).focus(); });
    expect(tip().textContent).toBe("Hint for beta");
    ring = false; // a click focuses without the ring
    act(() => { screen.getByRole("switch", { name: "Alpha" }).focus(); });
    expect(tip()).toBeNull();
    act(() => { screen.getByRole("switch", { name: "Beta" }).focus(); });
    act(() => { screen.getByRole("switch", { name: "Beta" }).blur(); });
    expect(tip()).toBeNull();
  });

  it("any scroll hides the bubble, and the listener goes with it", () => {
    rect({ left: 300, width: 18, top: 200, bottom: 218 });
    const remove = vi.spyOn(document, "removeEventListener");
    render(<Hints />);
    fireEvent.click(mark("a"));
    fireEvent.scroll(document.body);
    expect(tip()).toBeNull();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true });
  });

  it("an unmounted layer leaves no timer behind", () => {
    vi.useFakeTimers();
    rect({ left: 300, width: 18, top: 200, bottom: 218 });
    const { unmount } = render(<Hints />);
    fireEvent.click(mark("a"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the 'i' is aria-hidden and the same words are the control's accessible description; no hint, no 'i' and no description", () => {
    render(<Hints />);
    expect(mark("a").getAttribute("aria-hidden")).toBe("true");
    expect(mark("a").textContent).toBe("i");
    expect(screen.getByRole("switch", { name: "Alpha" }).getAttribute("aria-describedby")).toBe("hd-a");
    expect(document.getElementById("hd-a").textContent).toBe("Hint for alpha");
    expect(screen.getByRole("switch", { name: "Gamma" }).hasAttribute("aria-describedby")).toBe(false);
    expect(mark("c")).toBeNull();
    const { container } = render(<><HintI id="x" text="" /><HintText id="x" text="" /></>);
    expect(container.textContent).toBe("");
  });
});

describe("Section and Group", () => {
  const section = (props) => render(<Section id="rules" title="Table rules" summary="Vegas · 0.6% house edge" open={false} onToggle={() => {}} {...props}><p>Body</p></Section>);

  it("a section is a button in an h2, closed or open, naming itself and its summary, and controlling its body", () => {
    section({});
    const button = screen.getByRole("button", { name: /^Table rules/ });
    expect(button.closest("h2")).toBeTruthy();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.textContent).toContain("Vegas · 0.6% house edge");
    expect(button.getAttribute("aria-controls")).toBe("sec-rules-b");
    expect(document.getElementById("sec-rules-b").hidden).toBe(true);
    expect(screen.queryByRole("region", { name: /Table rules/ })).toBeNull(); // hidden while closed
  });

  it("opens: aria-expanded true and the body shown as a region named by the header", () => {
    const onToggle = vi.fn();
    section({ open: true, onToggle });
    expect(screen.getByRole("button", { name: /^Table rules/ }).getAttribute("aria-expanded")).toBe("true");
    expect(within(screen.getByRole("region", { name: /Table rules/ })).getByText("Body")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Table rules/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows no dot when there are no unsaved changes", () => {
    section({});
    expect(document.querySelector(".sec-dot")).toBeNull();
    expect(screen.queryByRole("button", { name: /unsaved changes/ })).toBeNull();
  });

  it("marks unsaved changes with a dot that a screen reader hears", () => {
    section({ dirty: true });
    expect(screen.getByRole("button", { name: /Table rules, unsaved changes/ })).toBeTruthy();
    expect(document.querySelector(".sec-dot")).toBeTruthy();
  });

  it("a group shows its heading and its children, and nothing when it has nothing to show", () => {
    const { container } = render(<><Group title="Shoe"><p>One</p>{false}{null}</Group><Group title="Empty">{false}</Group><Group title="Also empty">{[null, false]}</Group></>);
    expect(screen.getByRole("heading", { level: 3, name: "Shoe" })).toBeTruthy();
    expect(screen.getByText("One")).toBeTruthy();
    expect(container.querySelectorAll("h3")).toHaveLength(1);
  });
});

describe("Row, Radio, Switch and Slider", () => {
  it("a row is a radiogroup named by its label, with Radio buttons that say whether they are checked", () => {
    const onClick = vi.fn();
    render(<Row id="mode" label="Mode" hint="How it looks"><Radio checked onClick={onClick}>Dark</Radio><Radio checked={false}>Light</Radio></Row>);
    const group = screen.getByRole("radiogroup", { name: "Mode" });
    expect(group.getAttribute("aria-describedby")).toBe("hd-mode");
    expect(within(group).getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
    expect(within(group).getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(within(group).getByRole("radio", { name: "Dark" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("a row can be another role, take a class and a layout, and go without a hint", () => {
    const { container } = render(<Row id="chips" label="Chips" role="group" className="chip-pick" layout="block"><button type="button">x</button></Row>);
    const group = screen.getByRole("group", { name: "Chips" });
    expect(group.className).toBe("chip-pick");
    expect(group.hasAttribute("aria-describedby")).toBe(false);
    expect(container.firstChild.className).toBe("rrow block");
  });

  it("a row by default is a radiogroup with the seg class and no layout", () => {
    const { container } = render(<Row id="plain" label="Plain" />);
    expect(container.firstChild.className).toBe("rrow");
    expect(screen.getByRole("radiogroup", { name: "Plain" }).className).toBe("seg");
  });

  it("a switch is a real label around a checkbox with the switch role, with its subtitle", () => {
    const onChange = vi.fn();
    render(<Switch id="t" label="Show hand totals" sub="Yours and the dealer's" hint="Totals on the table" checked={false} onChange={onChange} />);
    const input = screen.getByRole("switch", { name: /^Show hand totals/ });
    expect(input.closest("label").textContent).toContain("Yours and the dealer's");
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("a disabled switch stays focusable and described, and never calls onChange", () => {
    const onChange = vi.fn();
    render(<Switch id="t" label="Locked" hint="Cannot change" checked disabled onChange={onChange} />);
    const input = screen.getByRole("switch", { name: "Locked" });
    expect(input.getAttribute("aria-disabled")).toBe("true");
    expect(input.disabled).toBe(false);
    expect(input.closest("label").classList.contains("off")).toBe(true);
    fireEvent.click(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a slider has a real label, a live value and a range input described by its hint", () => {
    const onChange = vi.fn();
    render(<Slider id="d" label="Auto deal delay" hint="Pause before auto deal" min={0} max={10000} step={500} value={2500} text="2.5 s" onChange={onChange} />);
    const input = screen.getByRole("slider", { name: "Auto deal delay" });
    expect(input.getAttribute("aria-describedby")).toBe("hd-d");
    expect(input.style.getPropertyValue("--pct")).toBe("25%");
    expect(screen.getByText("2.5 s").tagName).toBe("OUTPUT");
    expect(document.querySelector(".stops")).toBeNull();
    fireEvent.change(input, { target: { value: "5000" } });
    expect(onChange).toHaveBeenCalledWith(5000);
  });

  it("a slider with stops names them under the track (aria-hidden), the current one on, and the tail at the end", () => {
    const stops = [[250, "Very fast", 0], [500, "Fast", 250]];
    render(<Slider id="s" label="Game speed" min={0} max={1000} step={1} value={250} text="Fast" stops={stops} tail="5 s" current="Fast" onChange={() => {}} />);
    const row = document.querySelector(".stops");
    expect(row.getAttribute("aria-hidden")).toBe("true");
    expect([...row.children].map((c) => [c.textContent, c.className, c.style.left])).toEqual([
      ["Very fast", "first ", "0%"], ["Fast", "on", "25%"], ["5 s", "last", "100%"],
    ]);
    expect(screen.getByRole("slider", { name: "Game speed" }).hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("ConfirmDialog", () => {
  function Host({ onSafe = () => {}, onDanger = () => {} }) {
    const [shown, setShown] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setShown(true)}>Open</button>
        {shown && <ConfirmDialog title="Delete profile?" body="This cannot be undone." safe="Keep my profile" danger="Delete for good" onSafe={() => { onSafe(); setShown(false); }} onDanger={onDanger} />}
      </>
    );
  }
  const open = (props) => {
    render(<Host {...props} />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    return opener;
  };

  it("is a modal dialog named by its title and described by its body, in the document body", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Delete profile?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBe(document.getElementById(dialog.getAttribute("aria-describedby")).id);
    expect(document.getElementById(dialog.getAttribute("aria-describedby")).textContent).toBe("This cannot be undone.");
    expect(dialog.closest(".dlg-overlay").parentElement).toBe(document.body);
  });

  it("puts the safe button first, focused, and the danger button last as an outline", () => {
    open();
    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Keep my profile", "Delete for good"]);
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[1].classList.contains("danger-o")).toBe(true);
  });

  it("each button calls its own handler", () => {
    const onSafe = vi.fn();
    const onDanger = vi.fn();
    open({ onSafe, onDanger });
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
    expect(onDanger).toHaveBeenCalledTimes(1);
    expect(onSafe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep my profile" }));
    expect(onSafe).toHaveBeenCalledTimes(1);
  });

  it("Escape is the safe answer; other keys do nothing", () => {
    const onSafe = vi.fn();
    open({ onSafe });
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "a" });
    expect(onSafe).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onSafe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Tab stays inside: from the last button it wraps to the first, and Shift+Tab from the first wraps to the last", () => {
    open();
    const [safe, danger] = within(screen.getByRole("dialog")).getAllByRole("button");
    danger.focus();
    const forward = fireEvent.keyDown(document, { key: "Tab" });
    expect(forward).toBe(false); // prevented
    expect(document.activeElement).toBe(safe);
    const back = fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(back).toBe(false);
    expect(document.activeElement).toBe(danger);
    // In the middle of the dialog the browser moves focus by itself.
    safe.focus();
    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(true);
    danger.focus();
    expect(fireEvent.keyDown(document, { key: "Tab", shiftKey: true })).toBe(true);
  });

  it("puts focus back where it was when it closes, and stops listening", () => {
    const opener = open();
    expect(document.activeElement).not.toBe(opener);
    fireEvent.click(screen.getByRole("button", { name: "Keep my profile" }));
    expect(document.activeElement).toBe(opener);
    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(true); // no trap left behind
  });

  it("Escape calls the newest onSafe, not the first one", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<ConfirmDialog title="T" body="B" safe="S" danger="D" onSafe={first} onDanger={() => {}} />);
    rerender(<ConfirmDialog title="T" body="B" safe="S" danger="D" onSafe={second} onDanger={() => {}} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
