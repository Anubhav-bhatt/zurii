import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The single data-fetching primitive for API-backed views.
 *
 * Returns `{ data, loading, error, reload }` and handles aborting in-flight
 * requests on unmount or when the inputs change.
 *
 * `loading` is derived by comparing the key that produced the current data
 * against the key being requested, rather than being set from inside the
 * effect. That means switching to a new key shows a skeleton immediately
 * instead of briefly rendering the previous key's data, and it keeps the effect
 * free of synchronous setState (see react-hooks/set-state-in-effect).
 *
 * Usage:
 *   const { data, loading, error, reload } = useAsyncData(
 *     ({ signal }) => getPackages({ featured: true }, { signal }),
 *     ['featured-packages']
 *   );
 *
 * `fetcher` is read through a ref, so an inline arrow function does not
 * retrigger the request — only a change in `deps` (or `reload`) does.
 */
export function useAsyncData(fetcher, deps = []) {
  const key = JSON.stringify(deps);

  const [state, setState] = useState({ key: null, data: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  const fetcherRef = useRef(fetcher);

  // Declared before the fetching effect so it runs first: on a dependency
  // change the ref holds the current render's fetcher by the time the request
  // is made. Assigning during render would be a ref write in render.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    Promise.resolve(fetcherRef.current({ signal: controller.signal }))
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((error) => {
        if (cancelled || error.name === 'AbortError') return;
        setState({ key, data: null, error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, reloadToken]);

  const reload = useCallback(() => {
    setState({ key: null, data: null, error: null });
    setReloadToken((token) => token + 1);
  }, []);

  return {
    data: state.key === key ? state.data : null,
    loading: state.key !== key,
    error: state.key === key ? state.error : null,
    reload,
  };
}
