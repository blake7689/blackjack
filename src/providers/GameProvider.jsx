import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { GamePhases } from "../utils/constants/gamePhases"; 
import { GameContext } from "../context/GameContext";
import * as gameEngine from "../utils/gameEngine";
import { createShoe } from "../utils/cards";
import { usePlayer } from "../hooks/usePlayer";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";

export function GameProvider({ children }) {
  const [deckCount, setDeckCount] = useState(2);
  const [shoe, setShoe] = useState([]);
  const [hands, setHands] = useState([]);
  const [dealer, setDealer] = useState({ cards: [] });
  const [gamePhase, setGamePhase] = useState(GamePhases.NONE);
  const [betCircle, setBetCircle] = useState(0);
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const { player, updateCreditsOnServer } = usePlayer();
  const [runningCount, setRunningCount] = useState(0);
  const [playedCards, setPlayedCards] = useState([]);
  const [lastCreditChange, setLastCreditChange] = useState(0);

  const handsRef = useRef(hands);
  const dealerRef = useRef(dealer);
  const gamePhaseRef = useRef(gamePhase);
  const playerRef = useRef(player);
  const shoeRef = useRef(shoe);

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
      console.log("");
    }
  }, [hands, dealer, playedCards]);

  useEffect(() => { 
    handsRef.current = hands; 
  }, [hands]);
  useEffect(() => { 
    dealerRef.current = dealer;
  }, [dealer]);
  useEffect(() => { 
    gamePhaseRef.current = gamePhase; 
  }, [gamePhase]);
  useEffect(() => { 
    playerRef.current = player; 
  }, [player]);
  useEffect(() => { 
    shoeRef.current = shoe; 
  }, [shoe]);

  // Calculate running count from playedCards //
  useEffect(() => {
    let count = 0;
    playedCards.forEach((card) => {
      if (!card || card.type !== "card") count += 0;
      count += card.count || 0;
    });
    setRunningCount(count);
    console.log("");
  }, [playedCards]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* Update Credits */} //////////////////////////////////////////////////////////////////////////

  const updateCredits = useCallback((newCredits) => {
    const diff = newCredits - playerRef.current.credits;
    setLastCreditChange(diff);
    updateCreditsOnServer(newCredits);
    setTimeout(() => setLastCreditChange(0), 2000);
  }, [updateCreditsOnServer]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* CALCULATE & SETTLE */} //////////////////////////////////////////////////////////////////////

  // Calculate Results //
  const calculateResults = useCallback(() => {
    let creditsToAdd = 0;
    handsRef.current.forEach((hand) => { creditsToAdd += hand.payout || 0; });
    if (creditsToAdd > 0) {
      updateCredits(playerRef.current.credits + creditsToAdd);
    }
    console.log("Calculated results and setting to post round.");
    setGamePhase(GamePhases.POST_ROUND);
    setTimeout(() => {}, 1000);
    console.log("");
  }, [updateCredits]);

  // Settle //
  const settle = useCallback(() => {
    const settledHands = gameEngine.settleHands(handsRef.current, dealerRef.current);
    setHands(settledHands);
    console.log("Hands have been settled. Proceeding to Calculate Results.");
    setGamePhase(GamePhases.RESULTS);
    setTimeout(() => {
      calculateResults();
    }, 1000);
  }, [calculateResults]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* DEALER ACTIONS */} //////////////////////////////////////////////////////////////////////////

  const playDealerStep = useCallback(
    (currentDealer, currentShoe, playerAllBust, tempCount) => {
      tempCount++;
      setDealer(currentDealer);
      setShoe(currentShoe);
      
      if (currentDealer.status === HandStatus.PLAYING) {
        const { dealer: newDealer, shoe: newShoe } = gameEngine.dealerPlay(currentDealer, currentShoe, playerAllBust, tempCount);
        console.log("Dealer Play Call Count: ", tempCount);
        setTimeout(() => {
          playDealerStep(newDealer, newShoe, playerAllBust, tempCount);
        }, 1000);
      } else {
        console.log("Dealer has finished playing.");
        setGamePhase(GamePhases.SETTLING_HANDS);
        setTimeout(() => {
          settle();
        }, 1000);
      }
    },
    [settle]
  );

  const dealerTurn = useCallback(() => {
  const d = { ...dealerRef.current };
  d.dealerDisplayTotal = d.total;
  d.cards = d.cards.map((c) => ({ ...c, faceDown: false }));
  setDealer(d);

  if (d.status !== HandStatus.DONE) {
    const tempCount = 0;
    d.status = HandStatus.PLAYING;
    const playerAllBust = handsRef.current.every((h) => h.isBusted === true);
    setTimeout(() => {
      playDealerStep(d, shoeRef.current, playerAllBust, tempCount);
    }, 1000);
  } else {
    console.log("Dealer has finished playing.");
    setGamePhase(GamePhases.SETTLING_HANDS);
    setTimeout(() => {
      settle();
    }, 1000);
  }
}, [playDealerStep, settle]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* HELPERS */} /////////////////////////////////////////////////////////////////////////////////

  // Move to next hand or dealer phase //
  const nextHandOrDealer = useCallback(
    (handIdx) => {
      if (handIdx < hands.length - 1) { 
        setSelectedHandIndex(handIdx + 1); 
      } 
      else { 
        setSelectedHandIndex(0); 
        console.log("All player hands completed.");
        setGamePhase(GamePhases.DEALER_TURN); 
        setTimeout(() => {
          dealerTurn();
        }, 1000);
      }
    },
    [hands.length, dealerTurn]
  );

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* GAME ACTIONS */} ////////////////////////////////////////////////////////////////////////////

  // Deal //
  const deal = useCallback(
    (bet) => {
      updateCredits(player.credits);
      const result = gameEngine.dealRound(shoe, bet);
      setHands(result.hands);
      setDealer(result.dealer);
      setShoe(result.shoe);

      if (result.hands[selectedHandIndex] && result.hands[selectedHandIndex].status === HandStatus.DONE) {
        console.log("All player hands completed.");
        setGamePhase(GamePhases.DEALER_TURN);
        setTimeout(() => {
          dealerTurn();
        }, 1000);
        return;
      }
      setGamePhase(GamePhases.PLAYER_TURN);
      console.log("");
    },
    [shoe, selectedHandIndex, player, updateCredits, dealerTurn]
  );

  // End Round //
  const endRound = useCallback(() => {
      setGamePhase(GamePhases.PRE_DEAL);
      setHands([]);
      setDealer({ cards: [] });
      setBetCircle(0);
      setSelectedHandIndex(0);
      console.log("");
  }, []);

  // Reset Game //
  const resetGame = useCallback(() => {
    console.log("Resetting game.");
    setShoe(createShoe(deckCount));
    setHands([]);
    setDealer({ cards: [] });
    setGamePhase(GamePhases.NONE);
    setBetCircle(0);
    setSelectedHandIndex(0);
    setPlayedCards([]);
    setRunningCount(0);
    console.log("");
  }, [deckCount]);

   // Start Game //
  const startGame = useCallback(() => {
    console.log("Starting game.");
    setShoe(createShoe(deckCount));
    setGamePhase(GamePhases.PRE_DEAL);
  }, [deckCount]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* PLAYER CREDITS */} //////////////////////////////////////////////////////////////////////////

  // Clear bet and refund //
  const clearBetAndRefund = useCallback(() => {
    updateCredits(player.credits + betCircle);
    setBetCircle(0);
    console.log("");
  }, [updateCredits, player, betCircle]);

  // Clear bet without refunding //
  const clearBetAndNoRefund = useCallback(() => {
    setBetCircle(0);
    console.log("");
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

      if (!player || player.credits < hand.bet) {
        return; // can't afford bet redundancy
      }

      const { hand: newHand, shoe: newShoe } = gameEngine.playerDouble(hand, shoe);
      const newHands = hands.map((h, idx) => (idx === handIdx ? newHand : h));

      setHands(newHands);
      setShoe(newShoe);
      setBetCircle(newHands.reduce((sum, h) => sum + h.bet, 0));
      updateCredits(player.credits - hand.bet); 
      nextHandOrDealer(handIdx);
    },
    [hands, shoe, nextHandOrDealer, player, updateCredits]
  );

  // Split //
  const split = useCallback(
    (handIdx) => {
      const hand = hands[handIdx];

      if (!player || player.credits < hand.bet) {
        return; // can't afford bet redundancy
      }

      const { newHandsArray: newHandsArr, shoe: newShoe } = gameEngine.playerSplit(hand, shoe);
      const newHands = [
        ...hands.slice(0, handIdx),
        ...newHandsArr,
        ...hands.slice(handIdx + 1),
      ];
      
      setHands(newHands);
      setShoe(newShoe);
      setBetCircle(newHands.reduce((sum, h) => sum + h.bet, 0));
      updateCredits(player.credits - hand.bet); 
      console.log("");
    },
    [hands, shoe, player, updateCredits]
  );

  /////////////////////////////////////////////////////////////////////////////////////////////////

  // Memoized context value //
  const value = useMemo(
    () => ({
      deckCount,
      shoe,
      hands,
      dealer,
      gamePhase,
      betCircle,
      selectedHandIndex,
      runningCount,
      lastCreditChange,
      updateCredits,
      deal,
      hit,
      stay,
      double,
      split,
      endRound,
      resetGame,
      startGame,
      clearBetAndRefund,
      clearBetAndNoRefund,
      setDeckCount,
      setGamePhase,
      setBetCircle,
    }),
    [
      deckCount,
      shoe,
      hands,
      dealer,
      gamePhase,
      betCircle,
      selectedHandIndex,
      runningCount,
      lastCreditChange,
      updateCredits,
      deal,
      hit,
      stay,
      double,
      split,
      endRound,
      resetGame,
      startGame,
      clearBetAndRefund,
      clearBetAndNoRefund,
      setDeckCount,
      setGamePhase,
      setBetCircle,
    ]
  );

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}