import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import {
  getStreamSync,
  refreshStream,
  type NewsStreamSnapshot,
} from '../libs/services/news/news-stream';
import {
  getNewsSourcesVersion,
  subscribeNewsSources,
} from '../libs/services/news/news-sources';
import {
  getNewsFollowsVersion,
  subscribeNewsFollows,
} from '../libs/services/news/news-follows';

function subscribeNewsStore(listener: () => void): () => void {
  const unsubSources = subscribeNewsSources(listener);
  const unsubFollows = subscribeNewsFollows(listener);
  return () => {
    unsubSources();
    unsubFollows();
  };
}

// Fold BOTH the source-catalog and follow-set versions into one snapshot so a
// follow/unfollow re-derives the stream — otherwise the follows listener fires
// but the unchanged version makes useSyncExternalStore bail on the re-render.
// A composed string is a stable primitive: equal content is Object.is-equal.
function getNewsStoreVersion(): string {
  return `${getNewsSourcesVersion()}:${getNewsFollowsVersion()}`;
}

export function useNewsStream() {
  const version = useSyncExternalStore(
    subscribeNewsStore,
    getNewsStoreVersion,
    getNewsStoreVersion
  );
  const [snapshot, setSnapshot] = useState<NewsStreamSnapshot>(getStreamSync);
  const [loading, setLoading] = useState(() => snapshot.articles.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await refreshStream();
      setSnapshot(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('News refresh failed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh, version]);

  return { snapshot, loading, refreshing, error, refresh };
}
