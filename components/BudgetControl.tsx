"use client";

// Controle de orçamento diário: mostra o investimento médio por dia (Meta +
// Google, combinado e por plataforma) no período selecionado e, opcionalmente,
// compara com uma meta mensal que o usuário define no navegador (guardada em
// localStorage — por enquanto é uma conveniência local, não compartilhada
// entre dispositivos/usuários).

import { useEffect, useState } from "react";
import { fmtBRL, fmtPct } from "@/lib/format";

const STORAGE_KEY = "oleak_monthly_budget";

export function useMonthlyBudget(): [number | null, (v: number | null) => void] {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setValue(Number(raw));
    } catch {
      // localStorage indisponível (modo privado etc) — segue sem meta salva.
    }
  }, []);

  const update = (v: number | null) => {
    setValue(v);
    try {
      if (v == null || Number.isNaN(v)) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, String(v));
      }
    } catch {
      // idem
    }
  };

  return [value, update];
}

export default function BudgetControl({
  metaSpend,
  googleSpend,
  days,
  monthlyBudget,
  onChangeBudget,
}: {
  metaSpend: number;
  googleSpend: number;
  days: number;
  monthlyBudget: number | null;
  onChangeBudget: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(monthlyBudget != null ? String(monthlyBudget) : "");

  const totalSpend = metaSpend + googleSpend;
  const avgDaily = days > 0 ? totalSpend / days : 0;
  const avgDailyMeta = days > 0 ? metaSpend / days : 0;
  const avgDailyGoogle = days > 0 ? googleSpend / days : 0;

  const dailyTarget = monthlyBudget != null ? monthlyBudget / 30 : null;
  const usagePct = dailyTarget && dailyTarget > 0 ? (avgDaily / dailyTarget) * 100 : null;

  function startEdit() {
    setDraft(monthlyBudget != null ? String(monthlyBudget) : "");
    setEditing(true);
  }

  function save() {
    const n = Number(draft.replace(",", "."));
    onChangeBudget(draft.trim() === "" || Number.isNaN(n) || n <= 0 ? null : n);
    setEditing(false);
  }

  return (
    <div className="budget-card">
      <div className="budget-main">
        <div className="budget-label">Investimento médio diário</div>
        <div className="budget-value">{fmtBRL(avgDaily)}</div>
        <div className="budget-split">
          Meta {fmtBRL(avgDailyMeta)}/dia · Google {fmtBRL(avgDailyGoogle)}/dia
        </div>
      </div>
      <div className="budget-target">
        {editing ? (
          <div className="budget-edit">
            <input
              type="number"
              inputMode="decimal"
              placeholder="Meta mensal (R$)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
            />
            <button type="button" className="btn" onClick={save}>
              Salvar
            </button>
          </div>
        ) : monthlyBudget != null ? (
          <button type="button" className="budget-target-set" onClick={startEdit}>
            <span className="budget-target-label">Meta mensal: {fmtBRL(monthlyBudget)}</span>
            {usagePct != null && (
              <>
                <div className="budget-bar">
                  <span
                    className={`budget-bar-fill ${usagePct > 100 ? "over" : ""}`}
                    style={{ width: `${Math.min(usagePct, 100)}%` }}
                  />
                </div>
                <span className={`budget-pct ${usagePct > 100 ? "over" : ""}`}>
                  {fmtPct(usagePct, 0)} do ritmo diário ideal ({fmtBRL(dailyTarget)}/dia)
                </span>
              </>
            )}
          </button>
        ) : (
          <button type="button" className="btn" onClick={startEdit}>
            Definir meta mensal
          </button>
        )}
      </div>
    </div>
  );
}
