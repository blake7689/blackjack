// The display settings drive four axes on <html> (tokens.css reads them): data-felt, data-accent, data-mode and the
// class no-totals. `mode: "system"` resolves through prefers-color-scheme. meta[name=theme-color] follows --bg. //
export const resolveMode = (mode, systemLight) => (mode === "system" ? (systemLight ? "light" : "dark") : mode);

export function applyTheme({ feltTheme, accent, mode, showTotals }, systemLight, root = document.documentElement) {
  root.dataset.felt = feltTheme;
  root.dataset.accent = accent;
  root.dataset.mode = resolveMode(mode, systemLight);
  root.classList.toggle("no-totals", showTotals === false);
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}
