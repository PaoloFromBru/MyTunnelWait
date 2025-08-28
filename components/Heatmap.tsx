// components/Heatmap.tsx
"use client";

import { useMemo } from "react";

type Props = {
  title: string;
  matrix: number[][]; // [7][24] Mon..Sun x 0..23
  max: number;        // valore massimo per la scala
  legendNote?: string;
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function cellColor(value: number, max: number) {
  // scala 0..max -> lightness 96% .. 40% su Hue 210 (blu)
  const ratio = Math.max(0, Math.min(1, value / max));
  const lightness = 96 - Math.round(ratio * 56); // 96->40
  const h = 210; // blu
  const s = 80;
  return `hsl(${h} ${s}% ${lightness}%)`;
}

export default function Heatmap({ title, matrix, max, legendNote }: Props) {
  const totals = useMemo(() => {
    let sum = 0;
    let nonZero = 0;
    for (const row of matrix) {
      for (const v of row) {
        if (v > 0) nonZero++;
        sum += v;
      }
    }
    return { sum, nonZero };
  }, [matrix]);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <h2 className="text-lg font-medium">{title}</h2>
        <div className="text-xs text-gray-500">
          Tot: <span className="font-medium">{totals.sum}</span>{" "}
          (celle &gt;0: <span className="font-medium">{totals.nonZero}</span>)
        </div>
      </div>

      {/* Header ore */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <div className="min-w-[900px]">
          <div className="grid" style={{ gridTemplateColumns: `80px repeat(24, 1fr)` }}>
            <div className="bg-gray-50 text-[11px] text-gray-500 py-2 px-3 sticky left-0">Day/Hour</div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="bg-gray-50 text-[11px] text-gray-500 py-2 text-center">
                {h}
              </div>
            ))}
            {/* Rows */}
            {matrix.map((row, d) => (
              <Row
                key={d}
                label={DAY_LABELS[d]}
                values={row}
                max={max}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span className="text-gray-500">{legendNote ?? "Events per hour"}</span>
        <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-[hsl(210_80%_96%)] to-[hsl(210_80%_40%)]" />
        <div className="flex items-center gap-2">
          <span>0</span>
          <span className="text-gray-400">→</span>
          <span>{max}</span>
        </div>
      </div>
    </section>
  );
}

function Row({ label, values, max }: { label: string; values: number[]; max: number }) {
  return (
    <>
      <div className="bg-white text-[12px] text-gray-700 py-2 px-3 sticky left-0 border-t border-gray-100">
        {label}
      </div>
      {values.map((v, i) => (
        <div
          key={i}
          className="h-8 border-t border-gray-100"
          title={`${label} - ${i}:00 → ${v}`}
          style={{ backgroundColor: cellColor(v, max) }}
        />
      ))}
    </>
  );
}
