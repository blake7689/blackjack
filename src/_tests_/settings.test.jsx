import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act, cleanup, within } from "@testing-library/react";
import { renderUI, testPlayer, NavButtons } from "./testUtils";
import { scrolls } from "./setup";
import { useNavigate } from "react-router-dom";
import Settings from "../pages/Settings";
import { GamePhases } from "../utils/constants/gamePhases";
import { RULE_PRESETS } from "../utils/rulePresets";
import { initialGameState } from "../utils/gameReducer";
import { leaveGuard } from "../utils/leaveGuard";
import { DEFAULT_CHIP_VALUES } from "../utils/chips";

// The Settings page (#84): one page, an accordion of sections, one draft, one sticky Save / Discard bar.
const SECTION_NAMES = ["Table rules", "Gameplay", "Chips", "Appearance", "Sound & haptics", "Account"];
const location = () => screen.getByTestId("location").textContent;
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => {}); };
const sectionButton = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const show = (name) => { if (sectionButton(name).getAttribute("aria-expanded") === "false") fireEvent.click(sectionButton(name)); };
const expanded = () => SECTION_NAMES.filter((n) => sectionButton(n).getAttribute("aria-expanded") === "true");
const bar = () => screen.queryByRole("region", { name: "Unsaved changes" });
const saveButton = () => screen.getByRole("button", { name: "Save changes" });
const discardButton = () => screen.getByRole("button", { name: "Discard" });
const countText = () => within(bar()).getByText(/unsaved change/).textContent;
// The page's one status line sits in its header (a slider's <output> is a status too).
const note = () => within(screen.getByRole("heading", { level: 1 }).closest("header")).getByRole("status");
const noNote = () => expect(within(screen.getByRole("heading", { level: 1 }).closest("header")).queryByRole("status")).toBeNull();
const radio = (group, name) => within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: new RegExp(`^${name}`) });
const field = (label) => screen.getByLabelText(label);
const type = (label, value) => fireEvent.change(field(label), { target: { value } });
// A username or email change needs the current password (BlackJackAPI#71).
const NEW_PASSWORD_LABEL = "Password to save this change";
const MISSING = "Enter your current password to change your username or email.";
const MY_PASSWORD = "secret12";
const typePassword = (value = MY_PASSWORD) => type(NEW_PASSWORD_LABEL, value);
const askToDelete = () => { fireEvent.click(screen.getByRole("button", { name: "Delete profile" })); return screen.getByRole("dialog", { name: "Delete profile?" }); };
const dialogField = () => within(screen.getByRole("dialog")).getByLabelText("Current password"); // Account's own "Current password" is behind the overlay
const typeInDialog = (value = MY_PASSWORD) => fireEvent.change(dialogField(), { target: { value } });
const deleteForGood = () => fireEvent.click(screen.getByRole("button", { name: "Delete for good" }));
const described = (el) => (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent);
const pickPreset = (name) => {
  fireEvent.click(screen.getByRole("button", { name: /^Preset/ }));
  fireEvent.click(screen.getByRole("option", { name: new RegExp(`^${name}`) }));
};

const open = (game = {}, extra = {}) => renderUI(<Settings />, { path: "/settings", game: { phase: GamePhases.PRE_DEAL, ...game }, ...extra });
// The fake game state never changes by itself. This one applies a saved patch the way GameProvider does and re-renders.
function openLive(game = {}, extra = {}) {
  let view;
  const changeSettings = vi.fn((patch) => {
    view.gameState.settings = { ...view.gameState.settings, ...patch };
    view.rerender(<Settings />);
    return Promise.resolve();
  });
  view = renderUI(<Settings />, { path: "/settings", game: { phase: GamePhases.PRE_DEAL, ...game }, ...extra, actions: { changeSettings, ...extra.actions } });
  return view;
}
function NavLinks() { const nav = useNavigate(); return <button onClick={() => nav("/settings#rules")}>to rules</button>; }
const withSettings = (patch) => ({ settings: { ...initialGameState.settings, ...patch } });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const attr of ["felt", "accent", "mode"]) delete document.documentElement.dataset[attr];
  document.documentElement.classList.remove("no-totals");
});

describe("Settings: the page", () => {
  it("asks a visitor to log in", () => {
    renderUI(<Settings />, { player: { player: null } });
    expect(screen.getByText("Please log in to manage settings.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login"); // no header any more: a visitor still has a way out
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the provider's sign-in notice to a signed-out visitor (#171)", () => {
    renderUI(<Settings />, { player: { player: null, notice: "Please sign in with your new password." } });
    expect(screen.getByRole("alert").textContent).toBe("Please sign in with your new password.");
  });

  it("has a Table button, a title, six sections and no tabs; nothing is changed, so there is no save bar", () => {
    open();
    expect(screen.getByRole("button", { name: "Table" })).toBeTruthy();
    expect(screen.queryByText("Back to game")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent.replace(/\s*(Vegas|Normal|\d+ of|Green|Sound o|Test).*$/, ""))).toEqual(SECTION_NAMES);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Dev")).toBeNull();
    expect(bar()).toBeNull();
  });

  it("every section is closed on arrival, so none of the controls can be reached", () => {
    open();
    expect(expanded()).toEqual([]);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("opens one section at a time: opening another closes the first, and the header closes its own section", () => {
    open();
    show("Table rules");
    expect(expanded()).toEqual(["Table rules"]);
    expect(screen.getByRole("radiogroup", { name: "Deck size" })).toBeTruthy();
    show("Gameplay");
    expect(expanded()).toEqual(["Gameplay"]);
    expect(screen.queryByRole("radiogroup", { name: "Deck size" })).toBeNull();
    expect(screen.getByRole("slider", { name: "Game speed" })).toBeTruthy();
    fireEvent.click(sectionButton("Gameplay"));
    expect(expanded()).toEqual([]);
  });

  it.each([["rules", "Table rules"], ["play", "Gameplay"], ["chips", "Chips"], ["look", "Appearance"], ["sound", "Sound & haptics"], ["account", "Account"]])("the link /settings#%s opens %s", (hash, name) => {
    renderUI(<Settings />, { path: `/settings#${hash}` });
    expect(expanded()).toEqual([name]);
  });

  describe("an opened section scrolls to the top of the page (L1-22)", () => {
    const last = () => scrolls.at(-1);
    it("a deep link scrolls its section into view at once, with nothing before it", () => {
      expect(scrolls).toHaveLength(0);
      renderUI(<Settings />, { path: "/settings#sound" });
      expect(scrolls).toHaveLength(1);
      expect(last().el.id).toBe("sec-sound");
      expect(last().options).toEqual({ block: "start", behavior: "auto" });
    });

    it("a tap on a header (opening or closing) never scrolls the page", () => {
      open();
      fireEvent.click(sectionButton("Account"));
      expect(expanded()).toEqual(["Account"]);
      fireEvent.click(sectionButton("Account"));
      fireEvent.click(sectionButton("Chips"));
      expect(scrolls).toHaveLength(0);
    });

    it("a Save that sends Account back open brings it into view", async () => {
      const updatePlayer = vi.fn().mockRejectedValue(new Error("Name taken"));
      openLive({}, { player: { updatePlayer } });
      show("Account");
      type("Username", "taken");
      typePassword();
      show("Gameplay");
      scrolls.length = 0;
      fireEvent.click(saveButton());
      await flush();
      expect(last().el.id).toBe("sec-account");
      expect(last().options).toEqual({ block: "start", behavior: "auto" }); // never smooth: the hint bubble hides on any scroll (L1-38)
      expect(scrolls).toHaveLength(1);
    });

    it("a Save held back for the password scrolls to Account, then centres the password field", async () => {
      openLive();
      show("Account");
      type("Username", "renamed");
      show("Gameplay");
      scrolls.length = 0;
      fireEvent.click(saveButton());
      await flush();
      expect(scrolls).toHaveLength(2);
      expect(scrolls[0].el.id).toBe("sec-account");
      expect(scrolls[0].options).toEqual({ block: "start", behavior: "auto" });
      expect(scrolls[1].el).toBe(field(NEW_PASSWORD_LABEL).closest("div"));
      expect(scrolls[1].options).toEqual({ block: "center", behavior: "auto" });
    });

    it("a link to another #section while here scrolls to it", () => {
      const view = renderUI(<><Settings /><NavLinks /></>, { path: "/settings#play" });
      fireEvent.click(screen.getByRole("button", { name: "to rules" }));
      expect(last().el.id).toBe("sec-rules");
      view.unmount();
    });
  });

  it("an unknown hash, and the old ?tab link, open nothing (the tabs and their plumbing are gone)", () => {
    renderUI(<Settings />, { path: "/settings#nope" });
    expect(expanded()).toEqual([]);
    cleanup();
    renderUI(<Settings />, { path: "/settings?tab=game" });
    expect(expanded()).toEqual([]);
  });

  it("each header sums up its section's values", () => {
    open();
    expect(sectionButton("Table rules").textContent).toMatch(/Vegas · \d\.\d% house edge/);
    expect(sectionButton("Gameplay").textContent).toContain("Normal speed · totals on · count on");
    expect(sectionButton("Chips").textContent).toContain("12 of 12 chips");
    expect(sectionButton("Appearance").textContent).toContain("Green felt · Emerald · Dark");
    expect(sectionButton("Sound & haptics").textContent).toContain("Sound off · vibration off");
    expect(sectionButton("Account").textContent).toContain("Test Er");
  });

  it("the summaries follow the draft: Custom rules, a new speed, auto deal, fewer chips, the look, a changed name", () => {
    open(withSettings({ resetInitialBet: true }));
    show("Table rules");
    fireEvent.click(radio("Surrender", "None"));
    expect(sectionButton("Table rules").textContent).toMatch(/Custom · \d\.\d% house edge/);
    show("Gameplay");
    fireEvent.change(screen.getByRole("slider", { name: "Game speed" }), { target: { value: "750" } });
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ }));
    fireEvent.click(screen.getByRole("switch", { name: /^Auto deal/ }));
    expect(sectionButton("Gameplay").textContent).toContain("Slow speed · totals off · count on · auto deal");
    show("Chips");
    fireEvent.click(screen.getByRole("button", { name: "$1 chip" }));
    expect(sectionButton("Chips").textContent).toContain("11 of 12 chips");
    show("Appearance");
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    fireEvent.click(screen.getByRole("radio", { name: "Orchid" }));
    fireEvent.click(screen.getByRole("radio", { name: "Device" }));
    expect(sectionButton("Appearance").textContent).toContain("Blue felt · Orchid · Device");
    show("Account");
    type("First name", "Ada");
    type("Last name", "");
    expect(sectionButton("Account").textContent).toContain("Ada");
    type("First name", "");
    expect(sectionButton("Account").textContent).toContain("No name");
  });

  it("a header shows a dot, spoken as 'unsaved changes', only for the section that has some; Discard clears it", () => {
    open();
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    expect(screen.getByRole("button", { name: /^Gameplay, unsaved changes/ })).toBeTruthy();
    for (const name of ["Table rules", "Chips", "Appearance", "Account"]) expect(sectionButton(name).textContent, name).not.toMatch(/unsaved/);
    expect(document.querySelectorAll(".sec-dot")).toHaveLength(1);
    fireEvent.click(discardButton());
    expect(document.querySelectorAll(".sec-dot")).toHaveLength(0);
  });

  it("a header marks each kind of change in its own section", () => {
    open();
    show("Table rules");
    fireEvent.click(radio("Deck size", "8"));
    show("Chips");
    fireEvent.click(screen.getByRole("button", { name: "$1 chip" }));
    show("Appearance");
    fireEvent.click(screen.getByRole("radio", { name: "Red" }));
    show("Account");
    type("Username", "renamed");
    expect(document.querySelectorAll(".sec-dot")).toHaveLength(4);
    for (const name of ["Table rules", "Chips", "Appearance", "Account"]) expect(screen.getByRole("button", { name: new RegExp(`^${name}, unsaved changes`) })).toBeTruthy();
    expect(sectionButton("Gameplay").textContent).not.toMatch(/unsaved/);
  });

  it("starts the Account form with errors for a player with no names, and 'No name' as the summary", () => {
    renderUI(<Settings />, { path: "/settings#account", player: { player: { ...testPlayer, firstName: "", lastName: "" } } });
    expect(screen.getByText("First name is required.")).toBeTruthy();
    expect(screen.getByText("Last name is required.")).toBeTruthy();
    expect(sectionButton("Account").textContent).toContain("No name");
    expect(bar()).toBeNull(); // nothing is edited yet
  });

  it("shows settings that finish loading after the page opened, keeping unsaved edits", () => {
    const { gameState, rerender } = open();
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    gameState.settings = { ...gameState.settings, playTimeout: 1500, resetInitialBet: true };
    rerender(<Settings />);
    expect(screen.getByRole("switch", { name: /^Rebet automatically/ }).checked).toBe(true);
    expect(screen.getByRole("switch", { name: /^Show the count/ }).checked).toBe(false);
    expect(sectionButton("Gameplay").textContent).toContain("Slow speed · totals on · count off");
  });
});

