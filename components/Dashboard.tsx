"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { WeeklyReportRow } from "@/lib/types";
import { fmtBRL, fmtInt, fmtPct, fmtRoas, fmtDateRange, deltaLabel, deltaDirection } from "@/lib/format";
import CampaignTable from "@/components/CampaignTable";
import ImportModal from "@/components/ImportModal";

function StatTile({
  label,
  value,
  deltaPct,
  inverse = false,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  inverse?: boolean;
}) {
  const dir = deltaDirection(deltaPct);
  const cls = ["delta", dir, inverse ? "inverse" : ""].filter(Boolean).join(" ");
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {deltaPct !== undefined && <span className={cls}>{deltaLabel(deltaPct)} vs. período anterior</span>}
    </div>
  );
}

export default function Dashboard() {
  const [reports, setReports] = useState<WeeklyReportRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("weekly_reports")
      .select("*")
      .order("period_start", { ascending: false });
    if (!error && data) {
      setReports(data as WeeklyReportRow[]);
      setSelectedId((prev) => prev ?? (data[0]?.id ?? null));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadReports();
    const channel = supabase
      .channel("weekly_reports_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_reports" }, () => {
        loadReports();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadReports]);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId]
  );

  if (loading) {
    return (
      <div className="wrap">
        <p style={{ color: "var(--ink-muted)" }}>Carregando…</p>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="wrap">
        <div className="header">
          <div className="titles">
            <h1>Oleak — Performance de mídia paga</h1>
            <div className="sub">Google Ads + Meta Ads</div>
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => setShowImport(true)}>
              Importar relatório
            </button>
          </div>
        </div>
        <div className="empty-state">
          Nenhum relatório importado ainda. Clique em &quot;Importar relatório&quot; e cole o
          JSON gerado a partir do Google Ads e do Meta Ads.
        </div>
        {showImport && (
          <ImportModal onClose={() => setShowImport(false)} onImported={loadReports} />
        )}
      </div>
    );
  }

  const { data } = selected;
  const meta = data.meta;
  const google = data.google;
  const mc = meta.consolidated;

  return (
    <div className="wrap">
      <div className="header">
        <div className="titles">
          <h1>Oleak — Performance de mídia paga</h1>
          <div className="sub">
            {fmtDateRange(data.period.start, data.period.end)} · comparado a{" "}
            {fmtDateRange(data.previous_period.start, data.previous_period.end)}
          </div>
        </div>
        <div className="actions">
          {reports.length > 1 && (
            <select
              className="period-select"
              value={selected.id}
              onChange={(e) => setSelectedId(Number(e.target.value))}
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  Semana de {fmtDateRange(r.period_start, r.period_end)}
                </option>
              ))}
            </select>
          )}
          <button className="btn" onClick={() => setShowImport(true)}>
            Importar relatório
          </button>
        </div>
      </div>

      {mc && (
        <div className="tiles">
          <StatTile label="Investimento total" value={fmtBRL(mc.curr.spend)} deltaPct={mc.delta_pct.spend} inverse />
          <StatTile label="Impressões" value={fmtInt(mc.curr.impressions)} deltaPct={mc.delta_pct.impressions} />
          <StatTile label="Cliques" value={fmtInt(mc.curr.clicks)} deltaPct={mc.delta_pct.clicks} />
          <StatTile label="CTR" value={fmtPct(mc.curr.ctr)} deltaPct={mc.delta_pct.ctr} />
          <StatTile label="Conversões" value={fmtInt(mc.curr.conversions)} deltaPct={mc.delta_pct.conversions} />
          <StatTile label="ROAS" value={fmtRoas(mc.curr.roas)} deltaPct={mc.delta_pct.roas} />
        </div>
      )}

      {/* Meta Ads */}
      <section className="platform-section">
        <div className="platform-header">
          <span className="platform-badge meta">Meta Ads</span>
          <h2>{meta.account_name}</h2>
          <span className="acct">conta {meta.account_id}</span>
        </div>
        {meta.campaigns.length > 0 ? (
          <>
            <CampaignTable campaigns={meta.campaigns} />
            {meta.top_ad && (
              <div className="highlight-card">
                <div>
                  <div className="label">Anúncio destaque da semana</div>
                  <div className="name">{meta.top_ad.name}</div>
                </div>
                <div className="stats">
                  <div>
                    <span className="k">Investimento</span>
                    {fmtBRL(meta.top_ad.spend)}
                  </div>
                  <div>
                    <span className="k">Conversões</span>
                    {fmtInt(meta.top_ad.conversions)}
                  </div>
                  <div>
                    <span className="k">Valor gerado</span>
                    {fmtBRL(meta.top_ad.conv_value)}
                  </div>
                  <div>
                    <span className="k">ROAS</span>
                    {fmtRoas(meta.top_ad.roas)}
                  </div>
                </div>
              </div>
            )}
            {meta.excluded_note && <p className="footer-note">{meta.excluded_note}</p>}
          </>
        ) : (
          <div className="empty-state">Sem campanhas ativas ou com impressões no período.</div>
        )}
      </section>

      {/* Google Ads */}
      <section className="platform-section">
        <div className="platform-header">
          <span className="platform-badge google">Google Ads</span>
          <h2>{google.account_name}</h2>
          <span className="acct">conta {google.account_id}{google.mcc ? ` · MCC ${google.mcc}` : ""}</span>
        </div>
        {google.campaigns.length > 0 ? (
          <CampaignTable campaigns={google.campaigns} />
        ) : (
          <div className="empty-state">
            {google.note ?? "Sem campanhas ativas ou com impressões no período."}
          </div>
        )}
      </section>

      <p className="footer-note">
        Relatório gerado em {new Date(data.generated_at).toLocaleString("pt-BR")}
      </p>

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={loadReports} />
      )}
    </div>
  );
}
