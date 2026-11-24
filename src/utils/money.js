// Play money as the table shows it: whole units plain, cents (6:5 pays 2.2x) with two places. Amounts are 1:1 in every currency, only the symbol changes (L2-2). //
const SYMBOLS = { USD: "$", GBP: "£", EUR: "€" };
const EURO_AREA = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);

// The currency a `currency` setting means: "USD", "GBP" or "EUR" as saved, or for "auto" the one the device's language region implies (GB: pounds,
// the euro area: euros, anything else, and a language with no region it can guess, dollars). //
export function currencyFor(setting, language = navigator.language) {
  if (setting !== "auto") return setting;
  let region;
  try { region = new Intl.Locale(language).maximize().region; } catch { /* an unreadable language tag: dollars */ }
  return region === "GB" ? "GBP" : EURO_AREA.has(region) ? "EUR" : "USD";
}

// The symbol in use: set once per settings change by GameProvider (like setSoundPrefs), so `money` stays a plain function of the amount.
let symbol = SYMBOLS[currencyFor("auto")];
export const setCurrency = (setting) => { symbol = SYMBOLS[currencyFor(setting)]; };
export const symbolOf = (setting) => SYMBOLS[currencyFor(setting)]; // what a setting would show, for Settings' summary

export const money = (n) => `${symbol}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
export const signed = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + money(n);
