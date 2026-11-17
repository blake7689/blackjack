import { useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "./usePlayer";
import { useGameActions } from "./useGame";
import { GamePhases } from "../utils/constants/gamePhases";
import { leaveGuard } from "../utils/leaveGuard";

// The three moves the Header and the table's top bar menu share: Home (asks first once cards are out), Settings (`goSettings("rules")`
// opens that section: /settings#rules) and Log out (asks first). Each first asks Settings to confirm discarding unsaved changes.
export function useNavActions() {
  const { logout } = usePlayer();
  const { getPhase, resetGame } = useGameActions();
  const loc = useLocation();
  const nav = useNavigate();

  const goHome = () => {
    if (loc.pathname === "/") return;
    const phase = getPhase();
    // A bet still in the circle is refunded by the reset; one already dealt is lost.
    if (phase !== GamePhases.NONE && phase !== GamePhases.PRE_DEAL
      && !window.confirm("Leave game and return Home? Any bet in the circle will be lost.")) return;
    resetGame();
    nav("/");
  };

  const goSettings = (section) => nav(section ? `/settings#${section}` : "/settings");

  const logOut = () => {
    if (!window.confirm("Log out?")) return;
    resetGame();
    logout();
    nav("/");
  };

  const guarded = (go) => (...args) => (leaveGuard.ask ? leaveGuard.ask(() => go(...args)) : go(...args));
  return { goHome: guarded(goHome), goSettings: guarded(goSettings), logOut: guarded(logOut) };
}
