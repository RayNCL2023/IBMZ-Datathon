"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "next-themes";
import { createApi, type Api } from "@/lib/api/client";
import { DESIGNS, flags, type DataSource, type DesignId } from "@/var/flags";
import { storage } from "@/lib/storage";

export const DESIGN_KEY = "lx.design";
const SOURCE_KEY = "lx.source";

type DesignContextType = {
    design: DesignId;
    config: (typeof DESIGNS)[DesignId];
    setDesign: (id: DesignId) => void;
    dataSource: DataSource;
    setDataSource: (source: DataSource) => void;
    api: Api;
};

const DesignContext = createContext<DesignContextType>(null as never);

export function DesignProvider({ children }: { children: React.ReactNode }) {
    const [design, setDesignState] = useState<DesignId>(flags.design);
    const [dataSource, setSourceState] = useState<DataSource>(flags.dataSource);

    // Runtime overrides only exist while their switcher flag is on.
    useEffect(() => {
        const savedDesign = storage.get(DESIGN_KEY) as DesignId | null;
        if (flags.designSwitcher && savedDesign && savedDesign in DESIGNS) {
            setDesignState(savedDesign);
        }
        const savedSource = storage.get(SOURCE_KEY) as DataSource | null;
        if (flags.dataSourceSwitcher && (savedSource === "mock" || savedSource === "live")) {
            setSourceState(savedSource);
        }
    }, []);

    useEffect(() => {
        document.documentElement.dataset.design = design;
    }, [design]);

    const setDesign = useCallback((id: DesignId) => {
        if (!flags.designSwitcher) {
            return;
        }
        storage.set(DESIGN_KEY, id);
        setDesignState(id);
    }, []);

    const setDataSource = useCallback((source: DataSource) => {
        if (!flags.dataSourceSwitcher) {
            return;
        }
        storage.set(SOURCE_KEY, source);
        setSourceState(source);
    }, []);

    const api = useMemo(() => createApi(dataSource), [dataSource]);
    const config = DESIGNS[design];

    return (
        <DesignContext.Provider value={{ design, config, setDesign, dataSource, setDataSource, api }}>
            <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem forcedTheme={config.forcedMode}>
                {children}
            </ThemeProvider>
        </DesignContext.Provider>
    );
}

export const useDesign = () => useContext(DesignContext);
export const useApiClient = () => useContext(DesignContext).api;
