// When the dealer gets its second card. The values are stored in saved settings (#36): never change them.
export const DealerHoleOptions = {
  US_NO_PEEK: "drawEarly_NoCheck",
  US_PEEK: "drawEarly_Check",
  EU: "drawAfter",
};

// What the Settings select shows for each mode.
export const DealerHoleLabels = {
  [DealerHoleOptions.US_NO_PEEK]: "Draw Early - No Check (US)",
  [DealerHoleOptions.US_PEEK]: "Draw Early - Check (US)",
  [DealerHoleOptions.EU]: "Draw After (EU)",
};
