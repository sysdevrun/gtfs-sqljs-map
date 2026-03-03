import { useState, useCallback, useEffect } from 'react';
import type { Route } from 'gtfs-sqljs';
import { useHashState } from './hooks/useHashState';
import { useGtfs } from './hooks/useGtfs';
import NetworkSearch from './components/NetworkSearch';
import LoadingOverlay from './components/LoadingOverlay';
import MapView from './components/MapView';
import './App.css';

export interface NetworkSelection {
  id: string;
  title: string;
  gtfsUrl: string;
  gtfsRtUrls: string[];
}

export default function App() {
  const { networkId, setNetworkId } = useHashState();
  const [selection, setSelection] = useState<NetworkSelection | null>(null);
  const [routeMap, setRouteMap] = useState<Map<string, Route>>(new Map());

  const handleSelect = useCallback(
    (sel: NetworkSelection) => {
      setSelection(sel);
      setNetworkId(sel.id);
    },
    [setNetworkId],
  );

  const handleChangeNetwork = useCallback(() => {
    setSelection(null);
    setNetworkId(null);
    setRouteMap(new Map());
  }, [setNetworkId]);

  const { client, loading, progress, error } = useGtfs(selection);

  // Fetch routes asynchronously from the worker when client becomes available
  useEffect(() => {
    if (!client) {
      setRouteMap(new Map());
      return;
    }

    let cancelled = false;
    client.getRoutes().then((routes) => {
      if (cancelled) return;
      const map = new Map<string, Route>();
      for (const r of routes) {
        map.set(r.route_id, r);
      }
      setRouteMap(map);
    });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const isLanding = !networkId && !selection;

  return (
    <div className="app">
      {isLanding ? (
        <div className="landing">
          <NetworkSearch onSelect={handleSelect} mode="full" />
        </div>
      ) : (
        <>
          <MapView client={client} routeMap={routeMap} />
          <div className="floating-search">
            <NetworkSearch
              onSelect={handleSelect}
              mode="compact"
              currentTitle={selection?.title}
              onChangeNetwork={handleChangeNetwork}
            />
          </div>
          {loading && progress && (
            <LoadingOverlay
              networkName={selection?.title ?? 'network'}
              progress={progress}
            />
          )}
          {error && (
            <div className="error-banner">
              <span>Failed to load network: {error}</span>
              <button onClick={handleChangeNetwork}>Choose another</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
