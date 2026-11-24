import { describe, it, expect, afterEach, vi } from "vitest";
import { currencyFor, money, setCurrency, signed, symbolOf } from "../money";

// Play money shows in the player's currency (L2-2): the amounts are 1:1, only the symbol changes; "auto" follows the device's language.
afterEach(() => { setCurrency("USD"); vi.unstubAllGlobals(); });

describe("currencyFor", () => {
  it("a chosen currency is used as it is, whatever the language", () => {
    expect(currencyFor("USD", "en-GB")).toBe("USD");
    expect(currencyFor("GBP", "de-DE")).toBe("GBP");
    expect(currencyFor("EUR", "en-US")).toBe("EUR");
  });

  it("auto: Great Britain is pounds, the euro area is euros, anything else is dollars", () => {
    expect(currencyFor("auto", "en-GB")).toBe("GBP");
    expect(currencyFor("auto", "en-US")).toBe("USD");
    expect(currencyFor("auto", "de-DE")).toBe("EUR");
    expect(currencyFor("auto", "en-IE")).toBe("EUR");
    expect(currencyFor("auto", "pt-PT")).toBe("EUR");
    expect(currencyFor("auto", "ja-JP")).toBe("USD");
    expect(currencyFor("auto", "en-AU")).toBe("USD");
  });

  it("auto: a language with no region is read for its likeliest one, and one that cannot be read is dollars", () => {
    expect(currencyFor("auto", "fr")).toBe("EUR");
    expect(currencyFor("auto", "en")).toBe("USD");
    expect(currencyFor("auto", "")).toBe("USD");
    expect(currencyFor("auto", "not a language")).toBe("USD");
  });

  it("auto reads the device's own language when none is given", () => {
    vi.stubGlobal("navigator", { language: "en-GB" });
    expect(currencyFor("auto")).toBe("GBP");
  });
});

describe("money and signed", () => {
  it("show the symbol of the current currency and nothing else changes", () => {
    expect(money(10)).toBe("$10");
    expect(money(1234.5)).toBe("$1,234.50");
    setCurrency("GBP");
    expect([money(10), money(2.2), money(-25), money(0)]).toEqual(["£10", "£2.20", "£25", "£0"]);
    expect([signed(10), signed(-2.2), signed(0)]).toEqual(["+£10", "-£2.20", "£0"]);
    setCurrency("EUR");
    expect(money(1234.5)).toBe("€1,234.50");
  });

  it("auto follows the language at the time it is set", () => {
    vi.stubGlobal("navigator", { language: "de-DE" });
    setCurrency("auto");
    expect(money(5)).toBe("€5");
    vi.stubGlobal("navigator", { language: "en-US" });
    setCurrency("auto");
    expect(money(5)).toBe("$5");
  });

  it("symbolOf says what a setting would show, without changing the current one", () => {
    expect([symbolOf("USD"), symbolOf("GBP"), symbolOf("EUR")]).toEqual(["$", "£", "€"]);
    expect(symbolOf("auto")).toBe("$"); // jsdom's language is en-US
    expect(money(1)).toBe("$1");
  });
});
