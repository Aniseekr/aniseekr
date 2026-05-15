import { StatsExhibitFrame } from '../../../../components/collection/stats/StatsExhibitFrame';
import { StatsOverview } from '../../../../components/collection/stats/StatsOverview';

export default function CollectionStatsScreen() {
  return (
    <StatsExhibitFrame title="Statistics">
      <StatsOverview showThresholdHighlight />
    </StatsExhibitFrame>
  );
}
