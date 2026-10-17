// Feature flags. Every flag is read once at build time from NEXT_PUBLIC_* env vars (see .env.example).
// process.env.NEXT_PUBLIC_* must be referenced literally so the bundler can inline it.

export type DesignId = "ward" | "clinical" | "night";
export type DataSource = "mock" | "live";

const DESIGN_IDS: DesignId[] = ["ward", "clinical", "night"];

function bool(value: string | undefined, fallback: boolean) {
    if (value === undefined || value === "") {
        return fallback;
    }
    return value === "true" || value === "1";
}

function design(value: string | undefined): DesignId {
    if (!value || !DESIGN_IDS.includes(value as DesignId)) {
        return "ward";
    }
    return value as DesignId;
}

export const flags = {
    // Default design: "ward" (Notion-like), "clinical" (high contrast), "night" (dark monitoring station).
    design: design(process.env.NEXT_PUBLIC_DESIGN),
    // Lets users switch designs at runtime (sidebar, settings, command palette). Turn off to lock a design.
    designSwitcher: bool(process.env.NEXT_PUBLIC_DESIGN_SWITCHER, true),
    // "live" calls the LinuxONE API through /api/lx; "mock" serves deterministic demo data in the browser.
    dataSource: (process.env.NEXT_PUBLIC_DATA_SOURCE === "live" ? "live" : "mock") as DataSource,
    // Allows switching data source at runtime from settings (useful when the VM is unreachable mid-demo).
    dataSourceSwitcher: bool(process.env.NEXT_PUBLIC_DATA_SOURCE_SWITCHER, true),
    // Lets users turn on advanced mode in settings (federated privacy models, LinuxONE system page, data source).
    advancedToggle: bool(process.env.NEXT_PUBLIC_ADVANCED_TOGGLE, true),
    // Audible alarm cues for new high and medium priority alarms.
    audio: bool(process.env.NEXT_PUBLIC_AUDIO, true),
    // Shows the retrospective PhysioNet sepsis label on beds. Demo only: never available on a real ward.
    groundTruth: bool(process.env.NEXT_PUBLIC_GROUND_TRUTH, true),
    // Toasts when a bed newly crosses an alarm line during replay.
    alertToasts: bool(process.env.NEXT_PUBLIC_ALERT_TOASTS, true),
    // Granite SBAR handover notes (POST /handover).
    handover: bool(process.env.NEXT_PUBLIC_HANDOVER, true),
    // Granite ward shift summary over the last n hours (POST /shift-summary).
    shiftSummary: bool(process.env.NEXT_PUBLIC_SHIFT_SUMMARY, true),
    // Manual what-if scoring (POST /predict and /news2).
    whatIf: bool(process.env.NEXT_PUBLIC_WHAT_IF, true),
};

export const DESIGNS: Record<
    DesignId,
    {
        id: DesignId;
        name: string;
        description: string;
        nav: "sidebar" | "top";
        wardLayout: "cards" | "table" | "tiles";
        forcedMode?: "dark" | "light";
    }
> = {
    ward: {
        id: "ward",
        name: "Ward",
        description: "Calm, document-like workspace with a sidebar and bed cards.",
        nav: "sidebar",
        wardLayout: "cards",
    },
    clinical: {
        id: "clinical",
        name: "Clinical",
        description: "High contrast, larger type and a dense sortable bed list. Built for shared ward PCs.",
        nav: "top",
        wardLayout: "table",
    },
    night: {
        id: "night",
        name: "Night",
        description: "Dark central-station monitor with large readouts for low-light night shifts.",
        nav: "sidebar",
        wardLayout: "tiles",
        forcedMode: "dark",
    },
};
