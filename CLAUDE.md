# blackjack

Blackjack front end (React + Vite) for desktop and mobile; talks to the blackJackAPI repo for player/credits. Vault project: `01-Projects/Blackjack`

## Commands
- Install: `npm ci`
- Run locally: `npm run dev` -> <http://localhost:5173> (API: run blackJackAPI, `https://localhost:7248`)
- Test: `npm test -- --run`
- Coverage: `npm run coverage` (v8, report in `coverage/`; `src/main.jsx` and tests excluded)
- Lint: `npm run lint`
- Build: `npm run build` (output `dist/`)

## Architecture
- Stack: React 19, react-router-dom 7, framer-motion, Vite 7, vitest 3 (+ @vitest/coverage-v8, jsdom), ESLint 9. Node 22+.
- `src/pages/` Home, Login, Game, Settings. `src/components/` one folder per UI piece.
- `src/context/` + `src/providers/` GameContext/PlayerContext; `src/hooks/` useGame, usePlayer.
- Game rules are pure functions in `src/utils/`: `blackjackLogic.js` (hand evaluation), `gameEngine.js`
  (deal, hit, settle), `cards.js` (shoe), `playerEngine.js`. Constants in `src/utils/constants/`.
- API client: `src/utils/api.js` (`apiPost/Put/Delete`), base URL from `VITE_API_URL`.
  `.env.development` -> `https://localhost:7248/api`; `.env.production` -> the Azure App Service
  `blackjack-api-blake`. Vite also proxies `/api` to `localhost:5166`.
- Hosting: Azure Static Web App `blackjack-frontend`, deployed by GitHub Actions on push to `main`.

## Conventions
- Rules logic stays in `src/utils/` (no React); components only render and dispatch.
- Tests live in `src/utils/_tests_/`, named `<module>.test.js`; whole-round rule scenarios live in
  `rules.test.js`, using the `stackedShoe.js` helper (`stackedShoe`, `playRound`).
- Branches: `feature/<issue>-<slug>`, `fix/<slug>`, `chore/<slug>`. Default branch `main`.

## Gotchas
- Dealer hole-card rules (`DealerHoleOptions`): US draws early (with or without a peek); EU draws after
  the player acts; "NoDraw21" EU skips the hole card when the player has blackjack. Test each mode.
- `getInitialPlayerHandEvaluation` third arg (`blackjackPaysNow`) is true for US peek and EU NoDraw21:
  the modes where no dealer blackjack can still appear. US no peek hides a dealer blackjack until
  `revealDealerHole`, and it then wins every bet, doubles and splits included.
- Rule changes start as a scenario in `src/utils/_tests_/rules.test.js` (`playRound` + `stackedShoe`).
- Ace = 1 or 11; natural blackjack is not the same as 21; push, bust, split (including a blackjack
  after split, which must not skip the next hand) and double must all settle correctly.
- `.env*` files are tracked but hold only public URLs; never put secrets there.

## Do not
- Commit secrets; edit `dist/`; change the API contract here without changing blackJackAPI.
