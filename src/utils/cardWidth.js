// Card size from the width CSS computed (--cwr on .stage-in; see tokens.css): a whole-pixel width of at least 40, and a
// height of width x 1.452 rounded and bumped so (height - width) is even, so a card face never resamples. //
export const MIN_CARD_WIDTH = 40;

// How far each card of a hand lies past the one before it: 0.27 of a card, whole pixels (the rank and suit corner is 20 % of the card).
export const cardStep = (cw) => Math.round(cw * 0.27);

export function cardSize(cwr) {
  const cw = Math.max(MIN_CARD_WIDTH, Math.floor(cwr) || 70); // an unmeasurable (0 / NaN) width falls back to 70, as the mockup does
  let ch = Math.round(cw * 1.452);
  if ((ch - cw) % 2) ch += 1;
  return { cw, ch };
}

// How wide the dealer's hand may be before it slides left (the hand is centred on the stage): clear of the shoe (`shoeLeft` is the left edge of
// its corner card, null when it has no size yet; half the hand may reach it, with 8 px to spare), with room for the total and a margin, and never
// under a card and a half. `centre` is the stage's centre x.
export function dealerRoom({ stageW, cw, shoeLeft, centre }) {
  const shoeRoom = shoeLeft == null ? Infinity : 2 * (shoeLeft + 8 - centre) - 4;
  return Math.max(cw * 1.6, Math.min(stageW - 2 * (cw * 0.55 + 14), stageW - 2 * 58, shoeRoom));
}
