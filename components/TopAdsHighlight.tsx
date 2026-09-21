// Cards de "anúncio destaque" com preview da criativa: um pelo maior ROAS e
// outro pelo maior número de compras (dentro das campanhas de vendas). Só
// aparece quando o /api/live consegue calcular esses destaques.

import type { TopAd } from "@/lib/types";
import { fmtBRL, fmtInt, fmtRoas } from "@/lib/format";

function AdCard({ label, ad }: { label: string; ad: TopAd }) {
  const img = ad.image_url ?? ad.thumbnail_url;
  return (
    <div className="ad-card">
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={ad.name} className="ad-card-img" />
      ) : (
        <div className="ad-card-img ad-card-img-empty">Sem preview</div>
      )}
      <div className="ad-card-body">
        <div className="ad-card-label">{label}</div>
        <div className="ad-card-name" title={ad.name}>
          {ad.name}
        </div>
        {ad.campaign && (
          <div className="ad-card-campaign" title={ad.campaign}>
            {ad.campaign}
          </div>
        )}
        <div className="ad-card-stats">
          <div>
            <span className="k">Investimento</span>
            {fmtBRL(ad.spend)}
          </div>
          <div>
            <span className="k">Compras</span>
            {fmtInt(ad.conversions)}
          </div>
          <div>
            <span className="k">ROAS</span>
            {fmtRoas(ad.roas)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TopAdsHighlight({ roas, conversions }: { roas?: TopAd; conversions?: TopAd }) {
  if (!roas && !conversions) return null;
  const sameAd = !!roas && !!conversions && roas.name === conversions.name && roas.campaign === conversions.campaign;

  if (sameAd && roas) {
    return (
      <div className="ad-highlight-grid">
        <AdCard label="Melhor ROAS e mais compras" ad={roas} />
      </div>
    );
  }

  return (
    <div className="ad-highlight-grid">
      {roas && <AdCard label="Melhor ROAS" ad={roas} />}
      {conversions && <AdCard label="Mais compras" ad={conversions} />}
    </div>
  );
}
