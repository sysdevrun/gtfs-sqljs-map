import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Route } from 'gtfs-sqljs';
import type { GtfsWorkerClient } from '../worker/gtfs-client';
import './MapView.css';

interface Props {
  client: GtfsWorkerClient | null;
  routeMap: Map<string, Route>;
}

export default function MapView({ client }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const shapesAddedRef = useRef(false);

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

  return (
    <div ref={containerRef} className="map-container" />
  );
}
