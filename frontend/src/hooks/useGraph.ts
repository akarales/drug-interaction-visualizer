import { useCallback, useEffect, useState } from 'react';

import { fetchGraph } from '@/api/client';
import type { GraphData } from '@/api/types';

interface GraphState {
  data: GraphData | null;
  error: string | null;
}

export function useGraph(top: number) {
  const [state, setState] = useState<GraphState>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchGraph(top)
      .then((data) => {
        if (!cancelled) setState({ data, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            data: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [top]);

  const loading = state.data === null && state.error === null;

  const reload = useCallback((limit: number) => {
    fetchGraph(limit)
      .then((data) => setState({ data, error: null }))
      .catch(() => undefined);
  }, []);

  return { data: state.data, loading, error: state.error, reload };
}
