"use client";

// Leads (barras) e custo por lead (linha) ao longo do tempo. São dois painéis
// empilhados com o MESMO eixo de datas e tooltip sincronizado — em vez de um
// gráfico com dois eixos verticais, que distorce a comparação entre as duas
// grandezas (escalas muito diferentes).

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Granularity, SeriesPoint } from "@/lib/groupMetrics";
import { fmtBRL, fmtNum } from "@/lib/format";

const axisTick = { fontSize: 11, fill: "var(--ink-muted)" };

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as SeriesPoint;
  return (
    <div className="gd-tooltip">
      <div className="gd-tooltip-title">{p.range}</div>
      <div className="gd-tooltip-row">
        <i className="gd-key leads" />
        <strong>{fmtNum(p.leads, p.leads % 1 ? 1 : 0)}</strong>
        <span>leads</span>
      </div>
      <div className="gd-tooltip-row">
        <i className="gd-key cpl" />
        <strong>{p.cpl != null ? fmtBRL(p.cpl) : "—"}</strong>
        <span>custo por lead</span>
      </div>
      <div className="gd-tooltip-row muted">
        <span>Investimento {fmtBRL(p.spend)}</span>
      </div>
    </div>
  );
}

export default function LeadsChart({ points, granularity }: { points: SeriesPoint[]; granularity: Granularity }) {
  const hasData = points.some((p) => p.leads > 0 || p.spend > 0);

  return (
    <div className="chart-card gd-chart">
      <div className="chart-card-header">
        <h3>Leads e custo por lead</h3>
        <span className="chart-card-sub">Por {granularity} · conversões do Google Ads</span>
      </div>
      {!hasData ? (
        <div className="empty-state">Sem veiculação no período e filtros selecionados.</div>
      ) : (
        <>
          <div className="gd-panel-label">
            <i className="gd-swatch leads" /> Leads
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={points} syncId="gd-leads" margin={{ top: 6, right: 22, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" hide />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-alt)" }} />
              <Bar dataKey="leads" name="Leads" fill="var(--chart-leads)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>

          <div className="gd-panel-label">
            <i className="gd-swatch-line cpl" /> Custo por lead
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={points} syncId="gd-leads" margin={{ top: 6, right: 22, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: "var(--border)" }} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
              <YAxis
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v) => `R$${Math.round(v)}`}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--ink-muted)", strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="cpl"
                name="Custo por lead"
                stroke="var(--chart-cpl)"
                strokeWidth={2}
                dot={points.length <= 31 ? { r: 3, strokeWidth: 0, fill: "var(--chart-cpl)" } : false}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
