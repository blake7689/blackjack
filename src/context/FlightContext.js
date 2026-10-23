import { createContext } from "react";
import { cardTiming } from "../utils/cardAnimation";

// Provided by GameBoard. `enabled` is false on the board's first render, so cards already on the table never fly.
export const FlightContext = createContext({ enabled: false, layerRef: { current: null }, timing: cardTiming(1000) });
