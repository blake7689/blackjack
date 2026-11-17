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

export const DEFAULT_CHIP = 25; // selected on arrival (DESIGN section 8)
export const MAX_STACK = 10; // chips drawn in one stack; the exact amount is on its label

// The chips a stack draws: the amount split greedily into the largest allowed chips, biggest first, the biggest MAX_STACK kept.
// Counted in cents, so 2.5 never drifts; anything under $1 (half a dollar of insurance) has no chip. //
export function splitChips(amount) {
  let left = Math.round(amount * 100);
  const out = [];
  for (const chip of [...ALLOWED_CHIPS].reverse()) {
    while (left >= chip * 100) { out.push(chip); left -= chip * 100; }
  }
  return out.slice(0, MAX_STACK);
}

// The chip selected in the rack: `picked` if the rack shows it, else the largest shown below it, else the smallest. null with no chips. //
export function effectiveChip(chips, picked) {
  return chips.includes(picked) ? picked : chips.filter((chip) => chip <= picked).at(-1) ?? chips[0] ?? null;
}
