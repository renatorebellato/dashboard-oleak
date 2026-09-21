"use client";

import { useState } from "react";
import type { ReportData } from "@/lib/types";

export default function ImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleImport() {
    setError(null);
    let parsed: ReportData;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("JSON inválido — confira se colou o conteúdo completo.");
      return;
    }
    if (!parsed.period?.start || !parsed.period?.end || !parsed.previous_period?.start) {
      setError("JSON não tem o formato esperado (faltam period / previous_period).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(`Erro ao salvar: ${json?.error ?? res.statusText}`);
        setSaving(false);
        return;
      }
    } catch (e: any) {
      setError(`Erro ao salvar: ${String(e?.message ?? e)}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    onImported();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Importar relatório da semana</h3>
        <p className="hint">
          Cole aqui o JSON do relatório (gerado a partir do Google Ads + Meta Ads). Se já
          existir um relatório com o mesmo período, ele é substituído.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "period": { "start": "2026-09-14", "end": "2026-09-20" }, ... }'
        />
        {error && <div className="error-msg">{error}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={handleImport} disabled={saving || !text.trim()}>
            {saving ? "Importando…" : "Importar dados"}
          </button>
        </div>
      </div>
    </div>
  );
}
