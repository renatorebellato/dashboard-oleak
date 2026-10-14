"use client";

// Layout padrão para clientes com várias contas do Google Ads (ex: Grupo
// Meddi — uma conta por unidade). Uma barra de filtros no topo (período,
// conta, campanha) vale para tudo abaixo dela: indicadores, gráfico, tabela
// de contas/campanhas e top 10 de palavras-chave e termos de pesquisa.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GroupDashboardData } from "@/lib/groupTypes";
import {
  ALL,
  buildSeries,
  derive,
  pctChange,
  ppChange,
  selectedCampaigns,
  sumRaw,
  type Selection,
} from "@/lib/groupMetrics";
import { deltaDirection, deltaLabel, fmtBRL, fmtDateRange, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import PeriodControl, { presetToRange } from "@/components/PeriodControl";
import LeadsChart from "./LeadsChart";
import AccountCampaignTable from "./AccountCampaignTable";
import TopTermsTable from "./TopTermsTable";

const REFRESH_MS = 10 * 60 * 1000;

function Tile({
  label,
  value,
  delta,
  deltaKind = "pct",
  inverse = false,
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaKind?: "pct" | "pp";
  inverse?: boolean;
  hint?: string;
}) {
  const dir = deltaDirection(delta);
  const text =
    delta == null
      ? "—"
      : deltaKind === "pp"
      ? `${delta > 0 ? "+" : ""}${fmtNum(delta, 1)} p.p.`
      : deltaLabel(delta);
  return (
    <div className="tile" title={hint}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta !== undefined && (
        <span className={["delta", dir, inverse ? "inverse" : ""].filter(Boolean).join(" ")} title="Comparado ao período anterior de mesma duração">
          {text} <span className="gd-delta-suffix">vs. anterior</span>
        </span>
      )}
    </div>
  );
}

