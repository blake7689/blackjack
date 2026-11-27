// @vitest-environment node
// Guards the shipped files of the app polish (#87): the web app manifest and its icons, the WebP card faces, the Static Web Apps routing config,
// and the brand word. Node-side checks of files on disk, so it lives in scripts/ (outside coverage), like the install-script test.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const path = (...parts) => join(root, ...parts);
const read = (...parts) => readFileSync(path(...parts), 'utf8');
const json = (...parts) => JSON.parse(read(...parts));

describe('the web app manifest', () => {
  const manifest = json('public', 'manifest.webmanifest');

  it('parses, and names the app Blakejack in name and short_name', () => {
    expect(manifest.name).toBe('Blakejack');
    expect(manifest.short_name).toBe('Blakejack');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('lists a 192 and a 512 icon and a maskable one, each a real PNG of its declared size', () => {
    const sizes = manifest.icons.map((icon) => `${icon.sizes}/${icon.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']));
    for (const icon of manifest.icons) {
      const file = path('public', icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const png = readFileSync(file);
      expect(png.subarray(1, 4).toString(), icon.src).toBe('PNG');
      const [w, h] = icon.sizes.split('x').map(Number);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], icon.src).toEqual([w, h]);
      expect(icon.type).toBe('image/png');
    }
  });

  it('is linked from index.html, with the apple touch icon, the SVG favicon and the Blakejack title; no Vite leftovers', () => {
    const html = read('index.html');
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
    const touch = html.match(/<link rel="apple-touch-icon" href="([^"]+)"/);
    expect(touch, 'apple-touch-icon link').not.toBeNull();
    expect(existsSync(path('public', touch[1]))).toBe(true);
    expect(readFileSync(path('public', touch[1])).readUInt32BE(16)).toBe(180);
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
    expect(existsSync(path('public', 'favicon.svg'))).toBe(true);
    expect(html).toMatch(/<title>Blakejack<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{20,}"/);
    expect(existsSync(path('public', 'vite.svg'))).toBe(false);
    expect(existsSync(path('src', 'assets', 'react.svg'))).toBe(false);
  });
});

describe('the card faces', () => {
  const dir = path('public', 'cards');
  const ranks = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
  const suits = ['clubs', 'diamonds', 'hearts', 'spades'];

  it('are all 52 .webp files, and no .png (nor the old back.png) is left', () => {
    const files = readdirSync(dir).sort();
    expect(files).toEqual(ranks.flatMap((rank) => suits.map((suit) => `${rank}_of_${suit}.webp`)).sort());
    expect(files).toHaveLength(52);
    expect(files.some((name) => name.endsWith('.png') || name === 'back.png')).toBe(false);
  });

  it('are real WebP images, 360 px wide (#169: the largest card is 156 css px, 312 at 2x), far lighter than the 4.7 MB of PNGs', () => {
    let bytes = 0;
    for (const name of readdirSync(dir)) {
      const data = readFileSync(join(dir, name));
      expect([data.subarray(0, 4).toString(), data.subarray(8, 12).toString()], name).toEqual(['RIFF', 'WEBP']);
      expect(data.subarray(12, 16).toString(), name).toBe('VP8X'); // dimensions: 24-bit width - 1, height - 1
      expect(1 + data.readUIntLE(24, 3), name).toBe(360);
      expect(1 + data.readUIntLE(27, 3), name).toBe(523); // keeps the 500 x 726 aspect ratio
      bytes += data.length;
    }
    expect(bytes).toBeLessThan(800 * 1024);
  });

  it('are the only card files the code asks for: no .png card path in src', () => {
    const offenders = [];
    for (const file of walk(path('src'))) {
      if (/\.(jsx?|css)$/.test(file) && /\/cards\/[^'"`)\s]*\.png/.test(readFileSync(file, 'utf8'))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe('staticwebapp.config.json', () => {
  const config = json('staticwebapp.config.json');

  it('is valid JSON that keeps the SPA fallback and excludes the built assets', () => {
    expect(config.navigationFallback.rewrite).toBe('/index.html');
    expect(config.navigationFallback.exclude).toContain('/assets/*');
  });

  it('excludes /sounds/*, /fonts/* and /icons/* from the fallback, so a missing file is a 404', () => {
    expect(config.navigationFallback.exclude).toEqual(expect.arrayContaining(['/sounds/*', '/fonts/*', '/icons/*']));
  });

  it('has no 404 responseOverride (it would serve index.html for a missing file)', () => {
    expect(config.responseOverrides?.['404']).toBeUndefined();
    expect(JSON.stringify(config)).not.toMatch(/"404"/);
  });

  it('serves .webmanifest as application/manifest+json and .json as application/json', () => {
    expect(config.mimeTypes['.webmanifest']).toBe('application/manifest+json');
    expect(config.mimeTypes['.json']).toBe('application/json');
  });

  it('sends no CORS headers (the API sets its own; an Allow-Origin on the site does nothing useful)', () => {
    expect(Object.keys(config.globalHeaders).filter((name) => name.startsWith('Access-Control-'))).toEqual([]);
  });

  it('sends the security headers: nosniff, a referrer policy and a CSP that allows only itself and the API', () => {
    const headers = config.globalHeaders;
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    const csp = Object.fromEntries(headers['Content-Security-Policy'].split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['script-src']).toEqual(["'self'"]); // no inline script, no eval
    expect(csp['connect-src']).toEqual(["'self'", 'https://blackjack-api-blake.azurewebsites.net']);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    for (const name of ['base-uri', 'form-action', 'font-src', 'manifest-src']) expect(csp[name], name).toEqual(["'self'"]);
  });

  it('keeps robots.txt out of the SPA fallback, and the file allows crawling', () => {
    expect(config.navigationFallback.exclude).toContain('/robots.txt');
    expect(read('public', 'robots.txt')).toMatch(/^User-agent: \*\r?\nAllow: \/\s*$/);
  });
});

// The brand word is "Blakejack" (the app's name); the hand is "blackjack". The wrong-cased form must not be left anywhere in what ships or tests it.
describe('the brand word', () => {
  const wrong = ['Blake', 'Jack'].join(''); // built from parts, so this file does not contain it
  const textFiles = (dir) => walk(dir).filter((file) => /\.(jsx?|css|html|json|md|svg|webmanifest|txt)$/.test(file));

  it.each(['src', 'e2e', 'e2e-live', 'public'])('is never spelled the wrong way in %s', (dir) => {
    const offenders = textFiles(path(dir)).filter((file) => readFileSync(file, 'utf8').includes(wrong));
    expect(offenders).toEqual([]);
  });

  it('is never spelled the wrong way in index.html, the manifest or the SWA config', () => {
    for (const file of ['index.html', 'public/manifest.webmanifest', 'staticwebapp.config.json']) {
      expect(read(...file.split('/')).includes(wrong), file).toBe(false);
    }
  });
});

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}
