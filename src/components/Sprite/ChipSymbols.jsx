import { ALLOWED_CHIPS } from "../../utils/constants/chips";

// The ceramic chips (#82): the mockup's assets/build.mjs `CHIPS` and `chipFace` / `chipSide`, as sprite symbols. Lit top-left, a flat printed face, a thin
// gloss and edge. For each denomination v: `#chip-<v>` (the face with its numeral), `#chip-<v>-p` (the same with a diamond, for a stack's chips
// that are too small for a legible numeral) and `#side-<v>` (the band seen under the face in a stack). body / print / mid / ink / side per the issue table.
const CHIP_COLOURS = {
  1: { body: "#ebe8e1", print: "#27458f", mid: "#e2ded5", ink: "#1f3473", side: "#c9c4b8" },
  5: { body: "#a5222b", print: "#f1ebe0", mid: "#9a1f27", ink: "#f6f1e7", side: "#7b161d" },
  10: { body: "#1f4a96", print: "#f1ebe0", mid: "#1c4389", ink: "#f6f1e7", side: "#143672" },
  25: { body: "#1e6a45", print: "#f1ebe0", mid: "#1b603f", ink: "#f6f1e7", side: "#134d31" },
  50: { body: "#a8521a", print: "#1d2b4d", mid: "#a04d18", ink: "#fff6ea", side: "#7e3d12" },
  100: { body: "#1c1c21", print: "#e9e2d2", mid: "#232329", ink: "#f2ecdf", side: "#0b0b0d" },
  1000: { body: "#d6a92c", print: "#22201a", mid: "#cfa128", ink: "#2a2414", side: "#a8831a" },
  5000: { body: "#5e3a24", print: "#ead8b2", mid: "#56351f", ink: "#f4e6c8", side: "#3e2615" },
  10000: { body: "#d4709a", print: "#fbeef3", mid: "#cc6892", ink: "#3a0f22", side: "#a24f73" },
  20000: { body: "#7fb6dc", print: "#0f2c44", mid: "#77aed4", ink: "#0c2538", side: "#5a8cb0" },
  50000: { body: "#5b3a8f", print: "#efe6fb", mid: "#543585", ink: "#f6f0ff", side: "#3e2766" },
  100000: { body: "#8d9296", print: "#16191b", mid: "#868b8f", ink: "#121517", side: "#6a6f73" },
};

const chipLabel = (v) => (v >= 1000 ? `${v / 1000}K` : String(v));

const f = (n) => Math.round(n * 100) / 100;
const rad = (d) => (d * Math.PI) / 180;
const pt = (r, deg) => [f(50 + r * Math.sin(rad(deg))), f(50 - r * Math.cos(rad(deg)))]; // 0 deg = 12 o'clock, clockwise
function sector(r1, r2, a0, a1) {
  const [x0, y0] = pt(r2, a0), [x1, y1] = pt(r2, a1), [x2, y2] = pt(r1, a1), [x3, y3] = pt(r1, a0);
  return `M${x0} ${y0}A${r2} ${r2} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r1} ${r1} 0 0 0 ${x3} ${y3}Z`;
}

const BLOCKS = [0, 45, 90, 135, 180, 225, 270, 315];
const RIBS = [-5, -2.5, 0, 2.5, 5];
const HATCH = Array.from({ length: 96 }, (_, i) => { const a = i * 3.75; const [x1, y1] = pt(31.2, a), [x2, y2] = pt(38.6, a); return `M${x1} ${y1}L${x2} ${y2}`; }).join("");
const SIDE_BARS = [112.5, 157.5, 202.5, 247.5].map((a) => { const w = 7 * Math.abs(Math.cos(rad(a - 180))); return [f(50 + 49.6 * Math.sin(rad(a)) - w / 2), f(w)]; });

function Face({ v, numeral }) {
  const c = CHIP_COLOURS[v];
  const label = chipLabel(v);
  const size = label.length >= 4 ? 27.5 : label.length >= 3 ? 28 : 32; // 12 px or more on a 44 px chip
  return (
    <symbol id={`chip-${v}${numeral ? "" : "-p"}`} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="49.6" fill={c.body} />
      {BLOCKS.map((a) => (
        <g key={a}>
          <path d={sector(41.6, 49.2, a - 8.5, a + 8.5)} fill={c.print} />
          <g fill={c.body}>{RIBS.map((o) => <path key={o} d={sector(42.2, 48.6, a + o - 0.45, a + o + 0.45)} />)}</g>
        </g>
      ))}
      <g fill={c.print} opacity=".85">{BLOCKS.map((a) => { const [x, y] = pt(45.4, a + 22.5); return <circle key={a} cx={x} cy={y} r="1.25" />; })}</g>
      <circle cx="50" cy="50" r="40.6" fill="none" stroke={c.print} strokeWidth=".8" opacity=".9" />
      <circle cx="50" cy="50" r="39.4" fill={c.mid} />
      <path d={HATCH} stroke={c.print} strokeWidth=".35" opacity=".28" fill="none" />
      <circle cx="50" cy="50" r="30.4" fill={c.body} stroke={c.print} strokeWidth=".8" />
      <circle cx="50" cy="50" r="28.6" fill="none" stroke={c.print} strokeWidth=".35" opacity=".6" />
      {numeral
        ? <text x="50" y="50" dy=".35em" textAnchor="middle" style={{ fontFamily: "var(--font-display)" }} fontWeight="600" fontSize={size} letterSpacing={label.length >= 4 ? -1.8 : -0.8} fill={c.ink}>{label}</text>
        : <path d="M50 44.5l5.5 5.5-5.5 5.5-5.5-5.5z" fill={c.ink} opacity=".9" />}
      <circle cx="50" cy="50" r="49.6" fill="url(#ceramicGloss)" />
      <circle cx="50" cy="50" r="49.2" fill="none" stroke="url(#ceramicRim)" strokeWidth=".9" />
    </symbol>
  );
}

function Side({ v }) {
  const c = CHIP_COLOURS[v];
  return (
    <symbol id={`side-${v}`} viewBox="0 0 100 100">
      <clipPath id={`sc-${v}`}><circle cx="50" cy="50" r="49.6" /></clipPath>
      <g clipPath={`url(#sc-${v})`}>
        <rect width="100" height="100" fill={c.side} />
        {SIDE_BARS.map(([x, w]) => <rect key={x} x={x} y="0" width={w} height="100" fill={c.print} opacity=".85" />)}
        <rect width="100" height="100" fill="url(#sideShade)" />
      </g>
    </symbol>
  );
}

// Rendered inside the Sprite's <svg>, which carries the gradients below.
export default function ChipSymbols() {
  return (
    <>
      <defs>
        <linearGradient id="ceramicGloss" x1="0" y1="0" x2=".7" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".2" /><stop offset=".38" stopColor="#fff" stopOpacity=".04" /><stop offset=".62" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".14" />
        </linearGradient>
        <linearGradient id="ceramicRim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" /><stop offset=".5" stopColor="#000" stopOpacity=".1" /><stop offset="1" stopColor="#000" stopOpacity=".45" />
        </linearGradient>
        <linearGradient id="sideShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".5" /><stop offset=".3" stopColor="#000" stopOpacity=".05" /><stop offset=".55" stopColor="#fff" stopOpacity=".06" /><stop offset="1" stopColor="#000" stopOpacity=".5" />
        </linearGradient>
      </defs>
      {ALLOWED_CHIPS.map((v) => (
        <g key={v}><Face v={v} numeral /><Face v={v} numeral={false} /><Side v={v} /></g>
      ))}
    </>
  );
}
