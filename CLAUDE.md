# blackjack

Blackjack front end (React + Vite) for desktop and mobile; talks to the blackJackAPI repo for player/credits. Vault project: `01-Projects/Blackjack`

## Commands
- Install: `npm ci`
- Run locally: `npm run dev` -> <http://localhost:5173> (API: run blackJackAPI, `https://localhost:7248`)
- Test: `npm test -- --run`
- Coverage: `npm run coverage` (v8, report in `coverage/`; `src/main.jsx` and tests excluded). CI runs this
  and fails below 100% lines, branches, functions or statements: every change ships its tests.
- Lint: `npm run lint` (`.claude/**`, where app-made worktrees live, is ignored by lint and by the tests)
- Build: `npm run build` (output `dist/`)
- E2E (#93): `npm run e2e` builds with `.env.e2e` (fake API origin) and runs the Playwright smoke tests in `e2e/` against it, API stubbed;
  `npm run e2e:ui` for the UI runner, `--headed` to watch (keep the window focused: animation timing needs it). First run: `npx playwright install chromium`;
  if that browser will not start, `E2E_CHANNEL=chrome npm run e2e` uses the installed Chrome. CI has an `e2e` job in `ci.yml` that gates the deploy.

## Architecture
- Stack: React 19, react-router-dom 7, framer-motion, Vite 7, vitest 3 (+ @vitest/coverage-v8, jsdom), ESLint 9. Node 22+.
- `src/pages/` Home, Login, Game, Settings. `src/components/` one folder per UI piece.
- Settings has Player / Game / Dev tabs (`?tab=`; "Back to game" carries it so the header's Settings reopens it).
  A new game setting goes in `GAME_SETTINGS` (`tab: "dev"` for developer options; Game otherwise).
- Saved settings (#36): `GameProvider` loads `GET /api/player/me/settings` on sign-in and applies it with one
  `LOAD_SETTINGS` (cleaned by `sanitizeSettings`: unknown keys dropped, wrong types and unknown dealer modes fall
  back to defaults, numbers clamped to `SETTING_RANGES`, `maxSplitHands` 0 kept). `changeSettings` saves the whole
  `{ v: 2, ...settings }` object when signed in and returns the save promise. A new setting needs only a default
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
  `blackjackPaysImmediately`. Test each mode with each toggle. Five rule presets (#91: Vegas, Atlantic City,
  Europe, Australia, Singapore) live in `utils/rulePresets.js` and the rule controls' text in `utils/ruleCatalog.js`; the default settings
  equal Vegas. `playRound` starts from `LEGACY_RULES` (the pre-#91 rules: S17, 2 decks, no split limit, a dealer blackjack takes all, no surrender) and
  the bare mode (pays-immediately off); a scenario for a new rule sets it in `rules`. `surrender` (none / late / early / earlyNoAce) is a preset
  key: Vegas and Atlantic City `late`, Europe and Australia `none`, Singapore `earlyNoAce`.
- `getInitialPlayerHandEvaluation` third arg (`blackjackPaysNow`) is true for US peek, `blackjackPaysImmediately`,
  or EU with `dealerDrawsOnPlayerBlackjack` off. US no peek hides a dealer blackjack until
  `revealDealerHole`, and it then wins every bet, doubles and splits included.
- Dealing (#6): `DEAL` sets `DEALING`; the auto step `DEAL_DONE` (one Rate of Play later) moves on to `PLAYER_TURN` or `DEALER_TURN`.
  Totals, labels and the count are hidden (`visibility`, so no layout shift) and the centre says "Dealing..." meanwhile. Tests step `DEAL_DONE`
  after `DEAL` (`playRound` does). The engine puts animation hints on card copies (`dealOrder`, `revealed`, `moved`), never in place.
- Rule changes start as a scenario in `src/utils/_tests_/rules.test.js` (`playRound` + `stackedShoe`).
- Ace = 1 or 11; natural blackjack is not the same as 21; push, bust, split (including a blackjack
  after split, which must not skip the next hand) and double must all settle correctly.
- Splits: `canSplit(hand, handCount, maxSplitHands, resplitAces)`; `maxSplitHands` (2-4, or 0 = unlimited; default 4) caps the
  hands in a round and each split takes one more stake. Split aces get one card and stand unless `hitSplitAces`; with `resplitAces`
  a hand of A,A stays PLAYING (Stay or Split, no Hit). In SPLIT every ace-split hand that can no longer split is set DONE before
  `advance()` (or the turn can stay on a finished hand). `canDouble` (hard 9-11 / 10-11 means no ace counted as 11; never on split
  aces; DAS) also gates TRIPLE.
- Surrender (#91): `canSurrender` (pure; first two cards, never split or doubled; `earlyNoAce` never vs an ace) and `engine.playerSurrender`.
  Every surrender sets `surrendered: true`: at once (`result` SURRENDER) or, for `late` with no peek against an ace or ten, waiting (`result`
  NONE, DONE) until `settleHand` decides (dealer blackjack = LOSE 0, else SURRENDER, payout `bet / 2`). A surrendered round has one hand. The
  dealer takes its second card after any surrender and stops at two (`dealerShowsSecondCard`, `dealerOnlyChecksBlackjack`, `dealerNeedsToPlay`
  read the flag). In US peek `early` and `earlyNoAce` work like `late` until the offers step (PR 3); PR 3 must remove that sentence from the
  catalogue hints.
- Saved settings carry `v` (3 since #91 surrender). A missing or invalid rule key gets its `LEGACY_RULES` value when the saved `v` is
  older than `RULE_SINCE[key]` (default 2): `v: 1` gets all of them, `v: 1` and `v: 2` get `surrender: "none"`; `{}`, no `v` and `v: 3`
  get the Vegas defaults. A PR that adds a rule key adds its `LEGACY_RULES` and `RULE_SINCE` entries and bumps `SETTINGS_VERSION`.
- Original-bet-only (`noHoleCardLoss: "original"`): every hand has `baseStake` (the first bet; 0 on a split-off hand). A dealer
  blackjack gives back `bet - baseStake` of a hand that did not bust (a busted hand is never refunded), paid in the one round
  `settle`. The rounded blackjack payout (6:5 pays 2.2x) and the round sum are rounded to the cent (`cents`).
- Triple down (#21): settings `tripleDown` and `tripleDrawsOnBust` (both off, not in `RESET_SETTINGS` or the presets). In
  `playerAction` the `TRIPLE` branch must return before the SPLIT code (anything not DOUBLE falls through to it) and needs
  `credits >= bet * 2`; the one ledger `bet` is `hand.bet * 2`.
- Face-down double (#66): setting `doubleFaceDown` (off, not in `RESET_SETTINGS` or the presets). The double's card goes in
  `hand.hiddenCards`, not `hand.cards`; `total`, `isBusted` and `result` stay as before the double until the auto step
  `REVEAL_HIDDEN` (all hands at once, then `SETTLE`). Code that reads `hand.cards`, `isBusted` or `result` during a round must
  allow for `hiddenCards`, and a hidden card's id, rank or suit must never reach the DOM.
- Request timeouts (#75): `api.js` aborts a request after 10 s by default, which is right for the ledger (an unknown
  outcome retries with the same `requestId`). Sign-in, sign-up and the session-restore `getMe` pass `COLD_START_TIMEOUT_MS`
  (90 s) so a cold Azure API start (~30 s) is waited out; never give them the 10 s default, or Login's "waking up"
  messages are never reached and a restore silently logs the player out. Any new call made before the API is warm needs it too.
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
- PR bodies: any `close`/`fix`/`resolve` word followed by `#N` anywhere in the body, even in prose, closes that issue on merge (#93 closed early this way).
  Write `Closes #N` once, only on the PR that finishes the issue, `Part of #N` otherwise, and never put those words next to a `#N` when naming other PRs.
- `ci.yml` is also the SWA deploy's test gate (`uses:` via `workflow_call`, deploy `needs: test`); keep that trigger.
- Game actions such as `changeSetting` return a promise: in tests write `act(() => { action(); })` (braces), or
  `act` turns async and the assertions run before the update.
- Card animations (#6): the table shows cards only through `FlyCard`. A new card flies face down from `.deck-stack` (a copy in
  `.flight-layer`) and flips as it lands; the dealer's hole card and a face-down double stay one element (keys `hole` / `dbl`,
  hidden and shown cards in one list), so they flip in place. Never key them by card id or split them into two lists (a remount
  flies again). Hints (`dealOrder`, `revealed`, `moved`) sit on card copies, never in place; a hidden back gets `dealOrder` by prop
  (3 for the hole) and has no card object, so nothing hidden reaches the DOM. `DEAL` goes through `DEALING`. Hands are keyed by `tag`.
- Anything that flies or flips reserves its time in the `queue` of `utils/cardAnimation.js`; automatic steps wait `stepWait(T)`;
  totals count only landed cards (`useLanded`). A card object is a new copy on every reducer step, so effects depend on `card.id`,
  never on `card` (a changed dependency cancels the flip in progress). jsdom has no `Element.animate`: `setup.js` stubs it.

- E2E tests (#93, ADR-0004): they stub the API with `page.route` (`e2e/fixtures.js`) and seed `Math.random`, so the dealt cards repeat. Never add
  real waits (`page.waitForTimeout` is a lint error): wait on conditions, and keep deliberate delays in the route handlers. If the page's use of
  `Math.random` changes (new shoe builds, router keys), the seed in the deal test needs re-picking; its card assertions fail first. A bug that
  slips past the jsdom tests (timers, layout, animation, network) gets an e2e test. The tests rely on the `.flight-layer`, `.fly-inner`,
  `.options-wrap` and `.board.busy` hooks: rename one and the test changes with it.
- Hidden top-up (#90): 7 taps in 3 s on the balance open a code prompt. The call goes through `enqueue` with one `requestId` per submit; a 429
  (lockout, `Retry-After`) is a definite refusal, never retried. Keep `tapEnabled` in GameBoard (signed in, balance under 100, PRE_DEAL, no chips in
  the circle, nothing pending): the API counts a correct code refused by a guard as a wrong entry toward the per-player lockout (5 wrong, then 10 min).
  Nothing about the feature may be in the DOM before the 7 taps (no role/tabindex/aria on the balance, prompt not rendered). Every refusal shows one
  generic message. The real code is never in the repo, bundle, tests, logs or PR (tests use a dummy).
- Auto deal (#88): settings `autoDeal` and `autoDealDelay` (0-10000 ms, default 3000; not in `RESET_SETTINGS` or the presets); `autoDealOn(state)` needs `autoDeal`,
  `resetInitialBet` and `!autoDealPaused`, and `sanitizeSettings` turns a saved `autoDeal` off without `resetInitialBet`. Two reducer fields: `autoDealPaused`
  (sticky: Pause button, or an unaffordable rebet, which also sets the notice after `emptyRound`; cleared by Resume, START_GAME/RESET_GAME and enabling `autoDeal`)
  and `autoDealPending` (armed by END_ROUND when a rebet was placed; cleared by ADD_BET, CLEAR_BET, DEAL, any table reset, Pause, and leaving `/game`).
  `nextAutoAction` gives CONTINUE (POST_ROUND) and DEAL (PRE_DEAL, pending) on the one existing timer; DEAL waits `stepWait(autoDealDelay)`, so delay 0 means right
  after the CONTINUE and END_ROUND steps. GameProvider nulls those two steps while `pathname !== "/game"` (no Resume needed on return) and dispatches
  `CANCEL_AUTO_DEAL` (pending only, not a pause). Timer dispatches carry `auto: true`; an `auto` DEAL with nothing pending is ignored. The Pause/Resume button
  shows only between rounds (PRE_DEAL, POST_ROUND, END_ROUND; removed from the DOM otherwise) while auto deal is enabled, even if nothing is armed (enable it with a rebet on the table and nothing deals until a manual Deal); it stops click
  propagation because `.board` treats a click as CONTINUE. There is no Undo action, only ADD_BET and CLEAR_BET.

## Do not
- Commit secrets; edit `dist/`; change the API contract here without changing blackJackAPI.
