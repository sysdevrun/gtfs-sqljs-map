import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { VehiclePosition, Route } from 'gtfs-sqljs';
import type { GtfsWorkerClient } from '../worker/gtfs-client';
import { useRealtimeUpdater } from '../hooks/useRealtimeUpdater';
import VehiclePopup from './VehiclePopup';
import './MapView.css';

interface Props {
  client: GtfsWorkerClient | null;
  routeMap: Map<string, Route>;
  selectedVehicle: VehiclePosition | null;
  onVehicleClick: (v: VehiclePosition | null) => void;
}

function vehiclesToGeojson(
  vehicles: VehiclePosition[],
  routeMap: Map<string, Route>,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: vehicles
      .filter((v) => v.position)
      .map((v) => {
        const route = v.route_id ? routeMap.get(v.route_id) : null;
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [v.position!.longitude, v.position!.latitude],
          },
          properties: {
            trip_id: v.trip_id,
            route_id: v.route_id ?? '',
            route_short_name: route?.route_short_name ?? '',
            route_color: route?.route_color ?? '667eea',
            route_text_color: route?.route_text_color ?? 'ffffff',
            bearing: v.position!.bearing ?? 0,
          },
        };
      }),
  };
}

export default function MapView({ client, routeMap, selectedVehicle, onVehicleClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const shapesAddedRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const { vehicles, hasRealtime, lastUpdate } = useRealtimeUpdater(client);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm',
          },
        ],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      },
      center: [2.35, 46.6],
      zoom: 6,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Add route shapes when GTFS loads (async via worker)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !client) return;

    let cancelled = false;

    const addShapes = async () => {
      // Clean previous layers
      if (shapesAddedRef.current) {
        if (map.getLayer('route-lines')) map.removeLayer('route-lines');
        if (map.getSource('routes')) map.removeSource('routes');
        shapesAddedRef.current = false;
      }

      try {
        const geojson = await client.getShapesGeojson(5);
        if (cancelled) return;

        if (geojson.features.length > 0) {
          map.addSource('routes', { type: 'geojson', data: geojson });
          map.addLayer({
            id: 'route-lines',
            type: 'line',
            source: 'routes',
            paint: {
              'line-color': [
                'case',
                ['has', 'route_color'],
                ['concat', '#', ['get', 'route_color']],
                '#888888',
              ],
              'line-width': 3,
              'line-opacity': 0.7,
            },
          });
          shapesAddedRef.current = true;

          // Fit bounds to shapes
          const bounds = new maplibregl.LngLatBounds();
          for (const feature of geojson.features) {
            for (const coord of (feature.geometry as GeoJSON.LineString)
              .coordinates) {
              bounds.extend(coord as [number, number]);
            }
          }
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
          }
        } else {
          // No shapes — fit to stops
          const stops = await client.getStops();
          if (cancelled) return;

          if (stops.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            for (const s of stops) {
              bounds.extend([s.stop_lon, s.stop_lat]);
            }
            if (!bounds.isEmpty()) {
              map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load shapes:', err);
        }
      }
    };

    if (map.isStyleLoaded()) {
      addShapes();
    } else {
      map.on('load', addShapes);
    }

    return () => {
      cancelled = true;
    };
  }, [client]);

  // Update vehicle markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const geojson = vehiclesToGeojson(vehicles, routeMap);

    if (map.getSource('vehicles')) {
      (map.getSource('vehicles') as maplibregl.GeoJSONSource).setData(geojson);
    } else if (vehicles.length > 0) {
      map.addSource('vehicles', { type: 'geojson', data: geojson });
      map.addLayer({
        id: 'vehicle-circles',
        type: 'circle',
        source: 'vehicles',
        paint: {
          'circle-radius': 10,
          'circle-color': ['concat', '#', ['get', 'route_color']],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'vehicle-labels',
        type: 'symbol',
        source: 'vehicles',
        layout: {
          'text-field': ['get', 'route_short_name'],
          'text-size': 9,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': ['concat', '#', ['get', 'route_text_color']],
        },
      });
    }
  }, [vehicles, routeMap]);

  // Handle vehicle click
  const handleMapClick = useCallback(
    (e: maplibregl.MapMouseEvent) => {
      const map = mapRef.current;
      if (!map || !map.getLayer('vehicle-circles')) return;

      const features = map.queryRenderedFeatures(e.point, {
        layers: ['vehicle-circles'],
      });
      if (features.length > 0) {
        const tripId = features[0].properties?.trip_id;
        const v = vehicles.find((veh) => veh.trip_id === tripId);
        if (v) onVehicleClick(v);
      } else {
        onVehicleClick(null);
      }
    },
    [vehicles, onVehicleClick],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [handleMapClick]);

  // Show popup for selected vehicle
  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    const map = mapRef.current;
    if (!map || !selectedVehicle?.position || !client) return;

    const container = document.createElement('div');
    popupRef.current = new maplibregl.Popup({ closeOnClick: false, maxWidth: 'none' })
      .setLngLat([selectedVehicle.position.longitude, selectedVehicle.position.latitude])
      .setDOMContent(container)
      .addTo(map);

    popupRef.current.on('close', () => onVehicleClick(null));

    // Render VehiclePopup into the container using React
    import('react-dom/client').then(({ createRoot }) => {
      const root = createRoot(container);
      root.render(
        <VehiclePopup
          vehicle={selectedVehicle}
          client={client}
          routeMap={routeMap}
          onClose={() => onVehicleClick(null)}
        />,
      );
    });

    return () => {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [selectedVehicle, client, routeMap, onVehicleClick]);

  // Change cursor on vehicle hover
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('mouseenter', 'vehicle-circles', onEnter);
    map.on('mouseleave', 'vehicle-circles', onLeave);

    return () => {
      map.off('mouseenter', 'vehicle-circles', onEnter);
      map.off('mouseleave', 'vehicle-circles', onLeave);
    };
  }, []);

  const timeAgo = lastUpdate
    ? `${Math.round((Date.now() - lastUpdate) / 1000)}s ago`
    : '';

  return (
    <div className="map-wrapper">
      <div ref={containerRef} className="map-container" />
      {hasRealtime && (
        <div className="realtime-badge">
          <span className="realtime-dot" />
          {vehicles.length} vehicles {timeAgo && `(${timeAgo})`}
        </div>
      )}
    </div>
  );
}
