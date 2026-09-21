"use client";

// Gráfico diário de compras (barra) x ROAS (linha), só para campanhas do
// Meta Ads com objetivo de vendas. Só existe no modo Ao vivo — os snapshots
// semanais salvos no Supabase guardam apenas o total da semana.

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DailySalesPoint } from "@/lib/types";
import { fmtInt, fmtDate } from "@/lib/format";

export default function SalesChart({ data }: { data: DailySalesPoint[] }) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((d) => ({
    date: fmtDate(d.date).slice(0, 5), // dd/mm
    compras: d.purchases,
    roas: d.roas,
  }));

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h3>Compras e ROAS por dia</h3>
        <span className="chart-card-sub">Campanhas com objetivo de vendas — Meta Ads</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}x`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12.5,
            }}
            labelStyle={{ color: "var(--ink)", fontWeight: 600, marginBottom: 4 }}
            formatter={(value: any, name: any) => {
              const label = String(name);
              if (label === "ROAS") return [value != null ? `${Number(value).toFixed(2)}x` : "—", label];
              if (label === "Compras") return [fmtInt(value), label];
              return [value, label];
            }}
            labelFormatter={(label) => `Dia ${label}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="compras" name="Compras" fill="var(--meta)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="roas"
            name="ROAS"
            stroke="var(--good)"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
