import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(path) {
  return fs.readFileSync(join(root, path), 'utf8');
}

function includes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label} missing: ${needle}`);
}

const whopLinks = [
  'https://whop.com/joined/prepaired/products/1-credit-1-interview/',
  'https://whop.com/joined/prepaired/products/5-credits-5-interviews/',
  'https://whop.com/joined/prepaired/products/15-credits-15-interviews/',
];

const html = read('index.html');
const inlineScripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .join('\n');

new Function(inlineScripts);

includes(html, '<link rel="canonical" href="https://prepaired.ijneb.dev/">', 'canonical URL');
includes(html, '<link rel="icon" href="assets/prepaired-icon.svg" type="image/svg+xml">', 'favicon');
includes(html, '<img src="assets/prepaired-icon.svg"', 'nav logo');
includes(html, "var WORKER_URL = 'https://api.prepaired.ijneb.dev';", 'Worker URL');
includes(html, 'mailto:benjiz@gmail.com', 'support mailto');
includes(html, 'benji@ijneb.dev', 'visible support email');

for (const link of whopLinks) includes(html, link, 'index Whop link');

assert.equal(read('CNAME').trim(), 'prepaired.ijneb.dev');

for (const file of ['assets/prepaired-icon.svg', 'assets/prepaired-logo.svg']) {
  const svg = read(file);
  assert.match(svg, /<svg\b[^>]*>/, `${file} should contain an svg root`);
  assert.match(svg, /<\/svg>\s*$/, `${file} should close the svg root`);
}

for (const doc of ['README.md', 'LAUNCH.md']) {
  const text = read(doc);
  for (const link of whopLinks) includes(text, link, `${doc} Whop link`);
}

for (const doc of ['README.md', 'SECURITY.md']) {
  includes(read(doc), '[benji@ijneb.dev](mailto:benjiz@gmail.com)', `${doc} support link`);
}

const launch = read('LAUNCH.md');
includes(launch, 'Forward to: `benjiz@gmail.com`', 'Mailgun forwarding target');
includes(launch, 'Use `prepaired@ijneb.dev` for `FROM_EMAIL`.', 'Resend sender');

console.log('launch checks passed');
