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
  const [shoe, setShoe] = useState([]);
  const [hands, setHands] = useState([]);
  const [dealer, setDealer] = useState({ cards: [] });
  const [gamePhase, setGamePhase] = useState(GamePhases.NONE);
  const [betCircle, setBetCircle] = useState(0);
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
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
      console.log("");
    }
  }, [hands, dealer, playedCards]);

  // Set Game at Start // needed?
  // useEffect(() => { resetGame(); });

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

  {/* CALCULATE & SETTLE */} //////////////////////////////////////////////////////////////////////

  // Calculate Results //
  const calculateResults = useCallback(() => { //using the wrong hands//!!
    let creditsToAdd = 0;
    hands.forEach((hand) => { creditsToAdd += hand.payout || 0; }); //wrong hands//!! //maybe use bet circle//!!
    updateCreditsOnServer(creditsToAdd > 0 ? player.credits + creditsToAdd : player.credits); 
    console.log("Calculatied results and setting to post round.");
    setGamePhase(GamePhases.POST_ROUND);
    setTimeout(() => {}, 5000);
    console.log("");
  }, [hands, player, updateCreditsOnServer]);

  // Settle //
  const settle = useCallback(() => { //using the wrong hands and dealer//!!
    const settledHands = gameEngine.settleHands(hands, dealer); //wrong hands and dealer//!!
    setHands(settledHands); //settling wrong hands//!!
    console.log("Hands have been settled. Proceeding to Calculate Results.");
    setGamePhase(GamePhases.RESULTS);
    setTimeout(() => {
      calculateResults();
    }, 5000);
  }, [hands, dealer, calculateResults]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* DEALER ACTIONS */} //////////////////////////////////////////////////////////////////////////

  const playDealerStep = useCallback(
    (currentDealer, currentShoe, playerAllBust, setDealer, setShoe, setGamePhase, tempCount) => {
      tempCount++;
      if (currentDealer.status === HandStatus.PLAYING) {
        const { dealer: newDealer, shoe: newShoe } = gameEngine.dealerPlay(currentDealer, currentShoe, playerAllBust, tempCount);
        console.log("Dealer Play Call Count: ", tempCount);
        setTimeout(() => {
          playDealerStep(newDealer, newShoe, playerAllBust, setDealer, setShoe, setGamePhase, tempCount);
        }, 5000);
      } else {
        console.log("Dealer has finished playing.");
        setDealer(currentDealer);
        setShoe(currentShoe);
        setGamePhase(GamePhases.SETTLING_HANDS);
        setTimeout(() => {
          settle();
        }, 5000);
      }
    },
    [settle]
  );

  const dealerTurn = useCallback(() => {
    if (dealer.status !== HandStatus.DONE) {
      const tempCount = 0;
      dealer.status = HandStatus.PLAYING;
      const playerAllBust = hands.every((h) => h.result === HandResult.BUST);
      playDealerStep({ ...dealer }, shoe, playerAllBust, setDealer, setShoe, setGamePhase, tempCount);
    } else {
      dealer.dealerDisplayTotal = dealer.total;
      dealer.cards = dealer.cards.map((c) => ({ ...c, faceDown: false }));
      setDealer(dealer);
      console.log("Dealer has finished playing.");
      setGamePhase(GamePhases.SETTLING_HANDS);
      setTimeout(() => {
        settle();
      }, 5000);
    }
  }, [dealer, shoe, hands, setDealer, setShoe, setGamePhase, playDealerStep, settle]);

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
        }, 5000);
      }
    },
    [hands.length, dealerTurn]
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

      if (result.hands[selectedHandIndex] && result.hands[selectedHandIndex].status === HandStatus.DONE) {
        console.log("All player hands completed.");
        setGamePhase(GamePhases.DEALER_TURN);
        setTimeout(() => {
          dealerTurn();
        }, 5000);
        return;
      }
      setGamePhase(GamePhases.PLAYER_TURN);
      console.log("");
    },
    [shoe, selectedHandIndex, player, updateCreditsOnServer, dealerTurn]
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
    updateCreditsOnServer(player.credits + betCircle);
    setBetCircle(0);
    console.log("");
  }, [updateCreditsOnServer, player, betCircle]);

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
      const newHandsTemp = newHands.reduce((sum, h) => sum + h.bet, 0) // Check for accurate bet per hand//!!
      setBetCircle(newHandsTemp);
      updateCreditsOnServer(player.credits - betCircle); // Change to subtract accurate bet amount per hand (handIdx) //!!
      nextHandOrDealer(handIdx);
    },
    [hands, shoe, nextHandOrDealer, player, updateCreditsOnServer, betCircle]
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
      const newHandsTemp = newHands.reduce((sum, h) => sum + h.bet, 0) // Check for accurate bet per hand //!!
      setBetCircle(newHandsTemp);
      updateCreditsOnServer(player.credits - betCircle); // Change to subtract accurate bet amount per hand (handIdx) //!!
      console.log("");
    },
    [hands, shoe, player, updateCreditsOnServer, betCircle]
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