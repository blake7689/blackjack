import { useState } from "react";
import { Link } from "react-router-dom";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState, useGameActions } from "../hooks/useGame";
import { useNavActions } from "../hooks/useNavActions";
import RulesSheet from "../components/RulesSheet/RulesSheet";
import Wordmark from "../components/Wordmark/Wordmark";
import { LoadingScreen, Page } from "../components/PageScreens/PageScreens";

// Home (DESIGN section 8; no felt hero since L2-5: the wordmark, a column of actions and space). Signed in: Play starts the table, then Rules, Settings and "Signed in as ... · Log out". Signed out: Log in, Create an account, Rules.
// A player just signed in whose table is about to start sees Loading, never a flash of Home: a signed-in player opens on the table and reaches Home from its menu. //
export default function Home() {
  const { player } = usePlayer();
  const { starting, settings } = useGameState();
  const { startGame } = useGameActions();
  const { logOut, confirm } = useNavActions();
  const [rules, setRules] = useState(false);

  if (starting) return <LoadingScreen />;

  return (
    <Page className="home">
      <h1>
        <Wordmark className="wm" />
        <span className="sr-only">Blakejack</span>
      </h1>
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
      {rules && <RulesSheet settings={settings} onClose={() => setRules(false)} />}
      {confirm}
    </Page>
  );
}
