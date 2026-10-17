import { createContext } from "react";

// State and actions are separate so components that only act (Header) don't re-render on every card.
export const GameStateContext = createContext(null);
export const GameActionsContext = createContext(null);
