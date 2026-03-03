import { useState, useEffect, useRef } from 'react';
import { GtfsWorkerClient } from '../worker/gtfs-client';
import type { ProgressInfo } from '../worker/gtfs-client';
import { buildProxyUrl } from '../lib/proxy';
import type { NetworkSelection } from '../App';
// Vite resolves this to a hashed URL under /assets/ at build time,
// respecting the configured `base` path for GitHub Pages.
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export type { ProgressInfo };

interface UseGtfsResult {
  client: GtfsWorkerClient | null;
  loading: boolean;
  progress: ProgressInfo | null;
  error: string | null;
}

export function useGtfs(selection: NetworkSelection | null): UseGtfsResult {
  const [client, setClient] = useState<GtfsWorkerClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevSelectionId = useRef<string | null>(null);
  const clientRef = useRef<GtfsWorkerClient | null>(null);

  useEffect(() => {
    if (!selection || selection.id === prevSelectionId.current) return;
    prevSelectionId.current = selection.id;

    let cancelled = false;

    // Terminate previous worker client
    if (clientRef.current) {
      clientRef.current.terminate();
      clientRef.current = null;
      setClient(null);
    }

    setLoading(true);
    setError(null);
    setProgress(null);

    const proxyUrl = buildProxyUrl(selection.gtfsUrl);
    const rtUrls = selection.gtfsRtUrls.map(buildProxyUrl);

    // Create a new web worker and client
    const worker = new Worker(
      new URL('../worker/gtfs.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const workerClient = new GtfsWorkerClient(worker, sqlWasmUrl);

    workerClient.setProgressCallback((p) => {
      if (!cancelled) setProgress(p);
    });

    workerClient
      .load(proxyUrl, rtUrls)
      .then(() => {
        if (cancelled) {
          workerClient.terminate();
          return;
        }
        clientRef.current = workerClient;
        setClient(workerClient);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) {
          workerClient.terminate();
          return;
        }
        setError(String(err));
        setLoading(false);
        workerClient.terminate();
      });

    return () => {
      cancelled = true;
    };
  }, [selection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.terminate();
      }
    };
  }, []);

  return { client, loading, progress, error };
}
