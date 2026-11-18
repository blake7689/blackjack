import { Link } from "react-router-dom";
import Wordmark from "../Wordmark/Wordmark";
import "../../pages/pages.css";

// The standalone screens (#87, DESIGN section 8): the page frame Home, Log in and Create an account share, Loading ("Shuffling up...", while a saved
// session is restored, which can take a cold API start) and Error ("Can't reach the table"). Each screen puts the (decorative) wordmark first and names itself. //
export function Page({ children }) {
  return (
    <div className="page-screen">
      <main className="page">{children}</main>
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

// Try again asks the session restore once more; Home gives up on it and shows the signed-out Home (the saved sign-in stays until a new one replaces it).
export function ErrorScreen({ onRetry, onHome }) {
  return (
    <Page>
      <Wordmark className="wm" />
      <h1>Can't reach the table</h1>
      <p>Check your connection and try again. Your balance is safe.</p>
      <div className="btn-col">
        <button type="button" className="btn primary" onClick={onRetry}>Try again</button>
        <Link className="btn" to="/" onClick={onHome}>Home</Link>
      </div>
    </Page>
  );
}
