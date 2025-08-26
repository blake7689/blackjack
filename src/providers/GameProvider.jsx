import { useEffect, useState, useCallback, useMemo } from "react";
import { GameContext } from "../context/GameContext";
import * as gameEngine from "../utils/gameEngine";
import { createShoe } from "../utils/cards";
import { usePlayer } from "../hooks/usePlayer";

export function GameProvider({ children }) {
  const [deckCount, setDeckCount] = useState(2);
  const [shoe, setShoe] = useState(createShoe(deckCount));
  const [hands, setHands] = useState([]);
  const [dealer, setDealer] = useState({ cards: [] });
  const [gamePhase, setGamePhase] = useState("preDeal");
  const [betCircle, setBetCircle] = useState(0);
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const { player, addCreditsLocal, updateCreditsOnServer } = usePlayer();
  const [runningCount, setRunningCount] = useState(0);
  const [playedCards, setPlayedCards] = useState([]);

  // Add new cards to playedCards after every deal, hit, double, split, dealerTurn
  useEffect(() => {

    // Collect all cards from hands and dealer
    const roundCards = [];
    hands.forEach((hand) => {
      if (hand.cards) roundCards.push(...hand.cards);
    });

    // Only add dealer cards that are revealed (not faceDown)
    if (dealer && dealer.cards) {
      roundCards.push(...dealer.cards.filter((card) => !card.faceDown));
    }

    // Only add cards that are not already in playedCards (by id)
    const newCards = roundCards.filter(
      (card) => card && card.id && !playedCards.some((c) => c.id === card.id)
    );
    if (newCards.length > 0) {
      setPlayedCards((prev) => [...prev, ...newCards]);
    }
  }, [hands, dealer, playedCards]);

  // Reset playedCards when a new shoe is created
  useEffect(() => {
    setPlayedCards([]);
  }, [deckCount]);

  // Calculate running count from playedCards
  useEffect(() => {
    const CARD_VALUES = {
      "2": 1,
      "3": 1,
      "4": 1,
      "5": 1,
      "6": 1,
      "7": 0,
      "8": 0,
      "9": 0,
      "10": -1,
      J: -1,
      Q: -1,
      K: -1,
      A: -1,
      jack: -1,
      queen: -1,
      king: -1,
      ace: -1,
    };
    function getCardRank(card) {
      if (card.rank) return card.rank;
      if (card.code) {
        const code = card.code;
        if (code.startsWith("A")) return "A";
        if (code.startsWith("K")) return "K";
        if (code.startsWith("Q")) return "Q";
        if (code.startsWith("J")) return "J";
        if (code.startsWith("10")) return "10";
        return code.replace(/[^0-9]/g, "");
      }
      return null;
    }
    let count = 0;
    playedCards.forEach((card) => {
      const rank = getCardRank(card);
      if (rank && Object.keys(CARD_VALUES).includes(rank)) {
        count += CARD_VALUES[rank];
      }
    });
    setRunningCount(count);
  }, [playedCards]);

  // Reset running count ONLY when deckCount changes (new shoe created)
  useEffect(() => {
    setRunningCount(0);
  }, [deckCount]);

  // Deal
  const deal = useCallback(
    (bet) => {
      const result = gameEngine.dealRound(shoe, bet);
      setHands(result.hands);
      setDealer(result.dealer);
      setShoe(result.shoe);
      // If dealer has blackjack, go straight to results (player does NOT get a turn)
      if (result.dealer.blackjack) {
        setGamePhase("results");
        setSelectedHandIndex(0);
        return;
      }
      // If player has blackjack on first two cards, immediately move to dealer turn
      if (result.hands[0].status === "blackjack") {
        setGamePhase("dealerTurn");
        setSelectedHandIndex(0);
        return;
      }
      setGamePhase("playerTurn");
      setSelectedHandIndex(0);
    },
    [shoe]
  );

  // Helper: move to next hand or dealer phase
  const nextHandOrDealer = useCallback(
    (handIdx) => {
      if (handIdx < hands.length - 1) {
        setSelectedHandIndex(handIdx + 1);
      } else {
        setGamePhase("dealerTurn");
        setSelectedHandIndex(0);
      }
    },
    [hands.length]
  );

  // Hit
  const hit = useCallback(
    (handIdx) => {
      const { hand, shoe: newShoe } = gameEngine.playerHit(hands[handIdx], shoe);
      const newHands = hands.map((h, idx) => (idx === handIdx ? hand : h));
      setHands(newHands);
      setShoe(newShoe);
      if (hand.status === "bust" || hand.status === "blackjack") {
        nextHandOrDealer(handIdx);
      }
    },
    [hands, shoe, nextHandOrDealer]
  );

  // Stay
  const stay = useCallback(
    (handIdx) => {
      const newHands = hands.map((h, idx) =>
        idx === handIdx ? { ...h, status: "stand" } : h
      );
      setHands(newHands);
      nextHandOrDealer(handIdx);
    },
    [hands, nextHandOrDealer]
  );

  // Double
  const double = useCallback(
    (handIdx) => {
      const hand = hands[handIdx];
      if (!player || player.credits < hand.bet) return; // can't afford
      const { hand: newHand, shoe: newShoe } = gameEngine.playerDouble(hand, shoe);
      const newHands = hands.map((h, idx) => (idx === handIdx ? newHand : h));
      setHands(newHands);
      setShoe(newShoe);
      // Update betCircle to sum of all hand bets
      setBetCircle(newHands.reduce((sum, h) => sum + h.bet, 0));
      addCreditsLocal(-hand.bet); // subtract credits
      nextHandOrDealer(handIdx);
    },
    [hands, shoe, nextHandOrDealer, player, addCreditsLocal]
  );

  // Split
  const split = useCallback(
    (handIdx) => {
      const hand = hands[handIdx];
      if (!player || player.credits < hand.bet) return; 
      const newHandsArr = gameEngine.playerSplit(hand, shoe);
      const newHands = [
        ...hands.slice(0, handIdx),
        ...newHandsArr,
        ...hands.slice(handIdx + 1),
      ];
      setHands(newHands);
      setBetCircle(newHands.reduce((sum, h) => sum + h.bet, 0));
      addCreditsLocal(-hand.bet); 
    },
    [hands, shoe, player, addCreditsLocal]
  );

  // Dealer turn
  const dealerTurn = useCallback(() => {
    const playerAllBust = hands.every((h) => h.status === "bust");
    const { dealer: newDealer, shoe: newShoe } = gameEngine.dealerPlay(
      dealer,
      shoe,
      playerAllBust
    );
    setDealer(newDealer);
    setShoe(newShoe);

    // Settle hands before showing results
    const settledHands = gameEngine.settleHands(hands, newDealer);
    setHands(settledHands);
    setGamePhase("results");
  }, [dealer, shoe, hands]);

  // Settle
  const settle = useCallback(() => {
    const settledHands = gameEngine.settleHands(hands, dealer);
    setHands(settledHands);

    // Calculate credits to add using payout field
    let creditsToAdd = 0;
    settledHands.forEach((hand) => {
      creditsToAdd += hand.payout || 0;
    });
    if (creditsToAdd > 0) {
      addCreditsLocal(creditsToAdd);
      updateCreditsOnServer(player.credits + creditsToAdd);
    } else {
      updateCreditsOnServer(player.credits);
    }
    setTimeout(() => {
      setGamePhase("preDeal");
      setHands([]);
      setDealer({ cards: [] });
      setBetCircle(0);
      setSelectedHandIndex(0);
    }, 1000);
  }, [hands, dealer, player, addCreditsLocal, updateCreditsOnServer]);

  // Start a new shoe (for Home page or reset)
  const startNewShoe = useCallback(() => {
    setShoe(createShoe(deckCount));
    setHands([]);
    setDealer({ cards: [] });
    setGamePhase("preDeal");
    setBetCircle(0);
    setSelectedHandIndex(0);
    setGameStarted(false);
  }, [deckCount]);

  const clearBetAndRefund = useCallback(async () => {
    setBetCircle(0);
    if (player) {
      addCreditsLocal(betCircle);
      await updateCreditsOnServer(player.credits + betCircle);
    }
  }, [player, betCircle, addCreditsLocal, updateCreditsOnServer]);

  const clearBetAndNoRefund = useCallback(async () => {
    setBetCircle(0);
  }, []);

  const value = useMemo(
    () => ({
      deckCount,
      setDeckCount,
      shoe,
      setShoe,
      hands,
      setHands,
      dealer,
      setDealer,
      gamePhase,
      setGamePhase,
      betCircle,
      setBetCircle,
      selectedHandIndex,
      setSelectedHandIndex,
      gameStarted,
      setGameStarted,
      deal,
      hit,
      stay,
      double,
      split,
      dealerTurn,
      settle,
      startNewShoe,
      clearBetAndRefund,
      clearBetAndNoRefund,
      runningCount,
    }),
    [
      deckCount,
      shoe,
      hands,
      dealer,
      gamePhase,
      betCircle,
      selectedHandIndex,
      gameStarted,
      deal,
      hit,
      stay,
      double,
      split,
      dealerTurn,
      settle,
      startNewShoe,
      clearBetAndRefund,
      clearBetAndNoRefund,
      runningCount,
    ]
  );

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}