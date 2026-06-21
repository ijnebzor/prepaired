const appHost = 'prepaired.ijneb.dev';
const apiHost = 'api.prepaired.ijneb.dev';
const previewUrl = 'https://ijnebzor.github.io/prepaired/';
const appUrl = `https://${appHost}/`;
const apiUrl = `https://${apiHost}`;

const whopLinks = [
  'https://whop.com/joined/prepaired/products/1-credit-1-interview/',
  'https://whop.com/joined/prepaired/products/5-credits-5-interviews/',
  'https://whop.com/joined/prepaired/products/15-credits-15-interviews/',
];

const results = [];

function pass(label, detail = '') {
  results.push({ ok: true, label, detail });
}

function fail(label, detail = '') {
  results.push({ ok: false, label, detail });
}

function warn(label, detail = '') {
  results.push({ ok: true, warn: true, label, detail });
}

async function dns(name, type) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}

function answers(record) {
  return Array.isArray(record.Answer) ? record.Answer.map(answer => String(answer.data)) : [];
}

async function checkDns() {
  const ns = answers(await dns('ijneb.dev', 'NS')).map(value => value.toLowerCase());
  if (ns.some(value => value.includes('cloudflare.com'))) {
    pass('ijneb.dev is using Cloudflare nameservers', ns.join(', '));
  } else {
    fail(
      'ijneb.dev is not using Cloudflare nameservers',
      'Cloudflare Worker custom domains require an active Cloudflare zone. Current NS: ' + (ns.join(', ') || 'none')
    );
  }

  const appCname = answers(await dns(appHost, 'CNAME'));
  if (appCname.some(value => value.toLowerCase() === 'ijnebzor.github.io.')) {
    pass(`${appHost} CNAME points at GitHub Pages`, appCname.join(', '));
  } else {
    fail(`${appHost} CNAME missing`, appCname.join(', ') || 'no CNAME answer');
  }

  const apiRecords = [
    ...answers(await dns(apiHost, 'A')),
    ...answers(await dns(apiHost, 'AAAA')),
    ...answers(await dns(apiHost, 'CNAME')),
  ];
  if (apiRecords.length) {
    pass(`${apiHost} resolves`, apiRecords.join(', '));
  } else {
    fail(`${apiHost} does not resolve`, 'no A, AAAA, or CNAME answer');
  }
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  return { response, text: await response.text() };
}

async function checkStaticSite() {
  const preview = await fetchText(previewUrl);
  if (preview.response.ok && preview.text.includes('PrepAIred')) {
    pass('GitHub Pages preview is reachable', `${preview.response.status} ${previewUrl}`);
  } else {
    fail('GitHub Pages preview is not serving the app', `${preview.response.status} ${previewUrl}`);
  }

  try {
    const app = await fetchText(appUrl);
    if (app.response.ok && app.text.includes('PrepAIred')) {
      pass('Custom app domain is serving the app', `${app.response.status} ${appUrl}`);
    } else {
      fail('Custom app domain is not serving the app', `${app.response.status} ${appUrl}`);
    }
  } catch (error) {
    fail('Custom app domain is not reachable', error.message);
  }
}

async function checkApi() {
  try {
    const health = await fetchText(`${apiUrl}/health`);
    if (health.response.ok && health.text.trim() === '{"status":"ok","version":"2.0.0"}') {
      pass('API health check passed', health.text.trim());
    } else {
      fail('API health check failed', `${health.response.status} ${health.text.slice(0, 120)}`);
    }
  } catch (error) {
    fail('API health check is not reachable', error.message);
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/auth/request-otp`, {
      method: 'OPTIONS',
      headers: {
        Origin: appUrl.slice(0, -1),
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    const allowOrigin = response.headers.get('access-control-allow-origin');
    if (response.ok && allowOrigin === appUrl.slice(0, -1)) {
      pass('API CORS preflight passed', allowOrigin);
    } else {
      fail('API CORS preflight failed', `${response.status} allow-origin=${allowOrigin || 'missing'}`);
    }
  } catch (error) {
    fail('API CORS preflight is not reachable', error.message);
  }
}

async function checkWhop() {
  for (const link of whopLinks) {
    try {
      const response = await fetch(link, { redirect: 'follow' });
      if (response.ok) pass('Whop product URL is reachable', `${response.status} ${link}`);
      else fail('Whop product URL failed', `${response.status} ${link}`);
    } catch (error) {
      fail('Whop product URL is not reachable', `${link}: ${error.message}`);
    }
  }
}

for (const [label, check] of [
  ['DNS checks', checkDns],
  ['Static site checks', checkStaticSite],
  ['API checks', checkApi],
  ['Whop checks', checkWhop],
]) {
  try {
    await check();
  } catch (error) {
    fail(label, error.message);
  }
}

for (const result of results) {
  const prefix = result.warn ? 'WARN' : result.ok ? 'PASS' : 'FAIL';
  console.log(`${prefix} ${result.label}${result.detail ? ` — ${result.detail}` : ''}`);
}

const failed = results.filter(result => !result.ok);
const warned = results.filter(result => result.warn);

console.log('');
console.log(`${results.length - failed.length - warned.length} passed, ${warned.length} warnings, ${failed.length} failed`);

if (failed.length) process.exit(1);
