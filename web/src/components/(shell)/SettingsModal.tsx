"use client";

import { useCallback } from "react";
import { useTheme } from "next-themes";
import { twMerge } from "tailwind-merge";
import { LuCheck } from "react-icons/lu";
import { useModal } from "@/contexts/ModalContext";
import { useDesign } from "@/contexts/DesignContext";
import { useReplay } from "@/contexts/ReplayContext";
import { useToast } from "@/contexts/ToastContext";
import { DESIGNS, flags, type DesignId } from "@/var/flags";
import ModalPrimary from "@/components/(modals)/ModalPrimary";
import Segmented from "@/components/(ui)/Segmented";
import ButtonPrimary from "@/components/(buttons)/ButtonPrimary";
import s from "./SettingsModal.module.scss";

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[.75rem] py-[.9rem] border-b-[1px] border-line last:border-b-0">
            <div className="flex flex-col gap-[.15rem]">
                <span className="text-[.9rem] font-[600] text-fg">{title}</span>
                {description && <span className="text-[.85rem] text-muted max-w-[46ch]">{description}</span>}
            </div>
            {children}
        </div>
    );
}

// Miniature of each design, drawn with that design's own tokens (scoped by data-design on the preview).
function DesignPreview({ id }: { id: DesignId }) {
    const d = DESIGNS[id];
    return (
        <span className={s.preview} data-preview={id} aria-hidden>
            {d.nav === "sidebar" && <span className={s.side} />}
            <span className={s.main}>
                {d.nav === "top" && <span className={s.top} />}
                {d.wardLayout === "table" ? (
                    <span className={s.rows}>
                        <i />
                        <i data-alert />
                        <i />
                    </span>
                ) : (
                    <span className={s.cards} data-tiles={d.wardLayout === "tiles" || undefined}>
                        <i data-alert />
                        <i />
                        <i />
                        <i />
                    </span>
                )}
            </span>
        </span>
    );
}

function Settings({ close }: { close: () => void }) {
    const { design, setDesign, dataSource, setDataSource, advanced, setAdvanced } = useDesign();
    const { theme, setTheme } = useTheme();
    const replay = useReplay();
    const { push } = useToast();

    return (
        <ModalPrimary
            title="Display and data"
            description="Designs are feature flags: NEXT_PUBLIC_DESIGN sets the default and NEXT_PUBLIC_DESIGN_SWITCHER allows changing it here."
            onClose={close}
            footer={<ButtonPrimary onClick={close}>Done</ButtonPrimary>}
        >
            {flags.designSwitcher && (
                <fieldset className="flex flex-col gap-[.6rem]">
                    <legend className="text-[.9rem] font-[600] text-fg pb-[.6rem]">Design</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-[.75rem]">
                        {Object.values(DESIGNS).map((d) => {
                            const active = d.id === design;
                            return (
                                <button
                                    key={d.id}
                                    aria-pressed={active}
                                    onClick={() => {
                                        setDesign(d.id);
                                        push({ tone: "success", title: `${d.name} design on`, duration: 2500 });
                                    }}
                                    className={twMerge(
                                        "flex flex-col gap-[.5rem] p-[.6rem] rounded-card border-[1px] border-line text-left hover:border-line-strong",
                                        active && "border-accent shadow-[0_0_0_1px_var(--d-accent)]",
                                    )}
                                >
                                    <DesignPreview id={d.id} />
                                    <span className="flex flex-row items-center gap-[.35rem] text-[.9rem] font-[650] text-fg">
                                        {d.name}
                                        {active && <LuCheck size={16} className="text-accent" aria-hidden />}
                                    </span>
                                    <span className="text-[.8125rem] text-muted leading-[1.4]">{d.description}</span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>
            )}

            <div className="flex flex-col">
                {!DESIGNS[design].forcedMode && (
                    <Row title="Appearance" description="System follows your device setting.">
                        <Segmented
                            label="Appearance"
                            value={(theme ?? "system") as "light" | "dark" | "system"}
                            onChange={setTheme}
                            options={[
                                { value: "light", label: "Light" },
                                { value: "dark", label: "Dark" },
                                { value: "system", label: "System" },
                            ]}
                        />
                    </Row>
                )}
                {flags.advancedToggle && (
                    <Row title="Advanced mode" description="Adds the federated privacy models, the LinuxONE system page, layout and data source controls. Off keeps the clinical screens simple.">
                        <Segmented
                            label="Advanced mode"
                            value={advanced ? "on" : "off"}
                            onChange={(v) => {
                                setAdvanced(v === "on");
                                if (v === "off") {
                                    replay.setPrivacy(null);
                                }
                            }}
                            options={[
                                { value: "off", label: "Off" },
                                { value: "on", label: "On" },
                            ]}
                        />
                    </Row>
                )}
                {advanced && flags.dataSourceSwitcher && (
                    <Row title="Data source" description="Live calls the LinuxONE API through this site's server. Demo data works offline with the same shapes.">
                        <Segmented
                            label="Data source"
                            value={dataSource}
                            onChange={(v) => {
                                setDataSource(v);
                                push({ tone: "info", title: v === "live" ? "Using the LinuxONE API" : "Using demo data", duration: 3000 });
                            }}
                            options={[
                                { value: "live", label: "LinuxONE" },
                                { value: "mock", label: "Demo" },
                            ]}
                        />
                    </Row>
                )}
                {flags.groundTruth && (
                    <Row title="Show retrospective labels" description="Reveals the PhysioNet sepsis label and onset. A real ward never has this; use it to judge the model.">
                        <Segmented
                            label="Show retrospective labels"
                            value={replay.groundTruth ? "on" : "off"}
                            onChange={(v) => replay.setGroundTruth(v === "on")}
                            options={[
                                { value: "off", label: "Hidden" },
                                { value: "on", label: "Shown" },
                            ]}
                        />
                    </Row>
                )}
            </div>
        </ModalPrimary>
    );
}

export function useSettings() {
    const { open } = useModal();
    return useCallback(() => open((close) => <Settings close={close} />, { label: "Display and data settings", size: "lg", key: "settings" }), [open]);
}
