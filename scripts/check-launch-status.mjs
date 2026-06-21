import { execFileSync } from 'node:child_process';

const repo = 'ijnebzor/prepaired';
const requiredSecrets = [
  'CLOUDFLARE_API_TOKEN',
  'ANTHROPIC_API_KEY',
  'WHOP_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'FROM_EMAIL',
  'SESSION_SECRET',
  'ADMIN_SECRET',
];

const vendorSecrets = [
  'CLOUDFLARE_API_TOKEN',
  'ANTHROPIC_API_KEY',
  'WHOP_WEBHOOK_SECRET',
  'RESEND_API_KEY',
];

const checks = [];

function record(ok, label, detail = '') {
  checks.push({ ok, label, detail });
}

function print(ok, label, detail = '') {
  const prefix = ok ? 'PASS' : 'FAIL';
  console.log(`${prefix} ${label}${detail ? ` — ${detail}` : ''}`);
}

function ghSecretNames() {
  try {
    const out = execFileSync('gh', ['secret', 'list', '--repo', repo], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim()
      ? out.trim().split('\n').map(line => line.split(/\s+/)[0]).filter(Boolean)
      : [];
  } catch (error) {
    record(false, 'GitHub secrets could not be listed', error.stderr?.toString().trim() || error.message);
    return null;
  }
}

async function dns(name, type) {
  const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`);
  if (!response.ok) throw new Error(`${response.status} from dns.google`);
  return response.json();
}

function answers(record) {
  return Array.isArray(record.Answer) ? record.Answer.map(answer => String(answer.data)) : [];
}

async function checkUrl(label, url, predicate = () => true) {
  try {
    const response = await fetch(url, { redirect: 'follow' });
    const text = await response.text();
    record(response.ok && predicate(text), label, `${response.status} ${response.url}`);
  } catch (error) {
    record(false, label, error.message);
  }
}

const secrets = ghSecretNames();
if (secrets) {
  const present = new Set(secrets);
  for (const name of requiredSecrets) {
    record(present.has(name), `GitHub secret ${name}`, present.has(name) ? 'set' : 'missing');
  }

  const missingVendor = vendorSecrets.filter(name => !present.has(name));
  if (missingVendor.length) {
    record(false, 'Vendor credentials remaining', missingVendor.join(', '));
  } else {
    record(true, 'Vendor credentials remaining', 'none');
  }
}

try {
  const appCname = answers(await dns('prepaired.ijneb.dev', 'CNAME'));
  record(
    appCname.some(value => value.toLowerCase() === 'ijnebzor.github.io.'),
    'prepaired.ijneb.dev DNS',
    appCname.join(', ') || 'no CNAME answer'
  );
} catch (error) {
  record(false, 'prepaired.ijneb.dev DNS', error.message);
}

try {
  const apiAnswers = [
    ...answers(await dns('api.prepaired.ijneb.dev', 'A')),
    ...answers(await dns('api.prepaired.ijneb.dev', 'AAAA')),
    ...answers(await dns('api.prepaired.ijneb.dev', 'CNAME')),
  ];
  record(apiAnswers.length > 0, 'api.prepaired.ijneb.dev DNS', apiAnswers.join(', ') || 'no A, AAAA, or CNAME answer');
} catch (error) {
  record(false, 'api.prepaired.ijneb.dev DNS', error.message);
}

await checkUrl('GitHub Pages preview', 'https://ijnebzor.github.io/prepaired/', text => text.includes('PrepAIred'));

for (const check of checks) print(check.ok, check.label, check.detail);

const failed = checks.filter(check => !check.ok);
console.log('');
console.log(`${checks.length - failed.length} passed, ${failed.length} failed`);

if (failed.length) {
  console.log('');
  console.log('Next deploy gate: add missing vendor secrets, then run GitHub Actions > Deploy Worker > target=workers-dev.');
  process.exit(1);
}
