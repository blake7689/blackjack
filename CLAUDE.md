# blackjack

Blackjack front end (React + Vite) for desktop and mobile; talks to the blackJackAPI repo for player/credits. Vault project: `01-Projects/Blackjack`

## Commands
- Install: `npm ci`
- Run locally: `npm run dev` -> <http://localhost:5173> (API: run blackJackAPI, `https://localhost:7248`)
- Test: `npm test -- --run`
- Install-script retry check (#131): `scripts/install-playwright-browser.test.js` runs `scripts/install-playwright-browser.sh` through its `PW_*` env hooks (needs `bash` + `timeout`, else skipped; the lock tests (#159) also need `pgrep` + `pkill`, so they run on Linux CI; about 14 s there); `npm test` and `npm run coverage` run it, so CI does. Single run: `npx vitest run scripts`.
- Coverage: `npm run coverage` (v8, report in `coverage/`; `src/main.jsx` and tests excluded). CI runs this
  and fails below 100% lines, branches, functions or statements: every change ships its tests.
- Lint: `npm run lint` (`.claude/**`, where app-made worktrees live, is ignored by lint and by the tests)
- Build: `npm run build` (output `dist/`)
- E2E (#93): `npm run e2e` builds with `.env.e2e` (fake API origin) and runs the Playwright smoke tests in `e2e/` against it, API stubbed;
  `npm run e2e:ui` for the UI runner, `--headed` to watch (keep the window focused: animation timing needs it). First run: `npx playwright install chromium`;
  if that browser will not start, `E2E_CHANNEL=chrome npm run e2e` uses the installed Chrome. A second project, `phone` (#121), re-runs smoke + topup + split (#133) + layout (#80) + sound (#86) + screens (#87) + loop1 + loop2 (#166) + a11y + reauth (BlackJackAPI#71) at Pixel 7 size
  (`npm run e2e -- --project=phone`); the smoke test also asserts the board has no horizontal scroll. A third, `webkit` (#167), runs the same specs in WebKit at iPhone 14 size (`npm run e2e -- --project=webkit`; first run `npx playwright install webkit`). CI has an `e2e` job in `ci.yml` that gates the deploy; there webkit runs as 2 shards (#208; run one locally: `npm run e2e -- --project=webkit --shard=1/2`, or `2/2`).
  `e2e/a11y.spec.js` (#120) scans each screen with axe (`@axe-core/playwright`): serious and critical violations fail e2e; the helper is `expectNoSeriousA11y` in `e2e/a11y.js`; to waive a rule pass `{ disableRules: ['rule-id'] }` with a one-line comment giving the reason, never a blanket disable.
  `e2e/layout-sizes.spec.js` (#168, chromium project only) plays a round, a split round and the Settings sections at 7 sizes (320x568 to 1920x1080) and fails on sideways scroll, clipped or overlapping pieces, top bar / dock heights off DESIGN section 4, and tap targets under 44 px; each accepted finding is a named entry in its `WAIVERS` table with a one-line reason (a fix removes its waiver); a change to when shoes are built means re-picking its `SEEDS`.

- Live smoke (#119): `npm run e2e:live` (`playwright.live.config.js`, `e2e-live/`) signs in on the real site with a test account and plays one hand, checking bet, settle and balance; no stubs, traces/video/screenshots off. Only CI runs it: the `live_smoke` job in the SWA workflow, after each deploy to `main` (push only), with secrets `E2E_LIVE_USERNAME` / `E2E_LIVE_PASSWORD` set on that step alone. A failure is an alarm, not a rollback. It writes play-money ledger rows to production; it never uses the hidden top-up (fails with a message if the balance is too low). On demand (#170, e.g. after an API deploy): `gh workflow run live-smoke.yml` then `gh run watch` (workflow `.github/workflows/live-smoke.yml`, same job; never deploys). The deploy job's `live_smoke` first runs `npm run build` and `scripts/wait-for-build.sh` (#190: SWA swaps the build in after the deploy job ends, so it polls the site until it serves the entry script of this run's deterministic build, `WAIT_TIMEOUT` 180 s), and on failure uploads the `live-smoke-snapshot` artifact (Playwright's text `error-context.md`, 7 days; it may show the balance and account name).
## Architecture
- Stack: React 19, react-router-dom 7, Vite 7, vitest 5 (+ @vitest/coverage-v8, jsdom), ESLint 9. Node 22+.
- `src/pages/` Home, Login, Game, Settings. `src/components/` one folder per UI piece.
- Settings (#84) is one page with no tabs: five accordion sections (Table rules, Gameplay, Chips, Appearance, Account), closed on arrival, one open at a time; a deep link
  opens its section (`/settings#rules`, the hash is the section id; `goSettings("rules")`). A new setting needs: a default in `initialGameState.settings` (and a range if it is a
  number), its label and hint in `APP_SETTINGS` (`ruleCatalog.js`), its control in `pages/Settings.jsx`, and its key in `PLAY_KEYS` / `LOOK_KEYS` there (an unlisted key counts as a table rule).
- Saved settings (#36): `GameProvider` loads `GET /api/player/me/settings` on sign-in and applies it with one
  `LOAD_SETTINGS` (cleaned by `sanitizeSettings`: unknown keys dropped, wrong types and unknown dealer modes fall
  back to defaults, numbers clamped to `SETTING_RANGES`, `maxSplitHands` 0 kept). `changeSettings` saves the whole
  `{ v: 2, ...settings }` object when signed in and returns the save promise. A new setting needs only a default
  in `initialGameState.settings` (and a range if it is a number).
- Round state: `src/utils/gameReducer.js` (pure reducer; `nextAutoAction` names the next automatic step).
  `GameProvider` = `useReducer` + one timer effect (cleanup cancels it on reset or unmount) + a credit-event
  effect that applies each balance change once. Two contexts: `useGameState()` and `useGameActions()`
  (stable; components that only act, like TopBar, use just this).
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
  `blackjack-api-blake`.
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
- Epic #4 (UI revamp) PRs use `--base release/ui-revamp`, never `main`, and say `Part of #4` with no closing keyword; close the child issue by hand after merge (ADR-0006).
- Sign-out (#195): every sign-out path ends in `signIn(null)`, and GameProvider then dispatches `SIGN_OUT`: a clean table with no credit event (a refund would reach the next account), built from `initialGameState`.
  A new reducer field that must survive sign-out is kept in that case (today `settings`, `creditSeq`, `shoeSeq`).
- One sign-in at a time (#204): every `signIn(player)` assumes the account only changes through a sign-out (GameProvider keys on `signedIn`), so PlayerProvider allows one login / sign-up at a time; any new sign-in path must go through the same guard (`signInOnce`).
- Late account answers (#212) are dropped by session: `updatePlayer` / `deletePlayer` resolve `false` once a sign-out happened (callers must stop), `api.js`'s 401 retry never crosses a sign-out (a 401 from the password change's own silent re-login signs nobody out; any other 401 with a token still does), and a failed or abandoned sign-in leaves no token. `deleteMe` does not clear the token; the provider does, after its session check.
- Game flow (#196): `START_GAME` acts only from phase `NONE` (Home's Play also reaches it with a round live, where it is a no-op); `RESET_GAME` restarts a table. A failed first settings load still starts the table, then
  GameProvider retries after 1, 2, 4, 8, 16, 30 s and every 30 s; a late answer is held and applied only in `NONE` / `PRE_DEAL` (never under a round), and `settingsUnloaded` is true until then (message-line notice; it never hides a verdict).
  `PlayerProvider.changePassword` runs one at a time (a ref; a second request would 401 and sign out): an ignored call resolves `false` and sends nothing; `changingPassword` dims the Settings button. A refused settle is in no `pendingBets`:
  GameProvider sends its amount as `BET_REJECTED.payout`, and above 0 it sets `payoutNotice` (not in `emptyRound`: only the next DEAL or sign-out clears it), shown in place of the verdict. The newest message wins: it clears `notice`,
  GameBoard shows `notice` first. If it is already there at SETTLE it is an earlier round's (serial queue),
  so `payoutNoticeOld` keeps it from hiding that verdict, and it returns at the next betting step.
  Loose ends (#207): when the payout notice meets a refused opening bet or an unaffordable rebet (either order; `autoDealBroke` marks the second, amounts in `refusedPayout` / `initialBet`), `notice` is one line saying both.
  While the payout is this round's, the dock summary reads "Payout refused / Not paid"; a refused settle takes back its own balance badge (`creditChange.settle`), never a newer one; and auto deal's DEAL step waits at least 4 s
  while a payout notice is up (a late refusal restarts the wait; no pause). `.msg .notice` has `line-height: 1.2`: a new notice must fit 320x568 and 568x320 with a 1,234,567.50 amount.
- Dealer hole-card rules (`DealerHoleOptions`): US draws early (with or without a peek); EU draws after
  the player acts. Rule toggles in `settings` (#35 A1-A4): `dealerDrawsOnceOn21` (EU), `dealerDrawsOnPlayerBlackjack`
  (EU; off = no second card, so the blackjack pays at once), `dealerDrawsOnPlayerBust` (second card only),
  `blackjackPaysImmediately`. Test each mode with each toggle. Five rule presets (#91: Vegas, Atlantic City,
  Europe, Australia, Singapore) live in `utils/rulePresets.js` and the rule controls' text in `utils/ruleCatalog.js`; the default settings
  equal Vegas. `playRound` starts from `LEGACY_RULES` (the pre-#91 rules: S17, 2 decks, no split limit, a dealer blackjack takes all, no surrender) and
  the bare mode (pays-immediately off); a scenario for a new rule sets it in `rules`. `surrender` (none / late / early / earlyNoAce) is a preset
  key: Vegas and Atlantic City `late`, Europe and Australia `none`, Singapore `earlyNoAce`. `insurance` (bool) is a preset key too (true in all five).
- `getInitialPlayerHandEvaluation` third arg (`blackjackPaysNow`) is true for US peek, `blackjackPaysImmediately`,
  or EU with `dealerDrawsOnPlayerBlackjack` off (`bjPaysWithoutPeek`). A deferred peek (see Offers) forces it false and `peekDealer` applies it.
  US no peek hides a dealer blackjack until `revealDealerHole`, and it then wins every bet, doubles and splits included.
- Dealing (#6): `DEAL` sets `DEALING`; the auto step `DEAL_DONE` (one Rate of Play later) moves on to `PLAYER_TURN` or `DEALER_TURN` (or `OFFERS`, see Offers).
  Totals, labels and the count are hidden (`visibility`, so no layout shift) and the centre says "Dealing..." meanwhile. Tests step `DEAL_DONE`
  after `DEAL` (`playRound` does). The engine puts animation hints on card copies (`dealOrder`, `revealed`, `moved`), never in place.
- Card ids are unique across shoes (`createShoe` adds a shoe number): the running count, `landed.ids` and React keys rely on it. Compare ids, never parse them.
- Rule changes start as a scenario in `src/utils/_tests_/rules.test.js` (`playRound` + `stackedShoe`).
- Ace = 1 or 11; natural blackjack is not the same as 21; push, bust, split (including a blackjack
  after split, which must not skip the next hand) and double must all settle correctly.
- Splits: `canSplit(hand, handCount, maxSplitHands, resplitAces)`; `maxSplitHands` (2-4, or 0 = unlimited; default 4) caps the
  hands in a round and each split takes one more stake. Split aces get one card and stand unless `hitSplitAces`; with `resplitAces`
  a hand of A,A stays PLAYING (Stay or Split, no Hit). In SPLIT every ace-split hand that can no longer split is set DONE before
  `advance()` (or the turn can stay on a finished hand). `canDouble` (hard 9-11 / 10-11 means no ace counted as 11; never on split
  aces; DAS) also gates TRIPLE.
- Split deal (#133): rule `splitDeal` (`"one"` default, `"both"` = the old behaviour; in `RESET_SETTINGS` and every preset). In `"one"` `playerSplit` gives only
  hand 1 its card; the split-off hand has `cards: [moved card]`, `awaitingCard: true`, status PLAYING, and `canAct` refuses it. When `advance()` selects it the phase stays
  `PLAYER_TURN` and `nextAutoAction` gives `DEAL_SPLIT_CARD` (`engine.dealSplitSecondCard`, then the usual advance: split aces stand). `finishDeadAces` must skip a waiting
  hand; the dealer never plays while one waits (it is not DONE). GameProvider's `autoKey` includes `selectedHandIndex` so two waiting hands in a row each get a timer.
- Surrender (#91): `canSurrender` (pure; first two cards, never split or doubled; `earlyNoAce` never vs an ace) and `engine.playerSurrender`.
  Every surrender sets `surrendered: true`: at once (`result` SURRENDER) or, for `late` with no peek against an ace or ten, waiting (`result`
  NONE, DONE) until `settleHand` decides (dealer blackjack = LOSE 0, else SURRENDER, payout `bet / 2`). A surrendered round has one hand. The
  dealer takes its second card after any surrender and stops at two (`dealerShowsSecondCard`, `dealerOnlyChecksBlackjack`, `dealerNeedsToPlay`
  read the flag). In a peek game `early` / `earlyNoAce` against an ace or ten are offered at `OFFERS` only (`earlyOffer`), never again on the
  turn (`canSurrender` excludes them); no-peek and EU keep early surrender on the turn (the player acts before any peek anyway).
- Offers (#91): `offersAtDeal` (pure) says what is offered at the deal: insurance (setting on, ace up, half the bet, only if affordable), even
  money (player blackjack vs an ace, not when the settings already pay the blackjack at once) and early surrender (peek game, ace or ten up,
  non-blackjack hand). Nothing offered = `state.offers` is `null`, no `OFFERS`/`PEEK` phase, and `dealRound` runs exactly as before:
  never add a step to a round that offers nothing. With an offer in a peek game the peek is
  deferred: `dealRound` shows one dealer card and leaves the hole card in `dealerHoleCards`, then `OFFERS` waits for the player (no timer: auto
  deal waits there and never declines), then the auto step `PEEK` (`engine.peekDealer`) does what `dealRound` would have done at the deal,
  skipping even-money and surrendered hands. Each offer closes alone (`closeOffer`); `DECLINE_OFFERS` closes the rest. Insurance is
  `hand.insurance` (the stake; zeroed on a split-off hand), a ledger `bet` with `newRound: false` and the reducer-only tag `side: "insurance"`
  (the API has no such field; a refused one voids only the insurance, in `BET_REJECTED`). `settleHand` pays it 3x its stake when the dealer has
  blackjack, inside the hand's `payout`, so the round still settles once. Even money is `evenMoney: true` (WIN, 2x). `dealerShowsSecondCard`
  reads `insurance`; `dealerOnlyChecksBlackjack` must not (a live insured hand still needs the dealer's total). `playRound` takes `offers`.
- Rules section (#91, #84): the Settings Table rules section is `components/RulesSection` (preset dropdown with each preset's house edge, flat groups Shoe, Dealer, Payouts,
  Doubling, Splitting, Surrender, House variations, Advanced). It is part of Settings' one draft: `onApply(patch)` writes the draft, and Save sends only the keys that changed
  (a key GameProvider sees in a patch with a `RESET_SETTINGS` name deals a new shoe even when unchanged, so an unchanged draft saves nothing); a changed `RESET_SETTINGS` key asks
  "Start a new shoe?" at Save only mid-round, before the profile PUT. The profile PUT runs first and never blocks the settings (an invalid name stays dirty with its error).
  A dirty draft is guarded without `useBlocker` (it cannot work with `<BrowserRouter>`): Settings sets `leaveGuard.ask` (`utils/leaveGuard.js`), `useNavActions` (Home, Settings,
  Log out) and the Table button ask "Discard your changes?" first, and `beforeunload` covers a page unload. All rule wording (labels, short hints, groups, summaries, the app
  toggles' labels, `APP_SETTINGS` for the rest) lives in `ruleCatalog.js` only. Its `showWhen` is the ONE hidden-in-this-mode list (EU-only toggles in the US modes, "Blackjack pays
  immediately" and "If the dealer has blackjack" under a peek, "Resplit aces" with two hands): `visibleIn`, `togglesIn` and `rulePresetOf` (which imports the catalog, never the
  reverse) read it, so a preset never reads Custom over a rule that does nothing; the rules sheet (`sheetGroups`, #87) reads it too. "Dealer's second card" is one 3-way choice (Peeks / No
  peek / No second card) writing `dealerHoleBehaviour`; `patch(value, settings)` moves `blackjackPaysImmediately` to the new mode's preset pairing (true with a peek) only while it
  still holds the current mode's pairing. Options are `role="radio"` + `aria-checked`, switches are real labels around `role="switch"` checkboxes, every control is
  `aria-describedby` its hint (the "i" is aria-hidden), pickers use `button[data-felt]`, `data-pick-accent`, `data-pick-mode`, rule options `[data-rule]`, presets `[data-preset]`.
  `utils/houseEdge.js` is an additive estimate (baseline 0.4469 + Wizard of Odds rule effects; sources, calculator comparison and the UNVERIFIED figures are in its header comment);
  insurance, House variations and Advanced are not counted; `noHoleCardLoss` counts only without a peek (`"all"` +0.11, `"original"` +0.01). A change to a rule effect needs its source.
- Saved settings carry `v` (5 since #133 splitDeal). A missing or invalid rule key gets its `LEGACY_RULES` value when the saved `v` is
  older than `RULE_SINCE[key]` (default 2): `v: 1` gets all of them, `v: 1` and `v: 2` get `surrender: "none"`, `v: 1` to `v: 3` get
  `insurance: false`, `v: 1` to `v: 4` get `splitDeal: "both"`; `{}`, no `v` and `v: 5` get the Vegas defaults. A PR that adds a rule key adds its `LEGACY_RULES` and `RULE_SINCE` entries and bumps `SETTINGS_VERSION`.
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
- CI hardening (#198, guarded by `scripts/workflows.test.js`): every action is pinned to a commit SHA with a version comment (Dependabot updates them). The SWA workflow's concurrency group is at workflow level: `main` runs go one at a time, Dependabot (#223) runs monthly and ignores major version updates in both ecosystems (security updates are not blocked), so check for majors by hand; `@vitejs/plugin-react` 6 needs Vite 8.
  and a newer run on a PR (the close run included) cancels its preview run; never give `ci.yml` that group (a called workflow would deadlock). Deploy and close skip Dependabot PRs (no secrets). Re-running an old run can deploy an old commit or re-create a closed preview.
- Game actions such as `changeSetting` return a promise: in tests write `act(() => { action(); })` (braces), or
  `act` turns async and the assertions run before the update.
- Card animations (#6): the table shows cards only through `FlyCard`. A new card flies face down from `.deck-stack` (a copy in
  `.flight-layer`) and flips as it lands; the dealer's hole card and a face-down double stay one element (keys `hole` / `dbl`,
  hidden and shown cards in one list), so they flip in place. Never key them by card id or split them into two lists (a remount
  flies again). Hints (`dealOrder`, `revealed`, `moved`) sit on card copies, never in place; a hidden back gets `dealOrder` by prop
  (3 for the hole) and has no card object, so nothing hidden reaches the DOM. `DEAL` goes through `DEALING`. Hands are keyed by `tag`.
- Table art (#81): the table's top bar is `components/TopBar` (menu, `#bal` balance, count, Settings; its Count shows only landed cards), laid out with `useCardWidth`, `useDealerRoom`, `useCentrePrint`
  and `useSeatsScroll` on `.stage-in`. Signed-in start: `GameProvider` starts the table itself (`START_GAME`, one shoe) once per sign-in or restore, after the settings load (a failed load starts with the settings
  it has), and a player still on `/` is sent to `/game` (replace); the provider flag `starting` (and `restoring` in PlayerProvider) makes Home show "Shuffling up..." instead of a flash of Home. Home's "Play" is a link to `/game` that calls `startGame`.
- Fan layout (#81): each card is a `.fan-slot[data-fk]` (`data-fk` = the card's stable key, which `useSmoothRow` reads; never key it by anything that changes) as wide as `--step` (0.27 of `--cw`, floored to whole
  pixels by `useCardWidth`); `--room` (set by `useDealerRoom`) is how far the dealer's hand may reach before it slides left of the shoe's corner card. Never put these in per-card inline style.
  Remembered card positions (`spots`, #193) are written and compared only through `spotOf`, whose x leaves out the seats row's scroll. Anything that resizes or moves
  cards (`--cw`, `.seats.tight` / `.scroll`) must be final in the DOM before the cards' layout effects run (#193): `CardWidthSync`, rendered before the seats, applies the
  width, then calls `useTightSeats`' and `useSeatsScroll`'s decide functions (each hook returns `[value, decide]`; it puts the class on `.seats` at once); the hooks' own
  parent effects run after the seats and cover the first mount, plus a size a seat's own effect sets (a sideways double's margin). The memoized `DealerArea` and `PlayerHand` take `seats` so they measure in a split's commit.
- FeltPrint (#81): the rules drawn on the cloth are an `aria-hidden` svg with a separate transparent `<button class="print-hit" aria-label="Table rules">` laid over it. Do not put the printed words in the button
  (axe label-content-name-mismatch); its click stops propagation (a click on the felt continues the round). The words come from `ruleCatalog.js` (`feltPrint`).
- Top bar balance and top-up (#81, #90): the balance is `<b id="bal">` inside `.bal` (the live smoke reads `#bal`); the 7-tap top-up hangs on that `.bal` div, still with no role, tabindex or aria. `tapEnabled` still comes from GameBoard.
  "Table rules" in the menu opens the rules sheet (see Rules sheet, #87).
- E2E seeds (#81): since the game starts right after sign-in, the page builds two shoes before the deal (settings load, then game start) after 4 router-key numbers; seeds 183, 65 and those in `e2e/tableart.spec.js`
  were picked for that order. A change to when shoes are built, or to the fixture's deck count, means re-picking them (the card assertions fail first).
- Dock and message line (#80): `components/Dock` is the one bottom bar, a fixed height per mode (`--dock`, `--rowA/B` in GameBoard.css; never let it resize). Its face follows
  the phase: betting (PRE_DEAL), offers (`role="group"` "Offers", one key per open offer + No thanks), your move (every other phase; the keys are dimmed with `aria-disabled`
  until it is your turn on `selectedHandIndex`, and while a card flies), results (POST_ROUND: net, balance, Next hand; END_ROUND, the sweep, already shows the betting face with the rack and every key dimmed, #147). Hidden-by-setting keys (Surrender "none",
  Triple off) are absent; possible-but-not-now keys are dimmed. What a hand may do is `handActions` in blackjackLogic.js, never computed in the component. Focus moves on a
  phase change (first offer, Hit, Next hand) only when it was on nothing or inside the dock. A click on the felt (`.main-area`, not the whole board) still continues from the
  results. `CenterMessage` is the one 48 px line (a reconnecting or refused-bet notice replaces the phase wording; what shows is the Table messages setting, see Loop 2); keep its height fixed. `.tip-line` is 0 px while empty.
- Anything that flies or flips reserves its time in the `queue` of `utils/cardAnimation.js`; automatic steps wait `stepWait(T)`;
  totals count only landed cards (`useLanded`). A card object is a new copy on every reducer step, so effects depend on `card.id`,
  never on `card` (a changed dependency cancels the flip in progress). jsdom has no `Element.animate`: `setup.js` stubs it.

- E2E tests (#93, ADR-0004): they stub the API with `page.route` (`e2e/fixtures.js`) and seed `Math.random`, so the dealt cards repeat. Never add
  real waits (`page.waitForTimeout` is a lint error): wait on conditions, and keep deliberate delays in the route handlers. If the page's use of
  `Math.random` changes (new shoe builds, router keys), the seed in the deal test needs re-picking; its card assertions fail first. A bug that
  slips past the jsdom tests (timers, layout, animation, network) gets an e2e test. The tests rely on the `.flight-layer`, `.fly-inner`,
  `.options-wrap` and `.board.busy` hooks (`.options-wrap` is the dock while it holds the action bar or the offers; under `.board.busy` its keys are
  `aria-disabled` and inert, so the e2e watcher looks for a key that is not `aria-disabled`): rename one and the test changes with it. CI guards: `globalTimeout` 14 min per job in `playwright.config.js` (the `e2e` job is a matrix over the Playwright projects `chromium`, `phone` and `webkit`, #146, #167; each leg runs `--project=<name>`, except webkit, which is 2 jobs adding `--shard=1/2` / `--shard=2/2` (#208; one locally: `npm run e2e -- --project=webkit --shard=1/2`), and the SWA deploy's `needs: test` waits for all; the webkit jobs install through the same script with `PW_INSTALL_CMD` set to `npx playwright install --with-deps webkit`), step
  timeouts 4 min (browser install) and 15 min (tests) in `ci.yml`, all under the 20-min job limit; #123 was a slow apt mirror during
  `playwright install --with-deps`, not a hang. The install runs through `scripts/install-playwright-browser.sh` (#127: 2 attempts x 105 s,
  5 s apart, all inside the 4-min step timeout; a slow mirror is retried, not waited out), in `ci.yml` and the SWA `live_smoke` job.
- The dpkg-lock tests in `scripts/install-playwright-browser.test.js` skip on Windows, so only Linux CI runs them: a local green run proves nothing for that script, so check that the `build-test` log shows them ran (#159, PR #162).
- E2E and animation (#83, #148): the table opens with a shuffle, so `login()` in `e2e/fixtures.js` taps the felt to skip it (a tap does), and every new test starts from there. An axe scan must never read mid-animation (blended colours fail `color-contrast`), and waiting first is not enough (#205: a fade can start during the slow WebKit scan): `expectNoSeriousA11y` switches CSS motion off for the length of the scan, so scan only through it. Wait before a scan only for what must be on show (axe skips a faded-out element). Over a CSS gradient axe only says "incomplete" (#214), so on a `.page-screen` the helper also scans contrast on a flat background in each of the gradient's two end colours (which bounds every window size and scroll offset) and fails on anything axe still cannot check; `expectScreenContrastInEveryLook` repeats that in all 3 felts x dark and light (a screen that gets a new text colour must call it). `expect.poll` does not retry a callback that throws (#202): return a value such as `Infinity` while an element is not there yet.
- Hidden top-up (#90): 7 taps in 3 s on the balance open a code prompt. The call goes through `enqueue` with one `requestId` per submit; a 429
  (lockout, `Retry-After`) is a definite refusal, never retried. Keep `tapEnabled` in GameBoard (signed in, balance under 100, PRE_DEAL, no chips in
  the circle, nothing pending): the API counts a correct code refused by a guard as a wrong entry toward the per-player lockout (5 wrong, then 10 min).
  Nothing about the feature may be in the DOM before the 7 taps (no role/tabindex/aria on the balance, prompt not rendered). Every refusal shows one
  generic message. The real code is never in the repo, bundle, tests, logs or PR (tests use a dummy).
- Auto deal (#88): settings `autoDeal` and `autoDealDelay` (0-10000 ms, default 3000; not in `RESET_SETTINGS` or the presets); `autoDealOn(state)` needs `autoDeal`,
  `resetInitialBet` and `!autoDealPaused`, and `sanitizeSettings` turns a saved `autoDeal` off without `resetInitialBet`. Two reducer fields: `autoDealPaused`
  (sticky: Pause button, or an unaffordable rebet, which also sets the notice after `emptyRound`; cleared by Resume, START_GAME/RESET_GAME and enabling `autoDeal`)
  and `autoDealPending` (armed by END_ROUND when a rebet was placed; cleared by ADD_BET, UNDO_BET, CLEAR_BET, DEAL, any table reset, Pause, and leaving `/game`).
  `nextAutoAction` gives CONTINUE (POST_ROUND) and DEAL (PRE_DEAL, pending) on the one existing timer; DEAL waits `stepWait(autoDealDelay)`, so delay 0 means right
  after the CONTINUE and END_ROUND steps. GameProvider nulls those two steps while `pathname !== "/game"` (no Resume needed on return) and dispatches
  `CANCEL_AUTO_DEAL` (pending only, not a pause). Timer dispatches carry `auto: true`; an `auto` DEAL with nothing pending is ignored. The Pause/Resume button
  (a dock key since #80, so it needs no stopPropagation) shows only between rounds (PRE_DEAL, POST_ROUND, END_ROUND; removed from the DOM otherwise) while auto deal is enabled, even if nothing is armed (enable it with a rebet on the table and nothing deals until a manual Deal). `UNDO_BET` (#82) clears `autoDealPending` like ADD_BET and CLEAR_BET (Rebet and 2x are ADD_BETs, so they do too). `OFFERS` has no automatic step, so auto deal waits there.
- Chips and betting (#82): `betHistory` is the amounts added to the circle since it was last empty, oldest first; ADD_BET pushes, `UNDO_BET` pops the last
  (`local(+x)`), and it is emptied by DEAL, CLEAR_BET, `resetTable` and a voided round (BET_REJECTED on the opening bet); END_ROUND's auto rebet seeds it with `[initialBet]`.
  Rebet is `ADD_BET` of `initialBet` and 2x is `ADD_BET` of `betCircle` (the dock dims them unless affordable): never give them reducer actions or ledger events of their
  own. The ledger still sees one opening bet. The selected rack chip is UI state in GameBoard (`picked`, shown through `effectiveChip`), never reducer state: the rack
  selects it, the bet circle (`.spot`, a button named "Bet spot N, ...") bets it, and a double tap on a rack chip (timed by hand, 400 ms) bets it too. Stacks are
  `ChipStack` (`splitChips`: greedy over `ALLOWED_CHIPS`, up to 10 drawn, the exact amount on `.amt`); a double's second stake and the insurance are `.side-spot`
  stacks beside the circle, never over the bet. The chip symbols (`#chip-<v>`, `#chip-<v>-p`, `#side-<v>`) are in `components/Sprite/ChipSymbols.jsx`: change a colour
  there only with the issue table (#82) and the mockup's `build.mjs`. The rack's scroll classes and `--rgap` / `--rpad` are set by hand in `Dock`'s `ChipRack`, not through React.

- Rules sheet, pages, icons, WebP, SWA 404 (#87): the Table rules sheet is `components/RulesSheet` (portal, `role="dialog"`, bottom sheet on phones and a panel from 720 px; focus to its one Close button, Escape / backdrop
  close, focus back to the opener). GameBoard owns its state; the felt print, the menu item and Home's Rules open it. Its lines come from `sheetGroups(settings)` in `ruleCatalog.js` (reuses the felt's words, labels and
  summaries, hides by `showWhen`; even money only when `offersAtDeal` would offer it): add a rule's line there. Destructive asks (Leave game, Log out) are `ConfirmDialog`s returned by `useNavActions` as `confirm`: the
  component that calls the hook must render `{confirm}`; never `window.confirm`. Home, Log in (`/login`), Create an account (`/signup`), Loading and Error are the standalone `.page-screen` screens
  (`components/PageScreens`); Settings has only its own sticky "Table / Settings" head: there is no global header (#166 L1-12; Home and Log out are reached from the table menu and the Account section, and a signed-out visitor on /settings gets Log in / Home links). `App` shows Loading while a saved session is restored and Error ("Can't reach the table": Try again / Home) when the restore got no answer
  (`restoreFailed`; a 401 clears the token and just signs out). The manifest (`public/manifest.webmanifest`) and `public/icons/*.png` (wordmark on #070908, one-off Playwright rasterisation, no script kept) are linked
  from `index.html`; no service worker. Card faces are 360 px WebP (#169, q75; largest card is 312 px at 2x) (`/cards/<rank>_of_<suit>.webp`, no PNG): never add PNG faces back. `staticwebapp.config.json`: static folders (`/assets`, `/brand`, `/cards`, `/fonts`,
  `/icons`, `/sounds`) and root `*.svg` / `*.webmanifest` are excluded from the `index.html` fallback and there is NO 404 `responseOverride` (it served HTML for a missing file, so a broken image or font looked like
  a parse error); a new static folder goes in that exclude list.

- Motion (#83, DESIGN section 3): bet chip flights never `reserve`/`hold` (taps must not delay the dock); payout, sweep and discard flights `reserve`; the shuffle
- Motion gaps (#147): no bet is accepted while the table shuffles or sweeps: `Dock` computes `wait` (shuffling or END_ROUND) once and it dims the rack (`.rack-wrap.off`, chips `aria-disabled`), the keys 1-9 and the betting keys, and GameBoard disables the bet circle (`canBet` needs no `shuf`); never add a bet path that skips it. A split-off hand (`cards[0].moved`) flies its stake in once (`stackToSide`). `useSmoothRow` glides x and y. `paid` (PlayerHand) is set when the payout flight ends, so the "$25" label stays and the empty circle then shows BET.
  and the peek `reserve(end, true)` and `hold(maxMs)` (released on finish, a skip tap or the timeout, so a background tab never leaves the board busy). The shuffle
  plays when `shoeSeq` changes (bumped in `countSeen`'s `reset` branch; `shoeMid` = mid-round refill, short) and on the board's first render in `PRE_DEAL` with empty `seenIds`
  (tests that mount `GameBoard` there pass `seenIds: ["x"]`). The peek check on a round that offers nothing is a display hold in `usePeek` (DEALING to the turn), never a
  reducer step; a dealer blackjack's hole face stays out of the DOM until the check ends. Per-hand `.tag.*` only with 2+ hands (one hand: the `.verdict.<kind>`). The balance badge
  shows every real change and a settled loss clears it; the count-up is display only and never delays settle. Reduced motion: no flights, flips, sweeps, shuffle or holds.

- Heavy SVG (the chip `Sprite`) is memoized and must stay so: rebuilding it on a route change raced the post-login redirect on slow CI runners (#142, 77ecfd3). Keep new render-heavy work off the login/redirect path.
- Keyboard and screen reader (#85, DESIGN section 8): every key in `Dock` is registered with `bind(hotkey, off, run)`, which gives the button its `aria-keyshortcuts` and `<kbd>` hint and the keyboard the same `off` flag and action, so a dimmed or absent key does
  nothing (add a key through `bind`, never a second handler). One `document` keydown listener lives while the Dock is mounted (the table only: Settings and Home have no Dock); it ignores `e.repeat`, ctrl/meta/alt, input / textarea / select /
  dialog / contenteditable targets, and any open `[role=dialog]` or open `.menu`; Space and Enter are one key (Deal, Next hand) and keep their own action on a focused button, link or `[role=button]`. 1-9 keep the "same number twice adds" rule
  (`lastKey`: any other key, even an ignored one, starts over). The board has ONE polite live region, the `.msg` line: at the results CenterMessage carries `resultsLine` (utils/verdict.js: each hand's outcome and total, then the dealer's; totals
  leave it with Show hand totals off, "blackjack" stays) in a hidden span. Never add a second `aria-live` or a hidden duplicate of the line: Playwright's strict `getByText` and the jsdom `getByText` queries would find two. Focus moves per phase in
  Dock's effect (deps `phase`, `openOffers`, `busy`), only from nothing or the dock. Targets are 44 px (inline links get it from an ::after or padding, never a visible change); the 12 px text floor and the `--tx-3` / accent-text tokens follow DESIGN section 3.
- Sound (#86, recorded L2-9): settings `soundOn` / `hapticsOn` / `soundVolume`; the six sounds are CC0 recordings in `public/sounds/*.mp3` (sources in `public/CREDITS.md`), fetched and decoded into cached AudioBuffers the first time Sound is on (loaded only while Sound is on: when it is switched on or saved on at the first table render, and on every pointerdown, pointerup or key press; a failed file is skipped and retried once, on the next play or the next tap or key press, then given up for the session) and played through a BufferSource and one gain. The `SOUNDS` table at the top of `src/utils/sound.js` has each sound's file, start offset `at`, longest play `ms` (0 = whole file) and level `gain`; to swap a sound, drop the new file in `public/sounds` and change its row (the win and shuffle are provisional). `playSound(name, volume, maxMs)`: `useShuffle` passes the on-screen shuffle's length so the recording ends with it. `setSoundPrefs` is called from GameBoard; deal/flip play in `FlyCard`, chip in `PlayerHand`, shuffle in `useShuffle`, win/lose in GameBoard. `sound.js` must never use `Math.random` (the e2e seeds depend on the draw count). `/sounds` is in the SWA fallback exclude list and the CSP needs nothing more (fetch is `connect-src 'self'`). The disabled Volume slider dims only the input (`.slider.off input`) and keeps `--tx-2` on its output, or axe color-contrast fails.
- Code splitting (#169): `Settings` (App.jsx) and `RulesSheet` (GameBoard, Home) are `React.lazy` (fallback `LoadingScreen` / `null`); Home, Game, GameBoard, Login stay static. CSS that a lazy module shares with eager ones (`.btn`, `.dlg*` in `SettingsControls/Dialog.css`) must be imported by the eager users too, or it ships only in the lazy chunk and the dialogs render unstyled (only e2e `screens.spec.js` catches it; jsdom loads no CSS). Tests open the sheet with `await findBy*`.

- Loop 1 fix pass (#166): the chip stack lifts by `--k` / `--h` (a percentage of the svg's own height) because `--chip` holds `cqi` units and inside `.stack` (a query container for the numeral swap) they would resolve to the stack's own width, not the seat's. `Game` waits on Loading while `starting` (signed in, settings loading) instead of redirecting to `/`: GameProvider's start only moves a player still on an entry route, so a reload on `/game` used to land on Home when the settings answered at once. A refused opening bet voids the round but its cards are NOT put back in the shoe (they were seen face up; restoring would deal them again): they go to the discard pile like a misdeal (L1-27, by design). An opened Settings section scrolls to the top of the page (`sec-<id>`, instant on arrival, smooth after unless reduced motion). The rules sheet has its own full sentences in `sheetGroups` (the felt print and the Settings summaries keep their short phrases). Base text is 15 px / 1.4 in `--tx` on `:root` / body (the felt keeps `#eef2ef`); the total pill is 26 px at every width. `e2e/loop1.spec.js` guards these (it also runs in the `phone` project).
- Loop 2 (#166): three display settings (`tableMessages`, `currency`, `showKeyHints`), none a table rule (no `LEGACY_RULES` / `RULE_SINCE` / `SETTINGS_VERSION` change, not in `RESET_SETTINGS` or the presets). **Table messages** (`tableMessages`: `"all"` | `"hints"` default |
  `"results"` "Celebrations only", Gameplay): `CenterMessage` sorts each line into a prompt (Place your bets, Tap Deal, Your move, Insurance? / Even money? / Surrender?), a notice (Reconnecting, any `notice`, Out of
  credits, Last hand before the shuffle: always shown) or a status (Dealing, Dealer plays, Settling bets, Dealer checks, No blackjack, Shuffling, Waiting for the server, Dealing soon: only in All); results always show. In Hints a prompt shows after 5 s
  (`IDLE_MS`) with no `pointerdown` / `keydown` on the page, restarts on a text, phase or selected-hand change (the next split hand is a new wait), is held while a dialog or the menu is open (`OPEN_LAYER`, utils/constants/layers.js, the check Dock uses), and fades in (none under reduced motion). A line not shown is not rendered (no sr-only copy), but `.msg` and its height stay (the ONE live
  region). **The e2e fixture's saved settings carry `tableMessages: "all"` and `currency: "USD"`** (`stubApi` merges them under whatever a spec passes), so the specs that wait on "Place your bets" keep their meaning; `renderUI` (testUtils)
  does the same for jsdom (`messages` option, "all"; a test of Hints passes `messages: "hints"`). The live smoke (`e2e-live/live.spec.js`) runs on the account's real settings, so it never waits on a message or a symbol: it waits on the dock
  (`.dock-in[data-face="betting"]` with `.rack-wrap:not(.off)`), reads chips from `data-chip` and the balance from `#bal`. **Currency** (`currency`: `"auto"` default | `"USD"` | `"GBP"` | `"EUR"`, Appearance): every amount goes through
  `utils/money.js` (`money`, `signed`), whose symbol `GameProvider` sets in render with `setCurrency(settings.currency)` (like `setSoundPrefs`); auto reads `navigator.language` (`currencyFor`: GB pounds, the euro area euros, else dollars). Play money:
  amounts 1:1. A component that builds a money string must not be memoized on props alone while the currency can change under it (today the table is unmounted while Settings is open, so it never is). Never hard-code `$`.
  **Show keyboard shortcuts** (`showKeyHints`, Gameplay, default off): the dock gets `.hints` and Dock.css shows the `kbd` hints and the rack's digits only then, at 900 px wide and 521 px tall or more; the keys, `aria-keyshortcuts`
  and the `kbd` elements are there either way. Settings hides the control below that size (`.pc-only`). **Deal key and countdown bar** (L2-4): the Deal key always says "Deal" (no "Shuffling", no "auto" line) and is only dimmed
  while the table shuffles or sweeps; while auto deal's own DEAL (Deal) or CONTINUE (Next hand) step waits, GameProvider's `autoBar` `{ type, ms, at }` (the length of that very `stepWait`, new object when the timer restarts, null otherwise)
  gives that key a `.bar` that fills over `ms` (hidden under reduced motion). **Once per shoe** (L2-11): the shuffle's `useShuffle` remembers the `shoeSeq` it played or skipped in `shuffled.seq` (cardAnimation.js, reset by
  `resetCardStage`), so a board that mounts again for the same shoe (back from Settings) plays nothing; a shuffle cut short by leaving plays again. **Reload warning** (L2-12): `GameProvider` listens for `beforeunload` while the phase is not
  NONE / PRE_DEAL / POST_ROUND / END_ROUND (cards out, round unsettled), on any page. **Crash screen** (L2-13): `ErrorScreen crash` ("Something went wrong", Reload / Home) is the error boundary's; the restore-failed Error keeps its words.
  **Home** has no felt hero (L2-5). **Discard pile** (L2-10): the sweep's copies land centred on the pile's top card (`.discard-card`, not a corner), the pile counts them when the last one lands (`swept` in GameBoard) and is not faded in
  (only out), so nothing jumps or blinks when the copies go. **PC layout** (L2-8, 900 px and 5:4 or wider): `.stage-in` pads its top and bottom by half of what its rows leave beyond `--mid-room` (GameBoard.css), so the hands sit
  closer, the print and message block still centred between them; the shoe and pile stay in the felt's corners. The "i" mark is 14 px with a 44 px tap area. `e2e/loop2.spec.js` guards these (it also runs in the `phone` project).
- Loop 4 layout fixes (#166, `e2e/layout-sizes.spec.js` has no waiver left for them; each is an intentional deviation from the mockup, which is equally tight, by Blake's ruling): L4-1 below 360 px wide `.key` padding is 3 px (Rebet's text was 3 px wider than its key at 320); L4-2 on a phone under 900 px wide, `--fixed` is 12 px larger from 521 to 740 px high and 20 px larger from 741 to 820 (cards up to 5 px narrower where the height limits them: 51 -> 48 px at 320x568, 93 -> 88 at 414x760; the rule applies to any window under 900 px wide, not only phones; the card-width step from 740 to 741 px high is larger now, 414 wide: 88 -> 83), and the two-line verdict's insurance line is `line-height: 1.2` with a 2 px top margin (at every size: it is 4.6 px shorter everywhere), so the verdict is at least 8 px clear of the first card (12.3 px at 320x568 and 375x667; the worst case measured on a 320-414 px wide phone is 9.5; 430-440 px wide windows under 700 px high reach only 6.9-7.5, no real phone); L4-3 the `.shoe` box is `.8 cw` tall (was `.9`; its shadow and `.mouth` are written in `cw`, so nothing visible moved) so the dealer's total pill never touches it. `layout-sizes.spec.js` asserts them strictly (its general overlap rule tolerates 1.5 px): at every step with a verdict the verdict box is at least 8 px above the first player card, and no dealer total pill overlaps the shoe box at all.
- E2E port: `npm run e2e` always serves on 4174 and never reuses a server, so a second worktree running it at the same time fails to start. Run yours with a throwaway config that changes `use.baseURL` and `webServer` to another port (delete it afterwards); never stop the other run.

## Do not
- Commit secrets; edit `dist/`; change the API contract here without changing blackJackAPI.
