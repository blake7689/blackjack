// The felt print and the message line are one block, centred between the dealer's hand and the first seat (DESIGN section 4): it is
// translated by --py (the print's and the message's `translate`). Measured by boxes, never by the cards, so it does not jump while they
// fly; never closer to the player's cards than 8 px plus room for a two-line verdict ("Insurance lost").
// `el` is the stage or anything in it (the print calls this with itself, before its parents' refs are set).
export function centrePrint(el) {
  const stage = el.closest(".stage-in");
  const seat = stage.querySelector(".seat");
  const text = [...stage.querySelectorAll(".print text")].map((t) => t.getBoundingClientRect()).filter((r) => r.height);
  if (!seat || !text.length) return;
  const py = parseFloat(stage.style.getPropertyValue("--py")) || 0; // the block's current shift: measure it unshifted
  const above = stage.querySelector(".dealer-container").getBoundingClientRect().bottom;
  const below = seat.getBoundingClientRect().top;
  const top = Math.min(...text.map((r) => r.top)) - py;
  const bottom = Math.max(...text.map((r) => r.bottom), stage.querySelector(".msg").getBoundingClientRect().bottom, stage.querySelector(".mid").getBoundingClientRect().bottom + 20) - py;
  const shift = Math.min(Math.round((above + below) / 2 - (top + bottom) / 2), Math.floor(below - 8 - bottom));
  stage.style.setProperty("--py", `${Math.max(0, shift)}px`);
}
