import { useState, useEffect, useRef, useCallback } from 'react';
import type { GtfsSqlJs, VehiclePosition } from 'gtfs-sqljs';

const REFRESH_INTERVAL = 10_000;

export function useRealtimeUpdater(gtfs: GtfsSqlJs | null) {
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [hasRealtime, setHasRealtime] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchAndUpdate = useCallback(async () => {
    if (!gtfs) return;
    const urls = gtfs.getRealtimeFeedUrls();
    if (urls.length === 0) {
      setHasRealtime(false);
      return;
    }
    setHasRealtime(true);
    try {
      await gtfs.fetchRealtimeData();
      const positions = gtfs.getVehiclePositions();
      setVehicles(positions);
      setLastUpdate(Date.now());
    } catch (err) {
      console.error('Realtime fetch error:', err);
      // Keep previous vehicles on transient errors
    }
  }, [gtfs]);

  useEffect(() => {
    if (!gtfs) {
      setVehicles([]);
      setLastUpdate(null);
      setHasRealtime(false);
      return;
    }

    fetchAndUpdate();
    intervalRef.current = setInterval(fetchAndUpdate, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [gtfs, fetchAndUpdate]);

  return { vehicles, lastUpdate, hasRealtime };
}
