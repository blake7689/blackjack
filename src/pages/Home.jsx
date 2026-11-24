import { Suspense, useState } from "react";
import { lazyReload } from "../utils/lazyReload";
import { Link } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import { useNavActions } from "../hooks/useNavActions";
import { Chip } from "../components/Chip/Chip";
import Wordmark from "../components/Wordmark/Wordmark";
import { LoadingScreen, Page } from "../components/PageScreens/PageScreens";

const RulesSheet = lazyReload(() => import("../components/RulesSheet/RulesSheet")); // #169

// Two cards lying flat and a chip on the felt (DESIGN section 8): decorative.
const Hero = () => (
  <div className="hero" aria-hidden="true">
    <span className="hc" style={{ transform: "translate(-78px, -54px)" }}><img src="/cards/ace_of_spades.webp" alt="" /></span>
    <span className="hc" style={{ transform: "translate(-32px, -54px)" }}><img src="/cards/king_of_hearts.webp" alt="" /></span>
    <span className="hchip" style={{ transform: "translate(52px, 4px)" }}><Chip value={25} /></span>
  </div>
);

// Home (DESIGN section 8). Signed in: Play starts the table, then Rules, Settings and "Signed in as ... · Log out". Signed out: Log in, Create an account, Rules.
// A player just signed in whose table is about to start sees Loading, never a flash of Home: a signed-in player opens on the table and reaches Home from its menu. //
export default function Home() {
  const { player } = usePlayer();
  const { starting, settings } = useGameState();
  const { startGame } = useGameActions();
  const { logOut, confirm } = useNavActions();
  const [rules, setRules] = useState(false);

  if (starting) return <LoadingScreen />;

  return (
    <Page>
      <h1>
        <Wordmark className="wm" />
        <span className="sr-only">Blakejack</span>
      </h1>
      <Hero />
      {player ? (
        <>
          <div className="btn-col">
            <Link className="btn primary" to="/game" onClick={startGame}>Play</Link>
            <button type="button" className="btn" onClick={() => setRules(true)}>Rules</button>
            <Link className="btn" to="/settings">Settings</Link>
          </div>
          <p className="signed">Signed in as {player.userName} · <button type="button" onClick={logOut}>Log out</button></p>
        </>
      ) : (
        <>
          <p className="signed">Please log in to start playing.</p>
          <div className="btn-col">
            <Link className="btn primary" to="/login">Log in</Link>
            <Link className="btn" to="/signup">Create an account</Link>
            <button type="button" className="btn" onClick={() => setRules(true)}>Rules</button>
          </div>
        </>
      )}
      {rules && <Suspense fallback={null}><RulesSheet settings={settings} onClose={() => setRules(false)} /></Suspense>}
      {confirm}
    </Page>
  );
}
