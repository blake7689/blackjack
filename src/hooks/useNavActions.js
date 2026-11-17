import { useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "./usePlayer";
import { useGameActions } from "./useGame";
import { GamePhases } from "../utils/constants/gamePhases";

// The three moves the Header and the table's top bar menu share: Home (asks first once cards are out), Settings (reopens the tab the player
// came back from) and Log out (asks first). //
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

  const goSettings = (tab = loc.state?.settingsTab) => nav(tab ? `/settings?tab=${tab}` : "/settings");

  const logOut = () => {
    if (!window.confirm("Log out?")) return;
    resetGame();
    logout();
    nav("/");
  };

  return { goHome, goSettings, logOut };
}
