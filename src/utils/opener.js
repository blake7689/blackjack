// WebKit does not focus a button on click, so document.activeElement is <body> when a dialog opens and closing it has nothing to
// give focus back to (#172). Remember the last pressed button or link and fall back to it. //
let pressed = null;

document.addEventListener("pointerdown", (e) => { pressed = e.target.closest("button, a[href]"); }, true);

export function focusTarget() {
  const active = document.activeElement;
  if (active && active !== document.body) return active;
  return pressed?.isConnected ? pressed : null;
}
