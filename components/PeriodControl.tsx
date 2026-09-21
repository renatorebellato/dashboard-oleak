"use client";

// Filtro de período do modo "Ao vivo": presets rápidos (7/14/30 dias, mês
// atual) ou um intervalo de datas personalizado. Cada mudança recalcula o
// intervalo e devolve { key, start, end } em YYYY-MM-DD (fuso do navegador)
// para o Dashboard buscar em /api/live?start=...&end=....

import { useState } from "react";

export type PeriodSelection = { key: string; start: string; end: string };

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function firstOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  return `${y}-${m}-01`;
}

export const PRESETS = [
  { key: "7d", label: "7 dias" },
  { key: "14d", label: "14 dias" },
  { key: "30d", label: "30 dias" },
  { key: "month", label: "Mês atual" },
  { key: "custom", label: "Personalizado" },
] as const;

export function presetToRange(key: string): { start: string; end: string } {
  const end = todayStr();
  switch (key) {
    case "14d":
      return { start: addDays(end, -13), end };
    case "30d":
      return { start: addDays(end, -29), end };
    case "month":
      return { start: firstOfMonth(end), end };
    default:
      return { start: addDays(end, -6), end };
  }
}

export default function PeriodControl({
  selectedKey,
  customStart,
  customEnd,
  onChange,
}: {
  selectedKey: string;
  customStart: string;
  customEnd: string;
  onChange: (sel: PeriodSelection) => void;
}) {
  const [showCustom, setShowCustom] = useState(selectedKey === "custom");

  return (
    <div className="period-control">
      <div className="period-presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={selectedKey === p.key ? "active" : ""}
            onClick={() => {
              if (p.key === "custom") {
                setShowCustom(true);
                return;
              }
              setShowCustom(false);
              const range = presetToRange(p.key);
              onChange({ key: p.key, ...range });
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {showCustom && (
        <div className="period-custom">
          <input
            type="date"
            value={customStart}
            max={customEnd || todayStr()}
            onChange={(e) => onChange({ key: "custom", start: e.target.value, end: customEnd })}
          />
          <span>até</span>
          <input
            type="date"
            value={customEnd}
            min={customStart || undefined}
            max={todayStr()}
            onChange={(e) => onChange({ key: "custom", start: customStart, end: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
