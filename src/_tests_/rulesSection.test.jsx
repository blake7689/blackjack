import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import RulesSection from "../components/RulesSection/RulesSection";
import { RULE_PRESETS } from "../utils/rulePresets";
import { initialGameState } from "../utils/gameReducer";
import { formatEdge, houseEdge } from "../utils/houseEdge";
import { EDGE_NOTE } from "../utils/ruleCatalog";

// The Table rules section on its own (#91, #84): it edits the draft through onApply and must not offer a patch for what is already chosen.
const BASE = { ...initialGameState.settings, ...RULE_PRESETS.Vegas };
const withRules = (patch) => ({ ...BASE, ...patch });
const EU_MODE = { ...BASE, ...RULE_PRESETS.Europe };

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const show = (settings = BASE) => {
  const onApply = vi.fn();
  render(<RulesSection settings={settings} onApply={onApply} />);
  return onApply;
};
const group = (name) => within(screen.getByRole("radiogroup", { name }));
// An option reads "6:5 +1.39% house edge" (the chosen one has no number): match the label with or without it.
const radio = (name, label) => group(name).getByRole("radio", { name: new RegExp(`^${escape(label)}(?:\\s*[+-]\\d+\\.\\d\\d%\\s*house edge)?$`) });
const labels = (name) => group(name).getAllByRole("radio").map((r) => r.firstChild.textContent);
const chosen = (name) => group(name).getByRole("radio", { checked: true }).firstChild.textContent;
const queryGroup = (name) => screen.queryByRole("radiogroup", { name });
const headings = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const queryIn = (...names) => names.map((name) => screen.queryByRole("switch", { name }));