describe("Settings: the Table rules section is part of the draft", () => {
  it("is built from the rules section: the preset dropdown, the groups and the house variations", () => {
    open();
    show("Table rules");
    expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain("Vegas");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Shoe", "Dealer", "Payouts", "Doubling", "Splitting", "Surrender", "House variations"]);
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull(); // no Save of its own: it applies nothing at once
  });

  it("picking a preset changes the draft only: the summary and dropdown follow, nothing is saved until Save", () => {
    const { gameActions } = open();
    show("Table rules");
    pickPreset("Europe");
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain("Europe");
    expect(sectionButton("Table rules").textContent).toMatch(/Europe ·/);
    expect(radio("Dealer's second card", "No second card").getAttribute("aria-checked")).toBe("true");
    expect(countText()).toBe("1 unsaved change");
  });

  it("many rule edits count as one change, and are one with the other sections' changes", () => {
    open();
    show("Table rules");
    pickPreset("Singapore");
    fireEvent.click(radio("Deck size", "8"));
    fireEvent.click(radio("Soft 17", "Hits"));
    expect(countText()).toBe("1 unsaved change");
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ }));
    expect(countText()).toBe("2 unsaved changes");
  });

  it("Save sends only the keys that changed, in one changeSettings: a preset sends just what it moves", () => {
    const { gameActions } = open();
    show("Table rules");
    pickPreset("Atlantic City");
    fireEvent.click(saveButton());
    const expected = Object.fromEntries(Object.entries(RULE_PRESETS["Atlantic City"]).filter(([key, value]) => initialGameState.settings[key] !== value));
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    expect(Object.keys(expected).length).toBeLessThan(Object.keys(RULE_PRESETS["Atlantic City"]).length);
    expect(gameActions.changeSettings.mock.calls).toEqual([[expected]]);
    expect(gameActions.changeSetting).not.toHaveBeenCalled();
  });

  it("a rule changed and changed back is not a change: no save bar, nothing to send", () => {
    open();
    show("Table rules");
    fireEvent.click(radio("Deck size", "8"));
    expect(bar()).toBeTruthy();
    fireEvent.click(radio("Deck size", "6"));
    expect(bar()).toBeNull();
    pickPreset("Europe");
    pickPreset("Vegas");
    expect(bar()).toBeNull();
  });

  it("reads Custom once a rule is edited, and the preset again when it is put back; an unsaved hidden rule does not make it Custom", () => {
    open();
    show("Table rules");
    expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain("Vegas");
    fireEvent.click(radio("Soft 17", "Stands"));
    expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain("Custom");
    fireEvent.click(radio("Soft 17", "Hits"));
    expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain("Vegas");
  });

  it("the dealer's second card is one three-way choice, and 'If the dealer has blackjack, you lose' shows only without a peek", () => {
    open();
    show("Table rules");
    expect(screen.queryByRole("radiogroup", { name: "If the dealer has blackjack, you lose" })).toBeNull();
    expect(within(screen.getByRole("radiogroup", { name: "Dealer's second card" })).getAllByRole("radio").map((r) => r.firstChild.textContent)).toEqual(["Peeks", "No peek", "No second card"]);
    fireEvent.click(radio("Dealer's second card", "No peek"));
    expect(screen.getByRole("radiogroup", { name: "If the dealer has blackjack, you lose" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Blackjack pays immediately" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Dealer draws only once against a 21" })).toBeNull();
    fireEvent.click(radio("Dealer's second card", "No second card"));
    expect(screen.getByRole("switch", { name: "Dealer draws only once against a 21" })).toBeTruthy();
    fireEvent.click(radio("Dealer's second card", "Peeks"));
    expect(screen.queryByRole("radiogroup", { name: "If the dealer has blackjack, you lose" })).toBeNull();
    expect(bar()).toBeNull(); // back where it started
  });

  it("Resplit aces hides when the draft allows only two hands", () => {
    open();
    show("Table rules");
    fireEvent.click(radio("Max hands after splitting", "2"));
    expect(screen.queryByRole("radiogroup", { name: "Resplit aces" })).toBeNull();
    fireEvent.click(radio("Max hands after splitting", "3"));
    expect(screen.getByRole("radiogroup", { name: "Resplit aces" })).toBeTruthy();
  });

  it("Include cut card saves with the rest between rounds, with no question", () => {
    const { gameActions } = open();
    show("Table rules");
    fireEvent.click(radio("Include cut card", "Off"));
    fireEvent.click(saveButton());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ includeCutCard: false }]]);
  });

  it("a hidden key a preset moves saves with it, so a preset applied in one mode is complete in another", () => {
    const { gameActions } = open();
    show("Table rules");
    pickPreset("Europe");
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls[0][0]).toMatchObject({ dealerHoleBehaviour: "drawAfter", blackjackPaysImmediately: false, noHoleCardLoss: "all", maxSplitHands: 0 });
  });
});

