import type { Campaign } from "@/lib/types";
import { fmtBRL, fmtInt, fmtPct, fmtRoas, deltaLabel, deltaDirection } from "@/lib/format";

function DeltaTag({ pct, inverse = false }: { pct: number | null | undefined; inverse?: boolean }) {
  const dir = deltaDirection(pct);
  const cls = ["cell-delta", dir, inverse ? "inverse" : ""].filter(Boolean).join(" ");
  return <span className={cls}>{deltaLabel(pct)}</span>;
}

export default function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <div className="table-card">
      <div className="table-scroll">
        <table className="campaigns">
          <thead>
            <tr>
              <th>Campanha</th>
              <th>Investimento</th>
              <th>Impressões</th>
              <th>Cliques</th>
              <th>CTR</th>
              <th>CPC</th>
              <th>Resultados</th>
              <th>Custo/resultado</th>
              <th>ROAS</th>
              <th>Frequência</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const conv = c.curr.conversions ?? c.curr.results ?? null;
              const cpa = c.curr.cpa ?? (c.curr.conversions ? c.curr.spend / c.curr.conversions : null);
              return (
                <tr key={c.name}>
                  <td className="campaign-name-cell">
                    <div className="campaign-name">
                      <span className={`status-dot ${c.status}`} title={c.status === "ativa" ? "Ativa" : "Pausada"} />
                      {c.name}
                    </div>
                    <div className="campaign-meta">
                      {c.objective}
                      {c.status_note ? ` · ${c.status_note}` : ""}
                    </div>
                  </td>
                  <td>
                    {fmtBRL(c.curr.spend)}
                    <DeltaTag pct={c.delta_pct.spend} inverse />
                  </td>
                  <td>
                    {fmtInt(c.curr.impressions)}
                    <DeltaTag pct={c.delta_pct.impressions} />
                  </td>
                  <td>
                    {fmtInt(c.curr.clicks)}
                    <DeltaTag pct={c.delta_pct.clicks} />
                  </td>
                  <td>
                    {fmtPct(c.curr.ctr)}
                    <DeltaTag pct={c.delta_pct.ctr} />
                  </td>
                  <td>
                    {fmtBRL(c.curr.cpc)}
                    <DeltaTag pct={c.delta_pct.cpc} inverse />
                  </td>
                  <td>
                    {fmtInt(conv)}
                    <span className="cell-delta flat">{c.result_label ?? ""}</span>
                  </td>
                  <td>
                    {cpa ? fmtBRL(cpa) : "—"}
                    <DeltaTag pct={c.delta_pct.cpa} inverse />
                  </td>
                  <td>
                    {c.curr.roas ? fmtRoas(c.curr.roas) : "—"}
                    {c.delta_pct.roas !== undefined && <DeltaTag pct={c.delta_pct.roas} />}
                  </td>
                  <td>{c.curr.frequency ? c.curr.frequency.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
