import { Link } from "react-router-dom";
import Wordmark from "../Wordmark/Wordmark";
import "../../pages/pages.css";

// The standalone screens (#87, DESIGN section 8): the page frame Home, Log in and Create an account share, Loading ("Shuffling up...", while a saved
// session is restored, which can take a cold API start) and Error ("Can't reach the table"). Each screen puts the (decorative) wordmark first and names itself. //
export function Page({ className = "", children }) {
  return (
    <div className="page-screen">
      <main className={`page ${className}`.trim()}>{children}</main>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <Page>
      <Wordmark className="wm" />
      <div role="status" className="loading">
        <div className="deal-load" aria-hidden="true">
          {[0, 1, 2].map((n) => <i key={n} style={{ "--n": n }}><svg viewBox="0 0 250 363" focusable="false"><use href="#cardback" /></svg></i>)}
        </div>
        <p>Shuffling up...</p>
      </div>
    </Page>
  );
}

// The Error screen, in two wordings. The default (the session restore got no answer): Try again asks it once more; Home gives up on it and shows the signed-out Home
// (the saved sign-in stays until a new one replaces it). `crash` (the error boundary, L2-13, L1-41): the app itself failed, so it says so and offers Reload. //
export function ErrorScreen({ onRetry, onHome, crash = false }) {
  return (
    <Page>
      <Wordmark className="wm" />
      <h1>{crash ? "Something went wrong" : "Can't reach the table"}</h1>
      <p>{crash ? "The table hit an error. Reload to keep playing; your balance is safe on your account." : "Check your connection and try again. Your balance is safe."}</p>
      <div className="btn-col">
        <button type="button" className="btn primary" onClick={onRetry}>{crash ? "Reload" : "Try again"}</button>
        <Link className="btn" to="/" onClick={onHome}>Home</Link>
      </div>
    </Page>
  );
}