describe("Settings: the Save and Discard bar", () => {
  it("shows only while something is changed, with the count, Discard and Save changes", () => {
    open();
    expect(bar()).toBeNull();
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    expect(countText()).toBe("1 unsaved change");
    expect(within(bar()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Discard", "Save changes"]);
    expect(within(bar()).getByText(/unsaved change/).getAttribute("aria-live")).toBe("polite");
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ }));
    expect(countText()).toBe("2 unsaved changes");
  });

  it("Discard drops every edit, in every section, and the controls show the saved values again", () => {
    open();
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    show("Table rules");
    pickPreset("Europe");
    show("Account");
    type("First name", "Zed");
    fireEvent.click(discardButton());
    expect(bar()).toBeNull();
    expect(field("First name").value).toBe("Test");
    show("Gameplay");
    expect(screen.getByRole("switch", { name: /^Show the count/ }).checked).toBe(true);
    show("Table rules");
    expect(screen.getByRole("button", { name: /^Preset/ }).textContent).toContain("Vegas");
  });

  it("Save sends only the keys that changed, once, and then the bar and the dots are gone with a 'Saved' notice", async () => {
    const { gameActions } = openLive();
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ }));
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ })); // changed back: not sent
    fireEvent.click(saveButton());
    await flush();
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ showCardCount: false }]]);
    expect(note().textContent).toBe("Saved");
    expect(bar()).toBeNull();
    expect(document.querySelectorAll(".sec-dot")).toHaveLength(0);
    expect(screen.getByRole("switch", { name: /^Show the count/ }).checked).toBe(false);
  });

  it("the notice goes when the next edit starts", async () => {
    openLive();
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(saveButton());
    await flush();
    expect(note()).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    noNote();
  });

  it("says so when the settings can't be saved to the account, and clears it after a good save", async () => {
    const changeSettings = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    open({}, { actions: { changeSettings } });
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(saveButton());
    await flush();
    expect(note().textContent).toBe("Couldn't save your settings to your account. They apply here until you reload.");
    expect(note().className).toContain("error");
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ }));
    fireEvent.click(saveButton());
    await flush();
    expect(note().textContent).toBe("Saved");
    expect(note().className).not.toContain("error");
  });

  it("an unchanged draft saves nothing: Rebet on then off, a preset and back, the same chips", () => {
    const { gameActions } = open();
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Rebet automatically/ }));
    fireEvent.click(screen.getByRole("switch", { name: /^Rebet automatically/ }));
    show("Chips");
    fireEvent.click(screen.getByRole("button", { name: "$1 chip" }));
    fireEvent.click(screen.getByRole("button", { name: "$1 chip" }));
    expect(bar()).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });

  it("an edit made while a save is on its way stays an edit", async () => {
    let finish;
    const changeSettings = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    open({}, { actions: { changeSettings } });
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ }));
    await act(async () => { finish(); });
    expect(countText()).toBe("1 unsaved change");
    expect(saveButton().getAttribute("aria-disabled")).toBe("false");
  });

  it("Save does nothing twice while a save is on its way", async () => {
    let finish;
    const changeSettings = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    open({}, { actions: { changeSettings } });
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ }));
    expect(saveButton().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(saveButton());
    expect(changeSettings).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
  });
});

describe("Settings: profile fields are part of the draft too", () => {
  it("saves a valid profile change, whole, and shows 'Saved'", async () => {
    const updatePlayer = vi.fn().mockResolvedValue(true);
    const { gameActions } = open({}, { player: { updatePlayer } });
    show("Account");
    type("Username", "ab");
    expect(screen.getByText("Username must be at least 3 characters.")).toBeTruthy();
    expect(saveButton().getAttribute("aria-disabled")).toBe("true");
    type("Username", "renamed");
    expect(saveButton().getAttribute("aria-disabled")).toBe("false");
    typePassword();
    fireEvent.click(saveButton());
    await flush();
    expect(updatePlayer.mock.calls).toStrictEqual([[{ userName: "renamed", email: "t@example.com", firstName: "Test", lastName: "Er", currentPassword: MY_PASSWORD }]]);
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(note().textContent).toBe("Saved");
    expect(bar()).toBeNull();
  });

  it("with only an invalid field left, Save is disabled and does nothing", () => {
    const updatePlayer = vi.fn();
    open({}, { player: { updatePlayer } });
    show("Account");
    type("Email", "nope");
    expect(screen.getByText("Invalid email format.")).toBeTruthy();
    expect(field("Email").getAttribute("aria-invalid")).toBe("true");
    expect(countText()).toBe("1 unsaved change");
    fireEvent.click(saveButton());
    expect(updatePlayer).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("the profile PUT runs first, and the settings follow only once it is answered", async () => {
    let answer;
    const updatePlayer = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    const { gameActions } = open({}, { player: { updatePlayer } });
    show("Account");
    type("First name", "Ada");
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(saveButton());
    expect(updatePlayer).toHaveBeenCalledTimes(1);
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    await act(async () => { answer(); });
    await flush();
    expect(gameActions.changeSettings).toHaveBeenCalledWith({ showCardCount: false });
    expect(updatePlayer.mock.invocationCallOrder[0]).toBeLessThan(gameActions.changeSettings.mock.invocationCallOrder[0]);
  });

  it("a refused profile does not block the settings: they save, the profile stays dirty with its error, and Account opens", async () => {
    const updatePlayer = vi.fn().mockRejectedValue(new Error("Name taken"));
    const { gameActions } = openLive({}, { player: { updatePlayer } });
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    show("Account");
    type("Username", "taken");
    typePassword();
    show("Gameplay");
    fireEvent.click(saveButton());
    await flush();
    expect(updatePlayer).toHaveBeenCalledTimes(1);
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ showCardCount: false }]]);
    expect(expanded()).toEqual(["Account"]);
    expect(screen.getByRole("alert").textContent).toBe("Name taken");
    expect(note().textContent).toBe("Your profile isn't saved yet.");
    expect(note().className).toContain("error");
    expect(field("Username").value).toBe("taken");
    expect(countText()).toBe("1 unsaved change");
    expect(screen.getByRole("button", { name: /^Account, unsaved changes/ })).toBeTruthy();
    expect(sectionButton("Gameplay").textContent).not.toMatch(/unsaved/);
  });

  it("a refusal with no message says 'Save failed', and a later good save clears it", async () => {
    const updatePlayer = vi.fn().mockRejectedValueOnce(new Error("")).mockResolvedValueOnce(true);
    open({}, { player: { updatePlayer } });
    show("Account");
    type("First name", "Changed");
    fireEvent.click(saveButton());
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Save failed");
    fireEvent.click(saveButton());
    await flush();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(note().textContent).toBe("Saved");
  });

  it("an empty name keeps its inline error and is never sent, but never blocks a valid change beside it", async () => {
    const updatePlayer = vi.fn().mockResolvedValue(true);
    const { gameActions } = openLive({}, { player: { updatePlayer } });
    show("Account");
    type("First name", "");
    type("Username", "renamed");
    typePassword();
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(saveButton());
    await flush();
    expect(updatePlayer.mock.calls).toStrictEqual([[{ userName: "renamed", email: "t@example.com", firstName: "Test", lastName: "Er", currentPassword: MY_PASSWORD }]]);
    expect(gameActions.changeSettings).toHaveBeenCalledWith({ showCardCount: false });
    expect(expanded()).toEqual(["Account"]);
    expect(screen.getByText("First name is required.")).toBeTruthy();
    expect(field("First name").value).toBe("");
    expect(note().textContent).toBe("Your profile isn't saved yet.");
    expect(countText()).toBe("1 unsaved change");
  });

  it("an invalid name next to a settings change still saves the settings and opens Account", async () => {
    const updatePlayer = vi.fn();
    const { gameActions } = openLive({}, { player: { updatePlayer } });
    show("Account");
    type("Last name", "");
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(saveButton());
    await flush();
    expect(updatePlayer).not.toHaveBeenCalled();
    expect(gameActions.changeSettings).toHaveBeenCalledWith({ showCardCount: false });
    expect(expanded()).toEqual(["Account"]);
    expect(screen.getByText("Last name is required.")).toBeTruthy();
  });

  it("editing a profile field clears the last profile error", async () => {
    const updatePlayer = vi.fn().mockRejectedValue(new Error("Name taken"));
    open({}, { player: { updatePlayer } });
    show("Account");
    type("Username", "taken");
    typePassword();
    fireEvent.click(saveButton());
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Name taken");
    type("Username", "taken2");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Settings: saving a table rule mid-round asks 'Start a new shoe?'", () => {
  const changeDeck = () => { show("Table rules"); fireEvent.click(radio("Deck size", "8")); };

  it.each([GamePhases.PLAYER_TURN, GamePhases.DEALER_TURN, GamePhases.OFFERS, GamePhases.PEEK])("asks once at Save during %s, and saves nothing until it is answered", (phase) => {
    const { gameActions } = open({ phase });
    changeDeck();
    expect(screen.queryByRole("dialog")).toBeNull(); // not at the click: at Save
    fireEvent.click(saveButton());
    const dialog = screen.getByRole("dialog", { name: "Start a new shoe?" });
    expect(dialog.textContent).toMatch(/The hand in play ends and any bets on it are lost/);
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });

  it("Cancel saves nothing and keeps the draft; the safe button comes first and has the focus", () => {
    const { gameActions, playerCtx } = open({ phase: GamePhases.PLAYER_TURN });
    changeDeck();
    fireEvent.click(saveButton());
    const [safe, danger] = within(screen.getByRole("dialog")).getAllByRole("button");
    expect([safe.textContent, danger.textContent]).toEqual(["Cancel", "Save and reset"]);
    expect(document.activeElement).toBe(safe);
    expect(danger.className).toContain("danger-o");
    fireEvent.click(safe);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(playerCtx.updatePlayer).not.toHaveBeenCalled();
    expect(countText()).toBe("1 unsaved change");
    expect(radio("Deck size", "8").getAttribute("aria-checked")).toBe("true");
  });

  it("Escape is Cancel", () => {
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN });
    changeDeck();
    fireEvent.click(saveButton());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });

  it("'Save and reset' saves the changed keys", async () => {
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN });
    changeDeck();
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole("button", { name: "Save and reset" }));
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ deckCount: 8 }]]);
  });

  it("is shown before the profile PUT: nothing is sent while it is open, and the profile goes first once confirmed", async () => {
    const updatePlayer = vi.fn().mockResolvedValue(true);
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN }, { player: { updatePlayer } });
    show("Account");
    type("First name", "Ada");
    changeDeck();
    fireEvent.click(saveButton());
    expect(screen.getByRole("dialog", { name: "Start a new shoe?" })).toBeTruthy();
    expect(updatePlayer).not.toHaveBeenCalled();
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save and reset" }));
    await flush();
    expect(updatePlayer).toHaveBeenCalledTimes(1);
    expect(gameActions.changeSettings).toHaveBeenCalledWith({ deckCount: 8 });
    expect(updatePlayer.mock.invocationCallOrder[0]).toBeLessThan(gameActions.changeSettings.mock.invocationCallOrder[0]);
  });

  it("Include cut card counts as a table rule that resets the shoe", () => {
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN });
    show("Table rules");
    fireEvent.click(radio("Include cut card", "Off"));
    fireEvent.click(saveButton());
    expect(screen.getByRole("dialog", { name: "Start a new shoe?" })).toBeTruthy();
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });

  it("does not ask for what does not reset the shoe: House variations, speed, totals, chips, the look, the profile", async () => {
    const updatePlayer = vi.fn().mockResolvedValue(true);
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN }, { player: { updatePlayer } });
    show("Table rules");
    fireEvent.click(screen.getByRole("switch", { name: "Triple down" }));
    fireEvent.click(screen.getByRole("switch", { name: "Double down card face down" }));
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ }));
    fireEvent.change(screen.getByRole("slider", { name: "Game speed" }), { target: { value: "250" } });
    show("Chips");
    fireEvent.click(screen.getByRole("button", { name: "$1 chip" }));
    show("Appearance");
    fireEvent.click(screen.getByRole("radio", { name: "Red" }));
    show("Account");
    type("First name", "Ada");
    fireEvent.click(saveButton());
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings).toHaveBeenCalledTimes(1);
    expect(Object.keys(gameActions.changeSettings.mock.calls[0][0]).sort()).toEqual(["chipValues", "doubleFaceDown", "feltTheme", "playTimeout", "showTotals", "tripleDown"]);
    expect(updatePlayer).toHaveBeenCalledTimes(1);
  });

  it.each([GamePhases.NONE, GamePhases.PRE_DEAL])("between rounds (%s) the new shoe is dealt without asking", async (phase) => {
    const { gameActions } = open({ phase });
    changeDeck();
    fireEvent.click(saveButton());
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings).toHaveBeenCalledWith({ deckCount: 8 });
  });

  it("an unchanged draft saves nothing and never asks, even in a round (a rule put back where it was)", () => {
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN });
    changeDeck();
    fireEvent.click(radio("Deck size", "6"));
    expect(bar()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
  });
});