export default function GroupDashboard({ defaultPeriod = "ytd" }: { defaultPeriod?: string }) {
  const [period, setPeriod] = useState(() => ({ key: defaultPeriod, ...presetToRange(defaultPeriod) }));
  const [selection, setSelection] = useState<Selection>({ account: ALL, campaign: ALL });
  const [data, setData] = useState<GroupDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { fresh?: boolean; silent?: boolean }) => {
      if (!period.start || !period.end || period.start > period.end) return;
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ start: period.start, end: period.end, ...(opts?.fresh ? { fresh: "1" } : {}) });
        const res = await fetch(`/api/group?${qs}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar os dados.");
        setData(json as GroupDashboardData);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [period]
  );

  useEffect(() => {
    load();
    const t = setInterval(() => load({ silent: true }), REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start, period.end]);

  // Se a conta/campanha filtrada não existir no novo período, volta para "todas".
  useEffect(() => {
    if (!data) return;
    const acc = data.accounts.find((a) => a.id === selection.account);
    if (selection.account !== ALL && !acc) setSelection({ account: ALL, campaign: ALL });
    else if (selection.campaign !== ALL && !data.accounts.some((a) => a.campaigns.some((c) => c.id === selection.campaign)))
      setSelection((s) => ({ ...s, campaign: ALL }));
  }, [data, selection.account, selection.campaign]);

  const view = useMemo(() => {
    if (!data) return null;
    const picked = selectedCampaigns(data, selection);
    const curr = derive(sumRaw(picked.map((p) => p.campaign.curr)));
    const prev = derive(sumRaw(picked.map((p) => p.campaign.prev)));
    const series = buildSeries(
      picked.map((p) => p.campaign),
      data.period
    );
    return { curr, prev, series, count: picked.length };
  }, [data, selection]);

  const accountOptions = data?.accounts ?? [];
  const campaignOptions = useMemo(() => {
    if (!data) return [];
    return data.accounts
      .filter((a) => selection.account === ALL || a.id === selection.account)
      .map((a) => ({ account: a, campaigns: a.campaigns }));
  }, [data, selection.account]);

  const filtered = selection.account !== ALL || selection.campaign !== ALL;
  const accountName = data?.accounts.find((a) => a.id === selection.account)?.name;
  const campaignName = data?.accounts.flatMap((a) => a.campaigns).find((c) => c.id === selection.campaign)?.name;

  return (
    <div className="wrap gd-wrap">
      <header className="gd-header">
        <div className="titles">
          <h1>{data?.client_name ?? "Dashboard"} — Google Ads</h1>
          <div className="sub">
            {data ? (
              <>
                {fmtDateRange(data.period.start, data.period.end)} · comparado a{" "}
                {fmtDateRange(data.previous_period.start, data.previous_period.end)}
              </>
            ) : (
              "Carregando…"
            )}
          </div>
        </div>
        <div className="actions">
          <span className="live-indicator">
            <span className="live-dot" />
            {loading ? "Atualizando…" : data ? `Atualizado às ${new Date(data.generated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
          <button className="btn" onClick={() => load({ fresh: true })} disabled={loading}>
            Atualizar agora
          </button>
          <button
            className="btn"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              const m = window.location.pathname.match(/^\/(?:c\/)?([a-z0-9-]+)/);
              window.location.href = m ? `/${m[1]}/login` : "/";
            }}
          >
            Sair
          </button>
        </div>
      </header>

      {/* Barra de filtros: vale para tudo abaixo */}
      <div className="gd-filterbar">
        <PeriodControl
          selectedKey={period.key}
          customStart={period.key === "custom" ? period.start : ""}
          customEnd={period.key === "custom" ? period.end : ""}
          onChange={(sel) => setPeriod(sel)}
        />
        <div className="gd-filters">
          <label className="gd-field">
            <span>Conta</span>
            <select
              className="period-select"
              value={selection.account}
              onChange={(e) => setSelection({ account: e.target.value, campaign: ALL })}
              disabled={!data}
            >
              <option value={ALL}>Todas as contas ({accountOptions.length})</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="gd-field">
            <span>Campanha</span>
            <select
              className="period-select"
              value={selection.campaign === ALL ? ALL : `${selection.account}|${selection.campaign}`}
              onChange={(e) => {
                const v = e.target.value;
                if (v === ALL) return setSelection((s) => ({ ...s, campaign: ALL }));
                const [account, campaign] = v.split("|");
                setSelection({ account, campaign });
              }}
              disabled={!data}
            >
              <option value={ALL}>Todas as campanhas</option>
              {campaignOptions.map(({ account, campaigns }) =>
                selection.account === ALL ? (
                  <optgroup key={account.id} label={account.name}>
                    {campaigns.map((c) => (
                      <option key={c.id} value={`${account.id}|${c.id}`}>
                        {c.name}
                        {c.status === "pausada" ? " (pausada)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  campaigns.map((c) => (
                    <option key={c.id} value={`${account.id}|${c.id}`}>
                      {c.name}
                      {c.status === "pausada" ? " (pausada)" : ""}
                    </option>
                  ))
                )
              )}
            </select>
          </label>
          {filtered && (
            <button type="button" className="btn gd-clear" onClick={() => setSelection({ account: ALL, campaign: ALL })}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {filtered && (
        <div className="gd-scope">
          Mostrando: <strong>{accountName ?? "Todas as contas"}</strong>
          {campaignName ? (
            <>
              {" "}
              › <strong>{campaignName}</strong>
            </>
          ) : null}
        </div>
      )}

      {loading && !data ? (
        <p className="muted">Carregando dados do Google Ads de todas as contas…</p>
      ) : error && !data ? (
        <div className="empty-state">
          Não foi possível carregar os dados agora. {error}
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => load({ fresh: true })}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : data && view ? (
        <div className={loading ? "gd-body refreshing" : "gd-body"}>
          {error && <p className="footer-note gd-error">A última atualização falhou ({error}) — mostrando os últimos dados carregados.</p>}
          {data.note && <p className="footer-note gd-error">{data.note}</p>}

          <section className="tiles gd-tiles gd-kpis">
            <Tile label="Investimento" value={fmtBRL(view.curr.spend)} delta={pctChange(view.curr.spend, view.prev.spend)} inverse />
            <Tile label="Leads (conversões)" value={fmtInt(Math.round(view.curr.conversions))} delta={pctChange(view.curr.conversions, view.prev.conversions)} />
            <Tile label="Custo por lead" value={fmtBRL(view.curr.cpl)} delta={pctChange(view.curr.cpl, view.prev.cpl)} inverse />
            <Tile
              label="Taxa de conversão"
              value={fmtPct(view.curr.convRate)}
              delta={pctChange(view.curr.convRate, view.prev.convRate)}
              hint="Leads ÷ cliques"
            />
            <Tile label="Cliques" value={fmtInt(view.curr.clicks)} delta={pctChange(view.curr.clicks, view.prev.clicks)} />
            <Tile label="CTR" value={fmtPct(view.curr.ctr)} delta={pctChange(view.curr.ctr, view.prev.ctr)} />
            <Tile label="CPC médio" value={fmtBRL(view.curr.cpc)} delta={pctChange(view.curr.cpc, view.prev.cpc)} inverse />
            <Tile label="Impressões" value={fmtInt(view.curr.impressions)} delta={pctChange(view.curr.impressions, view.prev.impressions)} />
          </section>

          <div className="gd-section-title">
            Parcela de impressões <span>· rede de Pesquisa, média ponderada entre as campanhas</span>
          </div>
          <section className="tiles gd-tiles gd-is">
            <Tile
              label="Perdida por orçamento"
              value={fmtPct(view.curr.budgetLost, 1)}
              delta={ppChange(view.curr.budgetLost, view.prev.budgetLost)}
              deltaKind="pp"
              inverse
              hint="Parcela das impressões que os anúncios deixaram de receber porque o orçamento acabou"
            />
            <Tile
              label="Na parte superior"
              value={fmtPct(view.curr.top, 1)}
              delta={ppChange(view.curr.top, view.prev.top)}
              deltaKind="pp"
              hint="Parcela das impressões exibidas acima dos resultados orgânicos"
            />
            <Tile
              label="Na 1ª posição"
              value={fmtPct(view.curr.absTop, 1)}
              delta={ppChange(view.curr.absTop, view.prev.absTop)}
              deltaKind="pp"
              hint="Parcela das impressões exibidas como o primeiro anúncio da página (topo absoluto)"
            />
          </section>

          <LeadsChart points={view.series.points} granularity={view.series.granularity} />

          <AccountCampaignTable accounts={data.accounts} selection={selection} onSelect={setSelection} />

          <div className="gd-terms-grid">
            <TopTermsTable
              title="Principais palavras-chave"
              subtitle="Top 10 no período"
              rows={data.keywords}
              selection={selection}
              accounts={data.accounts}
              showMatch
            />
            <TopTermsTable
              title="Principais termos de pesquisa"
              subtitle="O que as pessoas buscaram e acionou os anúncios (campanhas de Pesquisa)"
              rows={data.search_terms}
              selection={selection}
              accounts={data.accounts}
            />
          </div>

          <p className="footer-note">
            Dados buscados direto do Google Ads em {new Date(data.generated_at).toLocaleString("pt-BR")}. Campanhas
            listadas: ativas ou com impressões no período. Leads = conversões registradas no Google Ads.
          </p>
        </div>
      ) : null}
    </div>
  );
}
