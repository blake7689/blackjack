import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderUI } from "./testUtils";
import RulesSheet from "../components/RulesSheet/RulesSheet";
import { initialGameState } from "../utils/gameReducer";
import { RULE_PRESETS } from "../utils/rulePresets";
import { houseEdge, formatEdge } from "../utils/houseEdge";
import { sheetGroups } from "../utils/ruleCatalog";

// The Table rules sheet (#87, DESIGN section 5).
const settings = initialGameState.settings;
const sheet = () => screen.getByRole("dialog", { name: "Table rules" });
const closeButton = () => within(sheet()).getByRole("button", { name: "Close" });

// A page with the button that opens the sheet, so focus return can be seen.
function Opener({ rules = settings }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open rules</button>
      {open && <RulesSheet settings={rules} onClose={() => setOpen(false)} />}
    </>
  );
}

describe("RulesSheet", () => {
  it("is a modal dialog named Table rules, in a portal on the body, with Close focused", () => {
    const { container } = renderUI(<RulesSheet settings={settings} onClose={() => {}} />);
    expect(sheet().getAttribute("aria-modal")).toBe("true");
    expect(container.contains(sheet())).toBe(false);
    expect(document.body.contains(sheet())).toBe(true);
    expect(screen.getByRole("heading", { level: 2, name: "Table rules" })).toBeTruthy();
    expect(document.activeElement).toBe(closeButton());
  });

  it("shows the preset, its house edge estimate, and every group the catalog writes for these settings", () => {
    renderUI(<RulesSheet settings={settings} onClose={() => {}} />);
    expect(within(sheet()).getByText("Vegas")).toBeTruthy();
    expect(within(sheet()).getByText(formatEdge(houseEdge(settings)))).toBeTruthy();
    for (const { title, items } of sheetGroups(settings)) {
      expect(within(sheet()).getByRole("heading", { level: 3, name: title })).toBeTruthy();
      for (const item of items) expect(within(sheet()).getByText(item)).toBeTruthy();
    }
  });

  it("follows the settings: another preset shows its own name, edge and lines; changed rules read Custom", () => {
    const europe = { ...settings, ...RULE_PRESETS.Europe };
    const view = renderUI(<RulesSheet settings={europe} onClose={() => {}} />);
    expect(within(sheet()).getByText("Europe")).toBeTruthy();
    expect(within(sheet()).getByText(formatEdge(houseEdge(europe)))).toBeTruthy();
    expect(within(sheet()).getByText("Split any number of hands")).toBeTruthy();
    view.unmount();
    renderUI(<RulesSheet settings={{ ...settings, deckCount: 3 }} onClose={() => {}} />);
    expect(within(sheet()).getByText("Custom")).toBeTruthy();
    expect(within(sheet()).getByText("3 decks in the shoe")).toBeTruthy();
  });

  it("never writes the brand word in a rule", () => {
    renderUI(<RulesSheet settings={settings} onClose={() => {}} />);
    expect(sheet().textContent).not.toMatch(/blakejack/i);
  });

  it("Close, Escape and a tap on the backdrop close it; a tap inside does not", () => {
    const onClose = vi.fn();
    renderUI(<RulesSheet settings={settings} onClose={onClose} />);
    fireEvent.click(sheet());
    fireEvent.click(screen.getByRole("heading", { name: "Table rules" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(sheet().parentElement); // the overlay
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("Escape calls the latest onClose, not the first one", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = renderUI(<RulesSheet settings={settings} onClose={first} />);
    view.rerender(<RulesSheet settings={settings} onClose={second} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("puts focus back on the button that opened it, and stops listening, once closed", () => {
    renderUI(<Opener />);
    const opener = screen.getByRole("button", { name: "Open rules" });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(closeButton());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    fireEvent.keyDown(document, { key: "Escape" }); // no listener left: nothing throws
  });

  it("focus returns after Close too, and after a backdrop tap", () => {
    renderUI(<Opener />);
    const opener = screen.getByRole("button", { name: "Open rules" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(closeButton());
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    fireEvent.click(sheet().parentElement);
    expect(document.activeElement).toBe(opener);
  });

  describe("Change rules", () => {
    it("is a link to Settings' Table rules section for a signed-in player", () => {
      renderUI(<RulesSheet settings={settings} onClose={() => {}} />);
      expect(within(sheet()).getByRole("link", { name: "Change rules" }).getAttribute("href")).toBe("/settings#rules");
    });

    it("is not there for a visitor", () => {
      renderUI(<RulesSheet settings={settings} onClose={() => {}} />, { player: { player: null } });
      expect(within(sheet()).queryByRole("link", { name: "Change rules" })).toBeNull();
    });
  });

  describe("the Tab trap", () => {
    it("signed in: Tab from the last control (Change rules) wraps to Close, Shift+Tab from Close wraps to Change rules", () => {
      renderUI(<RulesSheet settings={settings} onClose={() => {}} />);
      const link = within(sheet()).getByRole("link", { name: "Change rules" });
      link.focus();
      const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      document.dispatchEvent(forward);
      expect(forward.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(closeButton());
      const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(back);
      expect(back.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(link);
    });

    it("leaves Tab alone in the middle of the sheet (the browser moves focus), and ignores other keys", () => {
      renderUI(<RulesSheet settings={settings} onClose={() => {}} />);
      const middle = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      closeButton().focus();
      document.dispatchEvent(middle); // Close is first, not last: Tab goes on to the link
      expect(middle.defaultPrevented).toBe(false);
      const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
      document.dispatchEvent(other);
      expect(other.defaultPrevented).toBe(false);
    });

    it("a visitor's sheet has one control: Tab and Shift+Tab both stay on Close", () => {
      renderUI(<RulesSheet settings={settings} onClose={() => {}} />, { player: { player: null } });
      for (const shiftKey of [false, true]) {
        const tab = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
        document.dispatchEvent(tab);
        expect(tab.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(closeButton());
      }
    });
  });
});
