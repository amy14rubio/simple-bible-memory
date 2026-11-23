#!/usr/bin/env node
/**
 * The maintainer's private files: things the app and the website need to be built in full, but that are not in git because they are not ours to
 * republish (the three phone photos on the landing page show licensed Bible text; the translation list and the language names come from the
 * YouVersion API). They live in one folder outside the repository and this script puts them back.
 *
 *   node scripts/restore-private-files.mjs           copy back whatever is missing from the repo (never overwrites a file)
 *   node scripts/restore-private-files.mjs --save    copy the repo's current files into the private folder (after you make new ones)
 *   --quiet                                          say nothing unless something was copied (used by the git hooks)
 *
 * The private folder is ~/sbm-private-files, or whatever SBM_PRIVATE_DIR says. Inside it the files sit at the same paths as in the repo.
 * A copy of the repository without that folder simply does nothing, so contributors are not affected.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = process.env.SBM_PRIVATE_DIR ?? path.join(homedir(), 'sbm-private-files');
/** What is kept privately, as paths from the repository's root: a file, or a folder (everything directly inside it). */
const ITEMS = ['public/landing/note', 'src/domain/bible/catalogue.json', 'src/domain/bible/languageNames.json'];

const save = process.argv.includes('--save');
const quiet = process.argv.includes('--quiet');
const say = (m) => { if (!quiet) console.log(m); };

/** Every file under `rel` (relative to `base`), as paths relative to `base`. */
function files(base, rel) {
  const full = path.join(base, rel);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [rel];
  return readdirSync(full).filter((n) => !n.startsWith('.')).flatMap((n) => files(base, path.join(rel, n)));
}

const [from, to] = save ? [ROOT, PRIVATE] : [PRIVATE, ROOT];
if (!save && !existsSync(PRIVATE)) { say(`No private folder at ${PRIVATE}: nothing to restore.`); process.exit(0); }
let copied = 0;
for (const item of ITEMS) {
  for (const rel of files(from, item)) {
    const dest = path.join(to, rel);
    if (!save && existsSync(dest)) continue; // restoring never overwrites
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(path.join(from, rel), dest);
    copied++;
    console.log(`${save ? 'saved' : 'restored'} ${rel}`);
  }
}
say(copied ? `${copied} file${copied === 1 ? '' : 's'} ${save ? 'saved to' : 'restored from'} ${PRIVATE}.` : `Nothing to ${save ? 'save' : 'restore'}: everything is already in place.`);