describe("Settings: the unsaved-changes guard", () => {
  const dirty = () => { show("Gameplay"); fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ })); };

  it("Table leaves at once when nothing is changed", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(location()).toBe("/game");
  });

  it("Table asks 'Discard your changes?' when something is changed; Keep editing stays with the draft intact", () => {
    open();
    dirty();
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const dialog = screen.getByRole("dialog", { name: "Discard your changes?" });
    const [keep, leave] = within(dialog).getAllByRole("button");
    expect([keep.textContent, leave.textContent]).toEqual(["Keep editing", "Discard and leave"]);
    expect(document.activeElement).toBe(keep);
    expect(leave.className).toContain("danger-o");
    expect(location()).toBe("/settings");
    fireEvent.click(keep);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(location()).toBe("/settings");
    expect(countText()).toBe("1 unsaved change");
  });

  it("Escape is Keep editing, and 'Discard and leave' drops the draft and goes to the table", () => {
    open();
    dirty();
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(location()).toBe("/settings");
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(location()).toBe("/game");
  });

  it("the Home, Settings and Log out moves each ask first, and carry on after Discard and leave", () => {
    const { gameActions, playerCtx } = renderUI(<><NavButtons /><Settings /></>, { path: "/settings" });
    dirty();
    fireEvent.click(screen.getByRole("button", { name: "Nav Home" }));
    expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeTruthy();
    expect(location()).toBe("/settings");
    expect(gameActions.resetGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    fireEvent.click(screen.getByRole("button", { name: "Nav Settings" }));
    expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    fireEvent.click(screen.getByRole("button", { name: "Nav Log out" }));
    expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeTruthy();
    expect(playerCtx.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Log out?" })).getByRole("button", { name: "Log out" }));
    expect(playerCtx.logout).toHaveBeenCalledTimes(1);
    expect(location()).toBe("/");
  });

  it("the Home button goes home after Discard and leave", () => {
    const { gameActions } = renderUI(<><NavButtons /><Settings /></>, { path: "/settings" });
    dirty();
    fireEvent.click(screen.getByRole("button", { name: "Nav Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(gameActions.resetGame).toHaveBeenCalled();
    expect(location()).toBe("/");
  });

  it("the Settings move goes to Settings after Discard and leave, with no section open", () => {
    renderUI(<><NavButtons /><Settings /></>, { path: "/settings#play" });
    expect(expanded()).toEqual(["Gameplay"]);
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(screen.getByRole("button", { name: "Nav Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(location()).toBe("/settings");
  });

  it("the page's own Log out asks first too, then asks 'Log out?' in its own dialog", () => {
    const { playerCtx } = open();
    dirty();
    show("Account");
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(playerCtx.logout).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Log out?" })).getByRole("button", { name: "Log out" }));
    expect(playerCtx.logout).toHaveBeenCalled();
  });

  it("with nothing changed, the page's Log out goes straight to its own Log out? dialog; Stay logged in keeps the session", () => {
    const { playerCtx, gameActions } = open();
    show("Account");
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByRole("dialog", { name: "Log out?" })).toBeTruthy(); // not "Discard your changes?": nothing was changed
    fireEvent.click(screen.getByRole("button", { name: "Stay logged in" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(playerCtx.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Log out" }));
    expect(playerCtx.logout).toHaveBeenCalledTimes(1);
    expect(gameActions.resetGame).toHaveBeenCalled();
    expect(location()).toBe("/");
  });

  it("a page unload is warned about while the draft is dirty, and only then", () => {
    open();
    const unload = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(unload()).toBe(false);
    dirty();
    expect(unload()).toBe(true);
    fireEvent.click(discardButton());
    expect(unload()).toBe(false);
  });

  it("the guard is set only while there are unsaved changes, and is gone when the page goes", () => {
    const { unmount } = open();
    expect(leaveGuard.ask).toBeNull();
    dirty();
    expect(leaveGuard.ask).toBeTypeOf("function");
    fireEvent.click(discardButton());
    expect(leaveGuard.ask).toBeNull();
    dirty();
    unmount();
    expect(leaveGuard.ask).toBeNull();
  });

  it("saving ends the guard: Table then leaves at once", async () => {
    openLive();
    dirty();
    fireEvent.click(saveButton());
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(location()).toBe("/game");
  });
});

describe("Settings: Gameplay", () => {
  it("has Game speed, Rebet automatically, Show hand totals and Show the count, with their subtitles", () => {
    open();
    show("Gameplay");
    expect(screen.getByRole("slider", { name: "Game speed" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /^Rebet automatically/ }).checked).toBe(false);
    const totals = screen.getByRole("switch", { name: /^Show hand totals/ });
    expect(totals.checked).toBe(true);
    expect(totals.closest("label").textContent).toContain("Yours and the dealer's");
    const count = screen.getByRole("switch", { name: /^Show the count/ });
    expect(count.checked).toBe(true);
    expect(count.closest("label").textContent).toContain("Running and true count");
    expect(screen.queryByRole("switch", { name: /^Auto deal/ })).toBeNull();
  });

  it("Game speed runs 0 to 1000 with its stops evenly placed, shows the name and the exact seconds, and saves the milliseconds", () => {
    const { gameActions } = open();
    show("Gameplay");
    const slider = screen.getByRole("slider", { name: "Game speed" });
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(["0", "1000", "1", "500"]);
    expect(screen.getByText("Normal · 1.0 s")).toBeTruthy();
    const stops = [...document.querySelector(".stops").children].map((s) => s.textContent);
    expect(stops).toEqual(["Very fast", "Fast", "Normal", "Slow", "5 s"]);
    fireEvent.change(slider, { target: { value: "375" } });
    expect(screen.getByText("Fast · 0.75 s")).toBeTruthy();
    expect(document.querySelector(".stops .on").textContent).toBe("Fast");
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ playTimeout: 750 }]]);
  });

  it("a slider position near a stop lands on it", () => {
    open();
    show("Gameplay");
    fireEvent.change(screen.getByRole("slider", { name: "Game speed" }), { target: { value: "760" } });
    expect(screen.getByText("Slow · 1.5 s")).toBeTruthy();
  });

  it("an in-between saved value shows the nearest name and the exact seconds", () => {
    open(withSettings({ playTimeout: 1250 }));
    show("Gameplay");
    expect(screen.getByText("Normal · 1.25 s")).toBeTruthy();
    expect(sectionButton("Gameplay").textContent).toContain("Normal speed");
  });

  it("Show hand totals saves with the rest and re-themes the table at once, then puts the saved look back on leaving", () => {
    const { unmount, gameActions } = open();
    show("Gameplay");
    expect(document.documentElement.classList.contains("no-totals")).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: /^Show hand totals/ }));
    expect(document.documentElement.classList.contains("no-totals")).toBe(true);
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ showTotals: false }]]);
    unmount(); // the fake game state still holds the saved value: totals on
    expect(document.documentElement.classList.contains("no-totals")).toBe(false);
  });

  it("Auto deal shows only with Rebet, and its delay only with Auto deal too (drafts count before Save)", () => {
    open();
    show("Gameplay");
    expect(screen.queryByRole("switch", { name: /^Auto deal/ })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /^Rebet automatically/ }));
    expect(screen.getByRole("switch", { name: /^Auto deal/ }).checked).toBe(false);
    expect(screen.getByRole("switch", { name: /^Auto deal/ }).closest("label").textContent).toContain("Needs Rebet");
    expect(screen.queryByRole("slider", { name: "Auto deal delay" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /^Auto deal/ }));
    expect(screen.getByRole("slider", { name: "Auto deal delay" })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /^Auto deal/ }));
    expect(screen.queryByRole("slider", { name: "Auto deal delay" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /^Auto deal/ }));
    fireEvent.click(screen.getByRole("switch", { name: /^Rebet automatically/ })); // Rebet off again hides both and drops the draft
    expect(screen.queryByRole("switch", { name: /^Auto deal/ })).toBeNull();
    expect(screen.queryByRole("slider", { name: "Auto deal delay" })).toBeNull();
    expect(bar()).toBeNull();
  });

  it("the delay runs 0 to 10 seconds in steps of 0.5, shows seconds, and saves milliseconds", () => {
    const { gameActions } = open(withSettings({ resetInitialBet: true, autoDeal: true }));
    show("Gameplay");
    const slider = screen.getByRole("slider", { name: "Auto deal delay" });
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(["0", "10000", "500", "3000"]);
    expect(screen.getByText("3.0 s")).toBeTruthy();
    fireEvent.change(slider, { target: { value: "1500" } });
    expect(screen.getByText("1.5 s")).toBeTruthy();
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ autoDealDelay: 1500 }]]);
  });

  it("saves Auto deal with the rest", () => {
    const { gameActions } = open(withSettings({ resetInitialBet: true }));
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Auto deal/ }));
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ autoDeal: true }]]);
  });

  it("saving Rebet off while Auto deal is on sends one changeSettings with auto deal off too", () => {
    const { gameActions } = open(withSettings({ resetInitialBet: true, autoDeal: true }));
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Rebet automatically/ }));
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ resetInitialBet: false, autoDeal: false }]]);
    expect(gameActions.changeSetting).not.toHaveBeenCalled();
  });

  it("Rebet back on after it was saved off shows a fresh, unticked Auto deal", () => {
    const { gameState, rerender } = open(withSettings({ resetInitialBet: true }));
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Auto deal/ })); // an unsaved draft: on
    fireEvent.click(screen.getByRole("switch", { name: /^Rebet automatically/ }));
    fireEvent.click(saveButton());
    gameState.settings = { ...gameState.settings, resetInitialBet: false, autoDeal: false };
    rerender(<Settings />);
    fireEvent.click(screen.getByRole("switch", { name: /^Rebet automatically/ }));
    expect(screen.getByRole("switch", { name: /^Auto deal/ }).checked).toBe(false);
  });
});

