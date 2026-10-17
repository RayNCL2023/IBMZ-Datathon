# Vigil dashboard

Frontend for the LinuxONE early-warning API (`../api`). Ward board of the API's 12 demo beds, patient view with risk timeline, drivers and Granite SBAR handover, plus model performance, federated learning and system pages.

## Run

```bash
cp .env.example .env.local   # set LINUXONE_API_KEY
bun install
bun run dev                  # http://localhost:3000
```

## Feature flags (`.env.local`, read in `src/var/flags.ts`)

| Flag | Values | Effect |
|---|---|---|
| `NEXT_PUBLIC_DESIGN` | `ward` · `clinical` · `night` | Default design |
| `NEXT_PUBLIC_DESIGN_SWITCHER` | `true` / `false` | Runtime design switching (settings, command palette) |
| `NEXT_PUBLIC_DATA_SOURCE` | `live` / `mock` | LinuxONE API, or deterministic demo data in the browser |
| `NEXT_PUBLIC_DATA_SOURCE_SWITCHER` | `true` / `false` | Runtime switch between the two (handy if the VM drops mid-demo) |
| `NEXT_PUBLIC_GROUND_TRUTH` | `true` / `false` | Allows revealing the retrospective sepsis label |
| `NEXT_PUBLIC_ALERT_TOASTS` | `true` / `false` | Toast when a bed newly crosses an alarm line during replay |
| `NEXT_PUBLIC_HANDOVER` | `true` / `false` | Granite SBAR panel |
| `NEXT_PUBLIC_WHAT_IF` | `true` / `false` | What-if scoring modal (`/predict` + `/news2`) |

The three designs share one token contract (`src/styles/designs.css`). Components only use semantic classes (`bg-surface`, `text-muted`, `border-line`), so a design never touches a component. Each design also picks a navigation (sidebar or top bar) and a default ward layout (cards, table or tiles).

## Architecture

- `src/app/api/lx/[...path]/route.ts`: server-side proxy. Adds `x-api-key` from `LINUXONE_API_KEY`, so the key never reaches the browser and CORS is not needed.
- `src/lib/api/`: types mirroring `api/app/main.py`, the client (`live` or `mock`), the `useApi` hook, mock data and the SBAR port.
- `src/contexts/`: `DesignContext` (design, data source, API client), `ToastContext`, `ReplayContext` (one clock for every screen, plus the privacy model), `WardContext` (one `/ward` call per hour) and `ModalContext` (stacked dialogs, drawers and the palette through `ModalBase`).
- Keyboard: `Ctrl K` palette, `Space` play, `←/→` step, `W` what-if, `?` shortcuts.
