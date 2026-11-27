# Blackjack React Game

A modern, feature-rich blackjack game built with React and Vite. Includes realistic blackjack rules, card counting, betting, split/double, and persistent credits. Designed for desktop and mobile play.

## Features
- Full blackjack rules: dealer hits soft 17 by default (Vegas preset; configurable in Settings), natural blackjack, push, bust, split, double, insurance, etc.
- Card counting display (Hi-Lo system) with true count calculation
- Multiple hands, split and double down support
- Dealer card reveal animation
- Persistent credits (local and server sync)
- Responsive UI and modern design
- Settings page for deck count and player profile
- Comprehensive test suite for game logic and edge cases

## Getting Started

### Prerequisites
- Node.js 22+
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
public/        # Static assets (cards, fonts, icons, sounds)
src/
  _tests_/     # Component, page and provider tests
  components/  # React UI components, one folder each
  context/     # React contexts
  hooks/       # Custom React hooks
  pages/       # Home, Login, Game, Settings
  providers/   # Game and player providers
  utils/       # Game rules, state reducer, API client (tests in utils/_tests_/)
e2e/           # Playwright tests
scripts/       # CI scripts and their tests
```

## Key Files
- `src/components/GameBoard/GameBoard.jsx` - Main game UI
- `src/providers/GameProvider.jsx` - Central game state and logic
- `src/utils/gameEngine.js` - Core blackjack logic and rules
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

Deployed with Azure at: https://blakejack.win/