import { useState, useEffect, useRef } from 'react';
import type { GtfsSqlJsOptions } from 'gtfs-sqljs';
import { GtfsSqlJs } from 'gtfs-sqljs';
import { IndexedDBCacheStore } from '../lib/cache-store';
import { buildProxyUrl } from '../lib/proxy';
import type { NetworkSelection } from '../App';

// ProgressInfo is not directly exported from gtfs-sqljs, extract from callback type
type ProgressCallback = NonNullable<GtfsSqlJsOptions['onProgress']>;
export type ProgressInfo = Parameters<ProgressCallback>[0];

interface UseGtfsResult {
  gtfs: GtfsSqlJs | null;
  loading: boolean;
  progress: ProgressInfo | null;
  error: string | null;
}

const cache = new IndexedDBCacheStore();

export function useGtfs(selection: NetworkSelection | null): UseGtfsResult {
  const [gtfs, setGtfs] = useState<GtfsSqlJs | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevSelectionId = useRef<string | null>(null);
  const gtfsRef = useRef<GtfsSqlJs | null>(null);

  useEffect(() => {
    if (!selection || selection.id === prevSelectionId.current) return;
    prevSelectionId.current = selection.id;

    let cancelled = false;

    // Close previous instance
    if (gtfsRef.current) {
      gtfsRef.current.close();
      gtfsRef.current = null;
      setGtfs(null);
    }

    setLoading(true);
    setError(null);
    setProgress(null);

    const proxyUrl = buildProxyUrl(selection.gtfsUrl);
    const rtUrls = selection.gtfsRtUrls.map(buildProxyUrl);

    GtfsSqlJs.fromZip(proxyUrl, {
      onProgress: (p) => {
        if (!cancelled) setProgress(p);
      },
      cache,
    })
      .then((instance) => {
        if (cancelled) {
          instance.close();
          return;
        }
        if (rtUrls.length > 0) {
          instance.setRealtimeFeedUrls(rtUrls);
        }
        gtfsRef.current = instance;
        setGtfs(instance);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gtfsRef.current) {
        gtfsRef.current.close();
      }
    };
  }, []);

  return { gtfs, loading, progress, error };
}
