#!/usr/bin/env bun
// Refreshes the bundled locality snapshot (local-intel + Anime Tourism 88) from the
// published copy. The source of truth is aniseekr-atlas/atlas/locality; edit there,
// let publish-locality upload it, then run this before a release so the bundle
// matches what the remote loader would download (equal versions → bundle is used).
//
//   bun run locality:sync                          # from https://atlas.aniseekr.moe/api/v1/locality
//   bun run locality:sync --file ../aniseekr-atlas/dist/locality.json

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const URL = 'https://atlas.aniseekr.moe/api/v1/locality';
const LOCAL_INTEL = resolve(ROOT, 'libs/services/pilgrimage/local-intel/local-intel.data.json');
const ANIME_88 = resolve(ROOT, 'libs/services/pilgrimage/anime-tourism-88.data.json');

const fileFlag = process.argv.indexOf('--file');
const raw =
  fileFlag > -1
    ? readFileSync(resolve(process.argv[fileFlag + 1]), 'utf8')
    : await fetch(URL).then((res) => {
        if (!res.ok) throw new Error(`${URL} → HTTP ${res.status}`);
        return res.text();
      });

const payload = JSON.parse(raw) as {
  format: number;
  commit: string;
  revisionAt: string;
  localIntel: unknown;
  animeTourism88: unknown;
};
if (payload.format !== 1) throw new Error(`unsupported locality format ${payload.format}`);
if (payload.commit.endsWith('-dirty')) {
  throw new Error('refusing a build of uncommitted atlas data — commit it in aniseekr-atlas first');
}

writeFileSync(LOCAL_INTEL, `${JSON.stringify(payload.localIntel, null, 2)}\n`);
writeFileSync(ANIME_88, `${JSON.stringify(payload.animeTourism88, null, 2)}\n`);
console.log(`[locality:sync] bundled atlas ${payload.commit} (data revision ${payload.revisionAt})`);
