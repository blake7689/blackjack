// Blakejack mockup art generator (round 2). Run: node mockup/assets/build.mjs
// Writes assets/sprite.svg (every table object and icon as a <symbol>; mockup.js inlines it so CSS variables reach inside)
// and assets/brand/*.svg (the wordmark as standalone files: pure paths, no font needed).
// Light: one overhead lamp, slightly toward the player (top-left highlight, bottom-right shade).
import { writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const f = (n) => Math.round(n * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;
const pt = (r, deg, cx = 50, cy = 50) => [f(cx + r * Math.sin(rad(deg))), f(cy - r * Math.cos(rad(deg)))]; // 0 deg = 12 o'clock, clockwise
function sector(r1, r2, a0, a1, cx = 50, cy = 50) {
  const [x0, y0] = pt(r2, a0, cx, cy), [x1, y1] = pt(r2, a1, cx, cy), [x2, y2] = pt(r1, a1, cx, cy), [x3, y3] = pt(r1, a0, cx, cy);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r2} ${r2} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r1} ${r1} 0 ${big} 0 ${x3} ${y3}Z`;
}

/* ---------- the wordmark: a monoline geometric logotype drawn as strokes (x-height 28, cap 40, stroke 6) ---------- */
// Capital B, single-storey a's, an e with a horizontal bar, open c, k's with a short arm, and the j's tittle as the accent diamond.
export const WORDMARK = {
  w: 272, h: 62,
  ink: [
    "M3 4V44M3 4H14A9.5 9.5 0 0 1 14 23H3M3 23H16A10.5 10.5 0 0 1 16 44H3", // B
    "M38 4V44", // l
    "M77 16V44M77 30A14 14 0 1 0 77 30.01", // a (bowl drawn as a full circle, stem on the right)
    "M89 4V44M89 33L106 16M96 26L108 44", // k
    "M117 30H145A14 14 0 1 0 140.9 39.9", // e
    "M162 16V50A8 8 0 0 1 154 58H150", // j
    "M195 16V44M195 30A14 14 0 1 0 195 30.01", // a
    "M238.9 20.1A14 14 0 1 0 238.9 39.9", // c
    "M250 4V44M250 33L267 16M257 26L269 44", // k
  ],
  pip: "M162 0L166.5 4.5L162 9L157.5 4.5Z", // the j's tittle
};
// the a's: the stroke circle centre must sit 14 left of the stem
WORDMARK.ink[2] = "M77 16V44M63 16A14 14 0 1 0 63 44A14 14 0 1 0 63 16";
WORDMARK.ink[6] = "M203 16V44M189 16A14 14 0 1 0 189 44A14 14 0 1 0 189 16";
const wmPaths = (ink, accent, sw = 6) => `<g fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="miter" stroke-linecap="butt">${WORDMARK.ink.map((d) => `<path d="${d}"/>`).join("")}</g><path d="${WORDMARK.pip}" fill="${accent}"/>`;
const WM_VB = "-2 -2 276 64";

/* ---------- ceramic chips: flat printed face, fine artwork, thin gloss, thin edge ---------- */
export const CHIPS = {
  1: { body: "#ebe8e1", print: "#27458f", mid: "#e2ded5", ink: "#1f3473", side: "#c9c4b8", label: "1" },
  5: { body: "#a5222b", print: "#f1ebe0", mid: "#9a1f27", ink: "#f6f1e7", side: "#7b161d", label: "5" },
  10: { body: "#1f4a96", print: "#f1ebe0", mid: "#1c4389", ink: "#f6f1e7", side: "#143672", label: "10" },
  25: { body: "#1e6a45", print: "#f1ebe0", mid: "#1b603f", ink: "#f6f1e7", side: "#134d31", label: "25" },
  50: { body: "#c8682a", print: "#1d2b4d", mid: "#bf6227", ink: "#fff6ea", side: "#9a4b19", label: "50" },
  100: { body: "#1c1c21", print: "#e9e2d2", mid: "#232329", ink: "#f2ecdf", side: "#0b0b0d", label: "100" },
  1000: { body: "#d6a92c", print: "#22201a", mid: "#cfa128", ink: "#2a2414", side: "#a8831a", label: "1K" },
  5000: { body: "#5e3a24", print: "#ead8b2", mid: "#56351f", ink: "#f4e6c8", side: "#3e2615", label: "5K" },
};
const BLOCKS = [0, 45, 90, 135, 180, 225, 270, 315];
function chipFace(v, numeral) {
  const c = CHIPS[v];
  const blocks = BLOCKS.map((a) => {
    const lines = [-5, -2.5, 0, 2.5, 5].map((o) => `<path d="${sector(42.2, 48.6, a + o - 0.45, a + o + 0.45)}"/>`).join("");
    return `<path d="${sector(41.6, 49.2, a - 8.5, a + 8.5)}" fill="${c.print}"/><g fill="${c.body}">${lines}</g>`;
  }).join("");
  const dots = BLOCKS.map((a) => { const [x, y] = pt(45.4, a + 22.5); return `<circle cx="${x}" cy="${y}" r="1.25"/>`; }).join("");
  const hatch = Array.from({ length: 96 }, (_, i) => { const a = i * 3.75; const [x1, y1] = pt(31.2, a), [x2, y2] = pt(38.6, a); return `M${x1} ${y1}L${x2} ${y2}`; }).join("");
  const size = c.label.length >= 3 ? 28 : 32; // 12 px or more on a 44 px chip
  const centre = numeral
    ? `<text x="50" y="50" dy=".35em" text-anchor="middle" font-family="'Clash Display','Satoshi',system-ui,sans-serif" font-weight="600" font-size="${size}" letter-spacing="-.8" fill="${c.ink}">${c.label}</text>`
    : `<path d="M50 44.5l5.5 5.5-5.5 5.5-5.5-5.5z" fill="${c.ink}" opacity=".9"/>`;
  return `<symbol id="chip-${v}${numeral ? "" : "-p"}" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="49.6" fill="${c.body}"/>
  ${blocks}<g fill="${c.print}" opacity=".85">${dots}</g>
  <circle cx="50" cy="50" r="40.6" fill="none" stroke="${c.print}" stroke-width=".8" opacity=".9"/>
  <circle cx="50" cy="50" r="39.4" fill="${c.mid}"/>
  <path d="${hatch}" stroke="${c.print}" stroke-width=".35" opacity=".28" fill="none"/>
  <circle cx="50" cy="50" r="30.4" fill="${c.body}" stroke="${c.print}" stroke-width=".8"/>
  <circle cx="50" cy="50" r="28.6" fill="none" stroke="${c.print}" stroke-width=".35" opacity=".6"/>
  ${centre}
  <circle cx="50" cy="50" r="49.6" fill="url(#ceramicGloss)"/>
  <circle cx="50" cy="50" r="49.2" fill="none" stroke="url(#ceramicRim)" stroke-width=".9"/>
</symbol>`;
}
// The side band seen below the face in a stack: the edge print wraps round it as thin stripes.
function chipSide(v) {
  const c = CHIPS[v];
  const bars = [112.5, 157.5, 202.5, 247.5].map((a) => { const x = 50 + 49.6 * Math.sin(rad(a)); const w = 7 * Math.abs(Math.cos(rad(a - 180))); return `<rect x="${f(x - w / 2)}" y="0" width="${f(w)}" height="100" fill="${c.print}" opacity=".85"/>`; }).join("");
  return `<symbol id="side-${v}" viewBox="0 0 100 100"><clipPath id="sc-${v}"><circle cx="50" cy="50" r="49.6"/></clipPath>
  <g clip-path="url(#sc-${v})"><rect width="100" height="100" fill="${c.side}"/>${bars}<rect width="100" height="100" fill="url(#sideShade)"/></g></symbol>`;
}

/* ---------- card back: graphite, accent guilloche, the wordmark across the centre ---------- */
function cardBack() {
  const cx = 125, cy = 181.5;
  const rosette = Array.from({ length: 18 }, (_, i) => `<ellipse cx="${cx}" cy="${cy}" rx="92" ry="30" transform="rotate(${i * 10} ${cx} ${cy})"/>`).join("");
  const waves = Array.from({ length: 9 }, (_, i) => `<path d="M22 ${40 + i * 35.4} q12.9 -9 25.8 0 t25.8 0 t25.8 0 t25.8 0 t25.8 0 t25.8 0 t25.8 0 t25.8 0"/>`).join("");
  const s = 0.6, w = WORDMARK.w * s;
  return `<symbol id="cardback" viewBox="0 0 250 363">
  <rect width="250" height="363" rx="13" fill="#f6f4ee"/>
  <rect x="10" y="10" width="230" height="343" rx="8" fill="var(--back-bg,#101413)"/>
  <rect x="10" y="10" width="230" height="343" rx="8" fill="url(#backLattice)"/>
  <g fill="none" stroke="var(--back-ink,#1ed18a)" stroke-width=".7" opacity=".45">${waves}</g>
  <rect x="17" y="17" width="216" height="329" rx="5" fill="none" stroke="var(--back-ink,#1ed18a)" stroke-width="1.2" opacity=".75"/>
  <rect x="21" y="21" width="208" height="321" rx="3" fill="none" stroke="var(--back-ink,#1ed18a)" stroke-width=".6" opacity=".5"/>
  <g fill="none" stroke="var(--back-ink,#1ed18a)" stroke-width=".5" opacity=".55">${rosette}</g>
  <rect x="${cx - w / 2 - 14}" y="${cy - 26}" width="${w + 28}" height="52" rx="26" fill="var(--back-bg,#101413)" stroke="var(--back-ink,#1ed18a)" stroke-width="1.1"/>
  <g transform="translate(${f(cx - w / 2)} ${f(cy - 31 * s + 2)}) scale(${s})">${wmPaths("var(--back-hi,#c4f7df)", "var(--back-ink,#1ed18a)", 6.5)}</g>
  <rect width="250" height="363" rx="13" fill="url(#paperLight)"/>
</symbol>`;
}
// The shoe itself is off the table: only the corner of its top card shows, with the dark lip of the mouth along it.
const shoeCorner = `<symbol id="shoecorner" viewBox="0 0 120 120">
  <g transform="rotate(-32 120 0)"><use href="#cardback" x="40" y="-60" width="110" height="160"/></g>
  <path d="M120 0V120" stroke="#000" stroke-opacity=".25" stroke-width="2"/>
</symbol>
<symbol id="cutcorner" viewBox="0 0 120 120"><g transform="rotate(-38 120 0)"><rect x="46" y="-58" width="104" height="156" rx="6" fill="#f2c434" fill-opacity=".94" stroke="#b18a12"/><rect x="50" y="-54" width="96" height="148" rx="4" fill="url(#plasticSheen)"/></g></symbol>`;

/* ---------- icons (24 px, 1.75 stroke) ---------- */
const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  settings: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="9.5" cy="17" r="2.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  undo: '<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H11"/>',
  clear: '<path d="M6 6l12 12M18 6L6 18"/>',
  rebet: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15"/><path d="M4 20v-5h5"/>',
  hit: '<path d="M12 5v14M5 12h14"/>',
  stay: '<path d="M5 12h14"/>',
  double: '<rect x="4" y="7" width="9" height="13" rx="2"/><path d="M9 4h9a2 2 0 0 1 2 2v11"/>',
  split: '<path d="M12 20v-6M12 14L6 6M12 14l6-8M6 6v4M6 6h4M18 6v4M18 6h-4"/>',
  surrender: '<path d="M6 21V4M6 4h11l-2.5 4 2.5 4H6"/>',
  triple: '<rect x="3" y="9" width="8" height="12" rx="1.8"/><path d="M7 6h8a2 2 0 0 1 2 2v10"/><path d="M11 3h8a2 2 0 0 1 2 2v10"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v6M12 7.5v.5"/>',
  chart: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
  rules: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4"/>',
  next: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>',
  money: '<path d="M7 12h10M12 7v10"/><circle cx="12" cy="12" r="8.5"/>',
  chevron: '<path d="M7 10l5 5 5-5"/>',
};
const iconSymbols = Object.entries(ICONS).map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`).join("\n");

