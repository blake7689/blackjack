import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PresetDropdown from "../components/SettingsControls/PresetDropdown";
import { RULE_PRESETS } from "../utils/rulePresets";
import { houseEdge, formatEdge } from "../utils/houseEdge";
import { initialGameState } from "../utils/gameReducer";

// The preset dropdown (#84): a button with the preset and its house edge, a listbox of the five presets with theirs, "Custom" heading the list
// while a rule is edited, and full keyboard support.
const NAMES = ["Vegas", "Atlantic City", "Europe", "Australia", "Singapore"];
const CUSTOM_SETTINGS = { ...RULE_PRESETS.Vegas, surrender: "none" };

function show(settings = RULE_PRESETS.Vegas) {
  const onPick = vi.fn();
  render(<PresetDropdown settings={settings} onPick={onPick} />);
  return onPick;
}
const button = () => screen.getByRole("button", { name: /^Preset/ });
const openList = () => { fireEvent.click(button()); return screen.getByRole("listbox"); };
const optionNames = () => screen.getAllByRole("option").map((o) => o.firstChild.textContent);
const active = () => document.getElementById(screen.getByRole("listbox").getAttribute("aria-activedescendant")).textContent;
const key = (k) => fireEvent.keyDown(screen.getByRole("listbox"), { key: k });

describe("PresetDropdown", () => {
  it("is a closed button naming the preset with its house edge", () => {
    show();
    expect(button().textContent).toContain("Vegas");
    expect(button().textContent).toContain(`${formatEdge(houseEdge(RULE_PRESETS.Vegas))} house edge`);
    expect(button().getAttribute("aria-haspopup")).toBe("listbox");
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens a listbox of the five presets, each with its house edge, the current one selected and active, focus in the list", () => {
    show({ ...initialGameState.settings, ...RULE_PRESETS.Europe });
    const list = openList();
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(list);
    expect(optionNames()).toEqual(NAMES);
    for (const option of screen.getAllByRole("option")) {
      const name = option.querySelector(".po-n").textContent;
      expect(option.querySelector(".po-e").textContent, name).toBe(formatEdge(houseEdge(RULE_PRESETS[name])));
      expect(option.getAttribute("aria-selected"), name).toBe(String(name === "Europe"));
    }
    expect(active()).toContain("Europe");
    expect(screen.queryByRole("option", { name: /Custom/ })).toBeNull();
  });

  it("reads 'Custom' with this table's edge while a rule is edited: Custom heads the list as a state that cannot be chosen", () => {
    const onPick = show(CUSTOM_SETTINGS);
    expect(button().textContent).toContain("Custom");
    expect(button().textContent).toContain(formatEdge(houseEdge(CUSTOM_SETTINGS)));
    openList();
    expect(optionNames()).toEqual(["Custom", ...NAMES]);
    const custom = screen.getAllByRole("option")[0];
    expect(custom.getAttribute("aria-disabled")).toBe("true");
    expect(custom.getAttribute("aria-selected")).toBe("true");
    expect(custom.hasAttribute("data-preset")).toBe(false);
    fireEvent.mouseMove(custom);
    expect(active()).toContain("Custom");
    fireEvent.click(custom);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull(); // it closes, nothing is chosen
  });

  it("clicking a preset picks it with its rules and closes; the chosen preset picks nothing", () => {
    const onPick = show();
    openList();
    fireEvent.click(screen.getByRole("option", { name: /^Vegas/ }));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(button());
    openList();
    fireEvent.click(screen.getByRole("option", { name: /^Atlantic City/ }));
    expect(onPick.mock.calls).toEqual([[RULE_PRESETS["Atlantic City"]]]);
    expect(document.activeElement).toBe(button());
  });

  it("every option carries data-preset, and a title with the preset's rules", () => {
    show();
    openList();
    expect(screen.getAllByRole("option").map((o) => o.dataset.preset)).toEqual(NAMES);
    expect(screen.getByRole("option", { name: /^Vegas/ }).title).toContain("6 decks");
  });

  it("the arrows, Home and End move the active option and stop at the ends", () => {
    show();
    openList();
    expect(active()).toContain("Vegas");
    key("ArrowUp");
    expect(active()).toContain("Vegas");
    key("ArrowDown");
    key("ArrowDown");
    expect(active()).toContain("Europe");
    key("End");
    expect(active()).toContain("Singapore");
    key("ArrowDown");
    expect(active()).toContain("Singapore");
    key("ArrowUp");
    expect(active()).toContain("Australia");
    key("Home");
    expect(active()).toContain("Vegas");
  });

  it("Enter and Space pick the active option; picking the chosen one does nothing", () => {
    const onPick = show();
    openList();
    key("Enter");
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    openList();
    key("ArrowDown");
    key("Enter");
    expect(onPick.mock.calls).toEqual([[RULE_PRESETS["Atlantic City"]]]);
    openList();
    key("End");
    key(" ");
    expect(onPick.mock.calls[1]).toEqual([RULE_PRESETS.Singapore]);
  });

  it("a letter jumps to the preset that starts with it (the first one for an unmatched letter), other keys do nothing", () => {
    show();
    openList();
    key("s");
    expect(active()).toContain("Singapore");
    key("A");
    expect(active()).toContain("Atlantic City");
    key("z");
    expect(active()).toContain("Vegas");
    key("3");
    key("F2");
    expect(active()).toContain("Vegas");
  });

  it("from Custom the arrows start at the first preset, and Enter on Custom picks nothing", () => {
    const onPick = show(CUSTOM_SETTINGS);
    openList();
    key("ArrowUp");
    expect(active()).toContain("Vegas");
    cleanupList();
    openList();
    key("ArrowDown");
    expect(active()).toContain("Vegas");
    cleanupList();
    openList();
    key("Enter");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("Escape closes the list and puts focus back on the button; Tab closes it and lets focus move on", () => {
    show();
    openList();
    key("Escape");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(button());
    openList();
    key("Tab");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).not.toBe(button());
  });

  it("the button opens on ArrowDown, ArrowUp, Enter and Space, ignores other keys, and a second click closes the list", () => {
    show();
    for (const k of ["ArrowDown", "ArrowUp", "Enter", " "]) {
      fireEvent.keyDown(button(), { key: k });
      expect(screen.getByRole("listbox"), k).toBeTruthy();
      fireEvent.click(button());
      expect(screen.queryByRole("listbox"), k).toBeNull();
    }
    fireEvent.keyDown(button(), { key: "Tab" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("a press outside the dropdown closes the list; a press inside does not", () => {
    show();
    openList();
    fireEvent.mouseDown(screen.getByRole("listbox"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("hovering an option makes it the active one", () => {
    show();
    openList();
    fireEvent.mouseMove(screen.getByRole("option", { name: /^Australia/ }));
    expect(active()).toContain("Australia");
  });
});

// Closes the open list so the next step starts from the button again (Escape is the keyboard way).
function cleanupList() {
  key("Escape");
}
