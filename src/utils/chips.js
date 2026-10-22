import { ALLOWED_CHIPS } from "./constants/chips";

// chipValues is saved as a comma-separated string (the settings API only takes flat values), e.g. "1,5,25". //
export const DEFAULT_CHIP_VALUES = ALLOWED_CHIPS.join(",");

// The chips named in `value`, keeping only allowed ones, without repeats, smallest first. Empty if none. //
export function parseChipValues(value) {
  const named = String(value).split(",").map(Number);
  return ALLOWED_CHIPS.filter((chip) => named.includes(chip));
}

// Always in chip order, so a draft string only differs from the saved one when the choice does. //
export function formatChipValues(chips) {
  return ALLOWED_CHIPS.filter((chip) => chips.includes(chip)).join(",");
}

// The chips to offer: selected ones the player can afford. If none fit but they have at least 1,
// the largest allowed chip they can afford, so they are never stuck. //
export function visibleChips(chipValues, credits) {
  const affordable = parseChipValues(chipValues).filter((chip) => chip <= credits);
  if (affordable.length || credits < 1) return affordable;
  return [ALLOWED_CHIPS.filter((chip) => chip <= credits).at(-1)];
}
