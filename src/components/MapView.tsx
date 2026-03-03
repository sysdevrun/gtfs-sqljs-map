import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GtfsSqlJs, VehiclePosition, Route } from 'gtfs-sqljs';
import { useRealtimeUpdater } from '../hooks/useRealtimeUpdater';
import VehiclePopup from './VehiclePopup';
import './MapView.css';

interface Props {
  gtfs: GtfsSqlJs | null;
  selectedVehicle: VehiclePosition | null;
  onVehicleClick: (vehicle: VehiclePosition | null) => void;
  routeMap: Map<string, Route>;
}

function vehiclesToGeojson(
  vehicles: VehiclePosition[],
  routeMap: Map<string, Route>,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = vehicles
    .filter((v) => v.position)
    .map((v) => {
      const route = v.route_id ? routeMap.get(v.route_id) : undefined;
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [v.position!.longitude, v.position!.latitude],
        },
        properties: {
          tripId: v.trip_id,
          routeId: v.route_id ?? '',
          routeShortName: route?.route_short_name ?? '',
          color: route?.route_color ? `#${route.route_color}` : '#888888',
          textColor: route?.route_text_color
            ? `#${route.route_text_color}`
            : '#ffffff',
        },
      };
    });
  return { type: 'FeatureCollection', features };
}

export default function MapView({
  gtfs,
  selectedVehicle,
  onVehicleClick,
  routeMap,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const shapesAddedRef = useRef(false);
  const vehiclesAddedRef = useRef(false);

  const { vehicles, lastUpdate, hasRealtime } = useRealtimeUpdater(gtfs);

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

  // Add route shapes when GTFS loads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gtfs) return;

    const addShapes = () => {
      // Clean previous layers
      if (shapesAddedRef.current) {
        if (map.getLayer('route-lines')) map.removeLayer('route-lines');
        if (map.getSource('routes')) map.removeSource('routes');
        shapesAddedRef.current = false;
      }
      if (vehiclesAddedRef.current) {
        if (map.getLayer('vehicle-labels')) map.removeLayer('vehicle-labels');
        if (map.getLayer('vehicle-circles')) map.removeLayer('vehicle-circles');
        if (map.getSource('vehicles')) map.removeSource('vehicles');
        vehiclesAddedRef.current = false;
      }

      const geojson = gtfs.getShapesToGeojson({}, 5);

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
        const stops = gtfs.getStops();
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
    };

    if (map.isStyleLoaded()) {
      addShapes();
    } else {
      map.on('load', addShapes);
    }
  }, [gtfs]);

  // Update vehicle markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const geojson = vehiclesToGeojson(vehicles, routeMap);

    if (vehiclesAddedRef.current) {
      const src = map.getSource('vehicles') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geojson);
        return;
      }
    }

    if (vehicles.length === 0) return;

    map.addSource('vehicles', { type: 'geojson', data: geojson });

    map.addLayer({
      id: 'vehicle-circles',
      type: 'circle',
      source: 'vehicles',
      paint: {
        'circle-radius': 9,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    map.addLayer({
      id: 'vehicle-labels',
      type: 'symbol',
      source: 'vehicles',
      layout: {
        'text-field': ['get', 'routeShortName'],
        'text-size': 9,
        'text-font': ['Open Sans Regular'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': ['get', 'textColor'],
      },
    });

    vehiclesAddedRef.current = true;

    // Click handler
    map.on('click', 'vehicle-circles', (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if (!props) return;
      const v = vehicles.find((veh) => veh.trip_id === props.tripId);
      if (v) onVehicleClick(v);
    });

    map.on('mouseenter', 'vehicle-circles', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'vehicle-circles', () => {
      map.getCanvas().style.cursor = '';
    });
  }, [vehicles, routeMap, onVehicleClick]);

  return (
    <>
      <div ref={containerRef} className="map-container" />

      {hasRealtime && lastUpdate && (
        <div className="realtime-badge">
          <span className="realtime-dot" />
          Live
        </div>
      )}

      {gtfs && !hasRealtime && (
        <div className="realtime-badge offline">No realtime data</div>
      )}

      {selectedVehicle && gtfs && (
        <VehiclePopup
          vehicle={selectedVehicle}
          gtfs={gtfs}
          routeMap={routeMap}
          onClose={() => onVehicleClick(null)}
        />
      )}
    </>
  );
}
