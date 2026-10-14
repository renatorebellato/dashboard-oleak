// Tabela "Por unidade": uma linha por conta do Google Ads dentro de um
// cliente multi-conta (ex: Grupo Meddi — uma conta por unidade/cidade).

import type { AccountSummary } from "@/lib/types";
import { fmtBRL, fmtInt, fmtPct, deltaLabel, deltaDirection } from "@/lib/format";

export default function AccountSummaryTable({ accounts }: { accounts: AccountSummary[] }) {
  const totalSpend = accounts.reduce((a, s) => a + (s.curr.spend || 0), 0);

  return (
    <div className="table-card">
      <div className="table-scroll">
        <table className="campaigns">
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Campanhas</th>
              <th>Investimento</th>
              <th>% do total</th>
              <th>Impressões</th>
              <th>Cliques</th>
              <th>CTR</th>
              <th>Conversões</th>
              <th>Custo/conv.</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((s) => {
              const conv = s.curr.conversions ?? null;
              const cpa = conv ? s.curr.spend / conv : null;
              const share = totalSpend > 0 ? ((s.curr.spend || 0) / totalSpend) * 100 : null;
              const dir = deltaDirection(s.delta_pct?.spend);
              return (
                <tr key={s.account_id}>
                  <td className="campaign-name-cell">
                    <div className="campaign-name">{s.account_name}</div>
                    <div className="campaign-meta">
                      {s.account_id}
                      {s.status === "erro_sincronizacao" ? (
                        <span className="unit-error"> · erro ao buscar{s.note ? `: ${s.note.slice(0, 120)}` : ""}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {s.campaigns_active}
                    {s.campaigns_total > s.campaigns_active ? (
                      <span className="muted"> / {s.campaigns_total}</span>
                    ) : null}
                  </td>
                  <td>
                    {fmtBRL(s.curr.spend)}
                    {s.delta_pct?.spend !== undefined && s.delta_pct?.spend !== null ? (
                      <span className={`cell-delta ${dir} inverse`}>{deltaLabel(s.delta_pct.spend)}</span>
                    ) : null}
                  </td>
                  <td>{fmtPct(share, 1)}</td>
                  <td>{fmtInt(s.curr.impressions)}</td>
                  <td>{fmtInt(s.curr.clicks)}</td>
                  <td>{fmtPct(s.curr.ctr)}</td>
                  <td>{conv != null ? fmtInt(Math.round(conv)) : "—"}</td>
                  <td>{fmtBRL(cpa)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="footer-note">
        Campanhas: ativas / total com veiculação no período. Variação do investimento comparada ao período anterior de
        mesma duração.
      </p>
    </div>
  );
}
