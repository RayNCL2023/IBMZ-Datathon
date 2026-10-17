// Bedrock's "Ward" design, dark mode (web/src/styles/designs.css), so the film looks like the product.
export const C = {
    bg: "#121212",
    panel: "#191919",
    surface: "#1f1f1f",
    sunken: "#252525",
    line: "#2e2e2e",
    lineStrong: "#3b3b3b",
    fg: "#ebebea",
    muted: "#a5a5a2",
    faint: "#7c7c79",
    accent: "#4c95ea",
    accentSoft: "rgba(76,149,234,0.16)",
    danger: "#e05252",
    dangerInk: "#ff958c",
    dangerSoft: "rgba(224,82,82,0.15)",
    warn: "#f0b429",
    warnInk: "#f5c858",
    ok: "#2fbf6c",
    okInk: "#6bd99a",
    okSoft: "rgba(47,191,108,0.15)",
};

// Fixed, colour-vision-validated head order, as in the app.
export const HEADS = [
    { id: "sepsis", label: "Sepsis", horizon: "next 6 h", color: "#3987e5" },
    { id: "hypotension", label: "Hypotension", horizon: "next 6 h", color: "#d95926" },
    { id: "aki", label: "Acute kidney injury", horizon: "next 24 h", color: "#199e70" },
    { id: "resp", label: "Respiratory failure", horizon: "next 6 h", color: "#c98500" },
    { id: "mortality", label: "In-hospital mortality", horizon: "this stay", color: "#d55181" },
] as const;

export const FONT = "Instrument Sans, system-ui, sans-serif";
export const FPS = 30;
