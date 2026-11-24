import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import "./Dialog.css";

// A confirm for a destructive step (Delete profile, Discard, Start a new shoe): the safe button comes first and takes focus, the danger
// button is an outline (DESIGN sections 5 and 8). Escape means the safe answer, Tab stays inside, and focus goes back where it was. //
export default function ConfirmDialog({ title, body, safe, danger, onSafe, onDanger }) {
  const ref = useRef(null);
  const latest = useRef(onSafe);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => { latest.current = onSafe; });
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.querySelector("button").focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") return latest.current();
      if (e.key !== "Tab") return;
      const [first, last] = [ref.current.querySelector("button"), ref.current.querySelector("button:last-of-type")];
      if (document.activeElement === (e.shiftKey ? first : last)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus?.(); };
  }, []);

  return createPortal(
    <div className="dlg-overlay">
      <div ref={ref} className="dlg" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <h2 id={titleId}>{title}</h2>
        <p id={bodyId}>{body}</p>
        <div className="dlg-act">
          <button type="button" className="btn plain" onClick={onSafe}>{safe}</button>
          <button type="button" className="btn danger-o" onClick={onDanger}>{danger}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
