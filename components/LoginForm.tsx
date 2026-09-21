"use client";

import { useState, type FormEvent } from "react";

export default function LoginForm({ slug, clientName }: { slug: string; clientName: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Não foi possível entrar.");
        setLoading(false);
        return;
      }
      window.location.href = slug === "oleak" ? "/" : `/c/${slug}`;
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-title">{clientName} — Performance de mídia paga</div>
        <div className="login-sub">Digite a senha de acesso para ver o relatório.</div>
        <input
          type="password"
          className="login-input"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="btn primary login-button" disabled={loading || !password}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
