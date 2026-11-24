import { test, expect, stubApi, login, seedRandom, placeBet } from './fixtures';

// The Settings page (#84, #91): one page, an accordion of sections, one draft and one Save. A rule click changes the draft; Save sends the changed
// keys, in one PUT of the whole table (version 5).
const section = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) });
const settingsButton = (page) => page.getByRole('button', { name: 'Settings', exact: true });
const saveChanges = (page) => page.getByRole('button', { name: 'Save changes' });
const unsaved = (page) => page.getByRole('region', { name: 'Unsaved changes', exact: true });

async function openSettings(page, name = 'Table rules') {
  await login(page);
  await settingsButton(page).click();
  // A save before the load is applied is refused (it would overwrite the stored table): wait until the loaded table shows (the fixture's Rate of Play).
  await expect(section(page, 'Gameplay')).toContainText('Very fast');
  if (name) await section(page, name).click();
}

const group = (page, name) => page.getByRole('radiogroup', { name, exact: true });
// An option reads "6:5 +1.39% house edge": match the label at the start of the name; the lookahead stops "Early" matching "Early, not against an ace".
const option = (page, name, label) => group(page, name).getByRole('radio', { name: new RegExp(`^${label}(?=\\s*[+-]\\d|$)`) });
// A switch's checkbox sits under its track (opacity 0): a player taps the row, so the test does too.
const flip = (page, name) => page.locator('label.sw', { hasText: name }).click();
const preset = (page) => page.getByRole('button', { name: /^Preset/ });

test('every section starts closed, one opens at a time, and each header sums up its values (#84)', async ({ page }) => {
  await stubApi(page);
  await openSettings(page, null);
  const names = ['Table rules', 'Gameplay', 'Chips', 'Appearance', 'Sound & haptics', 'Account'];
  for (const name of names) await expect(section(page, name)).toHaveAttribute('aria-expanded', 'false');
  await expect(section(page, 'Table rules')).toContainText('Vegas');
  await expect(section(page, 'Table rules')).toContainText('house edge');
  await expect(section(page, 'Chips')).toContainText('12 of 12 chips');
  await expect(section(page, 'Appearance')).toContainText('Green felt');
  await expect(section(page, 'Sound & haptics')).toContainText('Sound off · vibration off');
  await expect(page.getByRole('tab')).toHaveCount(0);

  await section(page, 'Table rules').click();
  await expect(section(page, 'Table rules')).toHaveAttribute('aria-expanded', 'true');
  await section(page, 'Chips').click();
  await expect(section(page, 'Chips')).toHaveAttribute('aria-expanded', 'true');
  await expect(section(page, 'Table rules')).toHaveAttribute('aria-expanded', 'false');
  await expect(group(page, 'Deck size')).toHaveCount(0);
});

test('a new player sees Vegas chosen; changing a rule is a draft, and Save writes version 5 with every setting at once (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  await expect(preset(page)).toContainText('Vegas');
  await expect(option(page, 'Soft 17', 'Hits')).toHaveAttribute('aria-checked', 'true');
  await expect(option(page, 'Blackjack pays', '3:2')).toHaveAttribute('aria-checked', 'true');
  await expect(option(page, 'Double on', 'Any two cards')).toHaveAttribute('aria-checked', 'true');
  await expect(option(page, 'Deck size', '6')).toHaveAttribute('aria-checked', 'true');
  await expect(group(page, 'If the dealer has blackjack, you lose')).toHaveCount(0); // a peek finds a dealer blackjack before any extra stake

  await option(page, 'Blackjack pays', '6:5').click();
  await expect(preset(page)).toContainText('Custom');
  await expect(section(page, 'Table rules')).toContainText('Custom');
  await expect(section(page, 'Table rules')).toContainText('unsaved changes');
  await expect(unsaved(page)).toContainText('1 unsaved change');
  expect(api.saves).toEqual([]); // nothing goes to the API until Save

  await saveChanges(page).click();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 5, blackjackPayout: '6:5', dealerHitsSoft17: true, noHoleCardLoss: 'original', deckCount: 6, maxSplitHands: 4 });
  expect(Object.keys(api.saves[0])).toEqual(expect.arrayContaining(['dealerHoleBehaviour', 'doubleOn', 'doubleAfterSplit', 'resplitAces', 'hitSplitAces', 'playTimeout']));
  await expect(unsaved(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
});

test('Discard drops the draft, and a rule put back where it was is no change (#84)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  await option(page, 'Deck size', '8').click();
  await expect(unsaved(page)).toBeVisible();
  await option(page, 'Deck size', '6').click();
  await expect(unsaved(page)).toHaveCount(0);
  await option(page, 'Surrender', 'None').click();
  await unsaved(page).getByRole('button', { name: 'Discard' }).click();
  await expect(unsaved(page)).toHaveCount(0);
  await expect(option(page, 'Surrender', 'Late')).toHaveAttribute('aria-checked', 'true');
  await expect(preset(page)).toContainText('Vegas');
  expect(api.saves).toEqual([]);
});

