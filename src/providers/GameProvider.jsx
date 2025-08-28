import { useEffect, useState, useCallback, useMemo } from "react";
import { GamePhases } from "../../utils/constants/gamePhases"; 
import { GameContext } from "../context/GameContext";
import * as gameEngine from "../utils/gameEngine";
import { createShoe } from "../utils/cards";
import { usePlayer } from "../hooks/usePlayer";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";

export function GameProvider({ children }) {
  const [deckCount, setDeckCount] = useState(2);
  const [shoe, setShoe] = useState(createShoe(deckCount));
  const [hands, setHands] = useState([]);
  const [dealer, setDealer] = useState({ cards: [] });
  const [gamePhase, setGamePhase] = useState(GamePhases.PRE_DEAL);
  const [betCircle, setBetCircle] = useState(0);
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameEnded, setGameEnded] = useState(true);
  const { player, addCreditsLocal, updateCreditsOnServer } = usePlayer();
  const [runningCount, setRunningCount] = useState(0);
  const [playedCards, setPlayedCards] = useState([]);

  {/* EFFECTS */} /////////////////////////////////////////////////////////////////////////////////

  // Add new cards to playedCards after every deal, hit, double, split, dealerTurn // 
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

  // Reset playedCards and runningCount when a new shoe is created //
  useEffect(() => {
    setPlayedCards([]);
    setRunningCount(0);
  }, [gameEnded]);

  // Calculate running count from playedCards //
  useEffect(() => {
    let count = 0;
    playedCards.forEach((card) => {
      if (!card || card.type !== "card") count += 0;
      count += card.count || 0;
    });
    setRunningCount(count);
  }, [playedCards]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* HELPERS */} /////////////////////////////////////////////////////////////////////////////////

  // Move to next hand or dealer phase //
  const nextHandOrDealer = useCallback(
    (handIdx) => {
      if (handIdx < hands.length - 1) {
        setSelectedHandIndex(handIdx + 1);
      } else {
        setGamePhase(GamePhases.DEALER_TURN);
        setSelectedHandIndex(0);
      }
    },
    [hands.length]
  );

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* GAME ACTIONS */} ////////////////////////////////////////////////////////////////////////////

  // Deal //
  const deal = useCallback(
    (bet) => {
      updateCreditsOnServer(player.credits);
      const result = gameEngine.dealRound(shoe, bet);
      setHands(result.hands);
      setDealer(result.dealer);
      setShoe(result.shoe);

      if (hands[selectedHandIndex].status === HandStatus.DONE) {
        setGamePhase(GamePhases.DEALER_TURN);
        return;
      }

      setGamePhase(GamePhases.PLAYER_TURN);
    },
    [hands, shoe, selectedHandIndex, player, updateCreditsOnServer]
  );

  // Settle //
  const settle = useCallback(() => {
    const settledHands = gameEngine.settleHands(hands, dealer);
    setHands(settledHands);
    setGamePhase(GamePhases.RESULTS);
  }, [hands, dealer]);

  // Calculate Results //
  const calculateResults = useCallback(() => {
    let creditsToAdd = 0;

    hands.forEach((hand) => {
      creditsToAdd += hand.payout || 0;
    });

    if (creditsToAdd > 0) {
      addCreditsLocal(creditsToAdd);
      updateCreditsOnServer(player.credits + creditsToAdd);
    } else {
      updateCreditsOnServer(player.credits);
    }

    setGamePhase(GamePhases.POST_ROUND);
  }, [hands, player, addCreditsLocal, updateCreditsOnServer]);

  // End Round //
  const endRound = useCallback(() => {
    setTimeout(() => {
      setGamePhase(GamePhases.PRE_DEAL);
      setHands([]);
      setDealer({ cards: [] });
      setBetCircle(0);
      setSelectedHandIndex(0);
    }, 1000);
  }, []);

// Start a new shoe (for Home page or reset) //
  const startNewShoe = useCallback(() => {
    setShoe(createShoe(deckCount));
    setHands([]);
    setDealer({ cards: [] });
    setGamePhase(GamePhases.PRE_DEAL);
    setBetCircle(0);
    setSelectedHandIndex(0);
    setGameStarted(false);
    setGameEnded(true);
  }, [deckCount]);

  // Clear bet and refund //
  const clearBetAndRefund = useCallback(async () => {
    setBetCircle(0);
    if (player) {
      addCreditsLocal(betCircle);
      await updateCreditsOnServer(player.credits + betCircle);
    }
  }, [player, betCircle, addCreditsLocal, updateCreditsOnServer]);

  // Clear bet without refunding //
  const clearBetAndNoRefund = useCallback(async () => {
    setBetCircle(0);
  }, []);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* PLAYER ACTIONS */} //////////////////////////////////////////////////////////////////////////

  // Hit //
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

  // Stay //
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

  // Double //
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

  // Split //
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

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* DEALER ACTIONS */} //////////////////////////////////////////////////////////////////////////

  // Dealer turn //
  const dealerTurn = useCallback(() => {
    if (dealer.status !== HandStatus.DONE) 
    {
      dealer.status = HandStatus.PLAYING;
      const playerAllBust = hands.every((h) => h.result === HandResult.BUST);

      while (dealer.status === HandStatus.PLAYING) {
        const { dealer: newDealer, shoe: newShoe } = gameEngine.dealerPlay(dealer, shoe, playerAllBust);
        setTimeout(() => {
          setDealer(newDealer);
          setShoe(newShoe);
        }, 250);
      }
    }

    setGamePhase(GamePhases.SETTLING_HANDS);
  }, [dealer, shoe, hands]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

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
      gameEnded,
      setGameEnded,
      deal,
      hit,
      stay,
      double,
      split,
      dealerTurn,
      settle,
      calculateResults,
      endRound,
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
      gameEnded,
      deal,
      hit,
      stay,
      double,
      split,
      dealerTurn,
      settle,
      calculateResults,
      endRound,
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