#!/usr/bin/env node
// Copy the watercolor engine from Blooms into vendor/blooms/.
//
// Level six paints its floor with Blooms' own watercolor: the same shaders,
// pigments and brush, unchanged. This script takes those files from a commit
// of the Blooms repo, so the copy here can always be traced and refreshed.
//
//   node scripts/vendor-blooms.mjs            # from ~/code/blooms at its HEAD
//   BLOOMS_DIR=/path node scripts/vendor-blooms.mjs
//
// Only committed files are copied. Nothing in vendor/blooms/ is edited by hand:
// the game tunes the paint from watercolor.js instead.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.env.BLOOMS_DIR ?? path.join(os.homedir(), 'code', 'blooms');
const out = path.join(root, 'vendor', 'blooms');
const git = (...args) => execFileSync('git', ['-C', src, ...args], { encoding: 'utf8' });

if (!fs.existsSync(path.join(src, 'src', 'themes', 'watercolor', 'index.js'))) {
  console.error(`Blooms was not found at ${src}.`);
  process.exit(1);
}

const commit = git('rev-parse', '--short', 'HEAD').trim();
const date = git('log', '-1', '--format=%cs').trim();
const wanted = git('ls-tree', '-r', '--name-only', 'HEAD', 'src/gl.js', 'src/themes/watercolor')
  .split('\n').filter((name) => name.endsWith('.js'));
if (wanted.length < 8) {
  console.error(`Expected the engine's files in ${src}; found only ${wanted.length}.`);
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
for (const name of wanted) {
  const to = path.join(out, name.replace(/^src\//, ''));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, execFileSync('git', ['-C', src, 'show', `HEAD:${name}`]));
}
fs.writeFileSync(path.join(out, 'SOURCE.md'), [
  '# Blooms watercolor engine',
  '',
  `Copied from the Blooms repo at commit \`${commit}\` (${date}) by \`scripts/vendor-blooms.mjs\`.`,
  '',
  'These files are unchanged copies. Do not edit them here: change Blooms and run the',
  'script again, or tune the paint for the game in `watercolor.js`.',
  '',
  ...wanted.map((name) => `- \`${name.replace(/^src\//, '')}\``),
  '',
].join('\n'));
console.log(`Copied ${wanted.length} files from Blooms ${commit} into vendor/blooms/`);