test('a table saved before #91 keeps its payout rules, shows Custom, and the next change upgrades it to version 5 with them (#91)', async ({ page }) => {
  const api = await stubApi(page, { settings: { v: 1, playTimeout: 250, dealerHoleBehaviour: 'drawAfter' } });
  await openSettings(page);
  await expect(preset(page)).toContainText('Custom');
  await expect(option(page, 'Dealer\'s second card', 'No second card')).toHaveAttribute('aria-checked', 'true');
  await expect(option(page, 'Soft 17', 'Stands')).toHaveAttribute('aria-checked', 'true'); // the old table stood on soft 17
  await expect(option(page, 'Deck size', '2')).toHaveAttribute('aria-checked', 'true');
  await expect(option(page, 'Max hands after splitting', 'Unlimited')).toHaveAttribute('aria-checked', 'true');
  await expect(option(page, 'If the dealer has blackjack, you lose', 'Everything you staked')).toHaveAttribute('aria-checked', 'true'); // with no hole card a dealer blackjack still takes everything
  await expect(option(page, 'Surrender', 'None')).toHaveAttribute('aria-checked', 'true'); // an old table never gains surrender
  await expect(option(page, 'Insurance and even money', 'Off')).toHaveAttribute('aria-checked', 'true'); // nor insurance

  await option(page, 'Resplit aces', 'On').click();
  await saveChanges(page).click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({
    v: 5, resplitAces: true, surrender: 'none', insurance: false, dealerHitsSoft17: false, noHoleCardLoss: 'all', blackjackPayout: '3:2', deckCount: 2, maxSplitHands: 0, dealerHoleBehaviour: 'drawAfter',
  });
});

test('Surrender is a rule: its short hint is the description, and choosing Early saves surrender early (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  await expect(option(page, 'Surrender', 'Late')).toHaveAttribute('aria-checked', 'true');
  await expect(group(page, 'Surrender')).toHaveAccessibleDescription('Give up half your bet');

  await option(page, 'Surrender', 'Early').click();
  await saveChanges(page).click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 5, surrender: 'early', dealerHoleBehaviour: 'drawEarly_Check', deckCount: 6 });
});

test('Insurance and even money is on for a new player, and switching it off shows Custom and saves insurance off (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  await expect(option(page, 'Insurance and even money', 'On')).toHaveAttribute('aria-checked', 'true');
  await expect(preset(page)).toContainText('Vegas');

  await option(page, 'Insurance and even money', 'Off').click();
  await expect(preset(page)).toContainText('Custom'); // every preset has insurance on
  await saveChanges(page).click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 5, insurance: false, surrender: 'late', deckCount: 6 });
});

test('the preset dropdown shows each preset\'s house edge, works by keyboard, and Save writes the whole preset (#84)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  await expect(preset(page)).toContainText('house edge');
  await preset(page).focus();
  await page.keyboard.press('Enter');
  const list = page.getByRole('listbox');
  await expect(list).toBeFocused();
  const options = list.getByRole('option');
  await expect(options).toHaveCount(5);
  for (const name of ['Vegas', 'Atlantic City', 'Europe', 'Australia', 'Singapore']) await expect(list.getByRole('option', { name: new RegExp(`^${name}`) })).toContainText('%');
  await expect(list.getByRole('option', { name: /^Vegas/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
  await expect(preset(page)).toBeFocused();
  await expect(preset(page)).toContainText('Europe');
  await expect(option(page, 'Dealer\'s second card', 'No second card')).toHaveAttribute('aria-checked', 'true');
  expect(api.saves).toEqual([]);

  await saveChanges(page).click();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({
    v: 5, deckCount: 6, dealerHoleBehaviour: 'drawAfter', dealerHitsSoft17: false, doubleOn: '9-11', maxSplitHands: 0, noHoleCardLoss: 'all',
    surrender: 'none', insurance: true, blackjackPaysImmediately: false, playTimeout: 250,
  });
  await preset(page).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('the dealer\'s second card is one three-way choice, and each mode shows only the rules that matter in it (#84)', async ({ page }) => {
  await stubApi(page);
  await openSettings(page);
  const second = group(page, 'Dealer\'s second card');
  await expect(second.getByRole('radio')).toHaveText([/^Peeks/, /^No peek/, /^No second card/]);
  await expect(page.getByRole('switch', { name: 'Blackjack pays immediately' })).toHaveCount(0);

  await option(page, 'Dealer\'s second card', 'No peek').click();
  await expect(preset(page)).toContainText('Custom');
  await expect(group(page, 'If the dealer has blackjack, you lose')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Blackjack pays immediately' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Dealer draws only once against a 21' })).toHaveCount(0);

  await option(page, 'Dealer\'s second card', 'No second card').click();
  await expect(page.getByRole('switch', { name: 'Dealer draws only once against a 21' })).toBeVisible();

  await option(page, 'Dealer\'s second card', 'Peeks').click();
  await expect(preset(page)).toContainText('Vegas');
  await expect(unsaved(page)).toHaveCount(0);
});

test('Blackjack on split is a House variations switch: it makes the table Custom, and putting it back shows Vegas again (#91)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page);
  const toggle = page.getByRole('switch', { name: 'Blackjack on split' });
  await flip(page, 'Blackjack on split');
  await expect(toggle).toBeChecked();
  await expect(preset(page)).toContainText('Custom');
  await saveChanges(page).click();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 5, blackJackOnSplit: true });

  await flip(page, 'Blackjack on split');
  await expect(toggle).not.toBeChecked();
  await expect(preset(page)).toContainText('Vegas');
  await saveChanges(page).click();
  await expect.poll(() => api.saves.length).toBe(2);
  expect(api.saves[1]).toMatchObject({ blackJackOnSplit: false });
});

