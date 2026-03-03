import { useMemo } from 'react';
import type { GtfsSqlJs, VehiclePosition, Route } from 'gtfs-sqljs';
import './VehiclePopup.css';

interface Props {
  vehicle: VehiclePosition;
  gtfs: GtfsSqlJs;
  routeMap: Map<string, Route>;
  onClose: () => void;
}

export default function VehiclePopup({ vehicle, gtfs, routeMap, onClose }: Props) {
  const info = useMemo(() => {
    const route = vehicle.route_id ? routeMap.get(vehicle.route_id) : null;

    // Get trip info
    const trips = gtfs.getTrips({ tripId: vehicle.trip_id });
    const trip = trips[0];

    // Get trip update for delay
    const tripUpdates = gtfs.getTripUpdates({ tripId: vehicle.trip_id });
    const tripUpdate = tripUpdates[0];
    const delay = tripUpdate?.delay ?? null;

    // Get upcoming stop times
    const stopTimes = gtfs.getStopTimes({ tripId: vehicle.trip_id });
    const currentSeq = vehicle.current_stop_sequence ?? 0;

    const upcoming = stopTimes
      .filter((st) => st.stop_sequence >= currentSeq)
      .slice(0, 5)
      .map((st) => {
        const stops = gtfs.getStops({ stopId: st.stop_id });
        const stopName = stops[0]?.stop_name ?? st.stop_id;

        // Check for realtime updates for this stop
        const stUpdates = gtfs.getStopTimeUpdates({
          tripId: vehicle.trip_id,
          stopSequence: st.stop_sequence,
        });
        const stUpdate = stUpdates[0];
        const arrivalDelay = stUpdate?.arrival?.delay ?? null;

        return {
          stopName,
          scheduledArrival: st.arrival_time,
          arrivalDelay,
        };
      });

    return { route, trip, delay, upcoming };
  }, [vehicle, gtfs, routeMap]);

  const { route, trip, delay, upcoming } = info;
  const routeColor = route?.route_color ? `#${route.route_color}` : '#667eea';
  const routeTextColor = route?.route_text_color ? `#${route.route_text_color}` : '#fff';

  const formatDelay = (seconds: number | null) => {
    if (seconds === null) return 'No delay info';
    const mins = Math.round(seconds / 60);
    if (mins === 0) return 'On time';
    if (mins > 0) return `+${mins} min late`;
    return `${Math.abs(mins)} min early`;
  };

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
        {trip?.trip_headsign && (
          <span className="vehicle-popup-headsign">{trip.trip_headsign}</span>
        )}
      </div>

      <div className="vehicle-popup-body">
        <div className={`vehicle-popup-delay ${delayClass}`}>
          {formatDelay(delay)}
        </div>

        {upcoming.length > 0 && (
          <div className="vehicle-popup-stops">
            <div className="vehicle-popup-stops-title">Next stops</div>
            <ul>
              {upcoming.map((stop, i) => (
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

        {vehicle.vehicle?.label && (
          <div className="vehicle-popup-meta">
            Vehicle: {vehicle.vehicle.label}
          </div>
        )}
      </div>
    </div>
  );
}
