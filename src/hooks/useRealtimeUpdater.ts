import { useState, useEffect, useRef, useCallback } from 'react';
import type { VehiclePosition } from 'gtfs-sqljs';
import type { GtfsWorkerClient } from '../worker/gtfs-client';

const REFRESH_INTERVAL = 10_000;

export function useRealtimeUpdater(client: GtfsWorkerClient | null) {
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [hasRealtime, setHasRealtime] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchAndUpdate = useCallback(async () => {
    if (!client) return;
    try {
      const urls = await client.getRealtimeFeedUrls();
      if (urls.length === 0) {
        setHasRealtime(false);
        return;
      }
      setHasRealtime(true);
      await client.fetchRealtimeData();
      const positions = await client.getVehiclePositions();
      setVehicles(positions);
      setLastUpdate(Date.now());
    } catch (err) {
      console.error('Realtime fetch error:', err);
    }
  }, [client]);

  useEffect(() => {
    if (!client) {
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
  }, [client, fetchAndUpdate]);

  return { vehicles, lastUpdate, hasRealtime };
}
