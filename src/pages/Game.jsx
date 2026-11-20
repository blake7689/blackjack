import { Navigate } from "react-router-dom";
import GameBoard from "../components/GameBoard/GameBoard";
import { LoadingScreen } from "../components/PageScreens/PageScreens";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState } from "../hooks/useGame";
import { GamePhases } from "../utils/constants/gamePhases";

// Without a player or a started game there is nothing to play (e.g. after a page refresh). A signed-in player whose table is still being started
// (`starting`: the saved settings are loading) is about to have one, so wait on Loading: redirecting to "/" now would race GameProvider's start, which
// only moves a player who is still on an entry route (L1-14: a reload on /game landed on Home in WebKit when the settings answered at once). //
export default function Game() {
  const { player } = usePlayer();
  const { phase, starting } = useGameState();
  if (!player) return <Navigate to="/" replace />;
  if (starting) return <LoadingScreen />;
  if (phase === GamePhases.NONE) return <Navigate to="/" replace />;
  return <GameBoard />;
}
