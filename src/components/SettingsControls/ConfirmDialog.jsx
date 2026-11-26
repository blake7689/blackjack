import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { focusTarget } from "../../utils/opener";
import "./Dialog.css";

// A confirm for a destructive step (Delete profile, Discard, Start a new shoe): the safe button comes first and takes focus, the danger
// button is an outline (DESIGN sections 5 and 8). Escape means the safe answer, Tab stays inside, and focus goes back where it was.
// `children` (Delete profile's password field) sit between the text and the buttons. While `busy`, both buttons and Escape do nothing. //
export default function ConfirmDialog({ title, body, safe, danger, onSafe, onDanger, children, busy }) {
  const ref = useRef(null);
  const latest = useRef(onSafe);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => { latest.current = busy ? () => {} : onSafe; });
  useEffect(() => {
    const previous = focusTarget();
    ref.current.querySelector("button").focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") return latest.current();
      if (e.key !== "Tab") return;
      const stops = ref.current.querySelectorAll("input, button");
      const [first, last] = [stops[0], stops[stops.length - 1]];
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
        {children}
        <div className="dlg-act">
          <button type="button" className="btn plain" aria-disabled={busy || undefined} onClick={busy ? undefined : onSafe}>{safe}</button>
          <button type="button" className="btn danger-o" aria-disabled={busy || undefined} onClick={busy ? undefined : onDanger}>{danger}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
