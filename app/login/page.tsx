import LoginForm from "@/components/LoginForm";
import { getClientBySlug } from "@/lib/clients";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const client = await getClientBySlug("oleak");
  return <LoginForm slug="oleak" clientName={client?.name ?? "Oleak"} />;
}
