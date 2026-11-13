/* Blakejack mockup: the table rules, as pure functions. Each one mirrors the app's engine, named after its counterpart in
   src/utils/blackjackLogic.js, gameEngine.js and gameReducer.js, so the build can check them side by side. The table in mockup.js plays
   every round through these; simulateRound() plays one round through the same steps without animation (the audit compares it with the
   app's reducer on thousands of stacked shoes). A card is { r: "A" | "2".."10" | "J" | "Q" | "K", s }. A hand (a seat) is
   { cards, bet, dbl, ins, base, split, sur, surWait, even, natural, busted, done, result }: bet = the first stake, dbl = what a double or
   triple added, base = the stake a dealer blackjack may take under noHoleCardLoss "original" (0 on a split-off hand), result = app result. */
(function (root) {
  "use strict";
  const WIN = "Win", LOSE = "Lose", PUSH = "Push", SURRENDER = "Surrendered";
  const val = (c) => (c.r === "A" ? 11 : "KQJ".includes(c.r) ? 10 : +c.r);
  const cents = (n) => Math.round(n * 100) / 100;

  // getHandTotals: every total that does not bust (ace = 1 or 11), best first
  function totals(cards) {
    let t = 0, aces = 0; for (const c of cards) { if (val(c) === 11) aces++; else t += val(c); }
    if (!aces) return { totals: [t], total: t };
    if (t + aces > 21) return { totals: [t + aces], total: t + aces };
    const all = [...new Set(Array.from({ length: aces + 1 }, (_, a) => t + (aces - a) + 11 * a))].sort((x, y) => y - x).filter((x) => x <= 21);
    return { totals: all, total: Math.max(...all) };
  }
  const best = (cards) => totals(cards).total;
  const soft = (cards) => totals(cards).totals.length > 1;
  const stake = (h) => h.bet + (h.dbl || 0);
  const isPeek = (s) => s.dealerHoleBehaviour === "peek";
  const isEU = (s) => s.dealerHoleBehaviour === "eu";
  const isSplitAces = (h) => !!h.split && h.cards[0].r === "A";
  const twentyOne = (cards) => cards.length === 2 && best(cards) === 21;

  // canSplit: two cards of equal VALUE (K + 10 splits), under the hand limit (0 = no limit), split aces again only with resplitAces
  const canSplit = (h, handCount, s) => h.cards.length === 2 && val(h.cards[0]) === val(h.cards[1])
    && (s.maxSplitHands === 0 || handCount < s.maxSplitHands) && (s.resplitAces || !isSplitAces(h));
  // canHit: never a split ace, unless hitSplitAces
  const canHit = (h, s) => !!s.hitSplitAces || !isSplitAces(h);
  // canDouble (and triple): two cards, never split aces, after a split only with DAS, doubleOn on the best total
  function canDouble(h, s) {
    if (h.cards.length !== 2 || isSplitAces(h) || (h.split && !s.doubleAfterSplit)) return false;
    if (s.doubleOn === "any") return true;
    const t = best(h.cards); return t >= (s.doubleOn === "9-11" ? 9 : 10) && t <= 11;
  }
  // earlyOffer: early surrender against an ace or ten is decided before the peek, so only in a peek game; earlyNoAce: a ten only
  const earlyOffer = (up, s) => (s.surrender === "early" || s.surrender === "earlyNoAce") && isPeek(s) && (val(up) === 10 || (val(up) === 11 && s.surrender === "early"));
  // canSurrender: the first two cards of a hand not split or doubled; earlyNoAce never against an ace; an early offer is never repeated on the turn
  const canSurrender = (h, up, s) => s.surrender !== "none" && h.cards.length === 2 && !h.split && !h.dbl
    && !(s.surrender === "earlyNoAce" && val(up) === 11) && !earlyOffer(up, s);
  const insuranceStake = (bet) => cents(bet / 2);
  const bjPaysWithoutPeek = (s) => !!s.blackjackPaysImmediately || (isEU(s) && !s.dealerDrawsOnPlayerBlackjack);
  // offersAtDeal: { insurance, evenMoney, surrender } or null when nothing is offered
  function offersAtDeal(cards, up, s, bet, credits) {
    const bj = best(cards) === 21, ace = !!s.insurance && val(up) === 11;
    const o = { evenMoney: ace && bj && (isPeek(s) || !bjPaysWithoutPeek(s)), insurance: ace && !bj && !(credits < insuranceStake(bet)), surrender: !bj && earlyOffer(up, s) };
    return o.evenMoney || o.insurance || o.surrender ? o : null;
  }
  // playerSurrender: late with no peek against an ace or ten waits for the dealer's blackjack check; any other surrender is final
  const surrenderWaits = (up, s) => s.surrender === "late" && !isPeek(s) && val(up) >= 10;
  // getInitialPlayerHandEvaluation
  function initialEval(h, dealerBJ, paysNow) {
    if (dealerBJ && h.natural) { h.done = true; h.result = PUSH; } else if (dealerBJ) { h.done = true; h.result = LOSE; }
    else if (h.natural) { h.done = true; if (paysNow) h.result = WIN; }
  }
  // getHandEvaluation after a card: bust, or any 21, ends the hand (21 on two cards after a split is a blackjack only with blackJackOnSplit)
  function afterCard(h, s) {
    const t = best(h.cards);
    if (t > 21) { h.busted = true; h.done = true; h.result = LOSE; } else if (t === 21) h.done = true;
    if (h.split && h.cards.length === 2) h.natural = t === 21 && !!s.blackJackOnSplit;
  }
  // playerSplit: split aces take one card and stand, unless hitSplitAces, or resplitAces and the card is another ace
  const standsAfterOne = (h, s) => isSplitAces(h) && !s.hitSplitAces && !(s.resplitAces && h.cards[1].r === "A");
  // a split ace that can neither hit nor split again (the hand limit) has nothing left to do
  const stuck = (h, handCount, s) => !h.done && h.cards.length === 2 && !canHit(h, s) && !canSplit(h, handCount, s);
  // dealer: the status after the deal (getInitialDealerHandEvaluation + getDealerHandEvaluation on the two cards)
  function initialDealerStatus(playerBJ, dealerBJRevealed, dcards, s) {
    if (dealerBJRevealed) return "done";
    if (playerBJ && isEU(s) && !s.dealerDrawsOnPlayerBlackjack) return "done";
    if (isEU(s)) return "drawHole";
    return dealerStands(dcards, s) ? "done" : "playing";
  }
  // getDealerHandEvaluation: stand on 17-21, except a soft 17 when the dealer hits soft 17
  const dealerStands = (cards, s) => { const t = totals(cards); return t.total > 21 || (t.totals.some((x) => x >= 17 && x <= 21) && !(s.dealerHitsSoft17 && t.total === 17 && t.totals.length > 1)); };
  // dealerNeedsToPlay / dealerOnlyChecksBlackjack / dealerShowsSecondCard
  const needsToPlay = (hs) => hs.some((h) => !h.busted && !h.result && !h.sur);
  const onlyChecksBJ = (hs, s) => hs.filter((h) => !h.busted && !h.result).every((h) => h.natural || h.sur || (!!s.dealerDrawsOnceOn21 && isEU(s) && best(h.cards) === 21));
  const showsSecond = (hs, s) => (!!s.dealerDrawsOnPlayerBust && hs.every((h) => h.busted)) || (!!s.dealerDrawsOnPlayerBlackjack && hs.some((h) => h.natural)) || hs.some((h) => h.sur || h.ins > 0);
  // the dealer's turn, set up as at DEALER_REVEAL; then dealerWantsCard() says whether DEALER_STEP draws
  function dealerTurn(status, hs, s) { return { status: status === "done" ? "done" : status === "drawHole" ? "drawHole" : "playing", checkBJOnly: onlyChecksBJ(hs, s), skip: !needsToPlay(hs) && !showsSecond(hs, s) }; }
  function dealerWantsCard(cards, t) { const need = t.status === "playing" || (t.status === "drawHole" && cards.length < 2); return !t.skip && need && !(t.checkBJOnly && cards.length >= 2); }
  function dealerAfterStep(cards, t, s) {
    if (t.skip || (t.checkBJOnly && cards.length >= 2)) { t.status = "done"; return; }
    if (best(cards) > 21) { t.status = "done"; t.busted = true; } else if (dealerStands(cards, s)) t.status = "done"; else t.status = "playing";
  }
  // settleHand
  function settle(h, d, s) {
    let result = h.result;
    if (!result) {
      const t = best(h.cards);
      if (h.sur) result = d.bj ? LOSE : SURRENDER; else if (h.busted) result = LOSE; else if (h.natural && d.bj) result = PUSH;
      else if (h.natural) result = WIN; else if (d.bj) result = LOSE; else if (t > d.total || d.busted) result = WIN; else if (t === d.total) result = PUSH; else result = LOSE;
    }
    const bet = stake(h); let payout = 0;
    if (result === WIN && h.natural && !h.even) payout = cents(bet * (s.blackjackPayout === "6:5" ? 2.2 : 2.5));
    else if (result === LOSE && d.bj && !h.busted && s.noHoleCardLoss === "original") payout = Math.max(0, bet - (h.base ?? bet));
    else if (result === SURRENDER) payout = bet / 2; else if (result === WIN) payout = bet * 2; else if (result === PUSH) payout = bet;
    const insPay = h.ins > 0 && d.bj ? h.ins * 3 : 0;
    return { result, payout: payout + insPay, insPay };
  }
  // revealHiddenCards: a face-down double's card joins the hand at REVEAL_HIDDEN (after the dealer, before settling); until then
  // the total, a bust and the result ignore it, so the dealer plays as if the hand were still alive
  function reveal(h, s) { if (!h.hidden || !h.hidden.length) return; h.cards.push(...h.hidden); h.hidden = []; afterCard(h, s); }
  // what the table shows for a settled hand
  const kindOf = (h, r) => (r === WIN ? (h.even ? "even" : h.natural ? "bj" : "win") : r === LOSE ? (h.busted ? "bust" : "lose") : r === PUSH ? "push" : "surrender");

  /* simulateRound: one seat, played through the same steps as the table (mockup.js), without animation.
     actions: "hit" | "stand" | "double" | "triple" | "split" | "surrender", in order (a hand with nothing left stands);
     offers: "take_insurance" | "even_money" | "surrender", in order (the rest are declined). splitDeal: "one" | "both". */
  function simulateRound({ cards, settings: s, bet = 10, actions = [], offers = [], credits = 1e9 }) {
    const shoe = cards.map((c) => (typeof c === "string" ? { r: c, s: "S" } : c)); let k = 0;
    const draw = () => { if (k >= shoe.length) throw new Error("Scenario shoe ran out of cards"); return shoe[k++]; };
    const h0 = { cards: [], bet, dbl: 0, ins: 0, base: bet, split: false, done: false, result: null, origin: 0 };
    const D = [];
    h0.cards.push(draw()); D.push(draw()); h0.cards.push(draw()); if (!isEU(s)) D.push(draw());
    const hands = [h0]; h0.natural = twentyOne(h0.cards);
    const o = offersAtDeal(h0.cards, D[0], s, bet, credits); const deferPeek = isPeek(s) && !!o;
    const dealerBJRevealed = isPeek(s) && !deferPeek && twentyOne(D);
    initialEval(h0, dealerBJRevealed, !deferPeek && (isPeek(s) || bjPaysWithoutPeek(s)));
    let dStatus = initialDealerStatus(h0.natural, dealerBJRevealed, D, s);
    if (o) {
      const open = { ...o }; const q = [...offers];
      while (open.insurance || open.evenMoney || open.surrender) {
        const a = q.shift();
        if (a === "take_insurance" && open.insurance) { h0.ins = insuranceStake(bet); open.insurance = false; }
        else if (a === "even_money" && open.evenMoney) { h0.even = true; h0.result = WIN; open.evenMoney = false; open.insurance = false; }
        else if (a === "surrender" && open.surrender) { h0.sur = true; h0.done = true; h0.surWait = surrenderWaits(D[0], s); if (!h0.surWait) h0.result = SURRENDER; open.surrender = false; }
        else if (!a) { open.insurance = open.evenMoney = open.surrender = false; }
      }
      if (deferPeek) { // peekDealer
        const bj = twentyOne(D);
        for (const h of hands) if (!h.even && !h.sur) initialEval(h, bj, true);
        if (bj) dStatus = "done";
      }
    }
    // the player's turn
    const q = [...actions];
    for (let i = 0; i < hands.length; i++) {
      const h = hands[i];
      if (h.cards.length === 1) { h.cards.push(draw()); afterCard(h, s); if (standsAfterOne(h, s)) h.done = true; if (stuck(h, hands.length, s)) h.done = true; }
      while (!h.done) {
        const a = q.shift() ?? "stand";
        if (a === "stand") h.done = true;
        else if (a === "hit" && canHit(h, s)) { h.cards.push(draw()); afterCard(h, s); }
        else if ((a === "double" || a === "triple") && canDouble(h, s) && (a === "double" || s.tripleDown)) {
          h.dbl = a === "double" ? h.bet : h.bet * 2;
          if (a === "double" && s.doubleFaceDown) { h.hidden = [draw()]; h.done = true; continue; } // playerDouble faceDown
          h.cards.push(draw());
          if (a === "triple" && (s.tripleDrawsOnBust || best(h.cards) <= 21)) h.cards.push(draw());
          afterCard(h, s); h.done = true;
        } else if (a === "surrender" && canSurrender(h, D[0], s)) { h.sur = true; h.done = true; h.surWait = surrenderWaits(D[0], s); if (!h.surWait) h.result = SURRENDER; }
        else if (a === "split" && canSplit(h, hands.length, s)) {
          const n = { cards: [h.cards.pop()], bet: h.bet, dbl: 0, ins: 0, base: 0, split: true, done: false, result: null, origin: 0 }; h.split = true;
          hands.splice(i + 1, 0, n);
          h.cards.push(draw()); afterCard(h, s); if (standsAfterOne(h, s)) h.done = true;
          if (s.splitDeal === "both") { n.cards.push(draw()); afterCard(n, s); if (standsAfterOne(n, s)) n.done = true; }
          for (const x of hands) if (x.cards.length === 2 && stuck(x, hands.length, s)) x.done = true;
        }
      }
    }
    // the dealer's turn
    const t = dealerTurn(dStatus, hands, s);
    if (t.status !== "done") { while (dealerWantsCard(D, t)) { D.push(draw()); dealerAfterStep(D, t, s); } if (t.status !== "done") dealerAfterStep(D, t, s); }
    for (const h of hands) reveal(h, s); // REVEAL_HIDDEN
    const d = { cards: D, total: best(D), bj: twentyOne(D), busted: best(D) > 21 };
    const settled = hands.map((h) => settle(h, d, s));
    return { hands, dealer: D, results: settled.map((x) => x.result), payout: settled.reduce((a, x) => a + x.payout, 0), staked: hands.reduce((a, h) => a + stake(h), 0), insurance: hands.reduce((a, h) => a + (h.ins || 0), 0), cardsUsed: k };
  }

  root.BJRules = { WIN, LOSE, PUSH, SURRENDER, val, cents, totals, best, soft, stake, isPeek, isEU, isSplitAces, twentyOne, canSplit, canHit, canDouble, earlyOffer, canSurrender,
    insuranceStake, bjPaysWithoutPeek, offersAtDeal, surrenderWaits, initialEval, afterCard, standsAfterOne, stuck, initialDealerStatus, dealerStands,
    needsToPlay, onlyChecksBJ, showsSecond, dealerTurn, dealerWantsCard, dealerAfterStep, reveal, settle, kindOf, simulateRound };
})(typeof window !== "undefined" ? window : globalThis);
