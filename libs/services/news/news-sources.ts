import { hasSufficientRuntimeCoverage } from '../pilgrimage/anitabi-runtime-coverage';
import type { NewsSource, NewsSourceFile } from './types';

interface SourceState {
  entries: NewsSource[];
  byId: Map<string, NewsSource>;
  recommendedIds: string[];
}

let STATE: SourceState | null = null;
let version = 0;
const listeners = new Set<() => void>();

function normalize(file: NewsSourceFile): SourceState {
  const seen = new Set<string>();
  const entries: NewsSource[] = [];
  for (const entry of Array.isArray(file.entries) ? file.entries : []) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.id !== 'string' || entry.id.length === 0) continue;
    if (typeof entry.feedUrl !== 'string' || entry.feedUrl.length === 0) continue;
    if (typeof entry.verifiedAt !== 'string' || entry.verifiedAt.length === 0) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return {
    entries,
    byId: new Map(entries.map((entry) => [entry.id, entry])),
    recommendedIds: entries.filter((entry) => entry.recommended).map((entry) => entry.id),
  };
}

function ensureBuilt(): SourceState {
  if (STATE) return STATE;
  const mod = require('./news-sources.data.json');
  STATE = normalize((mod?.default ?? mod) as NewsSourceFile);
  return STATE;
}

export function getAllNewsSources(): readonly NewsSource[] {
  return ensureBuilt().entries;
}

export function getNewsSource(id: string): NewsSource | null {
  return ensureBuilt().byId.get(id) ?? null;
}

export function getRecommendedSourceIds(): readonly string[] {
  return ensureBuilt().recommendedIds;
}

export function hydrateNewsSourcesFromRuntime(file: NewsSourceFile): void {
  if (!file || !Array.isArray(file.entries)) return;
  const current = ensureBuilt();
  const candidate = normalize(file);
  if (!hasSufficientRuntimeCoverage(current.entries.length, candidate.entries.length)) return;
  STATE = candidate;
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeNewsSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNewsSourcesVersion(): number {
  return version;
}

export function __resetNewsSourcesForTests(file?: NewsSourceFile): void {
  STATE = file ? normalize(file) : null;
  version = 0;
  listeners.clear();
}
