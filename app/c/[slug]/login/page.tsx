import LoginForm from "@/components/LoginForm";
import { getClientBySlug } from "@/lib/clients";

export const dynamic = "force-dynamic";

export default async function ClientLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);

  if (!client || !client.active) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-title">Cliente não encontrado</div>
          <div className="login-sub">Verifique o link de acesso com a Elo Criativo.</div>
        </div>
      </div>
    );
  }

  return <LoginForm slug={slug} clientName={client.name} />;
}
