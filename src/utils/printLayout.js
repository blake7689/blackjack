// The felt print's geometry (#81, DESIGN section 5): text laid out 1:1 in CSS pixels along arcs, so no glyph is ever scaled under 12 px.
// `W` x `H` is the print's box. Portrait and wide: a strong arc (radius 1.45 x W); line 1 (the payout) 16-26 px, line 2 (the rules) 14-17 px,
// line 3 (insurance) 13-15 px between two ruled arcs. Landscape: one line on one arc.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// An arc bowing up, `half` wide each way (never past the box), whose lowest point is at y.
const arc = (R, W, y, half) => {
  const dx = Math.min(half, W / 2 - 2);
  const dy = Math.sqrt(R * R - dx * dx);
  return `M${W / 2 - dx} ${y - R + dy}A${R} ${R} 0 0 0 ${W / 2 + dx} ${y - R + dy}`;
};

export function printLayout(W, H, landscape) {
  if (landscape) return { landscape, line: { fs: 15, d: arc(W * 12, W, H - 6, W / 2) } };
  const R = W * 1.45;
  const f1 = clamp(Math.round(Math.min(W / 17, H - 36)), 16, 26);
  const f2 = clamp(Math.round(f1 * 0.66), 14, 17);
  const f3 = clamp(Math.round(f1 * 0.56), 13, 15);
  const y1 = f1 + 2, y2 = y1 + f2 + 6, yt = y2 + 8, y3 = yt + f3 + 5, yb = y3 + 6;
  return {
    landscape,
    pay: { fs: f1, d: arc(R, W, y1, W) },
    rules: { fs: f2, d: arc(R, W, y2, W) },
    insurance: { fs: f3, d: arc(R, W, y3, W), bands: [arc(R, W, yt, W * 0.36), arc(R, W, yb, W * 0.36)] },
  };
}
