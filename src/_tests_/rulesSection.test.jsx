import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import RulesSection from "../components/RulesSection/RulesSection";
import { RULE_PRESETS } from "../utils/rulePresets";

// The section on its own (#91): it must not offer a patch for what is already chosen, whatever Settings does with it.
describe("RulesSection", () => {
  const show = (settings = RULE_PRESETS.Vegas) => {
    const onApply = vi.fn();
    render(<RulesSection settings={settings} onApply={onApply} />);
    return onApply;
  };
  const tiles = () => within(screen.getByRole("group", { name: "Table rules" })).getAllByRole("button");

  it("sends nothing when the chosen tile is clicked, and the preset's keys for another tile", () => {
    const onApply = show();
    const [vegas, atlantic] = tiles();
    expect(vegas.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(vegas);
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(atlantic);
    expect(onApply.mock.calls).toEqual([[RULE_PRESETS["Atlantic City"]]]);
  });

  it("sends nothing when the chosen option is clicked, and the option's patch for another", () => {
    const onApply = show();
    const deck = within(screen.getByRole("group", { name: "Deck size: 6" })).getAllByRole("button");
    fireEvent.click(deck.find((b) => b.getAttribute("aria-pressed") === "true"));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(deck.find((b) => b.firstChild.textContent === "8"));
    expect(onApply.mock.calls).toEqual([[{ deckCount: 8 }]]);
  });

  it("shows the Custom tile instead of a pressed tile for a table that matches no preset", () => {
    show({ ...RULE_PRESETS.Vegas, surrender: "none" });
    expect(tiles().some((t) => t.getAttribute("aria-pressed") === "true")).toBe(false);
    expect(document.querySelector("[aria-current='true']").textContent).toContain("Custom");
  });
});
