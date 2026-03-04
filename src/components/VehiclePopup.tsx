import { useState, useEffect } from 'react';
import type { VehiclePosition, Route } from 'gtfs-sqljs';
import type { GtfsWorkerClient } from '../worker/gtfs-client';
import type { VehicleDetailResult } from '../worker/messages';
import './VehiclePopup.css';

interface Props {
  vehicle: VehiclePosition;
  client: GtfsWorkerClient;
  routeMap: Map<string, Route>;
  onClose: () => void;
}

export default function VehiclePopup({ vehicle, client, routeMap, onClose }: Props) {
  const [detail, setDetail] = useState<VehicleDetailResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .getVehicleDetail(
        vehicle.trip_id,
        vehicle.route_id,
        vehicle.current_stop_sequence,
      )
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => console.error('Failed to load vehicle detail:', err));
    return () => {
      cancelled = true;
    };
  }, [client, vehicle.trip_id, vehicle.route_id, vehicle.current_stop_sequence]);

  const route = vehicle.route_id ? routeMap.get(vehicle.route_id) : null;
  const routeColor = route?.route_color ? `#${route.route_color}` : '#667eea';
  const routeTextColor = route?.route_text_color ? `#${route.route_text_color}` : '#fff';

  const formatDelay = (seconds: number | null) => {
    if (seconds === null) return 'No delay info';
    const mins = Math.round(seconds / 60);
    if (mins === 0) return 'On time';
    if (mins > 0) return `+${mins} min late`;
    return `${Math.abs(mins)} min early`;
  };

  const delay = detail?.delay ?? null;
  const delayClass =
    delay === null ? '' : delay > 60 ? 'late' : delay < -60 ? 'early' : 'on-time';

  return (
    <div className="vehicle-popup">
      <button className="vehicle-popup-close" onClick={onClose}>
        &times;
      </button>
      <div
        className="vehicle-popup-header"
        style={{ backgroundColor: routeColor, color: routeTextColor }}
      >
        <span className="vehicle-popup-route">
          {route?.route_short_name || route?.route_long_name || 'Unknown'}
        </span>
        {detail?.tripHeadsign && (
          <span className="vehicle-popup-headsign">{detail.tripHeadsign}</span>
        )}
      </div>

      <div className="vehicle-popup-body">
        {detail ? (
          <>
            <div className={`vehicle-popup-delay ${delayClass}`}>
              {formatDelay(detail.delay)}
            </div>

            {detail.upcoming.length > 0 && (
              <div className="vehicle-popup-stops">
                <div className="vehicle-popup-stops-title">Next stops</div>
                <ul>
                  {detail.upcoming.map((stop, i) => (
                    <li key={i} className="vehicle-popup-stop">
                      <span className="vehicle-popup-stop-name">{stop.stopName}</span>
                      <span className="vehicle-popup-stop-time">
                        {stop.scheduledArrival?.slice(0, 5) ?? '--:--'}
                        {stop.arrivalDelay !== null && stop.arrivalDelay !== 0 && (
                          <span
                            className={`vehicle-popup-stop-delay ${stop.arrivalDelay > 0 ? 'late' : 'early'}`}
                          >
                            {stop.arrivalDelay > 0 ? '+' : ''}
                            {Math.round(stop.arrivalDelay / 60)}m
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="vehicle-popup-delay">Loading...</div>
        )}

        {vehicle.vehicle?.label && (
          <div className="vehicle-popup-meta">
            Vehicle: {vehicle.vehicle.label}
          </div>
        )}
      </div>
    </div>
  );
}
