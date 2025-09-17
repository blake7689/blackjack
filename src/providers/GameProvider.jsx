import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { GamePhases } from "../utils/constants/gamePhases"; 
import { GameContext } from "../context/GameContext";
import * as gameEngine from "../utils/gameEngine";
import { createShoe } from "../utils/cards";
import { usePlayer } from "../hooks/usePlayer";
import { HandStatus } from "../utils/constants/handStatus";

export function GameProvider({ children }) {
  const [deckCount, setDeckCount] = useState(2);
  const [shoe, setShoe] = useState([]);
  const [hands, setHands] = useState([]);
  const [dealer, setDealer] = useState({ cards: [] });
  const [gamePhase, setGamePhase] = useState(GamePhases.NONE);
  const [betCircle, setBetCircle] = useState(0);
  const [selectedHandIndex, setSelectedHandIndex] = useState(0);
  const { player, updateCreditsOnServer, addCreditsLocalOnly } = usePlayer();
  const [runningCount, setRunningCount] = useState(0);
  const [playedCards, setPlayedCards] = useState([]);
  const [lastCreditChange, setLastCreditChange] = useState(0);
  const [cutCardFound, setCutCardFound] = useState(false);
  const [includeCutCard, setIncludeCutCard] = useState(true);

  const handsRef = useRef(hands);
  const dealerRef = useRef(dealer);
  const gamePhaseRef = useRef(gamePhase);
  const playerRef = useRef(player);
  const shoeRef = useRef(shoe);
  const cutCardFoundRef = useRef(cutCardFound);

  {/* EFFECTS */} /////////////////////////////////////////////////////////////////////////////////

  // Add new cards to playedCards after every deal, hit, double, split, dealerTurn // 
  useEffect(() => {
    const roundCards = [];
    hands.forEach((hand) => { if (hand.cards) roundCards.push(...hand.cards); }); // Push hand.cards to roundCards
    if (dealer && dealer.cards) { roundCards.push(...dealer.cards.filter((card) => !card.faceDown)); } // Push dealer.cards to roundCards
    const newCards = roundCards.filter((card) => card && card.id && !playedCards.some((c) => c.id === card.id)); // Find new cards not already in playedCards
    if (newCards.length > 0) { setPlayedCards((prev) => [...prev, ...newCards]); } // Set PlayedCards if new cards found
  }, [hands, dealer, playedCards]);

  useEffect(() => { handsRef.current = hands; }, [hands]);
  useEffect(() => { dealerRef.current = dealer; }, [dealer]);
  useEffect(() => { gamePhaseRef.current = gamePhase; }, [gamePhase]);
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { shoeRef.current = shoe; }, [shoe]);
  useEffect(() => { cutCardFoundRef.current = cutCardFound; }, [cutCardFound]);

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

  {/* PLAYER CREDITS */} //////////////////////////////////////////////////////////////////////////

  const refundLocal = useCallback(() => {
    addCreditsLocalOnly(betCircle);
  }, [addCreditsLocalOnly, betCircle]);

  const updateCredits = useCallback((newCredits) => {
    const diff = newCredits - playerRef.current.credits;
    setLastCreditChange(diff);
    updateCreditsOnServer(newCredits);
    setTimeout(() => setLastCreditChange(0), 3000);
  }, [updateCreditsOnServer]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* GAME ACTIONS */} ////////////////////////////////////////////////////////////////////////////

  // Reset Shoe //
  const resetShoe = useCallback((needsShoe = false) => {
    setShoe(createShoe(deckCount, includeCutCard));
    setPlayedCards([]);
    setRunningCount(0);
    if (needsShoe) { return shoeRef.current; }
  }, [deckCount, includeCutCard]);

  // End Round //
  const endRound = useCallback(() => {
    setGamePhase(GamePhases.PRE_DEAL);
    setHands([]);
    setDealer({ cards: [] });
    setBetCircle(0);
    setSelectedHandIndex(0);
    if (cutCardFoundRef.current) { 
      resetShoe(); 
      setCutCardFound(false); 
    }
  }, [resetShoe]);

  // Reset Game //
  const resetGame = useCallback((currentDeckCount = deckCount, currentIncludeCutCard = includeCutCard, newGamePhase = GamePhases.NONE) => {
    setShoe(createShoe(currentDeckCount, currentIncludeCutCard));
    setHands([]);
    setDealer({ cards: [] });
    setGamePhase(newGamePhase);
    setBetCircle(0);
    setSelectedHandIndex(0);
    setPlayedCards([]);
    setRunningCount(0);
  }, [deckCount, includeCutCard]);

   // Start Game //
  const startGame = useCallback(() => {
    setShoe(createShoe(deckCount, includeCutCard));
    setGamePhase(GamePhases.PRE_DEAL);
  }, [deckCount, includeCutCard]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* CALCULATE & SETTLE */} //////////////////////////////////////////////////////////////////////

  // Calculate Results //
  const calculateResults = useCallback(() => {
    let creditsToAdd = 0;
    handsRef.current.forEach((hand) => { creditsToAdd += hand.payout || 0; });
    if (creditsToAdd > 0) { updateCredits(playerRef.current.credits + creditsToAdd); }
    setGamePhase(GamePhases.POST_ROUND);
    setTimeout(() => {}, 1000);
  }, [updateCredits]);

  // Settle //
  const settle = useCallback(() => {
    const settledHands = gameEngine.settleHands(handsRef.current, dealerRef.current);
    setHands(settledHands);
    setGamePhase(GamePhases.RESULTS);
    setTimeout(() => { calculateResults(); }, 1000);
  }, [calculateResults]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* DEALER ACTIONS */} //////////////////////////////////////////////////////////////////////////

  const playDealerStep = useCallback(
    (currentDealer, currentShoe, playerAllBust) => {
      setDealer(currentDealer);
      setShoe(currentShoe);
      if (currentDealer.status === HandStatus.PLAYING) {
        const { dealer: newDealer, shoe: newShoe } = gameEngine.dealerPlay(currentDealer, currentShoe, playerAllBust, setCutCardFound, resetShoe);
        setTimeout(() => { playDealerStep(newDealer, newShoe, playerAllBust); }, 1000);
      } else {
        setGamePhase(GamePhases.SETTLING_HANDS);
        setTimeout(() => { settle(); }, 1000);
      }
    },
    [settle, resetShoe]
  );

  const dealerTurn = useCallback(() => {
    const d = { ...dealerRef.current };
    d.dealerDisplayTotal = d.total;
    d.cards = d.cards.map((c) => ({ ...c, faceDown: false }));
    setDealer(d);
    if (d.status !== HandStatus.DONE) {
      d.status = HandStatus.PLAYING;
      const playerAllBust = handsRef.current.every((h) => h.isBusted === true);
      setTimeout(() => { playDealerStep(d, shoeRef.current, playerAllBust); }, 1000);
    } else {
      setGamePhase(GamePhases.SETTLING_HANDS);
      setTimeout(() => { settle(); }, 1000);
    }
  }, [playDealerStep, settle]);

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* DEAL */} ////////////////////////////////////////////////////////////////////////////////////

  // Deal //
  const deal = useCallback(
    (bet) => {
      updateCredits(player.credits);
      const result = gameEngine.dealRound(shoe, bet, setCutCardFound, resetShoe);
      setHands(result.hands);
      setDealer(result.dealer);
      setShoe(result.shoe);

      if (result.hands[selectedHandIndex] && result.hands[selectedHandIndex].status === HandStatus.DONE) {
        setGamePhase(GamePhases.DEALER_TURN);
        setTimeout(() => { dealerTurn(); }, 1000);
        return;
      }
      setGamePhase(GamePhases.PLAYER_TURN);
    },
    [shoe, selectedHandIndex, player, updateCredits, dealerTurn, resetShoe]
  );

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* HELPERS */} /////////////////////////////////////////////////////////////////////////////////

  // Move to next hand or dealer phase //
  const nextHandOrDealer = useCallback(
    (handIdx) => {
      for (let idx = handIdx + 1; idx <= hands.length - 1; idx++) {
        if (hands[idx].status !== HandStatus.DONE) {
          setSelectedHandIndex(idx);
          return;
        }
      }
      setSelectedHandIndex(0); 
      setGamePhase(GamePhases.DEALER_TURN); 
      setTimeout(() => { dealerTurn(); }, 1000);
    },
    [hands, dealerTurn]
  );

  /////////////////////////////////////////////////////////////////////////////////////////////////

  {/* PLAYER ACTIONS */} //////////////////////////////////////////////////////////////////////////

  // Hit //
  const hit = useCallback(
    (handIdx) => {
      const { hand, shoe: newShoe } = gameEngine.playerHit(hands[handIdx], shoe, setCutCardFound, resetShoe);
      const newHands = hands.map((h, idx) => (idx === handIdx ? hand : h));
      setHands(newHands);
      setShoe(newShoe);
      if (hand.status === HandStatus.DONE) {
        nextHandOrDealer(handIdx);
      }
    },
    [hands, shoe, nextHandOrDealer, resetShoe]
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
      if (!player || player.credits < hand.bet) { return; }
      const { hand: newHand, shoe: newShoe } = gameEngine.playerDouble(hand, shoe, setCutCardFound, resetShoe);
      const newHands = hands.map((h, idx) => (idx === handIdx ? newHand : h));
      setHands(newHands);
      setShoe(newShoe);
      setBetCircle(newHands.reduce((sum, h) => sum + h.bet, 0));
      updateCredits(player.credits - hand.bet); 
      nextHandOrDealer(handIdx);
    },
    [hands, shoe, nextHandOrDealer, player, updateCredits, resetShoe]
  );

  // Split //
  const split = useCallback(
    (handIdx) => {
      const hand = hands[handIdx];
      if (!player || player.credits < hand.bet) { return; }
      const { newHandsArray: newHandsArr, shoe: newShoe } = gameEngine.playerSplit(hand, shoe, setCutCardFound, resetShoe);
      const newHands = [
        ...hands.slice(0, handIdx),
        ...newHandsArr,
        ...hands.slice(handIdx + 1),
      ];
      setHands(newHands);
      setShoe(newShoe);
      setBetCircle(newHands.reduce((sum, h) => sum + h.bet, 0));
      updateCredits(player.credits - hand.bet); 
      if (newHands[handIdx].status === HandStatus.DONE) {
        nextHandOrDealer(handIdx);
      }
    },
    [hands, shoe, player, updateCredits, resetShoe, nextHandOrDealer]
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
      includeCutCard,
      cutCardFound,
      updateCredits,
      deal,
      hit,
      stay,
      double,
      split,
      resetShoe,
      endRound,
      resetGame,
      startGame,
      refundLocal,
      setDeckCount,
      setGamePhase,
      setBetCircle,
      setCutCardFound,
      setIncludeCutCard,
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
      includeCutCard,
      cutCardFound,
      updateCredits,
      deal,
      hit,
      stay,
      double,
      split,
      resetShoe,
      endRound,
      resetGame,
      startGame,
      refundLocal,
      setDeckCount,
      setGamePhase,
      setBetCircle,
      setCutCardFound,
      setIncludeCutCard,
    ]
  );

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}