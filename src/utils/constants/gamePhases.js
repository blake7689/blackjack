export const GamePhases = {
  NONE: "none",
  PRE_DEAL: "preDeal",
  DEALING: "dealing",
  OFFERS: "offers", // insurance, even money or early surrender, before the dealer peeks
  PEEK: "peek", // the dealer looks at the hole card after the offers
  PLAYER_TURN: "playerTurn",
  DEALER_TURN: "dealerTurn",
  SETTLING_HANDS: "settlingHands",
  RESULTS: "results",
  POST_ROUND: "postRound",
  END_ROUND: "endRound",
};