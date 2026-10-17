// =====================
// Global CSS Imports
// =====================
import "./globals.css";
import "./animations.scss";

// =====================
// Instrument Sans
// =====================
import { InstrumentSans } from "@/fonts/InstrumentSans/InstrumentSans";

// =====================
// Metadata Export
// =====================
import { metaGen, setDefaults } from "nitlix-metagen";
import { BRAND } from "@/var/nav";
import { flags } from "@/var/flags";
setDefaults({
    title: BRAND.name,
    description: "ICU early warning for sepsis, hypotension, acute kidney injury, respiratory failure and mortality, served by Snap ML on IBM LinuxONE.",
});
export const metadata = metaGen();

import Backbone from "@/backbone/Backbone";
import Providers from "@/contexts/Providers";
import { DESIGN_KEY } from "@/contexts/DesignContext";

// Applies the saved design before first paint so there is no flash of the default design.
const designScript = `try{var d=${flags.designSwitcher ? `localStorage.getItem(${JSON.stringify(DESIGN_KEY)})` : "null"};if(d==="ward"||d==="clinical"||d==="night")document.documentElement.dataset.design=d}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en-GB" data-design={flags.design} className={InstrumentSans.variable} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: designScript }} />
            </head>
            <Backbone className={InstrumentSans.className}>
                <Providers>{children}</Providers>
            </Backbone>
        </html>
    );
}