describe("Settings: Chips", () => {
  it("picks which chips to show, never leaves none, and saves them in chip order with the rest", () => {
    const { gameActions } = open({ phase: GamePhases.PLAYER_TURN });
    show("Chips");
    expect(screen.getByRole("group", { name: "Chips to show" })).toBeTruthy();
    const chip = (n) => screen.getByRole("button", { name: `$${n.toLocaleString()} chip` });
    const on = (n) => chip(n).getAttribute("aria-pressed") === "true";
    for (const n of [1, 10, 50, 100, 1000, 5000, 10000, 20000, 50000, 100000]) fireEvent.click(chip(n));
    expect([1, 5, 25, 100000].map(on)).toEqual([false, true, true, false]);
    fireEvent.click(chip(5));
    fireEvent.click(chip(25)); // the last chip on stays on
    expect(on(25)).toBe(true);
    expect(chip(25).getAttribute("aria-disabled")).toBe("true");
    expect(chip(25).getAttribute("aria-describedby")).toBe("chip-hint");
    expect(screen.getByText("At least one chip must stay selected.").id).toBe("chip-hint");
    expect(chip(1).hasAttribute("aria-describedby")).toBe(false);
    fireEvent.click(chip(5));
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    fireEvent.click(saveButton());
    expect(screen.queryByRole("dialog")).toBeNull(); // chips never reset the shoe, even mid-round
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ chipValues: "5,25" }]]);
  });

  it("the default is every chip, and turning one off and on again is no change", () => {
    open();
    show("Chips");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(DEFAULT_CHIP_VALUES.split(",").length);
  });
});

describe("Settings: Appearance", () => {
  it("shows felt, accent and mode as three radio groups, the saved ones chosen, with data hooks for the pickers", () => {
    open();
    show("Appearance");
    expect(within(screen.getByRole("radiogroup", { name: "Felt" })).getAllByRole("radio").map((r) => [r.getAttribute("aria-label"), r.getAttribute("aria-checked"), r.getAttribute("data-felt")])).toEqual([
      ["Green", "true", "green"], ["Blue", "false", "blue"], ["Red", "false", "red"],
    ]);
    expect(within(screen.getByRole("radiogroup", { name: "Accent" })).getAllByRole("radio").map((r) => [r.getAttribute("aria-label"), r.getAttribute("aria-checked"), r.getAttribute("data-pick-accent")])).toEqual([
      ["Emerald", "true", "emerald"], ["Sapphire", "false", "sapphire"], ["Ember", "false", "ember"], ["Orchid", "false", "orchid"],
    ]);
    expect(within(screen.getByRole("radiogroup", { name: "Mode" })).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked"), r.getAttribute("data-pick-mode")])).toEqual([
      ["Dark", "true", "dark"], ["Light", "false", "light"], ["Device", "false", "system"],
    ]);
  });

  it("previews the look as it is picked, and saves it with the rest", () => {
    const { gameActions } = open();
    show("Appearance");
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    fireEvent.click(screen.getByRole("radio", { name: "Ember" }));
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset).toMatchObject({ felt: "blue", accent: "ember", mode: "light" });
    expect(screen.getByRole("radio", { name: "Blue" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Green" }).getAttribute("aria-checked")).toBe("false");
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ feltTheme: "blue", accent: "ember", mode: "light" }]]);
  });

  it("Device follows the device's light or dark", () => {
    const media = (matches) => vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("matchMedia", media(true));
    open();
    show("Appearance");
    fireEvent.click(screen.getByRole("radio", { name: "Device" }));
    expect(document.documentElement.dataset.mode).toBe("light");
    vi.unstubAllGlobals();
  });

  it("Discard, and leaving, put the saved look back", () => {
    const { unmount } = open();
    show("Appearance");
    fireEvent.click(screen.getByRole("radio", { name: "Red" }));
    expect(document.documentElement.dataset.felt).toBe("red");
    fireEvent.click(discardButton());
    expect(document.documentElement.dataset.felt).toBe("green");
    fireEvent.click(screen.getByRole("radio", { name: "Red" }));
    unmount();
    expect(document.documentElement.dataset.felt).toBe("green");
  });

  it("leaving puts back the device's own mode when the saved one is Device", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const { unmount } = open(withSettings({ mode: "system" }));
    show("Appearance");
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.mode).toBe("dark");
    unmount();
    expect(document.documentElement.dataset.mode).toBe("light");
    vi.unstubAllGlobals();
  });
});

