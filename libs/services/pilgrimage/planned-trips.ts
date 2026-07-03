// Derive the plan page's trip list from persisted spot intents. Pure so the
// screen stays a thin shell (Rule 9) and grouping is unit-tested. A planned
// point carries a meta snapshot (Task: spot-intents v2) with the anime it
// belongs to plus its own geo/image, so this works fully offline. v1-migrated
// planned points have no meta → we surface them honestly as "uncategorized"
// (Rule 8: we don't know where they are; re-toggling backfills the snapshot).

import type { SpotIntentMap } from './spot-intents';

export interface PlannedSpot {
  id: string;
  geo: [number, number];
  image: string;
}

export interface PlannedTripGroup {
  animeId: number;
  name: string;
  cn?: string;
  spots: PlannedSpot[];
}

export interface PlannedTrips {
  groups: PlannedTripGroup[];
  uncategorized: string[];
}

export function groupPlannedIntents(map: SpotIntentMap): PlannedTrips {
  const byAnime = new Map<number, PlannedTripGroup>();
  const uncategorized: string[] = [];

  for (const [id, intent] of Object.entries(map)) {
    if (intent.planned !== true) continue;
    const meta = intent.meta;
    if (!meta) {
      uncategorized.push(id);
      continue;
    }
    let group = byAnime.get(meta.animeId);
    if (!group) {
      group = { animeId: meta.animeId, name: meta.name, ...(meta.cn ? { cn: meta.cn } : {}), spots: [] };
      byAnime.set(meta.animeId, group);
    }
    group.spots.push({ id, geo: meta.geo, image: meta.image });
  }

  const groups = Array.from(byAnime.values());
  for (const g of groups) g.spots.sort((a, b) => a.id.localeCompare(b.id));
  groups.sort((a, b) => b.spots.length - a.spots.length || a.name.localeCompare(b.name));
  uncategorized.sort();

  return { groups, uncategorized };
}