test('Gameplay: Game speed and Show hand totals save with the rest, and the table is re-themed (#84)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page, 'Gameplay');
  await expect(page.getByRole('slider', { name: 'Game speed' })).toHaveValue('0'); // the fixture's fastest speed
  await expect(page.getByRole('switch', { name: /^Show hand totals/ })).toBeChecked();
  await page.getByRole('slider', { name: 'Game speed' }).fill('500');
  await expect(page.getByText('Normal · 1.0 s')).toBeVisible();
  await flip(page, 'Show hand totals');
  await expect(page.getByRole('switch', { name: /^Show hand totals/ })).not.toBeChecked();
  await expect(page.locator('html')).toHaveClass(/no-totals/); // previewed at once
  await expect(unsaved(page)).toContainText('2 unsaved changes');
  expect(api.saves).toEqual([]);

  await saveChanges(page).click();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 5, playTimeout: 1000, showTotals: false });
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/no-totals/);
});

test('Appearance: the felt, accent and mode preview as they are picked, save with the rest, and Discard puts the saved look back (#84)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page, 'Appearance');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-felt', 'green');
  await page.getByRole('radio', { name: 'Blue' }).click();
  await page.getByRole('radio', { name: 'Orchid' }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(html).toHaveAttribute('data-felt', 'blue');
  await expect(html).toHaveAttribute('data-accent', 'orchid');
  await expect(html).toHaveAttribute('data-mode', 'light');
  await expect(page.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');

  await unsaved(page).getByRole('button', { name: 'Discard' }).click();
  await expect(html).toHaveAttribute('data-felt', 'green');
  await expect(html).toHaveAttribute('data-mode', 'dark');

  await page.getByRole('radio', { name: 'Red' }).click();
  await saveChanges(page).click();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ feltTheme: 'red' });
  await expect(html).toHaveAttribute('data-felt', 'red');
});

test('leaving with unsaved changes asks first, from Table and from the header; Keep editing keeps the draft (#84)', async ({ page }) => {
  await stubApi(page);
  await openSettings(page);
  await option(page, 'Deck size', '8').click();

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard your changes?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings$/);
  await expect(option(page, 'Deck size', '8')).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: 'Discard and leave' }).click();
  await expect(page).toHaveURL(/\/game$/);
});

test('a page unload with unsaved changes gets the browser\'s own prompt (#84)', async ({ page }) => {
  await stubApi(page);
  await openSettings(page);
  await option(page, 'Deck size', '8').click();
  const prompt = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const dialog = await prompt;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
});

test('saving a table rule mid-round asks "Start a new shoe?" once, before saving; Cancel saves nothing (#84)', async ({ page }) => {
  const api = await stubApi(page);
  await seedRandom(page, 183); // the smoke test's deal: a hand in play once the cards have landed
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hit' })).toBeEnabled({ timeout: 15_000 });
  await settingsButton(page).click();
  await expect(section(page, 'Gameplay')).toContainText('Very fast');
  await section(page, 'Table rules').click();
  await option(page, 'Deck size', '8').click();
  await saveChanges(page).click();

  const dialog = page.getByRole('dialog', { name: 'Start a new shoe?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(unsaved(page)).toBeVisible();
  expect(api.saves).toEqual([]);

  await saveChanges(page).click();
  await page.getByRole('button', { name: 'Save and reset' }).click();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ deckCount: 8 });
});

