import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { ApiError, useAuth } from "@/lib/auth";

export function errorMessage(error: unknown, fallback = "Something went wrong.") {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

// Loads `path` whenever the screen comes into view (so changes made on other screens show up),
// with pull-to-refresh support. `setData` allows optimistic local updates.
export function useApi<T>(path: string | null) {
  const { request } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latestPath = useRef(path);
  latestPath.current = path;

  const reload = useCallback(async () => {
    const forPath = latestPath.current;

    if (!forPath) return;

    try {
      const result = await request<T>(forPath);

      // Drop an answer for a path the screen has already moved away from.
      if (latestPath.current === forPath) {
        setData(result);
        setError(null);
      }
    } catch (caught) {
      if (latestPath.current === forPath) {
        setError(errorMessage(caught));
      }
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload, path]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  return { data, setData, error, reload, refresh, refreshing };
}
