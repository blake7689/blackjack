import { useLayoutEffect, useState } from "react";
import { hold, reducedMotion, reserve, speedK } from "../utils/cardAnimation";
import { mirrorCheck } from "../utils/cardFx";
import { getHandTotals, isTotalBlackjack } from "../utils/blackjackLogic";
import { DealerHoleOptions } from "../utils/constants/dealerHoleOptions";
import { GamePhases } from "../utils/constants/gamePhases";

// The peek check (#83): in US peek mode, when the dealer's up card is an ace or a ten, the hole card slides up under the felt's edge and back (the mirror
// check, cardFx.js) and the result is shown before the player acts: "No blackjack", or the hole card flips and the dealer's blackjack shows. Two paths,
// the same animation: with an offer the peek is the PEEK step after OFFERS (its message is already up); with none (a ten up on the Vegas table) the
// peek happened inside the deal, so the check is a display hold after the cards have landed (DEALING to the player's or the dealer's turn): a round that
// offers nothing never gains a reducer step. The hole card's face never reaches the DOM before the result: a blackjack found at the deal is held back
// (`hideHole`) until the check ends. Reserves the board's time and holds it busy (released at the end, or after a timeout), so the next step waits.
// Returns { peek: null | "checking" | "clear", hideHole }. `round`: which deal (state.nextHandTag). Not in no-peek or EU modes. //
const AFTER_CHECK = 200; // ms before the result
const SHOW_CLEAR = 500; // ms "No blackjack" shows

export function usePeek({ phase, dealer, dealerHole, settings, round, speed }) {
  const [peek, setPeek] = useState(null);
  // The round whose check is over: from then on a blackjack's hole card may show its face. A board that opens after the deal has nothing to wait for.
  const [over, setOver] = useState(() => (phase === GamePhases.DEALING ? null : round));
  // The phase before this one, kept as state so a render sees the change (a ref would not survive StrictMode's second effect run).
  const [track, setTrack] = useState({ phase, from: null });
  if (track.phase !== phase) setTrack({ phase, from: track.phase });

  const up = dealer.cards[0];
  const looks = settings.dealerHoleBehaviour === DealerHoleOptions.US_PEEK && !!up && (up.rank === "ace" || up.value === 10);
  const bj = looks && dealer.cards.length + dealerHole.cards.length === 2 && isTotalBlackjack(getHandTotals([...dealer.cards, ...dealerHole.cards]).total);
  const turn = phase === GamePhases.PLAYER_TURN || phase === GamePhases.DEALER_TURN;

  useLayoutEffect(() => {
    if (!looks || !(phase === GamePhases.PEEK || (turn && track.from === GamePhases.DEALING))) return;
    const fx = reducedMotion() ? null : mirrorCheck(speedK(speed));
    if (!fx) { setOver(round); return; }
    const reveal = fx.ms + AFTER_CHECK;
    const total = reveal + (bj ? 0 : SHOW_CLEAR);
    const undo = reserve(performance.now() + total + 100);
    const release = hold(total + 1500);
    setPeek("checking");
    const t1 = setTimeout(() => { setOver(round); setPeek(bj ? null : "clear"); }, reveal);
    const t2 = setTimeout(() => { setPeek(null); release(); }, total);
    return () => { clearTimeout(t1); clearTimeout(t2); fx.cancel(); undo(); release(); setPeek(null); };
    // Once per phase change: what it reads is what the table showed when the phase began.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  return { peek, hideHole: bj && dealer.cards.length === 2 && over !== round };
}
