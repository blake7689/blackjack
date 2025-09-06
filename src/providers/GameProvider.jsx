import { useEffect, useState, useCallback, useMemo } from "react";
import { GamePhases } from "../utils/constants/gamePhases"; 
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
  const [gamePhase, setGamePhase] = useState(/*GamePhases.PRE_DEAL*/);
  const [betCircle, setBetCircle] = useState(0);
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameEnded, setGameEnded] = useState(true);
  const { player, updateCreditsOnServer } = usePlayer();
  const [runningCount, setRunningCount] = useState(0);
  const [playedCards, setPlayedCards] = useState([]);

  {/* EFFECTS */} /////////////////////////////////////////////////////////////////////////////////

  // Add new cards to playedCards after every deal, hit, double, split, dealerTurn // 
  useEffect(() => {
    const roundCards = [];

    hands.forEach((hand) => {
      if (hand.cards) roundCards.push(...hand.cards);
    });

    if (dealer && dealer.cards) {
      roundCards.push(...dealer.cards.filter((card) => !card.faceDown));
    }
    
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
      if (handIdx < hands.length - 1) { setSelectedHandIndex(handIdx + 1); } 
      else { 
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
      // Use result.hands instead of hands[selectedHandIndex]
      if (result.hands[selectedHandIndex] && result.hands[selectedHandIndex].status === HandStatus.DONE) {
        setGamePhase(GamePhases.DEALER_TURN);
        return;
      }
      setGamePhase(GamePhases.PLAYER_TURN);
    },
    [shoe, selectedHandIndex, player, updateCreditsOnServer]
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
    hands.forEach((hand) => { creditsToAdd += hand.payout || 0; });
    updateCreditsOnServer(creditsToAdd > 0 ? player.credits + creditsToAdd : player.credits);
    setGamePhase(GamePhases.POST_ROUND);
  }, [hands, player, updateCreditsOnServer]);

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

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* PLAYER CREDITS */} //////////////////////////////////////////////////////////////////////////

  // Clear bet and refund //
  const clearBetAndRefund = useCallback(() => {
    updateCreditsOnServer(player.credits + betCircle);
    setBetCircle(0);
  }, [updateCreditsOnServer, player, betCircle]);

  // Clear bet without refunding //
  const clearBetAndNoRefund = useCallback(() => {
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

      if (hand.status === HandStatus.DONE) {
        nextHandOrDealer(handIdx);
      }
    },
    [hands, shoe, nextHandOrDealer]
  );

  // Stay //
  const stay = useCallback(
    (handIdx) => {
      const newHands = hands.map((h, idx) => (idx === handIdx ? { ...h, status: HandStatus.DONE } : h));

      setHands(newHands);
      nextHandOrDealer(handIdx);
    },
    [hands, nextHandOrDealer]
  );

  // Double //
  const double = useCallback(
    (handIdx) => {
      const hand = hands[handIdx];

      if (!player || player.credits < hand.bet) return; // can't afford bet redundancy

      const { hand: newHand, shoe: newShoe } = gameEngine.playerDouble(hand, shoe);
      const newHands = hands.map((h, idx) => (idx === handIdx ? newHand : h));

      setHands(newHands);
      setShoe(newShoe);
      setBetCircle(newHands.reduce((sum, h) => sum + h.bet, 0));
      updateCreditsOnServer(player.credits - betCircle);
      nextHandOrDealer(handIdx);
    },
    [hands, shoe, nextHandOrDealer, player, updateCreditsOnServer, betCircle]
  );

  // Split //
  const split = useCallback(
    (handIdx) => {
      const hand = hands[handIdx];

      if (!player || player.credits < hand.bet) return; // can't afford bet redundancy

      const newHandsArr = gameEngine.playerSplit(hand, shoe);
      const newHands = [
        ...hands.slice(0, handIdx),
        ...newHandsArr,
        ...hands.slice(handIdx + 1),
      ];
      
      setHands(newHands);
      setBetCircle(newHands.reduce((sum, h) => sum + h.bet, 0));
      updateCreditsOnServer(player.credits - betCircle);
    },
    [hands, shoe, player, updateCreditsOnServer, betCircle]
  );

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* DEALER ACTIONS */} //////////////////////////////////////////////////////////////////////////

  const playDealerStep = useCallback(
    (currentDealer, currentShoe, playerAllBust, setDealer, setShoe, setGamePhase, tempCount) => {
      tempCount++;
      if (currentDealer.status === HandStatus.PLAYING) {
        const { dealer: newDealer, shoe: newShoe } = gameEngine.dealerPlay(currentDealer, currentShoe, playerAllBust, tempCount);
        setDealer(newDealer);
        setShoe(newShoe);
        setTimeout(() => {
          playDealerStep(newDealer, newShoe, playerAllBust, setDealer, setShoe, setGamePhase, tempCount);
        }, 250);
      } else {
        setGamePhase(GamePhases.SETTLING_HANDS);
      }
    },
    []
  );

  const dealerTurn = useCallback(() => {
    if (dealer.status !== HandStatus.DONE) {
      const tempCount = 0;
      dealer.status = HandStatus.PLAYING;
      const playerAllBust = hands.every((h) => h.result === HandResult.BUST);
      playDealerStep({ ...dealer }, shoe, playerAllBust, setDealer, setShoe, setGamePhase, tempCount);
    } else {
      setGamePhase(GamePhases.SETTLING_HANDS);
    }
  }, [dealer, shoe, hands, setDealer, setShoe, setGamePhase, playDealerStep]);

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