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
  components/          # React UI components
  context/             # React context providers
  hooks/               # Custom React hooks
  pages/               # App pages (Game, Home, Login, Settings)
  providers/           # Context provider implementations
  utils/               # Game logic, card logic, API helpers
    _tests_/           # Test files for logic and scenarios
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
