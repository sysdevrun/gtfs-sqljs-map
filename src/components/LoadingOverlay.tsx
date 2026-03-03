import type { ProgressInfo } from '../hooks/useGtfs';
import './LoadingOverlay.css';

const PHASE_LABELS: Record<string, string> = {
  checking_cache: 'Checking cache...',
  loading_from_cache: 'Loading from cache...',
  downloading: 'Downloading GTFS data...',
  extracting: 'Extracting files...',
  creating_schema: 'Creating database...',
  inserting_data: 'Importing data...',
  creating_indexes: 'Creating indexes...',
  analyzing: 'Analyzing...',
  loading_realtime: 'Loading realtime data...',
  saving_cache: 'Saving to cache...',
  complete: 'Complete!',
};

interface Props {
  networkName: string;
  progress: ProgressInfo;
}

export default function LoadingOverlay({ networkName, progress }: Props) {
  const phaseLabel = PHASE_LABELS[progress.phase] ?? progress.message;
  const pct = Math.round(progress.percentComplete);

  return (
    <div className="loading-overlay">
      <div className="loading-card">
        <h2>Loading {networkName}</h2>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="progress-info">
          <span className="progress-phase">{phaseLabel}</span>
          <span className="progress-pct">{pct}%</span>
        </div>
        {progress.currentFile && (
          <div className="progress-file">{progress.currentFile}</div>
        )}
      </div>
    </div>
  );
}
