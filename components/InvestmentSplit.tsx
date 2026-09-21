// Barra compacta mostrando a divisão do investimento total entre Meta Ads e
// Google Ads — complemento visual da visão consolidada no topo do dashboard.

import { fmtBRL, fmtPct } from "@/lib/format";

export default function InvestmentSplit({
  metaSpend,
  googleSpend,
}: {
  metaSpend: number;
  googleSpend: number;
}) {
  const total = metaSpend + googleSpend;
  if (total <= 0) return null;

  const metaPct = (metaSpend / total) * 100;
  const googlePct = 100 - metaPct;

  return (
    <div className="split-card">
      <div className="split-bar">
        <span className="split-seg meta" style={{ width: `${metaPct}%` }} />
        <span className="split-seg google" style={{ width: `${googlePct}%` }} />
      </div>
      <div className="split-legend">
        <span>
          <i className="dot meta" /> Meta Ads: {fmtBRL(metaSpend)} ({fmtPct(metaPct, 0)})
        </span>
        <span>
          <i className="dot google" /> Google Ads: {fmtBRL(googleSpend)} ({fmtPct(googlePct, 0)})
        </span>
      </div>
    </div>
  );
}
