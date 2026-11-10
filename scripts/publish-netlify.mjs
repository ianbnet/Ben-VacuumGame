// Publishes the game to Netlify. Only the files the page needs are sent:
// index.html, everything it loads, and the vendored three.js. No docs, tests or tools.
//
//   node scripts/publish-netlify.mjs --check          list what would ship (no network)
//   node scripts/publish-netlify.mjs --stage <dir>    copy exactly those files into <dir>
//   node scripts/publish-netlify.mjs --create         one time: make the site, save its id
//   node scripts/publish-netlify.mjs --draft          upload to a preview address only
//   node scripts/publish-netlify.mjs --publish        upload and make it the live site
//   node scripts/publish-netlify.mjs --verify <id>    re-check a deploy without uploading
//
// Credentials live in the git-ignored .env.netlify.local:
//   NETLIFY_AUTH_TOKEN=<a Netlify personal access token>
//   NETLIFY_SITE_ID=<written by --create>
// https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#file-digest-method
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteName = 'robot-vacuum-game';
const siteURL = `https://${siteName}.netlify.app`;
const envFile = path.join(root, '.env.netlify.local');
const MODES = ['--check', '--stage', '--create', '--draft', '--publish', '--verify', '--verify-draft'];
const mode = process.argv[2] ?? '--check';
assert(MODES.includes(mode), `Use one of: ${MODES.join(', ')}.`);
const isDraft = mode === '--draft' || mode === '--verify-draft';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha1 = bytes => createHash('sha1').update(bytes).digest('hex');

// ----- What ships -------------------------------------------------------------
// Start from git's tracked files, so an ignored or stray file can never be sent.
const tracked = new Set(git('ls-files').split('\n').filter(Boolean));
const VENDOR = 'vendor/three/';
const isLocal = ref => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref);
const clean = ref => path.posix.normalize(ref.split(/[?#]/)[0]);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pageRefs = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)].map(m => m[1]).filter(isLocal).map(clean);
const shipped = new Set(['index.html', ...pageRefs, ...[...tracked].filter(name => name.startsWith(VENDOR))]);

for (const name of shipped) {
  assert(!name.startsWith('..') && !path.isAbsolute(name), `Refusing a path outside the game: ${name}`);
  assert(tracked.has(name), `index.html needs ${name}, but git does not track it.`);
  assert(/^(?:index\.html|style\.css|[\w-]+\.js|vendor\/three\/[\w./-]+)$/.test(name), `Unexpected deploy file: ${name}`);
  const stat = fs.lstatSync(path.join(root, name));
  assert(stat.isFile() && !stat.isSymbolicLink(), `Only regular files may ship: ${name}`);
}

// The import map must point into the vendored copy, and every import a shipped
// file makes must land on another shipped file. Otherwise the live page 404s.
const importMap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] ?? '{"imports":{}}').imports;
function resolveImport(spec, from) {
  if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  if (!isLocal(spec)) return null;
  const key = Object.keys(importMap).filter(k => spec === k || (k.endsWith('/') && spec.startsWith(k))).sort((a, b) => b.length - a.length)[0];
  assert(key, `${from} imports "${spec}", which the import map in index.html does not cover.`);
  return path.posix.normalize(importMap[key] + spec.slice(key.length));
}
for (const name of [...shipped].filter(n => n.endsWith('.js'))) {
  const code = fs.readFileSync(path.join(root, name), 'utf8');
  for (const m of code.matchAll(/^\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)) {
    const target = resolveImport(m[1] ?? m[2], name);
    if (target !== null) assert(shipped.has(target), `${name} imports ${target}, which would not ship.`);
  }
}

const files = {};
let bytes = 0;
for (const name of [...shipped].sort()) {
  const body = fs.readFileSync(path.join(root, name));
  files['/' + name] = sha1(body);
  bytes += body.length;
}
const lower = Object.keys(files).map(name => name.toLowerCase());
assert.equal(new Set(lower).size, lower.length, 'Two files differ only by letter case; Netlify would merge them.');

const source = git('rev-parse', 'HEAD');
console.log(JSON.stringify({ preflight: 'passed', site: siteURL, source, count: lower.length, bytes, files }, null, 2));
if (mode === '--check') process.exit(0);

if (mode === '--stage') {
  const out = path.resolve(process.argv[3] ?? path.join(root, '.netlify/stage'));
  assert(out !== root && !root.startsWith(out + path.sep), 'Stage into a folder of its own.');
  fs.rmSync(out, { recursive: true, force: true });
  for (const name of Object.keys(files)) {
    const to = path.join(out, name.slice(1));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(root, name.slice(1)), to);
  }
  console.log(`Staged ${lower.length} files in ${out}`);
  process.exit(0);
}

// ----- Netlify ----------------------------------------------------------------
assert(fs.existsSync(envFile), 'Missing .env.netlify.local. Put NETLIFY_AUTH_TOKEN=<token> in it first.');
process.loadEnvFile(envFile);
const token = process.env.NETLIFY_AUTH_TOKEN;
let siteId = process.env.NETLIFY_SITE_ID;
assert(token, 'Missing NETLIFY_AUTH_TOKEN in .env.netlify.local.');

async function api(endpoint, options = {}) {
  const response = await fetch('https://api.netlify.com/api/v1' + endpoint, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'StaticGameRelease', ...options.headers },
  });
  // Never print raw account responses or credentials on an error.
  if (!response.ok) {
    const hint = response.status === 401 ? ' (Netlify rejected the token; it may have expired. Make a new one.)'
      : response.status === 422 ? ' (Netlify refused the request; the site name may be taken.)' : '';
    throw new Error(`Netlify ${options.method ?? 'GET'} ${endpoint}: HTTP ${response.status}${hint}`);
  }
  return response.json();
}

