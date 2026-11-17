import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { feltPrint } from "../../utils/ruleCatalog";
import { printLayout } from "../../utils/printLayout";
import "./FeltPrint.css";

// The table's rules printed on the cloth (#81): the payout, soft 17 and the hole-card mode, and insurance, on strong arcs in --print with a
// hint of weave (the ink filter). A button named "Table rules" that opens the rules (`onOpen`). Laid out 1:1 in its own box and fitted to
// its width (each line keeps its own tracking, never under 12 px), and redrawn whenever the box or the fonts change. `onDraw` runs after
// every draw (the block is centred between the hands then). The drawing is aria-hidden and the button is a plain transparent one laid over it:
// the name stays the short "Table rules" (the words are in Settings), and a button holding the printed text would fail axe's label-content-name-mismatch. The words come from ruleCatalog.js (feltPrint).
const LANDSCAPE = "(max-height: 520px)";
const MIN_FONT = 12;
const landscape = () => typeof matchMedia === "function" && matchMedia(LANDSCAPE).matches;

function Line({ id, fs, ls, className, children }) {
  return (
    <text className={className} fontSize={fs} letterSpacing={(fs * ls).toFixed(2)} data-fs={fs} data-ls={ls}>
      <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{children}</textPath>
    </text>
  );
}

export default function FeltPrint({ settings, onOpen, onDraw }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [, setFonts] = useState(0);

  useEffect(() => {
    const svg = ref.current;
    const read = () => setBox((b) => {
      const w = Math.round(svg.clientWidth), h = Math.round(svg.clientHeight);
      return b.w === w && b.h === h ? b : { w, h };
    });
    read();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    observer?.observe(svg);
    // The faces load when the first text uses them: draw again once they are here, or the lines are fitted to the fallback's widths.
    let live = true;
    Promise.all(["Cinzel", "Cormorant Garamond"].map((f) => document.fonts?.load(`700 16px "${f}"`))).then(() => live && setFonts((n) => n + 1), () => {});
    return () => { live = false; observer?.disconnect(); };
  }, []);

  const wide = landscape();
  const drawn = box.w > 0 && box.h > 0;
  const layout = drawn ? printLayout(box.w, box.h, wide) : null;
  const { pay, soft, mode, insurance } = feltPrint(settings);

  // Fit each line to the box: start from its own size and step down to 12 px until it is short enough.
  useLayoutEffect(() => {
    const maxW = box.w * (wide ? 0.96 : 0.94);
    ref.current.querySelectorAll("text").forEach((el) => {
      let fs = +el.dataset.fs;
      const k = +el.dataset.ls;
      el.setAttribute("font-size", fs);
      el.setAttribute("letter-spacing", (fs * k).toFixed(2));
      for (let guard = 10; guard-- && fs > MIN_FONT && el.getComputedTextLength?.() > maxW;) {
        fs = Math.max(MIN_FONT, fs - 1);
        el.setAttribute("font-size", fs);
        el.setAttribute("letter-spacing", (fs * k).toFixed(2));
      }
    });
    onDraw?.(ref.current);
  });

  const open = (e) => { e.stopPropagation(); onOpen?.(); }; // a click on the print is not a click on the felt (which continues the round)

  return (
    <div className="print">
    <svg ref={ref} aria-hidden="true" focusable="false" viewBox={`0 0 ${box.w} ${box.h}`}>
      {layout && (
        <>
          <defs>
            <filter id="print-ink" x="-2%" y="-20%" width="104%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" />
              <feDisplacementMap in="SourceGraphic" scale="1.1" xChannelSelector="R" yChannelSelector="G" />
              <feGaussianBlur stdDeviation=".28" />
            </filter>
            {wide ? <path id="pa0" d={layout.line.d} /> : (
              <>
                <path id="pa1" d={layout.pay.d} />
                <path id="pa2" d={layout.rules.d} />
                <path id="pa3" d={layout.insurance.d} />
              </>
            )}
          </defs>
          {wide ? (
            <g filter="url(#print-ink)">
              <Line id="pa0" fs={layout.line.fs} ls={0.06} className="caps">
                {pay}<tspan className="book"> · {[soft, mode, insurance].filter(Boolean).join(" · ")}</tspan>
              </Line>
            </g>
          ) : (
            <g filter="url(#print-ink)">
              <Line id="pa1" fs={layout.pay.fs} ls={0.05} className="caps">{pay}</Line>
              <Line id="pa2" fs={layout.rules.fs} ls={0.02} className="book">{soft} · {mode}</Line>
              {insurance && (
                <>
                  {layout.insurance.bands.map((d) => <path key={d} className="band" d={d} />)}
                  <Line id="pa3" fs={layout.insurance.fs} ls={0.03} className="book">{insurance}</Line>
                </>
              )}
            </g>
          )}
        </>
      )}
    </svg>
    <button type="button" className="print-hit" aria-label="Table rules" onClick={open} />
    </div>
  );
}
