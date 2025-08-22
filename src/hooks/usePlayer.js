import { useContext } from "react";
import { PlayerContext } from "../context/PlayerContext";

export function usePlayer() {
  return useContext(PlayerContext);
}