if (mode === '--create') {
  assert(!siteId, 'NETLIFY_SITE_ID is already set, so the site already exists.');
  const mine = (await api(`/sites?name=${encodeURIComponent(siteName)}&per_page=100`)).filter(site => site.name === siteName);
  let site = mine[0];
  if (site) console.log(`Found your existing site ${siteName}; using it.`);
  else {
    // NETLIFY_ACCOUNT_SLUG picks a team; without it Netlify uses your default team.
    const team = process.env.NETLIFY_ACCOUNT_SLUG;
    site = await api(team ? `/${encodeURIComponent(team)}/sites` : '/sites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: siteName }),
    });
    console.log(`Created ${siteName} in team ${site.account_slug}.`);
  }
  assert.equal(site.name, siteName);
  const current = fs.readFileSync(envFile, 'utf8');
  fs.writeFileSync(envFile, current + (current.endsWith('\n') ? '' : '\n') + `NETLIFY_SITE_ID=${site.id}\n`, { mode: 0o600 });
  console.log(`Saved the site id in .env.netlify.local. Nothing is live yet; run --publish.`);
  process.exit(0);
}

assert(siteId, 'Missing NETLIFY_SITE_ID. Run --create once first.');
const before = await api(`/sites/${siteId}`);
assert.equal(before.name, siteName, 'Wrong Netlify site; refusing to publish.');
let deployId = process.argv[3];
if (mode === '--publish' || mode === '--draft') {
  // The live site should always be a commit, so it can be traced and rebuilt.
  assert.equal(git('status', '--porcelain'), '', 'Commit the tested source before publishing.');
  const created = await api(`/sites/${siteId}/deploys`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, draft: isDraft, title: `Vacuum game ${source.slice(0, 7)}` }),
  });
  deployId = created.id;
  console.log(`Created deploy ${deployId}; previous published deploy ${before.published_deploy?.id ?? 'none'}`);
  for (const hash of created.required ?? []) {
    const name = Object.keys(files).find(key => files[key] === hash);
    assert(name, 'Netlify requested an unknown digest.');
    await api(`/deploys/${deployId}/files${name.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' },
      body: fs.readFileSync(path.join(root, name.slice(1))),
    });
  }
}
assert(/^[a-f\d]{24}$/.test(deployId ?? ''), 'Expected a Netlify deploy id.');
let deploy;
for (let attempt = 0; attempt < 30; attempt++) {
  deploy = await api(`/deploys/${deployId}`);
  assert.equal(deploy.site_id, siteId);
  if (deploy.state === 'ready') break;
  assert(!['error', 'failed'].includes(deploy.state), 'Netlify rejected the deploy.');
  await new Promise(resolve => setTimeout(resolve, 2000));
}
assert.equal(deploy.state, 'ready', `Deploy ${deployId} is not ready; verify it later, do not blindly redeploy.`);
const published = await api(`/sites/${siteId}`);
if (!isDraft) assert.equal(published.published_deploy?.id, deployId, 'Uploaded build is not the published site.');
else assert.equal(published.published_deploy?.id, before.published_deploy?.id, 'Draft unexpectedly changed the live site.');

// ----- Prove what is being served ---------------------------------------------
const verifyURL = isDraft ? `https://${deployId}--${siteName}.netlify.app` : siteURL;
const remoteFiles = await api(`/deploys/${deployId}/files`);
const remoteDigests = Object.fromEntries(remoteFiles.map(file => ['/' + file.path.replace(/^\//, '').toLowerCase(), file.sha]));
assert.deepEqual(remoteDigests, Object.fromEntries(Object.entries(files).map(([name, hash]) => [name.toLowerCase(), hash])), 'Published files differ from the local build.');
const served = {};
for (const name of ['/', ...Object.keys(files)]) {
  const response = await fetch(verifyURL + name, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  served[name] = response.status;
  // A new site inherits the team's visitor-access setting, which can be "team login".
  assert.notEqual(response.status, 401, `${verifyURL} answers 401: visitor access protection is on for this site `
    + '(Netlify: Project configuration, Access & security). The upload itself matched; open the site to visitors, then run --verify.');
  assert.equal(response.status, 200, `Not served: ${name}`);
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(sha1(body), files[name === '/' ? '/index.html' : name], `Served bytes differ for ${name}`);
  const type = response.headers.get('content-type') ?? '';
  // Browsers refuse a module script that is not served as JavaScript.
  if (name.endsWith('.js')) assert(type.includes('javascript'), `${name} is served as ${type}`);
  if (name === '/') assert(type.includes('text/html'), `The page is served as ${type}`);
}
const pushed = git('branch', '-r', '--contains', source) !== '';
const receipt = { siteURL: verifyURL, source, pushed, deployId, draft: isDraft,
  publishedAt: isDraft ? null : published.published_deploy?.published_at ?? deploy.published_at,
  previousDeploy: mode === '--publish' ? before.published_deploy?.id ?? null : null, count: lower.length, bytes, files, served };
const receiptDir = path.join(root, '.netlify/deploys');
fs.mkdirSync(receiptDir, { recursive: true });
const receiptPath = path.join(receiptDir, `${deployId}-${Date.now()}.json`);
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ ...receipt, files: undefined, served: undefined, receiptPath }, null, 2));
