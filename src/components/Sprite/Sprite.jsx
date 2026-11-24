// The table's SVG symbols, inline in the page so their CSS variables reach inside (a file loaded through <img> or a
// url() cannot see them). The card back (#81): the mockup's `#cardback` (assets/sprite.svg, built by its
// build.mjs). Graphite ground (--back-bg), white border, a lattice and waves and a guilloche rosette in the accent
// (--back-ink), the wordmark on a plate in --back-hi. Use it as <svg viewBox="0 0 250 363"><use href="#cardback" /></svg>.
import { memo } from "react";
import ChipSymbols from "./ChipSymbols";
const WAVES = Array.from({ length: 9 }, (_, i) => `M22 ${(40 + i * 35.4).toFixed(1)} q12.9 -9 25.8 0` + " t25.8 0".repeat(7));
const ROSETTE = Array.from({ length: 18 }, (_, i) => i * 10);
const ICONS = [
  ["i-menu", <path d="M4 7h16M4 12h16M4 17h10" />],
  ["i-settings", <><path d="M4 7h9M18 7h2M4 17h3M12 17h8" /><circle cx="15.5" cy="7" r="2.5" /><circle cx="9.5" cy="17" r="2.5" /></>],
  ["i-chart", <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3" />],
  ["i-rules", <><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>],
  ["i-back", <path d="M15 5l-7 7 7 7" />],
  ["i-logout", <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4" />],
  // the dock's betting keys and the out-of-credits note (#82)
  ["i-undo", <><path d="M9 7L4.5 11.5 9 16" /><path d="M5 11.5h9.5a5 5 0 0 1 0 10H11" /></>],
  ["i-clear", <path d="M6 6l12 12M18 6L6 18" />],
  ["i-rebet", <><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15" /><path d="M4 20v-5h5" /></>],
  ["i-info", <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v6M12 7.5v.5" /></>],
  // the play, offers and results keys (#166 L1-10): the mockup's i-hit ... i-money
  ["i-hit", <path d="M12 5v14M5 12h14" />],
  ["i-stay", <path d="M5 12h14" />],
  ["i-double", <><rect x="4" y="7" width="9" height="13" rx="2" /><path d="M9 4h9a2 2 0 0 1 2 2v11" /></>],
  ["i-split", <path d="M12 20v-6M12 14L6 6M12 14l6-8M6 6v4M6 6h4M18 6v4M18 6h-4" />],
  ["i-surrender", <path d="M6 21V4M6 4h11l-2.5 4 2.5 4H6" />],
  ["i-triple", <><rect x="3" y="9" width="8" height="12" rx="1.8" /><path d="M7 6h8a2 2 0 0 1 2 2v10" /><path d="M11 3h8a2 2 0 0 1 2 2v10" /></>],
  ["i-pause", <path d="M9 6v12M15 6v12" />],
  ["i-play", <path d="M8 5.5v13l10.5-6.5z" />],
  ["i-next", <path d="M5 12h13M13 6l6 6-6 6" />],
  ["i-shield", <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />],
  ["i-money", <><path d="M7 12h10M12 7v10" /><circle cx="12" cy="12" r="8.5" /></>],
  // Settings (#84): the section chevron and the preset list's tick
  ["i-chevron", <path d="M7 10l5 5 5-5" />],
  ["i-check", <path d="M5 12.5l4.5 4.5L19 7.5" />],
];

function Sprite() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        <linearGradient id="paperLight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".1" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".1" />
        </linearGradient>
        <pattern id="backLattice" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H9M0 0V9" stroke="var(--back-ink,#1ed18a)" strokeOpacity=".14" strokeWidth=".6" />
        </pattern>
      </defs>
      <ChipSymbols />
      <symbol id="cardback" viewBox="0 0 250 363">
        <rect width="250" height="363" rx="13" fill="#f6f4ee" />
        <rect x="10" y="10" width="230" height="343" rx="8" fill="var(--back-bg,#101413)" />
        <rect x="10" y="10" width="230" height="343" rx="8" fill="url(#backLattice)" />
        <g fill="none" stroke="var(--back-ink,#1ed18a)" strokeWidth=".7" opacity=".45">{WAVES.map((d) => <path key={d} d={d} />)}</g>
        <rect x="17" y="17" width="216" height="329" rx="5" fill="none" stroke="var(--back-ink,#1ed18a)" strokeWidth="1.2" opacity=".75" />
        <rect x="21" y="21" width="208" height="321" rx="3" fill="none" stroke="var(--back-ink,#1ed18a)" strokeWidth=".6" opacity=".5" />
        <g fill="none" stroke="var(--back-ink,#1ed18a)" strokeWidth=".5" opacity=".55">
          {ROSETTE.map((a) => <ellipse key={a} cx="125" cy="181.5" rx="92" ry="30" transform={`rotate(${a} 125 181.5)`} />)}
        </g>
        <rect x="29.4" y="155.5" width="191.2" height="52" rx="26" fill="var(--back-bg,#101413)" stroke="var(--back-ink,#1ed18a)" strokeWidth="1.1" />
        <g transform="translate(43.4 164.9) scale(0.6)">
          <g fill="none" stroke="var(--back-hi,#c4f7df)" strokeWidth="6.5" strokeLinejoin="miter" strokeLinecap="butt">
            <path d="M3 4V44M3 4H14A9.5 9.5 0 0 1 14 23H3M3 23H16A10.5 10.5 0 0 1 16 44H3" />
            <path d="M38 4V44" />
            <path d="M77 16V44M63 16A14 14 0 1 0 63 44A14 14 0 1 0 63 16" />
            <path d="M89 4V44M89 33L106 16M96 26L108 44" />
            <path d="M117 30H145A14 14 0 1 0 140.9 39.9" />
            <path d="M162 16V50A8 8 0 0 1 154 58H150" />
            <path d="M203 16V44M189 16A14 14 0 1 0 189 44A14 14 0 1 0 189 16" />
            <path d="M238.9 20.1A14 14 0 1 0 238.9 39.9" />
            <path d="M250 4V44M250 33L267 16M257 26L269 44" />
          </g>
          <path d="M162 0L166.5 4.5L162 9L157.5 4.5Z" fill="var(--back-ink,#1ed18a)" />
        </g>
        <rect width="250" height="363" rx="13" fill="url(#paperLight)" />
      </symbol>
      {/* the top bar's icons (the mockup's i-menu, i-settings, i-chart, i-rules, i-logout): 24 px grid, 1.75 stroke, the text colour */}
      {ICONS.map(([id, d]) => (
        <symbol key={id} id={id} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{d}</symbol>
      ))}
    </svg>
  );
}

// Static: a route change re-renders App, and the sprite (the chips alone are thousands of elements) must not be rebuilt each time.
export default memo(Sprite);
