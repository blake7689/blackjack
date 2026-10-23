import { useSyncExternalStore } from "react";
import { landed } from "../utils/cardAnimation";
import { getHandTotals } from "../utils/blackjackLogic";

const subscribe = (l) => { landed.listeners.add(l); return () => landed.listeners.delete(l); };
const version = () => landed.version;

// What to show for these cards: the total of the ones that have landed (null if none) and whether any are still on the way.
export function useLanded(cards) {
  useSyncExternalStore(subscribe, version);
  const here = cards.filter((c) => landed.ids.has(c.id));
  return { pending: here.length < cards.length, totals: here.length ? getHandTotals(here) : null };
}
