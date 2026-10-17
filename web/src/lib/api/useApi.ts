"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/contexts/DesignContext";
import type { Api } from "./client";

// Tiny query hook: cached by key per data source, keeps the previous data while the next key loads (so a
// replay never flashes empty), and ignores responses that arrive after the key has moved on.
const cache = new Map<string, unknown>();

export type Query<T> = {
    data: T | undefined;
    error: Error | null;
    loading: boolean;
    reload: () => void;
};

export function useApi<T>(key: string | null, fetcher: (api: Api) => Promise<T>): Query<T> {
    const api = useApiClient();
    const fullKey = key === null ? null : `${api.source}:${key}`;
    const [data, setData] = useState<T | undefined>(() => (fullKey ? (cache.get(fullKey) as T | undefined) : undefined));
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(false);
    const [nonce, setNonce] = useState(0);
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    useEffect(() => {
        if (!fullKey) {
            return;
        }
        let current = true;
        const cached = cache.get(fullKey) as T | undefined;
        if (cached !== undefined && nonce === 0) {
            setData(cached);
            setError(null);
            return;
        }
        setLoading(true);
        fetcherRef
            .current(api)
            .then((result) => {
                cache.set(fullKey, result);
                if (!current) {
                    return;
                }
                setData(result);
                setError(null);
            })
            .catch((e: Error) => {
                if (!current) {
                    return;
                }
                setError(e);
            })
            .finally(() => {
                if (current) {
                    setLoading(false);
                }
            });
        return () => {
            current = false;
        };
    }, [fullKey, nonce, api]);

    const reload = useCallback(() => {
        if (fullKey) {
            cache.delete(fullKey);
        }
        setNonce((n) => n + 1);
    }, [fullKey]);

    return { data, error, loading, reload };
}
