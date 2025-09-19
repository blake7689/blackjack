# Blackjack React Game

A modern, feature-rich blackjack game built with React and Vite. Includes realistic blackjack rules, card counting, betting, split/double, and persistent credits. Designed for desktop and mobile play.

## Features
- Full blackjack rules: dealer stands on soft 17, natural blackjack, push, bust, split, double, insurance, etc.
- Card counting display (Hi-Lo system) with true count calculation
- Multiple hands, split and double down support
- Dealer card reveal animation
- Persistent credits (local and server sync)
- Responsive UI and modern design
- Settings page for deck count and player profile
- Comprehensive test suite for game logic and edge cases

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Installation
```bash
npm install
```

### Running the App
```bash
npm run dev
```
Visit `http://localhost:5173` in your browser.

### Running Tests
```bash
npm test
```

## Project Structure
```
public/                # Static assets (cards, images)
src/
  assets/              # Static assets (SVG, images)
  components/          # React UI components
    BettingFooter/     # Betting controls and display
    Card/              # Card rendering
    CardCountDisplay/  # Card counting UI
    CenterMessage/     # Centered game messages
    DealerArea/        # Dealer's cards and actions
    DeckStack/         # Deck visualization
    GameBoard/         # Main game board UI
    Header/            # App header and navigation
    PlayerHand/        # Player's hand display
    PlayerOptions/     # Player action buttons
    StatsPanel/        # Game stats and info
  context/             # React context providers
    GameContext.jsx    # Game state context
    PlayerContext.jsx  # Player state context
  hooks/               # Custom React hooks
    useGame.js         # Game logic hook
    usePlayer.js       # Player logic hook
  pages/               # App pages (Game, Home, Login, Settings)
    Game.jsx
    Home.jsx
    Login.jsx
    Settings.jsx
  providers/           # Context provider implementations
    GameProvider.jsx
    PlayerProvider.jsx
  utils/               # Game logic, card logic, API helpers
    api.js
    blackjackLogic.js
    cards.js
    gameEngine.js
    playerEngine.js
    _tests_/           # Test files for logic and scenarios
      bettingScenarios.test.js
      blackjackLogic.test.js
      cards.test.js
      gameEngine.test.js
    constants/         # Game constants
      gamePhases.js
      handResult.js
      handStatus.js
  App.jsx              # Main React app
  App.css              # Global styles
  index.css            # Base styles
  main.jsx             # App entry point
index.html             # Main HTML file
vite.config.js         # Vite configuration
```

## Key Files
- `src/components/GameBoard/GameBoard.jsx` - Main game UI
- `src/providers/GameProvider.jsx` - Central game state and logic
- `src/utils/gameEngine.js` - Core blackjack logic and rules
- `src/components/CardCountDisplay/CardCountDisplay.jsx` - Card counting display
- `src/pages/Settings.jsx` - Settings and profile management

## Customization
- Change deck count, player profile, and credits in the Settings page
- Edit card images in `public/cards/` for custom decks
- Tweak styles in `src/components/GameBoard/GameBoard.css` and other CSS files

## Testing

Unit tests for game logic and edge cases are located in `src/utils/_tests_/`. Run all tests with:

```bash
npm test
```

Deplyed with Azure at: https://lively-sky-084c84203.2.azurestaticapps.net/