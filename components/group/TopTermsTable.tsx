"use client";

// Top 10 palavras-chave ou termos de pesquisa, ordenáveis por cliques ou por
// conversões, sempre dentro do filtro de conta/campanha do topo.

import { useState } from "react";
import type { GroupAccount, TermRow } from "@/lib/groupTypes";
import { topTerms, type Selection } from "@/lib/groupMetrics";
import { fmtBRL, fmtInt } from "@/lib/format";

const MATCH: Record<string, string> = { EXACT: "Exata", PHRASE: "Frase", BROAD: "Ampla" };

export default function TopTermsTable({
  title,
  subtitle,
  rows,
  selection,
  accounts,
  showMatch = false,
}: {
  title: string;
  subtitle: string;
  rows: TermRow[];
  selection: Selection;
  accounts: GroupAccount[];
  showMatch?: boolean;
}) {
  const [by, setBy] = useState<"clicks" | "conversions">("clicks");
  const list = topTerms(rows, selection, by, 10);
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="table-card gd-terms">
      <div className="gd-table-toolbar">
        <div>
          <h3>{title}</h3>
          <div className="gd-table-sub">{subtitle}</div>
        </div>
        <div className="gd-segmented" role="group" aria-label="Ordenar por">
          <button type="button" className={by === "clicks" ? "active" : ""} onClick={() => setBy("clicks")}>
            Cliques
          </button>
          <button type="button" className={by === "conversions" ? "active" : ""} onClick={() => setBy("conversions")}>
            Conversões
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="gd-empty">
          {by === "conversions" ? "Nenhum item com conversões" : "Nenhum item com cliques"} no período e filtros selecionados.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="campaigns gd-terms-table">
            <thead>
              <tr>
                <th>{showMatch ? "Palavra-chave" : "Termo de pesquisa"}</th>
                <th>Cliques</th>
                <th>Conv.</th>
                <th>Custo/conv.</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t, i) => (
                <tr key={`${t.text}|${t.match ?? ""}`}>
                  <td className="campaign-name-cell">
                    <div className="campaign-name gd-term">
                      <span className="gd-rank">{i + 1}</span>
                      <span className="gd-term-text">{t.text}</span>
                      {showMatch && t.match && MATCH[t.match] && <span className="gd-badge">{MATCH[t.match]}</span>}
                    </div>
                    <div className="campaign-meta gd-term-meta">
                      {t.accounts.length === 1 ? nameOf(t.accounts[0]) : `${t.accounts.length} unidades`}
                    </div>
                  </td>
                  <td>{fmtInt(t.clicks)}</td>
                  <td>{t.conversions ? fmtInt(Math.round(t.conversions)) : "0"}</td>
                  <td>{t.conversions > 0 ? fmtBRL(t.spend / t.conversions) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
