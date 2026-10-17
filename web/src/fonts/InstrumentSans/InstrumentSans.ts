import localFont from "next/font/local";

// Instrument Sans (SIL OFL 1.1), latin subset, variable weight.
export const InstrumentSans = localFont({
    src: "./InstrumentSans-Variable.woff2",
    variable: "--font-instrument-sans",
    weight: "400 700",
});
