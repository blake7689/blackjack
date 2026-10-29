import { useEffect, useId, useRef, useState } from "react";
import { usePlayer } from "../../hooks/usePlayer";
import "./TopUpPrompt.css";

// Every refusal reads the same, so the text never hints at why (#90). Only the lockout says more.
const FAILED = "That didn't work.";

function lockedMessage(retryAfter) {
  const minutes = Math.ceil(Number(retryAfter) / 60);
  return `Too many attempts. Try again later${minutes > 0 ? ` in about ${minutes} minute${minutes === 1 ? "" : "s"}` : ""}.`;
}

// A neutral code prompt. The typed code lives in this component's state only: it is cleared once sent
// and dies with the component on close. Never log it or keep it anywhere else.
export default function TopUpPrompt({ onClose }) {
  const { player, topUp, reconnecting } = usePlayer();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const alive = useRef(true);
  const titleId = useId();
  const inputId = useId();

  // Focus the input, give focus back on close, close on Escape and keep Tab inside the dialog.
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    inputRef.current.focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const items = dialogRef.current.querySelectorAll("input, button:not(:disabled)");
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current.contains(active) || (e.shiftKey && active === first) || (!e.shiftKey && active === last)) {
        e.preventDefault();
        (e.shiftKey && dialogRef.current.contains(active) ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      alive.current = false;
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [onClose]);

  // Signed out (sign-out or a 401): close, so a later submit can't hit a missing player. Closing sets alive false.
  useEffect(() => { if (!player) onClose(); }, [player, onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!code || busy) return;
    const sent = code;
    setCode("");
    setError("");
    setBusy(true);
    const res = await topUp(sent);
    if (!alive.current) return; // closed while waiting
    if (res.ok) return onClose();
    setBusy(false);
    setError(res.locked ? lockedMessage(res.retryAfter) : FAILED);
    inputRef.current.focus();
  };

  return (
    <div className="topup-overlay">
      <form ref={dialogRef} className="topup-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <h2 id={titleId}>Enter code</h2>
        <label htmlFor={inputId}>Code</label>
        <input
          id={inputId}
          ref={inputRef}
          type="password"
          autoComplete="off"
          maxLength={200}
          value={code}
          readOnly={busy}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <div role="alert">{error}</div>}
        {busy && reconnecting && <div role="status">Reconnecting...</div>}
        <div className="topup-buttons">
          <button type="submit" disabled={busy}>Submit</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
