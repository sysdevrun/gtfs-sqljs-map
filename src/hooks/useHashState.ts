import { useState, useEffect, useCallback } from 'react';

function getHashNetworkId(): string | null {
  const hash = window.location.hash.slice(1); // remove '#'
  return hash || null;
}

export function useHashState() {
  const [networkId, setNetworkIdState] = useState<string | null>(getHashNetworkId);

  useEffect(() => {
    const handler = () => setNetworkIdState(getHashNetworkId());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const setNetworkId = useCallback((id: string | null) => {
    if (id) {
      window.location.hash = id;
    } else {
      // Clear hash without leaving a '#'
      history.pushState(null, '', window.location.pathname + window.location.search);
    }
    setNetworkIdState(id);
  }, []);

  return { networkId, setNetworkId };
}
