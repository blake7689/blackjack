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
- Settings has Player / Game / Dev tabs (`?tab=`; "Back to game" carries it so the header's Settings reopens it).
  A new game setting goes in `GAME_SETTINGS` (`tab: "dev"` for developer options; Game otherwise).
- Saved settings (#36): `GameProvider` loads `GET /api/player/me/settings` on sign-in and applies it with one
  `LOAD_SETTINGS` (cleaned by `sanitizeSettings`: unknown keys dropped, wrong types and unknown dealer modes fall
  back to defaults, numbers clamped to `SETTING_RANGES`, `maxSplitHands` 0 kept). `changeSettings` saves the whole
  `{ v: 1, ...settings }` object when signed in and returns the save promise. A new setting needs only a default
  in `initialGameState.settings` (and a range if it is a number).
- Round state: `src/utils/gameReducer.js` (pure reducer; `nextAutoAction` names the next automatic step).
  `GameProvider` = `useReducer` + one timer effect (cleanup cancels it on reset or unmount) + a credit-event
  effect that applies each balance change once. Two contexts: `useGameState()` and `useGameActions()`
  (stable; components that only act, like Header, use just this).
- Sign-in (ADR-0002): `api.js` sends the bearer token from `sessionStorage` (`bj.token`); a 401 on a
  signed-in request clears it and signs out. `PlayerProvider` restores the session on load via
  `GET /api/player/me`.
- Credits (ADR-0003): the reducer emits `local` / `bet` / `settle` credit events; `PlayerProvider.applyCreditEvent`
  sends ledger calls one at a time and shows server balance + chips still on the table + optimistic
  changes awaiting an answer. Any ledger error reloads the balance from `/me`. `getCredits()` never reads
  a stale balance.
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
  the player acts. Rule toggles in `settings` (#35 A1-A4): `dealerDrawsOnceOn21` (EU), `dealerDrawsOnPlayerBlackjack`
  (EU; off = no second card, so the blackjack pays at once), `dealerDrawsOnPlayerBust` (second card only),
  `blackjackPaysImmediately`. Test each mode with each toggle. Rule presets (A5) live in `utils/rulePresets.js`;
  the default settings equal the US preset, and `playRound` starts from the bare mode (pays-immediately off).
- `getInitialPlayerHandEvaluation` third arg (`blackjackPaysNow`) is true for US peek, `blackjackPaysImmediately`,
  or EU with `dealerDrawsOnPlayerBlackjack` off. US no peek hides a dealer blackjack until
  `revealDealerHole`, and it then wins every bet, doubles and splits included.
- Rule changes start as a scenario in `src/utils/_tests_/rules.test.js` (`playRound` + `stackedShoe`).
- Ace = 1 or 11; natural blackjack is not the same as 21; push, bust, split (including a blackjack
  after split, which must not skip the next hand) and double must all settle correctly.
- Splits: `canSplit(hand, handCount, maxSplitHands)`; `maxSplitHands` (2-4, or 0 = unlimited, the default) caps the
  hands in a round, each split takes one more stake, and split aces never resplit.
- Triple down (#21): settings `tripleDown` and `tripleDrawsOnBust` (both off, not in `RESET_SETTINGS` or the presets). In
  `playerAction` the `TRIPLE` branch must return before the SPLIT code (anything not DOUBLE falls through to it) and needs
  `credits >= bet * 2`; the one ledger `bet` is `hand.bet * 2`.
- Face-down double (#66): setting `doubleFaceDown` (off, not in `RESET_SETTINGS` or the presets). The double's card goes in
  `hand.hiddenCards`, not `hand.cards`; `total`, `isBusted` and `result` stay as before the double until the auto step
  `REVEAL_HIDDEN` (all hands at once, then `SETTLE`). Code that reads `hand.cards`, `isBusted` or `result` during a round must
  allow for `hiddenCards`, and a hidden card's id, rank or suit must never reach the DOM.
- Ledger retries (BlackJackAPI#23): every `bet`/`settle` call carries a `requestId` made once per credit event in
  `applyCreditEvent` and reused on every retry (`utils/ledgerCall.js`). An unknown outcome (network, 10 s timeout, 5xx) is
  never treated as refused: it retries with the same id and shows "Reconnecting...". Only 400/422/other 4xx or a 409 still
  clashing after 4 retries is a refusal, and it dispatches `BET_REJECTED`.
- Bets sit in `pendingBets` until answered and settling waits for them (`nextAutoAction` is null in `SETTLING_HANDS`). Find a
  hand by its `tag`, never by index, when an answer arrives (indexes move on split). A refused opening bet voids the round;
  a refused double/triple/split bet lowers that hand's `bet`. Any new bet event needs `handTag`.
- Saved settings must be flat strings, numbers or booleans: the API rejects arrays and objects (the whole PUT fails).
  `chipValues` is a comma-separated string (`utils/chips.js` parses and formats it in chip order).
- `.env*` files are tracked but hold only public URLs; never put secrets there.
- `.github/workflows/azure-static-web-apps-*.yml` is committed with CRLF; with `core.autocrlf=true` an edit rewrites
  every line. Keep CRLF and commit it with `git -c core.autocrlf=false`.
- `ci.yml` is also the SWA deploy's test gate (`uses:` via `workflow_call`, deploy `needs: test`); keep that trigger.
- Game actions such as `changeSetting` return a promise: in tests write `act(() => { action(); })` (braces), or
  `act` turns async and the assertions run before the update.

## Do not
- Commit secrets; edit `dist/`; change the API contract here without changing blackJackAPI.
