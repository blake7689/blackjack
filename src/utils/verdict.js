import { HandResult } from "./constants/handResult";
import { roundNet } from "./blackjackLogic";
import { money, signed } from "./money";

// The verdict and the result tags (#83, DESIGN section 5): one word on the felt for the round, and with two or more hands a tag under each circle. The hand is
// "blackjack" everywhere in play; Blakejack is only the app's name. //
export const WORDS = { win: "WIN", lose: "LOSE", push: "PUSH", bust: "BUST", surrender: "SURRENDER", even: "EVEN MONEY", bj: "BLACKJACK!" };

// The result light on the felt for each kind (the `.felt.r-*` classes): a win lifts the lamp with a bloom, a blackjack adds a sheen sweep, a push is a
// faint cool bloom, a loss, bust or surrender darkens from the bottom.
export const MOOD = { win: "r-win", bj: "r-bj", even: "r-win", lose: "r-lose", bust: "r-lose", push: "r-push", surrender: "r-lose" };

// What one settled hand was: null until it has a result.
export function handKind(hand) {
  switch (hand.result) {
    case HandResult.WIN: return hand.evenMoney ? "even" : hand.isBlackjack ? "bj" : "win";
    case HandResult.LOSE: return hand.isBusted ? "bust" : "lose";
    case HandResult.PUSH: return "push";
    case HandResult.SURRENDER: return "surrender";
    default: return null;
  }
}

// The tag under a circle (several hands): the word without its "!".
export const tagOf = (hand) => { const kind = handKind(hand); return kind && { kind, text: WORDS[kind].replace("!", "") }; };

// The round's verdict once every hand is settled, else null. One hand names its result (and says how its insurance went); several show the net
// (WIN, LOSE or PUSH). `amt` is the signed net, null when it is 0.
export function verdictOf(hands) {
  if (!hands.length || hands.some((h) => h.result === HandResult.NONE)) return null;
  const net = roundNet(hands);
  const amt = net ? signed(net) : null;
  if (hands.length > 1) {
    const kind = net > 0 ? "win" : net < 0 ? "lose" : "push";
    return { kind, word: WORDS[kind], amt, extra: null };
  }
  const [hand] = hands;
  const kind = handKind(hand);
  const extra = hand.insurance > 0 ? (hand.insurancePayout > 0 ? `Insurance pays ${money(hand.insurancePayout)}` : "Insurance lost") : null;
  return { kind, word: WORDS[kind], amt, extra };
}