const defs = `<defs>
<linearGradient id="ceramicGloss" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".38" stop-color="#fff" stop-opacity=".04"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
<linearGradient id="ceramicRim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
<linearGradient id="sideShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".3" stop-color="#000" stop-opacity=".05"/><stop offset=".55" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
<linearGradient id="plasticSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".4" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
<linearGradient id="paperLight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient>
<pattern id="backLattice" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H9M0 0V9" stroke="var(--back-ink,#1ed18a)" stroke-opacity=".14" stroke-width=".6"/></pattern>
</defs>`;

const sprite = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">
<!-- generated by assets/build.mjs; do not edit by hand -->
${defs}
${Object.keys(CHIPS).map((v) => chipFace(v, true) + chipFace(v, false) + chipSide(v)).join("\n")}
${cardBack()}
${shoeCorner}
<symbol id="wordmark" viewBox="${WM_VB}">${wmPaths("currentColor", "var(--accent,#1ed18a)")}</symbol>
${iconSymbols}
</svg>
`;
writeFileSync(join(here, "sprite.svg"), sprite);

/* ---------- standalone brand files (pure paths) ---------- */
const brandDir = join(here, "brand");
for (const old of readdirSync(brandDir)) unlinkSync(join(brandDir, old)); // round-1 marks (monogram, card mark) are retired
const emerald = "#1ed18a", ink = "#0b0d0c", paper = "#f4f3ef";
const files = {
  "wordmark-on-dark.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -22 320 106" width="640" height="212"><title>Blakejack wordmark on dark</title><rect x="-24" y="-22" width="320" height="106" fill="${ink}"/>${wmPaths(paper, emerald)}</svg>`,
  "wordmark-on-light.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -22 320 106" width="640" height="212"><title>Blakejack wordmark on light</title><rect x="-24" y="-22" width="320" height="106" fill="${paper}"/>${wmPaths(ink, "#0b9d63")}</svg>`,
  "wordmark.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WM_VB}" width="528" height="128"><title>Blakejack wordmark (transparent, currentColor ink)</title><g style="color:${ink}">${wmPaths("currentColor", emerald)}</g></svg>`,
};
for (const [name, svg] of Object.entries(files)) writeFileSync(join(brandDir, name), svg + "\n");

// self-check: every chip has a face, a plain face and a side; no NaN or undefined anywhere
for (const v of Object.keys(CHIPS)) for (const id of [`chip-${v}`, `chip-${v}-p`, `side-${v}`]) if (!sprite.includes(`id="${id}"`)) throw new Error("missing " + id);
if (/NaN|undefined/.test(sprite)) throw new Error("bad value in sprite");
console.log(`sprite.svg ${(sprite.length / 1024).toFixed(1)} KB, ${Object.keys(files).length} brand files`);
