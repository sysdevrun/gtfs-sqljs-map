import { GtfsSqlJs } from 'gtfs-sqljs';
import { IndexedDBCacheStore } from '../lib/cache-store';
import type {
  WorkerRequest,
  WorkerResponse,
  ProgressResponse,
  VehicleDetailResult,
} from './messages';

let instance: GtfsSqlJs | null = null;
const cache = new IndexedDBCacheStore();

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

function requireInstance(id: number): GtfsSqlJs | null {
  if (!instance) {
    post({ type: 'error', id, error: 'No GTFS instance loaded' });
    return null;
  }
  return instance;
}

async function handleLoad(
  id: number,
  proxyUrl: string,
  rtUrls: string[],
  wasmUrl: string,
) {
  if (instance) {
    instance.close();
    instance = null;
  }

  try {
    instance = await GtfsSqlJs.fromZip(proxyUrl, {
      locateFile: () => wasmUrl,
      onProgress: (p) => {
        const msg: ProgressResponse = {
          type: 'progress',
          phase: p.phase,
          message: p.message,
          percentComplete: p.percentComplete,
          currentFile: p.currentFile ?? undefined,
        };
        post(msg);
      },
      cache,
    });

    if (rtUrls.length > 0) {
      instance.setRealtimeFeedUrls(rtUrls);
    }

    post({ type: 'success', id });
  } catch (err) {
    post({ type: 'error', id, error: String(err) });
  }
}

function handleGetVehicleDetail(
  id: number,
  tripId: string,
  _routeId?: string,
  currentStopSequence?: number,
) {
  const gtfs = requireInstance(id);
  if (!gtfs) return;

  const trips = gtfs.getTrips({ tripId });
  const trip = trips[0];

  const tripUpdates = gtfs.getTripUpdates({ tripId });
  const tripUpdate = tripUpdates[0];
  const delay = tripUpdate?.delay ?? null;

  const stopTimes = gtfs.getStopTimes({ tripId });
  const currentSeq = currentStopSequence ?? 0;

  const upcoming = stopTimes
    .filter((st) => st.stop_sequence >= currentSeq)
    .slice(0, 5)
    .map((st) => {
      const stops = gtfs.getStops({ stopId: st.stop_id });
      const stopName = stops[0]?.stop_name ?? st.stop_id;

      const stUpdates = gtfs.getStopTimeUpdates({
        tripId,
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

  const result: VehicleDetailResult = {
    tripHeadsign: trip?.trip_headsign,
    delay,
    upcoming,
  };

  post({ type: 'success', id, data: result });
}

// The first message carries the WASM URL alongside the load request
let wasmUrl: string | null = null;

self.onmessage = async (e: MessageEvent<WorkerRequest & { wasmUrl?: string }>) => {
  const msg = e.data;

  if (msg.wasmUrl) {
    wasmUrl = msg.wasmUrl;
  }

  switch (msg.type) {
    case 'load':
      if (!wasmUrl) {
        post({ type: 'error', id: msg.id, error: 'WASM URL not provided' });
        return;
      }
      await handleLoad(msg.id, msg.proxyUrl, msg.rtUrls, wasmUrl);
      break;
    case 'close': {
      if (instance) {
        instance.close();
        instance = null;
      }
      post({ type: 'success', id: msg.id });
      break;
    }
    case 'getRoutes': {
      const gtfs = requireInstance(msg.id);
      if (gtfs) post({ type: 'success', id: msg.id, data: gtfs.getRoutes() });
      break;
    }
    case 'getShapesGeojson': {
      const gtfs = requireInstance(msg.id);
      if (gtfs) post({ type: 'success', id: msg.id, data: gtfs.getShapesToGeojson({}, msg.precision ?? 5) });
      break;
    }
    case 'getStops': {
      const gtfs = requireInstance(msg.id);
      if (gtfs) post({ type: 'success', id: msg.id, data: gtfs.getStops() });
      break;
    }
    case 'getRealtimeFeedUrls': {
      const gtfs = requireInstance(msg.id);
      if (gtfs) post({ type: 'success', id: msg.id, data: gtfs.getRealtimeFeedUrls() });
      break;
    }
    case 'fetchRealtimeData': {
      const gtfs = requireInstance(msg.id);
      if (!gtfs) break;
      try {
        await gtfs.fetchRealtimeData();
        post({ type: 'success', id: msg.id });
      } catch (err) {
        post({ type: 'error', id: msg.id, error: String(err) });
      }
      break;
    }
    case 'getVehiclePositions': {
      const gtfs = requireInstance(msg.id);
      if (gtfs) post({ type: 'success', id: msg.id, data: gtfs.getVehiclePositions() });
      break;
    }
    case 'getVehicleDetail':
      handleGetVehicleDetail(msg.id, msg.tripId, msg.routeId, msg.currentStopSequence);
      break;
  }
};
