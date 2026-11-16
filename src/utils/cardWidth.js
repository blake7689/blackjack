// Card size from the width CSS computed (--cwr on .stage-in; see tokens.css): a whole-pixel width of at least 40, and a
// height of width x 1.452 rounded and bumped so (height - width) is even, so a card face never resamples. //
export const MIN_CARD_WIDTH = 40;

export function cardSize(cwr) {
  const cw = Math.max(MIN_CARD_WIDTH, Math.floor(cwr) || 70); // an unmeasurable (0 / NaN) width falls back to 70, as the mockup does
  let ch = Math.round(cw * 1.452);
  if ((ch - cw) % 2) ch += 1;
  return { cw, ch };
}