describe("Settings: Account", () => {
  it("has the four profile fields with real labels, and the password fields", () => {
    open();
    show("Account");
    expect(["Username", "Email", "First name", "Last name"].map((l) => field(l).value)).toEqual(["tester", "t@example.com", "Test", "Er"]);
    expect(field("Current password").type).toBe("password");
    expect(field("New password").type).toBe("password");
  });

  it("changes the password only with the current one and a valid new one; it is its own action, not part of the draft", async () => {
    const changePassword = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("Incorrect password.")).mockRejectedValueOnce(new Error(""));
    open({}, { player: { changePassword } });
    show("Account");
    const button = screen.getByRole("button", { name: "Change password" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    type("Current password", "old-pass");
    type("New password", "1234567");
    expect(screen.getByText("Password must be at least 8 characters.")).toBeTruthy();
    expect(field("New password").getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(button);
    expect(changePassword).not.toHaveBeenCalled();
    type("New password", "new-pass1");
    expect(bar()).toBeNull();
    fireEvent.click(button);
    await flush();
    expect(changePassword).toHaveBeenCalledWith("old-pass", "new-pass1");
    expect(field("Current password").value).toBe("");
    const shown = [note().textContent];
    for (let i = 0; i < 2; i++) {
      type("Current password", "wrong");
      type("New password", "new-pass1");
      fireEvent.click(button);
      await flush();
      shown.push(note().textContent);
    }
    expect(shown).toEqual(["Password changed", "Incorrect password.", "Password change failed"]);
    expect(note().className).toContain("error");
  });
});

describe("Settings: Delete profile", () => {
  it("sits apart at the bottom, below every section, and is there while every section is closed", () => {
    open();
    const del = screen.getByRole("button", { name: "Delete profile" });
    expect(del.closest("section")).toBeNull();
    expect(del.className).toContain("danger-o");
    expect(screen.getByText("Balance and history, for good.")).toBeTruthy();
    const last = document.getElementById("sec-account");
    expect(last.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("asks first with the safe button focused; Keep my profile deletes nothing", () => {
    const deletePlayer = vi.fn();
    open({}, { player: { deletePlayer } });
    fireEvent.click(screen.getByRole("button", { name: "Delete profile" }));
    const dialog = screen.getByRole("dialog", { name: "Delete profile?" });
    const [safe, danger] = within(dialog).getAllByRole("button");
    expect([safe.textContent, danger.textContent]).toEqual(["Keep my profile", "Delete for good"]);
    expect(document.activeElement).toBe(safe);
    expect(danger.className).toContain("danger-o");
    expect(dialog.textContent).toMatch(/cannot be undone/);
    fireEvent.click(safe);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deletePlayer).not.toHaveBeenCalled();
  });

  it("'Delete for good' deletes the profile, resets the game and goes home", async () => {
    const deletePlayer = vi.fn().mockResolvedValue(true);
    const { gameActions } = open({}, { player: { deletePlayer } });
    askToDelete();
    typeInDialog();
    deleteForGood();
    await flush();
    expect(deletePlayer.mock.calls).toEqual([[MY_PASSWORD]]);
    expect(gameActions.resetGame).toHaveBeenCalled();
    expect(location()).toBe("/");
  });

  it("shows a failed delete in the dialog, with a fallback message, and stays on the page", async () => {
    const deletePlayer = vi.fn().mockRejectedValueOnce(new Error("Gone")).mockRejectedValueOnce(new Error(""));
    const { gameActions } = open({}, { player: { deletePlayer } });
    const dialog = askToDelete();
    for (const expected of ["Gone", "Delete failed"]) {
      typeInDialog();
      dialogField().blur();
      deleteForGood();
      await flush();
      expect(screen.getByRole("dialog")).toBe(dialog); // it stays open
      const alert = within(dialog).getByRole("alert");
      expect(alert.textContent).toBe(expected);
      expect(dialogField().value).toBe("");
      expect(dialogField().getAttribute("aria-invalid")).toBe("true");
      expect(described(dialogField())).toEqual([expected]);
      expect(document.activeElement).toBe(dialogField());
      for (const button of within(dialog).getAllByRole("button")) expect(button.hasAttribute("aria-disabled")).toBe(false);
    }
    noNote(); // the page's own line says nothing
    expect(deletePlayer).toHaveBeenCalledTimes(2);
    expect(gameActions.resetGame).not.toHaveBeenCalled();
    expect(location()).toBe("/settings");
  });

  it("the guard does not apply to it: the profile goes even with unsaved changes (the account is gone)", async () => {
    const deletePlayer = vi.fn().mockResolvedValue(true);
    open({}, { player: { deletePlayer } });
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    askToDelete();
    typeInDialog();
    deleteForGood();
    await flush();
    expect(deletePlayer.mock.calls).toEqual([[MY_PASSWORD]]);
    expect(location()).toBe("/");
    expect(screen.queryByRole("dialog", { name: "Discard your changes?" })).toBeNull(); // (the fake keeps the player, so Delete's own dialog stays mounted)
  });

  it("the field is a labelled current-password input between the text and the buttons, in no form", () => {
    open();
    const dialog = askToDelete();
    const input = dialogField();
    expect([input.type, input.getAttribute("autocomplete"), input.value, input.getAttribute("aria-invalid"), input.hasAttribute("aria-describedby")])
      .toEqual(["password", "current-password", "", "false", false]);
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(within(dialog).getByText(/cannot be undone/), input)).toBe(true);
    expect(follows(input, within(dialog).getByRole("button", { name: "Keep my profile" }))).toBe(true);
    expect(input.closest("form")).toBeNull();
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("Tab wraps over the field and both buttons: from Delete for good to the field, Shift+Tab back", () => {
    open();
    const dialog = askToDelete();
    const [safe, danger] = within(dialog).getAllByRole("button");
    const tab = (shiftKey = false) => {
      const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
      act(() => { document.dispatchEvent(event); });
      return event.defaultPrevented;
    };
    danger.focus();
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(dialogField());
    expect(tab(true)).toBe(true);
    expect(document.activeElement).toBe(danger);
    // inside the dialog the browser moves focus itself: the trap leaves Shift+Tab from the safe button (to the field) and Tab from the field alone
    safe.focus();
    expect(tab(true)).toBe(false);
    dialogField().focus();
    expect(tab()).toBe(false);
  });

  it("Enter in the field deletes nothing and leaves the dialog open", () => {
    const deletePlayer = vi.fn();
    open({}, { player: { deletePlayer } });
    askToDelete();
    typeInDialog();
    for (const kind of ["keyDown", "keyPress", "keyUp"]) fireEvent[kind](dialogField(), { key: "Enter", code: "Enter", charCode: 13 });
    expect(deletePlayer).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete profile?" })).toBeTruthy();
  });

  it("'Delete for good' with an empty field sends nothing, says why inline and focuses the field; typing clears it", () => {
    const deletePlayer = vi.fn();
    open({}, { player: { deletePlayer } });
    const dialog = askToDelete();
    deleteForGood();
    const text = "Enter your current password to delete your account.";
    expect(deletePlayer).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert").textContent).toBe(text);
    expect(dialogField().getAttribute("aria-invalid")).toBe("true");
    expect(described(dialogField())).toEqual([text]);
    expect(document.activeElement).toBe(dialogField());
    typeInDialog("s");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(dialogField().getAttribute("aria-invalid")).toBe("false");
    expect(dialogField().hasAttribute("aria-describedby")).toBe(false);
  });

  it("while the delete runs, both buttons are aria-disabled, clicks and Escape do nothing, and only one DELETE goes out", async () => {
    let fail;
    const deletePlayer = vi.fn(() => new Promise((_, reject) => { fail = reject; }));
    open({}, { player: { deletePlayer } });
    const dialog = askToDelete();
    typeInDialog("  spaces kept  ");
    deleteForGood();
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-disabled"))).toEqual(["true", "true"]);
    expect(dialogField().readOnly).toBe(true);
    for (const button of buttons) fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(deletePlayer.mock.calls).toEqual([["  spaces kept  "]]); // never trimmed
    await act(async () => { fail(new Error("Incorrect password.")); });
    expect(within(dialog).getByRole("alert").textContent).toBe("Incorrect password.");
    expect(dialogField().readOnly).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" }); // Escape means "keep" again
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a reopened dialog starts clean: no password, no error", async () => {
    const deletePlayer = vi.fn().mockRejectedValue(new Error("Incorrect password."));
    open({}, { player: { deletePlayer } });
    askToDelete();
    typeInDialog("wrong");
    deleteForGood();
    await flush();
    typeInDialog("half typed");
    fireEvent.click(screen.getByRole("button", { name: "Keep my profile" }));
    const dialog = askToDelete();
    expect(dialogField().value).toBe("");
    expect(dialogField().getAttribute("aria-invalid")).toBe("false");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    // and after an inline "enter your password" too
    deleteForGood();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(askToDelete()).queryByRole("alert")).toBeNull();
  });

  it("a 401 signs out as before: the provider drops the player, then the call rejects; nothing is thrown", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let view;
    const deletePlayer = vi.fn(async () => {
      view.playerCtx.player = null;
      view.rerender(<Settings />);
      throw Object.assign(new Error("Unauthorized."), { status: 401 });
    });
    view = open({}, { player: { deletePlayer } });
    askToDelete();
    typeInDialog();
    deleteForGood();
    await flush();
    expect(screen.getByText("Please log in to manage settings.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(view.gameActions.resetGame).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("Settings: the password for a username or email change (BlackJackAPI#71)", () => {
  const pw = () => screen.queryByLabelText(NEW_PASSWORD_LABEL);
  const openAccount = (extra = {}, game = {}) => { const view = openLive(game, extra); show("Account"); return view; };
  const save = async () => { fireEvent.click(saveButton()); await flush(); };

  it.each([["Username", "renamed"], ["Email", "new@example.com"], ["Username", "TESTER"], ["Email", "t@EXAMPLE.com"]])(
    "appears while %s differs from the saved value (%s), described and typed as the current password", (label, value) => {
      openAccount();
      expect(pw()).toBeNull();
      type(label, value);
      expect([pw().type, pw().getAttribute("autocomplete"), pw().value, pw().getAttribute("aria-invalid")]).toEqual(["password", "current-password", "", "false"]);
      expect(described(pw())).toEqual(["Needed to change your username or email."]);
      expect(Boolean(field("Last name").compareDocumentPosition(pw()) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true); // under the profile fields
      expect(saveButton().getAttribute("aria-disabled")).toBe("false"); // an empty password never disables Save
    });

  it("is not there for a name change", () => {
    openAccount();
    type("First name", "Ada");
    type("Last name", "Lovelace");
    expect(pw()).toBeNull();
  });

  it("is not an unsaved change and sets no leave guard of its own; typing username and email back clears it", () => {
    openAccount();
    type("Username", "renamed");
    type("Email", "new@example.com");
    typePassword();
    expect(countText()).toBe("2 unsaved changes");
    type("Username", testPlayer.userName); // the email still differs, so the field and its text stay
    expect(pw().value).toBe(MY_PASSWORD);
    type("Email", testPlayer.email);
    expect(pw()).toBeNull();
    expect(bar()).toBeNull();
    expect(leaveGuard.ask).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    openAccount();
    type("Username", "again");
    expect(pw().value).toBe("");
  });

  it("a missing-password error does not survive typing the username back", async () => {
    openAccount();
    type("Username", "renamed");
    await save();
    type("Username", testPlayer.userName);
    type("Username", "renamed");
    expect(screen.queryByText(MISSING)).toBeNull();
    expect(pw().getAttribute("aria-invalid")).toBe("false");
  });

  it("Discard clears it", () => {
    openAccount();
    type("Username", "renamed");
    typePassword();
    fireEvent.click(discardButton());
    expect(pw()).toBeNull();
    type("Username", "renamed");
    expect(pw().value).toBe("");
  });

  it("a good save clears it", async () => {
    const updatePlayer = vi.fn().mockResolvedValue(true);
    openAccount({ player: { updatePlayer } });
    type("Email", "new@example.com");
    typePassword("  pass word  ");
    await save();
    expect(updatePlayer.mock.calls).toStrictEqual([[{ userName: "tester", email: "new@example.com", firstName: "Test", lastName: "Er", currentPassword: "  pass word  " }]]);
    // the fake player keeps the old email, so the field comes back with the next edit, empty
    type("Email", "other@example.com");
    expect(pw().value).toBe("");
  });

  it("a password typed for a new edit while a save is on its way stays", async () => {
    let answer;
    const updatePlayer = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    openAccount({ player: { updatePlayer } });
    type("Username", "first");
    typePassword("first-password");
    fireEvent.click(saveButton());
    type("Username", "second");
    typePassword("second-password");
    await act(async () => { answer(); });
    await flush();
    expect(pw().value).toBe("second-password");
  });

  it("keeps it out of the settings, storage and the other saves", async () => {
    const updatePlayer = vi.fn().mockResolvedValue(true);
    const { gameActions } = openAccount({ player: { updatePlayer } });
    type("Username", "renamed");
    typePassword("s3cret-marker");
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    await save();
    expect(gameActions.changeSettings.mock.calls).toStrictEqual([[{ showCardCount: false }]]);
    expect(JSON.stringify([{ ...localStorage }, { ...sessionStorage }])).not.toContain("s3cret-marker");
  });

  it.each([["Username", "renamed"], ["Email", "new@example.com"]])("Save without it, with only %s changed: nothing is sent, the field says why and gets the focus, from another section", async (label, value) => {
    const updatePlayer = vi.fn();
    const { gameActions } = openAccount({ player: { updatePlayer } });
    type(label, value);
    show("Gameplay");
    await save();
    expect(updatePlayer).not.toHaveBeenCalled();
    expect(gameActions.changeSettings).not.toHaveBeenCalled();
    expect(expanded()).toEqual(["Account"]);
    expect(screen.getByText(MISSING)).toBeTruthy();
    expect(pw().getAttribute("aria-invalid")).toBe("true");
    expect(described(pw())).toEqual(["Needed to change your username or email.", MISSING]);
    expect(note().textContent).toBe("Your profile isn't saved yet.");
    expect(note().className).toContain("error");
    expect(document.activeElement).toBe(pw());
    expect(field(label).value).toBe(value);
    expect(countText()).toBe("1 unsaved change");
    // a second press, with Account already open, sends the player back to the field
    pw().blur();
    await save();
    expect(document.activeElement).toBe(pw());
    // typing clears the error, and the next Save goes through
    typePassword("s");
    expect(screen.queryByText(MISSING)).toBeNull();
    expect(pw().getAttribute("aria-invalid")).toBe("false");
    expect(described(pw())).toEqual(["Needed to change your username or email."]);
  });

  it("Save without it from a collapsed page opens Account and focuses the field", async () => {
    openAccount();
    type("Username", "renamed");
    fireEvent.click(sectionButton("Account"));
    expect(expanded()).toEqual([]);
    await save();
    expect(expanded()).toEqual(["Account"]);
    expect(document.activeElement).toBe(pw());
  });

  it("Save without it still saves names and settings, with the OLD username and email and no currentPassword key", async () => {
    const updatePlayer = vi.fn().mockResolvedValue(true);
    const { gameActions } = openAccount({ player: { updatePlayer } });
    type("Username", "renamed");
    type("Email", "new@example.com");
    type("First name", "Ada");
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    await save();
    expect(updatePlayer.mock.calls).toStrictEqual([[{ userName: "tester", email: "t@example.com", firstName: "Ada", lastName: "Er" }]]);
    expect(Object.keys(updatePlayer.mock.calls[0][0])).not.toContain("currentPassword");
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ showCardCount: false }]]);
    expect([field("Username").value, field("Email").value]).toEqual(["renamed", "new@example.com"]);
    expect(screen.getByText(MISSING)).toBeTruthy();
    expect(note().textContent).toBe("Your profile isn't saved yet.");
    expect(expanded()).toEqual(["Account"]);
    expect(document.activeElement).toBe(pw());
  });

  it("is sent only when the username or email is in the request: not when an invalid email holds it back", async () => {
    const updatePlayer = vi.fn().mockResolvedValue(true);
    openAccount({ player: { updatePlayer } });
    type("Email", "nope");
    typePassword();
    type("First name", "Ada");
    await save();
    expect(updatePlayer.mock.calls).toStrictEqual([[{ userName: "tester", email: "t@example.com", firstName: "Ada", lastName: "Er" }]]);
    expect(screen.queryByText(MISSING)).toBeNull();
    expect(pw().value).toBe(""); // any good profile save clears it, used or not
  });

  it("through 'Start a new shoe?' mid-round, the field still gets the focus (not the Save button behind the dialog)", async () => {
    const updatePlayer = vi.fn();
    const { gameActions } = openAccount({ player: { updatePlayer } }, { phase: GamePhases.PLAYER_TURN });
    type("Username", "renamed");
    show("Table rules");
    fireEvent.click(radio("Deck size", "8"));
    saveButton().focus();
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole("button", { name: "Save and reset" }));
    await flush();
    expect(updatePlayer).not.toHaveBeenCalled();
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ deckCount: 8 }]]);
    expect(expanded()).toEqual(["Account"]);
    expect(document.activeElement).toBe(pw());
  });

  it("a refusal on 'Incorrect password.' shows the API's words, keeps the edits, and clears, marks and focuses the field", async () => {
    // The literal the page matches on; the API pins the same one (ReauthEndpointTests).
    const updatePlayer = vi.fn().mockRejectedValue(new Error("Incorrect password."));
    openAccount({ player: { updatePlayer } });
    type("Username", "renamed");
    typePassword("wrong-one");
    show("Gameplay");
    await save();
    expect(screen.getByRole("alert").textContent).toBe("Incorrect password.");
    expect(note().textContent).toBe("Your profile isn't saved yet.");
    expect(expanded()).toEqual(["Account"]);
    expect(field("Username").value).toBe("renamed");
    expect(pw().value).toBe("");
    expect(pw().getAttribute("aria-invalid")).toBe("true");
    expect(described(pw())).toEqual(["Needed to change your username or email.", "Incorrect password."]);
    expect(document.activeElement).toBe(pw());
    typePassword("n");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(pw().getAttribute("aria-invalid")).toBe("false");
    expect(described(pw())).toEqual(["Needed to change your username or email."]);
  });

  it("any other refusal keeps the password and does not mark or focus the field", async () => {
    const updatePlayer = vi.fn().mockRejectedValue(new Error("Username 'taken' is already taken."));
    openAccount({ player: { updatePlayer } });
    type("Username", "taken");
    typePassword();
    await save();
    expect(screen.getByRole("alert").textContent).toBe("Username 'taken' is already taken.");
    expect(note().textContent).toBe("Your profile isn't saved yet.");
    expect(pw().value).toBe(MY_PASSWORD);
    expect(pw().getAttribute("aria-invalid")).toBe("false");
    expect(described(pw())).toEqual(["Needed to change your username or email."]);
    expect(document.activeElement).not.toBe(pw());
  });
});

