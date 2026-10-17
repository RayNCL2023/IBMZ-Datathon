"use client";

import { LuChevronLeft, LuChevronRight, LuPause, LuPlay } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import { SPEEDS, useReplay } from "@/contexts/ReplayContext";
import { useWard } from "@/contexts/WardContext";
import { useApi } from "@/lib/api/useApi";
import IconButton from "@/components/(buttons)/IconButton";
import Segmented from "@/components/(ui)/Segmented";
import s from "./ReplayBar.module.scss";

// The replay clock: every screen reads the same hour. Also picks the sepsis model (central or federated
// with a privacy budget), which /ward, /patient and /handover all accept.
export default function ({ className }: { className?: string }) {
    const r = useReplay();
    const { loading } = useWard();
    const { data: privacy } = useApi("privacy", (api) => api.privacy());
    const options = privacy?.options ?? [];

    return (
        <div className={twMerge(s.bar, className)} role="group" aria-label="Replay controls">
            <div className="flex flex-row items-center gap-[.15rem]">
                <IconButton label="Back one hour" onClick={() => r.step(-1)} disabled={r.hour <= 0}>
                    <LuChevronLeft size={18} />
                </IconButton>
                <button
                    onClick={r.toggle}
                    aria-label={r.playing ? "Pause replay" : "Play replay"}
                    aria-pressed={r.playing}
                    className={s.play}
                >
                    {r.playing ? <LuPause size={16} /> : <LuPlay size={16} />}
                </button>
                <IconButton label="Forward one hour" onClick={() => r.step(1)} disabled={r.hour >= r.maxHour}>
                    <LuChevronRight size={18} />
                </IconButton>
            </div>

            <label className="flex flex-row items-center gap-[.75rem] flex-1 min-w-[12rem]">
                <span className={s.hour}>
                    <span className="sr-only">Replay hour</span>
                    <b>Hour {r.hour}</b>
                    <span>of {r.maxHour}</span>
                </span>
                <input
                    type="range"
                    min={0}
                    max={r.maxHour}
                    value={r.hour}
                    onChange={(e) => r.setHour(Number(e.target.value))}
                    className={s.range}
                    style={{ "--progress": `${(r.hour / Math.max(r.maxHour, 1)) * 100}%` } as React.CSSProperties}
                />
                <span className={s.loading} data-on={loading || undefined} aria-hidden />
            </label>

            <div className="flex flex-row flex-wrap items-center gap-[.5rem]">
                <Segmented
                    label="Replay speed"
                    value={r.speed}
                    onChange={r.setSpeed}
                    options={SPEEDS.map((sp) => ({ value: sp.value, label: sp.label, title: `${sp.ms / 1000} s per hour` }))}
                />
                {options.length > 0 && (
                    <label className={s.select}>
                        <span>Sepsis model</span>
                        <select value={r.privacy ?? ""} onChange={(e) => r.setPrivacy(e.target.value || null)}>
                            <option value="">Central</option>
                            {options.map((o) => (
                                <option key={o} value={o}>
                                    {o === "none" ? "Federated, no noise" : `Federated, ε = ${o}`}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
        </div>
    );
}
