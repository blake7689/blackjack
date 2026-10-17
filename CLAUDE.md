# blackjack

Blackjack front end (React + Vite) for desktop and mobile; talks to the blackJackAPI repo for player/credits. Vault project: `01-Projects/Blackjack`

## Commands
- Install: `npm ci`
- Run locally: `npm run dev` -> <http://localhost:5173> (API: run blackJackAPI, `https://localhost:7248`)
- Test: `npm test -- --run`
- Coverage: `npm run coverage` (v8, report in `coverage/`; `src/main.jsx` and tests excluded). CI runs this
  and fails below 100% lines, branches, functions or statements: every change ships its tests.
- Lint: `npm run lint`
- Build: `npm run build` (output `dist/`)

## Architecture
- Stack: React 19, react-router-dom 7, framer-motion, Vite 7, vitest 3 (+ @vitest/coverage-v8, jsdom), ESLint 9. Node 22+.
- `src/pages/` Home, Login, Game, Settings. `src/components/` one folder per UI piece.
- Round state: `src/utils/gameReducer.js` (pure reducer; `nextAutoAction` names the next automatic step).
  `GameProvider` = `useReducer` + one timer effect (cleanup cancels it on reset or unmount) + a credit-event
  effect that applies each balance change once. Two contexts: `useGameState()` and `useGameActions()`
  (stable; components that only act, like Header, use just this).
- `PlayerProvider` keeps the latest player in a ref; `adjustCredits(delta, persist)` and `getCredits()`
  never read a stale balance.
- Game rules are pure functions in `src/utils/`: `blackjackLogic.js` (hand evaluation), `gameEngine.js`
  (deal, hit, settle), `cards.js` (shoe), `playerEngine.js`, `validation.js`. Constants in `src/utils/constants/`.
- API client: `src/utils/api.js` (`apiPost/Put/Delete`), base URL from `VITE_API_URL`.
  `.env.development` -> `https://localhost:7248/api`; `.env.production` -> the Azure App Service
  `blackjack-api-blake`. Vite also proxies `/api` to `localhost:5166`.
- Hosting: Azure Static Web App `blackjack-frontend`, deployed by GitHub Actions on push to `main`.

## Conventions
- Rules logic stays in `src/utils/` (no React); components only render and dispatch.
- Tests live in `src/utils/_tests_/`, named `<module>.test.js`; whole-round rule scenarios live in
  `rules.test.js`, using the `stackedShoe.js` helper (`stackedShoe`, `playRound`, driven through the reducer).
  Component, page and provider tests (Testing Library, jsdom) live in `src/_tests_/`; `renderUI` in
  `testUtils.jsx` renders with fake player/game contexts and a router.
- Never mutate state in the reducer: engine draws run on a copy of the shoe (StrictMode calls reducers twice).
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
