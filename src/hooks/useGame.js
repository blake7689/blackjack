import { useContext } from "react";
import { GameStateContext, GameActionsContext } from "../context/GameContext";

export function useGameState() {
  return useContext(GameStateContext);
}

export function useGameActions() {
  return useContext(GameActionsContext);
}
