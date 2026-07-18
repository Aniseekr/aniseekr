import { hasSufficientRuntimeCoverage } from '../pilgrimage/anitabi-runtime-coverage';
import { localityRepository } from '../pilgrimage/locality/locality-repository';
import type { LocalityDataEnvelope } from '../pilgrimage/locality/types';
import type { NewsSource, NewsSourceFile } from './types';

interface SourceState {
  entries: NewsSource[];
  byId: Map<string, NewsSource>;
  recommendedIds: string[];
}

let overrideState: SourceState | null = null;
let canonicalCache: { snapshot: LocalityDataEnvelope; state: SourceState } | null = null;
let version = 0;
const listeners = new Set<() => void>();

localityRepository.subscribe(() => {
  if (overrideState) return;
  canonicalCache = null;
  version += 1;
  for (const listener of listeners) listener();
});

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
  if (overrideState) return overrideState;
  const snapshot = localityRepository.getSnapshot();
  if (canonicalCache?.snapshot === snapshot) return canonicalCache.state;
  const state = projectCanonicalNewsSources(snapshot);
  canonicalCache = { snapshot, state };
  return state;
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
  overrideState = candidate;
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
  overrideState = file ? normalize(file) : null;
  canonicalCache = null;
  version = 0;
  listeners.clear();
}

function projectCanonicalNewsSources(snapshot: LocalityDataEnvelope): SourceState {
  const entries: NewsSource[] = Object.values(snapshot.entities.newsSources).map((source) => ({
    id: source.id,
    name: source.name,
    feedUrl: source.feedUrl,
    homepageUrl: source.homepageUrl,
    category: source.category,
    language: source.language,
    format: source.format,
    recommended: source.recommended,
    frequency: source.frequency,
    verifiedAt: source.provenance[0].verifiedAt,
    ...(source.operationalNotes ? { notes: source.operationalNotes } : {}),
  }));
  return normalize({
    generatedAt: Date.parse(snapshot.generatedAt),
    source: 'canonical-locality-v1',
    count: entries.length,
    entries,
  });
}
