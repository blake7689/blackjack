import { useCallback, useEffect, useRef, useState } from "react";
import "./SettingsControls.css";

// The Settings page's building blocks (#84, DESIGN section 5): an accordion section, a row with a radio group, a switch, a slider, and the
// hints. Every setting name is followed by an "i" (`HintI`, aria-hidden) and the same words are the control's accessible description
// (`HintText`, `aria-describedby`). The words live in ruleCatalog.js. //

const hintId = (key) => `hd-${key}`;

export const HintI = ({ id, text }) => text && <span className="hint-i" data-for={id} data-hint={text} aria-hidden="true">i</span>;
export const HintText = ({ id, text }) => text && <span className="sr-only" id={id}>{text}</span>;

const TIP_MS = 2600;
const HOVER_MS = 250;

// Wraps the page and shows the hint bubble: a tap or click on an "i" shows it for 2.6 s (or until the next tap; it never toggles the control),
// 250 ms of hover on the "i" with a pointer does too, and so does keyboard focus on a control it describes. One bubble at a time, fixed to the
// viewport, so any scroll hides it. //
export function HintLayer({ className, children }) {
  const [tip, setTip] = useState(null);
  const timer = useRef(0);
  const shownFor = useRef(null);

  const hide = useCallback(() => { clearTimeout(timer.current); shownFor.current = null; setTip(null); }, []);
  const show = (el) => {
    clearTimeout(timer.current);
    shownFor.current = el;
    const r = el.getBoundingClientRect();
    const half = Math.min(320, window.innerWidth - 16) / 2; // the bubble is at most 320 px wide: keep it on screen
    const below = r.top < 44; // no room above: show it under the "i"
    setTip({ text: el.dataset.hint, below, left: Math.max(8 + half, Math.min(window.innerWidth - 8 - half, r.left + r.width / 2)), top: below ? r.bottom + 6 : r.top - 6 });
  };

  useEffect(() => {
    if (!tip) return undefined;
    document.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", hide, { capture: true });
  }, [tip, hide]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClickCapture = (e) => {
    const el = e.target.closest(".hint-i");
    if (!el) return shownFor.current && hide();
    e.preventDefault(); // the "i" sits inside a label: never toggle its control
    e.stopPropagation();
    if (shownFor.current === el) return hide();
    show(el);
    timer.current = setTimeout(hide, TIP_MS);
  };
  const onPointerOver = (e) => {
    const el = e.pointerType !== "touch" && e.target.closest(".hint-i");
    if (!el) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => show(el), HOVER_MS);
  };
  const onPointerOut = (e) => { if (e.pointerType !== "touch" && e.target.closest(".hint-i")) hide(); };
  const onFocus = (e) => {
    const id = e.target.getAttribute("aria-describedby");
    const el = id && e.currentTarget.querySelector(`.hint-i[data-for="${id}"]`);
    if (el && e.target.matches(":focus-visible")) show(el); else hide();
  };

  return (
    <div className={className} onClickCapture={onClickCapture} onPointerOver={onPointerOver} onPointerOut={onPointerOut} onFocus={onFocus} onBlur={hide}>
      {children}
      {tip && <div className={`hint-tip${tip.below ? " below" : ""}`} aria-hidden="true" style={{ left: tip.left, top: tip.top }}>{tip.text}</div>}
    </div>
  );
}

// A section is a disclosure: its header (a button inside the h2) names it, sums up its values and marks unsaved changes. The body stays in the
// page (hidden) so the header's aria-controls always points at something. //
export function Section({ id, title, summary, dirty, open, onToggle, children }) {
  return (
    <section className="sec" id={`sec-${id}`}>
      <h2 className="sec-t">
        <button type="button" className="sec-h" id={`sec-${id}-h`} aria-expanded={open} aria-controls={`sec-${id}-b`} onClick={onToggle}>
          <span className="sec-n">{title}{dirty && <span className="sec-dot"><span className="sr-only">, unsaved changes</span></span>}</span>
          <span className="sec-s">{summary}</span>
          <svg className="chev" aria-hidden="true" focusable="false"><use href="#i-chevron" /></svg>
        </button>
      </h2>
      <div className="sec-b" id={`sec-${id}-b`} role="region" aria-labelledby={`sec-${id}-h`} hidden={!open}>{children}</div>
    </section>
  );
}

// A group heading (Shoe, Dealer ...). A group with nothing to show has no heading. //
export function Group({ title, children }) {
  const kids = [children].flat().filter(Boolean);
  return kids.length > 0 && <div className="grp"><h3>{title}</h3>{kids}</div>;
}

// A row: the setting's name and "i", and a group of controls: a radiogroup of options (`Radio`) unless `role` says otherwise. `className` is the
// group's ("seg", "felts", "accents", "chip-pick"); `layout` "look" keeps the name and the group on one line at every width, "block" stacks them. //
export function Row({ id, label, hint, className = "seg", role = "radiogroup", layout, children }) {
  return (
    <div className={`rrow${layout ? ` ${layout}` : ""}`}>
      <span className="rl" id={`fl-${id}`}>{label}<HintI id={hintId(id)} text={hint} /></span>
      <HintText id={hintId(id)} text={hint} />
      <div role={role} aria-labelledby={`fl-${id}`} aria-describedby={hint ? hintId(id) : undefined} className={className}>{children}</div>
    </div>
  );
}

export const Radio = ({ checked, ...rest }) => <button type="button" role="radio" aria-checked={checked} {...rest} />;

// A real label around a native checkbox with the switch role. A switch that cannot change is `aria-disabled` (still focusable and described). //
export function Switch({ id, label, sub, hint, checked, disabled, onChange }) {
  return (
    <div className="swr">
      <label className={`sw${disabled ? " off" : ""}`}>
        <input type="checkbox" role="switch" checked={checked} aria-disabled={disabled || undefined} aria-describedby={hint ? hintId(id) : undefined}
          onChange={(e) => !disabled && onChange(e.target.checked)} />
        <span className="tx"><span>{label}<HintI id={hintId(id)} text={hint} /></span>{sub && <small>{sub}</small>}</span>
        <span className="tr" aria-hidden="true" />
      </label>
      <HintText id={hintId(id)} text={hint} />
    </div>
  );
}

// A range with its label, a live value and, optionally, named stops under the track (`stops`: [[value, name, position out of 1000]], `tail` the
// last name, `current` the name of the stop that is on). //
export function Slider({ id, label, hint, min, max, step, value, text, onChange, stops, tail, current }) {
  return (
    <div className="slider">
      <div className="top-l">
        <label htmlFor={`in-${id}`}>{label}<HintI id={hintId(id)} text={hint} /></label>
        <output htmlFor={`in-${id}`}>{text}</output>
      </div>
      <HintText id={hintId(id)} text={hint} />
      <input id={`in-${id}`} type="range" min={min} max={max} step={step} value={value} aria-describedby={hint ? hintId(id) : undefined}
        style={{ "--pct": `${((value - min) / (max - min)) * 100}%` }} onChange={(e) => onChange(Number(e.target.value))} />
      {stops && (
        <div className="stops" aria-hidden="true">
          {stops.map(([v, name, at]) => <span key={v} className={`${at === 0 ? "first " : ""}${name === current ? "on" : ""}`} style={{ left: `${at / 10}%` }}>{name}</span>)}
          <span className="last" style={{ left: "100%" }}>{tail}</span>
        </div>
      )}
    </div>
  );
}
