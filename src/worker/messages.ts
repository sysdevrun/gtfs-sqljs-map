/**
 * Message types for communication between the main thread and the GTFS web worker.
 */

// --- Requests (main → worker) ---

export interface LoadRequest {
  type: 'load';
  id: number;
  proxyUrl: string;
  rtUrls: string[];
}

export interface CloseRequest {
  type: 'close';
  id: number;
}

export interface GetRoutesRequest {
  type: 'getRoutes';
  id: number;
}

export interface GetShapesGeojsonRequest {
  type: 'getShapesGeojson';
  id: number;
  precision?: number;
}

export interface GetStopsRequest {
  type: 'getStops';
  id: number;
}

export type WorkerRequest =
  | LoadRequest
  | CloseRequest
  | GetRoutesRequest
  | GetShapesGeojsonRequest
  | GetStopsRequest;

// --- Responses (worker → main) ---

export interface SuccessResponse {
  type: 'success';
  id: number;
  data?: unknown;
}

export interface ErrorResponse {
  type: 'error';
  id: number;
  error: string;
}

export interface ProgressResponse {
  type: 'progress';
  phase: string;
  message: string;
  percentComplete: number;
  currentFile?: string;
}

export type WorkerResponse = SuccessResponse | ErrorResponse | ProgressResponse;
