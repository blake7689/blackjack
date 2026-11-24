// The display settings drive four axes on <html> (tokens.css reads them): data-felt, data-accent, data-mode and the
// class no-totals. `mode: "system"` resolves through prefers-color-scheme. meta[name=theme-color] follows --bg. //
export const FELTS = [["green", "Green"], ["blue", "Blue"], ["red", "Red"]];
export const ACCENTS = [["emerald", "Emerald", "#1ed18a"], ["sapphire", "Sapphire", "#6b95ff"], ["ember", "Ember", "#ff7b3f"], ["orchid", "Orchid", "#c28dff"]]; // key, name, the dot's colour
export const resolveMode = (mode, systemLight) => (mode === "system" ? (systemLight ? "light" : "dark") : mode);

export function applyTheme({ feltTheme, accent, mode, showTotals }, systemLight, root = document.documentElement) {
  root.dataset.felt = feltTheme;
  root.dataset.accent = accent;
  root.dataset.mode = resolveMode(mode, systemLight);
  root.classList.toggle("no-totals", showTotals === false);
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}

// The last applied look is kept in localStorage so the next load paints it before the saved settings arrive (no flash of the defaults).
// Every access is guarded: storage can be blocked, full or hold anything, and a bad value is ignored key by key. //
const LOOK_KEY = "bj.look";
const VALID = {
  feltTheme: (v) => FELTS.some(([key]) => key === v),
  accent: (v) => ACCENTS.some(([key]) => key === v),
  mode: (v) => ["dark", "light", "system"].includes(v),
  showTotals: (v) => typeof v === "boolean",
};

export function saveLook({ feltTheme, accent, mode, showTotals }) {
  try { localStorage.setItem(LOOK_KEY, JSON.stringify({ feltTheme, accent, mode, showTotals })); } catch { /* private mode or full: the look just is not remembered */ }
}

// `base` (the default settings) with the stored look laid over it.
export function readLook(base) {
  try {
    const stored = JSON.parse(localStorage.getItem(LOOK_KEY));
    return { ...base, ...Object.fromEntries(Object.entries(VALID).filter(([key, ok]) => ok(stored?.[key])).map(([key]) => [key, stored[key]])) };
  } catch {
    return base;
  }
}