describe("RulesSection", () => {
  it("shows the preset dropdown, the house-edge note and the rules in groups: Shoe, Dealer, Payouts, Doubling, Splitting, Surrender, House variations", () => {
    show();
    expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain("Vegas");
    expect(screen.getByText(EDGE_NOTE)).toBeTruthy();
    expect(headings()).toEqual(["Shoe", "Dealer", "Payouts", "Doubling", "Splitting", "Surrender", "House variations"]); // Advanced has nothing to show under a peek
  });

  it("shows the Vegas values chosen, every rule with exactly one chosen option, and each rule's choices", () => {
    show();
    expect(chosen("Deck size")).toBe("6");
    expect(chosen("Include cut card")).toBe("On");
    expect(chosen("Dealer's second card")).toBe("Peeks");
    expect(chosen("Soft 17")).toBe("Hits");
    expect(chosen("Blackjack pays")).toBe("3:2");
    expect(chosen("Insurance and even money")).toBe("On");
    expect(chosen("Double on")).toBe("Any two cards");
    expect(chosen("Double after a split")).toBe("On");
    expect(chosen("Max hands after splitting")).toBe("4");
    expect(chosen("Deal split hands")).toBe("One at a time");
    expect(chosen("Resplit aces")).toBe("Off");
    expect(chosen("Hit split aces")).toBe("Off");
    expect(chosen("Surrender")).toBe("Late");
    expect(labels("Deck size")).toEqual(["1", "2", "4", "6", "8"]);
    expect(labels("Blackjack pays")).toEqual(["3:2", "6:5"]);
    expect(labels("Double on")).toEqual(["Any two cards", "Hard 9 to 11", "Hard 10 to 11"]);
    expect(labels("Soft 17")).toEqual(["Stands", "Hits"]);
    expect(labels("Max hands after splitting")).toEqual(["2", "3", "4", "Unlimited"]);
    expect(labels("Surrender")).toEqual(["None", "Late", "Early", "Early, not against an ace"]);
    for (const el of screen.getAllByRole("radiogroup")) expect(within(el).getAllByRole("radio", { checked: true }), el.getAttribute("aria-labelledby")).toHaveLength(1);
  });

  it("the House variations are switches, off by default, and none of them says Blakejack", () => {
    show();
    for (const name of ["Blackjack on split", "Triple down", "Always draw the second triple card, even on a bust", "Double down card face down"]) {
      expect(screen.getByRole("switch", { name }), name).toBeTruthy();
    }
    expect(screen.getAllByRole("switch").every((s) => !s.checked)).toBe(true);
    expect(document.body.textContent).not.toMatch(/blakejack/i);
  });

  describe("the preset dropdown", () => {
    it("sends nothing for the chosen preset, and the preset's keys for another", () => {
      const onApply = show();
      fireEvent.click(screen.getByRole("button", { name: /^Preset/ }));
      fireEvent.click(screen.getByRole("option", { name: /^Vegas/ }));
      expect(onApply).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /^Preset/ }));
      fireEvent.click(screen.getByRole("option", { name: /^Atlantic City/ }));
      expect(onApply.mock.calls).toEqual([[RULE_PRESETS["Atlantic City"]]]);
    });

    it("reads Custom for a table that matches no preset, with no preset marked chosen", () => {
      show(withRules({ surrender: "none" }));
      expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain("Custom");
      fireEvent.click(screen.getByRole("button", { name: /^Preset/ }));
      expect(screen.getAllByRole("option")[0].textContent).toContain("Custom");
      expect(screen.getAllByRole("option").filter((o) => o.getAttribute("aria-selected") === "true").map((o) => o.firstChild.textContent)).toEqual(["Custom"]);
    });

    it("a preset that differs only in a rule this mode hides still reads as that preset", () => {
      show(withRules({ dealerDrawsOnPlayerBlackjack: false, noHoleCardLoss: "all" }));
      expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain("Vegas");
    });
  });

  describe("options", () => {
    it("send nothing when the chosen option is clicked, and the option's patch for another", () => {
      const onApply = show();
      fireEvent.click(radio("Deck size", "6"));
      fireEvent.click(radio("Soft 17", "Hits"));
      expect(onApply).not.toHaveBeenCalled();
      fireEvent.click(radio("Deck size", "8"));
      fireEvent.click(radio("Soft 17", "Stands"));
      fireEvent.click(radio("Blackjack pays", "6:5"));
      fireEvent.click(radio("Double on", "Hard 9 to 11"));
      fireEvent.click(radio("Double after a split", "Off"));
      fireEvent.click(radio("Include cut card", "Off"));
      fireEvent.click(radio("Max hands after splitting", "Unlimited"));
      fireEvent.click(radio("Deal split hands", "Both at once"));
      fireEvent.click(radio("Resplit aces", "On"));
      fireEvent.click(radio("Hit split aces", "On"));
      fireEvent.click(radio("Surrender", "Early"));
      fireEvent.click(radio("Insurance and even money", "Off"));
      expect(onApply.mock.calls).toEqual([
        [{ deckCount: 8 }], [{ dealerHitsSoft17: false }], [{ blackjackPayout: "6:5" }], [{ doubleOn: "9-11" }], [{ doubleAfterSplit: false }],
        [{ includeCutCard: false }], [{ maxSplitHands: 0 }], [{ splitDeal: "both" }], [{ resplitAces: true }], [{ hitSplitAces: true }],
        [{ surrender: "early" }], [{ insurance: false }],
      ]);
    });

    it("shows each other option's effect on the house edge, and none on the chosen one", () => {
      show();
      expect(radio("Blackjack pays", "6:5").textContent).toBe("6:5+1.39% house edge");
      expect(radio("Soft 17", "Stands").textContent).toBe("Stands-0.22% house edge");
      expect(radio("Surrender", "Early").textContent).toBe("Early-0.56% house edge");
      expect(radio("Blackjack pays", "3:2").textContent).toBe("3:2");
      expect(radio("Insurance and even money", "Off").textContent).toBe("Off"); // insurance is not counted
    });

    it("a saved 3, 5 or 7 decks shows as one extra chosen option", () => {
      show(withRules({ deckCount: 5 }));
      expect(labels("Deck size")).toEqual(["1", "2", "4", "5 decks", "6", "8"]);
      expect(chosen("Deck size")).toBe("5 decks");
    });

    it("sentence-case labels, with the hand as blackjack", () => {
      show(withRules({ dealerHoleBehaviour: "drawAfter" }));
      for (const name of ["Dealer's second card", "If the dealer has blackjack, you lose", "Blackjack pays", "Max hands after splitting", "Double after a split"]) {
        expect(screen.getByRole("radiogroup", { name }), name).toBeTruthy();
      }
    });
  });

  describe("the dealer's second card is one three-way choice: Peeks, No peek, No second card", () => {
    it.each([["drawEarly_Check", "Peeks"], ["drawEarly_NoCheck", "No peek"], ["drawAfter", "No second card"]])("%s shows %s chosen", (mode, label) => {
      show(withRules({ dealerHoleBehaviour: mode }));
      expect(labels("Dealer's second card")).toEqual(["Peeks", "No peek", "No second card"]);
      expect(chosen("Dealer's second card")).toBe(label);
    });

    it("each choice writes the mode and pairs when a blackjack pays (at once only with a peek)", () => {
      const onApply = show();
      fireEvent.click(radio("Dealer's second card", "No peek"));
      fireEvent.click(radio("Dealer's second card", "No second card"));
      expect(onApply.mock.calls).toEqual([
        [{ dealerHoleBehaviour: "drawEarly_NoCheck", blackjackPaysImmediately: false }],
        [{ dealerHoleBehaviour: "drawAfter", blackjackPaysImmediately: false }],
      ]);
      const back = show(withRules({ ...EU_MODE, blackjackPaysImmediately: false }));
      fireEvent.click(screen.getAllByRole("radio", { name: /^Peeks/ })[1]);
      expect(back.mock.calls).toEqual([[{ dealerHoleBehaviour: "drawEarly_Check", blackjackPaysImmediately: true }]]);
    });

    it("a timing set on purpose is kept when the mode changes", () => {
      const onApply = show(withRules({ blackjackPaysImmediately: false }));
      fireEvent.click(radio("Dealer's second card", "No second card"));
      expect(onApply.mock.calls).toEqual([[{ dealerHoleBehaviour: "drawAfter" }]]);
    });
  });

  describe("rules appear only in the modes they matter in", () => {
    it("a peek hides 'If the dealer has blackjack, you lose', Blackjack pays immediately and the three EU toggles; no Advanced heading", () => {
      show();
      expect(queryGroup("If the dealer has blackjack, you lose")).toBeNull();
      expect(queryIn("Blackjack pays immediately", "Dealer draws 2nd card on a player blackjack", "Dealer draws only once against a 21", "Dealer draws 2nd card after a player bust")).toEqual([null, null, null, null]);
      expect(headings()).not.toContain("Advanced");
    });

    it("no peek shows the dealer-blackjack loss and Blackjack pays immediately, and hides the EU toggles", () => {
      show(withRules({ dealerHoleBehaviour: "drawEarly_NoCheck", blackjackPaysImmediately: false }));
      expect(chosen("If the dealer has blackjack, you lose")).toBe("Only your first bet");
      expect(labels("If the dealer has blackjack, you lose")).toEqual(["Everything you staked", "Only your first bet"]);
      expect(screen.getByRole("switch", { name: "Blackjack pays immediately" })).toBeTruthy();
      expect(queryIn("Dealer draws 2nd card on a player blackjack", "Dealer draws only once against a 21", "Dealer draws 2nd card after a player bust")).toEqual([null, null, null]);
      expect(headings()).toContain("Advanced");
    });

    it("no second card shows all of them, without an 'EU:' prefix", () => {
      show(EU_MODE);
      for (const name of ["Dealer draws 2nd card on a player blackjack", "Blackjack pays immediately", "Dealer draws only once against a 21", "Dealer draws 2nd card after a player bust"]) {
        expect(screen.getByRole("switch", { name }), name).toBeTruthy();
      }
      expect(screen.getByRole("radiogroup", { name: "If the dealer has blackjack, you lose" })).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/EU:/);
    });

    it("Resplit aces is hidden when only two hands are allowed, and shown with more", () => {
      const { rerender } = render(<RulesSection settings={withRules({ maxSplitHands: 2 })} onApply={() => {}} />);
      expect(queryGroup("Resplit aces")).toBeNull();
      rerender(<RulesSection settings={withRules({ maxSplitHands: 3 })} onApply={() => {}} />);
      expect(queryGroup("Resplit aces")).toBeTruthy();
    });
  });

  describe("switches", () => {
    it("write their own key, and the always-draw switch is disabled (still focusable) until Triple down is on", () => {
      const onApply = show();
      const draws = screen.getByRole("switch", { name: "Always draw the second triple card, even on a bust" });
      expect(draws.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(draws);
      expect(onApply).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("switch", { name: "Triple down" }));
      fireEvent.click(screen.getByRole("switch", { name: "Blackjack on split" }));
      fireEvent.click(screen.getByRole("switch", { name: "Double down card face down" }));
      expect(onApply.mock.calls).toEqual([[{ tripleDown: true }], [{ blackJackOnSplit: true }], [{ doubleFaceDown: true }]]);
    });

    it("show the always-draw setting unticked while Triple down is off, ticked once it is on", () => {
      const { rerender } = render(<RulesSection settings={withRules({ tripleDrawsOnBust: true })} onApply={() => {}} />);
      const draws = () => screen.getByRole("switch", { name: "Always draw the second triple card, even on a bust" });
      expect(draws().checked).toBe(false);
      rerender(<RulesSection settings={withRules({ tripleDrawsOnBust: true, tripleDown: true })} onApply={() => {}} />);
      expect([draws().checked, draws().getAttribute("aria-disabled")]).toEqual([true, null]);
    });

    it("Blackjack pays immediately is forced on, and cannot be changed, when the dealer takes no card against a blackjack", () => {
      const onApply = show(withRules({ ...EU_MODE, dealerDrawsOnPlayerBlackjack: false }));
      const pays = screen.getByRole("switch", { name: "Blackjack pays immediately" });
      expect([pays.checked, pays.getAttribute("aria-disabled")]).toEqual([true, "true"]);
      fireEvent.click(pays);
      expect(onApply).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("switch", { name: "Dealer draws 2nd card on a player blackjack" }));
      expect(onApply.mock.calls).toEqual([[{ dealerDrawsOnPlayerBlackjack: true }]]);
    });
  });

  describe("hints", () => {
    it("every radio group and switch is described by its short hint, in the same words as the 'i'", () => {
      show(EU_MODE);
      const controls = [...screen.getAllByRole("radiogroup"), ...screen.getAllByRole("switch")];
      expect(controls.length).toBeGreaterThan(20);
      for (const control of controls) {
        const id = control.getAttribute("aria-describedby");
        expect(id, control.outerHTML).toMatch(/^hd-/);
        const text = document.getElementById(id).textContent;
        expect(text.length).toBeGreaterThan(3);
        const mark = document.querySelector(`.hint-i[data-for="${id}"]`);
        expect(mark.dataset.hint).toBe(text);
        expect(mark.getAttribute("aria-hidden")).toBe("true");
      }
    });
  });

  it("shows the house edge of the draft on the dropdown", () => {
    show(withRules({ blackjackPayout: "6:5" }));
    expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain(formatEdge(houseEdge(withRules({ blackjackPayout: "6:5" }))));
  });
});
