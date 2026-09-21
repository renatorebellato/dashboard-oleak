import Dashboard from "@/components/Dashboard";

export default function ClientPage() {
  // O componente busca os dados via /api/live e /api/reports, que resolvem
  // o cliente pelo cookie de sessão (já conferido pelo middleware) — não
  // precisa do slug aqui.
  return <Dashboard />;
}
