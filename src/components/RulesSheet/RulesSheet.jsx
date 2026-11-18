import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { usePlayer } from "../../hooks/usePlayer";
import { houseEdge, formatEdge } from "../../utils/houseEdge";
import { rulePresetOf } from "../../utils/rulePresets";
import { RULES_TITLE, sheetGroups } from "../../utils/ruleCatalog";
import "./RulesSheet.css";

// The Table rules sheet (#87, DESIGN section 5): a bottom sheet on phones, a centred panel from 720 px. The preset and its house edge, then the
// rules in plain English, read from the settings through ruleCatalog.js. Opened from the felt print, the table menu and Home. Focus goes to Close;
// Escape or a tap on the backdrop closes, Tab stays inside, and focus goes back to where it was. //
export default function RulesSheet({ settings, onClose }) {
  const { player } = usePlayer();
  const ref = useRef(null);
  const latest = useRef(onClose);
  const titleId = useId();

  useEffect(() => { latest.current = onClose; });
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.querySelector("button").focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") return latest.current();
      if (e.key !== "Tab") return;
      const items = ref.current.querySelectorAll("button, a[href]");
      const [first, last] = [items[0], items[items.length - 1]];
      if (document.activeElement === (e.shiftKey ? first : last)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus?.(); };
  }, []);

  return createPortal(
    <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-in">
          <div className="sheet-grab" aria-hidden="true" />
          <div className="sheet-h">
            <h2 id={titleId}>{RULES_TITLE}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <svg aria-hidden="true" focusable="false"><use href="#i-clear" /></svg>
            </button>
          </div>
          <p className="sheet-meta"><span className="chiplet">{rulePresetOf(settings)}</span>House edge <b className="num">{formatEdge(houseEdge(settings))}</b> est.</p>
          {sheetGroups(settings).map(({ title, items }) => (
            <div key={title} className="sheet-grp">
              <h3>{title}</h3>
              <ul>{items.map((text) => <li key={text}>{text}</li>)}</ul>
            </div>
          ))}
          {player && <div className="sheet-act"><Link className="btn primary" to="/settings#rules">Change rules</Link></div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
