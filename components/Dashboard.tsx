"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ReportData, WeeklyReportRow } from "@/lib/types";
import { fmtBRL, fmtInt, fmtPct, fmtRoas, fmtDateRange, deltaLabel, deltaDirection } from "@/lib/format";
import { combineMetricSets, deltaPct } from "@/lib/metrics";
import { periodDays } from "@/lib/period";
import CampaignTable from "@/components/CampaignTable";
import ImportModal from "@/components/ImportModal";
import PeriodControl, { presetToRange } from "@/components/PeriodControl";
import SalesChart from "@/components/SalesChart";
import TopAdsHighlight from "@/components/TopAdsHighlight";
import InvestmentSplit from "@/components/InvestmentSplit";
import BudgetControl, { useMonthlyBudget } from "@/components/BudgetControl";

const LIVE_REFRESH_MS = 5 * 60 * 1000; // atualiza sozinho a cada 5 minutos

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

function ReportView({
  data,
  monthlyBudget,
  onChangeBudget,
}: {
  data: ReportData;
  monthlyBudget: number | null;
  onChangeBudget: (v: number | null) => void;
}) {
  const meta = data.meta;
  const google = data.google;

  const combinedCurr = combineMetricSets(meta.consolidated?.curr, google.consolidated?.curr);
  const combinedPrev = combineMetricSets(meta.consolidated?.prev, google.consolidated?.prev);
  const combinedDelta = deltaPct(combinedCurr, combinedPrev);
  const days = periodDays(data.period);

  return (
    <>
      {(meta.consolidated || google.consolidated) && (
        <div className="summary-block">
          <div className="tiles">
            <StatTile label="Investimento total" value={fmtBRL(combinedCurr.spend)} deltaPct={combinedDelta.spend} inverse />
            <StatTile label="Impressões" value={fmtInt(combinedCurr.impressions)} deltaPct={combinedDelta.impressions} />
            <StatTile label="Cliques" value={fmtInt(combinedCurr.clicks)} deltaPct={combinedDelta.clicks} />
            <StatTile label="CTR" value={fmtPct(combinedCurr.ctr)} deltaPct={combinedDelta.ctr} />
            <StatTile label="Conversões" value={fmtInt(combinedCurr.conversions)} deltaPct={combinedDelta.conversions} />
            <StatTile label="ROAS" value={fmtRoas(combinedCurr.roas)} deltaPct={combinedDelta.roas} />
          </div>
          <InvestmentSplit metaSpend={meta.consolidated?.curr.spend ?? 0} googleSpend={google.consolidated?.curr.spend ?? 0} />
          <BudgetControl
            metaSpend={meta.consolidated?.curr.spend ?? 0}
            googleSpend={google.consolidated?.curr.spend ?? 0}
            days={days}
            monthlyBudget={monthlyBudget}
            onChangeBudget={onChangeBudget}
          />
        </div>
      )}

      {/* Meta Ads */}
      <section className="platform-section">
        <div className="platform-header">
          <span className="platform-badge meta">Meta Ads</span>
          <h2>{meta.account_name}</h2>
          <span className="acct">
            conta {meta.account_id}
            {meta.consolidated && ` · ${fmtBRL(meta.consolidated.curr.spend)} investidos`}
          </span>
        </div>
        {meta.campaigns.length > 0 ? (
          <>
            <CampaignTable campaigns={meta.campaigns} />
            <TopAdsHighlight roas={meta.top_ad_roas} conversions={meta.top_ad_conversions} />
            {meta.daily_sales && meta.daily_sales.length > 0 && <SalesChart data={meta.daily_sales} />}
            {meta.excluded_note && <p className="footer-note">{meta.excluded_note}</p>}
          </>
        ) : (
          <div className="empty-state">{meta.note ?? "Sem campanhas ativas ou com impressões no período."}</div>
        )}
      </section>

      {/* Google Ads */}
      <section className="platform-section">
        <div className="platform-header">
          <span className="platform-badge google">Google Ads</span>
          <h2>{google.account_name}</h2>
          <span className="acct">
            conta {google.account_id}
            {google.mcc ? ` · MCC ${google.mcc}` : ""}
            {google.consolidated && ` · ${fmtBRL(google.consolidated.curr.spend)} investidos`}
          </span>
        </div>
        {google.campaigns.length > 0 ? (
          <CampaignTable campaigns={google.campaigns} />
        ) : (
          <div className="empty-state">{google.note ?? "Sem campanhas ativas ou com impressões no período."}</div>
        )}
      </section>
    </>
  );
}

