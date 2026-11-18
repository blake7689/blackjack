import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "./usePlayer";
import { useGameActions } from "./useGame";
import ConfirmDialog from "../components/SettingsControls/ConfirmDialog";
import { GamePhases } from "../utils/constants/gamePhases";
import { leaveGuard } from "../utils/leaveGuard";

// The three moves the Header, Home and the table's top bar menu share: Home (asks first once cards are out), Settings (`goSettings("rules")`
// opens that section: /settings#rules) and Log out (asks first). Each first asks Settings to confirm discarding unsaved changes. The asks are
// styled confirms (#87: the safe button first, the danger outline): `confirm` is the dialog to render (null when none is open). //
export function useNavActions() {
  const { logout } = usePlayer();
  const { getPhase, resetGame } = useGameActions();
  const loc = useLocation();
  const nav = useNavigate();
  const [asking, setAsking] = useState(null);

  const goHome = () => {
    if (loc.pathname === "/") return;
    const leave = () => { resetGame(); nav("/"); };
    const phase = getPhase();
    // A bet still in the circle is refunded by the reset; one already dealt is lost.
    if (phase !== GamePhases.NONE && phase !== GamePhases.PRE_DEAL) {
      setAsking({ title: "Leave game and return Home?", body: "Any bet in the circle will be lost.", safe: "Keep playing", danger: "Leave", go: leave });
    } else leave();
  };

  const goSettings = (section) => nav(section ? `/settings#${section}` : "/settings");

  const logOut = () => setAsking({
    title: "Log out?", body: "Your balance stays on your account.", safe: "Stay logged in", danger: "Log out",
    go: () => { resetGame(); logout(); nav("/"); },
  });

  const guarded = (go) => (...args) => (leaveGuard.ask ? leaveGuard.ask(() => go(...args)) : go(...args));
  const confirm = asking && (
    <ConfirmDialog title={asking.title} body={asking.body} safe={asking.safe} danger={asking.danger}
      onSafe={() => setAsking(null)} onDanger={() => { setAsking(null); asking.go(); }} />
  );
  return { goHome: guarded(goHome), goSettings: guarded(goSettings), logOut: guarded(logOut), confirm };
}
