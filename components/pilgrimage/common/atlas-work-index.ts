import type { AtlasWork, AtlasWorkIndex } from '../../../libs/services/pilgrimage/atlas/types';
import snapshot from '../../../libs/services/pilgrimage/atlas/works.snapshot.json';

const atlasWorks = (snapshot as AtlasWorkIndex).works;

export function getAtlasWorkByBangumiId(bangumiId: number): AtlasWork | null {
  return atlasWorks.find((work) => (work.bgm ?? []).includes(bangumiId)) ?? null;
}
