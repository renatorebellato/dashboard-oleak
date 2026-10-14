import Dashboard from "@/components/Dashboard";
import { getClientBySlug } from "@/lib/clients";

export const dynamic = "force-dynamic";

const VALID_PERIODS = new Set(["7d", "14d", "30d", "month", "ytd"]);

export default async function ClientPage({ params }: { params: Promise<{ slug: string }> }) {
  // Os dados em si vêm de /api/live e /api/reports, que resolvem o cliente
  // pelo cookie de sessão (já conferido pelo middleware). Aqui só lemos o
  // período padrão do cadastro (ex: Grupo Meddi abre em "Ano atual").
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  const defaultPeriod = client?.default_period && VALID_PERIODS.has(client.default_period) ? client.default_period : "7d";
  return <Dashboard defaultPeriod={defaultPeriod} />;
}
