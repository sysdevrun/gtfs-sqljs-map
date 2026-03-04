import type { Route, Stop, VehiclePosition } from 'gtfs-sqljs';
import type {
  WorkerRequest,
  WorkerResponse,
  ProgressResponse,
  VehicleDetailResult,
} from './messages';

export type ProgressInfo = {
  phase: string;
  message: string;
  percentComplete: number;
  currentFile?: string;
};

type PendingCall = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
};

/**
 * Typed async client that communicates with the GTFS web worker.
 * Each method sends a message and returns a Promise resolved when the worker replies.
 */
export class GtfsWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private onProgress: ((info: ProgressInfo) => void) | null = null;
  private wasmUrl: string;

  constructor(worker: Worker, wasmUrl: string) {
    this.worker = worker;
    this.wasmUrl = wasmUrl;

    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;

      if (msg.type === 'progress') {
        const p = msg as ProgressResponse;
        this.onProgress?.({
          phase: p.phase,
          message: p.message,
          percentComplete: p.percentComplete,
          currentFile: p.currentFile,
        });
        return;
      }

      const call = this.pending.get(msg.id);
      if (!call) return;
      this.pending.delete(msg.id);

      if (msg.type === 'error') {
        call.reject(new Error(msg.error));
      } else {
        call.resolve(msg.data);
      }
    };
  }

  setProgressCallback(cb: ((info: ProgressInfo) => void) | null) {
    this.onProgress = cb;
  }

  private send(msg: Omit<WorkerRequest, 'id'> & Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id });
    });
  }

  async load(proxyUrl: string, rtUrls: string[]): Promise<void> {
    await this.send({
      type: 'load',
      proxyUrl,
      rtUrls,
      wasmUrl: this.wasmUrl,
    });
  }

  async close(): Promise<void> {
    await this.send({ type: 'close' });
  }

  async getRoutes(): Promise<Route[]> {
    return (await this.send({ type: 'getRoutes' })) as Route[];
  }

  async getShapesGeojson(precision?: number): Promise<GeoJSON.FeatureCollection> {
    return (await this.send({
      type: 'getShapesGeojson',
      precision,
    })) as GeoJSON.FeatureCollection;
  }

  async getStops(): Promise<Stop[]> {
    return (await this.send({ type: 'getStops' })) as Stop[];
  }

  async getRealtimeFeedUrls(): Promise<string[]> {
    return (await this.send({ type: 'getRealtimeFeedUrls' })) as string[];
  }

  async fetchRealtimeData(): Promise<void> {
    await this.send({ type: 'fetchRealtimeData' });
  }

  async getVehiclePositions(): Promise<VehiclePosition[]> {
    return (await this.send({ type: 'getVehiclePositions' })) as VehiclePosition[];
  }

  async getVehicleDetail(
    tripId: string,
    routeId?: string,
    currentStopSequence?: number,
  ): Promise<VehicleDetailResult> {
    return (await this.send({
      type: 'getVehicleDetail',
      tripId,
      routeId,
      currentStopSequence,
    })) as VehicleDetailResult;
  }

  terminate() {
    this.worker.terminate();
    for (const call of this.pending.values()) {
      call.reject(new Error('Worker terminated'));
    }
    this.pending.clear();
  }
}
