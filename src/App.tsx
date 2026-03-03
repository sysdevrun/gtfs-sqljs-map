import { useState, useCallback, useMemo } from 'react';
import type { VehiclePosition, Route } from 'gtfs-sqljs';
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
  const [selectedVehicle, setSelectedVehicle] = useState<VehiclePosition | null>(null);

  const handleSelect = useCallback(
    (sel: NetworkSelection) => {
      setSelection(sel);
      setNetworkId(sel.id);
      setSelectedVehicle(null);
    },
    [setNetworkId],
  );

  const handleChangeNetwork = useCallback(() => {
    setSelection(null);
    setNetworkId(null);
    setSelectedVehicle(null);
  }, [setNetworkId]);

  const { gtfs, loading, progress, error } = useGtfs(selection);

  const routeMap = useMemo(() => {
    if (!gtfs) return new Map<string, Route>();
    const map = new Map<string, Route>();
    for (const r of gtfs.getRoutes()) {
      map.set(r.route_id, r);
    }
    return map;
  }, [gtfs]);

  const isLanding = !networkId && !selection;

  return (
    <div className="app">
      {isLanding ? (
        <div className="landing">
          <NetworkSearch onSelect={handleSelect} mode="full" />
        </div>
      ) : (
        <>
          <MapView
            gtfs={gtfs}
            selectedVehicle={selectedVehicle}
            onVehicleClick={setSelectedVehicle}
            routeMap={routeMap}
          />
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
