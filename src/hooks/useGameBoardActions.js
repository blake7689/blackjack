import { useGame } from "../hooks/useGame";
import { usePlayer } from "../hooks/usePlayer";

export function useGameBoardActions() {
  const {
    hands,
    dealer,
    shoe,
    gamePhase,
    setGamePhase,
    betCircle,
    setBetCircle,
    selectedHandIndex,
    setSelectedHandIndex,
    deal,
    hit,
    stay,
    double,
    split,
    dealerTurn,
    settle,
  } = useGame();

  const { player, updateCreditsOnServer } = usePlayer();

  // Wrap deal to handle credits
  const handleDeal = () => {
    if (gamePhase !== "preDeal" || betCircle === 0 || !player) return;
    updateCreditsOnServer(player.credits);
    deal(betCircle);
  };

  return {
    player,
    hands,
    dealer,
    shoe,
    gamePhase,
    setGamePhase,
    betCircle,
    setBetCircle,
    selectedHandIndex,
    setSelectedHandIndex,
    handleDeal,
    handleHit: (idx) => hit(idx),
    handleStay: (idx) => stay(idx),
    handleDouble: (idx) => double(idx),
    handleSplit: (idx) => split(idx),
    handleDealerTurn: dealerTurn,
    handleSettle: settle,
  };
}