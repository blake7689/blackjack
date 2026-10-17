import { Navigate } from "react-router-dom";
import GameBoard from "../components/GameBoard/GameBoard";
import { usePlayer } from "../hooks/usePlayer";
import { useGameState } from "../hooks/useGame";
import { GamePhases } from "../utils/constants/gamePhases";

// Without a player or a started game there is nothing to play (e.g. after a page refresh). //
export default function Game() {
  const { player } = usePlayer();
  const { phase } = useGameState();
  if (!player || phase === GamePhases.NONE) return <Navigate to="/" replace />;
  return <GameBoard />;
}
