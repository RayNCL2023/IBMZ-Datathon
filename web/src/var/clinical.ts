import type { Head, VitalKey } from "@/lib/api/types";

// Fixed categorical order (validated for colour-vision deficiency): colour follows the head, never its rank.
export const HEAD_META: Record<Head, { label: string; short: string; color: string; horizon: string; action: string }> = {
    sepsis: {
        label: "Sepsis",
        short: "Sepsis",
        color: "var(--h-sepsis)",
        horizon: "next 6 h",
        action: "Ask for a clinical review and consider screening under the local sepsis pathway.",
    },
    hypotension: {
        label: "Hypotension",
        short: "Hypo",
        color: "var(--h-hypotension)",
        horizon: "next 6 h",
        action: "Review blood pressure trend and fluid balance; escalate under local policy if it keeps falling.",
    },
    aki: {
        label: "Acute kidney injury",
        short: "AKI",
        color: "var(--h-aki)",
        horizon: "next 24 h",
        action: "Review creatinine trend, urine output and nephrotoxic medicines.",
    },
    resp: {
        label: "Respiratory failure",
        short: "Resp",
        color: "var(--h-resp)",
        horizon: "next 6 h",
        action: "Review oxygen requirement and work of breathing.",
    },
    mortality: {
        label: "In-hospital mortality",
        short: "Mortality",
        color: "var(--h-mortality)",
        horizon: "this stay",
        action: "Consider a senior review of the escalation plan.",
    },
};

export const VITAL_META: Record<VitalKey, { label: string; unit: string; digits: number; low?: number; high?: number }> = {
    HR: { label: "Heart rate", unit: "bpm", digits: 0, low: 51, high: 90 },
    O2Sat: { label: "SpO₂", unit: "%", digits: 0, low: 96 },
    Temp: { label: "Temperature", unit: "°C", digits: 1, low: 36.1, high: 38 },
    SBP: { label: "Systolic BP", unit: "mmHg", digits: 0, low: 111, high: 219 },
    MAP: { label: "Mean arterial", unit: "mmHg", digits: 0, low: 65 },
    DBP: { label: "Diastolic BP", unit: "mmHg", digits: 0 },
    Resp: { label: "Resp rate", unit: "/min", digits: 0, low: 12, high: 20 },
    EtCO2: { label: "EtCO₂", unit: "mmHg", digits: 0 },
};

// Feature names returned as drivers, in plain words (mirrors api/app/handover.py READABLE).
export const READABLE: Record<string, string> = {
    HR: "Heart rate", O2Sat: "Oxygen saturation", Temp: "Temperature", SBP: "Systolic pressure",
    MAP: "Mean arterial pressure", DBP: "Diastolic pressure", Resp: "Breathing rate", EtCO2: "End-tidal CO₂",
    BaseExcess: "Base excess", HCO3: "Bicarbonate", FiO2: "Inspired oxygen (FiO₂)", PaCO2: "PaCO₂", pH: "pH",
    SaO2: "Arterial O₂ saturation", AST: "AST", BUN: "Urea (BUN)", Alkalinephos: "Alkaline phosphatase",
    Calcium: "Calcium", Chloride: "Chloride", Creatinine: "Creatinine", Bilirubin_direct: "Direct bilirubin",
    Glucose: "Glucose", Lactate: "Lactate", Magnesium: "Magnesium", Phosphate: "Phosphate",
    Potassium: "Potassium", Bilirubin_total: "Bilirubin", TroponinI: "Troponin", Hct: "Haematocrit",
    Hgb: "Haemoglobin", PTT: "Clotting time (PTT)", WBC: "White cell count", Fibrinogen: "Fibrinogen",
    Platelets: "Platelets", Age: "Age", Gender: "Sex", Urine: "Urine output", ShockIndex: "Shock index",
    BUN_Creatinine: "Urea/creatinine ratio", qSOFA_partial: "qSOFA", NEWS2: "NEWS2",
};

export const HOSPITAL_NAMES: Record<string, string> = {
    A: "Hospital A",
    B: "Hospital B",
    M: "Hospital M",
    C: "Hospital C (eICU)",
    global: "Pooled",
};

export const readable = (feature: string) => READABLE[feature] ?? feature;
