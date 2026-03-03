import { GtfsSqlJs } from 'gtfs-sqljs';
import { IndexedDBCacheStore } from '../lib/cache-store';
import type { WorkerRequest, WorkerResponse, ProgressResponse } from './messages';

// sql.js WASM URL is passed via the first message or we use a known path.
// Vite's ?url import doesn't work in workers directly, so the main thread
// will pass the resolved WASM URL when loading.
let instance: GtfsSqlJs | null = null;
const cache = new IndexedDBCacheStore();

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

async function handleLoad(
  id: number,
  proxyUrl: string,
  rtUrls: string[],
  wasmUrl: string,
) {
  // Close previous instance if any
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

function handleClose(id: number) {
  if (instance) {
    instance.close();
    instance = null;
  }
  post({ type: 'success', id });
}

function handleGetRoutes(id: number) {
  if (!instance) {
    post({ type: 'error', id, error: 'No GTFS instance loaded' });
    return;
  }
  const routes = instance.getRoutes();
  post({ type: 'success', id, data: routes });
}

function handleGetShapesGeojson(id: number, precision?: number) {
  if (!instance) {
    post({ type: 'error', id, error: 'No GTFS instance loaded' });
    return;
  }
  const geojson = instance.getShapesToGeojson({}, precision ?? 5);
  post({ type: 'success', id, data: geojson });
}

function handleGetStops(id: number) {
  if (!instance) {
    post({ type: 'error', id, error: 'No GTFS instance loaded' });
    return;
  }
  const stops = instance.getStops();
  post({ type: 'success', id, data: stops });
}

// The first message carries the WASM URL alongside the load request
let wasmUrl: string | null = null;

self.onmessage = async (e: MessageEvent<WorkerRequest & { wasmUrl?: string }>) => {
  const msg = e.data;

  // Capture wasmUrl if provided (sent with the first load request)
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
    case 'close':
      handleClose(msg.id);
      break;
    case 'getRoutes':
      handleGetRoutes(msg.id);
      break;
    case 'getShapesGeojson':
      handleGetShapesGeojson(msg.id, msg.precision);
      break;
    case 'getStops':
      handleGetStops(msg.id);
      break;
  }
};