test('an empty name never blocks the settings: they save, Account opens with its error, and the name stays unsaved (#84)', async ({ page }) => {
  const api = await stubApi(page);
  await openSettings(page, 'Account');
  await page.getByLabel('First name').fill('');
  await expect(page.getByText('First name is required.')).toBeVisible();
  await expect(saveChanges(page)).toHaveAttribute('aria-disabled', 'true'); // only an invalid field is left to save
  await section(page, 'Chips').click();
  await page.getByRole('button', { name: '$1 chip' }).click();
  await saveChanges(page).click();

  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ chipValues: '5,10,25,50,100,1000,5000,10000,20000,50000,100000' });
  await expect(section(page, 'Account')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('First name is required.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: "Your profile isn't saved yet." })).toBeVisible();
  await expect(unsaved(page)).toContainText('1 unsaved change');
});

test('Delete profile sits apart below the sections and asks first; Keep my profile deletes nothing (#84)', async ({ page }) => {
  await stubApi(page); // the stub has no DELETE: deleting would fail the test as an unknown endpoint
  await openSettings(page, null);
  const del = page.getByRole('button', { name: 'Delete profile' });
  await expect(del).toBeVisible();
  const [account, delBox] = await Promise.all([section(page, 'Account').boundingBox(), del.boundingBox()]);
  expect(delBox.y).toBeGreaterThan(account.y);
  await del.click();
  const dialog = page.getByRole('dialog', { name: 'Delete profile?' });
  await expect(dialog.getByRole('button', { name: 'Keep my profile' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Keep my profile' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings$/);
});

test('every setting has its "i" hint, wired as the control\'s description (#84)', async ({ page }) => {
  await stubApi(page);
  await openSettings(page, 'Gameplay');
  await expect(page.getByRole('slider', { name: 'Game speed' })).toHaveAccessibleDescription('How fast cards move');
  await expect(page.getByRole('switch', { name: /^Show hand totals/ })).toHaveAccessibleDescription('Hand totals on the table');
  const mark = page.locator('.hint-i[data-for="hd-showTotals"]');
  await mark.click();
  await expect(page.locator('.hint-tip')).toHaveText('Hand totals on the table');
  await expect(page.getByRole('switch', { name: /^Show hand totals/ })).toBeChecked(); // the tap never toggles the control
  await expect(unsaved(page)).toHaveCount(0);
});

test('on a phone the page does not scroll sideways and every control is at least 44px high (#84)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await stubApi(page);
  await openSettings(page, null);
  const overflow = () => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.querySelector('.settings-screen').scrollWidth, document.querySelector('.settings-screen').clientWidth]);
  const tooSmall = async (locator) => {
    const found = [];
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      if (!(await locator.nth(i).isVisible())) continue; // not rendered at this size (Show keyboard shortcuts is a desktop-only setting, L2-3)
      const box = await locator.nth(i).boundingBox();
      if (!box || box.height < 44) found.push(`${(await locator.nth(i).innerText()).slice(0, 30)} ${box?.height}`);
    }
    return { count, found };
  };

  const headers = await tooSmall(page.locator('.settings-screen .sec-h'));
  expect(headers).toEqual({ count: 6, found: [] });
  for (const name of ['Table rules', 'Gameplay', 'Chips', 'Appearance', 'Sound & haptics', 'Account']) {
    await section(page, name).click();
    await expect(section(page, name)).toHaveAttribute('aria-expanded', 'true');
    const [docScroll, docClient, screenScroll, screenClient] = await overflow();
    expect(docScroll, `${name}: page`).toBeLessThanOrEqual(docClient);
    expect(screenScroll, `${name}: settings`).toBeLessThanOrEqual(screenClient);
    const controls = await tooSmall(page.locator('.settings-screen .sec-b:not([hidden]) :is([data-rule], .sw, .pdd-b, .cp, .fs, .ac, [data-pick-mode], [data-pick-messages], [data-pick-currency], .btn, input:not([type=checkbox]):not([type=range]))'));
    expect(controls.found, `${name}: controls under 44px`).toEqual([]);
    if (name === 'Table rules') expect(controls.count).toBeGreaterThan(30);
    if (name === 'Sound & haptics') expect((await page.getByRole('slider', { name: 'Volume' }).boundingBox()).height, 'Volume slider height').toBeGreaterThanOrEqual(44); // ranges are not in the selector above
  }
  await section(page, 'Table rules').click();
  await preset(page).click();
  const options = await tooSmall(page.locator('[data-preset]'));
  expect(options).toEqual({ count: 5, found: [] });
  await expect(page.getByRole('button', { name: 'Delete profile' })).toBeVisible();
  const bottom = await tooSmall(page.locator('.danger-zone .btn'));
  expect(bottom.found).toEqual([]);
});