describe("Settings: Sound & haptics (#86)", () => {
  const volume = () => screen.getByRole("slider", { name: "Volume" });
  const soundSwitch = () => screen.getByRole("switch", { name: /^Sound/ });
  const hapticsSwitch = () => screen.getByRole("switch", { name: /^Vibration/ });

  it("the header sums it up in both states: Sound and Vibration off, then Sound on with its volume and Vibration on", () => {
    open();
    expect(sectionButton("Sound & haptics").textContent).toContain("Sound off · vibration off");
    cleanup();
    open(withSettings({ soundOn: true, soundVolume: 80, hapticsOn: true }));
    expect(sectionButton("Sound & haptics").textContent).toContain("Sound on 80% · vibration on");
    cleanup();
    open(withSettings({ soundOn: true, soundVolume: 0, hapticsOn: false }));
    expect(sectionButton("Sound & haptics").textContent).toContain("Sound on 0% · vibration off"); // a volume of 0 is shown, not hidden
  });

  it("the summary follows the draft", () => {
    open();
    show("Sound & haptics");
    fireEvent.click(soundSwitch());
    expect(sectionButton("Sound & haptics").textContent).toContain("Sound on 50% · vibration off");
    fireEvent.change(volume(), { target: { value: "75" } });
    fireEvent.click(hapticsSwitch());
    expect(sectionButton("Sound & haptics").textContent).toContain("Sound on 75% · vibration on");
  });

  it("holds Sound, Volume and Vibration, all off by default, with the volume at 50%", () => {
    open();
    show("Sound & haptics");
    expect(soundSwitch().checked).toBe(false);
    expect(hapticsSwitch().checked).toBe(false);
    expect(volume().value).toBe("50");
    expect([volume().min, volume().max, volume().step]).toEqual(["0", "100", "5"]);
    expect(screen.getByText("50%").tagName).toBe("OUTPUT");
  });

  it("Volume is disabled and greyed while Sound is off, and works once Sound is on (and greys again when it is turned off)", () => {
    open();
    show("Sound & haptics");
    expect(volume().disabled).toBe(true);
    expect(volume().closest(".slider").classList.contains("off")).toBe(true);
    fireEvent.click(soundSwitch());
    expect(volume().disabled).toBe(false);
    expect(volume().closest(".slider").classList.contains("off")).toBe(false);
    fireEvent.change(volume(), { target: { value: "20" } });
    expect(volume().value).toBe("20");
    expect(screen.getByText("20%")).toBeTruthy();
    fireEvent.click(soundSwitch());
    expect(volume().disabled).toBe(true);
    expect(volume().value).toBe("20"); // kept, only greyed
  });

  it("Vibration does not depend on Sound", () => {
    open();
    show("Sound & haptics");
    fireEvent.click(hapticsSwitch());
    expect(hapticsSwitch().checked).toBe(true);
    expect(volume().disabled).toBe(true);
  });

  it("each control has its label, its hint as the accessible description, and an aria-hidden 'i'", () => {
    open();
    show("Sound & haptics");
    for (const [control, id, hint] of [[soundSwitch(), "soundOn", "Table sounds"], [volume(), "soundVolume", "Sound level"], [hapticsSwitch(), "hapticsOn", "Buzz on key moments"]]) {
      expect(control.getAttribute("aria-describedby")).toBe(`hd-${id}`);
      expect(document.getElementById(`hd-${id}`).textContent).toBe(hint);
      const mark = document.querySelector(`.hint-i[data-for="hd-${id}"]`);
      expect(mark.dataset.hint).toBe(hint);
      expect(mark.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("a header shows its dot, spoken as 'unsaved changes', for a sound change only; Discard clears it and the controls", () => {
    open();
    show("Sound & haptics");
    fireEvent.click(soundSwitch());
    expect(screen.getByRole("button", { name: /^Sound & haptics, unsaved changes/ })).toBeTruthy();
    for (const name of ["Table rules", "Gameplay", "Chips", "Appearance", "Account"]) expect(sectionButton(name).textContent, name).not.toMatch(/unsaved/);
    expect(document.querySelectorAll(".sec-dot")).toHaveLength(1);
    fireEvent.click(discardButton());
    expect(document.querySelectorAll(".sec-dot")).toHaveLength(0);
    expect(soundSwitch().checked).toBe(false);
  });

  it("Save sends only the sound keys that changed, in one changeSettings, and the controls keep the saved values", async () => {
    const { gameActions } = openLive();
    show("Sound & haptics");
    fireEvent.click(soundSwitch());
    fireEvent.change(volume(), { target: { value: "70" } });
    fireEvent.click(saveButton());
    await flush();
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ soundOn: true, soundVolume: 70 }]]);
    expect(note().textContent).toBe("Saved");
    expect(soundSwitch().checked).toBe(true);
    expect(volume().value).toBe("70");
    fireEvent.click(hapticsSwitch());
    fireEvent.click(saveButton());
    await flush();
    expect(gameActions.changeSettings.mock.calls[1]).toEqual([{ hapticsOn: true }]);
  });

  it("a sound change is a display setting: saved mid-round it never asks 'Start a new shoe?'", async () => {
    const { gameActions } = openLive({ phase: GamePhases.PLAYER_TURN });
    show("Sound & haptics");
    fireEvent.click(soundSwitch());
    fireEvent.click(saveButton());
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ soundOn: true }]]);
  });
});

