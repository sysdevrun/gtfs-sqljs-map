import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { NetworkSelection } from '../App';
import './NetworkSearch.css';

interface Dataset {
  id: string;
  title: string;
  type: string;
  resources: { format: string; original_url: string; url: string }[];
  offers: { nom_commercial?: string; nom_aom?: string }[];
  covered_area: { nom?: string }[];
}

interface Props {
  onSelect: (selection: NetworkSelection) => void;
  mode: 'full' | 'compact';
  currentTitle?: string;
  onChangeNetwork?: () => void;
}

const CACHE_KEY = 'datasets_cache';
const ONE_DAY = 24 * 60 * 60 * 1000;

export default function NetworkSearch({ onSelect, mode, currentTitle, onChangeNetwork }: Props) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [expanded, setExpanded] = useState(mode === 'full');
  const containerRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch datasets
  useEffect(() => {
    let cancelled = false;

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < ONE_DAY) {
          setDatasets(data);
          setLoadingDatasets(false);
          return;
        }
      } catch { /* ignore corrupt cache */ }
    }

    fetch('https://transport.data.gouv.fr/api/datasets')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Dataset[]) => {
        if (cancelled) return;
        const gtfsDatasets = data.filter(
          (d) =>
            d.type === 'public-transit' &&
            d.resources.some((r) => r.format === 'GTFS'),
        );
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ ts: Date.now(), data: gtfsDatasets }),
          );
        } catch { /* storage full */ }
        setDatasets(gtfsDatasets);
        setLoadingDatasets(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(String(err));
        setLoadingDatasets(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Resolve network from hash on initial load
  useEffect(() => {
    if (datasets.length === 0 || mode !== 'compact') return;
    const hash = window.location.hash.slice(1);
    if (!hash || currentTitle) return;

    const dataset = datasets.find((d) => d.id === hash);
    if (dataset) {
      handleSelect(dataset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets]);

  const filtered = useMemo(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    const results: Dataset[] = [];
    for (const d of datasets) {
      if (
        d.title.toLowerCase().includes(q) ||
        d.offers.some((o) => o.nom_commercial?.toLowerCase().includes(q)) ||
        d.covered_area.some((a) => a.nom?.toLowerCase().includes(q))
      ) {
        results.push(d);
      }
      if (results.length >= 30) break;
    }
    return results;
  }, [query, datasets]);

  useEffect(() => { setActiveIndex(-1); }, [filtered]);

  useEffect(() => {
    if (activeIndex >= 0 && resultsRef.current) {
      const item = resultsRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (mode === 'compact') setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mode]);

  const handleSelect = useCallback(
    (dataset: Dataset) => {
      const gtfsResource = dataset.resources.find((r) => r.format === 'GTFS');
      if (!gtfsResource) return;

      const gtfsRtUrls = dataset.resources
        .filter((r) => r.format.toLowerCase() === 'gtfs-rt')
        .map((r) => r.original_url || r.url);

      onSelect({
        id: dataset.id,
        title: dataset.title,
        gtfsUrl: gtfsResource.original_url || gtfsResource.url,
        gtfsRtUrls,
      });
      setQuery('');
      setOpen(false);
      setActiveIndex(-1);
      setExpanded(false);
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || filtered.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        handleSelect(filtered[activeIndex]);
      } else if (e.key === 'Escape') {
        setOpen(false);
        setActiveIndex(-1);
      }
    },
    [open, filtered, activeIndex, handleSelect],
  );

  // Compact mode: collapsed pill
  if (mode === 'compact' && !expanded) {
    return (
      <div className="network-pill" onClick={() => setExpanded(true)}>
        <span className="network-pill-name">{currentTitle ?? 'Select network'}</span>
        <button
          className="network-pill-change"
          onClick={(e) => {
            e.stopPropagation();
            if (onChangeNetwork) onChangeNetwork();
          }}
        >
          Change
        </button>
      </div>
    );
  }

  if (loadingDatasets) {
    return (
      <div className={`network-search ${mode}`}>
        <div className="network-search-loading">Loading networks...</div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className={`network-search ${mode}`}>
        <div className="network-search-error">
          Failed to load networks: {fetchError}
        </div>
      </div>
    );
  }

  return (
    <div className={`network-search ${mode}`} ref={containerRef}>
      {mode === 'full' && (
        <div className="network-search-header">
          <h1>Transit Network Viewer</h1>
          <p>Search and select a public transit network to explore</p>
        </div>
      )}
      <input
        ref={inputRef}
        className="network-search-input"
        type="text"
        placeholder="Search a network... (e.g. TCL, STAR, Mistral)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoFocus={mode === 'full'}
      />
      {open && query.length >= 2 && (
        <ul className="network-search-results" ref={resultsRef}>
          {filtered.length === 0 ? (
            <li className="network-search-empty">No network found</li>
          ) : (
            filtered.map((dataset, idx) => {
              const area = dataset.covered_area?.[0]?.nom;
              const hasRt = dataset.resources.some(
                (r) => r.format.toLowerCase() === 'gtfs-rt',
              );
              return (
                <li
                  key={dataset.id}
                  className={`network-search-item ${idx === activeIndex ? 'active' : ''}`}
                  onClick={() => handleSelect(dataset)}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <div className="network-search-item-main">
                    <span className="network-search-item-title">
                      {dataset.title}
                    </span>
                    {hasRt && <span className="network-search-rt-badge">RT</span>}
                  </div>
                  {area && (
                    <span className="network-search-item-area">{area}</span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