export default function Dashboard() {
  const [mode, setMode] = useState<"live" | "historico">("live");
  const [monthlyBudget, setMonthlyBudget] = useMonthlyBudget();

  // --- Modo Ao vivo: busca direto do Meta Ads e Google Ads via /api/live ---
  const [period, setPeriod] = useState(() => ({ key: "7d", ...presetToRange("7d") }));
  const [liveData, setLiveData] = useState<ReportData | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<Date | null>(null);

  const loadLive = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!period.start || !period.end || period.start > period.end) return;
      if (!opts?.silent) setLiveLoading(true);
      setLiveError(null);
      try {
        const qs = new URLSearchParams({ start: period.start, end: period.end }).toString();
        const res = await fetch(`/api/live?${qs}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar dados ao vivo.");
        setLiveData(json as ReportData);
        setLiveUpdatedAt(new Date());
      } catch (e: any) {
        setLiveError(String(e?.message ?? e));
      } finally {
        setLiveLoading(false);
      }
    },
    [period]
  );

  useEffect(() => {
    loadLive();
    const interval = setInterval(() => loadLive({ silent: true }), LIVE_REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start, period.end]);

  // --- Modo Histórico: relatórios semanais salvos no Supabase ---
  const [reports, setReports] = useState<WeeklyReportRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const loadReports = useCallback(async () => {
    const { data, error } = await supabase
      .from("weekly_reports")
      .select("*")
      .order("period_start", { ascending: false });
    if (!error && data) {
      setReports(data as WeeklyReportRow[]);
      setSelectedId((prev) => prev ?? (data[0]?.id ?? null));
    }
    setReportsLoaded(true);
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

  const lastUpdatedLabel = liveUpdatedAt
    ? liveUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const subtitle =
    mode === "live" && liveData ? (
      <>
        {fmtDateRange(liveData.period.start, liveData.period.end)} · comparado a{" "}
        {fmtDateRange(liveData.previous_period.start, liveData.previous_period.end)}
      </>
    ) : mode === "historico" && selected ? (
      <>
        {fmtDateRange(selected.data.period.start, selected.data.period.end)} · comparado a{" "}
        {fmtDateRange(selected.data.previous_period.start, selected.data.previous_period.end)}
      </>
    ) : (
      "Google Ads + Meta Ads"
    );

  return (
    <div className="wrap">
      <div className="header">
        <div className="titles">
          <h1>Oleak — Performance de mídia paga</h1>
          <div className="sub">{subtitle}</div>
        </div>
        <div className="actions">
          <div className="mode-toggle">
            <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>
              Ao vivo
            </button>
            <button className={mode === "historico" ? "active" : ""} onClick={() => setMode("historico")}>
              Histórico
            </button>
          </div>

          {mode === "live" && (
            <>
              <PeriodControl
                selectedKey={period.key}
                customStart={period.key === "custom" ? period.start : ""}
                customEnd={period.key === "custom" ? period.end : ""}
                onChange={(sel) => setPeriod(sel)}
              />
              <span className="live-indicator">
                <span className="live-dot" />
                {liveLoading ? "Atualizando…" : lastUpdatedLabel ? `Atualizado às ${lastUpdatedLabel}` : ""}
              </span>
              <button className="btn" onClick={() => loadLive()} disabled={liveLoading}>
                Atualizar agora
              </button>
            </>
          )}

          {mode === "historico" && selected && reports.length > 1 && (
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

      {mode === "live" ? (
        liveLoading && !liveData ? (
          <p style={{ color: "var(--ink-muted)" }}>Carregando dados ao vivo…</p>
        ) : liveError && !liveData ? (
          <div className="empty-state">
            Não foi possível carregar os dados ao vivo agora. {liveError}
            <div style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => loadLive()}>
                Tentar novamente
              </button>
            </div>
          </div>
        ) : liveData ? (
          <>
            {liveError && (
              <p className="footer-note" style={{ color: "var(--danger)" }}>
                A última tentativa de atualização falhou ({liveError}) — mostrando os últimos dados carregados com
                sucesso.
              </p>
            )}
            <ReportView data={liveData} monthlyBudget={monthlyBudget} onChangeBudget={setMonthlyBudget} />
            <p className="footer-note">
              Dados buscados direto do Meta Ads e do Google Ads em {new Date(liveData.generated_at).toLocaleString("pt-BR")}
              . Atualiza sozinho a cada 5 minutos, ou clique em &quot;Atualizar agora&quot;.
            </p>
          </>
        ) : null
      ) : !reportsLoaded ? (
        <p style={{ color: "var(--ink-muted)" }}>Carregando…</p>
      ) : !selected ? (
        <div className="empty-state">
          Nenhum relatório salvo ainda. Clique em &quot;Importar relatório&quot; e cole o JSON gerado, ou aguarde a
          próxima sincronização automática de segunda-feira.
        </div>
      ) : (
        <>
          <ReportView data={selected.data} monthlyBudget={monthlyBudget} onChangeBudget={setMonthlyBudget} />
          <p className="footer-note">
            Relatório gerado em {new Date(selected.data.generated_at).toLocaleString("pt-BR")}
          </p>
        </>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={loadReports} />}
    </div>
  );
}