describe("Settings: hints", () => {
  const controls = () => [...screen.queryAllByRole("radiogroup"), ...screen.queryAllByRole("switch"), ...screen.queryAllByRole("slider"), ...screen.queryAllByRole("group")];

  it.each(["Table rules", "Gameplay", "Chips", "Appearance", "Sound & haptics"])("every setting in %s has its 'i', and the same words are its accessible description", (name) => {
    open(withSettings({ resetInitialBet: true, autoDeal: true }));
    show(name);
    const found = controls().filter((c) => c.getAttribute("aria-describedby")?.startsWith("hd-"));
    expect(found.length).toBeGreaterThan(0);
    for (const control of found) {
      const id = control.getAttribute("aria-describedby");
      const text = document.getElementById(id).textContent;
      expect(text.length).toBeGreaterThan(3);
      expect(document.querySelector(`.hint-i[data-for="${id}"]`).dataset.hint).toBe(text);
    }
    // No unlabelled or undescribed control in the section.
    for (const control of controls().filter((c) => !c.closest(".chip-pick") || c.classList.contains("chip-pick"))) {
      expect(control.getAttribute("aria-describedby"), control.outerHTML.slice(0, 80)).toBeTruthy();
    }
  });

  it("a tap on the 'i' shows its hint and never toggles the control", () => {
    open();
    show("Gameplay");
    const mark = document.querySelector('.hint-i[data-for="hd-showTotals"]');
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 100, width: 18, top: 300, bottom: 318, right: 118, height: 18 });
    fireEvent.click(mark);
    expect(document.querySelector(".hint-tip").textContent).toBe("Hand totals on the table");
    expect(screen.getByRole("switch", { name: /^Show hand totals/ }).checked).toBe(true);
    expect(bar()).toBeNull();
  });
});

describe("Settings: Table messages, Show keyboard shortcuts and Currency (L2-1, L2-2, L2-3)", () => {
  const messages = () => within(screen.getByRole("radiogroup", { name: "Table messages" })).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked"), r.getAttribute("data-pick-messages")]);
  const currencies = () => within(screen.getByRole("radiogroup", { name: "Currency" })).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked"), r.getAttribute("data-pick-currency")]);

  it("Gameplay has Table messages as a three-way choice, Hints chosen, and saves the pick with the rest", () => {
    const { gameActions } = open({}, { messages: "hints" }); // renderUI makes the fake table say "all" unless asked
    show("Gameplay");
    expect(messages()).toEqual([["All", "false", "all"], ["Hints", "true", "hints"], ["Celebrations only", "false", "results"]]);
    fireEvent.click(screen.getByRole("radio", { name: "Celebrations only" }));
    expect(messages()[2][1]).toBe("true");
    expect(countText()).toBe("1 unsaved change");
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ tableMessages: "results" }]]);
  });

  it("Table messages shows the saved choice, and is a Gameplay setting (it is counted there, not under Table rules)", () => {
    open(withSettings({ tableMessages: "all" }));
    show("Gameplay");
    expect(messages()[0][1]).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Hints" }));
    expect(within(sectionButton("Gameplay")).getByText(/unsaved changes/)).toBeTruthy();
    expect(within(sectionButton("Table rules")).queryByText(/unsaved changes/)).toBeNull();
  });

  it("Show keyboard shortcuts is a switch, off by default, in Gameplay inside the desktop-only wrapper (the phone layout hides it), and saves", () => {
    const { gameActions } = open();
    show("Gameplay");
    const hints = screen.getByRole("switch", { name: /^Show keyboard shortcuts/ });
    expect(hints.checked).toBe(false);
    expect(hints.closest(".pc-only")).not.toBeNull();
    fireEvent.click(hints);
    expect(hints.checked).toBe(true);
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ showKeyHints: true }]]);
  });

  it("Appearance has Currency (Auto, $, £, €), Auto chosen, saves the pick, and the summary names it", () => {
    const { gameActions } = open();
    show("Appearance");
    expect(currencies()).toEqual([["Auto", "true", "auto"], ["$", "false", "USD"], ["£", "false", "GBP"], ["€", "false", "EUR"]]);
    expect(sectionButton("Appearance").textContent).toContain("Green felt · Emerald · Dark · $"); // Auto shows what it resolves to (jsdom: en-US)
    fireEvent.click(document.querySelector("[data-pick-currency=GBP]"));
    expect(sectionButton("Appearance").textContent).toContain("Green felt · Emerald · Dark · £");
    fireEvent.click(saveButton());
    expect(gameActions.changeSettings.mock.calls).toEqual([[{ currency: "GBP" }]]);
  });

  it("Currency shows the saved choice", () => {
    open(withSettings({ currency: "EUR" }));
    show("Appearance");
    expect(currencies().find(([, on]) => on === "true")[2]).toBe("EUR");
    expect(sectionButton("Appearance").textContent).toContain("· €");
  });
});

describe("Settings: a password change already running (#196)", () => {
  const fill = () => { show("Account"); type("Current password", "old-pass"); type("New password", "new-pass1"); };
  const button = () => screen.getByRole("button", { name: "Change password" });

  it("an ignored press (false) says nothing and keeps both fields", async () => {
    const changePassword = vi.fn().mockResolvedValue(false);
    open({}, { player: { changePassword } });
    fill();
    fireEvent.click(button());
    await flush();
    expect(changePassword).toHaveBeenCalledOnce();
    noNote();
    expect([field("Current password").value, field("New password").value]).toEqual(["old-pass", "new-pass1"]);
  });

  it.each([[true, "true"], [false, "false"]])("changingPassword %s: the filled form's button has aria-disabled %s", (changingPassword, disabled) => {
    open({}, { player: { changingPassword } });
    fill();
    expect(button().getAttribute("aria-disabled")).toBe(disabled);
  });
});

describe("Settings: a save while the saved settings have not loaded (#196)", () => {
  const FAILED = "Couldn't save your settings to your account. They apply here until you reload.";
  const UNLOADED = "Your saved settings haven't loaded, so this wasn't saved. It applies here until they load.";

  it.each([[true, UNLOADED], [false, FAILED]])("settingsUnloaded %s: a failed save says so", async (settingsUnloaded, text) => {
    open({ settingsUnloaded }, { actions: { changeSettings: vi.fn().mockRejectedValue(new Error("no")) } });
    show("Gameplay");
    fireEvent.click(screen.getByRole("switch", { name: /^Show the count/ }));
    fireEvent.click(saveButton());
    await flush();
    expect(note().textContent).toBe(text);
    expect(note().className).toContain("error");
  });
});
