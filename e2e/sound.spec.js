import { test, expect, stubApi, seedRandom, login, placeBet } from './fixtures';

// Sound & haptics (#86): the Sound switch gates Volume, Save writes the three keys, and a hand then plays with the sounds on and nothing breaks.
// Chromium makes no sound under test, so Web Audio and navigator.vibrate are replaced by recorders (installed before the app loads).
const section = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) });
const flip = (page, name) => page.locator('label.sw', { hasText: name }).click(); // a switch's checkbox sits under its track: tap the row

test('turning Sound on enables Volume, Save writes the sound settings, and a hand plays with sounds and no errors (#86)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    const log = { contexts: 0, started: 0, buzzes: [] };
    window.__sound = log;
    const param = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    window.AudioContext = class {
      constructor() { log.contexts++; this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
      resume() {}
      createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
      createGain() { return { gain: param(), connect() {} }; }
      createOscillator() { return { frequency: param(), connect() {}, start() { log.started++; }, stop() {} }; }
      createBufferSource() { return { connect() {}, start() { log.started++; }, stop() {} }; }
      createBiquadFilter() { return { frequency: {}, connect() {} }; }
    };
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (pattern) => { log.buzzes.push(pattern); return true; } });
  });
  const api = await stubApi(page);
  await seedRandom(page, 183); // the smoke test's deal: Hit makes 19, Stay, the dealer draws to 19 (a push)
  await login(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(section(page, 'Gameplay')).toContainText('Very fast'); // the loaded table shows: a save before it is refused
  await expect(section(page, 'Sound & haptics')).toContainText('Sound off · vibration off');

  await section(page, 'Sound & haptics').click();
  const volume = page.getByRole('slider', { name: 'Volume' });
  await expect(volume).toBeDisabled();
  await flip(page, 'Sound');
  await expect(volume).toBeEnabled();
  await volume.fill('70');
  await flip(page, 'Vibration');
  await expect(section(page, 'Sound & haptics')).toContainText('Sound on 70% · vibration on');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => api.saves.length).toBe(1);
  expect(api.saves[0]).toMatchObject({ v: 5, soundOn: true, soundVolume: 70, hapticsOn: true });
  await expect(page.getByRole('region', { name: 'Save bar' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await page.getByRole('button', { name: 'Hit', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stay', exact: true }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  const heard = await page.evaluate(() => window.__sound);
  expect(heard.contexts).toBe(1);
  expect(heard.started).toBeGreaterThan(0); // the chip, deal and flip sounds reached the (recorded) Web Audio
  expect(heard.buzzes).toEqual([]); // a push buzzes nothing
  expect(errors).toEqual([]);
});

test('with Sound and Vibration off (the default) a hand makes no audio and no buzz (#86)', async ({ page }) => {
  await page.addInitScript(() => {
    const log = { contexts: 0, buzzes: 0 };
    window.__sound = log;
    window.AudioContext = class { constructor() { log.contexts++; } };
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { log.buzzes++; return true; } });
  });
  await stubApi(page);
  await seedRandom(page, 183);
  await login(page);
  await placeBet(page);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await page.getByRole('button', { name: 'Hit', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stay', exact: true }).click({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Next hand' })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => window.__sound)).toEqual({ contexts: 0, buzzes: 0 });
});
