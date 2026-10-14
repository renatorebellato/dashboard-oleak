"use client";

// Contas (unidades) com as campanhas agrupadas logo abaixo de cada uma.
// Clicar na linha da conta abre/fecha as campanhas; "Filtrar" aplica a conta
// (ou a campanha) no filtro do topo, que vale para o dashboard inteiro.

import { useEffect, useState } from "react";
import type { GroupAccount, GroupCampaign } from "@/lib/groupTypes";
import { ALL, derive, sumRaw, type Selection } from "@/lib/groupMetrics";
import { fmtBRL, fmtInt, fmtPct } from "@/lib/format";

const CHANNEL: Record<string, string> = {
  SEARCH: "Pesquisa",
  PERFORMANCE_MAX: "Performance Max",
  DISPLAY: "Display",
  VIDEO: "Vídeo",
  DEMAND_GEN: "Demand Gen",
  DISCOVERY: "Discovery",
  SHOPPING: "Shopping",
  LOCAL: "Local",
  SMART: "Inteligente",
  MULTI_CHANNEL: "App",
};

function MetricCells({ campaigns }: { campaigns: GroupCampaign[] }) {
  const d = derive(sumRaw(campaigns.map((c) => c.curr)));
  return (
    <>
      <td>{fmtBRL(d.spend)}</td>
      <td>{fmtInt(d.impressions)}</td>
      <td>{fmtInt(d.clicks)}</td>
      <td>{fmtPct(d.ctr)}</td>
      <td>{d.conversions ? fmtInt(Math.round(d.conversions)) : "0"}</td>
      <td>{fmtBRL(d.cpl)}</td>
      <td>{fmtPct(d.budgetLost, 1)}</td>
      <td>{fmtPct(d.top, 1)}</td>
      <td>{fmtPct(d.absTop, 1)}</td>
    </>
  );
}

export default function AccountCampaignTable({
  accounts,
  selection,
  onSelect,
}: {
  accounts: GroupAccount[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Conta filtrada no topo já abre com as campanhas à mostra.
  useEffect(() => {
    if (selection.account !== ALL) setOpen((prev) => new Set(prev).add(selection.account));
  }, [selection.account]);

  const visible = accounts.filter((a) => selection.account === ALL || a.id === selection.account);
  const allOpen = visible.length > 0 && visible.every((a) => open.has(a.id));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="table-card">
      <div className="gd-table-toolbar">
        <h3>Contas e campanhas</h3>
        <button
          type="button"
          className="gd-link"
          onClick={() => setOpen(allOpen ? new Set() : new Set(visible.map((a) => a.id)))}
        >
          {allOpen ? "Recolher todas" : "Expandir todas"}
        </button>
      </div>
      <div className="table-scroll">
        <table className="campaigns gd-grouped">
          <thead>
            <tr>
              <th>Conta / campanha</th>
              <th>Investimento</th>
              <th>Impr.</th>
              <th>Cliques</th>
              <th>CTR</th>
              <th>Leads</th>
              <th>Custo/lead</th>
              <th title="Parcela de impressões perdida por orçamento (Pesquisa)">Perda orç.</th>
              <th title="Parcela de impressões na parte superior (Pesquisa)">Parte sup.</th>
              <th title="Parcela de impressões na primeira posição (Pesquisa)">1ª posição</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => {
              const isOpen = open.has(a.id);
              const campaigns = a.campaigns.filter((c) => selection.campaign === ALL || c.id === selection.campaign);
              const active = a.campaigns.filter((c) => c.status === "ativa").length;
              return [
                <tr key={a.id} className="gd-account-row" onClick={() => toggle(a.id)}>
                  <td className="campaign-name-cell">
                    <div className="campaign-name">
                      <button
                        type="button"
                        className={`gd-chevron ${isOpen ? "open" : ""}`}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Recolher ${a.name}` : `Expandir ${a.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(a.id);
                        }}
                      >
                        ›
                      </button>
                      {a.name}
                    </div>
                    <div className="campaign-meta gd-account-meta">
                      {a.id} · {active} ativa{active === 1 ? "" : "s"}
                      {a.campaigns.length > active ? ` de ${a.campaigns.length}` : ""}
                      {selection.account !== a.id && (
                        <button
                          type="button"
                          className="gd-link small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect({ account: a.id, campaign: ALL });
                          }}
                        >
                          Filtrar
                        </button>
                      )}
                      {a.status === "erro_sincronizacao" && <span className="unit-error"> · erro ao buscar a conta</span>}
                    </div>
                  </td>
                  <MetricCells campaigns={campaigns} />
                </tr>,
                ...(isOpen
                  ? campaigns.length === 0
                    ? [
                        <tr key={`${a.id}:empty`} className="gd-campaign-row">
                          <td colSpan={10} className="campaign-name-cell muted">
                            Nenhuma campanha ativa ou com impressões no período.
                          </td>
                        </tr>,
                      ]
                    : campaigns.map((c) => (
                        <tr key={`${a.id}:${c.id}`} className="gd-campaign-row">
                          <td className="campaign-name-cell">
                            <div className="campaign-name">
                              <span className={`status-dot ${c.status}`} title={c.status === "ativa" ? "Ativa" : "Pausada"} />
                              <button
                                type="button"
                                className="gd-campaign-link"
                                title="Filtrar o dashboard por esta campanha"
                                onClick={() => onSelect({ account: a.id, campaign: c.id })}
                              >
                                {c.name}
                              </button>
                            </div>
                            <div className="campaign-meta">
                              {CHANNEL[c.channel] ?? c.channel}
                              {c.status === "pausada" ? " · pausada" : ""}
                            </div>
                          </td>
                          <MetricCells campaigns={[c]} />
                        </tr>
                      ))
                  : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
