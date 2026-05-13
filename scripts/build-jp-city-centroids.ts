#!/usr/bin/env bun
// Geocode the Japanese cities cited by the Anime Tourism 88 dataset so the
// pilgrimage map can drop one gold pin per (anime × city) entry.
//
// We use Nominatim's free tier (https://nominatim.org/release-docs/develop/api/Search/)
// and ship the resulting table in-repo. This script is meant to be run once
// per edition refresh; the resulting JSON is what runtime code reads.
//
// Nominatim usage policy:
//   - identifying User-Agent (required)
//   - ≤1 request per second (we use 1100 ms to be safe)
//   - no bulk geocoding
//
// Why we built our own table instead of geocoding at runtime: the dataset is
// fixed (100 unique cities), Nominatim discourages mobile-app integrations,
// and offline lookup is instant.

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dir, '..');
const DATASET_PATH = resolve(
  ROOT,
  'libs/services/pilgrimage/anime-tourism-88.data.json'
);
const OUTPUT_PATH = resolve(
  ROOT,
  'libs/services/pilgrimage/jp-city-centroids.data.json'
);

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT =
  process.env.SCRAPE_USER_AGENT ??
  'aniseekr-expo/0.1 (https://github.com/kidneyweakx ; gm@solidarity.gg)';
const DELAY_MS = Number(process.env.NOMINATIM_DELAY_MS ?? '1100');

interface DatasetEntry {
  prefecture: string;
  city: string;
}

interface DatasetFile {
  entries: DatasetEntry[];
}

interface CityCentroid {
  prefecture: string;
  city: string;
  lat: number;
  lng: number;
  queryUsed: string;
  source: 'nominatim' | 'manual';
  displayName?: string;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
}

// Some city cells include a 大字 / 字 suffix in parentheses (e.g. むつ市（大湊）
// or さいたま市（岩槻）). Nominatim chokes on the JP brackets — strip them and
// query the parent municipality, which is what we want anyway for the pin.
function cityForQuery(city: string): string {
  return city.replace(/（[^）]*）$/, '').trim();
}

function buildQuery(prefecture: string, city: string): string {
  const cleaned = cityForQuery(city);
  if (!cleaned) return `${prefecture}, 日本`;
  return `${cleaned}, ${prefecture}, 日本`;
}

async function geocode(prefecture: string, city: string): Promise<CityCentroid | null> {
  const query = buildQuery(prefecture, city);
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=jp&accept-language=ja`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Nominatim ${res.status} for ${query}`);
  }
  const hits = (await res.json()) as NominatimHit[];
  if (hits.length === 0) {
    console.warn(`  no match: ${query}`);
    return null;
  }
  const top = hits[0];
  return {
    prefecture,
    city,
    lat: Number(top.lat),
    lng: Number(top.lon),
    queryUsed: query,
    source: 'nominatim',
    displayName: top.display_name,
  };
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const data = JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as DatasetFile;
  const pairs = new Map<string, { prefecture: string; city: string }>();
  for (const e of data.entries) {
    if (!e.prefecture || !e.city) continue;
    const key = `${e.prefecture}\t${e.city}`;
    if (!pairs.has(key)) pairs.set(key, { prefecture: e.prefecture, city: e.city });
  }
  const list = Array.from(pairs.values()).sort((a, b) =>
    `${a.prefecture}${a.city}`.localeCompare(`${b.prefecture}${b.city}`, 'ja')
  );
  console.log(
    `[city-centroids] geocoding ${list.length} unique (prefecture, city) pairs (delay=${DELAY_MS}ms)`
  );

  const out: CityCentroid[] = [];
  const failures: typeof list = [];

  for (let i = 0; i < list.length; i++) {
    const { prefecture, city } = list[i];
    process.stdout.write(`[${i + 1}/${list.length}] ${prefecture} ${city} ... `);
    try {
      const hit = await geocode(prefecture, city);
      if (hit) {
        out.push(hit);
        console.log(`(${hit.lat.toFixed(4)}, ${hit.lng.toFixed(4)})`);
      } else {
        failures.push({ prefecture, city });
        console.log('MISS');
      }
    } catch (err) {
      console.log(`ERR ${(err as Error).message}`);
      failures.push({ prefecture, city });
    }
    await delay(DELAY_MS);
  }

  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: NOMINATIM,
    count: out.length,
    entries: out,
    failures,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(
    `\n[city-centroids] wrote ${out.length}/${list.length} centroids to ${OUTPUT_PATH}`
  );
  if (failures.length) {
    console.log(`  failures (${failures.length}):`);
    for (const f of failures) console.log(`    ${f.prefecture} ${f.city}`);
  }
}

main().catch((err: unknown) => {
  console.error('[city-centroids] failed:', err);
  process.exit(1);
});
